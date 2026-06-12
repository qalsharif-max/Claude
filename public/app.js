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
  try {
    const s = await api('/api/settings');
    $('#nav-sync').classList.toggle('hidden', !s.source_configured);
  } catch (e) { /* ignore */ }
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
    if (fs === 'review') {
      if (d.review_status !== 'pending') return false;
    } else if (fs && d.status !== fs) return false;
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
  const pending = documents.filter((d) => d.review_status === 'pending').length;
  $('#stats').innerHTML = `
    <div class="stat"><div class="num">${total}</div><div class="lbl">Total documents</div></div>
    <div class="stat expired"><div class="num">${expired}</div><div class="lbl">Expired</div></div>
    <div class="stat expiring"><div class="num">${expiring}</div><div class="lbl">Expiring soon</div></div>
    <div class="stat ok"><div class="num">${ok}</div><div class="lbl">Valid</div></div>
    ${pending ? `<div class="stat review"><div class="num">${pending}</div><div class="lbl">Needs review</div></div>` : ''}`;
}

function cardHtml(d) {
  const pending = d.review_status === 'pending';
  const label = d.label ? `${esc(d.doc_type)} — ${esc(d.label)}` : esc(d.doc_type);
  const hijri = d.expiry_hijri || Hijri.gregorianToHijriString(d.expiry_date);
  const sub = [
    d.issuing_country && `🌍 ${esc(d.issuing_country)}`,
    d.document_number && `#${esc(d.document_number)}`,
    `Expires ${esc(d.expiry_date)}${hijri ? ` <span class="muted">(${esc(hijri)} هـ)</span>` : ''}`,
    d.source === 'drive' && `<span class="muted">📥 from Drive</span>`,
  ].filter(Boolean).join(' &nbsp;·&nbsp; ');
  const cost = d.ai_cost > 0 ? ` · AI cost: $${Number(d.ai_cost).toFixed(4)}` : '';
  const reviewNote = pending
    ? `<div class="doc-sub" style="color:var(--warn)">⚠️ Auto-imported${d.ai_confidence ? ` · AI confidence: ${esc(d.ai_confidence)}` : ''}${cost}. Check the details${d.extracted_name ? ` (read name: “${esc(d.extracted_name)}”)` : ''}, then confirm.</div>`
    : '';
  return `
    <div class="doc-card status-${pending ? 'review' : d.status}">
      <div class="doc-main">
        <div class="doc-title">${label}</div>
        <div class="doc-sub">${sub}</div>
        ${reviewNote}
      </div>
      <div class="doc-right">
        <span class="badge ${pending ? 'review' : d.status}">${pending ? 'Needs review' : statusText(d)}</span>
        ${d.file_path ? `<a class="link-btn" href="/api/documents/${d.id}/file" target="_blank">View file</a>` : ''}
        <button class="link-btn" data-edit="${d.id}">${pending ? 'Review & confirm' : 'Edit / Renew'}</button>
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

// ---- Date fields with Gregorian/Hijri toggle ----
const dateFields = {};
function makeDateField(container) {
  container.innerHTML = `
    <div class="cal-toggle">
      <button type="button" class="cal-btn active" data-cal="greg">Gregorian</button>
      <button type="button" class="cal-btn" data-cal="hijri">Hijri هـ</button>
    </div>
    <input type="date" class="greg-input" />
    <div class="hijri-input hidden">
      <input type="number" class="hy" placeholder="Year (e.g. 1448)" min="1300" max="1700" />
      <span>/</span>
      <input type="number" class="hm" placeholder="Mo" min="1" max="12" />
      <span>/</span>
      <input type="number" class="hd" placeholder="Day" min="1" max="30" />
    </div>
    <div class="conv-note small"></div>`;

  const greg = container.querySelector('.greg-input');
  const box = container.querySelector('.hijri-input');
  const hy = container.querySelector('.hy');
  const hm = container.querySelector('.hm');
  const hd = container.querySelector('.hd');
  const note = container.querySelector('.conv-note');
  let mode = 'greg';

  function refresh() {
    if (mode === 'hijri') {
      greg.value = Hijri.hijriToGregorianISO(hy.value, hm.value, hd.value);
      note.textContent = greg.value ? `→ Gregorian: ${greg.value}` : '';
    } else {
      note.textContent = greg.value ? `→ Hijri: ${Hijri.gregorianToHijriString(greg.value)} هـ` : '';
    }
  }
  function setMode(m) {
    mode = m;
    container.querySelectorAll('.cal-btn').forEach((b) => b.classList.toggle('active', b.dataset.cal === m));
    box.classList.toggle('hidden', m !== 'hijri');
    greg.classList.toggle('hidden', m === 'hijri');
    refresh();
  }
  container.querySelectorAll('.cal-btn').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.cal)));
  [greg, hy, hm, hd].forEach((el) => el.addEventListener('input', refresh));

  const api = {
    get value() { return greg.value; },
    get hijri() {
      return mode === 'hijri' && hy.value && hm.value && hd.value
        ? `${hy.value}/${String(hm.value).padStart(2, '0')}/${String(hd.value).padStart(2, '0')}`
        : '';
    },
    reset() { greg.value = ''; hy.value = hm.value = hd.value = ''; note.textContent = ''; setMode('greg'); },
    set(gregIso, hijriStr) {
      this.reset();
      if (hijriStr) {
        const [y, m, d] = hijriStr.split('/').map(Number);
        hy.value = y; hm.value = m; hd.value = d;
        setMode('hijri');
      } else if (gregIso) {
        greg.value = gregIso;
        refresh();
      }
    },
  };
  dateFields[container.dataset.prefix] = api;
  return api;
}
document.querySelectorAll('.datefield').forEach(makeDateField);

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
    dateFields['doc-issue'].set(doc.issue_date, doc.issue_hijri);
    dateFields['doc-expiry'].set(doc.expiry_date, doc.expiry_hijri);
    $('#doc-notes').value = doc.notes || '';
  } else {
    dateFields['doc-issue'].reset();
    dateFields['doc-expiry'].reset();
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
  fd.append('issue_date', dateFields['doc-issue'].value);
  fd.append('issue_hijri', dateFields['doc-issue'].hijri);
  fd.append('expiry_date', dateFields['doc-expiry'].value);
  fd.append('expiry_hijri', dateFields['doc-expiry'].hijri);
  fd.append('notes', $('#doc-notes').value);
  const file = $('#doc-file').files[0];
  if (file) fd.append('file', file);

  if (!dateFields['doc-expiry'].value) {
    const el = $('#doc-error');
    el.textContent = 'A valid expiry date is required.';
    el.classList.remove('hidden');
    return;
  }
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

  const src = $('#source-status');
  if (s.source_configured) {
    const ai = s.extraction_configured
      ? 'AI extraction is on (expiry dates read automatically).'
      : '<strong>AI extraction is off</strong> — synced files import but you fill in their dates. Add <code>ANTHROPIC_API_KEY</code> to enable it.';
    src.className = 'banner';
    const spend = s.ai_cost_total > 0 ? `<br>Total AI extraction cost so far: <strong>$${Number(s.ai_cost_total).toFixed(4)}</strong>.` : '';
    src.innerHTML = `✅ Connected to <strong>${esc(s.source_name)}</strong> · ${esc(s.source_folder)}.<br>${ai}${spend}`;
  } else {
    src.className = 'banner warn';
    src.innerHTML = '⚠️ No cloud source connected. Configure <strong>Google Drive</strong> (or Dropbox) in your <code>.env</code> to auto-import documents. See the README.';
  }
  $('#settings-msg').textContent = '';
  setModal.classList.remove('hidden');
});

async function runSync(btn) {
  const original = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '⟳ Syncing…'; }
  $('#settings-msg') && ($('#settings-msg').textContent = 'Syncing… (this can take a moment while documents are read)');
  try {
    const r = await api('/api/sync', { method: 'POST' });
    await loadDocuments();
    if (!r.configured) {
      toast('No cloud source configured — see Settings/README', true);
    } else {
      const msg = `Synced ${r.source || ''}: ${r.added} new, ${r.updated} updated${r.errors.length ? `, ${r.errors.length} error(s)` : ''}`;
      toast(msg);
      if ($('#settings-msg')) $('#settings-msg').textContent = msg + (r.errors.length ? ` — ${r.errors[0]}` : '');
    }
  } catch (e) {
    toast('Sync failed: ' + e.message, true);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = original; }
  }
}
$('#nav-sync').addEventListener('click', () => runSync($('#nav-sync')));
$('#btn-sync').addEventListener('click', () => runSync($('#btn-sync')));

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
