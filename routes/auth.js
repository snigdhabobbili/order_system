const express = require('express');  // import webframework
const svgCaptcha = require('svg-captcha'); //generates the distorted letter image
const router  = express.Router(); //a mini Express app just for auth routes (login/logout)
const bcrypt  = require('bcrypt'); //for checking hashed passwords
const crypto  = require('crypto'); //for generating random tokens
const getDb   = require('../db'); //opens the database (from db/index.js)

const captchaStore = new Map(); //Creates an empty Map (like a Python dictionary) to temporarily store captchas

function generateCaptcha() {
  const captcha = svgCaptcha.create({
    size: 6, //6 characters long
    noise: 3, //3 random lines drawn over it to make it harder to read by bots
    color: true, //each letter is a different colour
    background: '#d9dadc', // grey background colour
    width: 160,
    height: 50,
    fontSize: 52,
    charPreset: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' //only use these characters (no O/0/I/1 which look similar)
  });
  const token = crypto.randomBytes(16).toString('hex');  // Generate a unique 32-character token to identify and validate this captcha
  captchaStore.set(token, { text: captcha.text, expires: Date.now() + 5 * 60 * 1000 }); //Save the captcha answer in memory with a 5-minute expiry
  for (const [k, v] of captchaStore) if (v.expires < Date.now()) captchaStore.delete(k); //Clean up any expired captchas from memory
  return { svg: captcha.data, token }; //Return two things:svg — the captcha image as SVG code (sent to the browser to display),token — the random ID (sent as a hidden field in the form)
}

function verifyCaptcha(token, input) { //Function that checks if the user typed the captcha correctly
  const entry = captchaStore.get(token); 
  if (!entry) return false; //Look up the token in the store. If not found, return false 
  if (entry.expires < Date.now()) { captchaStore.delete(token); return false; } //If the captcha has expired (older than 5 minutes), delete it and return false.
  const ok = entry.text.toUpperCase() === (input||'').toUpperCase().trim(); //Compare the correct answer with what the user typed 
  captchaStore.delete(token);
  return ok; //Delete the captcha from memory (so it can't be reused) then return true or false
}

router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard'); //When browser visits /login: If the user is already logged in (session exists), send them to dashboard instead
  const cap = generateCaptcha();
  res.send(loginPage(cap, '', ''));
});

router.post('/login', (req, res) => {
  const { username, password, captchaToken, captchaInput } = req.body; //When the login form is submitted: Extract username, password, captchaToken and captchaInput from the form data
  if (!verifyCaptcha(captchaToken, captchaInput)) {
    const cap = generateCaptcha(); //Check the captcha first. If wrong: Generate a new captcha and reload the login page with an error message
    return res.send(loginPage(cap, username, 'Incorrect captcha. Please try again.'));
  }
  const db   = getDb(); 
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username); //Open the database and look for a user with that username
  if (!user || !bcrypt.compareSync(password, user.password)) {
    const cap = generateCaptcha();
    return res.send(loginPage(cap, username, 'Invalid username or password.'));
  }
  req.session.user = { id: user.id, username: user.username, role: user.role };
  res.redirect('/dashboard'); //Login successful: Save the user's identity in the session (this is what keeps them logged in)
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login')); //When Sign Out is clicked: Destroy the session completely (removes it from sessions.db) then redirect to login page.
});

router.get('/captcha/new', (req, res) => { //A special route just for refreshing the captcha
  const cap = generateCaptcha(); // When user clicks the refresh button, the browser calls this URL
  res.json({ svg: cap.svg, token: cap.token }); //Returns JSON with a new SVG image and new token — no full page reload needed
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
  <div class="login-content">
    <div style="display:flex;flex-direction:column;align-items:center;gap:14px;margin-bottom:20px">
      <img src="/img/logo.jpg" alt="TGTRANSCO Logo"
           onerror="this.style.display='none'"
           style="width:120px;height:120px;object-fit:contain;border-radius:0"/>
      <div style="text-align:center">
        <div style="font-size:26px;font-weight:800;color:#0f2a4a;line-height:1.2">Transmission Corporation of Telangana Limited</div>
        <div style="font-size:14px;color:#5a6278;margin-top:4px;font-style:italic">(A Govt. of Telangana Owned Company)</div>
      </div>
    </div>
    <h1 class="login-heading" style="font-size:16px;font-weight:600;color:#5a6278;margin-bottom:16px">IT Wing Registers</h1>
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
              <div id="captchaDisplay" style="width:160px;height:50px;flex-shrink:0;border:1.5px solid #e2e8f0;border-radius:6px;overflow:hidden;background:#f1f5f9">${cap.svg}</div>
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
        <span></span>
      </div>
    </div>
  </div>
  <div class="login-footer">© 2026 All rights reserved by TGTRANSCO</div>
  <script>
    document.getElementById('refreshCaptcha').addEventListener('click', async () => {
      const res  = await fetch('/captcha/new');
      const data = await res.json();
      document.getElementById('captchaDisplay').innerHTML = data.svg;
      document.getElementById('captchaToken').value = data.token;
      document.getElementById('captchaInput').value = '';
    });
  </script>
</body>
</html>`;
}

module.exports = router;
