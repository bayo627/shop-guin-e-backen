const db = require('../config/db');

/* ── Helper : générer un slug unique ─────────────────────── */
const toSlug = (str) =>
  str.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');

/* ────────────────────────────────────────────────────────────
   GET /api/products   (Public — recherche, filtres, pagination)
   ──────────────────────────────────────────────────────────── */
exports.getAllProducts = async (req, res) => {
  const {
    keyword, category, minPrice, maxPrice,
    type, vendorId, featured,
    sortBy = 'created_at', order = 'DESC',
    limit = 20, page = 1
  } = req.query;

  const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
  const conditions = ['p.is_active = 1'];
  const params = [];

  if (keyword) {
    conditions.push('(p.name LIKE ? OR p.description LIKE ? OR p.short_desc LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  if (category) {
    if (isNaN(category)) { conditions.push('c.slug = ?'); params.push(category); }
    else                 { conditions.push('p.category_id = ?'); params.push(+category); }
  }
  if (minPrice) { conditions.push('p.price >= ?'); params.push(+minPrice); }
  if (maxPrice) { conditions.push('p.price <= ?'); params.push(+maxPrice); }
  if (type)     { conditions.push('p.type = ?');   params.push(type); }
  if (vendorId) { conditions.push('p.vendor_id = ?'); params.push(+vendorId); }
  if (featured === '1') { conditions.push('p.is_featured = 1'); }

  const where = conditions.join(' AND ');
  const allowedSort = { price: 'p.price', rating: 'p.avg_rating', sales: 'p.total_sold', created_at: 'p.created_at', name: 'p.name' };
  const sortCol = allowedSort[sortBy] || 'p.created_at';
  const sortDir = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  try {
    const [products] = await db.query(
      `SELECT p.id, p.name, p.slug, p.price, p.promo_price, p.stock, p.type,
              p.main_image, p.avg_rating, p.total_reviews, p.total_sold, p.is_featured,
              p.created_at,
              c.name AS category_name, c.slug AS category_slug,
              v.store_name, v.store_slug, u.name AS seller_name
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       LEFT JOIN vendors v    ON p.vendor_id   = v.id
       LEFT JOIN users u      ON v.user_id     = u.id
       WHERE ${where}
       ORDER BY ${sortCol} ${sortDir}
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    const [[{ total }]] = await db.query(
      `SELECT COUNT(DISTINCT p.id) AS total
       FROM products p LEFT JOIN categories c ON p.category_id = c.id
       WHERE ${where}`,
      params
    );

    return res.json({
      success: true,
      products,
      pagination: {
        total, page: +page, limit: +limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error('getAllProducts:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ────────────────────────────────────────────────────────────
   GET /api/products/:id  (Public)
   ──────────────────────────────────────────────────────────── */
exports.getProductById = async (req, res) => {
  try {
    const col = isNaN(req.params.id) ? 'p.slug' : 'p.id';
    const [[product]] = await db.query(
      `SELECT p.*,
              c.name AS category_name, c.slug AS category_slug,
              v.id AS vendor_id, v.store_name, v.store_slug, v.store_description,
              v.store_logo_url, v.rating AS vendor_rating,
              u.name AS seller_name, u.phone AS seller_phone
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       LEFT JOIN vendors v    ON p.vendor_id   = v.id
       LEFT JOIN users u      ON v.user_id     = u.id
       WHERE ${col} = ? AND p.is_active = 1`,
      [req.params.id]
    );

    if (!product)
      return res.status(404).json({ success: false, message: 'Produit introuvable.' });

    const [reviews] = await db.query(
      `SELECT r.*, u.name AS buyer_name, u.avatar_url AS buyer_avatar
       FROM reviews r LEFT JOIN users u ON r.buyer_id = u.id
       WHERE r.product_id = ? AND r.is_approved = 1
       ORDER BY r.created_at DESC LIMIT 10`,
      [product.id]
    );

    product.reviews = reviews;
    return res.json({ success: true, product });
  } catch (err) {
    console.error('getProductById:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ────────────────────────────────────────────────────────────
   POST /api/products  (Vendeur)
   ──────────────────────────────────────────────────────────── */
exports.createProduct = async (req, res) => {
  const {
    category_id, name, description, short_desc,
    price, promo_price, stock, type = 'physical',
    file_url, main_image, images, weight, sku
  } = req.body;

  if (!category_id || !name || !description || !price)
    return res.status(400).json({ success: false, message: 'Catégorie, nom, description et prix sont obligatoires.' });

  try {
    const [[vendor]] = await db.query('SELECT id FROM vendors WHERE user_id = ?', [req.user.id]);
    if (!vendor)
      return res.status(403).json({ success: false, message: 'Vous devez avoir une boutique pour ajouter un produit.' });

    let slug = toSlug(name);
    const [[slugCheck]] = await db.query('SELECT id FROM products WHERE slug = ?', [slug]);
    if (slugCheck) slug += '-' + Date.now();

    const [result] = await db.query(
      `INSERT INTO products
         (vendor_id, category_id, name, slug, description, short_desc,
          price, promo_price, stock, type, file_url, main_image, images, weight, sku)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [vendor.id, category_id, name.trim(), slug, description, short_desc || null,
       price, promo_price || null, stock || 0, type,
       file_url || null, main_image || null,
       images ? JSON.stringify(images) : null,
       weight || null, sku || null]
    );

    const [[newProduct]] = await db.query('SELECT * FROM products WHERE id = ?', [result.insertId]);
    return res.status(201).json({ success: true, message: 'Produit créé avec succès.', product: newProduct });
  } catch (err) {
    console.error('createProduct:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ────────────────────────────────────────────────────────────
   PUT /api/products/:id  (Vendeur)
   ──────────────────────────────────────────────────────────── */
exports.updateProduct = async (req, res) => {
  const { id } = req.params;
  const fields = req.body;

  try {
    const [[product]] = await db.query(
      `SELECT p.*, v.user_id FROM products p JOIN vendors v ON p.vendor_id = v.id WHERE p.id = ?`, [id]
    );
    if (!product) return res.status(404).json({ success: false, message: 'Produit introuvable.' });
    if (product.user_id !== req.user.id && req.user.role !== 'admin')
      return res.status(403).json({ success: false, message: 'Non autorisé.' });

    const allowed = ['category_id','name','description','short_desc','price','promo_price',
                     'stock','type','file_url','main_image','images','weight','sku','is_featured','is_active'];
    const updates = [];
    const values  = [];

    allowed.forEach(key => {
      if (fields[key] !== undefined) {
        updates.push(`${key} = ?`);
        values.push(key === 'images' ? JSON.stringify(fields[key]) : fields[key]);
      }
    });

    if (!updates.length)
      return res.status(400).json({ success: false, message: 'Aucun champ à mettre à jour.' });

    values.push(id);
    await db.query(`UPDATE products SET ${updates.join(', ')} WHERE id = ?`, values);

    const [[updated]] = await db.query('SELECT * FROM products WHERE id = ?', [id]);
    return res.json({ success: true, message: 'Produit mis à jour.', product: updated });
  } catch (err) {
    console.error('updateProduct:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ────────────────────────────────────────────────────────────
   DELETE /api/products/:id  (Vendeur)
   ──────────────────────────────────────────────────────────── */
exports.deleteProduct = async (req, res) => {
  try {
    const [[product]] = await db.query(
      'SELECT p.*, v.user_id FROM products p JOIN vendors v ON p.vendor_id=v.id WHERE p.id=?',
      [req.params.id]
    );
    if (!product) return res.status(404).json({ success: false, message: 'Produit introuvable.' });
    if (product.user_id !== req.user.id && req.user.role !== 'admin')
      return res.status(403).json({ success: false, message: 'Non autorisé.' });

    await db.query('DELETE FROM products WHERE id = ?', [req.params.id]);
    return res.json({ success: true, message: 'Produit supprimé avec succès.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ────────────────────────────────────────────────────────────
   GET /api/categories  (Public)
   ──────────────────────────────────────────────────────────── */
exports.getCategories = async (req, res) => {
  try {
    const [categories] = await db.query(
      `SELECT c.*, COUNT(p.id) AS product_count
       FROM categories c
       LEFT JOIN products p ON p.category_id = c.id AND p.is_active = 1
       WHERE c.is_active = 1
       GROUP BY c.id ORDER BY c.sort_order ASC`
    );
    return res.json({ success: true, categories });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ────────────────────────────────────────────────────────────
   GET /api/products/vendor/my-products  (Vendeur)
   ──────────────────────────────────────────────────────────── */
exports.getMyProducts = async (req, res) => {
  try {
    const [[vendor]] = await db.query('SELECT id FROM vendors WHERE user_id = ?', [req.user.id]);
    if (!vendor) return res.json({ success: true, products: [] });

    const [products] = await db.query(
      `SELECT p.*, c.name AS category_name FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.vendor_id = ? ORDER BY p.created_at DESC`,
      [vendor.id]
    );
    return res.json({ success: true, products });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
