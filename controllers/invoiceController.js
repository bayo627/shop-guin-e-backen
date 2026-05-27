const db = require('../config/db');
const PDFDocument = require('pdfkit');

/* ────────────────────────────────────────────────────────────
   GET /api/orders/:id/invoice   — Générer la facture PDF
   ──────────────────────────────────────────────────────────── */
exports.generateInvoice = async (req, res) => {
  try {
    const [[order]] = await db.query(
      `SELECT o.*, u.name AS buyer_name, u.email AS buyer_email, u.phone AS buyer_phone, u.city AS buyer_city
       FROM orders o LEFT JOIN users u ON o.buyer_id = u.id WHERE o.id = ?`,
      [req.params.id]
    );
    if (!order) return res.status(404).json({ success: false, message: 'Commande introuvable.' });

    const [items] = await db.query(
      `SELECT oi.*, v.store_name
       FROM order_items oi
       LEFT JOIN vendors v ON oi.vendor_id = v.id
       WHERE oi.order_id = ?`,
      [order.id]
    );

    // Vérifier les droits : acheteur, vendeur concerné ou admin
    const isVendorOf = items.some(i => i.vendor_id === req.user.id);
    if (order.buyer_id !== req.user.id && !isVendorOf && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Accès non autorisé.' });
    }

    // Configurer la réponse HTTP pour télécharger un PDF
    const filename = `facture-${order.order_number}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Créer le document PDF
    const doc = new PDFDocument({ margin: 50 });
    doc.pipe(res);

    // En-tête de la facture
    doc.fontSize(20).font('Helvetica-Bold').text('Shop Guinée', { align: 'left' });
    doc.fontSize(10).font('Helvetica').text('La plus grande marketplace de Guinée', { align: 'left' });
    doc.moveDown();

    doc.fontSize(20).text('FACTURE', { align: 'right', underline: true });
    doc.fontSize(12).text(`N° Commande : ${order.order_number}`, { align: 'right' });
    const orderDate = new Date(order.created_at).toLocaleDateString('fr-FR');
    doc.text(`Date : ${orderDate}`, { align: 'right' });
    doc.moveDown();
    doc.moveDown();

    // Informations Acheteur / Livraison
    const yInfo = doc.y;
    doc.fontSize(12).font('Helvetica-Bold').text('Facturé à :', 50, yInfo);
    doc.font('Helvetica')
       .text(order.buyer_name || 'Client')
       .text(order.buyer_phone || '')
       .text(order.buyer_email || '');
       
    doc.fontSize(12).font('Helvetica-Bold').text('Livraison :', 300, yInfo);
    doc.font('Helvetica')
       .text(order.shipping_name || order.buyer_name)
       .text(order.shipping_phone || order.buyer_phone)
       .text(order.shipping_address)
       .text(order.shipping_city);
       
    doc.moveDown();
    doc.moveDown();
    doc.moveDown();

    // Tableau des articles
    const tableTop = doc.y;
    doc.font('Helvetica-Bold');
    
    doc.text('Produit', 50, tableTop);
    doc.text('Vendeur', 250, tableTop);
    doc.text('Qté', 380, tableTop);
    doc.text('Prix Unitaire', 420, tableTop);
    doc.text('Total', 500, tableTop);
    
    // Ligne de séparation
    doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();
    
    let y = tableTop + 25;
    doc.font('Helvetica');

    for (const item of items) {
      doc.text(item.product_name.substring(0, 30), 50, y);
      doc.text((item.store_name || 'N/A').substring(0, 20), 250, y);
      doc.text(item.quantity.toString(), 380, y);
      doc.text(`${parseFloat(item.unit_price).toLocaleString('fr-FR')} GNF`, 420, y);
      doc.text(`${parseFloat(item.total_price).toLocaleString('fr-FR')} GNF`, 500, y);
      
      y += 20;
    }
    
    doc.moveTo(50, y).lineTo(550, y).stroke();
    y += 10;
    
    // Total
    doc.font('Helvetica-Bold');
    doc.text('Total de la commande :', 350, y);
    doc.text(`${parseFloat(order.total_amount).toLocaleString('fr-FR')} GNF`, 480, y, { align: 'left' });

    doc.moveDown();
    doc.moveDown();
    doc.font('Helvetica');
    doc.text(`Méthode de paiement : ${order.payment_method}`, 50, doc.y);
    const paymentStatus = order.payment_status === 'completed' ? 'Payé' : 'En attente';
    doc.text(`Statut du paiement : ${paymentStatus}`, 50, doc.y);

    // Pied de page
    doc.fontSize(10).text('Merci pour votre confiance !', 50, 700, { align: 'center', width: 500 });
    
    // Terminer le document
    doc.end();
  } catch (err) {
    console.error('generateInvoice error:', err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Erreur lors de la génération de la facture.' });
    }
  }
};
