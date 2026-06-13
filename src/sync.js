import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import db, { matchOrUnassignedPerson } from './db.js';
import { isSourceConfigured, sourceName, listFiles, downloadFile } from './source.js';
import { extractDocument, isExtractionConfigured, mediaTypeFor } from './extract.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

function saveBuffer(buffer, originalName) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const ext = path.extname(originalName) || '';
  const filename = `${crypto.randomUUID()}${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer);
  return filename;
}

/**
 * Pull documents from the configured cloud source (Google Drive or Dropbox),
 * extract their details with Claude, and upsert them as "pending review".
 *
 * @returns {Promise<{added:number, updated:number, skipped:number, errors:string[], configured:boolean, source:string|null}>}
 */
export async function syncSource() {
  const result = { added: 0, updated: 0, skipped: 0, errors: [], configured: true, source: sourceName() };

  if (!isSourceConfigured()) {
    return { ...result, configured: false, source: null, errors: ['No cloud source configured. Set Google Drive or Dropbox credentials in .env.'] };
  }

  let files;
  try {
    files = await listFiles();
  } catch (err) {
    return { ...result, errors: [String(err.message || err)] };
  }

  const findByFileId = db.prepare('SELECT * FROM documents WHERE source_file_id = ?');

  for (const file of files) {
    if (!mediaTypeFor(file.name)) {
      result.skipped++;
      continue;
    }
    const existing = findByFileId.get(file.id);
    if (existing && existing.source_rev === file.rev) {
      result.skipped++;
      continue; // unchanged since last sync
    }

    try {
      const buffer = await downloadFile(file.ref);
      const filename = saveBuffer(buffer, file.name);

      let fields = null;
      let confidence = 'low';
      if (isExtractionConfigured()) {
        fields = await extractDocument(buffer, file.name);
        confidence = fields.confidence;
      }

      if (!existing) {
        insertPending(file, filename, fields, confidence);
        result.added++;
      } else {
        if (existing.file_path) {
          fs.rm(path.join(UPLOAD_DIR, existing.file_path), { force: true }, () => {});
        }
        updatePending(existing.id, file, filename, fields, confidence);
        result.updated++;
      }
    } catch (err) {
      result.errors.push(`${file.name}: ${err.message || err}`);
    }
  }

  return result;
}

function insertPending(file, filename, fields, confidence) {
  const personId = matchOrUnassignedPerson(fields?.person_name);
  db.prepare(
    `INSERT INTO documents
       (person_id, doc_type, label, document_number, issuing_country,
        issue_date, issue_hijri, expiry_date, expiry_hijri, notes,
        file_path, file_name, source, review_status, source_file_id, source_rev, source_ref,
        extracted_name, ai_confidence, ai_cost)
     VALUES
       (@person_id, @doc_type, @label, @document_number, @issuing_country,
        @issue_date, @issue_hijri, @expiry_date, @expiry_hijri, @notes,
        @file_path, @file_name, 'drive', 'pending', @source_file_id, @source_rev, @source_ref,
        @extracted_name, @ai_confidence, @ai_cost)`
  ).run({
    person_id: personId,
    doc_type: fields?.doc_type || 'Document',
    label: fields?.label || null,
    document_number: fields?.document_number || null,
    issuing_country: fields?.issuing_country || null,
    issue_date: fields?.issue_date || null,
    issue_hijri: fields?.issue_hijri || null,
    // Far-future placeholder so a never-extracted doc doesn't look "expired";
    // the reviewer sets the real date.
    expiry_date: fields?.expiry_date || '2099-12-31',
    expiry_hijri: fields?.expiry_hijri || null,
    notes: fields ? null : 'AI extraction unavailable — please fill in the details.',
    file_path: filename,
    file_name: file.name,
    source_file_id: file.id,
    source_rev: file.rev,
    source_ref: file.ref,
    extracted_name: fields?.person_name || null,
    ai_confidence: confidence,
    ai_cost: fields?.cost || 0,
  });
}

function updatePending(id, file, filename, fields, confidence) {
  const personId = fields?.person_name ? matchOrUnassignedPerson(fields.person_name) : undefined;
  db.prepare(
    `UPDATE documents SET
       doc_type = COALESCE(@doc_type, doc_type),
       label = @label,
       document_number = @document_number,
       issuing_country = @issuing_country,
       issue_date = @issue_date,
       issue_hijri = @issue_hijri,
       expiry_date = COALESCE(@expiry_date, expiry_date),
       expiry_hijri = @expiry_hijri,
       file_path = @file_path,
       file_name = @file_name,
       source = 'drive',
       review_status = 'pending',
       source_rev = @source_rev,
       source_ref = @source_ref,
       extracted_name = @extracted_name,
       ai_confidence = @ai_confidence,
       ai_cost = ai_cost + @ai_cost,
       last_reminded_at = NULL,
       reminder_count = 0,
       updated_at = datetime('now')
       ${personId ? ', person_id = @person_id' : ''}
     WHERE id = @id`
  ).run({
    id,
    person_id: personId,
    doc_type: fields?.doc_type || null,
    label: fields?.label || null,
    document_number: fields?.document_number || null,
    issuing_country: fields?.issuing_country || null,
    issue_date: fields?.issue_date || null,
    issue_hijri: fields?.issue_hijri || null,
    expiry_date: fields?.expiry_date || null,
    expiry_hijri: fields?.expiry_hijri || null,
    file_path: filename,
    file_name: file.name,
    source_rev: file.rev,
    source_ref: file.ref,
    extracted_name: fields?.person_name || null,
    ai_confidence: confidence,
    ai_cost: fields?.cost || 0,
  });
}
