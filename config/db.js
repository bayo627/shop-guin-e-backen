const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'shop_guinee',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4'
});

// Tester la connexion au démarrage
pool.getConnection()
  .then(conn => {
    console.log('✅ Connecté avec succès à la base de données MySQL "shop_guinee"');
    conn.release();
  })
  .catch(err => {
    console.error('❌ Erreur de connexion à la base de données MySQL :', err.message);
    console.error('ℹ️ Assurez-vous que MySQL est démarré et que la base "shop_guinee" a été créée via schema.sql.');
  });

module.exports = pool;
