import db, { getSetting } from './db.js';
import { sendEmail, getRecipients } from './email.js';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export function leadDays() {
  return Number(getSetting('lead_days') || process.env.REMINDER_LEAD_DAYS || 183);
}

export function intervalDays() {
  return Number(getSetting('interval_days') || process.env.REMINDER_INTERVAL_DAYS || 30);
}

/** Whole days from today until the given YYYY-MM-DD date (negative = already expired). */
export function daysUntil(dateStr, now = new Date()) {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1, d));
  return Math.round((target - today) / MS_PER_DAY);
}

export function statusFor(daysLeft, lead = leadDays()) {
  if (daysLeft < 0) return 'expired';
  if (daysLeft <= lead) return 'expiring';
  return 'ok';
}

/**
 * Decide whether a document is due for a reminder right now.
 * Rule: send the first reminder once it is within `lead` days of expiry
 * (this also covers already-expired docs), then re-send every `interval`
 * days until the document is renewed (which resets last_reminded_at).
 */
export function isDue(doc, now = new Date(), lead = leadDays(), interval = intervalDays()) {
  const daysLeft = daysUntil(doc.expiry_date, now);
  if (daysLeft > lead) return false;
  if (!doc.last_reminded_at) return true;
  const since = daysUntil(doc.last_reminded_at, now); // negative number of days ago
  return Math.abs(since) >= interval;
}

/**
 * Run the reminder check. Finds every document due for a reminder, sends a
 * single digest email listing them, and records that they were reminded.
 *
 * @param {object} opts
 * @param {boolean} opts.dryRun  If true, do not send or record anything.
 * @returns {Promise<{due: object[], sent: boolean, mode?: string, error?: string, recipients: string[]}>}
 */
export async function runReminders({ dryRun = false } = {}) {
  const now = new Date();
  const lead = leadDays();
  const interval = intervalDays();

  const rows = db
    .prepare(
      `SELECT d.*, p.name AS person_name, p.role AS person_role
         FROM documents d JOIN people p ON p.id = d.person_id
        WHERE d.review_status IS NULL OR d.review_status = 'confirmed'
        ORDER BY d.expiry_date ASC`
    )
    .all();

  const due = rows
    .filter((doc) => isDue(doc, now, lead, interval))
    .map((doc) => ({ ...doc, days_left: daysUntil(doc.expiry_date, now) }));

  const recipients = getRecipients();

  if (due.length === 0) {
    return { due: [], sent: false, recipients };
  }

  if (dryRun) {
    return { due, sent: false, mode: 'dry-run', recipients };
  }

  if (recipients.length === 0) {
    return { due, sent: false, error: 'No recipient email configured.', recipients };
  }

  const { subject, html, text } = buildDigest(due);
  const result = await sendEmail({ to: recipients, subject, html, text });

  if (result.ok) {
    const today = now.toISOString().slice(0, 10);
    const mark = db.prepare(
      'UPDATE documents SET last_reminded_at = ?, reminder_count = reminder_count + 1 WHERE id = ?'
    );
    const log = db.prepare(
      'INSERT INTO reminder_log (document_id, sent_to, days_left, status) VALUES (?, ?, ?, ?)'
    );
    const tx = db.transaction(() => {
      for (const doc of due) {
        mark.run(today, doc.id);
        log.run(doc.id, recipients.join(', '), doc.days_left, result.mode);
      }
    });
    tx();
  }

  return { due, sent: result.ok, mode: result.mode, error: result.error, recipients };
}

function describe(doc) {
  const left = doc.days_left;
  const when =
    left < 0
      ? `EXPIRED ${Math.abs(left)} day(s) ago`
      : left === 0
        ? 'expires TODAY'
        : `expires in ${left} day(s)`;
  const label = doc.label ? `${doc.doc_type} — ${doc.label}` : doc.doc_type;
  return { label, when };
}

export function buildDigest(due) {
  const count = due.length;
  const subject =
    count === 1
      ? `Reminder: ${due[0].person_name}'s ${due[0].doc_type} ${due[0].days_left < 0 ? 'has expired' : 'is expiring soon'}`
      : `Reminder: ${count} documents need your attention`;

  const rows = due
    .map((doc) => {
      const { label, when } = describe(doc);
      return `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee">${escapeHtml(doc.person_name)}<br><span style="color:#888;font-size:12px">${escapeHtml(doc.person_role || '')}</span></td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee">${escapeHtml(label)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee">${escapeHtml(doc.expiry_date)}${doc.expiry_hijri ? `<br><span style="color:#888;font-size:12px">${escapeHtml(doc.expiry_hijri)} هـ</span>` : ''}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;color:${doc.days_left < 0 ? '#c0392b' : '#b9770e'};font-weight:600">${when}</td>
      </tr>`;
    })
    .join('');

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:640px;margin:auto">
    <h2 style="color:#1a1a2e">Document expiry reminder</h2>
    <p>The following document(s) are within their renewal window. You'll keep getting a monthly reminder for each one until you upload its replacement in the tracker.</p>
    <table style="border-collapse:collapse;width:100%;font-size:14px">
      <thead><tr style="text-align:left;background:#f6f6fa">
        <th style="padding:8px 12px">Person</th>
        <th style="padding:8px 12px">Document</th>
        <th style="padding:8px 12px">Expiry date</th>
        <th style="padding:8px 12px">Status</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="color:#888;font-size:12px;margin-top:24px">Sent by your Document Expiry Tracker.</p>
  </div>`;

  const text =
    'Document expiry reminder\n\n' +
    due
      .map((doc) => {
        const { label, when } = describe(doc);
        const exp = doc.expiry_hijri ? `${doc.expiry_date} (${doc.expiry_hijri} هـ)` : doc.expiry_date;
        return `- ${doc.person_name} (${doc.person_role || ''}): ${label} — expiry ${exp} — ${when}`;
      })
      .join('\n') +
    "\n\nYou'll keep getting a monthly reminder for each one until you upload its replacement in the tracker.";

  return { subject, html, text };
}

function escapeHtml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
