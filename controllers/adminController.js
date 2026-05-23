const db = require('../config/db');

/* ────────────────────────────────────────────────────────────
   GET /api/admin/stats  — KPIs globaux du site
   ──────────────────────────────────────────────────────────── */
exports.getDashboardStats = async (req, res) => {
  try {
    const [[users]]     = await db.query('SELECT COUNT(*) AS total, SUM(role="buyer") AS buyers, SUM(role="seller") AS sellers FROM users');
    const [[products]]  = await db.query('SELECT COUNT(*) AS total, SUM(is_active=1) AS active FROM products');
    const [[orders]]    = await db.query(`SELECT COUNT(*) AS total,
      SUM(status="delivered") AS delivered, SUM(status="pending") AS pending,
      COALESCE(SUM(total_amount),0) AS revenue FROM orders`);
    const [[payments]]  = await db.query(`SELECT COALESCE(SUM(amount),0) AS total_paid FROM payments WHERE status='completed'`);

    const [recentOrders] = await db.query(
      `SELECT o.*, u.name AS buyer_name FROM orders o
       LEFT JOIN users u ON o.buyer_id=u.id
       ORDER BY o.created_at DESC LIMIT 8`
    );
    const [pendingPayments] = await db.query(
      `SELECT p.*, o.order_number, u.name AS buyer_name
       FROM payments p
       LEFT JOIN orders o ON p.order_id=o.id
       LEFT JOIN users u ON p.user_id=u.id
       WHERE p.status='pending' ORDER BY p.created_at DESC LIMIT 10`
    );
    const [recentUsers] = await db.query(
      'SELECT id,name,email,role,city,created_at FROM users ORDER BY created_at DESC LIMIT 8'
    );

    return res.json({
      success: true,
      stats: { users, products, orders, total_paid: payments.total_paid },
      recentOrders, pendingPayments, recentUsers
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ────────────────────────────────────────────────────────────
   GET /api/admin/users  — Tous les utilisateurs
   ──────────────────────────────────────────────────────────── */
exports.getAllUsers = async (req, res) => {
  const { role, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;
  const conditions = [];
  const params = [];
  if (role) { conditions.push('role = ?'); params.push(role); }
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  try {
    const [users] = await db.query(
      `SELECT id,name,email,role,phone,city,is_active,created_at FROM users ${where}
       ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, +limit, +offset]
    );
    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM users ${where}`, params);
    return res.json({ success: true, users, total });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ────────────────────────────────────────────────────────────
   PUT /api/admin/users/:id  — Modifier un utilisateur
   ──────────────────────────────────────────────────────────── */
exports.updateUser = async (req, res) => {
  const { name, email, role, is_active } = req.body;
  try {
    await db.query(
      'UPDATE users SET name=?, email=?, role=?, is_active=? WHERE id=?',
      [name, email, role, is_active, req.params.id]
    );
    return res.json({ success: true, message: 'Utilisateur mis à jour.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ────────────────────────────────────────────────────────────
   DELETE /api/admin/users/:id  — Supprimer un utilisateur
   ──────────────────────────────────────────────────────────── */
exports.deleteUser = async (req, res) => {
  try {
    await db.query('DELETE FROM users WHERE id = ?', [req.params.id]);
    return res.json({ success: true, message: 'Utilisateur supprimé.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ────────────────────────────────────────────────────────────
   GET /api/admin/products  — Tous les produits (modération)
   ──────────────────────────────────────────────────────────── */
exports.getAllProducts = async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;
  try {
    const [products] = await db.query(
      `SELECT p.id, p.name, p.price, p.stock, p.type, p.is_active, p.is_featured,
              p.avg_rating, p.total_sold, p.created_at,
              c.name AS category_name, v.store_name, u.name AS seller_name
       FROM products p
       LEFT JOIN categories c ON p.category_id=c.id
       LEFT JOIN vendors v    ON p.vendor_id=v.id
       LEFT JOIN users u      ON v.user_id=u.id
       ORDER BY p.created_at DESC LIMIT ? OFFSET ?`,
      [+limit, +offset]
    );
    const [[{ total }]] = await db.query('SELECT COUNT(*) AS total FROM products');
    return res.json({ success: true, products, total });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ────────────────────────────────────────────────────────────
   PUT /api/admin/products/:id  — Activer / désactiver / mettre en vedette
   ──────────────────────────────────────────────────────────── */
exports.moderateProduct = async (req, res) => {
  const { is_active, is_featured } = req.body;
  try {
    const updates = [];
    const params  = [];
    if (is_active   !== undefined) { updates.push('is_active=?');   params.push(is_active); }
    if (is_featured !== undefined) { updates.push('is_featured=?'); params.push(is_featured); }
    if (!updates.length) return res.status(400).json({ success: false, message: 'Aucun champ fourni.' });

    params.push(req.params.id);
    await db.query(`UPDATE products SET ${updates.join(',')} WHERE id=?`, params);
    return res.json({ success: true, message: 'Produit modéré avec succès.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ────────────────────────────────────────────────────────────
   GET /api/admin/vendors  — Tous les vendeurs + stats
   ──────────────────────────────────────────────────────────── */
exports.getAllVendors = async (req, res) => {
  try {
    const [vendors] = await db.query(
      `SELECT v.*, u.name AS owner_name, u.email,
              COUNT(p.id) AS product_count
       FROM vendors v
       LEFT JOIN users u    ON v.user_id=u.id
       LEFT JOIN products p ON p.vendor_id=v.id
       GROUP BY v.id ORDER BY v.total_sales DESC`
    );
    return res.json({ success: true, vendors });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ────────────────────────────────────────────────────────────
   PUT /api/admin/vendors/:id/verify  — Vérifier un vendeur
   ──────────────────────────────────────────────────────────── */
exports.verifyVendor = async (req, res) => {
  try {
    await db.query('UPDATE vendors SET is_verified=1 WHERE id=?', [req.params.id]);
    const [[v]] = await db.query('SELECT user_id FROM vendors WHERE id=?', [req.params.id]);
    if (v) {
      await db.query(
        `INSERT INTO notifications (user_id, type, title, message) VALUES (?, 'account_verified',
         '✅ Boutique vérifiée !', 'Félicitations ! Votre boutique a été vérifiée par l''équipe Shop Guinée.')`,
        [v.user_id]
      );
    }
    return res.json({ success: true, message: 'Vendeur vérifié.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
