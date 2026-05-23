const db = require('../config/db');

/* ────────────────────────────────────────────────────────────
   POST /api/payments   — Soumettre un paiement Mobile Money
   ──────────────────────────────────────────────────────────── */
exports.submitPayment = async (req, res) => {
  const { order_id, provider, transaction_id, sender_phone, notes } = req.body;

  if (!order_id || !provider || !transaction_id || !sender_phone)
    return res.status(400).json({
      success: false,
      message: 'order_id, provider, transaction_id et sender_phone sont obligatoires.'
    });

  try {
    // Vérifier que la commande appartient bien à cet acheteur
    const [[order]] = await db.query(
      'SELECT * FROM orders WHERE id = ? AND buyer_id = ?',
      [order_id, req.user.id]
    );
    if (!order)
      return res.status(404).json({ success: false, message: 'Commande introuvable.' });

    if (order.payment_status === 'completed')
      return res.status(400).json({ success: false, message: 'Cette commande est déjà payée.' });

    // Vérifier l'unicité du transaction_id pour ce fournisseur
    const [[existing]] = await db.query(
      'SELECT id FROM payments WHERE provider = ? AND transaction_id = ?',
      [provider, transaction_id]
    );
    if (existing)
      return res.status(409).json({
        success: false,
        message: "Cet ID de transaction a déjà été enregistré. Vérifiez et réessayez."
      });

    // Insérer le paiement en attente
    const [result] = await db.query(
      `INSERT INTO payments (order_id, user_id, amount, provider, transaction_id, sender_phone, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
      [order_id, req.user.id, order.total_amount, provider, transaction_id.trim(), sender_phone.trim(), notes || null]
    );

    // Passer la commande en statut "confirmée / paiement soumis"
    await db.query(
      "UPDATE orders SET payment_status = 'pending', status = 'confirmed' WHERE id = ?",
      [order_id]
    );

    // Notifier l'admin pour validation
    const [[admin]] = await db.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
    if (admin) {
      await db.query(
        `INSERT INTO notifications (user_id, type, title, message, data)
         VALUES (?, 'payment_received', 'Paiement à valider',
                 ?, ?)`,
        [admin.id,
         `Paiement ${provider} de ${order.total_amount.toLocaleString()} GNF pour commande #${order.order_number} à vérifier.`,
         JSON.stringify({ order_id, payment_id: result.insertId, transaction_id })]
      );
    }

    // Notifier l'acheteur
    await db.query(
      `INSERT INTO notifications (user_id, type, title, message, data)
       VALUES (?, 'order_paid', 'Paiement soumis avec succès', ?, ?)`,
      [req.user.id,
       `Votre paiement pour la commande #${order.order_number} a été soumis. En cours de validation par notre équipe.`,
       JSON.stringify({ order_id })]
    );

    return res.status(201).json({
      success: true,
      message: "Paiement soumis ! Notre équipe validera votre transaction sous 24h.",
      payment_id: result.insertId
    });
  } catch (err) {
    console.error('submitPayment:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ────────────────────────────────────────────────────────────
   PUT /api/payments/:id/verify  — Valider un paiement (Admin)
   ──────────────────────────────────────────────────────────── */
exports.verifyPayment = async (req, res) => {
  const { status } = req.body; // 'completed' ou 'failed'
  if (!['completed','failed'].includes(status))
    return res.status(400).json({ success: false, message: "Statut invalide. Utilisez 'completed' ou 'failed'." });

  try {
    const [[payment]] = await db.query('SELECT * FROM payments WHERE id = ?', [req.params.id]);
    if (!payment) return res.status(404).json({ success: false, message: 'Paiement introuvable.' });

    await db.query(
      'UPDATE payments SET status = ?, verified_by = ?, verified_at = NOW() WHERE id = ?',
      [status, req.user.id, req.params.id]
    );

    // Mettre à jour la commande
    const orderStatus  = status === 'completed' ? 'processing'      : 'pending';
    const paymentState = status === 'completed' ? 'completed'       : 'failed';
    await db.query(
      'UPDATE orders SET payment_status = ?, status = ? WHERE id = ?',
      [paymentState, orderStatus, payment.order_id]
    );

    // Notifier l'acheteur
    const [[order]] = await db.query('SELECT buyer_id, order_number FROM orders WHERE id = ?', [payment.order_id]);
    const title = status === 'completed' ? '✅ Paiement confirmé !' : '❌ Paiement refusé';
    const msg   = status === 'completed'
      ? `Votre paiement pour la commande #${order.order_number} a été validé. Votre commande est en cours de traitement.`
      : `Votre paiement pour la commande #${order.order_number} n'a pas pu être validé. Contactez le support.`;

    await db.query(
      `INSERT INTO notifications (user_id, type, title, message, data) VALUES (?, 'order_paid', ?, ?, ?)`,
      [order.buyer_id, title, msg, JSON.stringify({ order_id: payment.order_id })]
    );

    return res.json({ success: true, message: `Paiement ${status === 'completed' ? 'validé' : 'rejeté'} avec succès.` });
  } catch (err) {
    console.error('verifyPayment:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ────────────────────────────────────────────────────────────
   GET /api/payments   — Liste des paiements (Admin)
   ──────────────────────────────────────────────────────────── */
exports.getAllPayments = async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;
  const conditions = [];
  const params = [];

  if (status) { conditions.push('p.status = ?'); params.push(status); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  try {
    const [payments] = await db.query(
      `SELECT p.*, o.order_number, o.total_amount,
              u.name AS buyer_name, u.email AS buyer_email
       FROM payments p
       LEFT JOIN orders o ON p.order_id = o.id
       LEFT JOIN users u  ON p.user_id  = u.id
       ${where}
       ORDER BY p.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM payments p ${where}`, params
    );

    return res.json({ success: true, payments, total });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ────────────────────────────────────────────────────────────
   GET /api/payments/instructions/:method — Instructions paiement
   ──────────────────────────────────────────────────────────── */
exports.getPaymentInstructions = (req, res) => {
  const instructions = {
    orange_money: {
      title: 'Orange Money Guinée',
      steps: [
        "Composez le *144# sur votre téléphone Orange",
        "Sélectionnez 'Transfert d'argent'",
        "Entrez le numéro : +224 620 00 00 01 (Shop Guinée)",
        "Entrez le montant exact de votre commande",
        "Confirmez avec votre code secret Orange Money",
        "Notez le code de transaction reçu par SMS",
        "Collez ce code dans le champ ci-dessous"
      ],
      number: '+224 620 00 00 01',
      name:   'Shop Guinée SARL'
    },
    mtn_money: {
      title: 'MTN Mobile Money Guinée',
      steps: [
        "Composez le *555# sur votre téléphone MTN",
        "Sélectionnez 'MoMo Pay' ou 'Transfert'",
        "Entrez le numéro : +224 664 00 00 01 (Shop Guinée)",
        "Entrez le montant exact de votre commande",
        "Validez avec votre code PIN MTN MoMo",
        "Copiez l'ID de transaction reçu par SMS",
        "Collez cet ID dans le formulaire ci-dessous"
      ],
      number: '+224 664 00 00 01',
      name:   'Shop Guinée SARL'
    },
    bank_transfer: {
      title: 'Virement Bancaire',
      steps: [
        "Effectuez un virement depuis votre banque",
        "Banque : Ecobank Guinée",
        "Titulaire : SHOP GUINÉE SARL",
        "IBAN : GN64 0009 1234 5678 9012 34",
        "Référence : Votre numéro de commande (ex: SG12345678)",
        "Envoyez la preuve de virement par WhatsApp : +224 620 00 00 01",
        "Entrez votre numéro de référence bancaire ci-dessous"
      ],
      bank:    'Ecobank Guinée',
      account: 'GN64 0009 1234 5678 9012 34',
      name:    'SHOP GUINÉE SARL'
    }
  };

  const method = req.params.method;
  if (!instructions[method])
    return res.status(400).json({ success: false, message: 'Méthode de paiement inconnue.' });

  return res.json({ success: true, instructions: instructions[method] });
};
