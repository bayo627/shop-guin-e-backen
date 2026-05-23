const db = require('../config/db');

/* ────────────────────────────────────────────────────────────
   POST /api/messages   — Envoyer un message
   ──────────────────────────────────────────────────────────── */
exports.sendMessage = async (req, res) => {
  const { receiver_id, content, product_id } = req.body;
  if (!receiver_id || !content?.trim())
    return res.status(400).json({ success: false, message: 'Destinataire et contenu requis.' });

  try {
    const [[receiver]] = await db.query('SELECT id, name FROM users WHERE id = ?', [receiver_id]);
    if (!receiver) return res.status(404).json({ success: false, message: 'Destinataire introuvable.' });

    const [result] = await db.query(
      'INSERT INTO messages (sender_id, receiver_id, content, product_id) VALUES (?,?,?,?)',
      [req.user.id, receiver_id, content.trim(), product_id || null]
    );

    await db.query(
      `INSERT INTO notifications (user_id, type, title, message, data)
       VALUES (?, 'new_message', ?, ?, ?)`,
      [receiver_id,
       `Nouveau message de ${req.user.name}`,
       content.trim().slice(0, 100),
       JSON.stringify({ sender_id: req.user.id, message_id: result.insertId })]
    );

    const [[msg]] = await db.query('SELECT * FROM messages WHERE id = ?', [result.insertId]);
    return res.status(201).json({ success: true, message: msg });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ────────────────────────────────────────────────────────────
   GET /api/messages/inbox   — Boîte de réception
   ──────────────────────────────────────────────────────────── */
exports.getInbox = async (req, res) => {
  const uid = req.user.id;
  try {
    const [conversations] = await db.query(
      `SELECT
         other.id AS user_id, other.name, other.avatar_url, other.role, other.store_name,
         m.content AS last_message, m.created_at AS last_time, m.is_read,
         (SELECT COUNT(*) FROM messages
          WHERE sender_id = other.id AND receiver_id = ? AND is_read = 0) AS unread_count
       FROM users other
       INNER JOIN (
         SELECT
           IF(sender_id = ?, receiver_id, sender_id) AS partner_id,
           MAX(id) AS last_id
         FROM messages WHERE sender_id = ? OR receiver_id = ?
         GROUP BY partner_id
       ) conv ON other.id = conv.partner_id
       INNER JOIN messages m ON m.id = conv.last_id
       LEFT JOIN vendors v ON other.id = v.user_id
       ORDER BY last_time DESC`,
      [uid, uid, uid, uid]
    );
    return res.json({ success: true, conversations });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ────────────────────────────────────────────────────────────
   GET /api/messages/conversation/:userId   — Historique
   ──────────────────────────────────────────────────────────── */
exports.getConversation = async (req, res) => {
  const myId    = req.user.id;
  const otherId = parseInt(req.params.userId);
  try {
    const [messages] = await db.query(
      `SELECT m.*, p.name AS product_name, p.main_image AS product_image, p.slug AS product_slug
       FROM messages m
       LEFT JOIN products p ON m.product_id = p.id
       WHERE (m.sender_id = ? AND m.receiver_id = ?)
          OR (m.sender_id = ? AND m.receiver_id = ?)
       ORDER BY m.created_at ASC`,
      [myId, otherId, otherId, myId]
    );
    await db.query(
      'UPDATE messages SET is_read = 1 WHERE sender_id = ? AND receiver_id = ?',
      [otherId, myId]
    );
    return res.json({ success: true, messages });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
