const db = require('../config/db');

/* ── Générer un numéro de commande unique ─────────────────── */
const genOrderNumber = () =>
  'SG' + Date.now().toString().slice(-8) + Math.random().toString(36).slice(2,5).toUpperCase();

/* ────────────────────────────────────────────────────────────
   POST /api/orders   — Créer une commande
   ──────────────────────────────────────────────────────────── */
exports.createOrder = async (req, res) => {
  const { items, shipping_name, shipping_phone, shipping_address,
          shipping_city, payment_method, notes } = req.body;
  const buyerId = req.user.id;

  if (!items || !items.length)
    return res.status(400).json({ success: false, message: 'Le panier est vide.' });
  if (!payment_method || !shipping_address)
    return res.status(400).json({ success: false, message: 'Adresse de livraison et mode de paiement requis.' });

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    let totalAmount = 0;
    const enrichedItems = [];

    for (const item of items) {
      const [[p]] = await conn.query(
        'SELECT id, name, price, promo_price, stock, type, main_image, vendor_id FROM products WHERE id = ? AND is_active = 1',
        [item.product_id]
      );
      if (!p) throw new Error(`Produit ID ${item.product_id} introuvable.`);
      if (p.type === 'physical' && p.stock < item.quantity)
        throw new Error(`Stock insuffisant pour "${p.name}". Disponible : ${p.stock}`);

      const unitPrice = parseFloat(p.promo_price || p.price);
      totalAmount += unitPrice * item.quantity;
      enrichedItems.push({ ...p, quantity: item.quantity, unitPrice });
    }

    const orderNumber = genOrderNumber();
    const [orderResult] = await conn.query(
      `INSERT INTO orders
         (order_number, buyer_id, total_amount, status, shipping_name, shipping_phone,
          shipping_address, shipping_city, payment_method, payment_status, notes)
       VALUES (?,?,?,'pending',?,?,?,?,'${payment_method}','pending',?)`,
      [orderNumber, buyerId, totalAmount, shipping_name || req.user.name,
       shipping_phone || req.user.phone, shipping_address, shipping_city || 'Conakry', notes || null]
    );
    const orderId = orderResult.insertId;

    for (const item of enrichedItems) {
      await conn.query(
        `INSERT INTO order_items
           (order_id, product_id, vendor_id, product_name, product_image, quantity, unit_price, total_price)
         VALUES (?,?,?,?,?,?,?,?)`,
        [orderId, item.id, item.vendor_id, item.name, item.main_image,
         item.quantity, item.unitPrice, item.unitPrice * item.quantity]
      );
      if (item.type === 'physical') {
        await conn.query('UPDATE products SET stock = stock - ? WHERE id = ?', [item.quantity, item.id]);
      }
    }

    /* Notifier le vendeur */
    const vendorUserIds = [...new Set(enrichedItems.map(i => i.vendor_id))];
    for (const vid of vendorUserIds) {
      const [[v]] = await conn.query('SELECT user_id FROM vendors WHERE id = ?', [vid]);
      if (v) {
        await conn.query(
          `INSERT INTO notifications (user_id, type, title, message, data)
           VALUES (?, 'order_placed', 'Nouvelle commande reçue !',
                   'Vous avez reçu une nouvelle commande. Vérifiez votre tableau de bord.', ?)`,
          [v.user_id, JSON.stringify({ order_id: orderId, order_number: orderNumber })]
        );
      }
    }

    await conn.commit();
    return res.status(201).json({
      success: true,
      message: 'Commande créée avec succès !',
      order: { id: orderId, order_number: orderNumber, total_amount: totalAmount }
    });
  } catch (err) {
    await conn.rollback();
    console.error('createOrder:', err);
    return res.status(400).json({ success: false, message: err.message });
  } finally {
    conn.release();
  }
};

/* ────────────────────────────────────────────────────────────
   GET /api/orders/my-orders   — Commandes de l'acheteur
   ──────────────────────────────────────────────────────────── */
