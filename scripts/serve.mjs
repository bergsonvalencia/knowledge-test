// Minimal zero-dependency static server for previewing dist/ locally.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, '..', 'dist');
const PORT = Number(process.env.PORT) || 4180;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

createServer(async (req, res) => {
  try {
    let p = decodeURIComponent((req.url || '/').split('?')[0]);
    if (p === '/') p = '/index.html';
    let fp = normalize(join(DIST, p));
    if (!fp.startsWith(DIST)) { res.writeHead(403); return res.end('Forbidden'); }
    let s;
    try { s = await stat(fp); } catch { res.writeHead(404, { 'content-type': 'text/html' }); return res.end('<h1>404 Not Found</h1>'); }
    if (s.isDirectory()) fp = join(fp, 'index.html');
    const data = await readFile(fp);
    res.writeHead(200, { 'content-type': TYPES[extname(fp)] || 'application/octet-stream' });
    res.end(data);
  } catch (e) {
    res.writeHead(500);
    res.end(String(e));
  }
}).listen(PORT, () => console.log(`Serving dist/ at http://localhost:${PORT}`));
