/**
 * AnyBox — Fetchers & Decoders for Attestation Keyboxes
 * 
 * Supports:
 * 1. Specter (rawbin.dpejoh.com)
 *    - Fetches catalog from https://rawbin.dpejoh.com/catalog
 *    - Fetches obfuscated keybox payload from https://rawbin.dpejoh.com/key/{source}/{version}
 *    - Decodes custom substitution cipher (SHUFFLED_ALPHABET -> STD_ALPHABET)
 *    - Base64 decodes into raw AndroidAttestation XML
 * 
 * 2. Integrity-Box (MeowDump / Megatron)
 *    - Fetches multi-layer payload from https://raw.githubusercontent.com/MeowDump/MeowDump/refs/heads/main/Megatron
 *    - Fail-safe fallback to direct GitHub CDN IPs
 *    - Decodes 10x Base64 -> Hex decoding -> ROT13 transformation
 *    - Status checking from https://raw.githubusercontent.com/MeowDump/Integrity-Box/refs/heads/main/keybox/key-status
 * 
 * 3. Custom Upstream
 *    - Fetches from configured KEYBOX_SOURCE_URL and STATUS_SOURCE_URL
 */

// ============================================================================
// Constants & Cipher Tables
// ============================================================================

export const SPECTER_CATALOG_URL = process.env.SPECTER_CATALOG_URL || 'https://rawbin.dpejoh.com/catalog';
export const SPECTER_KEYBOX_BASE_URL = process.env.SPECTER_KEYBOX_URL || 'https://rawbin.dpejoh.com/key';
export const SPECTER_FALLBACK_KEYBOX = 'Yuri/8';

export const MEOWDUMP_KEYBOX_URL = process.env.INTEGRITY_BOX_KEYBOX_URL || 'https://raw.githubusercontent.com/MeowDump/MeowDump/refs/heads/main/Megatron';
export const MEOWDUMP_STATUS_URL = process.env.INTEGRITY_BOX_STATUS_URL || 'https://raw.githubusercontent.com/MeowDump/Integrity-Box/refs/heads/main/keybox/key-status';

export const GITHUB_RAW_IPS = [
  '185.199.108.133',
  '185.199.109.133',
  '185.199.110.133',
  '185.199.111.133'
];

const STD_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const SHUFFLED_ALPHABET = '1dgWnocayqxU3r6vA5lCIPYfHmkV08b4tz+KMsp2NQ9LRXihODwSj7BEFJ/ZuGTe';

// Map for Specter substitution cipher
const specterDecodeMap = Object.fromEntries(
  [...SHUFFLED_ALPHABET].map((char, index) => [char, STD_ALPHABET[index]])
);

// ============================================================================
// Cipher & Decryption Helpers
// ============================================================================

/**
 * Decodes Specter substitution cipher and returns standard Base64 string
 */
export function decodeSpecterCipher(obfuscatedBlob) {
  const clean = obfuscatedBlob.replace(/\s+/g, '');
  let substituted = '';
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    substituted += specterDecodeMap[c] || c;
  }
  return substituted;
}

/**
 * Standard ROT13 transformation
 */
export function rot13(str) {
  return str.replace(/[a-zA-Z]/g, (c) => {
    const code = c.charCodeAt(0);
    const base = code <= 90 ? 65 : 97;
    return String.fromCharCode(((code - base + 13) % 26) + base);
  });
}

/**
 * Decodes MeowDump / Megatron multi-layer payload:
 * 10x Base64 decode -> Hex decode -> ROT13 transform -> Raw XML
 */
