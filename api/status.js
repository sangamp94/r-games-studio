const { query, fail } = require('./_lib');

// Tells the frontend whether an owner account exists yet (first-time setup vs normal login).
// Also works as a health check: open /api/status in the browser to see if the database is OK.
module.exports = async (req, res) => {
  try {
    const [row] = await query("SELECT count(*) AS n FROM users WHERE role = 'owner'");
    res.setHeader('Cache-Control', 'no-store');
    res.json({ hasOwner: Number(row.n) > 0 });
  } catch (err) {
    fail(res, err);
  }
};
