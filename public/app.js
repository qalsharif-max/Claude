// ---- Tiny helpers ----
const $ = (sel) => document.querySelector(sel);
const api = async (url, opts = {}) => {
  const res = await fetch(url, opts);
  if (res.status === 401) { showLogin(); throw new Error('unauthenticated'); }
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) throw new Error((data && data.error) || res.statusText);
  return data;
};
const toast = (msg, isError = false) => {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast' + (isError ? ' error' : '');
  setTimeout(() => t.classList.add('hidden'), 3200);
};

let people = [];
let documents = [];

// ---- Auth ----
async function init() {
  const me = await api('/api/me');
  if (me.authed) showApp(); else showLogin();
}
function showLogin() {
  $('#app').classList.add('hidden');
  $('#login-screen').classList.remove('hidden');
}
async function showApp() {
  $('#login-screen').classList.add('hidden');
  $('#app').classList.remove('hidden');
  await loadPeople();
  await loadDocuments();
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#login-error');
  err.classList.add('hidden');
  try {
    await api('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: $('#login-password').value }),
    });
    $('#login-password').value = '';
    showApp();
  } catch (e) {
    err.textContent = 'Incorrect password';
    err.classList.remove('hidden');
  }
});

$('#nav-logout').addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST' });
  showLogin();
});

// ---- Data loading ----
async function loadPeople() {
  people = await api('/api/people');
  const sel = $('#doc-person');
  sel.innerHTML = people.map((p) => `<option value="${p.id}">${esc(p.name)}${p.role ? ` — ${esc(p.role)}` : ''}</option>`).join('');
  const filter = $('#filter-person');
  filter.innerHTML = '<option value="">All people</option>' +
    people.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
}

async function loadDocuments() {
  documents = await api('/api/documents');
  render();
}

