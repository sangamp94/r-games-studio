const jwt = require('jsonwebtoken');

/* ---------------------------------------------------------------------------
   Turso (libSQL / SQLite) connection. Created lazily so a missing or invalid
   environment variable gives a clear JSON error instead of crashing the function.
   --------------------------------------------------------------------------- */
let _client = null;
function getClient() {
  if (_client) return _client;
  const rawUrl = (process.env.TURSO_DATABASE_URL || '').trim();
  if (!rawUrl) throw Object.assign(new Error('TURSO_DATABASE_URL is not set'), { code: 'NO_DB_URL' });
  const authToken = (process.env.TURSO_AUTH_TOKEN || '').trim() || undefined;

  if (/^file:/i.test(rawUrl)) {
    // Local file database (handy for `vercel dev` / tests): TURSO_DATABASE_URL=file:local.db
    const { createClient } = require('@libsql/client');
    _client = createClient({ url: rawUrl });
  } else {
    // Hosted Turso over HTTPS (works on Vercel serverless without native modules)
    const { createClient } = require('@libsql/client/web');
    _client = createClient({ url: rawUrl.replace(/^libsql:\/\//i, 'https://'), authToken });
  }
  return _client;
}

// Tables are created automatically on the first request (safe to run every time).
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
     id            INTEGER PRIMARY KEY AUTOINCREMENT,
     email         TEXT NOT NULL UNIQUE,
     password_hash TEXT NOT NULL,
     role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'owner')),
     created_at    INTEGER NOT NULL,
     last_login_at INTEGER
   )`,
  // Only one owner account can ever exist
  `CREATE UNIQUE INDEX IF NOT EXISTS one_owner_only ON users (role) WHERE role = 'owner'`,
  `CREATE TABLE IF NOT EXISTS login_attempts (
     id         INTEGER PRIMARY KEY AUTOINCREMENT,
     email      TEXT NOT NULL,
     ip         TEXT,
     created_at INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS login_attempts_email_idx ON login_attempts (email, created_at)`,
  `CREATE INDEX IF NOT EXISTS login_attempts_ip_idx ON login_attempts (ip, created_at)`,
  // Games: the full game record is stored as JSON in `data`; plays is a separate counter column
  `CREATE TABLE IF NOT EXISTS games (
     id         TEXT PRIMARY KEY,
     status     TEXT NOT NULL DEFAULT 'draft',
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL,
     plays      INTEGER NOT NULL DEFAULT 0,
     data       TEXT NOT NULL
   )`,
  // Game ZIP packages are split into chunks (base64 text) so every request stays small
  `CREATE TABLE IF NOT EXISTS game_chunks (
     game_id TEXT NOT NULL,
     pkg_id  TEXT NOT NULL,
     idx     INTEGER NOT NULL,
     data    TEXT NOT NULL,
     PRIMARY KEY (game_id, pkg_id, idx)
   )`
];

let _ready = null;
function ensureSchema() {
  if (!_ready) {
    _ready = getClient().batch(SCHEMA, 'write').catch((e) => { _ready = null; throw e; });
  }
  return _ready;
}

// Runs one SQL statement and returns rows as plain objects
async function query(text, args = []) {
  await ensureSchema();
  const rs = await getClient().execute({ sql: text, args });
  return rs.rows.map((row) => Object.fromEntries(rs.columns.map((c, i) => [c, row[i]])));
}

const nowSec = () => Math.floor(Date.now() / 1000);

/* ---------------------------------------------------------------------------
   Friendly, safe error messages (never include secrets)
   --------------------------------------------------------------------------- */
function describeError(err) {
  const msg = String((err && err.message) || err || '');
  const code = err && err.code;
  if (code === 'NO_DB_URL') return 'TURSO_DATABASE_URL is missing in Vercel Environment Variables. Add it, then Redeploy.';
  if (!process.env.JWT_SECRET || /secretOrPrivateKey|JWT_SECRET/i.test(msg)) return 'JWT_SECRET is missing in Vercel Environment Variables. Add it, then Redeploy.';
  if (/401|unauthori[sz]ed|auth token|invalid token|JWT/i.test(msg) && !/JWT_SECRET/.test(msg)) return 'Turso rejected the auth token. Create a new token in Turso and update TURSO_AUTH_TOKEN, then Redeploy.';
  if (/invalid url|not a valid url|URL_INVALID|unsupported|scheme/i.test(msg)) return 'TURSO_DATABASE_URL looks invalid. It should start with libsql://';
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|SERVER_ERROR|network/i.test(msg)) return 'Cannot connect to Turso. Check TURSO_DATABASE_URL and that the database exists.';
  return 'Unexpected server error: ' + msg.slice(0, 160);
}

function fail(res, err) {
  console.error(err);
  res.status(500).json({ error: describeError(err) });
}

/* ---------------------------------------------------------------------------
   Sessions (JWT in an HttpOnly cookie)
   --------------------------------------------------------------------------- */
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

// Returns the owner session, or sends 401/403 and returns null
function requireOwner(req, res) {
  const u = getUser(req);
  if (!u) { res.status(401).json({ error: 'Please sign in again.' }); return null; }
  if (u.role !== 'owner') { res.status(403).json({ error: 'Owner access only.' }); return null; }
  return u;
}

function clientIp(req) {
  const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xff || req.socket?.remoteAddress || 'unknown';
}

/* ---------------------------------------------------------------------------
   Brute-force protection: max 5 failures per email and 20 per IP in 15 minutes
   --------------------------------------------------------------------------- */
async function isRateLimited(email, ip) {
  const since = nowSec() - 15 * 60;
  const [e] = await query('SELECT count(*) AS n FROM login_attempts WHERE email = ? AND created_at > ?', [email, since]);
  const [i] = await query('SELECT count(*) AS n FROM login_attempts WHERE ip = ? AND created_at > ?', [ip, since]);
  return Number(e.n) >= 5 || Number(i.n) >= 20;
}

async function logFailedAttempt(email, ip) {
  await query('INSERT INTO login_attempts (email, ip, created_at) VALUES (?, ?, ?)', [email, ip, nowSec()]);
}

async function clearAttempts(email) {
  await query('DELETE FROM login_attempts WHERE email = ?', [email]);
}

function readCredentials(req) {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  return { email, password };
}

module.exports = {
  query,
  requireOwner,
  nowSec,
  fail,
  setSession,
  clearSession,
  getUser,
  clientIp,
  isRateLimited,
  logFailedAttempt,
  clearAttempts,
  readCredentials
};
