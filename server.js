// L2Price — servidor local sem dependências. Uso: node server.js  (http://localhost:3777)
import http from 'node:http';
import { readFile, writeFile, rename, mkdir, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUB = path.join(ROOT, 'public');
const DATA = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA, 'db.json');
const PORT = Number(process.env.PORT) || 3777;

const DEFAULT_CATS = ['basic', 'crafted', 'crystal', 'enchant', 'shots'];

const catalog = JSON.parse(await readFile(path.join(DATA, 'catalog.json'), 'utf8'));
const catalogById = new Map(catalog.map((c) => [c.id, c]));

let db;
async function loadDb() {
  if (existsSync(DB_FILE)) {
    db = JSON.parse(await readFile(DB_FILE, 'utf8'));
  } else {
    db = { version: 1, watch: [], prices: [], trades: [], settings: { server: 'L2 Reborn — Legacy (C1)' } };
    for (const c of catalog) if (DEFAULT_CATS.includes(c.cat)) db.watch.push({ id: c.id, fav: false, target: null, note: '' });
    await saveDb();
  }
  db.trades ||= []; db.watch ||= []; db.prices ||= []; db.settings ||= {};
}
let saving = Promise.resolve();
function saveDb() {
  saving = saving.then(async () => {
    await mkdir(DATA, { recursive: true });
    const tmp = DB_FILE + '.tmp';
    await writeFile(tmp, JSON.stringify(db, null, 1));
    if (existsSync(DB_FILE)) await copyFile(DB_FILE, DB_FILE + '.bak');
    await rename(tmp, DB_FILE);
  });
  return saving;
}
await loadDb();

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon' };

const send = (res, code, body) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
};
const readBody = (req) => new Promise((ok, fail) => {
  let s = ''; req.on('data', (c) => { s += c; if (s.length > 50e6) req.destroy(); });
  req.on('end', () => { try { ok(s ? JSON.parse(s) : {}); } catch (e) { fail(e); } });
});
const num = (v) => (v === null || v === undefined || v === '' ? null : Math.max(0, Math.round(Number(v)))) ;

function cleanPrice(p) {
  const buy = num(p.buy), sell = num(p.sell);
  if (!catalogById.has(p.itemId)) throw new Error('Item inválido: ' + p.itemId);
  if (buy === null && sell === null) throw new Error('Informe preço de compra ou venda');
  return { id: randomUUID(), itemId: p.itemId, buy, sell, date: p.date || new Date().toISOString(), note: String(p.note || '').slice(0, 200) };
}

async function api(req, res, url) {
  const m = req.method, p = url.pathname;
  if (m === 'GET' && p === '/api/catalog') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=3600' });
    return res.end(JSON.stringify(catalog));
  }
  if (m === 'GET' && p === '/api/db') return send(res, 200, db);

  if (m === 'POST' && p === '/api/prices') {           // aceita objeto ou array (lote)
    const body = await readBody(req);
    const list = (Array.isArray(body) ? body : [body]).map(cleanPrice);
    db.prices.push(...list);
    for (const pr of list) if (!db.watch.some((w) => w.id === pr.itemId)) db.watch.push({ id: pr.itemId, fav: false, target: null, note: '' });
    await saveDb(); return send(res, 200, list);
  }
  let mm;
  if ((mm = p.match(/^\/api\/prices\/([\w-]+)$/))) {
    const i = db.prices.findIndex((x) => x.id === mm[1]);
    if (i < 0) return send(res, 404, { error: 'não encontrado' });
    if (m === 'DELETE') db.prices.splice(i, 1);
    else if (m === 'PUT') { const b = await readBody(req); Object.assign(db.prices[i], { buy: num(b.buy), sell: num(b.sell), date: b.date || db.prices[i].date, note: b.note ?? db.prices[i].note }); }
    await saveDb(); return send(res, 200, { ok: true });
  }

  if (m === 'POST' && p === '/api/watch') {
    const b = await readBody(req);
    for (const id of [].concat(b.ids || b.id)) if (catalogById.has(id) && !db.watch.some((w) => w.id === id)) db.watch.push({ id, fav: false, target: null, note: '' });
    await saveDb(); return send(res, 200, db.watch);
  }
  if ((mm = p.match(/^\/api\/watch\/(.+)$/))) {
    const id = decodeURIComponent(mm[1]);
    const i = db.watch.findIndex((w) => w.id === id);
    if (i < 0) return send(res, 404, { error: 'não encontrado' });
    if (m === 'DELETE') db.watch.splice(i, 1);
    else if (m === 'PUT') { const b = await readBody(req); for (const k of ['fav', 'target', 'note', 'targetSell']) if (k in b) db.watch[i][k] = b[k]; }
    await saveDb(); return send(res, 200, { ok: true });
  }

  if (m === 'POST' && p === '/api/trades') {
    const b = await readBody(req);
    if (!catalogById.has(b.itemId)) return send(res, 400, { error: 'Item inválido' });
    const t = { id: randomUUID(), itemId: b.itemId, type: b.type === 'sell' ? 'sell' : 'buy', qty: Math.max(1, num(b.qty) || 1),
      price: num(b.price) || 0, date: b.date || new Date().toISOString(), note: String(b.note || '').slice(0, 200) };
    db.trades.push(t);
    if (!db.watch.some((w) => w.id === t.itemId)) db.watch.push({ id: t.itemId, fav: false, target: null, note: '' });
    await saveDb(); return send(res, 200, t);
  }
  if ((mm = p.match(/^\/api\/trades\/([\w-]+)$/)) && m === 'DELETE') {
    db.trades = db.trades.filter((t) => t.id !== mm[1]);
    await saveDb(); return send(res, 200, { ok: true });
  }

  if (m === 'POST' && p === '/api/import') {
    const b = await readBody(req);
    if (!Array.isArray(b.prices) || !Array.isArray(b.watch)) return send(res, 400, { error: 'Arquivo de backup inválido' });
    await copyFile(DB_FILE, path.join(DATA, `db-before-import-${Date.now()}.json`));
    db = { version: 1, watch: b.watch, prices: b.prices, trades: b.trades || [], settings: b.settings || {} };
    await saveDb(); return send(res, 200, { ok: true });
  }
  if (m === 'PUT' && p === '/api/settings') { Object.assign(db.settings, await readBody(req)); await saveDb(); return send(res, 200, db.settings); }
  send(res, 404, { error: 'rota desconhecida' });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    let f = path.normalize(path.join(PUB, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)));
    if (!f.startsWith(PUB)) { res.writeHead(403); return res.end(); }
    if (!existsSync(f)) {
      if (url.pathname.startsWith('/icons/')) f = path.join(PUB, 'img', 'noicon.svg');
      else { res.writeHead(404); return res.end('404'); }
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream',
      'Cache-Control': url.pathname.startsWith('/icons/') ? 'max-age=604800' : 'no-cache' });
    res.end(await readFile(f));
  } catch (e) {
    send(res, 400, { error: e.message });
  }
}).listen(PORT, () => console.log(`\n  L2Price rodando em http://localhost:${PORT}\n`));
