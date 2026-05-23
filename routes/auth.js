const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcrypt');
const crypto  = require('crypto');
const getDb   = require('../db');

const captchaStore = new Map();

function generateCaptcha() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let text = '';
  for (let i = 0; i < 6; i++) text += chars[Math.floor(Math.random() * chars.length)];
  const token = crypto.randomBytes(16).toString('hex');
  captchaStore.set(token, { text, expires: Date.now() + 5 * 60 * 1000 });
  for (const [k, v] of captchaStore) if (v.expires < Date.now()) captchaStore.delete(k);
  return { text, token };
}

function verifyCaptcha(token, input) {
  const entry = captchaStore.get(token);
  if (!entry) return false;
  if (entry.expires < Date.now()) { captchaStore.delete(token); return false; }
  const ok = entry.text.toUpperCase() === (input||'').toUpperCase().trim();
  captchaStore.delete(token);
  return ok;
}

router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  const cap = generateCaptcha();
  res.send(loginPage(cap, '', ''));
});

router.post('/login', (req, res) => {
  const { username, password, captchaToken, captchaInput } = req.body;
  if (!verifyCaptcha(captchaToken, captchaInput)) {
    const cap = generateCaptcha();
    return res.send(loginPage(cap, username, 'Incorrect captcha. Please try again.'));
  }
  const db   = getDb();
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    const cap = generateCaptcha();
    return res.send(loginPage(cap, username, 'Invalid username or password.'));
  }
  req.session.user = { id: user.id, username: user.username, role: user.role };
  res.redirect('/dashboard');
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

router.get('/captcha/new', (req, res) => {
  res.json(generateCaptcha());
});

function loginPage(cap, username, error) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Login – TGTRANSCO IT Wing Registers</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.10.0/dist/tabler-icons.min.css"/>
  <link rel="stylesheet" href="/css/main.css"/>
</head>
<body class="login-page">
  <div class="login-header">
    <img src="/img/logo.jpg" alt="TGTRANSCO Logo" class="login-logo"
         onerror="this.style.display='none'"/>
    <div>
      <div class="login-org">Transmission Corporation of Telangana Limited</div>
      <div class="login-org-sub">(A Govt. of Telangana Owned Company)</div>
    </div>
  </div>
  <div class="tricolor"></div>
  <div class="login-content">
    <h1 class="login-heading">IT Wing Registers</h1>
    <div class="login-card">
      <div class="login-card-header"><span>User Login</span></div>
      <div class="login-card-body">
        ${error ? `<div class="login-error"><i class="ti ti-alert-circle"></i> ${error}</div>` : ''}
        <form method="POST" action="/login" id="loginForm">
          <input type="hidden" name="captchaToken" id="captchaToken" value="${cap.token}"/>
          <div class="login-field">
            <label for="username">User ID <span style="color:#c0392b">*</span></label>
            <input type="text" id="username" name="username" value="${username||''}"
                   required autocomplete="off" placeholder="Enter your user ID"/>
          </div>
          <div class="login-field">
            <label for="password">Password <span style="color:#c0392b">*</span></label>
            <input type="password" id="password" name="password"
                   required autocomplete="off" placeholder="Enter your password"/>
          </div>
          <div class="login-field">
            <label>Captcha <span style="color:#c0392b">*</span></label>
            <div class="captcha-row">
              <div class="captcha-box" id="captchaDisplay">${cap.text}</div>
              <button type="button" class="captcha-refresh" id="refreshCaptcha" title="Refresh captcha">
                <i class="ti ti-refresh"></i>
              </button>
              <input type="text" class="captcha-input" id="captchaInput" name="captchaInput"
                     required placeholder="Enter captcha" autocomplete="off"/>
            </div>
          </div>
          <button type="submit" class="btn-login">Login</button>
        </form>
      </div>
      <div class="login-card-footer">
        <span>For access issues, contact your system administrator</span>
      </div>
    </div>
  </div>
  <div class="login-footer">© 2026 All rights reserved by TGTRANSCO</div>
  <script>
    document.getElementById('refreshCaptcha').addEventListener('click', async () => {
      const res  = await fetch('/captcha/new');
      const data = await res.json();
      document.getElementById('captchaDisplay').textContent = data.text;
      document.getElementById('captchaToken').value = data.token;
      document.getElementById('captchaInput').value = '';
    });
  </script>
</body>
</html>`;
}

module.exports = router;
