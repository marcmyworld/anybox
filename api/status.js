export default async function handler(req, res) {
  try {
    const upstreamUrl = process.env.STATUS_SOURCE_URL || 
      (process.env.KEYBOX_SOURCE_URL ? process.env.KEYBOX_SOURCE_URL.replace(/\/key\/?$/, '/status') : null);

    if (!upstreamUrl) {
      return res.status(503).json({
        error: 'Service endpoint not configured. Set STATUS_SOURCE_URL in environment settings.'
      });
    }

    const startTime = Date.now();
    const response = await fetch(upstreamUrl, {
      headers: { 'User-Agent': 'AnyBox-Service/1.0' }
    });

    const latency = Date.now() - startTime;

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'Service temporarily unavailable',
        latency
      });
    }

    const text = await response.text();
    const cleanStatus = text.trim();

    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    res.setHeader('Access-Control-Allow-Origin', '*');

    return res.status(200).json({
      status: cleanStatus,
      latency,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Failed to query service status'
    });
  }
}
