const fs = require('fs');
let c = fs.readFileSync('scripts/weekly-report.js', 'utf8');
const old = "return `${startYear}-${String(startYear + 1).slice(-2)}`;";
const neu = "return `${startYear}-${startYear + 1}`;";
c = c.replace(old, neu);
fs.writeFileSync('scripts/weekly-report.js', c, 'utf8');
console.log(c.includes('slice(-2)') ? 'STILL NOT FIXED' : 'FIXED!');
