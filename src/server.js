import 'dotenv/config';
import express from 'express';
import cookieSession from 'cookie-session';
import multer from 'multer';
import cron from 'node-cron';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import db, { getSetting, setSetting } from './db.js';
import { checkPassword, requireAuth } from './auth.js';
import { sendEmail, getRecipients, isEmailConfigured } from './email.js';
import { runReminders, daysUntil, statusFor, leadDays, intervalDays } from './reminders.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const UPLOAD_DIR = path.join(ROOT, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  cookieSession({
    name: 'doc_tracker',
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  })
);

// --- File uploads ---
const ALLOWED = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/heic',
]);
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (req, file, cb) => {
    if (ALLOWED.has(file.mimetype)) return cb(null, true);
    cb(new Error('Unsupported file type. Use PDF, PNG, JPG, WEBP or HEIC.'));
  },
});

// --- Auth routes ---
app.post('/api/login', (req, res) => {
  if (checkPassword(req.body.password)) {
    req.session.authed = true;
    return res.json({ ok: true });
  }
  return res.status(401).json({ error: 'Incorrect password' });
});

app.post('/api/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  res.json({ authed: Boolean(req.session && req.session.authed), emailConfigured: isEmailConfigured() });
});

// Everything below requires auth.
app.use('/api', requireAuth);

// --- People ---
app.get('/api/people', (req, res) => {
  res.json(db.prepare('SELECT * FROM people ORDER BY id').all());
});

app.post('/api/people', (req, res) => {
  const { name, role } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
  const info = db.prepare('INSERT INTO people (name, role) VALUES (?, ?)').run(name.trim(), (role || '').trim());
  res.json(db.prepare('SELECT * FROM people WHERE id = ?').get(info.lastInsertRowid));
});

app.delete('/api/people/:id', (req, res) => {
  db.prepare('DELETE FROM people WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// --- Documents ---
function withStatus(doc) {
  const daysLeft = daysUntil(doc.expiry_date);
  return { ...doc, days_left: daysLeft, status: statusFor(daysLeft) };
}

app.get('/api/documents', (req, res) => {
  const rows = db
    .prepare(
      `SELECT d.*, p.name AS person_name, p.role AS person_role
         FROM documents d JOIN people p ON p.id = d.person_id
        ORDER BY d.expiry_date ASC`
    )
    .all();
  res.json(rows.map(withStatus));
});

const docFields = (body) => ({
  person_id: body.person_id,
  doc_type: (body.doc_type || '').trim(),
  label: (body.label || '').trim() || null,
  document_number: (body.document_number || '').trim() || null,
  issuing_country: (body.issuing_country || '').trim() || null,
  issue_date: (body.issue_date || '').trim() || null,
  expiry_date: (body.expiry_date || '').trim(),
  notes: (body.notes || '').trim() || null,
});

app.post('/api/documents', upload.single('file'), (req, res) => {
  const f = docFields(req.body);
  if (!f.person_id) return res.status(400).json({ error: 'Person is required' });
  if (!f.doc_type) return res.status(400).json({ error: 'Document type is required' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.expiry_date)) return res.status(400).json({ error: 'A valid expiry date is required' });

  const info = db
    .prepare(
      `INSERT INTO documents
        (person_id, doc_type, label, document_number, issuing_country, issue_date, expiry_date, notes, file_path, file_name)
       VALUES (@person_id, @doc_type, @label, @document_number, @issuing_country, @issue_date, @expiry_date, @notes, @file_path, @file_name)`
    )
    .run({
      ...f,
      file_path: req.file ? req.file.filename : null,
      file_name: req.file ? req.file.originalname : null,
    });
  res.json(withStatus(db.prepare('SELECT * FROM documents WHERE id = ?').get(info.lastInsertRowid)));
});

app.put('/api/documents/:id', upload.single('file'), (req, res) => {
  const existing = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const f = docFields(req.body);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.expiry_date)) return res.status(400).json({ error: 'A valid expiry date is required' });

  // If a new file is uploaded OR the expiry date changed, treat this as a
  // renewal and reset the reminder cycle so monthly nudges stop.
  const renewed = Boolean(req.file) || f.expiry_date !== existing.expiry_date;

  let filePath = existing.file_path;
  let fileName = existing.file_name;
  if (req.file) {
    if (existing.file_path) {
      fs.rm(path.join(UPLOAD_DIR, existing.file_path), { force: true }, () => {});
    }
    filePath = req.file.filename;
    fileName = req.file.originalname;
  }

  db.prepare(
    `UPDATE documents SET
       person_id=@person_id, doc_type=@doc_type, label=@label, document_number=@document_number,
       issuing_country=@issuing_country, issue_date=@issue_date, expiry_date=@expiry_date, notes=@notes,
       file_path=@file_path, file_name=@file_name,
       updated_at=datetime('now')
       ${renewed ? ', last_reminded_at=NULL, reminder_count=0' : ''}
     WHERE id=@id`
  ).run({ ...f, id: req.params.id, file_path: filePath, file_name: fileName });

  res.json(withStatus(db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id)));
});

