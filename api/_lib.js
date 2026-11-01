const { neon } = require('@neondatabase/serverless');
const jwt = require('jsonwebtoken');

if (!process.env.DATABASE_URL) console.error('DATABASE_URL is not set');
if (!process.env.JWT_SECRET) console.error('JWT_SECRET is not set');

const sql = neon(process.env.DATABASE_URL || '');

const COOKIE = 'rg_session';
const MAX_AGE = 4 * 60 * 60; // 4 hours

function cookieFlags(maxAge) {
  const secure = process.env.NODE_ENV === 'development' ? '' : '; Secure';
  return `; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`;
}

function setSession(res, user) {
  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: MAX_AGE }
  );
  res.setHeader('Set-Cookie', `${COOKIE}=${token}${cookieFlags(MAX_AGE)}`);
}

function clearSession(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=${cookieFlags(0)}`);
}

function getUser(req) {
  const m = (req.headers.cookie || '').match(/(?:^|;\s*)rg_session=([^;]+)/);
  if (!m) return null;
  try {
    return jwt.verify(m[1], process.env.JWT_SECRET);
  } catch {
    return null;
  }
}

function clientIp(req) {
  const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xff || req.socket?.remoteAddress || 'unknown';
}

// Allow max 5 failed attempts per email and 20 per IP in the last 15 minutes
async function isRateLimited(email, ip) {
  const [e] = await sql`
    SELECT count(*)::int AS n FROM login_attempts
    WHERE email = ${email} AND created_at > now() - interval '15 minutes'`;
  const [i] = await sql`
    SELECT count(*)::int AS n FROM login_attempts
    WHERE ip = ${ip} AND created_at > now() - interval '15 minutes'`;
  return e.n >= 5 || i.n >= 20;
}

async function logFailedAttempt(email, ip) {
  await sql`INSERT INTO login_attempts (email, ip) VALUES (${email}, ${ip})`;
}

async function clearAttempts(email) {
  await sql`DELETE FROM login_attempts WHERE email = ${email}`;
}

function readCredentials(req) {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  return { email, password };
}

module.exports = {
  sql,
  setSession,
  clearSession,
  getUser,
  clientIp,
  isRateLimited,
  logFailedAttempt,
  clearAttempts,
  readCredentials
};
