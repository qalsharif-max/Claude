import crypto from 'node:crypto';

/** Constant-time comparison to avoid leaking the password via timing. */
function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export function checkPassword(input) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) {
    // Fail closed: refuse all logins if no password is configured.
    console.error('[auth] APP_PASSWORD is not set — login is disabled until you set it in .env');
    return false;
  }
  return safeEqual(input || '', expected);
}

/** Express middleware: require a logged-in session for protected routes. */
export function requireAuth(req, res, next) {
  if (req.session && req.session.authed) return next();
  return res.status(401).json({ error: 'Not authenticated' });
}
