// Server-side Hijri <-> Gregorian conversion, mirroring public/hijri.js.
// Uses Node's built-in Umm al-Qura calendar (the official Saudi calendar),
// with a tabular estimate refined to match it exactly.
const fmt = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
  day: 'numeric',
  month: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

function pad(n) {
  return String(n).padStart(2, '0');
}

function gregorianToHijriParts(date) {
  const parts = fmt.formatToParts(date);
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  return { hy: get('year'), hm: get('month'), hd: get('day') };
}

export function gregorianToHijriString(isoDate) {
  if (!isoDate) return '';
  const d = new Date(isoDate + 'T00:00:00Z');
  if (isNaN(d.getTime())) return '';
  const { hy, hm, hd } = gregorianToHijriParts(d);
  return `${hy}/${pad(hm)}/${pad(hd)}`;
}

function hijriToGregorianEstimate(hy, hm, hd) {
  const jdn =
    hd + Math.ceil(29.5 * (hm - 1)) + (hy - 1) * 354 + Math.floor((3 + 11 * hy) / 30) + 1948440 - 1;
  let l = jdn + 68569;
  const n = Math.floor((4 * l) / 146097);
  l = l - Math.floor((146097 * n + 3) / 4);
  const i = Math.floor((4000 * (l + 1)) / 1461001);
  l = l - Math.floor((1461 * i) / 4) + 31;
  const j = Math.floor((80 * l) / 2447);
  const day = l - Math.floor((2447 * j) / 80);
  l = Math.floor(j / 11);
  const month = j + 2 - 12 * l;
  const year = 100 * (n - 49) + i + l;
  return new Date(Date.UTC(year, month - 1, day));
}

/** Parse a Hijri date string ("1448/03/09", "1448-3-9") into [y,m,d] or null. */
export function parseHijri(str) {
  if (!str) return null;
  const m = String(str).match(/(\d{3,4})[/\-.](\d{1,2})[/\-.](\d{1,2})/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** Hijri date string -> "YYYY-MM-DD" Gregorian (Umm al-Qura accurate), or ''. */
export function hijriStringToGregorianISO(str) {
  const parsed = parseHijri(str);
  if (!parsed) return '';
  const [hy, hm, hd] = parsed;
  const est = hijriToGregorianEstimate(hy, hm, hd);
  for (let off = -3; off <= 3; off++) {
    const cand = new Date(est.getTime() + off * 86400000);
    const p = gregorianToHijriParts(cand);
    if (p.hy === hy && p.hm === hm && p.hd === hd) {
      return `${cand.getUTCFullYear()}-${pad(cand.getUTCMonth() + 1)}-${pad(cand.getUTCDate())}`;
    }
  }
  return `${est.getUTCFullYear()}-${pad(est.getUTCMonth() + 1)}-${pad(est.getUTCDate())}`;
}
