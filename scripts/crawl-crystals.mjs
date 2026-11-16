// Adiciona grau e quantidade de cristais (ao quebrar) a public/data/catalog.json, via l2hub.info.
import { readFile, writeFile } from 'node:fs/promises';
const F = new URL('../public/data/catalog.json', import.meta.url);
const cat = JSON.parse(await readFile(F, 'utf8'));
const todo = cat.filter((c) => ['weapon', 'armor', 'jewel'].includes(c.cat) && c.cry === undefined);
let i = 0, done = 0;
async function worker() {
  while (i < todo.length) {
    const it = todo[i++];
    for (let t = 0; t < 3; t++) {
      try {
        const r = await fetch('https://l2hub.info/c1/items/' + encodeURIComponent(it.id), { headers: { 'User-Agent': 'Mozilla/5.0 (L2Price)' } });
        if (!r.ok) break;
        const h = await r.text();
        const ty = h.match(/crystalType:"(\w+)",crystalCount:(\d+)/);
        if (ty && ty[1] !== 'none' && +ty[2] > 0) { it.cry = ty[1].toUpperCase(); it.cryN = +ty[2]; } else it.cry = null;
        break;
      } catch { await new Promise((s) => setTimeout(s, 1500)); }
    }
    if (++done % 50 === 0) process.stdout.write(done + ' ');
  }
}
await Promise.all(Array.from({ length: 6 }, worker));
for (const c of cat) if (c.cry === null) delete c.cry;
await writeFile(F, JSON.stringify(cat));
console.log('\ncom cristais:', cat.filter((c) => c.cryN).length);
