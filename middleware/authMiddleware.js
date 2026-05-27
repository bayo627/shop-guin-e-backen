const jwt = require('jsonwebtoken');
const db = require('../config/db');

// Protéger les routes - Vérifier le JWT
exports.protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ success: false, message: 'Non autorisé, aucun jeton fourni.' });
  }

  try {
    // Vérifier le token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecuresecretkeyshopguineetoken');

    // Récupérer l'utilisateur depuis la base de données
    const [users] = await db.query(
      'SELECT * FROM users WHERE id = ?',
      [decoded.id]
    );

    if (users.length === 0) {
      return res.status(401).json({ success: false, message: 'Utilisateur non trouvé.' });
    }

    req.user = users[0];
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Non autorisé, jeton invalide ou expiré.' });
  }
};

// Limiter l'accès à certains rôles (ex: 'seller', 'admin')
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Rôle '${req.user ? req.user.role : 'inconnu'}' non autorisé à accéder à cette ressource.`
      });
    }
    next();
  };
};
