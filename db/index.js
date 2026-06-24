const Database = require('better-sqlite3'); // Import SQLite library so Node.js can connect to SQLite database
const path = require('path'); // Import Node.js path module for handling file paths safely
const DB_PATH = path.join(__dirname, 'registers.db'); // Create full path to registers.db file inside db folder
let _db; // Variable that will store the database connection (initially undefined)
function getDb() { // Function used throughout the application to get database access

  if (!_db) { // Check if database connection has not been created yet

    _db = new Database(DB_PATH); // Open registers.db and create a database connection
    _db.pragma('journal_mode = WAL'); // Enable Write-Ahead Logging for better performance and concurrent access
    _db.pragma('foreign_keys = ON'); // Enforce foreign key constraints in SQLite

  }
  return _db; // Return the existing database connection
}
module.exports = getDb; // Export getDb() so other files can use the database connection