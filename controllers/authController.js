const bcrypt   = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const db        = require('../config/db');

const JWT_SECRET  = process.env.JWT_SECRET || 'shopguinee_secret_2024';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '30d';

/* ── Générer le JWT ─────────────────────────────────────────── */
const signToken = (id) =>
  jwt.sign({ id }, JWT_SECRET, { expiresIn: JWT_EXPIRES });

/* ── Formater l'utilisateur (retirer le mot de passe) ──────── */
const sanitizeUser = (user) => {
  const { password, reset_token, reset_token_expiry, ...safe } = user;
  return safe;
};

/* ────────────────────────────────────────────────────────────
   POST /api/auth/register
   ──────────────────────────────────────────────────────────── */
exports.register = async (req, res) => {
  const { name, email, password, role = 'buyer', phone, city,
          store_name, store_description } = req.body;

  if (!name || !email || !password)
    return res.status(400).json({ success: false, message: 'Nom, email et mot de passe sont obligatoires.' });

  if (password.length < 6)
    return res.status(400).json({ success: false, message: 'Le mot de passe doit contenir au moins 6 caractères.' });

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    /* Vérifier email unique */
    const [[existing]] = await conn.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing)
      return res.status(409).json({ success: false, message: 'Un compte avec cet email existe déjà.' });

    /* Hasher le mot de passe */
    const hashed = await bcrypt.hash(password, 12);

    /* Insérer l'utilisateur */
    const [result] = await conn.query(
      `INSERT INTO users (name, email, password, role, phone, city, email_verified)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [name.trim(), email.toLowerCase().trim(), hashed, role, phone || null, city || 'Conakry']
    );
    const userId = result.insertId;

    /* Créer automatiquement une boutique pour chaque utilisateur */
    let vendorData = null;
    const slug = (store_name || `${name}-boutique`)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') + '-' + userId;

    await conn.query(
      `INSERT INTO vendors (user_id, store_name, store_slug, store_description, store_city, store_phone, is_verified)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, store_name || `Boutique de ${name}`, slug,
       store_description || 'Bienvenue dans ma boutique Shop Guinée !',
       city || 'Conakry', phone || null,
       role === 'seller' ? 1 : 0]
    );
    const [[v]] = await conn.query('SELECT * FROM vendors WHERE user_id = ?', [userId]);
    vendorData = v;

    /* Notification de bienvenue */
    await conn.query(
      `INSERT INTO notifications (user_id, type, title, message)
       VALUES (?, 'account_verified', ?, ?)`,
      [userId, 'Bienvenue sur Shop Guinée !',
       `Bonjour ${name}, votre compte a été créé avec succès. Profitez de vos achats !`]
    );

    await conn.commit();

    const [[newUser]] = await conn.query('SELECT * FROM users WHERE id = ?', [userId]);

    return res.status(201).json({
      success: true,
      token:  signToken(userId),
      user:   sanitizeUser(newUser),
      vendor: vendorData
    });
  } catch (err) {
    await conn.rollback();
    console.error('register error:', err);
    return res.status(500).json({ success: false, message: 'Erreur lors de la création du compte.', error: err.message });
  } finally {
    conn.release();
  }
};

/* ────────────────────────────────────────────────────────────
   POST /api/auth/login
   ──────────────────────────────────────────────────────────── */
exports.login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password)
    return res.status(400).json({ success: false, message: 'Email et mot de passe requis.' });

  try {
    const [[user]] = await db.query('SELECT * FROM users WHERE email = ?', [email.toLowerCase().trim()]);

    if (!user || !(await bcrypt.compare(password, user.password)))
      return res.status(401).json({ success: false, message: 'Identifiants invalides. Vérifiez votre email et mot de passe.' });

    if (!user.is_active)
      return res.status(403).json({ success: false, message: 'Votre compte a été désactivé. Contactez le support.' });

    /* Récupérer la boutique (tous les utilisateurs en ont une) */
    let vendor = null;
    const [[v]] = await db.query('SELECT * FROM vendors WHERE user_id = ?', [user.id]);
    vendor = v || null;

    return res.status(200).json({
      success: true,
      token:  signToken(user.id),
      user:   sanitizeUser(user),
      vendor
    });
  } catch (err) {
    console.error('login error:', err);
    return res.status(500).json({ success: false, message: 'Erreur lors de la connexion.', error: err.message });
  }
};

