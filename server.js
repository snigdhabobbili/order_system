const express = require('express'); // Import Express web framework used to create the web server
const session = require('express-session'); // Import session middleware to keep users logged in
const path    = require('path'); // Import path module for safely working with file/folder paths
const fs      = require('fs'); // Import File System module to create/check folders and files
const BetterSqlite3Store = require('better-sqlite3-session-store')(session); // Import SQLite session store so login sessions are saved in SQLite
const Database = require('better-sqlite3'); // Import SQLite library
const app  = express(); // Create the entire web application object called app
const PORT = 3000; // Website will run on port 3000
const REPORTS_DIR = path.join(__dirname, 'reports'); // Build full path to reports folder

if (!fs.existsSync(REPORTS_DIR)) // Check if reports folder already exists

  fs.mkdirSync(REPORTS_DIR, { recursive: true }); // If not, create reports folder automatically
app.use(express.json()); // Allow server to read JSON data sent from browser
app.use(express.urlencoded({ extended: true })); // Allow server to read HTML form data (req.body)
app.use(express.static(path.join(__dirname, 'public'))); // Make files in public folder accessible to browser (CSS, JS, images)

const sessionDb = new Database(path.join(__dirname, 'db', 'sessions.db')); // Open sessions.db database for storing login sessions
app.use(session({ // Enable session management

  store: new BetterSqlite3Store({ // Store sessions inside SQLite instead of memory

    client: sessionDb, // Use sessions.db database

    expired: {

      clear: true, // Automatically delete expired sessions

      intervalMs: 900000 // Check every 900000 ms (15 minutes)

    }

  }),

  secret: 'tgtransco-secret-2024-xK9mP', // Secret key used to sign session cookies

  resave: false, // Don't save session again if nothing changed

  saveUninitialized: false, // Don't create empty sessions for visitors

  cookie: {

    httpOnly: true // JavaScript in browser cannot access this cookie (more secure)

  }   // Session cookie disappears when browser is closed

}));
function requireAuth(req, res, next) { // Middleware that checks whether user is logged in

  if (!req.session.user) // If no logged-in user exists in session

    return res.redirect('/login'); // Send user to login page

  next(); // User is logged in, continue to requested page

}
app.use('/', require('./routes/auth')); // Load login/logout routes
app.use('/dashboard', requireAuth, require('./routes/dashboard')); // Dashboard page (login required)
app.use('/purchase-orders', requireAuth, require('./routes/purchase-orders')); // Purchase Orders module
app.use('/sanctions', requireAuth, require('./routes/sanctions')); // Sanctions module
app.use('/inward', requireAuth, require('./routes/inward')); // Inward Register module
app.use('/outward', requireAuth, require('./routes/outward')); // Outward Register module
app.use('/download', requireAuth, require('./routes/download')); // Excel/PDF download routes
app.use('/notifications', requireAuth, require('./routes/notifications')); // Notifications module
app.use('/archive', requireAuth, require('./routes/archive')); // Archive module
app.get('/', (req, res) => { // When user visits website root URL "/"

  if (req.session.user) // Check if user is already logged in

    return res.redirect('/dashboard'); // Logged-in users go directly to dashboard

  res.redirect('/login'); // Everyone else goes to login page

});
app.listen(PORT, '0.0.0.0', () => { // Start web server and listen on all network interfaces

  console.log(`\nTGTRANSCO IT Wing Registers`); // Print application name
  console.log(`  Local:   http://localhost:${PORT}`); // Local access URL
  console.log(`  Network: http://<your-ip>:${PORT}\n`); // Network access URL for other devices

});