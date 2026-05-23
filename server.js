require('dotenv').config();
const express = require('express');
const cors    = require('cors');

const db = require('./config/db'); // déclenche la connexion au boot

// ── Contrôleurs ──────────────────────────────────────────────
const auth    = require('./controllers/authController');
const product = require('./controllers/productController');
const order   = require('./controllers/orderController');
const payment = require('./controllers/paymentController');
const message = require('./controllers/messageController');
const review  = require('./controllers/reviewController');
const admin   = require('./controllers/adminController');

// ── Middleware ────────────────────────────────────────────────
const { protect, authorize } = require('./middleware/authMiddleware');

const app = express();

/* ── Middlewares globaux ─────────────────────────────────────── */
app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logger minimaliste
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

/* ── Route de santé ─────────────────────────────────────────── */
app.get('/api', (_req, res) => res.json({ success: true, message: '🟢 API Shop Guinée opérationnelle !' }));

/* ══════════════════════════════════════════════════════════════
   AUTH
   ══════════════════════════════════════════════════════════════ */
app.post('/api/auth/register',         auth.register);
app.post('/api/auth/login',            auth.login);
app.get ('/api/auth/me',               protect, auth.getMe);
app.put ('/api/auth/profile',          protect, auth.updateProfile);
app.put ('/api/auth/change-password',  protect, auth.changePassword);
app.get ('/api/auth/notifications',    protect, auth.getNotifications);

/* ══════════════════════════════════════════════════════════════
   CATÉGORIES & PRODUITS
   ══════════════════════════════════════════════════════════════ */
app.get ('/api/categories',              product.getCategories);
app.get ('/api/products',                product.getAllProducts);
app.get ('/api/products/my-products',    protect, authorize('seller','admin'), product.getMyProducts);
app.get ('/api/products/:id',            product.getProductById);
app.post('/api/products',                protect, authorize('seller','admin'), product.createProduct);
app.put ('/api/products/:id',            protect, authorize('seller','admin'), product.updateProduct);
app.delete('/api/products/:id',          protect, authorize('seller','admin'), product.deleteProduct);

/* ══════════════════════════════════════════════════════════════
   COMMANDES
   ══════════════════════════════════════════════════════════════ */
app.post('/api/orders',                  protect, authorize('buyer'),          order.createOrder);
app.get ('/api/orders/my-orders',        protect, authorize('buyer'),          order.getMyOrders);
app.get ('/api/orders/seller-orders',    protect, authorize('seller'),         order.getSellerOrders);
app.get ('/api/orders/:id',              protect,                              order.getOrderById);
app.put ('/api/orders/:id/status',       protect, authorize('seller','admin'), order.updateOrderStatus);

/* ══════════════════════════════════════════════════════════════
   PAIEMENTS
   ══════════════════════════════════════════════════════════════ */
app.post('/api/payments',                protect, authorize('buyer'),  payment.submitPayment);
app.put ('/api/payments/:id/verify',     protect, authorize('admin'),  payment.verifyPayment);
app.get ('/api/payments',                protect, authorize('admin'),  payment.getAllPayments);
app.get ('/api/payments/instructions/:method',                         payment.getPaymentInstructions);

/* ══════════════════════════════════════════════════════════════
   MESSAGERIE
   ══════════════════════════════════════════════════════════════ */
app.post('/api/messages',                   protect, message.sendMessage);
app.get ('/api/messages/inbox',             protect, message.getInbox);
app.get ('/api/messages/conversation/:userId', protect, message.getConversation);

/* ══════════════════════════════════════════════════════════════
   AVIS
   ══════════════════════════════════════════════════════════════ */
app.post('/api/reviews',                     protect, authorize('buyer'), review.createReview);
app.get ('/api/reviews/product/:productId',                              review.getProductReviews);

/* ══════════════════════════════════════════════════════════════
   ADMIN
   ══════════════════════════════════════════════════════════════ */
app.get ('/api/admin/stats',                 protect, authorize('admin'), admin.getDashboardStats);
app.get ('/api/admin/users',                 protect, authorize('admin'), admin.getAllUsers);
app.put ('/api/admin/users/:id',             protect, authorize('admin'), admin.updateUser);
app.delete('/api/admin/users/:id',           protect, authorize('admin'), admin.deleteUser);
app.get ('/api/admin/products',              protect, authorize('admin'), admin.getAllProducts);
app.put ('/api/admin/products/:id',          protect, authorize('admin'), admin.moderateProduct);
app.get ('/api/admin/vendors',               protect, authorize('admin'), admin.getAllVendors);
app.put ('/api/admin/vendors/:id/verify',    protect, authorize('admin'), admin.verifyVendor);

/* ── 404 ────────────────────────────────────────────────────── */
app.use((_req, res) => res.status(404).json({ success: false, message: 'Route introuvable.' }));

/* ── Erreur globale ─────────────────────────────────────────── */
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, message: 'Erreur interne du serveur.' });
});

/* ── Démarrage ──────────────────────────────────────────────── */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`\n🚀  Serveur Shop Guinée démarré sur http://localhost:${PORT}`);
  console.log(`📚  API disponible sur http://localhost:${PORT}/api\n`);
});
