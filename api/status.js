const { sql } = require('./_lib');

// Tells the frontend whether an owner account exists yet (first-time setup vs normal login)
module.exports = async (req, res) => {
  try {
    const [row] = await sql`SELECT count(*)::int AS n FROM users WHERE role = 'owner'`;
    res.setHeader('Cache-Control', 'no-store');
    res.json({ hasOwner: row.n > 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database not reachable' });
  }
};