exports.getMyOrders = async (req, res) => {
  try {
    const [orders] = await db.query(
      `SELECT o.*, COUNT(oi.id) AS items_count
       FROM orders o
       LEFT JOIN order_items oi ON o.id = oi.order_id
       WHERE o.buyer_id = ?
       GROUP BY o.id ORDER BY o.created_at DESC`,
      [req.user.id]
    );
    return res.json({ success: true, orders });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ────────────────────────────────────────────────────────────
   GET /api/orders/seller-orders   — Commandes du vendeur
   ──────────────────────────────────────────────────────────── */
exports.getSellerOrders = async (req, res) => {
  try {
    const [[vendor]] = await db.query('SELECT id FROM vendors WHERE user_id = ?', [req.user.id]);
    if (!vendor) return res.json({ success: true, orders: [] });

    const [orders] = await db.query(
      `SELECT DISTINCT o.*, u.name AS buyer_name, u.phone AS buyer_phone
       FROM orders o
       INNER JOIN order_items oi ON o.id = oi.order_id AND oi.vendor_id = ?
       LEFT JOIN users u ON o.buyer_id = u.id
       ORDER BY o.created_at DESC`,
      [vendor.id]
    );

    for (const order of orders) {
      const [items] = await db.query(
        `SELECT oi.*, p.type AS product_type, p.file_url
         FROM order_items oi
         LEFT JOIN products p ON oi.product_id = p.id
         WHERE oi.order_id = ? AND oi.vendor_id = ?`,
        [order.id, vendor.id]
      );
      order.items = items;
    }

    return res.json({ success: true, orders });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ────────────────────────────────────────────────────────────
   GET /api/orders/:id   — Détail d'une commande
   ──────────────────────────────────────────────────────────── */
exports.getOrderById = async (req, res) => {
  try {
    const [[order]] = await db.query(
      `SELECT o.*, u.name AS buyer_name, u.email AS buyer_email, u.phone AS buyer_phone
       FROM orders o LEFT JOIN users u ON o.buyer_id = u.id WHERE o.id = ?`,
      [req.params.id]
    );
    if (!order) return res.status(404).json({ success: false, message: 'Commande introuvable.' });

    const [items] = await db.query(
      `SELECT oi.*, v.store_name, p.type AS product_type, p.file_url
       FROM order_items oi
       LEFT JOIN vendors v ON oi.vendor_id = v.id
       LEFT JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = ?`,
      [order.id]
    );

    const [payments] = await db.query(
      'SELECT * FROM payments WHERE order_id = ? ORDER BY created_at DESC',
      [order.id]
    );

    // Vérifier les droits : acheteur, vendeur concerné ou admin
    const isVendorOf = items.some(i => i.vendor_id === req.user.id);
    if (order.buyer_id !== req.user.id && !isVendorOf && req.user.role !== 'admin')
      return res.status(403).json({ success: false, message: 'Accès non autorisé.' });

    order.items    = items;
    order.payments = payments;
    return res.json({ success: true, order });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ────────────────────────────────────────────────────────────
   PUT /api/orders/:id/status   — Mettre à jour le statut
   ──────────────────────────────────────────────────────────── */
exports.updateOrderStatus = async (req, res) => {
  const { status } = req.body;
  const allowed = ['confirmed','processing','shipped','delivered','cancelled'];
  if (!allowed.includes(status))
    return res.status(400).json({ success: false, message: 'Statut invalide.' });

  try {
    const [[order]] = await db.query('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    if (!order) return res.status(404).json({ success: false, message: 'Commande introuvable.' });

    await db.query('UPDATE orders SET status = ? WHERE id = ?', [status, req.params.id]);

    // Notifier l'acheteur
    const labels = { confirmed:'confirmée', processing:'en préparation', shipped:'expédiée', delivered:'livrée', cancelled:'annulée' };
    await db.query(
      `INSERT INTO notifications (user_id, type, title, message, data)
       VALUES (?, 'order_shipped', ?, ?, ?)`,
      [order.buyer_id,
       `Commande ${order.order_number} ${labels[status]}`,
       `Votre commande #${order.order_number} est maintenant ${labels[status]}.`,
       JSON.stringify({ order_id: order.id })]
    );

    return res.json({ success: true, message: `Statut mis à jour : ${status}` });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
