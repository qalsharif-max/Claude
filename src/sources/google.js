// Google Drive source using a service account (server-to-server, no interactive
// OAuth). Configure in .env:
//   GOOGLE_CLIENT_EMAIL   - the service account email
//   GOOGLE_PRIVATE_KEY    - its private key (PEM; \n escapes are handled)
//   GOOGLE_DRIVE_FOLDER_ID- the Drive folder to watch (shared with the service account)
// or, instead of CLIENT_EMAIL/PRIVATE_KEY:
//   GOOGLE_SERVICE_ACCOUNT_FILE - path to the downloaded service-account JSON
import crypto from 'node:crypto';
import fs from 'node:fs';

export const name = 'Google Drive';

function credentials() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_FILE) {
    const json = JSON.parse(fs.readFileSync(process.env.GOOGLE_SERVICE_ACCOUNT_FILE, 'utf8'));
    return { client_email: json.client_email, private_key: json.private_key };
  }
  return {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  };
}

export function isConfigured() {
  if (!process.env.GOOGLE_DRIVE_FOLDER_ID) return false;
  const c = credentials();
  return Boolean(c.client_email && c.private_key);
}

export function folderLabel() {
  return `Drive folder ${process.env.GOOGLE_DRIVE_FOLDER_ID || '(unset)'}`;
}

let cachedToken = null;
let cachedExpiry = 0;

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function getAccessToken() {
  if (cachedToken && Date.now() < cachedExpiry - 60_000) return cachedToken;
  const { client_email, private_key } = credentials();
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64url(
    JSON.stringify({
      iss: client_email,
      scope: 'https://www.googleapis.com/auth/drive.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })
  );
  const signingInput = `${header}.${claim}`;
  const signature = crypto
    .sign('RSA-SHA256', Buffer.from(signingInput), private_key)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  const jwt = `${signingInput}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error(`Google token request failed (${res.status}): ${await res.text()}`);
  const json = await res.json();
  cachedToken = json.access_token;
  cachedExpiry = Date.now() + (json.expires_in || 3600) * 1000;
  return cachedToken;
}

/** List files in the configured Drive folder. Returns {id, name, rev, ref}. */
export async function listFiles() {
  const token = await getAccessToken();
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  const files = [];
  let pageToken = '';

  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id, name, mimeType, md5Checksum, modifiedTime)',
      pageSize: '1000',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
    });
    if (pageToken) params.set('pageToken', pageToken);

    const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Google Drive list failed (${res.status}): ${await res.text()}`);
    const json = await res.json();
    for (const f of json.files || []) {
      // Skip Google-native docs (no binary download); we want uploaded PDFs/images.
      if ((f.mimeType || '').startsWith('application/vnd.google-apps')) continue;
      files.push({ id: f.id, name: f.name, rev: f.md5Checksum || f.modifiedTime, ref: f.id });
    }
    pageToken = json.nextPageToken || '';
  } while (pageToken);

  return files;
}

/** Download a file by its Drive file id. Returns a Buffer. */
export async function downloadFile(fileId) {
  const token = await getAccessToken();
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`Google Drive download failed (${res.status}): ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}