export function decodeMeowDumpPayload(rawPayload) {
  let current = rawPayload.trim();

  // 10 iterations of Base64 decoding
  for (let i = 1; i <= 10; i++) {
    try {
      current = Buffer.from(current, 'base64').toString('ascii');
    } catch (err) {
      throw new Error(`Integrity-Box: Base64 decode failed at iteration ${i}: ${err.message}`);
    }
  }

  // Hex decode
  let hexDecoded;
  try {
    hexDecoded = Buffer.from(current, 'hex').toString('utf-8');
  } catch (err) {
    throw new Error(`Integrity-Box: Hex decode failed: ${err.message}`);
  }

  // ROT13 transformation
  const xml = rot13(hexDecoded);

  if (!xml.includes('<AndroidAttestation>') && !xml.includes('<Keybox')) {
    throw new Error('Integrity-Box: Decoded payload does not contain valid AndroidAttestation XML');
  }

  return xml;
}

// ============================================================================
// Network Request Helpers
// ============================================================================

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': 'AnyBox-Attestation/1.0 (Android Keybox Utility)',
        ...(options.headers || {})
      }
    });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

// ============================================================================
// Specter Fetching Mechanism
// ============================================================================

/**
 * Fetches the Specter keybox catalog
 */
export async function fetchSpecterCatalog() {
  const startTime = Date.now();
  const response = await fetchWithTimeout(SPECTER_CATALOG_URL, {
    headers: { 'User-Agent': 'Specter/1.0' }
  }, 10000);

  const latency = Date.now() - startTime;

  if (!response.ok) {
    throw new Error(`Specter catalog returned HTTP ${response.status}`);
  }

  const catalog = await response.json();
  return { catalog, latency };
}

/**
 * Fetches a keybox using the Specter mechanism
 */
export async function fetchSpecterKeybox({ provider = 'auto', version = null } = {}) {
  const startTime = Date.now();

  let targetSource = provider;
  let targetVersion = version;
  let entryMetadata = null;
  let catalog = null;

  try {
    const catResult = await fetchSpecterCatalog();
    catalog = catResult.catalog;
  } catch (err) {
    // If catalog fetch fails, fallback to hardcoded fallback
    console.warn('Specter catalog fetch failed, will attempt fallback:', err.message);
  }

  if (catalog) {
    const workingEntries = Array.isArray(catalog.workingEntries) ? catalog.workingEntries : [];
    const allEntries = Array.isArray(catalog.entries) ? catalog.entries : [];

    if (targetSource === 'auto' || !targetSource) {
      // Find candidate in workingEntries: prefer non-softbanned and non-revoked
      const activeCandidates = workingEntries.filter(w => {
        const fullEntry = allEntries.find(e => e.source === w.source && e.version === w.version);
        return fullEntry ? (!fullEntry.softbanned && !fullEntry.revoked) : true;
      });

      if (activeCandidates.length > 0) {
        // Pick one randomly among active candidates
        const picked = activeCandidates[Math.floor(Math.random() * activeCandidates.length)];
        targetSource = picked.source;
        targetVersion = picked.version;
      } else if (workingEntries.length > 0) {
        // Fallback to any working entry
        const picked = workingEntries[Math.floor(Math.random() * workingEntries.length)];
        targetSource = picked.source;
        targetVersion = picked.version;
      } else if (catalog.working && catalog.working.source && catalog.working.version) {
        targetSource = catalog.working.source;
        targetVersion = catalog.working.version;
      }
    } else if (targetSource && !targetVersion) {
      // Find latest version for provider
      const providerEntries = allEntries.filter(e => e.source === targetSource && !e.revoked);
      const activeVer = providerEntries.filter(e => !e.softbanned).sort((a, b) => (b.version > a.version ? 1 : -1))[0];
      const anyVer = providerEntries.sort((a, b) => (b.version > a.version ? 1 : -1))[0];
      targetVersion = activeVer?.version || anyVer?.version || '1';
    }

    // Match entry metadata
    entryMetadata = allEntries.find(e => e.source === targetSource && e.version === targetVersion) || null;
  }

  // Construct target URL
  let downloadUrl;
  if (targetSource && targetVersion && targetSource !== 'auto') {
    downloadUrl = `${SPECTER_KEYBOX_BASE_URL}/${encodeURIComponent(targetSource)}/${encodeURIComponent(targetVersion)}`;
  } else {
    downloadUrl = `${SPECTER_KEYBOX_BASE_URL}/${SPECTER_FALLBACK_KEYBOX}`;
    targetSource = 'Yuri';
    targetVersion = '8';
  }

  // Fetch the cipher blob
  let response = await fetchWithTimeout(downloadUrl, {
    headers: { 'User-Agent': 'Specter/1.0' }
  }, 15000);

  // Fallback retry if targeted provider failed
  if (!response.ok && downloadUrl !== `${SPECTER_KEYBOX_BASE_URL}/${SPECTER_FALLBACK_KEYBOX}`) {
    downloadUrl = `${SPECTER_KEYBOX_BASE_URL}/${SPECTER_FALLBACK_KEYBOX}`;
    targetSource = 'Yuri';
    targetVersion = '8';
    response = await fetchWithTimeout(downloadUrl, {
      headers: { 'User-Agent': 'Specter/1.0' }
    }, 15000);
  }

  if (!response.ok) {
    throw new Error(`Specter upstream error: HTTP ${response.status}`);
  }

  const rawCipherBlob = await response.text();
  const substitutedB64 = decodeSpecterCipher(rawCipherBlob);
  const xmlBuffer = Buffer.from(substitutedB64, 'base64');
  const xml = xmlBuffer.toString('utf-8');

  if (!xml.includes('<AndroidAttestation>') && !xml.includes('<Keybox')) {
    throw new Error('Specter: Decoded keybox does not contain valid AndroidAttestation XML');
  }

  const cleanB64 = Buffer.from(xml, 'utf-8').toString('base64');
  const latency = Date.now() - startTime;

  return {
    xml,
    base64: cleanB64,
    source: 'specter',
    provider: targetSource,
    version: targetVersion,
    serial: entryMetadata?.serial || null,
    softbanned: entryMetadata?.softbanned ?? false,
    revoked: entryMetadata?.revoked ?? false,
    latency,
    timestamp: new Date().toISOString()
  };
}

