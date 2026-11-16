// Servidor estático só para testar localmente: node server.js → http://localhost:3777
// Em produção o site é publicado no GitHub Pages e os dados ficam no Supabase.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PUB = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const PORT = Number(process.env.PORT) || 3777;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };

http.createServer(async (req, res) => {
  const p = new URL(req.url, 'http://x').pathname;
  let f = path.normalize(path.join(PUB, decodeURIComponent(p === '/' ? '/index.html' : p)));
  if (!f.startsWith(PUB)) { res.writeHead(403); return res.end(); }
  if (!existsSync(f)) {
    if (p.startsWith('/icons/')) f = path.join(PUB, 'img', 'noicon.svg');
    else { res.writeHead(404); return res.end('404'); }
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  res.end(await readFile(f));
}).listen(PORT, () => console.log(`\n  L2Price (teste local) em http://localhost:${PORT}\n`));
