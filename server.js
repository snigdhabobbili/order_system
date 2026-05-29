const express = require('express');
const session = require('express-session');
const path    = require('path');
const fs      = require('fs');
const BetterSqlite3Store = require('better-sqlite3-session-store')(session);
const Database = require('better-sqlite3');

const app  = express(); //creates entire web application as one object called app
const PORT = 3000;

const REPORTS_DIR = path.join(__dirname, 'reports');
if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true }); // creates report folder

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const sessionDb = new Database(path.join(__dirname, 'db', 'sessions.db'));
app.use(session({
  store: new BetterSqlite3Store({ client: sessionDb, expired: { clear: true, intervalMs: 900000 } }),
  secret: 'tgtransco-secret-2024-xK9mP',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true }   // no maxAge = session cookie, clears on browser close
}));

function requireAuth(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

app.use('/',               require('./routes/auth'));
app.use('/dashboard',      requireAuth, require('./routes/dashboard'));
app.use('/purchase-orders',requireAuth, require('./routes/purchase-orders'));
app.use('/sanctions',      requireAuth, require('./routes/sanctions'));
app.use('/inward',         requireAuth, require('./routes/inward'));
app.use('/outward',        requireAuth, require('./routes/outward'));
app.use('/download',       requireAuth, require('./routes/download'));
app.use('/notifications',  requireAuth, require('./routes/notifications'));
app.use('/archive',        requireAuth, require('./routes/archive'));

app.get('/', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  res.redirect('/login');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\nTGTRANSCO IT Wing Registers`);
  console.log(`  Local:   http://localhost:${PORT}`);
  console.log(`  Network: http://<your-ip>:${PORT}\n`);
});
