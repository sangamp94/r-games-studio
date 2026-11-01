const { query, nowSec, fail, getUser } = require('./_lib');

// GET  /api/games                         -> list games (visitors: published only, owner: everything)
// POST /api/games {action:'save', game}   -> create/update a game (owner)
// POST /api/games {action:'delete', id}   -> delete a game + its files (owner)
// POST /api/games {action:'play', id}     -> play counter +1 (anyone)
module.exports = async (req, res) => {
  try {
    const user = getUser(req);
    const isOwner = !!user && user.role === 'owner';
    res.setHeader('Cache-Control', 'no-store');

    if (req.method === 'GET') {
      const rows = isOwner
        ? await query('SELECT data, plays FROM games ORDER BY created_at DESC')
        : await query("SELECT data, plays FROM games WHERE status = 'published' ORDER BY created_at DESC");
      const games = rows.map((r) => ({ ...JSON.parse(r.data), plays: Number(r.plays) }));
      return res.json({ games });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const body = req.body || {};

    if (body.action === 'play') {
      const id = String(body.id || '');
      await query('UPDATE games SET plays = plays + 1 WHERE id = ?', [id]);
      return res.json({ ok: true });
    }

    if (!user) return res.status(401).json({ error: 'Please sign in again.' });
    if (!isOwner) return res.status(403).json({ error: 'Owner access only.' });

    if (body.action === 'save') {
      const g = body.game;
      if (!g || typeof g.id !== 'string' || !/^[\w-]{1,80}$/.test(g.id)) {
        return res.status(400).json({ error: 'Invalid game record.' });
      }
      const { plays, ...record } = g; // plays lives in its own column
      const json = JSON.stringify(record);
      if (json.length > 3 * 1024 * 1024) return res.status(413).json({ error: 'Game record is too large. Use a smaller thumbnail.' });
      const status = record.status === 'published' ? 'published' : 'draft';
      const created = Number(record.created_at) || Date.now();
      const updated = Number(record.updated_at) || Date.now();
      await query(
        `INSERT INTO games (id, status, created_at, updated_at, plays, data)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at, data = excluded.data`,
        [record.id, status, created, updated, Number(plays) || 0, json]
      );
      return res.json({ ok: true });
    }

    if (body.action === 'delete') {
      const id = String(body.id || '');
      await query('DELETE FROM game_chunks WHERE game_id = ?', [id]);
      await query('DELETE FROM games WHERE id = ?', [id]);
      return res.json({ ok: true });
    }

    res.status(400).json({ error: 'Unknown action.' });
  } catch (err) {
    fail(res, err);
  }
};
