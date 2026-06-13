// Hijri <-> Gregorian conversion.
// Display & matching use the browser's Umm al-Qura calendar (the official
// Saudi calendar). Hijri->Gregorian starts from a tabular estimate and then
// refines against Umm al-Qura so the result matches what's printed on Saudi
// documents.
(function (global) {
  const fmt = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });

  function gregorianToHijriParts(date) {
    const parts = fmt.formatToParts(date);
    const get = (t) => Number(parts.find((p) => p.type === t).value);
    return { hy: get('year'), hm: get('month'), hd: get('day') };
  }

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  // "YYYY-MM-DD" Gregorian -> "YYYY/MM/DD" Hijri
  function gregorianToHijriString(isoDate) {
    if (!isoDate) return '';
    const d = new Date(isoDate + 'T00:00:00Z');
    if (isNaN(d.getTime())) return '';
    const { hy, hm, hd } = gregorianToHijriParts(d);
    return `${hy}/${pad(hm)}/${pad(hd)}`;
  }

  // Tabular Islamic date -> Gregorian Date (UTC). Used as a starting estimate.
  function hijriToGregorianEstimate(hy, hm, hd) {
    const jdn =
      hd +
      Math.ceil(29.5 * (hm - 1)) +
      (hy - 1) * 354 +
      Math.floor((3 + 11 * hy) / 30) +
      1948440 -
      1;
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

  // Hijri parts -> Gregorian Date, refined to match Umm al-Qura exactly.
  function hijriToGregorian(hy, hm, hd) {
    const est = hijriToGregorianEstimate(hy, hm, hd);
    for (let off = -3; off <= 3; off++) {
      const cand = new Date(est.getTime() + off * 86400000);
      const p = gregorianToHijriParts(cand);
      if (p.hy === hy && p.hm === hm && p.hd === hd) return cand;
    }
    return est; // fall back to the tabular estimate
  }

  // Hijri parts -> "YYYY-MM-DD" Gregorian
  function hijriToGregorianISO(hy, hm, hd) {
    if (!hy || !hm || !hd) return '';
    const d = hijriToGregorian(Number(hy), Number(hm), Number(hd));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }

  global.Hijri = { gregorianToHijriString, hijriToGregorianISO };
})(window);
