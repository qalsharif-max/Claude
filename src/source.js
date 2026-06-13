// Generic cloud-source interface. Picks whichever provider you've configured
// in .env — Google Drive is preferred if both are set.
//
// Each provider exposes: name, isConfigured(), folderLabel(), listFiles(), downloadFile(ref).
// listFiles() returns objects shaped { id, name, rev, ref }:
//   id  - stable file id (used to match across syncs)
//   rev - changes when the file content changes (used to detect replacements)
//   ref - what downloadFile() needs to fetch the bytes
import * as google from './sources/google.js';
import * as dropbox from './dropbox.js';

const PROVIDERS = [google, dropbox];

export function activeSource() {
  return PROVIDERS.find((p) => p.isConfigured()) || null;
}

export function isSourceConfigured() {
  return Boolean(activeSource());
}

export function sourceName() {
  const s = activeSource();
  return s ? s.name : null;
}

export function folderLabel() {
  const s = activeSource();
  return s ? s.folderLabel() : '';
}

export async function listFiles() {
  const s = activeSource();
  if (!s) throw new Error('No cloud source configured.');
  return s.listFiles();
}

export async function downloadFile(ref) {
  const s = activeSource();
  if (!s) throw new Error('No cloud source configured.');
  return s.downloadFile(ref);
}
