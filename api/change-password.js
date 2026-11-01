const bcrypt = require('bcryptjs');
const {
  query, fail, getUser, setSession, clientIp,
  isRateLimited, logFailedAttempt, clearAttempts
} = require('./_lib');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const session = getUser(req);
  if (!session) return res.status(401).json({ error: 'Please sign in first.' });

  const currentPassword = String(req.body?.currentPassword || '');
  const newPassword = String(req.body?.newPassword || '');
  if (newPassword.length < 10 || newPassword.length > 200) {
    return res.status(400).json({ error: 'New password must be 10 to 200 characters.' });
  }

  try {
    const ip = clientIp(req);
    if (await isRateLimited(session.email, ip)) {
      return res.status(429).json({ error: 'Too many failed attempts. Please wait 15 minutes.' });
    }

    const rows = await query('SELECT id, email, role, password_hash FROM users WHERE id = ?', [session.id]);
    const u = rows[0];
    if (!u) return res.status(401).json({ error: 'Account not found.' });

    if (!(await bcrypt.compare(currentPassword, u.password_hash))) {
      await logFailedAttempt(u.email, ip);
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }

    const hash = await bcrypt.hash(newPassword, 12);
    await query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, u.id]);
    await clearAttempts(u.email);
    setSession(res, u);
    res.json({ ok: true });
  } catch (err) {
    fail(res, err);
  }
};
