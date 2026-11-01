const { query, fail, getUser } = require('./_lib');

// GET  /api/chunks?game=ID&pkg=PKG&i=0          -> one chunk of a game's ZIP (JSON {data: base64})
// POST /api/chunks {game, pkg, i, data}         -> store one chunk (owner)
// POST /api/chunks {action:'prune', game, keep} -> delete all chunks except package `keep` (owner)
module.exports = async (req, res) => {
  try {
    const user = getUser(req);
    const isOwner = !!user && user.role === 'owner';
    res.setHeader('Cache-Control', 'no-store');

    if (req.method === 'GET') {
      const { game, pkg, i } = req.query || {};
      if (!isOwner) {
        const g = await query("SELECT 1 AS ok FROM games WHERE id = ? AND status = 'published'", [String(game || '')]);
        if (!g.length) return res.status(404).json({ error: 'Game not found.' });
      }
      const rows = await query('SELECT data FROM game_chunks WHERE game_id = ? AND pkg_id = ? AND idx = ?',
        [String(game || ''), String(pkg || ''), Number(i)]);
      if (!rows.length) return res.status(404).json({ error: 'Chunk not found.' });
      return res.json({ data: rows[0].data });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    if (!user) return res.status(401).json({ error: 'Please sign in again.' });
    if (!isOwner) return res.status(403).json({ error: 'Owner access only.' });
    const b = req.body || {};
    const game = String(b.game || '');
    if (!/^[\w-]{1,80}$/.test(game)) return res.status(400).json({ error: 'Invalid game id.' });

    if (b.action === 'prune') {
      if (b.keep) await query('DELETE FROM game_chunks WHERE game_id = ? AND pkg_id <> ?', [game, String(b.keep)]);
      else await query('DELETE FROM game_chunks WHERE game_id = ?', [game]);
      return res.json({ ok: true });
    }

    const pkg = String(b.pkg || '');
    if (!/^[\w-]{1,40}$/.test(pkg) || !Number.isInteger(b.i) || typeof b.data !== 'string' || !b.data) {
      return res.status(400).json({ error: 'Invalid chunk.' });
    }
    await query('INSERT OR REPLACE INTO game_chunks (game_id, pkg_id, idx, data) VALUES (?, ?, ?, ?)', [game, pkg, b.i, b.data]);
    res.json({ ok: true });
  } catch (err) {
    fail(res, err);
  }
};