// ---- Render ----
function render() {
  renderStats();
  const q = $('#search').value.trim().toLowerCase();
  const fs = $('#filter-status').value;
  const fp = $('#filter-person').value;

  let list = documents.filter((d) => {
    if (fs && d.status !== fs) return false;
    if (fp && String(d.person_id) !== fp) return false;
    if (q) {
      const hay = `${d.person_name} ${d.person_role} ${d.doc_type} ${d.label || ''} ${d.issuing_country || ''} ${d.document_number || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  $('#empty').classList.toggle('hidden', documents.length !== 0);
  const container = $('#documents');

  // group by person
  const groups = {};
  for (const d of list) (groups[d.person_id] ||= { name: d.person_name, role: d.person_role, items: [] }).items.push(d);

  container.innerHTML = Object.values(groups).map((g) => `
    <div class="person-group">
      <h3>${esc(g.name)}${g.role ? ` · ${esc(g.role)}` : ''}</h3>
      ${g.items.map(cardHtml).join('')}
    </div>`).join('') || (documents.length ? '<p class="empty">No documents match your filters.</p>' : '');
}

function renderStats() {
  const total = documents.length;
  const expired = documents.filter((d) => d.status === 'expired').length;
  const expiring = documents.filter((d) => d.status === 'expiring').length;
  const ok = documents.filter((d) => d.status === 'ok').length;
  $('#stats').innerHTML = `
    <div class="stat"><div class="num">${total}</div><div class="lbl">Total documents</div></div>
    <div class="stat expired"><div class="num">${expired}</div><div class="lbl">Expired</div></div>
    <div class="stat expiring"><div class="num">${expiring}</div><div class="lbl">Expiring soon</div></div>
    <div class="stat ok"><div class="num">${ok}</div><div class="lbl">Valid</div></div>`;
}

function cardHtml(d) {
  const label = d.label ? `${esc(d.doc_type)} — ${esc(d.label)}` : esc(d.doc_type);
  const sub = [
    d.issuing_country && `🌍 ${esc(d.issuing_country)}`,
    d.document_number && `#${esc(d.document_number)}`,
    `Expires ${esc(d.expiry_date)}`,
  ].filter(Boolean).join(' &nbsp;·&nbsp; ');
  return `
    <div class="doc-card status-${d.status}">
      <div class="doc-main">
        <div class="doc-title">${label}</div>
        <div class="doc-sub">${sub}</div>
      </div>
      <div class="doc-right">
        <span class="badge ${d.status}">${statusText(d)}</span>
        ${d.file_path ? `<a class="link-btn" href="/api/documents/${d.id}/file" target="_blank">View file</a>` : ''}
        <button class="link-btn" data-edit="${d.id}">Edit / Renew</button>
        <button class="link-btn danger" data-del="${d.id}">Delete</button>
      </div>
    </div>`;
}

function statusText(d) {
  if (d.days_left < 0) return `Expired ${Math.abs(d.days_left)}d ago`;
  if (d.days_left === 0) return 'Expires today';
  if (d.status === 'expiring') return `${d.days_left}d left`;
  return `Valid · ${d.days_left}d`;
}

// ---- Filters ----
['#search', '#filter-status', '#filter-person'].forEach((s) => $(s).addEventListener('input', render));

// ---- Document modal ----
const docModal = $('#doc-modal');
function openDoc(doc = null) {
  $('#doc-form').reset();
  $('#doc-error').classList.add('hidden');
  $('#doc-id').value = doc ? doc.id : '';
  $('#doc-modal-title').textContent = doc ? 'Edit / renew document' : 'Add document';
  $('#current-file').textContent = doc && doc.file_name ? `Current file: ${doc.file_name} (upload a new one to replace)` : '';
  if (doc) {
    $('#doc-person').value = doc.person_id;
    $('#doc-type').value = doc.doc_type;
    $('#doc-label').value = doc.label || '';
    $('#doc-number').value = doc.document_number || '';
    $('#doc-country').value = doc.issuing_country || '';
    $('#doc-issue').value = doc.issue_date || '';
    $('#doc-expiry').value = doc.expiry_date;
    $('#doc-notes').value = doc.notes || '';
  }
  docModal.classList.remove('hidden');
}
$('#nav-add').addEventListener('click', () => openDoc());

document.addEventListener('click', (e) => {
  if (e.target.matches('[data-close]')) { docModal.classList.add('hidden'); $('#settings-modal').classList.add('hidden'); }
  const ed = e.target.getAttribute('data-edit');
  if (ed) openDoc(documents.find((d) => String(d.id) === ed));
  const del = e.target.getAttribute('data-del');
  if (del) deleteDoc(del);
});

$('#doc-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = $('#doc-id').value;
  const fd = new FormData();
  fd.append('person_id', $('#doc-person').value);
  fd.append('doc_type', $('#doc-type').value);
  fd.append('label', $('#doc-label').value);
  fd.append('document_number', $('#doc-number').value);
  fd.append('issuing_country', $('#doc-country').value);
  fd.append('issue_date', $('#doc-issue').value);
  fd.append('expiry_date', $('#doc-expiry').value);
  fd.append('notes', $('#doc-notes').value);
  const file = $('#doc-file').files[0];
  if (file) fd.append('file', file);

  const btn = $('#doc-save');
  btn.disabled = true;
  try {
    await api(id ? `/api/documents/${id}` : '/api/documents', { method: id ? 'PUT' : 'POST', body: fd });
    docModal.classList.add('hidden');
    await loadDocuments();
    toast(id ? 'Document updated' : 'Document added');
  } catch (err) {
    const el = $('#doc-error');
    el.textContent = err.message;
    el.classList.remove('hidden');
  } finally {
    btn.disabled = false;
  }
});

async function deleteDoc(id) {
  const d = documents.find((x) => String(x.id) === String(id));
  if (!confirm(`Delete "${d.doc_type}${d.label ? ' — ' + d.label : ''}" for ${d.person_name}? This also removes the uploaded file.`)) return;
  await api(`/api/documents/${id}`, { method: 'DELETE' });
  await loadDocuments();
  toast('Document deleted');
}

// ---- Settings ----
const setModal = $('#settings-modal');
$('#nav-settings').addEventListener('click', async () => {
  const s = await api('/api/settings');
  $('#set-email').value = s.email_to || '';
  $('#set-lead').value = s.lead_days;
  $('#set-interval').value = s.interval_days;
  const banner = $('#email-status');
  if (s.email_configured) {
    banner.className = 'banner';
    banner.innerHTML = `✅ Resend is connected. Reminders go to: <strong>${esc(s.recipients.join(', ') || '—')}</strong>`;
  } else {
    banner.className = 'banner warn';
    banner.innerHTML = '⚠️ No Resend API key set — running in <strong>log-only</strong> mode. Add <code>RESEND_API_KEY</code> to your <code>.env</code> to send real emails.';
  }
  $('#settings-msg').textContent = '';
  setModal.classList.remove('hidden');
});

$('#settings-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  await api('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email_to: $('#set-email').value,
      lead_days: Number($('#set-lead').value),
      interval_days: Number($('#set-interval').value),
    }),
  });
  setModal.classList.add('hidden');
  toast('Settings saved');
});

$('#btn-test').addEventListener('click', async () => {
  $('#settings-msg').textContent = 'Sending test email…';
  try {
    const r = await api('/api/test-email', { method: 'POST' });
    $('#settings-msg').textContent = r.ok
      ? (r.mode === 'log-only' ? 'Log-only mode: check the server console for the test message.' : 'Test email sent! Check your inbox.')
      : `Failed: ${r.error}`;
  } catch (e) { $('#settings-msg').textContent = 'Failed: ' + e.message; }
});

$('#btn-preview').addEventListener('click', async () => {
  const r = await api('/api/reminders/run?preview=1', { method: 'POST' });
  if (!r.due.length) { $('#settings-msg').textContent = 'No documents are currently due for a reminder.'; return; }
  $('#settings-msg').textContent = `${r.due.length} document(s) due now: ` +
    r.due.map((d) => `${d.person_name} – ${d.doc_type} (${d.days_left}d)`).join('; ');
});

function esc(s = '') {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

init().catch((e) => { if (e.message !== 'unauthenticated') console.error(e); });
