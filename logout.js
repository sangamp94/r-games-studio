const { clearSession } = require('./_lib');

module.exports = (req, res) => {
  clearSession(res);
  res.json({ ok: true });
};
