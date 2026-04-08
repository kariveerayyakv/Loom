/* LOOM — Admin Panel Logic
   BUG FIX: requireAdminAuth() is now async — must be awaited.
   BUG FIX: refresh() now properly awaits both branches.
   BUG FIX: openModal fetches single complaint instead of all. */

const VOTE_THRESHOLD = 5;
let currentTab = 'dashboard';
let currentFilter = 'all';
let cachedList = [];   // local cache for client-side search

/* ── Init ────────────────────────────────────────── */
window.addEventListener('DOMContentLoaded', async () => {
  // requireAdminAuth is async — MUST be awaited
  const session = requireAdminAuth();
  if (!session) return;
  document.getElementById('adminNameDisplay').textContent = session.username;
  loadDashboard();
  refreshBadges();
});

/* ── Dashboard ───────────────────────────────────── */
async function loadDashboard() {
  try {
    const [stats, all] = await Promise.all([apiGetStats(), apiGetComplaints('all')]);

    document.getElementById('adminMetrics').innerHTML = `
      <div class="metric-card critical-card">
        <div class="metric-num" style="color:var(--critical)">${stats.critical}</div>
        <div class="metric-label">Critical Issues</div>
      </div>
      <div class="metric-card">
        <div class="metric-num" style="color:var(--warning)">${stats.inReview}</div>
        <div class="metric-label">In Review</div>
      </div>
      <div class="metric-card">
        <div class="metric-num">${stats.pending}</div>
        <div class="metric-label">Pending</div>
      </div>
      <div class="metric-card">
        <div class="metric-num" style="color:var(--accent3)">${stats.resolved}</div>
        <div class="metric-label">Resolved</div>
      </div>`;

    document.getElementById('lastRefresh').textContent = 'Updated: ' + new Date().toLocaleTimeString();

    // Top 5 critical
    const crits = all.filter(c => c.status === 'critical')
      .sort((a, b) => b.votes - a.votes).slice(0, 5);
    document.getElementById('dashCritical').innerHTML = crits.length
      ? crits.map((c, i) => buildAdminCard(c, i)).join('')
      : `<div class="empty-state small"><div class="icon">✅</div><p>No critical issues right now.</p></div>`;

    // 5 most recent
    const recent = [...all].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
    document.getElementById('dashRecent').innerHTML = recent.map((c, i) => buildAdminCard(c, i)).join('');

  } catch (err) {
    document.getElementById('adminMetrics').innerHTML =
      `<div class="metric-card" style="grid-column:1/-1;text-align:center;color:var(--critical)">
        ⚠️ Failed to load: ${err.message}</div>`;
  }
}

/* ── Complaints tab ──────────────────────────────── */
async function loadComplaintsTab(filter) {
  currentFilter = filter;
  const container = document.getElementById('adminFeed');
  container.innerHTML = '<div class="loading-card">Loading...</div>';

  try {
    const list = await apiGetComplaints(filter);
    cachedList = list;   // store for search
    document.getElementById('adminFeedCount').textContent =
      list.length + ' complaint' + (list.length !== 1 ? 's' : '');

    if (!list.length) {
      container.innerHTML = `<div class="empty-state"><div class="icon">📭</div>
        <h3>No complaints found</h3><p>Nothing in this category.</p></div>`;
      return;
    }
    container.innerHTML = list.sort((a, b) => b.votes - a.votes)
      .map((c, i) => buildAdminCard(c, i)).join('');
  } catch (err) {
    container.innerHTML = `<div class="empty-state">
      <div class="icon">⚠️</div><h3>Could not load</h3><p>${err.message}</p></div>`;
  }
}

function buildAdminCard(c, i) {
  const pct = Math.min((c.votes / VOTE_THRESHOLD) * 100, 100);

  // Priority badge colour
  const priColour = { high: 'var(--critical)', medium: 'var(--warning)', low: 'var(--accent3)' };
  const priColor = priColour[c.priority] || 'var(--muted)';

  return `
  <div class="complaint-card ${c.status}" style="animation-delay:${i * 0.04}s" onclick="openModal(${c.id})">
    <div class="vote-box">
      <div style="font-size:11px;color:var(--muted);text-align:center">▲</div>
      <div class="vote-count">${c.votes}</div>
    </div>
    <div>
      <div class="complaint-meta">
        <span class="category-tag">${c.category}</span>
        <span class="status-badge ${c.status}">${labelStatus(c.status)}</span>
        <span style="font-size:10px;font-weight:700;color:${priColor};text-transform:uppercase;letter-spacing:0.5px">
          ${c.priority} priority
        </span>
        
      </div>
      <div class="complaint-title">${c.title}</div>
      <div class="complaint-body">${c.body}</div>
      <div class="vote-progress"><div class="vote-progress-fill" style="width:${pct}%"></div></div>
      <div class="complaint-footer">
        <span>🕐 ${timeAgo(c.createdAt)}</span>
        <span>📊 ${c.votes}/${VOTE_THRESHOLD} votes</span>
      </div>
    </div>
    <div class="card-actions" onclick="event.stopPropagation()">
      ${c.status !== 'in-review' ? `<button class="admin-action-btn btn-review"   onclick="quickStatus(${c.id},'in-review')">Review</button>` : ''}
      ${c.status !== 'resolved' ? `<button class="admin-action-btn btn-resolve"  onclick="quickStatus(${c.id},'resolved')">Resolve</button>` : ''}
      ${c.status !== 'critical' ? `<button class="admin-action-btn btn-critical" onclick="quickStatus(${c.id},'critical')">Escalate</button>` : ''}
      ${c.status !== 'pending' ? `<button class="admin-action-btn"              onclick="quickStatus(${c.id},'pending')">Reset</button>` : ''}
      <button class="admin-action-btn" style="color:var(--critical);border-color:rgba(250,74,74,0.3)" onclick="deleteComplaint(${c.id})">🗑 Delete</button>
    </div>
  </div>`;
}

