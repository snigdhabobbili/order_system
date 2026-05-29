const express = require('express');
const router  = express.Router();
const getDb   = require('../db');

// Only admin can access
router.use((req, res, next) => {
  if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
});

// GET /notifications/unread-count
router.get('/unread-count', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT COUNT(*) as c FROM notifications WHERE is_read=0').get();
  res.json({ count: row.c });
});

// GET /notifications/list
router.get('/list', (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 50').all();
  res.json(rows);
});

// POST /notifications/mark-all-read
router.post('/mark-all-read', (req, res) => {
  const db = getDb();
  db.prepare('UPDATE notifications SET is_read=1').run();
  res.json({ ok: true });
});

// POST /notifications/clear-all
router.post('/clear-all', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM notifications').run();
  res.json({ ok: true });
});

module.exports = router;
