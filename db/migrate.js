const Database = require('better-sqlite3'); // Import SQLite library so Node.js can connect to the database
const path = require('path'); // Import Node.js path module for safely building file paths
const DB_PATH = path.join(__dirname, 'registers.db'); // Create full path to registers.db
const db = new Database(DB_PATH); // Open a connection to registers.db
const migrations = [ // Array containing all database migration SQL commands to be executed

  `ALTER TABLE purchase_orders ADD COLUMN file_no TEXT DEFAULT ''`, // Add file_no column to purchase_orders table with empty string as default value

  `ALTER TABLE purchase_orders ADD COLUMN sign TEXT DEFAULT ''`, // Add sign column to purchase_orders table with empty string as default value

];

migrations.forEach(sql => { // Loop through each migration SQL statement one by one

  try { db.exec(sql); console.log('OK:', sql.slice(0,50)); } // Execute migration and print success message if it runs successfully

  catch(e) { console.log('Skip (already exists):', sql.slice(0,50)); } // If migration fails (usually because column already exists), skip and continue

});

db.close(); // Close database connection after all migrations are processed

console.log('Migration complete.'); // Print final message indicating all migrations have finished