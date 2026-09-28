import { fetchStatusPayload } from '../lib/fetchers.js';

export default async function handler(req, res) {
  try {
    const source = req.query.source || 'auto';
    const statusData = await fetchStatusPayload(source);

    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    res.setHeader('Access-Control-Allow-Origin', '*');

    return res.status(200).json(statusData);
  } catch (err) {
    console.error('API /api/status error:', err);
    return res.status(500).json({
      error: err.message || 'Failed to query service status'
    });
  }
}
