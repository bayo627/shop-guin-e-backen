const db = require('../config/db');

/* ────────────────────────────────────────────────────────────
   POST /api/reviews  — Publier un avis
   ──────────────────────────────────────────────────────────── */
exports.createReview = async (req, res) => {
  const { product_id, rating, title, comment, order_id } = req.body;
  if (!product_id || !rating)
    return res.status(400).json({ success: false, message: 'Produit et note (1-5) obligatoires.' });

  const r = parseInt(rating);
  if (r < 1 || r > 5)
    return res.status(400).json({ success: false, message: 'La note doit être entre 1 et 5.' });

  try {
    const [[product]] = await db.query('SELECT id, name, vendor_id FROM products WHERE id = ?', [product_id]);
    if (!product) return res.status(404).json({ success: false, message: 'Produit introuvable.' });

    // Upsert : créer ou mettre à jour l'avis existant
    await db.query(
      `INSERT INTO reviews (product_id, buyer_id, order_id, rating, title, comment, is_verified)
       VALUES (?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE rating=VALUES(rating), title=VALUES(title), comment=VALUES(comment)`,
      [product_id, req.user.id, order_id || null, r, title || null, comment || null, order_id ? 1 : 0]
    );

    // Recalculer avg_rating et total_reviews
    const [[stats]] = await db.query(
      'SELECT AVG(rating) AS avg, COUNT(*) AS cnt FROM reviews WHERE product_id = ? AND is_approved = 1',
      [product_id]
    );
    await db.query(
      'UPDATE products SET avg_rating = ?, total_reviews = ? WHERE id = ?',
      [parseFloat(stats.avg || 0).toFixed(2), stats.cnt, product_id]
    );

    // Notifier le vendeur
    const [[vendor]] = await db.query('SELECT user_id FROM vendors WHERE id = ?', [product.vendor_id]);
    if (vendor) {
      await db.query(
        `INSERT INTO notifications (user_id, type, title, message, data)
         VALUES (?, 'new_review', 'Nouvel avis sur votre produit', ?, ?)`,
        [vendor.user_id,
         `${req.user.name} a laissé un avis ${r}/5 sur "${product.name}".`,
         JSON.stringify({ product_id })]
      );
    }

    return res.status(201).json({ success: true, message: 'Votre avis a été publié !' });
  } catch (err) {
    console.error('createReview:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ────────────────────────────────────────────────────────────
   GET /api/reviews/product/:productId  — Avis d'un produit
   ──────────────────────────────────────────────────────────── */
exports.getProductReviews = async (req, res) => {
  try {
    const [reviews] = await db.query(
      `SELECT r.*, u.name AS buyer_name, u.avatar_url
       FROM reviews r
       LEFT JOIN users u ON r.buyer_id = u.id
       WHERE r.product_id = ? AND r.is_approved = 1
       ORDER BY r.created_at DESC`,
      [req.params.productId]
    );
    return res.json({ success: true, reviews });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
