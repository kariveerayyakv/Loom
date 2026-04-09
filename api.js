/* LOOM — API Layer */

const API = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost'
  ? 'http://localhost:5000/api'
  : 'https://loom-backend-piwl.onrender.com/api';  // ← replace with your actual Render URL after deploy

/* ── Generic fetch wrapper ───────────────────────────────── */
function getActiveUserId() {
  const raw = sessionStorage.getItem('loom_user_session');
  if (raw) {
    try { return JSON.parse(raw).userId; } catch (e) { }
  }
  return null;
}

async function apiFetch(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const userId = getActiveUserId();
  if (userId) {
    headers['X-User-Id'] = userId;
  }

  const res = await fetch(API + path, {
    headers: headers,
    credentials: 'include',
    ...options
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

/* ── Complaints ──────────────────────────────────────────── */

async function apiGetComplaints(status = 'all') {
  const qs = status !== 'all' ? `?status=${encodeURIComponent(status)}` : '';
  return apiFetch('/complaints' + qs);
}

async function apiCreateComplaint(category, title, body, priority) {
  return apiFetch('/complaints', {
    method: 'POST',
    body: JSON.stringify({ category, title, body, priority })
  });
}

async function apiVote(id) {
  return apiFetch(`/complaints/${id}/vote`, { method: 'POST' });
}

async function apiSetStatus(id, status) {
  return apiFetch(`/complaints/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status })
  });
}

/* ── Stats ───────────────────────────────────────────────── */

async function apiGetStats() {
  return apiFetch('/stats');
}

/* ── Admin Auth ──────────────────────────────────────────── */

async function apiAdminLogin(username, password) {
  return apiFetch('/admin/login', {
    method: 'POST',
    body: JSON.stringify({ username, password })
  });
}

/* ── Shared helpers ──────────────────────────────────────── */

function timeAgo(isoStr) {
  const normalized = isoStr.endsWith('Z') || isoStr.includes('+') ? isoStr : isoStr + 'Z';
  const diff = (Date.now() - new Date(normalized).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
  return Math.floor(diff / 604800) + 'w ago';
}

function labelStatus(s) {
  const map = {
    'pending': 'Pending',
    'in-review': 'In Review',
    'critical': 'Critical',
    'resolved': 'Resolved'
  };
  return map[s] || s;
}

function showToast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(110px)';
    toast.style.transition = 'all 0.28s';
    setTimeout(() => toast.remove(), 300);
  }, 3600);
}

function getAnonId() {
  let id = sessionStorage.getItem('loom_anon_id');
  if (!id) {
    id = '#' + Math.random().toString(36).substr(2, 4);
    sessionStorage.setItem('loom_anon_id', id);
  }
  return id;
}

function getMyIds() { return JSON.parse(sessionStorage.getItem('loom_mine') || '[]'); }
function addMyId(id) { const ids = getMyIds(); ids.push(id); sessionStorage.setItem('loom_mine', JSON.stringify(ids)); }

function hasVotedOn(id) { return sessionStorage.getItem('voted_' + id) === '1'; }
function markVoted(id) { sessionStorage.setItem('voted_' + id, '1'); }
