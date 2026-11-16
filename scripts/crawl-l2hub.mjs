// Extrai a lista completa de itens do Lineage 2 C1 (Harbingers of War) de l2hub.info
// e baixa os ícones localmente. Uso: node scripts/crawl-l2hub.mjs [--no-icons]
import { writeFile, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://l2hub.info';
const UA = { 'User-Agent': 'Mozilla/5.0 (L2Price personal market tracker)' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const decode = (s) => s.replace(/<!-- -->/g, '').replace(/&#x27;/g, "'").replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"').replace(/<[^>]+>/g, '').trim();

function parsePage(html) {
  const rows = html.split('<tr').slice(1);
  const out = [];
  for (const r of rows) {
    const icon = r.match(/\/s\/icons\/([^"]+)\.png/);
    const link = r.match(/href="\/c1\/items\/([^"]+)">([^<]+)<\/a>/);
    if (!icon || !link) continue;
    const cells = [...r.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => decode(m[1]));
    const priceCell = r.match(/color:gold">([^<]+)</);
    out.push({
      slug: decode(link[1]),
      name: decode(link[2]),
      icon: icon[1],
      kind: cells[2] || '',
      npcPrice: priceCell ? Number(priceCell[1].replace(/\D/g, '')) || 0 : 0,
    });
  }
  return out;
}

async function get(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: UA });
      if (res.ok) return res;
      if (res.status === 404) return null;
    } catch {}
    await sleep(1500 * (i + 1));
  }
  return null;
}

const items = new Map();
let emptyStreak = 0;
for (let p = 1; p < 400 && emptyStreak < 2; p++) {
  const res = await get(`${BASE}/c1/items${p > 1 ? `?p=${p}` : ''}`);
  const list = res ? parsePage(await res.text()) : [];
  let added = 0;
  for (const it of list) if (!items.has(it.slug)) { items.set(it.slug, it); added++; }
  emptyStreak = added ? 0 : emptyStreak + 1;
  process.stdout.write(`\rpágina ${p}: ${items.size} itens`);
  await sleep(400);
}
console.log();

await mkdir(path.join(ROOT, 'data'), { recursive: true });
await writeFile(path.join(ROOT, 'data', 'l2hub-c1-items.json'), JSON.stringify([...items.values()], null, 1));

if (!process.argv.includes('--no-icons')) {
  const dir = path.join(ROOT, 'public', 'icons');
  await mkdir(dir, { recursive: true });
  const icons = [...new Set([...items.values()].map((i) => i.icon))];
  let n = 0;
  for (const ic of icons) {
    const file = path.join(dir, ic + '.png');
    n++;
    try { await access(file); continue; } catch {}
    const res = await get(`${BASE}/s/icons/${ic}.png`);
    if (res) await writeFile(file, Buffer.from(await res.arrayBuffer()));
    process.stdout.write(`\rícones ${n}/${icons.length}`);
    await sleep(120);
  }
  console.log();
}
console.log('OK');
