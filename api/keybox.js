import { fetchKeyboxPayload } from '../lib/fetchers.js';

export default async function handler(req, res) {
  try {
    const source = req.query.source || 'auto';
    const provider = req.query.provider || 'auto';
    const version = req.query.version || null;

    const payload = await fetchKeyboxPayload({ source, provider, version });

    // Allow direct XML download via ?format=xml
    if (req.query.format === 'xml') {
      const xmlBuffer = Buffer.from(payload.xml, 'utf-8');
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="keybox.xml"');
      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.status(200).send(xmlBuffer);
    }

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.setHeader('Access-Control-Allow-Origin', '*');

    return res.status(200).json({
      base64: payload.base64,
      source: payload.source,
      provider: payload.provider,
      version: payload.version,
      serial: payload.serial,
      softbanned: payload.softbanned,
      revoked: payload.revoked,
      latency: payload.latency,
      timestamp: payload.timestamp
    });
  } catch (err) {
    console.error('API /api/keybox error:', err);
    return res.status(500).json({
      error: err.message || 'Failed to retrieve attestation payload'
    });
  }
}
