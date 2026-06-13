// Minimal Dropbox API v2 client using the refresh-token OAuth flow.
// Configure in .env:
//   DROPBOX_APP_KEY, DROPBOX_APP_SECRET, DROPBOX_REFRESH_TOKEN, DROPBOX_FOLDER
//
// How to get a refresh token (one-time, see README): create a "scoped app" at
// https://www.dropbox.com/developers/apps with files.metadata.read +
// files.content.read, then do the OAuth code flow with token_access_type=offline.

let cachedToken = null;
let cachedExpiry = 0;

export const name = 'Dropbox';

export function folderLabel() {
  return dropboxFolder() || '/ (app root)';
}

// Alias used by the generic source interface.
export { isDropboxConfigured as isConfigured };

export function isDropboxConfigured() {
  return Boolean(
    process.env.DROPBOX_APP_KEY &&
      process.env.DROPBOX_APP_SECRET &&
      process.env.DROPBOX_REFRESH_TOKEN
  );
}

export function dropboxFolder() {
  let f = (process.env.DROPBOX_FOLDER || '').trim();
  if (!f || f === '/') return ''; // Dropbox uses "" for the root of the app folder
  if (!f.startsWith('/')) f = '/' + f;
  return f.replace(/\/$/, '');
}

async function getAccessToken() {
  if (cachedToken && Date.now() < cachedExpiry - 60_000) return cachedToken;

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: process.env.DROPBOX_REFRESH_TOKEN,
    client_id: process.env.DROPBOX_APP_KEY,
    client_secret: process.env.DROPBOX_APP_SECRET,
  });
  const res = await fetch('https://api.dropbox.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    throw new Error(`Dropbox token refresh failed (${res.status}): ${await res.text()}`);
  }
  const json = await res.json();
  cachedToken = json.access_token;
  cachedExpiry = Date.now() + (json.expires_in || 14400) * 1000;
  return cachedToken;
}

/** List all files (recursively) in the configured folder. */
export async function listFiles() {
  const token = await getAccessToken();
  const files = [];

  let res = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: dropboxFolder(), recursive: true, limit: 2000 }),
  });
  if (!res.ok) throw new Error(`Dropbox list_folder failed (${res.status}): ${await res.text()}`);
  let json = await res.json();

  const collect = (entries) => {
    for (const e of entries) {
      if (e['.tag'] === 'file') {
        files.push({ id: e.id, name: e.name, rev: e.rev, ref: e.path_lower });
      }
    }
  };
  collect(json.entries);

  while (json.has_more) {
    res = await fetch('https://api.dropboxapi.com/2/files/list_folder/continue', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ cursor: json.cursor }),
    });
    if (!res.ok) throw new Error(`Dropbox list_folder/continue failed (${res.status}): ${await res.text()}`);
    json = await res.json();
    collect(json.entries);
  }
  return files;
}

/** Download a file by its Dropbox path. Returns a Buffer. */
export async function downloadFile(path) {
  const token = await getAccessToken();
  const res = await fetch('https://content.dropboxapi.com/2/files/download', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Dropbox-API-Arg': JSON.stringify({ path }),
    },
  });
  if (!res.ok) throw new Error(`Dropbox download failed (${res.status}): ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}
