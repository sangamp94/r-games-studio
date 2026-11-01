const bcrypt = require('bcryptjs');
const { query, nowSec, fail, setSession, readCredentials } = require('./_lib');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, password } = readCredentials(req);
  const setupKey = String(req.body?.setupKey || '');

  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  if (password.length < 10 || password.length > 200) {
    return res.status(400).json({ error: 'Password must be 10 to 200 characters.' });
  }

  try {
    const hash = await bcrypt.hash(password, 12);
    let user;

    // The very first owner can only be created with the secret SETUP_KEY (set in Vercel env vars).
    // This stops a stranger from grabbing the owner account before you do.
    if (setupKey !== '') {
      if (!process.env.SETUP_KEY || setupKey !== process.env.SETUP_KEY) {
        return res.status(403).json({ error: 'Invalid setup key.' });
      }
      const rows = await query(
        `INSERT INTO users (email, password_hash, role, created_at)
         SELECT ?, ?, 'owner', ?
         WHERE NOT EXISTS (SELECT 1 FROM users WHERE role = 'owner')
         RETURNING id, email, role`,
        [email, hash, nowSec()]
      );
      if (!rows.length) {
        return res.status(409).json({ error: 'An owner account already exists. Please sign in.' });
      }
      user = rows[0];
    } else {
      const rows = await query(
        `INSERT INTO users (email, password_hash, role, created_at)
         VALUES (?, ?, 'user', ?)
         RETURNING id, email, role`,
        [email, hash, nowSec()]
      );
      user = rows[0];
    }

    setSession(res, user);
    res.status(201).json({ user });
  } catch (err) {
    const msg = String(err && err.message);
    if (/UNIQUE constraint failed: users\.role/i.test(msg)) {
      return res.status(409).json({ error: 'An owner account already exists. Please sign in.' });
    }
    if (/UNIQUE constraint failed|SQLITE_CONSTRAINT/i.test(msg) || /SQLITE_CONSTRAINT/.test(err && err.code)) {
      return res.status(409).json({ error: 'This email is already registered.' });
    }
    fail(res, err);
  }
};
