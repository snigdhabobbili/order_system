# TGTRANSCO IT Wing Registers

Internal LAN-based web application for digitising 4 office registers.
Runs on one Windows PC, accessible by all staff on the same network.

---

## One-time setup (do this once on the office PC)

### 1. Install Node.js
Download and install Node.js LTS from https://nodejs.org
After installing, open Command Prompt and verify:
```
node --version
npm --version
```

### 2. Copy the application folder
Place the `tgtransco` folder anywhere, e.g.:
```
C:\TGTRANSCO\
```

### 3. Install dependencies
Open Command Prompt, navigate to the folder, and run:
```
cd C:\TGTRANSCO
npm install
```

### 4. Set up the database
```
npm run setup
```
This creates the database and three default login accounts:
- admin / Admin@2024
- user1 / User1@2024
- user2 / User2@2024

**Change these passwords immediately after first login** (edit db/setup.js and re-run, or use a DB browser).

### 5. Set environment variables for email (optional, for weekly reports)
Open System Properties → Advanced → Environment Variables → New (System variable):

| Variable Name               | Value                        |
|-----------------------------|------------------------------|
| TGTRANSCO_GMAIL_USER        | your.email@gmail.com         |
| TGTRANSCO_GMAIL_APP_PASS    | your-gmail-app-password      |
| TGTRANSCO_REPORT_EMAIL      | recipient@example.com        |

To get a Gmail App Password:
1. Go to myaccount.google.com
2. Security → 2-Step Verification (enable it)
3. Security → App passwords → Generate one for "Mail"

### 6. Start the application
```
npm start
```
Open browser and go to: http://localhost:3000

---

## Making it always run (auto-start with Windows)

### Option A: Simple startup (recommended)
1. Press Win+R, type `shell:startup`, press Enter
2. Create a shortcut to this batch file in the Startup folder:

Create `start-tgtransco.bat`:
```batch
@echo off
cd /d C:\TGTRANSCO
node server.js
```

### Option B: Windows Service (more robust)
Install `node-windows` globally:
```
npm install -g node-windows
```
Then follow node-windows documentation to register as a service.

---

## Task Scheduler setup

### Weekly Report (every Monday 9:00 AM)
1. Open Task Scheduler
2. Create Basic Task → Name: "TGTRANSCO Weekly Report"
3. Trigger: Weekly → Monday → 9:00 AM
4. Action: Start a program
   - Program: `node`
   - Arguments: `C:\TGTRANSCO\scripts\weekly-report.js`
5. Finish

### Nightly Backup (every night midnight)
1. Create Basic Task → Name: "TGTRANSCO Nightly Backup"
2. Trigger: Daily → 12:00 AM
3. Action: Start a program
   - Program: `node`
   - Arguments: `C:\TGTRANSCO\scripts\backup.js`
4. Finish

---

## Accessing from other PCs on the network

1. Find the office PC's IP address:
   Open Command Prompt → type `ipconfig` → look for IPv4 Address (e.g. 192.168.1.10)

2. Other staff open their browser and go to:
   `http://192.168.1.10:3000`

3. To find IP automatically, the server prints it on startup.

---

## File locations

| Path                  | Contents                        |
|-----------------------|---------------------------------|
| db/registers.db       | All data (SQLite database)      |
| db/backups/           | Nightly database backups        |
| reports/              | Weekly Excel reports            |
| reports/report-log.txt| Email/report history log        |
| public/img/logo.jpg   | TGTRANSCO logo                  |

---

## Default credentials

| Role    | Username | Default Password |
|---------|----------|-----------------|
| Admin   | admin    | Admin@2024      |
| User 1  | user1    | User1@2024      |
| User 2  | user2    | User2@2024      |

---

## Access control

| Module          | Admin | User 1 | User 2 |
|-----------------|-------|--------|--------|
| Purchase Orders | ✅    | ❌     | ✅     |
| Sanctions       | ✅    | ❌     | ✅     |
| Inward Orders   | ✅    | ✅     | ❌     |
| Outward Orders  | ✅    | ✅     | ❌     |

---

## Troubleshooting

**Port already in use:**
Change `PORT = 3000` in `server.js` to any other port, e.g. 3001.

**Cannot connect from other PCs:**
Check Windows Firewall → Allow an app → Add Node.js, or allow port 3000 inbound.

**Database missing:**
Run `npm run setup` again.
