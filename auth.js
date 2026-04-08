/* LOOM — Auth module (simplified, sessionStorage only) */

const ADMIN_SESSION_KEY = 'loom_admin_session';
const USER_SESSION_KEY = 'loom_user_session';

/* ── Login ───────────────────────────────────────── */
async function doUserLogin() {
  const userId = document.getElementById('studentId').value.trim();
  const errEl = document.getElementById('userLoginError');
  const btn = document.getElementById('userLoginBtn');

  errEl.style.display = 'none';

  if (!userId) {
    showUserLoginError('Please enter your Student ID.');
    return;
  }

  btn.innerHTML = '<span class="spinner"></span> Verifying...';
  btn.disabled = true;

  try {
    const res = await fetch('https://loom-grievance.onrender.com/api/user/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    });
    const data = await res.json();

    if (res.ok && data.success) {
      sessionStorage.setItem(USER_SESSION_KEY, JSON.stringify({ userId: data.userId }));
      window.location.href = 'user.html';
    } else {
      btn.innerHTML = 'Login to Portal';
      btn.disabled = false;
      showUserLoginError(data.error || 'Invalid Student ID.');
    }
  } catch (err) {
    btn.innerHTML = 'Login to Portal';
    btn.disabled = false;
    showUserLoginError('Cannot reach server.');
  }
}

function showUserLoginError(msg) {
  const el = document.getElementById('userLoginError');
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}

async function doAdminLogin() {
  const user = document.getElementById('adminUser').value.trim();
  const pass = document.getElementById('adminPass').value;
  const errEl = document.getElementById('loginError');
  const btn = document.getElementById('loginBtn');

  errEl.style.display = 'none';

  if (!user || !pass) {
    showLoginError('Please enter both username and password.');
    return;
  }

  btn.innerHTML = '<span class="spinner"></span> Verifying...';
  btn.disabled = true;

  try {
    const res = await fetch('https://loom-grievance.onrender.com/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: user, password: pass })
    });
    const data = await res.json();

    if (res.ok && data.success) {
      // Save to sessionStorage BEFORE redirecting
      sessionStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify({
        username: data.username
      }));
      window.location.href = 'admin.html';
    } else {
      btn.innerHTML = 'Login to Admin Panel';
      btn.disabled = false;
      showLoginError(data.error || 'Invalid username or password.');
    }
  } catch (err) {
    btn.innerHTML = 'Login to Admin Panel';
    btn.disabled = false;
    showLoginError('Cannot reach server. Make sure Flask is running on port 5000.');
  }
}

function showLoginError(msg) {
  const el = document.getElementById('loginError');
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}

/* ── Session helpers ─────────────────────────────── */
function getUserSession() {
  const raw = sessionStorage.getItem(USER_SESSION_KEY);
  return raw ? JSON.parse(raw) : null;
}

function requireUserAuth() {
  const session = getUserSession();
  if (!session) {
    window.location.href = 'index.html';
    return null;
  }
  return session;
}

function userLogout() {
  sessionStorage.removeItem(USER_SESSION_KEY);
  window.location.href = 'index.html';
}

function getAdminSession() {
  const raw = sessionStorage.getItem(ADMIN_SESSION_KEY);
  return raw ? JSON.parse(raw) : null;
}

/* Purely local check — no server call, no cookie, no CORS issue */
function requireAdminAuth() {
  const session = getAdminSession();
  if (!session) {
    window.location.href = 'index.html';
    return null;
  }
  return session;
}

function adminLogout() {
  sessionStorage.removeItem(ADMIN_SESSION_KEY);
  window.location.href = 'index.html';
}

/* ── Modal helpers (index.html) ──────────────────── */
function showUserLogin() {
  document.getElementById('userLoginModal').classList.add('open');
  setTimeout(() => document.getElementById('studentId').focus(), 100);
}

function hideUserLogin() {
  document.getElementById('userLoginModal').classList.remove('open');
}

function showAdminLogin() {
  document.getElementById('adminLoginModal').classList.add('open');
  setTimeout(() => document.getElementById('adminUser').focus(), 100);
}

function hideAdminLogin() {
  document.getElementById('adminLoginModal').classList.remove('open');
}

document.addEventListener('DOMContentLoaded', () => {
  const adminModal = document.getElementById('adminLoginModal');
  if (adminModal) {
    adminModal.addEventListener('click', e => {
      if (e.target === adminModal) hideAdminLogin();
    });
  }
  const userModal = document.getElementById('userLoginModal');
  if (userModal) {
    userModal.addEventListener('click', e => {
      if (e.target === userModal) hideUserLogin();
    });
  }
});
