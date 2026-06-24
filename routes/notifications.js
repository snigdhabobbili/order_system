const express = require('express'); // Import Express web framework
const router  = express.Router(); // Create a mini router just for notification-related routes
const getDb   = require('../db'); // Import database connection function from db/index.js

// Only admin can access
router.use((req, res, next) => { // Middleware that runs before every route in this file

  if (!req.session.user || req.session.user.role !== 'admin') // Check if user is logged in and has admin role
    return res.status(403).json({ error: 'Admin only' }); // If not admin, return HTTP 403 Forbidden

  next(); // User is admin, continue to the requested route

});

// GET /notifications/unread-count
router.get('/unread-count', (req, res) => { // Route that returns number of unread notifications

  const db = getDb(); // Get database connection

  const row = db.prepare(
    'SELECT COUNT(*) as c FROM notifications WHERE is_read=0'
  ).get(); // Count notifications where is_read = 0 (unread)

  res.json({ count: row.c }); // Send result as JSON: { count: 5 }

});

// GET /notifications/list
router.get('/list', (req, res) => { // Route that returns latest notifications

  const db = getDb(); // Get database connection

  const rows = db.prepare(
    'SELECT * FROM notifications ORDER BY created_at DESC LIMIT 50'
  ).all(); // Fetch latest 50 notifications, newest first

  res.json(rows); // Send notifications as JSON array

});

// POST /notifications/mark-all-read
router.post('/mark-all-read', (req, res) => { // Route that marks all notifications as read

  const db = getDb(); // Get database connection

  db.prepare(
    'UPDATE notifications SET is_read=1'
  ).run(); // Set is_read = 1 for every notification

  res.json({ ok: true }); // Return success response

});

// POST /notifications/clear-all
router.post('/clear-all', (req, res) => { // Route that permanently deletes all notifications

  const db = getDb(); // Get database connection

  db.prepare(
    'DELETE FROM notifications'
  ).run(); // Remove every row from notifications table

  res.json({ ok: true }); // Return success response

});

module.exports = router; // Export router so server.js can use it