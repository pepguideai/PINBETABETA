// api/collect-email.js
// Collects email signups from PIN onboarding and stores them in Vercel KV.
// Set KV_REST_API_URL and KV_REST_API_TOKEN as Vercel environment variables.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, name, goal, exp, timestamp } = req.body;

  // Email is optional in onboarding — only store if provided
  if (!email || !email.includes('@')) {
    return res.status(200).json({ ok: true, stored: false, reason: 'no_email' });
  }

  const KV_URL   = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;

  if (!KV_URL || !KV_TOKEN) {
    // Graceful fallback — don't break onboarding if KV not configured yet
    console.warn('PIN: KV not configured — email not stored:', email);
    return res.status(200).json({ ok: true, stored: false, reason: 'kv_not_configured' });
  }

  try {
    const entry = JSON.stringify({
      email:     email.toLowerCase().trim(),
      name:      name || '',
      goal:      goal || '',
      exp:       exp  || '',
      timestamp: timestamp || new Date().toISOString(),
      source:    'onboarding',
    });

    // LPUSH appends to a list — newest entries at the front
    // Key: pin_signups — a Redis list of JSON strings
    const kvRes = await fetch(`${KV_URL}/lpush/pin_signups`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${KV_TOKEN}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify([entry]),
    });

    if (!kvRes.ok) {
      const err = await kvRes.text();
      console.error('PIN: KV write failed:', err);
      return res.status(200).json({ ok: true, stored: false, reason: 'kv_error' });
    }

    // Also store email as a unique SET member to prevent duplicates in the index
    await fetch(`${KV_URL}/sadd/pin_emails`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${KV_TOKEN}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify([email.toLowerCase().trim()]),
    });

    return res.status(200).json({ ok: true, stored: true });

  } catch (err) {
    console.error('PIN: collect-email error:', err);
    // Never block onboarding due to analytics failure
    return res.status(200).json({ ok: true, stored: false, reason: 'exception' });
  }
}