/* ── Modal ───────────────────────────────────────── */
async function openModal(id) {
  try {
    // Fetch single complaint (fresher data, avoids refetching all)
    const c = await apiFetch(`/complaints/${id}`);

    document.getElementById('modalMeta').innerHTML = `
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <span class="category-tag">${c.category}</span>
        <span class="status-badge ${c.status}">${labelStatus(c.status)}</span>
      </div>`;
    document.getElementById('modalTitle').textContent = c.title;
    document.getElementById('modalBody').textContent = c.body;
    document.getElementById('modalFooter').innerHTML = `
      <div style="font-size:12px;color:var(--muted)">
        ${c.votes} votes · ${timeAgo(c.createdAt)} · ${c.priority} priority
      </div>
      <div style="font-size:12px;color:var(--muted)">By <strong>${c.anonId}</strong></div>`;
    document.getElementById('adminActions').innerHTML = `
      <button class="btn btn-ghost btn-sm" onclick="changeStatus(${c.id},'in-review')">🟡 In Review</button>
      <button class="btn btn-ghost btn-sm"
        style="color:var(--accent3);border-color:rgba(109,250,189,0.3)"
        onclick="changeStatus(${c.id},'resolved')">🟢 Resolved</button>
      <button class="btn btn-ghost btn-sm"
        style="color:var(--critical);border-color:rgba(250,74,74,0.3)"
        onclick="changeStatus(${c.id},'critical')">🔴 Critical</button>
      <button class="btn btn-ghost btn-sm"
        onclick="changeStatus(${c.id},'pending')">⚪ Pending</button>
      <button class="btn btn-ghost btn-sm"
        style="color:var(--critical);border-color:rgba(250,74,74,0.3);margin-left:auto"
        onclick="deleteComplaint(${c.id})">🗑 Delete</button>`;
    document.getElementById('modalOverlay').classList.add('open');
  } catch (err) {
    showToast('Could not load complaint: ' + err.message, 'error');
  }
}

function closeModal() { document.getElementById('modalOverlay').classList.remove('open'); }

/* ── Delete complaint ────────────────────────────── */
async function deleteComplaint(id) {
  if (!confirm('Are you sure you want to delete this complaint? This cannot be undone.')) return;
  try {
    await apiFetch('/complaints/' + id, { method: 'DELETE' });
    closeModal();
    refresh();
    showToast('Complaint deleted.', 'success');
  } catch (err) {
    showToast(err.message || 'Delete failed.', 'error');
  }
}

/* ── Status changes ──────────────────────────────── */
async function changeStatus(id, status) {
  try {
    await apiSetStatus(id, status);
    closeModal();
    refresh();
    showToast('Complaint marked as ' + labelStatus(status) + '.', 'success');
  } catch (err) {
    showToast(err.message || 'Update failed.', 'error');
  }
}

async function quickStatus(id, status) {
  try {
    await apiSetStatus(id, status);
    refresh();
    showToast('Complaint marked as ' + labelStatus(status) + '.', 'success');
  } catch (err) {
    showToast(err.message || 'Update failed.', 'error');
  }
}

/* ── Tab switching ───────────────────────────────── */
function switchTab(tab, el) {
  document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
  el.classList.add('active');
  currentTab = tab;

  document.getElementById('tab-dashboard').classList.remove('active');
  document.getElementById('tab-complaints').classList.remove('active');

  if (tab === 'dashboard') {
    document.getElementById('tab-dashboard').classList.add('active');
    loadDashboard();
  } else {
    document.getElementById('tab-complaints').classList.add('active');
    const titles = {
      all: 'All Complaints',
      critical: '🔴 Critical',
      'in-review': '🟡 In Review',
      pending: '⚪ Pending',
      resolved: '🟢 Resolved'
    };
    document.getElementById('tabTitle').textContent = titles[tab] || 'Complaints';
    loadComplaintsTab(tab);
  }
}

async function refresh() {
  if (currentTab === 'dashboard') {
    await loadDashboard();
  } else {
    await loadComplaintsTab(currentFilter);
  }
  refreshBadges();
}

/* ── Search (client-side filter on cached list) ──── */
function searchComplaints(query) {
  const lower = query.toLowerCase().trim();
  if (!lower) {
    renderList(cachedList);
    return;
  }
  const filtered = cachedList.filter(c =>
    c.title.toLowerCase().includes(lower) ||
    c.body.toLowerCase().includes(lower) ||
    c.category.toLowerCase().includes(lower) ||
    c.anonId.toLowerCase().includes(lower)
  );
  renderList(filtered, `No results for "${query}"`);
}

function renderList(list, emptyMsg = 'Nothing here.') {
  const container = document.getElementById('adminFeed');
  document.getElementById('adminFeedCount').textContent =
    list.length + ' result' + (list.length !== 1 ? 's' : '');
  if (!list.length) {
    container.innerHTML = `<div class="empty-state"><div class="icon">🔍</div>
      <h3>No results</h3><p>${emptyMsg}</p></div>`;
    return;
  }
  container.innerHTML = list.map((c, i) => buildAdminCard(c, i)).join('');
}

/* ── Sidebar badges ──────────────────────────────── */
async function refreshBadges() {
  try {
    const s = await apiGetStats();
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = val;
      el.classList.toggle('show', val > 0);
    };
    set('badgeCritical', s.critical);
    set('badgeReview', s.inReview);
    set('badgePending', s.pending);
  } catch (_) { }
}