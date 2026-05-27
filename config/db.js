const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'shop_guinee',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4'
};

function convertMysqlToSqlite(sql) {
  let cleaned = sql;
  
  // 1. Remove comments
  cleaned = cleaned.split('\n')
    .map(line => line.trim().startsWith('--') ? '' : line)
    .join('\n');
    
  // 2. Remove CREATE DATABASE and USE statements
  cleaned = cleaned.replace(/CREATE DATABASE IF NOT EXISTS[\s\S]*?;/gi, '');
  cleaned = cleaned.replace(/USE\s+[\s\S]*?;/gi, '');

  // Split statements by semicolon, avoiding splitting on semicolons inside strings
  const statements = [];
  let currentStatement = '';
  let inString = false;
  let stringChar = '';

  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    if ((char === "'" || char === '"') && cleaned[i - 1] !== '\\') {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (stringChar === char) {
        inString = false;
      }
    }
    if (char === ';' && !inString) {
      statements.push(currentStatement.trim());
      currentStatement = '';
    } else {
      currentStatement += char;
    }
  }
  if (currentStatement.trim()) {
    statements.push(currentStatement.trim());
  }

  const converted = statements.map(stmt => {
    let s = stmt;
    if (!s) return '';
    
    // If it's a CREATE TABLE statement
    if (s.toUpperCase().includes('CREATE TABLE')) {
      // Remove ENGINE=InnoDB, DEFAULT CHARSET, COLLATE, etc.
      s = s.replace(/ENGINE\s*=\s*\w+/gi, '');
      s = s.replace(/DEFAULT\s+CHARSET\s*=\s*\w+/gi, '');
      s = s.replace(/COLLATE\s*=\s*[\w_]+/gi, '');
      
      // Replace INT AUTO_INCREMENT PRIMARY KEY or variations
      s = s.replace(/INT\s+(?:AUTO_INCREMENT\s+PRIMARY\s+KEY|PRIMARY\s+KEY\s+AUTO_INCREMENT)/gi, 'INTEGER PRIMARY KEY AUTOINCREMENT');
      
      // Replace ENUM(...) with TEXT
      s = s.replace(/ENUM\s*\([^)]*\)/gi, 'TEXT');
      
      // Replace JSON with TEXT
      s = s.replace(/\bJSON\b/gi, 'TEXT');
      
      // Replace ON UPDATE CURRENT_TIMESTAMP
      s = s.replace(/ON UPDATE CURRENT_TIMESTAMP/gi, '');
      
      // Replace TINYINT(1) with INTEGER
      s = s.replace(/TINYINT\(\d+\)/gi, 'INTEGER');
      s = s.replace(/TINYINT/gi, 'INTEGER');
      
      // Convert UNIQUE KEY uq_name (col1, col2) to UNIQUE (col1, col2)
      s = s.replace(/UNIQUE KEY\s+[`'\w_-]+\s*\(([^)]+)\)/gi, 'UNIQUE ($1)');
      s = s.replace(/UNIQUE KEY\s*\(([^)]+)\)/gi, 'UNIQUE ($1)');
      
      // Clean up multiple spaces and trailing commas if any
      s = s.replace(/,\s*\)/gi, ')');
    }
    
    // Clean up trailing spaces or commas in statements
    s = s.trim();
    return s;
  }).filter(Boolean);

  return converted;
}

class SQLiteConnectionWrapper {
  constructor(db) {
    this.db = db;
  }

  async beginTransaction() {
    await this.query('BEGIN TRANSACTION');
  }

  async commit() {
    await this.query('COMMIT');
  }

  async rollback() {
    await this.query('ROLLBACK');
  }

  release() {
    // No-op for SQLite
  }

  async query(sql, params = []) {
    return new Promise((resolve, reject) => {
      let cleanSql = sql.trim();
      const isSelect = cleanSql.toUpperCase().startsWith('SELECT');

      // 1. Convert NOW() to datetime('now')
      let sqliteSql = sql.replace(/\bNOW\(\)/gi, "datetime('now')");

      // 2. Serialize objects/arrays to JSON strings
      const processedParams = (params || []).map(p => {
        if (p !== null && (typeof p === 'object' || Array.isArray(p))) {
          return JSON.stringify(p);
        }
        return p;
      });

      if (isSelect) {
        this.db.all(sqliteSql, processedParams, (err, rows) => {
          if (err) return reject(err);
          
          // Parse JSON strings in rows automatically
          const parsedRows = rows.map(row => {
            const newRow = { ...row };
            for (const key in newRow) {
              const val = newRow[key];
              if (typeof val === 'string' && (val.startsWith('{') || val.startsWith('['))) {
                try {
                  newRow[key] = JSON.parse(val);
                } catch (e) {
                  // Not valid JSON, keep as string
                }
              }
            }
            return newRow;
          });

          resolve([parsedRows, undefined]);
        });
      } else {
        this.db.run(sqliteSql, processedParams, function (err) {
          if (err) return reject(err);
          resolve([{ insertId: this.lastID, affectedRows: this.changes }, undefined]);
        });
      }
    });
  }
}

class SQLitePoolWrapper {
  constructor(db) {
    this.db = db;
    this.connectionWrapper = new SQLiteConnectionWrapper(db);
  }

  async getConnection() {
    return this.connectionWrapper;
  }

  async query(sql, params) {
    return this.connectionWrapper.query(sql, params);
  }

  async execute(sql, params) {
    return this.connectionWrapper.query(sql, params);
  }
}

class LazyDbPool {
  constructor() {
    this.mysqlPool = null;
    this.sqliteDb = null;
    this.sqlitePool = null;
    this.initPromise = null;
  }

  async init() {
    if (this.initPromise) return this.initPromise;
    this.initPromise = this._doInit();
    return this.initPromise;
  }

  async _doInit() {
    // 1. Tentative avec MySQL
    try {
      console.log('🔄 Tentative de connexion à MySQL...');
      const pool = mysql.createPool(dbConfig);
      const conn = await pool.getConnection();
      conn.release();
      console.log('✅ Connecté avec succès à la base de données MySQL "shop_guinee"');
      this.mysqlPool = pool;
      return;
    } catch (mysqlErr) {
      console.log('⚠️ Impossible de se connecter à MySQL :', mysqlErr.message);
      console.log('🔄 Basculement vers la base de données SQLite locale...');
    }

    // 2. MySQL indisponible -> Boot de SQLite
    const sqlite3 = require('sqlite3').verbose();
    const path = require('path');
    const fs = require('fs');

    const dbDir = path.join(__dirname, '..', 'database');
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    const dbFile = path.join(dbDir, 'shop_guinee.sqlite');
    const isNewDb = !fs.existsSync(dbFile) || fs.statSync(dbFile).size === 0;

    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(dbFile, async (err) => {
        if (err) {
          console.error('❌ Impossible de créer/ouvrir la base SQLite :', err.message);
          return reject(err);
        }
        
        this.sqliteDb = db;
        this.sqlitePool = new SQLitePoolWrapper(db);
        
        // Activer les clés étrangères
        db.run('PRAGMA foreign_keys = ON;', async (pragmaErr) => {
          if (pragmaErr) {
            console.error('❌ Impossible d\'activer les clés étrangères :', pragmaErr.message);
          }
          
          if (isNewDb) {
            console.log('📂 Nouvelle base SQLite détectée. Initialisation via schema.sql...');
            try {
              const schemaPath = path.join(dbDir, 'schema.sql');
              if (fs.existsSync(schemaPath)) {
                const schemaSql = fs.readFileSync(schemaPath, 'utf8');
                const statements = convertMysqlToSqlite(schemaSql);
                
                for (const stmt of statements) {
                  if (!stmt.trim()) continue;
                  await new Promise((res, rej) => {
                    db.run(stmt, (runErr) => {
                      if (runErr) {
                        if (runErr.message.includes('already exists')) {
                          res();
                        } else {
                          console.error('SQL Error in statement:', stmt);
                          console.error('Error details:', runErr.message);
                          rej(runErr);
                        }
                      } else {
                        res();
                      }
                    });
                  });
                }
                console.log('✅ Base de données SQLite initialisée avec succès avec les tables et les données de démo !');
              } else {
                console.warn('⚠️ Fichier schema.sql introuvable. Base vide créée.');
              }
            } catch (initErr) {
              console.error('❌ Erreur lors de l\'initialisation de la base SQLite :', initErr.message);
              return reject(initErr);
            }
          } else {
            console.log('✅ Base de données SQLite locale connectée.');
          }
          resolve();
        });
      });
    });
  }

  async query(sql, params) {
    await this.init();
    if (this.mysqlPool) {
      return this.mysqlPool.query(sql, params);
    } else {
      return this.sqlitePool.query(sql, params);
    }
  }

  async execute(sql, params) {
    await this.init();
    if (this.mysqlPool) {
      return this.mysqlPool.execute(sql, params);
    } else {
      return this.sqlitePool.execute(sql, params);
    }
  }

  async getConnection() {
    await this.init();
    if (this.mysqlPool) {
      return this.mysqlPool.getConnection();
    } else {
      return this.sqlitePool.getConnection();
    }
  }
}

const pool = new LazyDbPool();
module.exports = pool;