// ============================================================================
// Integrity-Box (MeowDump) Fetching Mechanism
// ============================================================================

/**
 * Fetches a keybox using the Integrity-Box (MeowDump) mechanism
 */
export async function fetchIntegrityBoxKeybox() {
  const startTime = Date.now();
  let rawPayload = null;

  // Attempt 1: Standard URL fetch
  try {
    const res = await fetchWithTimeout(MEOWDUMP_KEYBOX_URL, {
      headers: { 'User-Agent': 'AnyBox-Service/1.0' }
    }, 15000);

    if (res.ok) {
      rawPayload = await res.text();
    }
  } catch (err) {
    console.warn('Integrity-Box: Primary URL fetch failed, trying direct GitHub CDN IPs:', err.message);
  }

  // Attempt 2: Direct GitHub CDN IPs (fail-safe mechanism)
  if (!rawPayload) {
    for (const ip of GITHUB_RAW_IPS) {
      try {
        const ipUrl = `https://${ip}/MeowDump/MeowDump/refs/heads/main/Megatron`;
        const res = await fetchWithTimeout(ipUrl, {
          headers: {
            'Host': 'raw.githubusercontent.com',
            'User-Agent': 'AnyBox-Service/1.0'
          }
        }, 8000);

        if (res.ok) {
          rawPayload = await res.text();
          break;
        }
      } catch (err) {
        // Continue to next IP
      }
    }
  }

  if (!rawPayload || !rawPayload.trim()) {
    throw new Error('Integrity-Box: Failed to retrieve payload from MeowDump repository (all attempts exhausted)');
  }

  // Multi-layer decoding: 10x Base64 -> Hex -> ROT13
  const xml = decodeMeowDumpPayload(rawPayload);
  const cleanB64 = Buffer.from(xml, 'utf-8').toString('base64');
  const latency = Date.now() - startTime;

  return {
    xml,
    base64: cleanB64,
    source: 'integritybox',
    provider: 'MeowDump Megatron',
    version: 'latest',
    latency,
    timestamp: new Date().toISOString()
  };
}

