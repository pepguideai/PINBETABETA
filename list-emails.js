// api/list-emails.js
// Returns all collected PIN signups as CSV or JSON.
// Protected by ADMIN_SECRET environment variable.
// Usage: GET /api/list-emails?secret=YOUR_SECRET&format=csv
//        GET /api/list-emails?secret=YOUR_SECRET&format=json

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Password protection
  const secret = req.query.secret;
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const KV_URL   = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;

  if (!KV_URL || !KV_TOKEN) {
    return res.status(500).json({ error: 'KV not configured' });
  }

  try {
    // LRANGE 0 -1 = fetch entire list
    const kvRes = await fetch(`${KV_URL}/lrange/pin_signups/0/-1`, {
      headers: { 'Authorization': `Bearer ${KV_TOKEN}` },
    });

    if (!kvRes.ok) {
      return res.status(500).json({ error: 'KV read failed' });
    }

    const data = await kvRes.json();
    // KV returns { result: [...] }
    const entries = (data.result || []).map(e => {
      try { return JSON.parse(e); }
      catch { return { raw: e }; }
    });

    const format = req.query.format || 'json';

    if (format === 'csv') {
      const header = 'email,name,goal,exp,timestamp,source\n';
      const rows = entries.map(e =>
        [
          `"${(e.email||'').replace(/"/g,'""')}"`,
          `"${(e.name||'').replace(/"/g,'""')}"`,
          `"${(e.goal||'').replace(/"/g,'""')}"`,
          `"${(e.exp||'').replace(/"/g,'""')}"`,
          `"${(e.timestamp||'').replace(/"/g,'""')}"`,
          `"${(e.source||'').replace(/"/g,'""')}"`,
        ].join(',')
      ).join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="pin-signups-${new Date().toISOString().slice(0,10)}.csv"`);
      return res.status(200).send(header + rows);
    }

    return res.status(200).json({
      count: entries.length,
      signups: entries,
    });

  } catch (err) {
    return res.status(500).json({ error: 'Server error', detail: err.message });
  }
}
