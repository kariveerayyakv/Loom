/* LOOM — Student Portal Logic */

const VOTE_THRESHOLD = 5;
let currentFilter = 'all';
let formVisible = true;

/* ── Init ────────────────────────────────────────── */
window.addEventListener('DOMContentLoaded', () => {

  const session = requireUserAuth();
  if (!session) return;
  document.getElementById('studentIdDisplay').textContent = "Student ID: " + session.userId;

  const descEl = document.getElementById('description');
  if (descEl) {
    descEl.addEventListener('input', function () {
      document.getElementById('charCount').textContent = this.value.length + '/500';
    });
    // Also update on paste
    descEl.addEventListener('paste', function () {
      setTimeout(() => {
        document.getElementById('charCount').textContent = this.value.length + '/500';
      }, 10);
    });
  }

  loadStats();
  loadFeed('all');
});

/* ── Stats bar ───────────────────────────────────── */
async function loadStats() {
  try {
    const s = await apiGetStats();
    document.getElementById('statTotal').textContent = s.total;
    document.getElementById('statCritical').textContent = s.critical;
    document.getElementById('statResolved').textContent = s.resolved;
  } catch (_) { }
}

/* ── Complaint feed ──────────────────────────────── */
async function loadFeed(filter) {
  currentFilter = filter;
  const container = document.getElementById('complaintFeed');
  container.innerHTML = '<div class="loading-card">Loading...</div>';

  try {
    const list = await apiGetComplaints(filter);
    document.getElementById('feedCount').textContent =
      list.length + ' complaint' + (list.length !== 1 ? 's' : '');

    if (!list.length) {
      container.innerHTML = `<div class="empty-state">
        <div class="icon">📭</div><h3>No complaints found</h3>
        <p>Nothing in this category yet.</p></div>`;
      return;
    }
    container.innerHTML = list.map((c, i) => buildCard(c, i)).join('');
  } catch (err) {
    container.innerHTML = `<div class="empty-state">
      <div class="icon">⚠️</div><h3>Could not load complaints</h3>
      <p>${err.message}</p>
      <p style="font-size:11px;margin-top:8px">Make sure Flask is running: <code>python app.py</code></p>
      </div>`;
  }
}

function buildCard(c, i) {
  const pct = Math.min((c.votes / VOTE_THRESHOLD) * 100, 100);
  const voted = c.voted;

  // Priority colour dot
  const priDot = { high: '🔴', medium: '🟡', low: '🟢' }[c.priority] || '⚪';

  return `
  <div class="complaint-card ${c.status}" style="animation-delay:${i * 0.04}s" onclick="openModal(${c.id})">
    <div class="vote-box" onclick="event.stopPropagation()">
      <button class="vote-btn ${voted ? 'voted' : ''}" id="vbtn-${c.id}" onclick="doVote(${c.id})">▲</button>
      <div class="vote-count" id="vc-${c.id}">${c.votes}</div>
    </div>
    <div>
      <div class="complaint-meta">
        <span class="category-tag">${c.category}</span>
        <span class="status-badge ${c.status}">${labelStatus(c.status)}</span>
        <span style="font-size:10px;color:var(--muted)">${priDot} ${c.priority}</span>
      </div>
      <div class="complaint-title">${c.title}</div>
      <div class="complaint-body">${c.body}</div>
      <div class="vote-progress"><div class="vote-progress-fill" style="width:${pct}%"></div></div>
      <div class="complaint-footer">
        <span>🕐 ${timeAgo(c.createdAt)}</span>
        <span>📊 ${c.votes}/${VOTE_THRESHOLD} to escalate</span>
      </div>
    </div>
    <div style="font-size:11px;color:var(--muted);text-align:right;white-space:nowrap">
      ${c.priority}<br>priority
    </div>
  </div>`;
}

/* ── Vote ────────────────────────────────────────── */
async function doVote(id) {
  const btn = document.getElementById('vbtn-' + id);
  if (!btn || btn.classList.contains('voted')) {
    showToast('You already voted on this complaint.', 'error'); return;
  }

  btn.disabled = true;
  try {
    const res = await apiVote(id);
    btn.classList.add('voted');
    btn.disabled = false;

    const vcEl = document.getElementById('vc-' + id);
    if (vcEl) vcEl.textContent = res.votes;

    if (res.escalated) {
      showToast('⚡ Escalated to Critical! Management has been notified.', 'info');
      loadFeed(currentFilter);
    } else {
      showToast('Vote recorded anonymously.', 'success');
    }
    loadStats();
  } catch (err) {
    btn.disabled = false;
    showToast(err.message || 'Vote failed.', 'error');
  }
}

