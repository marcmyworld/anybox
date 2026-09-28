/**
 * AnyBox — Local Development & Standalone Server
 * 
 * Provides local server capabilities matching Vercel serverless routes:
 * - /api/keybox -> api/keybox.js
 * - /api/status -> api/status.js
 * - /api/sources -> api/sources.js
 * - Static file serving for index.html, app.js, style.css, etc.
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env.local or .env if present
function loadEnv() {
  for (const envFile of ['.env.local', '.env']) {
    const envPath = path.join(__dirname, envFile);
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const key = trimmed.slice(0, eqIdx).trim();
          const val = trimmed.slice(eqIdx + 1).trim();
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    }
  }
}

loadEnv();

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8'
};

// Lazy load API handlers
const apiHandlers = {
  '/api/keybox': (await import('./api/keybox.js')).default,
  '/api/status': (await import('./api/status.js')).default,
  '/api/sources': (await import('./api/sources.js')).default,
};

function enhanceResponse(res) {
  res.status = function (statusCode) {
    res.statusCode = statusCode;
    return res;
  };

  res.json = function (obj) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(obj, null, 2));
    return res;
  };

  res.send = function (data) {
    res.end(data);
    return res;
  };

  return res;
}

const server = http.createServer(async (req, res) => {
  enhanceResponse(res);

  // Parse URL & Query
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;
  req.query = Object.fromEntries(parsedUrl.searchParams.entries());

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  // API Routes
  const handler = apiHandlers[pathname];
  if (handler) {
    try {
      await handler(req, res);
    } catch (err) {
      console.error(`Error in route ${pathname}:`, err);
      if (!res.writableEnded) {
        res.status(500).json({ error: err.message || 'Internal Server Error' });
      }
    }
    return;
  }

  // Static File Serving
  let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);

  // Security: prevent directory traversal
  if (!filePath.startsWith(__dirname)) {
    res.status(403).send('Forbidden');
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  res.status(404).send('Not Found');
});

const PORT = parseInt(process.env.PORT, 10) || 3000;
server.listen(PORT, () => {
  console.log(`📦 AnyBox server active at http://localhost:${PORT}`);
  console.log(`   - Available endpoints: /api/sources, /api/status, /api/keybox`);
});
