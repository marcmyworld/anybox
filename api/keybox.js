export default async function handler(req, res) {
  try {
    const upstreamUrl = process.env.KEYBOX_SOURCE_URL || 
      (process.env.STATUS_SOURCE_URL ? process.env.STATUS_SOURCE_URL.replace(/\/status\/?$/, '/key') : null);

    if (!upstreamUrl) {
      return res.status(503).json({
        error: 'Keybox source endpoint not configured. Set KEYBOX_SOURCE_URL in environment settings.'
      });
    }

    const startTime = Date.now();
    const response = await fetch(upstreamUrl, {
      headers: { 'User-Agent': 'AnyBox-Service/1.0' }
    });

    const latency = Date.now() - startTime;

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'Unable to retrieve payload from upstream provider',
        latency
      });
    }

    const rawPayload = await response.text();
    const cleanB64 = rawPayload.replace(/\s+/g, '');

    // Allow direct XML download via ?format=xml
    if (req.query.format === 'xml') {
      const xmlBuffer = Buffer.from(cleanB64, 'base64');
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="keybox.xml"');
      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.status(200).send(xmlBuffer);
    }

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.setHeader('Access-Control-Allow-Origin', '*');

    return res.status(200).json({
      base64: cleanB64,
      latency,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Failed to retrieve attestation payload'
    });
  }
}