/**
 * Fetches status for Integrity-Box
 */
export async function fetchIntegrityBoxStatus() {
  const startTime = Date.now();
  const res = await fetchWithTimeout(MEOWDUMP_STATUS_URL, {
    headers: { 'User-Agent': 'AnyBox-Service/1.0' }
  }, 10000);

  const latency = Date.now() - startTime;

  if (!res.ok) {
    throw new Error(`Integrity-Box status check returned HTTP ${res.status}`);
  }

  const raw = await res.text();
  const status = raw.replace(/^Status:\s*/i, '').trim() || 'Online';

  return {
    source: 'integritybox',
    status,
    latency,
    timestamp: new Date().toISOString()
  };
}

// ============================================================================
// Custom Upstream Fetching Mechanism
// ============================================================================

export async function fetchUpstreamKeybox() {
  const upstreamUrl = process.env.KEYBOX_SOURCE_URL || 
    (process.env.STATUS_SOURCE_URL ? process.env.STATUS_SOURCE_URL.replace(/\/status\/?$/, '/key') : null);

  if (!upstreamUrl) {
    throw new Error('Keybox source endpoint not configured. Set KEYBOX_SOURCE_URL in environment settings.');
  }

  const startTime = Date.now();
  const response = await fetchWithTimeout(upstreamUrl, {
    headers: { 'User-Agent': 'AnyBox-Service/1.0' }
  }, 15000);

  const latency = Date.now() - startTime;

  if (!response.ok) {
    throw new Error(`Upstream provider returned HTTP ${response.status}`);
  }

  const rawPayload = await response.text();
  let cleanB64 = rawPayload.replace(/\s+/g, '');
  let xml;

  // Determine if upstream returned raw XML or Base64
  if (rawPayload.includes('<AndroidAttestation>') || rawPayload.includes('<Keybox')) {
    xml = rawPayload;
    cleanB64 = Buffer.from(xml, 'utf-8').toString('base64');
  } else {
    // Assume Base64
    xml = Buffer.from(cleanB64, 'base64').toString('utf-8');
  }

  return {
    xml,
    base64: cleanB64,
    source: 'upstream',
    provider: 'Custom Upstream',
    version: 'active',
    latency,
    timestamp: new Date().toISOString()
  };
}

export async function fetchUpstreamStatus() {
  const upstreamUrl = process.env.STATUS_SOURCE_URL || 
    (process.env.KEYBOX_SOURCE_URL ? process.env.KEYBOX_SOURCE_URL.replace(/\/key\/?$/, '/status') : null);

  if (!upstreamUrl) {
    throw new Error('Service endpoint not configured. Set STATUS_SOURCE_URL in environment settings.');
  }

  const startTime = Date.now();
  const response = await fetchWithTimeout(upstreamUrl, {
    headers: { 'User-Agent': 'AnyBox-Service/1.0' }
  }, 10000);

  const latency = Date.now() - startTime;

  if (!response.ok) {
    throw new Error(`Upstream service returned HTTP ${response.status}`);
  }

  const text = await response.text();
  return {
    source: 'upstream',
    status: text.trim(),
    latency,
    timestamp: new Date().toISOString()
  };
}

// ============================================================================
// Unified API Dispatchers
// ============================================================================

/**
 * Retrieves the list of available sources and catalog status
 */
