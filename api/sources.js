import { getSourcesMetadata } from '../lib/fetchers.js';

export default async function handler(req, res) {
  try {
    const data = await getSourcesMetadata();

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    res.setHeader('Access-Control-Allow-Origin', '*');

    return res.status(200).json(data);
  } catch (err) {
    console.error('API /api/sources error:', err);
    return res.status(500).json({
      error: err.message || 'Failed to load sources metadata'
    });
  }
}