app.delete('/api/documents/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  if (existing && existing.file_path) {
    fs.rm(path.join(UPLOAD_DIR, existing.file_path), { force: true }, () => {});
  }
  db.prepare('DELETE FROM documents WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.get('/api/documents/:id/file', (req, res) => {
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  if (!doc || !doc.file_path) return res.status(404).json({ error: 'No file' });
  res.download(path.join(UPLOAD_DIR, doc.file_path), doc.file_name || 'document');
});

// --- Settings ---
app.get('/api/settings', (req, res) => {
  res.json({
    email_to: getSetting('email_to') || process.env.EMAIL_TO || '',
    lead_days: leadDays(),
    interval_days: intervalDays(),
    email_configured: isEmailConfigured(),
    recipients: getRecipients(),
  });
});

app.put('/api/settings', (req, res) => {
  if (req.body.email_to !== undefined) setSetting('email_to', req.body.email_to);
  if (req.body.lead_days !== undefined) setSetting('lead_days', req.body.lead_days);
  if (req.body.interval_days !== undefined) setSetting('interval_days', req.body.interval_days);
  res.json({ ok: true });
});

// --- Reminders (manual trigger + preview + test email) ---
app.post('/api/reminders/run', async (req, res) => {
  const dryRun = req.query.preview === '1';
  const result = await runReminders({ dryRun });
  res.json(result);
});

app.post('/api/test-email', async (req, res) => {
  const recipients = getRecipients();
  if (recipients.length === 0) return res.status(400).json({ error: 'No recipient email configured.' });
  const result = await sendEmail({
    to: recipients,
    subject: 'Test email from your Document Expiry Tracker',
    html: '<p>This is a test email. If you received it, reminders are configured correctly. ✅</p>',
    text: 'This is a test email. If you received it, reminders are configured correctly.',
  });
  res.json(result);
});

// --- Static frontend ---
app.use(express.static(path.join(ROOT, 'public')));

// --- Scheduler ---
const hour = Number(process.env.REMINDER_CRON_HOUR ?? 9);
const minute = Number(process.env.REMINDER_CRON_MINUTE ?? 0);
cron.schedule(`${minute} ${hour} * * *`, async () => {
  console.log(`[scheduler] Running daily reminder check at ${new Date().toISOString()}`);
  const result = await runReminders();
  if (result.due.length) {
    console.log(`[scheduler] ${result.due.length} document(s) due. Sent: ${result.sent} (${result.mode || result.error})`);
  } else {
    console.log('[scheduler] No documents due for a reminder.');
  }
});

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => {
  console.log(`Document Expiry Tracker running at http://localhost:${PORT}`);
  console.log(`Email mode: ${isEmailConfigured() ? 'Resend (live)' : 'log-only (set RESEND_API_KEY to send real emails)'}`);
  console.log(`Daily reminder check scheduled for ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} server time.`);
});