export async function getSourcesMetadata() {
  const hasUpstream = Boolean(process.env.KEYBOX_SOURCE_URL || process.env.STATUS_SOURCE_URL);

  let specterInfo = null;
  try {
    const { catalog } = await fetchSpecterCatalog();
    const workingEntries = Array.isArray(catalog.workingEntries) ? catalog.workingEntries : [];
    const allEntries = Array.isArray(catalog.entries) ? catalog.entries : [];

    // Unique list of providers
    const providers = [];
    const seen = new Set();

    for (const w of workingEntries) {
      const key = `${w.source}__${w.version}`;
      if (!seen.has(key)) {
        seen.add(key);
        const match = allEntries.find(e => e.source === w.source && e.version === w.version);
        providers.push({
          source: w.source,
          version: w.version,
          text: w.text || `${w.source} (${w.version})`,
          softbanned: match?.softbanned ?? false,
          revoked: match?.revoked ?? false
        });
      }
    }

    specterInfo = {
      working: catalog.working || null,
      providersCount: providers.length,
      providers
    };
  } catch (err) {
    console.warn('Failed to pre-fetch Specter catalog for sources metadata:', err.message);
  }

  return {
    defaultSource: process.env.DEFAULT_SOURCE || (hasUpstream ? 'upstream' : 'specter'),
    sources: [
      {
        id: 'specter',
        name: 'Specter',
        description: 'Multi-provider live catalog from rawbin.dpejoh.com with cipher decryption',
        available: true,
        hasProviders: true,
        specterInfo
      },
      {
        id: 'integritybox',
        name: 'Integrity-Box',
        description: 'MeowDump Megatron payload with 10x Base64, Hex & ROT13 decoding',
        available: true,
        hasProviders: false
      },
      {
        id: 'upstream',
        name: 'Custom Upstream',
        description: 'Configured upstream endpoint via environment variables',
        available: hasUpstream,
        hasProviders: false
      }
    ]
  };
}

/**
 * Universal keybox dispatcher
 */
export async function fetchKeyboxPayload({ source = 'auto', provider = 'auto', version = null } = {}) {
  const selectedSource = source === 'auto' 
    ? (process.env.DEFAULT_SOURCE || (process.env.KEYBOX_SOURCE_URL ? 'upstream' : 'specter'))
    : source;

  switch (selectedSource.toLowerCase()) {
    case 'specter':
      return await fetchSpecterKeybox({ provider, version });

    case 'integritybox':
    case 'meowdump':
    case 'integrity-box':
      return await fetchIntegrityBoxKeybox();

    case 'upstream':
      return await fetchUpstreamKeybox();

    default:
      // If unknown source, try specter first, then integritybox
      try {
        return await fetchSpecterKeybox({ provider, version });
      } catch {
        return await fetchIntegrityBoxKeybox();
      }
  }
}

/**
 * Universal status dispatcher
 */
export async function fetchStatusPayload(source = 'auto') {
  const selectedSource = source === 'auto'
    ? (process.env.DEFAULT_SOURCE || (process.env.STATUS_SOURCE_URL ? 'upstream' : 'specter'))
    : source;

  if (selectedSource === 'all') {
    const [specterRes, meowRes, upstreamRes] = await Promise.allSettled([
      fetchSpecterCatalog().then(res => ({
        status: res.catalog?.working ? 'Online' : 'Active',
        latency: res.latency,
        working: res.catalog?.working
      })),
      fetchIntegrityBoxStatus(),
      fetchUpstreamStatus().catch(() => ({ status: 'Not Configured', latency: 0 }))
    ]);

    return {
      specter: specterRes.status === 'fulfilled' ? specterRes.value : { status: 'Offline', error: specterRes.reason?.message },
      integritybox: meowRes.status === 'fulfilled' ? meowRes.value : { status: 'Offline', error: meowRes.reason?.message },
      upstream: upstreamRes.status === 'fulfilled' ? upstreamRes.value : { status: 'Unavailable' }
    };
  }

  switch (selectedSource.toLowerCase()) {
    case 'specter': {
      const { catalog, latency } = await fetchSpecterCatalog();
      const working = catalog?.working ? `${catalog.working.source} (${catalog.working.version})` : 'Active';
      return {
        source: 'specter',
        status: 'Online',
        details: working,
        latency,
        timestamp: new Date().toISOString()
      };
    }

    case 'integritybox':
    case 'meowdump':
    case 'integrity-box':
      return await fetchIntegrityBoxStatus();

    case 'upstream':
      return await fetchUpstreamStatus();

    default:
      return {
        source: selectedSource,
        status: 'Unknown Source',
        latency: 0,
        timestamp: new Date().toISOString()
      };
  }
}
