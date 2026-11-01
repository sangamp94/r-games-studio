const { getUser } = require('./_lib');

module.exports = (req, res) => {
  const user = getUser(req);
  res.setHeader('Cache-Control', 'no-store');
  res.json({ user: user ? { id: user.id, email: user.email, role: user.role } : null });
};
