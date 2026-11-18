// Camada de dados: Supabase (Postgres + Auth). Mantém a mesma interface http(method, url, body)
// que o app usava com o servidor local, para o restante do código não mudar.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const configured = !SUPABASE_URL.includes('SEU-PROJETO-NAO-USADO') && !SUPABASE_ANON_KEY.includes('SUA-CHAVE-NAO-USADA');
export const sb = configured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const DEFAULT_CATS = ['basic', 'crafted', 'crystal', 'enchant', 'shots'];
let catalog = [];
export function setCatalog(c) { catalog = c; }

const must = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
const num = (v) => (v === null || v === undefined || v === '' ? null : Math.max(0, Math.round(Number(v))));

// Supabase devolve no máximo 1000 linhas por consulta: pagina.
async function selectAll(table, order) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const rows = must(await sb.from(table).select('*').order(order, { ascending: true }).range(from, from + 999));
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}
async function insertChunks(table, rows) {
  for (let i = 0; i < rows.length; i += 500) must(await sb.from(table).insert(rows.slice(i, i + 500)));
}

const toWatch = (r) => ({ id: r.item_id, fav: r.fav, target: r.target, targetSell: r.target_sell, note: r.note || '' });
const toPrice = (r) => ({ id: r.id, itemId: r.item_id, buy: r.buy, sell: r.sell, city: r.city || '', date: r.date, note: r.note || '' });
const toTrade = (r) => ({ id: r.id, itemId: r.item_id, type: r.type, qty: r.qty, price: r.price, date: r.date, note: r.note || '' });

async function ensureWatched(ids) {
  const rows = [...new Set(ids)].map((item_id) => ({ item_id }));
  if (rows.length) must(await sb.from('watch').upsert(rows, { onConflict: 'item_id', ignoreDuplicates: true }));
}

export let isAdmin = false;
export async function checkAdmin() {
  const { data, error } = await sb.rpc('is_admin');
  isAdmin = !error && data === true;
  return isAdmin;
}

async function loadDb() {
  let settings = must(await sb.from('settings').select('*').limit(1).maybeSingle());
  if (!settings && !isAdmin) settings = { server: 'L2 Reborn — Legacy (C1)' };
  if (!settings) { // primeiro acesso: lista padrão de itens monitorados
    await ensureWatched(catalog.filter((c) => DEFAULT_CATS.includes(c.cat)).map((c) => c.id));
    settings = must(await sb.from('settings').insert({ server: 'L2 Reborn — Legacy (C1)' }).select().single());
  }
  const [watch, prices, trades] = await Promise.all([selectAll('watch', 'created_at'), selectAll('prices', 'date'), selectAll('trades', 'date')]);
  return { watch: watch.map(toWatch), prices: prices.map(toPrice), trades: trades.map(toTrade), settings: { server: settings.server } };
}

export async function http(method, url, body) {
  const p = url;
  let m;
  if (method === 'GET' && p === '/api/db') return loadDb();
  if (p.startsWith('/api/trades')) { // carteira: individual, qualquer usuário logado
    const { data: { user } } = await sb.auth.getUser();
    if (!user) throw new Error('Entre com sua conta para usar a carteira.');
  if (method === 'POST' && p === '/api/trades') {
    must(await sb.from('trades').insert({ item_id: body.itemId, type: body.type === 'sell' ? 'sell' : 'buy', qty: Math.max(1, num(body.qty) || 1),
      price: num(body.price) || 0, date: body.date || new Date().toISOString(), note: String(body.note || '').slice(0, 200) }));
    if (isAdmin) await ensureWatched([body.itemId]);
    return { ok: true };
  }
  if ((m = p.match(/^\/api\/trades\/(.+)$/)) && method === 'PUT') {
    must(await sb.from('trades').update({ item_id: body.itemId, type: body.type === 'sell' ? 'sell' : 'buy', qty: Math.max(1, num(body.qty) || 1),
      price: num(body.price) || 0, note: String(body.note || '').slice(0, 200) }).eq('id', m[1]));
    return { ok: true };
  }
  if ((m = p.match(/^\/api\/trades\/(.+)$/)) && method === 'DELETE') { must(await sb.from('trades').delete().eq('id', m[1])); return { ok: true }; }
  }
  if (!isAdmin) throw new Error('Somente administradores podem alterar dados.');

  if (method === 'POST' && p === '/api/prices') {
    const list = (Array.isArray(body) ? body : [body]).map((x) => ({
      item_id: x.itemId, buy: num(x.buy), sell: num(x.sell), city: x.city || null, date: x.date || new Date().toISOString(), note: String(x.note || '').slice(0, 200),
    })).filter((x) => x.buy !== null || x.sell !== null);
    if (!list.length) throw new Error('Informe preço de compra ou venda');
    if (list.some((x) => !x.city)) throw new Error('Selecione a cidade onde o preço foi visto');
    await insertChunks('prices', list);
    await ensureWatched(list.map((x) => x.item_id));
    return { ok: true };
  }
  if ((m = p.match(/^\/api\/prices\/(.+)$/))) {
    if (method === 'DELETE') must(await sb.from('prices').delete().eq('id', m[1]));
    else must(await sb.from('prices').update({ buy: num(body.buy), sell: num(body.sell), city: body.city || null, note: String(body.note || '').slice(0, 200) }).eq('id', m[1]));
    return { ok: true };
  }

  if (method === 'POST' && p === '/api/watch') { await ensureWatched([].concat(body.ids || body.id)); return { ok: true }; }
  if ((m = p.match(/^\/api\/watch\/(.+)$/))) {
    const id = decodeURIComponent(m[1]);
    if (method === 'DELETE') must(await sb.from('watch').delete().eq('item_id', id));
    else {
      const u = {};
      if ('fav' in body) u.fav = body.fav;
      if ('target' in body) u.target = body.target;
      if ('targetSell' in body) u.target_sell = body.targetSell;
      if ('note' in body) u.note = body.note;
      must(await sb.from('watch').update(u).eq('item_id', id));
    }
    return { ok: true };
  }


  if (method === 'PUT' && p === '/api/settings') { must(await sb.from('settings').update({ server: body.server }).not('user_id', 'is', null)); return { ok: true }; }

  if (method === 'POST' && p === '/api/import') { // aceita backups do formato antigo (servidor local) e do novo
    if (!Array.isArray(body.prices) || !Array.isArray(body.watch)) throw new Error('Arquivo de backup inválido');
    for (const t of ['prices', 'trades', 'watch']) must(await sb.from(t).delete().not('user_id', 'is', null));
    await insertChunks('watch', body.watch.map((w) => ({ item_id: w.id, fav: !!w.fav, target: num(w.target), target_sell: num(w.targetSell), note: w.note || '' })));
    await insertChunks('prices', body.prices.map((x) => ({ item_id: x.itemId, buy: num(x.buy), sell: num(x.sell), city: x.city || null, date: x.date, note: x.note || '' })).filter((x) => x.buy !== null || x.sell !== null));
    await insertChunks('trades', (body.trades || []).map((t) => ({ item_id: t.itemId, type: t.type, qty: t.qty, price: num(t.price) || 0, date: t.date, note: t.note || '' })));
    if (body.settings?.server) must(await sb.from('settings').update({ server: body.settings.server }).not('user_id', 'is', null));
    return { ok: true };
  }
  throw new Error('Operação desconhecida: ' + method + ' ' + url);
}