/* ── Submit ──────────────────────────────────────── */
async function submitComplaint() {
  const category = document.getElementById('category').value;
  const title = document.getElementById('complaintTitle').value.trim();
  const description = document.getElementById('description').value.trim();
  const priority = document.getElementById('priority').value;

  if (!category) { showToast('Please select a category.', 'error'); return; }
  if (!title) { showToast('Please enter a complaint title.', 'error'); return; }
  if (!description) { showToast('Please describe your complaint.', 'error'); return; }

  // Client-side moderation first (instant feedback)
  const tc = moderateContent(title, true);   // true = isTitle
  if (!tc.pass) { showToast('⚠️ ' + tc.reason, 'error'); setShield('blocked', tc.reason); return; }
  const bc = moderateContent(description);
  if (!bc.pass) { showToast('⚠️ ' + bc.reason, 'error'); setShield('blocked', bc.reason); return; }

  const btn = document.getElementById('submitBtn');
  btn.innerHTML = '<span class="spinner"></span> Submitting...';
  btn.disabled = true;

  try {
    const c = await apiCreateComplaint(category, title, description, priority);
    clearForm();
    loadFeed(currentFilter);
    loadStats();
    setShield('passed', 'Content approved. Complaint submitted!');
    showToast('✅ Submitted anonymously!', 'success');
  } catch (err) {
    showToast('⚠️ ' + (err.message || 'Submission failed.'), 'error');
    setShield('blocked', err.message || 'Server rejected the content.');
  } finally {
    btn.innerHTML = 'Submit Anonymously';
    btn.disabled = false;
  }
}

/* ── Detail modal ────────────────────────────────── */
async function openModal(id) {
  try {
    const all = await apiGetComplaints('all');
    const c = all.find(x => x.id === id);
    if (!c) return;
    const voted = c.voted;

    document.getElementById('modalMeta').innerHTML = `
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <span class="category-tag">${c.category}</span>
        <span class="status-badge ${c.status}">${labelStatus(c.status)}</span>
        
      </div>`;
    document.getElementById('modalTitle').textContent = c.title;
    document.getElementById('modalBody').textContent = c.body;
    document.getElementById('modalFooter').innerHTML = `
      <div style="font-size:12px;color:var(--muted)">${c.votes} votes · ${timeAgo(c.createdAt)} · ${c.priority} priority</div>
      <button class="btn ${voted ? 'btn-ghost' : 'btn-primary'}" id="modalVoteBtn"
        onclick="doVote(${c.id}); closeModal()">
        ${voted ? '✓ Already Voted' : '▲ Upvote'}
      </button>`;
    document.getElementById('modalOverlay').classList.add('open');
  } catch (_) { }
}

function closeModal() { document.getElementById('modalOverlay').classList.remove('open'); }

/* ── Filter ──────────────────────────────────────── */
function filterFeed(filter, el) {
  document.querySelectorAll('#feedFilters .filter-pill').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  loadFeed(filter);
}

/* ── Form helpers ────────────────────────────────── */
function toggleForm() {
  formVisible = !formVisible;
  document.getElementById('complaintForm').style.display = formVisible ? 'block' : 'none';
  document.getElementById('formToggleText').textContent = formVisible ? '▲ Hide' : '▼ Show';
}

function clearForm() {
  ['category', 'complaintTitle', 'description'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('priority').value = 'medium';
  document.getElementById('charCount').textContent = '0/500';
}

/* ── AI shield state ─────────────────────────────── */
function setShield(state, msg) {
  const shield = document.getElementById('aiShield');
  const text = document.getElementById('aiShieldText');
  if (state === 'blocked') {
    shield.style.cssText = 'background:rgba(250,74,74,0.08);border-color:rgba(250,74,74,0.3);color:var(--critical)';
    shield.querySelector('.shield-icon').textContent = '🚫';
    text.textContent = msg;
  } else {
    shield.style.cssText = 'background:rgba(109,250,189,0.06);border-color:rgba(109,250,189,0.2);color:var(--accent3)';
    shield.querySelector('.shield-icon').textContent = '✅';
    text.textContent = msg;
    setTimeout(() => {
      shield.style.cssText = '';
      shield.querySelector('.shield-icon').textContent = '🛡️';
      text.textContent = 'AI moderation active — content will be filtered for quality.';
    }, 3000);
  }
}