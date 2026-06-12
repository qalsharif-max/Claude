import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'tracker.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS people (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    role       TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS documents (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    person_id       INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
    doc_type        TEXT NOT NULL,
    label           TEXT,
    document_number TEXT,
    issuing_country TEXT,
    issue_date      TEXT,
    expiry_date     TEXT NOT NULL,
    file_path       TEXT,
    file_name       TEXT,
    notes           TEXT,
    last_reminded_at TEXT,
    reminder_count  INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS reminder_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER,
    sent_to     TEXT,
    sent_at     TEXT NOT NULL DEFAULT (datetime('now')),
    days_left   INTEGER,
    status      TEXT
  );
`);

// --- Seed the family (only on a fresh database) ---
const FAMILY = [
  { name: 'Qutaibah Alsharif', role: 'Father' },
  { name: 'Yasminah Hashim', role: 'Mother' },
  { name: 'Malak Alsharif', role: 'Daughter' },
  { name: 'Omar Alsharif', role: 'Son' },
  { name: 'Lama Alsharif', role: 'Daughter' },
  { name: 'Taliah Alsharif', role: 'Daughter' },
];

const peopleCount = db.prepare('SELECT COUNT(*) AS n FROM people').get().n;
if (peopleCount === 0) {
  const insert = db.prepare('INSERT INTO people (name, role) VALUES (?, ?)');
  const seed = db.transaction((rows) => {
    for (const p of rows) insert.run(p.name, p.role);
  });
  seed(FAMILY);
}

// --- Settings helpers ---
export function getSetting(key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

export function setSetting(key, value) {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, value == null ? null : String(value));
}

export default db;
