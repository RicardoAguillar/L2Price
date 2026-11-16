// Gera data/catalog.json (catálogo C1 categorizado) a partir de data/l2hub-c1-items.json
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const raw = JSON.parse(await readFile(path.join(ROOT, 'data', 'l2hub-c1-items.json'), 'utf8'));

// Materiais básicos (drop/spoil) do C1
const BASIC = ['Animal Bone', 'Animal Skin', 'Charcoal', 'Coal', 'Iron Ore', 'Silver Nugget', 'Stem', 'Thread',
  'Suede', 'Varnish', 'Mithril Ore', 'Adamantite Nugget', 'Oriharukon Ore', 'Stone of Purity', 'Asofe', 'Thons',
  'Enria', 'Mold Glue', 'Mold Lubricant', 'Mold Hardener', 'Gold Nugget', 'Mercury', 'Spider Silk'];
// Materiais intermediários (craftados por anões)
const CRAFTED = ['Braided Hemp', 'Cokes', 'Steel', 'Coarse Bone Powder', 'Leather', 'Cord', 'Steel Mold',
  'High Grade Suede', 'Compound Braid', 'Artisan\'s Frame', 'Silver Mold', 'Varnish of Purity', 'Synthetic Cokes',
  'Oriharukon', 'Mithril Alloy', 'Blacksmith\'s Frame', 'Crafted Leather', 'Metallic Fiber', 'Metallic Thread',
  'Durable Metal Plate', 'Enria', 'Reinforced Leather', 'Metal Hardener', 'Maestro Holder', 'Maestro Anvil Lock',
  'Maestro Mold', 'Craftsman Mold', 'Reorin Mold', 'Warsmith\'s Mold', 'Arcsmith\'s Anvil', 'Warsmith\'s Holder',
  'Leolin\'s Mold', 'Oriharukon Ore', 'Adamantite Ore', 'Mithril', 'Silver'];
const basic = new Set(BASIC.map((s) => s.toLowerCase()));
const crafted = new Set(CRAFTED.map((s) => s.toLowerCase()));

function classify(it) {
  const n = it.name, l = n.toLowerCase(), ic = it.icon;
  if (basic.has(l)) return 'basic';
  if (crafted.has(l)) return 'crafted';
  if (/^recipe/i.test(n)) return 'recipe';
  if (/^crystal: /i.test(n) || /^gemstone/i.test(n)) return 'crystal';
  if (/scroll: enchant/i.test(l)) return 'enchant';
  if (/soulshot|spiritshot|arrow$/i.test(l)) return 'shots';
  if (/^spellbook|^book of|amulet:|^blueprint/i.test(l) || ic.startsWith('etc_spell_books') || ic.includes('_book_')) return 'spellbook';
  if (ic.startsWith('weapon_')) return 'weapon';
  if (ic.startsWith('shield_')) return 'armor';
  if (ic.startsWith('armor_')) return 'armor';
  if (ic.startsWith('accessary_')) return 'jewel';
  if (/(blade|head|edge|shaft|stave|gemstone|fragment|pattern|lining|temper|design|ornament|part|wire|fabric|piece|crest|stock|guard|leash|lock|link|plate|cloth|texture|frame|gem|bead|leather|thread|cover|vise|dye|fiber|lid|chain|nail|lens)s?$/i.test(n)
      && it.npcPrice > 0 && ic.startsWith('etc_')) return 'part';
  if (/potion|elixir|scroll of escape|scroll of resurrection|^scroll|quick healing|haste|greater/i.test(l)) return 'consumable';
  if (/dye/i.test(l)) return 'dye';
  return 'other';
}

const seen = new Set();
const catalog = [];
for (const it of raw) {
  if (it.slug.startsWith('__')) continue;
  const key = it.name.toLowerCase();
  if (seen.has(key)) continue; // remove duplicados de nome (itens de quest/teste)
  seen.add(key);
  catalog.push({ id: it.slug, name: it.name, icon: it.icon, cat: classify(it), kind: it.kind === 'none' ? '' : it.kind, npc: it.npcPrice });
}
catalog.sort((a, b) => a.name.localeCompare(b.name));
await writeFile(path.join(ROOT, 'public', 'data', 'catalog.json'), JSON.stringify(catalog));
const count = {};
catalog.forEach((c) => (count[c.cat] = (count[c.cat] || 0) + 1));
console.log(catalog.length, count);
const missing = [...BASIC, ...CRAFTED].filter((n) => !seen.has(n.toLowerCase()));
if (missing.length) console.log('Não encontrados no C1:', missing.join(', '));
