-- ============================================================
--  SHOP GUINÉE — Schéma complet de la base de données MySQL
--  Version 2.0 — Tables: users, vendors, products, categories,
--  orders, order_items, payments, reviews, messages, notifications
-- ============================================================

CREATE DATABASE IF NOT EXISTS `shop_guinee`
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `shop_guinee`;

-- ============================================================
-- TABLE 1 : UTILISATEURS (acheteurs, vendeurs, admins)
-- ============================================================
CREATE TABLE IF NOT EXISTS `users` (
  `id`                INT AUTO_INCREMENT PRIMARY KEY,
  `name`              VARCHAR(100) NOT NULL,
  `email`             VARCHAR(150) NOT NULL UNIQUE,
  `password`          VARCHAR(255) NOT NULL,
  `role`              ENUM('buyer','seller','admin') NOT NULL DEFAULT 'buyer',
  `phone`             VARCHAR(30)  DEFAULT NULL,
  `address`           TEXT         DEFAULT NULL,
  `city`              VARCHAR(100) DEFAULT NULL,
  `avatar_url`        VARCHAR(500) DEFAULT NULL,
  `is_active`         TINYINT(1)   NOT NULL DEFAULT 1,
  `email_verified`    TINYINT(1)   NOT NULL DEFAULT 0,
  `reset_token`       VARCHAR(255) DEFAULT NULL,
  `reset_token_expiry` DATETIME    DEFAULT NULL,
  `created_at`        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE 2 : BOUTIQUES VENDEURS (profil étendu vendeur)
-- ============================================================
CREATE TABLE IF NOT EXISTS `vendors` (
  `id`                  INT AUTO_INCREMENT PRIMARY KEY,
  `user_id`             INT          NOT NULL UNIQUE,
  `store_name`          VARCHAR(150) NOT NULL,
  `store_slug`          VARCHAR(150) NOT NULL UNIQUE,
  `store_description`   TEXT         DEFAULT NULL,
  `store_logo_url`      VARCHAR(500) DEFAULT NULL,
  `store_banner_url`    VARCHAR(500) DEFAULT NULL,
  `store_address`       TEXT         DEFAULT NULL,
  `store_city`          VARCHAR(100) DEFAULT NULL,
  `store_phone`         VARCHAR(30)  DEFAULT NULL,
  `store_email`         VARCHAR(150) DEFAULT NULL,
  `is_verified`         TINYINT(1)   NOT NULL DEFAULT 0,
  `is_active`           TINYINT(1)   NOT NULL DEFAULT 1,
  `total_sales`         DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `rating`              DECIMAL(3,2)  NOT NULL DEFAULT 0.00,
  `total_reviews`       INT          NOT NULL DEFAULT 0,
  `commission_rate`     DECIMAL(5,2) NOT NULL DEFAULT 5.00,
  `created_at`          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE 3 : CATÉGORIES DE PRODUITS
-- ============================================================
CREATE TABLE IF NOT EXISTS `categories` (
  `id`          INT AUTO_INCREMENT PRIMARY KEY,
  `name`        VARCHAR(100) NOT NULL,
  `slug`        VARCHAR(100) NOT NULL UNIQUE,
  `description` TEXT         DEFAULT NULL,
  `image_url`   VARCHAR(500) DEFAULT NULL,
  `parent_id`   INT          DEFAULT NULL,
  `icon`        VARCHAR(100) DEFAULT NULL,
  `sort_order`  INT          NOT NULL DEFAULT 0,
  `is_active`   TINYINT(1)   NOT NULL DEFAULT 1,
  `created_at`  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`parent_id`) REFERENCES `categories`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE 4 : PRODUITS
-- ============================================================
CREATE TABLE IF NOT EXISTS `products` (
  `id`              INT AUTO_INCREMENT PRIMARY KEY,
  `vendor_id`       INT           NOT NULL,
  `category_id`     INT           NOT NULL,
  `name`            VARCHAR(200)  NOT NULL,
  `slug`            VARCHAR(200)  NOT NULL UNIQUE,
  `description`     TEXT          NOT NULL,
  `short_desc`      VARCHAR(500)  DEFAULT NULL,
  `price`           DECIMAL(15,2) NOT NULL,
  `promo_price`     DECIMAL(15,2) DEFAULT NULL,
  `stock`           INT           NOT NULL DEFAULT 0,
  `sku`             VARCHAR(100)  DEFAULT NULL UNIQUE,
  `weight`          DECIMAL(8,2)  DEFAULT NULL,
  `type`            ENUM('physical','digital') NOT NULL DEFAULT 'physical',
  `file_url`        VARCHAR(500)  DEFAULT NULL,
  `images`          JSON          DEFAULT NULL,
  `main_image`      VARCHAR(500)  DEFAULT NULL,
  `avg_rating`      DECIMAL(3,2)  NOT NULL DEFAULT 0.00,
  `total_reviews`   INT           NOT NULL DEFAULT 0,
  `total_sold`      INT           NOT NULL DEFAULT 0,
  `is_featured`     TINYINT(1)    NOT NULL DEFAULT 0,
  `is_active`       TINYINT(1)    NOT NULL DEFAULT 1,
  `created_at`      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`vendor_id`)   REFERENCES `vendors`(`id`)    ON DELETE CASCADE,
  FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Index pour la recherche de produits
CREATE INDEX idx_products_name     ON `products`(`name`);
CREATE INDEX idx_products_price    ON `products`(`price`);
CREATE INDEX idx_products_featured ON `products`(`is_featured`);
CREATE INDEX idx_products_active   ON `products`(`is_active`);

-- ============================================================
-- TABLE 5 : COMMANDES
-- ============================================================
CREATE TABLE IF NOT EXISTS `orders` (
  `id`               INT AUTO_INCREMENT PRIMARY KEY,
  `order_number`     VARCHAR(30)   NOT NULL UNIQUE,
  `buyer_id`         INT           NOT NULL,
  `total_amount`     DECIMAL(15,2) NOT NULL,
  `shipping_fee`     DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `discount_amount`  DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `status`           ENUM('pending','confirmed','processing','shipped','delivered','cancelled','refunded')
                     NOT NULL DEFAULT 'pending',
  `shipping_name`    VARCHAR(100)  DEFAULT NULL,
  `shipping_phone`   VARCHAR(30)   DEFAULT NULL,
  `shipping_address` TEXT          NOT NULL,
  `shipping_city`    VARCHAR(100)  DEFAULT NULL,
  `payment_method`   ENUM('orange_money','mtn_money','bank_transfer') NOT NULL,
  `payment_status`   ENUM('pending','completed','failed','refunded')  NOT NULL DEFAULT 'pending',
  `notes`            TEXT          DEFAULT NULL,
  `created_at`       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`buyer_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE 6 : ARTICLES DE COMMANDE
-- ============================================================
CREATE TABLE IF NOT EXISTS `order_items` (
  `id`           INT AUTO_INCREMENT PRIMARY KEY,
  `order_id`     INT           NOT NULL,
  `product_id`   INT           NOT NULL,
  `vendor_id`    INT           NOT NULL,
  `product_name` VARCHAR(200)  NOT NULL,
  `product_image` VARCHAR(500) DEFAULT NULL,
  `quantity`     INT           NOT NULL DEFAULT 1,
  `unit_price`   DECIMAL(15,2) NOT NULL,
  `total_price`  DECIMAL(15,2) NOT NULL,
  `status`       ENUM('pending','processing','shipped','delivered','cancelled')
                 NOT NULL DEFAULT 'pending',
  `created_at`   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`order_id`)   REFERENCES `orders`(`id`)   ON DELETE CASCADE,
  FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`vendor_id`)  REFERENCES `vendors`(`id`)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE 7 : PAIEMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS `payments` (
  `id`              INT AUTO_INCREMENT PRIMARY KEY,
  `order_id`        INT           NOT NULL,
  `user_id`         INT           NOT NULL,
  `amount`          DECIMAL(15,2) NOT NULL,
  `provider`        ENUM('orange_money','mtn_money','bank_transfer') NOT NULL,
  `transaction_id`  VARCHAR(150)  NOT NULL,
  `sender_phone`    VARCHAR(30)   DEFAULT NULL,
  `status`          ENUM('pending','completed','failed','refunded') NOT NULL DEFAULT 'pending',
  `verified_by`     INT           DEFAULT NULL,
  `verified_at`     DATETIME      DEFAULT NULL,
  `notes`           TEXT          DEFAULT NULL,
  `created_at`      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_transaction` (`provider`, `transaction_id`),
  FOREIGN KEY (`order_id`)    REFERENCES `orders`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`user_id`)     REFERENCES `users`(`id`)  ON DELETE CASCADE,
  FOREIGN KEY (`verified_by`) REFERENCES `users`(`id`)  ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE 8 : AVIS ET NOTES PRODUITS
-- ============================================================
CREATE TABLE IF NOT EXISTS `reviews` (
  `id`           INT AUTO_INCREMENT PRIMARY KEY,
  `product_id`   INT  NOT NULL,
  `buyer_id`     INT  NOT NULL,
  `order_id`     INT  DEFAULT NULL,
  `rating`       TINYINT NOT NULL CHECK (`rating` BETWEEN 1 AND 5),
  `title`        VARCHAR(200) DEFAULT NULL,
  `comment`      TEXT         DEFAULT NULL,
  `is_verified`  TINYINT(1)   NOT NULL DEFAULT 0,
  `is_approved`  TINYINT(1)   NOT NULL DEFAULT 1,
  `created_at`   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_review` (`product_id`, `buyer_id`),
  FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`buyer_id`)   REFERENCES `users`(`id`)    ON DELETE CASCADE,
  FOREIGN KEY (`order_id`)   REFERENCES `orders`(`id`)   ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE 9 : MESSAGERIE (Chat Acheteur ↔ Vendeur)
-- ============================================================
CREATE TABLE IF NOT EXISTS `messages` (
  `id`          INT AUTO_INCREMENT PRIMARY KEY,
  `sender_id`   INT  NOT NULL,
  `receiver_id` INT  NOT NULL,
  `product_id`  INT  DEFAULT NULL,
  `content`     TEXT NOT NULL,
  `is_read`     TINYINT(1) NOT NULL DEFAULT 0,
  `created_at`  TIMESTAMP  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`sender_id`)   REFERENCES `users`(`id`)    ON DELETE CASCADE,
  FOREIGN KEY (`receiver_id`) REFERENCES `users`(`id`)    ON DELETE CASCADE,
  FOREIGN KEY (`product_id`)  REFERENCES `products`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_messages_sender   ON `messages`(`sender_id`);
CREATE INDEX idx_messages_receiver ON `messages`(`receiver_id`);

-- ============================================================
-- TABLE 10 : NOTIFICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS `notifications` (
  `id`         INT AUTO_INCREMENT PRIMARY KEY,
  `user_id`    INT          NOT NULL,
  `type`       ENUM('order_placed','order_paid','order_shipped','order_delivered',
                    'new_message','new_review','payment_received','low_stock',
                    'account_verified','system') NOT NULL,
  `title`      VARCHAR(200) NOT NULL,
  `message`    TEXT         NOT NULL,
  `data`       JSON         DEFAULT NULL,
  `link`       VARCHAR(300) DEFAULT NULL,
  `is_read`    TINYINT(1)   NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_notif_user   ON `notifications`(`user_id`);
CREATE INDEX idx_notif_unread ON `notifications`(`user_id`, `is_read`);

-- ============================================================
-- TABLE 11 : FAVORIS / WISHLIST
-- ============================================================
CREATE TABLE IF NOT EXISTS `wishlists` (
  `id`         INT AUTO_INCREMENT PRIMARY KEY,
  `user_id`    INT NOT NULL,
  `product_id` INT NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_wishlist` (`user_id`, `product_id`),
  FOREIGN KEY (`user_id`)    REFERENCES `users`(`id`)    ON DELETE CASCADE,
  FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE 12 : CODES PROMO / RÉDUCTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS `coupons` (
  `id`             INT AUTO_INCREMENT PRIMARY KEY,
  `code`           VARCHAR(50)   NOT NULL UNIQUE,
  `type`           ENUM('percentage','fixed') NOT NULL DEFAULT 'percentage',
  `value`          DECIMAL(10,2) NOT NULL,
  `min_amount`     DECIMAL(15,2) DEFAULT NULL,
  `max_uses`       INT           DEFAULT NULL,
  `used_count`     INT           NOT NULL DEFAULT 0,
  `expires_at`     DATETIME      DEFAULT NULL,
  `is_active`      TINYINT(1)    NOT NULL DEFAULT 1,
  `created_at`     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- DONNÉES DE DÉMO
-- ============================================================

-- Catégories (avec images Unsplash)
INSERT INTO `categories` (`name`, `slug`, `description`, `image_url`, `sort_order`, `icon`) VALUES
('Électronique',          'electronique',         'TV, ordinateurs, accessoires high-tech',                'https://images.unsplash.com/photo-1498049794561-7780e7231661?w=400&q=80', 1, '💻'),
('Téléphones & Tablettes','telephones-tablettes',  'Smartphones, iPhone, Samsung, Tablettes',               'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=400&q=80', 2, '📱'),
('Vêtements & Mode',      'vetements-mode',        'Habits locaux, prêt-à-porter, chaussures, accessoires', 'https://images.unsplash.com/photo-1483985988355-763728e1935b?w=400&q=80', 3, '👗'),
('Alimentation',          'alimentation',          'Épicerie, fruits, légumes, produits locaux guinéens',   'https://images.unsplash.com/photo-1595974482597-4b8da8879bc5?w=400&q=80', 4, '🥘'),
('Maison & Décoration',   'maison-decoration',     'Meubles, ustensiles, décoration intérieure',            'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=400&q=80', 5, '🏠'),
('Beauté & Santé',        'beaute-sante',          'Cosmétiques, parfums, produits de beauté naturels',     'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=400&q=80', 6, '💄'),
('Agriculture',           'agriculture',           'Semences, équipements agricoles, engrais naturels',     'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=400&q=80', 7, '🌾'),
('Produits Numériques',   'produits-numeriques',   'E-books, formations, logiciels, musique, photos',       'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&q=80', 8, '💾');

-- Utilisateurs de démo (password = "password123" hashé en bcrypt)
INSERT INTO `users` (`name`, `email`, `password`, `role`, `phone`, `address`, `city`, `is_active`, `email_verified`) VALUES
('Admin Shop Guinée', 'admin@shopguinee.gn',   '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LPVxbcKdROK', 'admin',  '+224 620 00 00 01', 'Kaloum, BP 1234',    'Conakry', 1, 1),
('Mamadou Sylla',     'vendeur@shopguinee.gn', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LPVxbcKdROK', 'seller', '+224 622 11 22 33', 'Madina, Rue KA-006', 'Conakry', 1, 1),
('Fatoumata Diallo',  'acheteur@shopguinee.gn','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LPVxbcKdROK', 'buyer',  '+224 628 44 55 66', 'Kipé, Cité Ministère','Conakry',1, 1),
('Alpha Camara',      'alpha@shopguinee.gn',   '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LPVxbcKdROK', 'seller', '+224 664 77 88 99', 'Ratoma, Kobaya',     'Conakry', 1, 1);

-- Boutiques vendeurs
INSERT INTO `vendors` (`user_id`, `store_name`, `store_slug`, `store_description`, `store_city`, `store_phone`, `is_verified`, `commission_rate`) VALUES
(2, 'Sylla Tech & Mode',     'sylla-tech-mode',     'Spécialiste en électronique, smartphones et vêtements guinéens de qualité.', 'Conakry', '+224 622 11 22 33', 1, 5.00),
(4, 'Alpha Agro Commerce',   'alpha-agro-commerce', 'Produits alimentaires locaux : miel, café, fruits et légumes frais de Kindia.', 'Conakry', '+224 664 77 88 99', 1, 5.00);

-- Produits de démo
INSERT INTO `products` (`vendor_id`, `category_id`, `name`, `slug`, `description`, `short_desc`, `price`, `promo_price`, `stock`, `main_image`, `type`, `is_featured`, `avg_rating`, `total_reviews`) VALUES
(1, 2, 'iPhone 14 Pro — 256 Go Violet', 'iphone-14-pro-256go-violet',
 'iPhone 14 Pro reconditionné en parfait état. Caméra 48MP, Dynamic Island, puce A16 Bionic. Livré avec chargeur, boîte et garantie 6 mois chez Sylla Tech.',
 'iPhone 14 Pro 256Go, parfait état, garanti 6 mois.', 9500000.00, 8900000.00, 5,
 'https://images.unsplash.com/photo-1510557880182-3d4d3cba35a5?w=600&q=80', 'physical', 1, 4.80, 12),

(1, 1, 'Télévision Smart TV Samsung 55"', 'tv-samsung-55-pouces',
 'Télévision Samsung QLED 55 pouces 4K Ultra HD. Smart TV avec Android TV intégré, HDR10+, compatible Netflix, YouTube. Livraison gratuite à Conakry.',
 'Samsung 55" 4K QLED Smart TV — Livraison gratuite.', 6500000.00, NULL, 8,
 'https://images.unsplash.com/photo-1593359677879-a4bb92f829e1?w=600&q=80', 'physical', 1, 4.60, 8),

(1, 3, 'Tissu Kendéli Artisanal — 6 mètres', 'tissu-kendeli-artisanal-6m',
 'Véritable tissu Kendéli fabriqué par les tisserands de Boffa. 100% coton naturel, motifs traditionnels guinéens, idéal pour les grandes cérémonies et tenues traditionnelles.',
 'Tissu Kendéli 100% coton, 6 mètres, fait main.', 280000.00, NULL, 30,
 'https://images.unsplash.com/photo-1544816155-12df9643f363?w=600&q=80', 'physical', 0, 4.90, 24),

(2, 4, 'Miel Pur du Fouta Djallon — 1 Litre', 'miel-pur-fouta-1litre',
 'Miel naturel et biologique récolté dans les montagnes du Fouta Djallon. Non pasteurisé, riche en antioxydants, reconnu pour ses vertus thérapeutiques. Certifié 100% naturel sans additifs.',
 'Miel bio du Fouta, 1 litre, 100% naturel.', 65000.00, 58000.00, 100,
 'https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=600&q=80', 'physical', 1, 4.95, 37),

(2, 4, 'Café de Ziama Macenta — 500g', 'cafe-ziama-macenta-500g',
 'Café arabica de haute altitude, cultivé dans les forêts de Ziama Macenta. Torréfaction artisanale, arômes intenses et saveur fruitée unique. Produit du terroir guinéen, exporté internationalement.',
 'Café arabica Ziama, 500g, torréfaction artisanale.', 45000.00, NULL, 200,
 'https://images.unsplash.com/photo-1447933601403-0c6688de566e?w=600&q=80', 'physical', 0, 4.70, 19),

(1, 8, 'Guide de l''Entrepreneuriat en Guinée — PDF', 'guide-entrepreneuriat-guinee',
 'Guide PDF de 150 pages couvrant : immatriculation APIP, financement, secteurs porteurs, gestion comptable en Guinée. Rédigé par des experts en droit des affaires guinéen. Téléchargement immédiat après paiement.',
 'Guide PDF 150p sur l''entrepreneuriat guinéen — DL immédiat.', 35000.00, NULL, 9999,
 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600&q=80', 'digital', 0, 4.40, 6);

-- Coupon de démonstration
INSERT INTO `coupons` (`code`, `type`, `value`, `min_amount`, `max_uses`, `is_active`) VALUES
('GUINEE10', 'percentage', 10.00, 100000.00, 500, 1),
('BIENVENUE', 'fixed', 50000.00, 200000.00, 200, 1);