/* ────────────────────────────────────────────────────────────
   GET /api/auth/me  (Privé)
   ──────────────────────────────────────────────────────────── */
exports.getMe = async (req, res) => {
  try {
    let vendor = null;
    const [[v]] = await db.query('SELECT * FROM vendors WHERE user_id = ?', [req.user.id]);
    vendor = v || null;

    // Compter les notifications non lues
    const [[{ unread }]] = await db.query(
      'SELECT COUNT(id) as unread FROM notifications WHERE user_id = ? AND is_read = 0',
      [req.user.id]
    );

    return res.status(200).json({
      success: true,
      user: sanitizeUser(req.user),
      vendor,
      unread_notifications: unread
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ────────────────────────────────────────────────────────────
   PUT /api/auth/profile  (Privé)
   ──────────────────────────────────────────────────────────── */
exports.updateProfile = async (req, res) => {
  const { name, phone, city, address, avatar_url,
          store_name, store_description, store_logo_url, store_banner_url } = req.body;
  const userId = req.user.id;

  try {
    await db.query(
      'UPDATE users SET name=?, phone=?, city=?, address=?, avatar_url=? WHERE id=?',
      [name || req.user.name, phone || req.user.phone,
       city || req.user.city, address || req.user.address,
       avatar_url || req.user.avatar_url, userId]
    );

    await db.query(
      `UPDATE vendors SET store_name=?, store_description=?, store_logo_url=?, store_banner_url=?
       WHERE user_id=?`,
      [store_name, store_description, store_logo_url, store_banner_url, userId]
    );

    const [[updatedUser]] = await db.query('SELECT * FROM users WHERE id=?', [userId]);
    let vendor = null;
    const [[v]] = await db.query('SELECT * FROM vendors WHERE user_id=?', [userId]);
    vendor = v;

    return res.status(200).json({
      success: true,
      message: 'Profil mis à jour avec succès.',
      user: sanitizeUser(updatedUser),
      vendor
    });
  } catch (err) {
    console.error('updateProfile error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ────────────────────────────────────────────────────────────
   PUT /api/auth/change-password  (Privé)
   ──────────────────────────────────────────────────────────── */
exports.changePassword = async (req, res) => {
  const { current_password, new_password } = req.body;

  if (!current_password || !new_password)
    return res.status(400).json({ success: false, message: 'Mot de passe actuel et nouveau mot de passe requis.' });

  if (new_password.length < 6)
    return res.status(400).json({ success: false, message: 'Le nouveau mot de passe doit contenir au moins 6 caractères.' });

  try {
    const [[user]] = await db.query('SELECT password FROM users WHERE id=?', [req.user.id]);

    if (!(await bcrypt.compare(current_password, user.password)))
      return res.status(400).json({ success: false, message: 'Mot de passe actuel incorrect.' });

    const hashed = await bcrypt.hash(new_password, 12);
    await db.query('UPDATE users SET password=? WHERE id=?', [hashed, req.user.id]);

    return res.status(200).json({ success: true, message: 'Mot de passe modifié avec succès.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ────────────────────────────────────────────────────────────
   GET /api/auth/notifications  (Privé)
   ──────────────────────────────────────────────────────────── */
exports.getNotifications = async (req, res) => {
  try {
    const [notifications] = await db.query(
      'SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 50',
      [req.user.id]
    );
    // Marquer toutes comme lues
    await db.query('UPDATE notifications SET is_read=1 WHERE user_id=?', [req.user.id]);

    return res.status(200).json({ success: true, notifications });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
