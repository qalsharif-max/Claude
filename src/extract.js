import Anthropic from '@anthropic-ai/sdk';
import { hijriStringToGregorianISO, gregorianToHijriString } from './hijri.js';

const MODEL = process.env.EXTRACT_MODEL || 'claude-opus-4-8';

// USD per 1M tokens. Defaults cover the Opus/Sonnet/Haiku families; unknown
// models fall back to Opus pricing.
const PRICING = {
  'claude-opus-4-8': { in: 5, out: 25 },
  'claude-opus-4-7': { in: 5, out: 25 },
  'claude-opus-4-6': { in: 5, out: 25 },
  'claude-sonnet-4-6': { in: 3, out: 15 },
  'claude-haiku-4-5': { in: 1, out: 5 },
};

function costFor(usage) {
  const price = PRICING[MODEL] || PRICING['claude-opus-4-8'];
  const inTok = (usage.input_tokens || 0) + (usage.cache_read_input_tokens || 0) + (usage.cache_creation_input_tokens || 0);
  const outTok = usage.output_tokens || 0;
  return (inTok / 1e6) * price.in + (outTok / 1e6) * price.out;
}

export function isExtractionConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const MEDIA_TYPES = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

export function mediaTypeFor(filename) {
  const ext = (filename.match(/\.[^.]+$/) || [''])[0].toLowerCase();
  return MEDIA_TYPES[ext] || null;
}

// JSON schema for the structured extraction result.
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    person_name: { type: 'string', description: 'Full name of the document holder, as printed.' },
    doc_type: {
      type: 'string',
      description:
        'Document type, e.g. "Passport", "National ID", "Visa", "Residence Permit", "Driver\'s License".',
    },
    label: { type: 'string', description: 'Short description, e.g. "Saudi National ID". May be empty.' },
    document_number: { type: 'string', description: 'ID/document number. May be empty.' },
    issuing_country: { type: 'string', description: 'Issuing country. May be empty.' },
    expiry_date_gregorian: {
      type: 'string',
      description: 'Expiry date in YYYY-MM-DD if printed in the Gregorian calendar, else empty.',
    },
    expiry_date_hijri: {
      type: 'string',
      description:
        'Expiry date EXACTLY as printed if it is in the Hijri/Islamic calendar (format YYYY/MM/DD), else empty. Do NOT convert it yourself.',
    },
    issue_date_gregorian: { type: 'string', description: 'Issue date YYYY-MM-DD if Gregorian, else empty.' },
    issue_date_hijri: { type: 'string', description: 'Issue date as printed if Hijri (YYYY/MM/DD), else empty.' },
    confidence: {
      type: 'string',
      enum: ['high', 'medium', 'low'],
      description: 'Your confidence in the extracted expiry date.',
    },
  },
  required: [
    'person_name',
    'doc_type',
    'label',
    'document_number',
    'issuing_country',
    'expiry_date_gregorian',
    'expiry_date_hijri',
    'issue_date_gregorian',
    'issue_date_hijri',
    'confidence',
  ],
};

const PROMPT = `You are reading a scanned identity or travel document (passport, national ID, visa, residence permit, driver's license, etc.). Extract the holder's details.

Important rules about dates:
- Many documents (especially Saudi/Gulf documents) print dates in the Hijri (Islamic) calendar, often marked with "هـ" or "AH". If the EXPIRY date is Hijri, put it EXACTLY as printed in "expiry_date_hijri" (format YYYY/MM/DD) and leave "expiry_date_gregorian" empty. Do NOT convert Hijri to Gregorian yourself — that conversion is done elsewhere.
- If a date is printed in the Gregorian calendar, put it in the *_gregorian field as YYYY-MM-DD.
- The expiry date is usually labelled "Expiry", "Date of Expiry", "تاريخ الانتهاء", or similar. Do not confuse it with the issue date or date of birth.
- Leave any field you cannot read as an empty string.`;

/**
 * Extract document fields from a file buffer using Claude vision.
 * @returns {Promise<object>} normalized fields: person_name, doc_type, label,
 *   document_number, issuing_country, expiry_date (YYYY-MM-DD), expiry_hijri,
 *   issue_date, issue_hijri, confidence
 */
export async function extractDocument(buffer, filename) {
  if (!isExtractionConfigured()) {
    throw new Error('ANTHROPIC_API_KEY is not set — cannot run AI extraction.');
  }
  const mediaType = mediaTypeFor(filename);
  if (!mediaType) throw new Error(`Unsupported file type for extraction: ${filename}`);

  const client = new Anthropic();
  const data = buffer.toString('base64');

  const fileBlock =
    mediaType === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: mediaType, data } }
      : { type: 'image', source: { type: 'base64', media_type: mediaType, data } };

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    thinking: { type: 'adaptive' },
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    messages: [
      {
        role: 'user',
        content: [fileBlock, { type: 'text', text: PROMPT }],
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock) throw new Error('No structured output returned from the model.');
  const raw = JSON.parse(textBlock.text);

  const normalized = normalize(raw);
  normalized.cost = costFor(response.usage || {});
  return normalized;
}

/** Reconcile Hijri/Gregorian: Hijri (if present) is converted deterministically. */
export function normalize(raw) {
  const expiryHijri = (raw.expiry_date_hijri || '').trim();
  const issueHijri = (raw.issue_date_hijri || '').trim();

  let expiry = (raw.expiry_date_gregorian || '').trim();
  if (expiryHijri) {
    const converted = hijriStringToGregorianISO(expiryHijri);
    if (converted) expiry = converted;
  }
  let issue = (raw.issue_date_gregorian || '').trim();
  if (issueHijri) {
    const converted = hijriStringToGregorianISO(issueHijri);
    if (converted) issue = converted;
  }

  // Normalize Hijri string format (or derive it from Gregorian for display).
  const expiryHijriNorm = normalizeHijriString(expiryHijri) || (expiry ? gregorianToHijriString(expiry) : '');
  const issueHijriNorm = normalizeHijriString(issueHijri) || (issue ? gregorianToHijriString(issue) : '');

  return {
    person_name: (raw.person_name || '').trim(),
    doc_type: (raw.doc_type || '').trim() || 'Document',
    label: (raw.label || '').trim(),
    document_number: (raw.document_number || '').trim(),
    issuing_country: (raw.issuing_country || '').trim(),
    expiry_date: expiry,
    expiry_hijri: expiryHijriNorm,
    issue_date: issue,
    issue_hijri: issueHijriNorm,
    confidence: raw.confidence || 'low',
  };
}

function normalizeHijriString(str) {
  const m = String(str || '').match(/(\d{3,4})[/\-.](\d{1,2})[/\-.](\d{1,2})/);
  if (!m) return '';
  return `${m[1]}/${String(m[2]).padStart(2, '0')}/${String(m[3]).padStart(2, '0')}`;
}
