const express = require('express');
const multer = require('multer');
const path = require('path');

const router = express.Router();

// Configuration de multer pour le stockage local
const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, 'uploads/');
  },
  filename(req, file, cb) {
    cb(null, `${file.fieldname}-${Date.now()}${path.extname(file.originalname)}`);
  },
});

const checkFileType = (file, cb) => {
  const filetypes = /jpg|jpeg|png|webp/;
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = filetypes.test(file.mimetype);

  if (extname && mimetype) {
    return cb(null, true);
  } else {
    cb('Images seulement ! (jpg, jpeg, png, webp)');
  }
};

const upload = multer({
  storage,
  fileFilter: function (req, file, cb) {
    checkFileType(file, cb);
  },
});

router.post('/', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'Aucun fichier téléchargé.' });
  }
  
  // Retourner le chemin de l'image
  res.json({
    success: true,
    message: 'Image uploadée avec succès',
    url: `/uploads/${req.file.filename}`
  });
});

module.exports = router;
