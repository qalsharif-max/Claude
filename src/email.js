import { getSetting } from './db.js';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/**
 * Returns the configured recipient list. Settings (saved in the app) take
 * precedence over the EMAIL_TO environment variable.
 */
export function getRecipients() {
  const fromSettings = getSetting('email_to');
  const raw = (fromSettings || process.env.EMAIL_TO || '').trim();
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

/**
 * Send an email through Resend. If no RESEND_API_KEY is set the message is
 * logged to the console instead, so the app is fully usable before you wire
 * up a real provider.
 *
 * @returns {Promise<{ok: boolean, mode: string, error?: string}>}
 */
export async function sendEmail({ to, subject, html, text }) {
  const recipients = Array.isArray(to) ? to : [to];
  const from = process.env.EMAIL_FROM || 'Document Reminders <onboarding@resend.dev>';

  if (!isEmailConfigured()) {
    console.log('\n[email:log-only] RESEND_API_KEY not set — email not actually sent.');
    console.log(`  To:      ${recipients.join(', ')}`);
    console.log(`  Subject: ${subject}`);
    console.log(`  Body:\n${text || stripHtml(html)}\n`);
    return { ok: true, mode: 'log-only' };
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: recipients, subject, html, text }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`[email] Resend error ${res.status}: ${body}`);
      return { ok: false, mode: 'resend', error: `${res.status}: ${body}` };
    }
    return { ok: true, mode: 'resend' };
  } catch (err) {
    console.error('[email] Failed to send via Resend:', err);
    return { ok: false, mode: 'resend', error: String(err) };
  }
}

function stripHtml(html = '') {
  return html.replace(/<[^>]+>/g, '').replace(/\n{3,}/g, '\n\n').trim();
}
