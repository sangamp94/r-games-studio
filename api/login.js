const bcrypt = require('bcryptjs');
const {
  sql, setSession, clientIp, readCredentials,
  isRateLimited, logFailedAttempt, clearAttempts
} = require('./_lib');

// A real bcrypt hash of a random string, used so unknown emails take the same time as known ones
const DUMMY_HASH = '$2a$12$zPr1TZiw1KCP6kKHcE1C4uZ6aJc1LYHr1T.tMRuyKbxcVWx9NtA22';

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, password } = readCredentials(req);
  const ip = clientIp(req);
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

  try {
    if (await isRateLimited(email, ip)) {
      return res.status(429).json({ error: 'Too many failed attempts. Please wait 15 minutes and try again.' });
    }

    const rows = await sql`SELECT id, email, role, password_hash FROM users WHERE email = ${email}`;
    const u = rows[0];
    const ok = await bcrypt.compare(password, u ? u.password_hash : DUMMY_HASH) && !!u;

    if (!ok) {
      await logFailedAttempt(email, ip);
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    await clearAttempts(email);
    await sql`UPDATE users SET last_login_at = now() WHERE id = ${u.id}`;
    setSession(res, u);
    res.json({ user: { id: u.id, email: u.email, role: u.role } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
};
