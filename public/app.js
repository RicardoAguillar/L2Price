// L2Price — frontend (vanilla JS) com dados no Supabase
import { http, sb, configured, setCatalog, checkAdmin } from './data.js';
let ADMIN = false;
const denyRO = () => { if (ADMIN) return false; toast(currentUser ? 'Somente administradores podem registrar ou alterar dados.' : 'Entre como administrador para registrar ou alterar dados.', true); if (!currentUser) openLogin(); return true; };
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DAY = 864e5;

const CATS = {
  basic: 'Materiais básicos', crafted: 'Materiais craftados', part: 'Partes (Key Mats)', recipe: 'Receitas',
  crystal: 'Cristais & Gemas', enchant: 'Enchant', shots: 'Shots & Flechas', consumable: 'Consumíveis',
  weapon: 'Armas', armor: 'Armaduras & Escudos', jewel: 'Joias', spellbook: 'Spellbooks', dye: 'Dyes', other: 'Outros / Quest',
};
const CAT_ORDER = Object.keys(CATS);

// Cidades do Lineage 2 C1 (Harbingers of War)
const CITIES = [
  ['Iniciais', ['Talking Island Village', 'Elven Village', 'Dark Elven Village', 'Orc Village', 'Dwarven Village']],
  ['Cidades', ['Gludin Village', 'Town of Gludio', 'Town of Dion', 'Floran Village', 'Town of Giran', 'Hunters Village', 'Town of Oren', 'Ivory Tower', 'Heine', 'Town of Aden']],
];
const CITY_LIST = CITIES.flatMap(([, l]) => l);
const cityShort = (c) => (c ? c.replace(/^Town of /, '').replace(/ Village$/, '') : '—');
let lastCity = ''; // lembra a cidade durante a sessão (registros em sequência)
const citySelect = (id, val = '') => `<select id="${id}" required><option value="">— selecione a cidade —</option>${CITIES.map(([g, l]) => `<optgroup label="${g}">${l.map((c) => `<option ${c === val ? 'selected' : ''}>${c}</option>`).join('')}</optgroup>`).join('')}</select>`;
function needCity(sel) {
  if (sel.value) return false;
  toast('Selecione a cidade onde você viu o preço', true); sel.focus(); sel.style.borderColor = 'var(--down)'; return true;
}

// ---------------- estado ----------------
const S = { catalog: [], byId: new Map(), db: null, stats: new Map() };

async function reload() { S.db = await http('GET', '/api/db'); computeStats(); }

// ---------------- formatação / parsing ----------------
// Aceita: 1500000 | 1.500.000 | 1,5kk | 1.5kk | 300k | 2kkk | 1kk 200k
function parsePrice(v) {
  if (v === null || v === undefined) return null;
  let s = String(v).trim().toLowerCase().replace(/\s+/g, '');
  if (!s) return null;
  let total = 0, matched = false;
  const re = /(\d+(?:[.,]\d+)?)(k{1,3}|m|b)/g; let m; let rest = s;
  while ((m = re.exec(s))) {
    matched = true;
    const n = parseFloat(m[1].replace(',', '.'));
    const mult = { k: 1e3, kk: 1e6, m: 1e6, kkk: 1e9, b: 1e9 }[m[2]];
    total += n * mult; rest = rest.replace(m[0], '');
  }
  if (matched) { if (rest.replace(/\D/g, '')) total += Number(rest.replace(/\D/g, '')); return Math.round(total); }
  const d = s.replace(/\D/g, '');
  return d ? Number(d) : null;
}
const fmtFull = (n) => (n === null || n === undefined ? '—' : Math.round(n).toLocaleString('pt-BR'));
function fmt(n) { // estilo L2: 1.25kk / 350k
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const a = Math.abs(n), sign = n < 0 ? '-' : '';
  const trim = (x) => { let s = x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(2); if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, ''); return s.replace('.', ','); };
  if (a >= 1e9) return sign + trim(a / 1e9) + 'kkk';
  if (a >= 1e6) return sign + trim(a / 1e6) + 'kk';
  if (a >= 1e4) return sign + trim(a / 1e3) + 'k';
  return sign + fmtFull(a);
}
const pct = (x) => (x === null || x === undefined || !isFinite(x) ? null : x);
function chg(x, digits = 1) {
  if (x === null || x === undefined || !isFinite(x)) return '<span class="flat">—</span>';
  const v = x * 100;
  if (Math.abs(v) < 0.05) return '<span class="chg flat">● 0%</span>';
  return `<span class="chg ${v > 0 ? 'up' : 'down'}">${v > 0 ? '▲' : '▼'} ${Math.abs(v).toFixed(digits).replace('.', ',')}%</span>`;
}
const fmtDate = (d) => new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
const fmtDT = (d) => new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
function ago(d) {
  const s = (Date.now() - new Date(d)) / 1000;
  if (s < 3600) return Math.max(1, Math.round(s / 60)) + ' min';
  if (s < 86400) return Math.round(s / 3600) + ' h';
  return Math.round(s / 86400) + ' d';
}
const icon = (it, cls = '') => `<img class="ico ${cls}" loading="lazy" src="icons/${esc(it.icon)}.png" alt="" onerror="this.src='img/noicon.svg'">`;
const itemCell = (it, sub) => `<div class="item">${icon(it)}<div class="nm">${esc(it.name)}${sub !== undefined ? `<small>${sub}</small>` : ''}</div></div>`;

function toast(msg, err) {
  const t = document.createElement('div'); t.className = 'toast' + (err ? ' err' : ''); t.textContent = msg;
  $('#toasts').append(t); setTimeout(() => t.remove(), err ? 5000 : 2600);
}

// ---------------- estatísticas / análise ----------------
function seriesFor(id) {
  return S.db.prices.filter((p) => p.itemId === id).sort((a, b) => new Date(a.date) - new Date(b.date));
}
function valueAt(list, key, t) { // último valor em ou antes de t
  let v = null;
  for (const p of list) { if (new Date(p.date) > t) break; if (p[key] !== null) v = p[key]; }
  return v;
}
const lastOf = (list, key) => { for (let i = list.length - 1; i >= 0; i--) if (list[i][key] !== null) return list[i][key]; return null; };
const rel = (a, b) => (a === null || b === null || !b ? null : (a - b) / b);

function computeStats() {
  S.stats.clear();
  const now = Date.now();
  const byItem = new Map();
  for (const p of S.db.prices) { if (!byItem.has(p.itemId)) byItem.set(p.itemId, []); byItem.get(p.itemId).push(p); }
  const ids = new Set([...S.db.watch.map((w) => w.id), ...byItem.keys()]);
  for (const id of ids) {
    const it = S.byId.get(id); if (!it) continue;
    const list = (byItem.get(id) || []).sort((a, b) => new Date(a.date) - new Date(b.date));
    const st = { id, it, list, n: list.length };
    st.buy = lastOf(list, 'buy'); st.sell = lastOf(list, 'sell');
    st.last = list.length ? list[list.length - 1].date : null;
    // preço de referência: média entre compra e venda (ou o que existir)
    const ref = (p) => (p.buy !== null && p.sell !== null ? (p.buy + p.sell) / 2 : p.buy ?? p.sell);
    st.ref = st.buy !== null && st.sell !== null ? (st.buy + st.sell) / 2 : st.buy ?? st.sell;
    const prevRef = (days) => {
      const t = new Date(now - days * DAY);
      const b = valueAt(list, 'buy', t), s = valueAt(list, 'sell', t);
      return b !== null && s !== null ? (b + s) / 2 : b ?? s;
    };
    st.ch1 = rel(st.ref, prevRef(1)); st.ch7 = rel(st.ref, prevRef(7)); st.ch30 = rel(st.ref, prevRef(30));
    // variação desde o registro anterior
    if (list.length > 1) st.chLast = rel(ref(list[list.length - 1]), ref(list[list.length - 2]));
    const win = list.filter((p) => now - new Date(p.date) <= 30 * DAY).map(ref).filter((v) => v !== null);
    st.avg30 = win.length ? win.reduce((a, b) => a + b, 0) / win.length : null;
    st.min30 = win.length ? Math.min(...win) : null; st.max30 = win.length ? Math.max(...win) : null;
    if (win.length > 2) {
      const m = st.avg30, sd = Math.sqrt(win.reduce((a, v) => a + (v - m) ** 2, 0) / win.length);
      st.vol = m ? sd / m : null;
    }
    st.spread = st.buy !== null && st.sell !== null ? st.sell - st.buy : null;
    st.margin = st.spread !== null && st.buy ? st.spread / st.buy : null;
    st.npcSell = it.npc ? Math.floor(it.npc / 2) : 0; // NPC compra pela metade do preço
    st.spark = list.slice(-20).map(ref).filter((v) => v !== null);
    st.w = S.db.watch.find((w) => w.id === id) || null;
    analyse(st);
    S.stats.set(id, st);
  }
}

// Sinal de compra/venda com justificativa
function analyse(st) {
  const sig = []; let score = 0;
  if (st.npcSell && st.buy !== null && st.buy < st.npcSell) {
    sig.push({ t: 'npc', l: 'NPC', r: `Compra a ${fmt(st.buy)} e o NPC paga ${fmt(st.npcSell)} (+${fmt(st.npcSell - st.buy)}/un)` });
    score += 40;
  }
  if (st.margin !== null && st.margin >= 0.12 && st.spread > 0) {
    sig.push({ t: 'flip', l: 'FLIP', r: `Spread de ${fmt(st.spread)} (${(st.margin * 100).toFixed(0)}%) entre compra e venda` });
    score += Math.min(30, st.margin * 100);
  }
  if (st.avg30 && st.ref !== null && st.n >= 3) {
    const d = (st.ref - st.avg30) / st.avg30;
    if (d <= -0.1) { sig.push({ t: 'buyrec', l: 'COMPRAR', r: `${(Math.abs(d) * 100).toFixed(0)}% abaixo da média de 30 dias (${fmt(st.avg30)})` }); score += Math.abs(d) * 100; }
    if (d >= 0.1) { sig.push({ t: 'sellrec', l: 'VENDER', r: `${(d * 100).toFixed(0)}% acima da média de 30 dias (${fmt(st.avg30)})` }); score += d * 60; }
  }
  if (st.ch7 !== null && st.ch7 >= 0.15 && !sig.some((s) => s.t === 'sellrec')) {
    sig.push({ t: 'flip', l: 'ALTA', r: `Tendência de alta: ${chgText(st.ch7)} em 7 dias — momento de investir/segurar` }); score += st.ch7 * 40;
  }
  const w = st.w;
  if (w?.target && st.sell !== null && st.sell <= w.target) { sig.push({ t: 'alert', l: 'ALVO', r: `Venda a ${fmt(st.sell)} ≤ seu alvo de compra ${fmt(w.target)}` }); score += 50; }
  if (w?.targetSell && st.buy !== null && st.buy >= w.targetSell) { sig.push({ t: 'alert', l: 'ALVO', r: `Compra a ${fmt(st.buy)} ≥ seu alvo de venda ${fmt(w.targetSell)}` }); score += 50; }
  st.signals = sig; st.score = score;
}
const chgText = (x) => (x > 0 ? '+' : '') + (x * 100).toFixed(1).replace('.', ',') + '%';
const sigTags = (st) => st.signals.map((s) => `<span class="tag ${s.t}" title="${esc(s.r)}">${s.l}</span>`).join(' ') || '<span class="muted">—</span>';

// ---------------- gráficos SVG ----------------
function spark(vals, w = 90, h = 26) {
  if (!vals || vals.length < 2) return '<span class="muted">—</span>';
  const mn = Math.min(...vals), mx = Math.max(...vals), r = mx - mn || 1;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * (w - 4) + 2},${h - 3 - ((v - mn) / r) * (h - 6)}`).join(' ');
  const up = vals[vals.length - 1] >= vals[0];
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${up ? '#0ca30c' : '#e66767'}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

// gráfico de linhas com crosshair + tooltip. series: [{name,color,points:[{t,v}]}]
function lineChart(el, series, { height = 280 } = {}) {
  const all = series.flatMap((s) => s.points);
  if (all.length < 1) { el.innerHTML = '<div class="empty">Sem histórico suficiente. Registre preços para ver o gráfico.</div>'; return; }
  const W = Math.max(400, el.clientWidth || 800), H = height, P = { l: 64, r: 16, t: 12, b: 28 };
  let t0 = Math.min(...all.map((p) => p.t)), t1 = Math.max(...all.map((p) => p.t));
  if (t0 === t1) { t0 -= DAY; t1 += DAY; }
  let v0 = Math.min(...all.map((p) => p.v)), v1 = Math.max(...all.map((p) => p.v));
  const pad = (v1 - v0) * 0.1 || v1 * 0.1 || 1; v0 = Math.max(0, v0 - pad); v1 += pad;
  const x = (t) => P.l + ((t - t0) / (t1 - t0)) * (W - P.l - P.r);
  const y = (v) => H - P.b - ((v - v0) / (v1 - v0)) * (H - P.t - P.b);
  let g = '';
  for (let i = 0; i <= 4; i++) {
    const v = v0 + ((v1 - v0) * i) / 4, yy = y(v);
    g += `<line x1="${P.l}" x2="${W - P.r}" y1="${yy}" y2="${yy}" stroke="#2a2925" stroke-width="1"/><text x="${P.l - 8}" y="${yy + 4}" text-anchor="end" fill="#8d8b80" font-size="11">${fmt(v)}</text>`;
  }
  const ticks = Math.min(6, Math.max(2, Math.floor((W - P.l) / 110)));
  for (let i = 0; i <= ticks; i++) {
    const t = t0 + ((t1 - t0) * i) / ticks;
    g += `<text x="${x(t)}" y="${H - 8}" text-anchor="middle" fill="#8d8b80" font-size="11">${fmtDate(t)}</text>`;
  }
  let paths = '';
  series.forEach((s, si) => {
    if (!s.points.length) return;
    const d = s.points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
    paths += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    if (s.points.length < 40) paths += s.points.map((p) => `<circle cx="${x(p.t)}" cy="${y(p.v)}" r="4" fill="${s.color}" stroke="var(--panel)" stroke-width="2"/>`).join('');
    const lp = s.points[s.points.length - 1];
    paths += `<text x="${Math.min(x(lp.t) + 8, W - P.r)}" y="${y(lp.v) + (si === 0 ? 18 : -10)}" fill="#c3c2b7" font-size="11" text-anchor="${x(lp.t) > W - 80 ? 'end' : 'start'}">${esc(s.name)} ${fmt(lp.v)}</text>`;
  });
  el.innerHTML = `<div class="legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>
    <svg viewBox="0 0 ${W} ${H}" height="${H}">${g}${paths}<line class="xh" y1="${P.t}" y2="${H - P.b}" stroke="#6b6860" stroke-dasharray="3 3" visibility="hidden"/><rect x="${P.l}" y="${P.t}" width="${W - P.l - P.r}" height="${H - P.t - P.b}" fill="transparent"/></svg>`;
  const svg = $('svg', el), xh = $('.xh', el), tip = $('#tip');
  svg.addEventListener('mousemove', (e) => {
    const r = svg.getBoundingClientRect(), mx = ((e.clientX - r.left) / r.width) * W;
    if (mx < P.l || mx > W - P.r) { xh.setAttribute('visibility', 'hidden'); tip.hidden = true; return; }
    const t = t0 + ((mx - P.l) / (W - P.l - P.r)) * (t1 - t0);
    let near = null;
    for (const p of all) if (!near || Math.abs(p.t - t) < Math.abs(near.t - t)) near = p;
    xh.setAttribute('x1', x(near.t)); xh.setAttribute('x2', x(near.t)); xh.setAttribute('visibility', 'visible');
    const rows = series.map((s) => {
      const p = s.points.filter((q) => q.t <= near.t).pop();
      return p ? `<div><span class="dot" style="background:${s.color}"></span>${esc(s.name)}: <b>${fmtFull(p.v)}</b></div>` : '';
    }).join('');
    tip.innerHTML = `<div class="muted">${fmtDT(near.t)}</div>${rows}`;
    tip.hidden = false; tip.style.left = e.clientX + 14 + 'px'; tip.style.top = e.clientY + 14 + 'px';
  });
  svg.addEventListener('mouseleave', () => { xh.setAttribute('visibility', 'hidden'); tip.hidden = true; });
}

// ---------------- busca de itens ----------------
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
function searchItems(q, { onlyWatched = false, limit = 30 } = {}) {
  const n = norm(q.trim());
  const watched = new Set(S.db.watch.map((w) => w.id));
  let pool = onlyWatched ? S.catalog.filter((c) => watched.has(c.id)) : S.catalog;
  if (!n) return pool.filter((c) => watched.has(c.id)).slice(0, limit);
  const words = n.split(/\s+/);
  const res = [];
  for (const c of pool) {
    const nm = norm(c.name);
    if (!words.every((w) => nm.includes(w))) continue;
    let sc = nm.startsWith(n) ? 0 : nm.includes(n) ? 1 : 2;
    if (watched.has(c.id)) sc -= 3;
    if (c.cat === 'other') sc += 2;
    res.push([sc, c]);
  }
  return res.sort((a, b) => a[0] - b[0] || a[1].name.length - b[1].name.length).slice(0, limit).map((r) => r[1]);
}

// ---------------- modal ----------------
function openModal(html, onMount) {
  $('#modal').innerHTML = html; $('#modalBg').hidden = false; onMount?.($('#modal'));
}
function closeModal() { $('#modalBg').hidden = true; $('#modal').innerHTML = ''; }
$('#modalBg').addEventListener('mousedown', (e) => { if (e.target.id === 'modalBg') closeModal(); });

// Registro rápido de preço: busca → compra → venda → Enter
function quickPrice(preId) {
  if (denyRO()) return;
  let picked = preId ? S.byId.get(preId) : null, sel = 0, results = [];
  openModal(`
    <h2>Registrar preço</h2>
    <div id="qpSearch"><input id="qpQ" type="search" placeholder="Digite o nome do item (ex: coarse, steel, crystal d)…" style="width:100%" autocomplete="off">
    <div class="sresults" id="qpRes"></div></div>
    <div id="qpForm" hidden>
      <div class="picked" id="qpPicked"></div>
      <div class="row">
        <label class="f">Compra (WTB) — você paga<input id="qpBuy" class="price" placeholder="ex: 1,2kk"></label>
        <label class="f">Venda (WTS) — você recebe<input id="qpSell" class="price" placeholder="ex: 1,5kk"></label>
        <label class="f">Data<input id="qpDate" type="datetime-local"></label>
      </div>
      <label class="f" style="margin-top:10px">Cidade onde viu o preço *${citySelect('qpCity', lastCity)}</label>
      <label class="f" style="margin-top:10px">Observação (opcional)<input id="qpNote" placeholder="ex: 50 unidades, vendedor X"></label>
      <div class="pricehelp">Atalhos: <b>k</b> = mil, <b>kk</b> = milhão, <b>kkk</b> = bilhão · 1,5kk · 350k · 1.200.000 · Preencha só um dos dois se quiser.</div>
      <div class="pricehelp" id="qpPreview"></div>
      <div class="row" style="margin-top:16px"><button class="btn ghost" id="qpBack">← Trocar item</button><span class="spacer"></span>
      <label class="row muted" style="gap:6px"><input type="checkbox" id="qpAgain" checked> registrar outro em seguida</label>
      <button class="btn gold" id="qpSave">Salvar <kbd>Enter</kbd></button></div>
    </div>`, (m) => {
    const q = $('#qpQ', m), res = $('#qpRes', m);
    const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    $('#qpDate', m).value = d.toISOString().slice(0, 16);
    const render = () => {
      results = searchItems(q.value, { limit: 40 });
      res.innerHTML = results.map((c, i) => {
        const st = S.stats.get(c.id);
        return `<div class="opt ${i === sel ? 'sel' : ''}" data-i="${i}">${itemCell(c, CATS[c.cat])}<span class="muted" style="font-size:12px">${st ? `<span class="buy">${fmt(st.buy)}</span> / <span class="sell">${fmt(st.sell)}</span>` : ''}</span></div>`;
      }).join('') || '<div class="empty">Nenhum item encontrado</div>';
    };
    const pick = (c) => {
      picked = c; const st = S.stats.get(c.id);
      $('#qpSearch', m).hidden = true; $('#qpForm', m).hidden = false;
      $('#qpPicked', m).innerHTML = `${icon(c, 'lg')}<div style="flex:1"><b>${esc(c.name)}</b><div class="muted" style="font-size:12px">${CATS[c.cat]}${c.npc ? ` · NPC compra por ${fmt(Math.floor(c.npc / 2))}` : ''}</div></div>
        <div class="r" style="font-size:12px">Último: <span class="buy">${fmt(st?.buy)}</span> / <span class="sell">${fmt(st?.sell)}</span><br><span class="muted">${st?.last ? 'há ' + ago(st.last) : 'sem registros'}</span></div>`;
      $('#qpBuy', m).value = ''; $('#qpSell', m).value = ''; $('#qpBuy', m).focus();
    };
    const preview = () => {
      const b = parsePrice($('#qpBuy', m).value), s = parsePrice($('#qpSell', m).value);
      $('#qpPreview', m).innerHTML = `= Compra <b class="buy">${fmtFull(b)}</b> · Venda <b class="sell">${fmtFull(s)}</b>${b && s ? ` · spread ${fmt(s - b)} (${(((s - b) / b) * 100).toFixed(1)}%)` : ''}`;
    };
    const save = async () => {
      const buy = parsePrice($('#qpBuy', m).value), sell = parsePrice($('#qpSell', m).value);
      if (buy === null && sell === null) return toast('Informe ao menos um preço', true);
      if (needCity($('#qpCity', m))) return;
      lastCity = $('#qpCity', m).value;
      try {
        await http('POST', '/api/prices', { itemId: picked.id, buy, sell, city: lastCity, date: new Date($('#qpDate', m).value).toISOString(), note: $('#qpNote', m).value });
        toast(`✔ ${picked.name}: ${fmt(buy)} / ${fmt(sell)} · ${cityShort(lastCity)}`);
        await reload(); route();
        if ($('#qpAgain', m).checked) { picked = null; $('#qpForm', m).hidden = true; $('#qpSearch', m).hidden = false; q.value = ''; sel = 0; render(); q.focus(); $('#qpNote', m).value = ''; }
        else closeModal();
      } catch (e) { toast(e.message, true); }
    };
    q.addEventListener('input', () => { sel = 0; render(); });
    q.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, results.length - 1); render(); e.preventDefault(); }
      if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); render(); e.preventDefault(); }
      if (e.key === 'Enter' && results[sel]) pick(results[sel]);
    });
    res.addEventListener('click', (e) => { const o = e.target.closest('.opt'); if (o) pick(results[o.dataset.i]); });
    for (const id of ['qpBuy', 'qpSell', 'qpNote']) $('#' + id, m).addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
    $('#qpBuy', m).addEventListener('input', preview); $('#qpSell', m).addEventListener('input', preview);
    $('#qpSave', m).onclick = save;
    $('#qpBack', m).onclick = () => { $('#qpForm', m).hidden = true; $('#qpSearch', m).hidden = false; q.focus(); };
    if (picked) pick(picked); else { render(); q.focus(); }
  });
}

function tradeModal(preId, type = 'buy') {
  if (denyRO()) return;
  let picked = preId ? S.byId.get(preId) : null;
  openModal(`<h2>Registrar operação na carteira</h2>
    <div id="tmPick"></div>
    <div class="row" style="margin-top:10px">
      <label class="f">Tipo<select id="tmType"><option value="buy">Comprei</option><option value="sell">Vendi</option></select></label>
      <label class="f">Quantidade<input id="tmQty" class="price" value="1"></label>
      <label class="f">Preço unitário<input id="tmPrice" class="price" placeholder="ex: 350k"></label>
    </div>
    <label class="f" style="margin-top:10px">Observação<input id="tmNote"></label>
    <div class="pricehelp" id="tmPrev"></div>
    <div class="row" style="margin-top:16px"><span class="spacer"></span><button class="btn ghost" id="tmCancel">Cancelar</button><button class="btn gold" id="tmSave">Salvar</button></div>`, (m) => {
    $('#tmType', m).value = type;
    const drawPick = () => {
      if (picked) { $('#tmPick', m).innerHTML = `<div class="picked">${icon(picked, 'lg')}<b style="flex:1">${esc(picked.name)}</b><button class="btn sm" id="tmChange">Trocar</button></div>`; $('#tmChange', m).onclick = () => { picked = null; drawPick(); }; $('#tmPrice', m).focus(); return; }
      $('#tmPick', m).innerHTML = `<input id="tmQ" type="search" placeholder="Buscar item…" style="width:100%"><div class="sresults" id="tmRes"></div>`;
      const q = $('#tmQ', m); let list = [];
      const r = () => { list = searchItems(q.value, { limit: 20 }); $('#tmRes', m).innerHTML = list.map((c, i) => `<div class="opt" data-i="${i}">${itemCell(c, CATS[c.cat])}</div>`).join(''); };
      q.oninput = r; q.onkeydown = (e) => { if (e.key === 'Enter' && list[0]) { picked = list[0]; drawPick(); } };
      $('#tmRes', m).onclick = (e) => { const o = e.target.closest('.opt'); if (o) { picked = list[o.dataset.i]; drawPick(); } };
      r(); q.focus();
    };
    drawPick();
    const prev = () => { const q = parsePrice($('#tmQty', m).value) || 0, p = parsePrice($('#tmPrice', m).value) || 0; $('#tmPrev', m).textContent = `Total: ${fmtFull(q * p)} adena`; };
    $('#tmQty', m).oninput = prev; $('#tmPrice', m).oninput = prev;
    $('#tmCancel', m).onclick = closeModal;
    $('#tmSave', m).onclick = async () => {
      if (!picked) return toast('Escolha um item', true);
      try {
        await http('POST', '/api/trades', { itemId: picked.id, type: $('#tmType', m).value, qty: parsePrice($('#tmQty', m).value), price: parsePrice($('#tmPrice', m).value), note: $('#tmNote', m).value });
        toast('Operação registrada'); closeModal(); await reload(); route();
      } catch (e) { toast(e.message, true); }
    };
  });
}

// ---------------- views ----------------
const views = {};
const watchedStats = () => S.db.watch.map((w) => S.stats.get(w.id)).filter(Boolean);
const withPrice = () => watchedStats().filter((s) => s.ref !== null);

views.dashboard = (el) => {
  const all = withPrice();
  const updated24 = S.db.prices.filter((p) => Date.now() - new Date(p.date) < DAY).length;
  const movers = all.filter((s) => s.ch7 !== null && s.ch7 !== 0);
  const ups = [...movers].sort((a, b) => b.ch7 - a.ch7).filter((s) => s.ch7 > 0).slice(0, 7);
  const downs = [...movers].sort((a, b) => a.ch7 - b.ch7).filter((s) => s.ch7 < 0).slice(0, 7);
  const opps = all.filter((s) => s.signals.length).sort((a, b) => b.score - a.score).slice(0, 7);
  const stale = watchedStats().filter((s) => !s.last || Date.now() - new Date(s.last) > 7 * DAY);
  const pf = portfolio();
  const recent = [...S.db.prices].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);
  const avgCh = movers.length ? movers.reduce((a, s) => a + s.ch7, 0) / movers.length : null;
  const mi = (s, right) => `<div class="mi" data-go="${esc(s.id)}">${itemCell(s.it, `<span class="buy">${fmt(s.buy)}</span> / <span class="sell">${fmt(s.sell)}</span>`)}${spark(s.spark, 70, 22)}<div class="r" style="min-width:80px">${right}</div></div>`;
  el.innerHTML = `
    <h1>Painel do mercado</h1><p class="sub">${esc(S.db.settings.server || 'L2 Reborn — Legacy (C1)')} · visão geral dos itens monitorados</p>
    <div class="grid g4" style="margin-bottom:16px">
      <div class="card kpi"><div class="lbl">Itens monitorados</div><div class="val">${S.db.watch.length}</div><div class="foot">${all.length} com preço registrado</div></div>
      <div class="card kpi"><div class="lbl">Tendência média 7 dias</div><div class="val">${avgCh === null ? '—' : chg(avgCh)}</div><div class="foot">média das variações dos itens</div></div>
      <div class="card kpi"><div class="lbl">Registros nas últimas 24h</div><div class="val">${updated24}</div><div class="foot">${S.db.prices.length} registros no total</div></div>
      <div class="card kpi"><div class="lbl">Carteira (valor de mercado)</div><div class="val">${fmt(pf.value)}</div><div class="foot">Lucro/prejuízo: <span class="${pf.pl >= 0 ? 'up' : 'down'}">${fmt(pf.pl)}</span></div></div>
    </div>
    ${!S.db.prices.length ? `<div class="card adm" style="margin-bottom:16px"><h2>Comece por aqui 👋</h2><p class="reason">1. Clique em <b>Atualizar preços</b> e digite os preços dos materiais que você viu no mercado (aceita 1,5kk / 350k).<br>2. Ou aperte <kbd>N</kbd> em qualquer tela para registrar um único item rapidamente.<br>3. Adicione mais itens ao monitoramento pelo <b>Catálogo C1</b> (3.900 itens com ícones).<br>4. Com alguns dias de registros, o sistema mostra altas, quedas e oportunidades automaticamente.</p><button class="btn gold" onclick="location.hash='#/lote'">Atualizar preços agora</button></div>` : ''}
    <div class="grid g3">
      <div class="card"><h2>▲ Maiores altas <span class="hint">7 dias</span></h2><div class="mlist">${ups.map((s) => mi(s, chg(s.ch7))).join('') || '<div class="empty">Sem dados ainda</div>'}</div></div>
      <div class="card"><h2>▼ Maiores quedas <span class="hint">7 dias</span></h2><div class="mlist">${downs.map((s) => mi(s, chg(s.ch7))).join('') || '<div class="empty">Sem dados ainda</div>'}</div></div>
      <div class="card"><h2>★ Oportunidades <span class="hint"><a href="#/oportunidades">ver todas</a></span></h2><div class="mlist">${opps.map((s) => mi(s, sigTags(s))).join('') || '<div class="empty">Nenhum sinal no momento</div>'}</div></div>
    </div>
    <div class="grid g2" style="margin-top:16px">
      <div class="card flush"><div style="padding:16px 16px 0"><h2>Últimos registros</h2></div><table><thead><tr><th>Item</th><th class="r">Compra</th><th class="r">Venda</th><th class="r">Quando</th></tr></thead><tbody>
        ${recent.map((p) => { const it = S.byId.get(p.itemId); return it ? `<tr class="click" data-go="${esc(it.id)}"><td>${itemCell(it)}</td><td class="r buy">${fmt(p.buy)}</td><td class="r sell">${fmt(p.sell)}</td><td class="r muted">há ${ago(p.date)}</td></tr>` : ''; }).join('') || '<tr><td colspan="4" class="empty">Nenhum registro</td></tr>'}
      </tbody></table></div>
      <div class="card"><h2>Precisam de atualização <span class="hint">sem registro há mais de 7 dias</span></h2>
        <div class="row" style="margin-bottom:10px"><span class="muted">${stale.length} itens</span><span class="spacer"></span><button class="btn sm" onclick="location.hash='#/lote?stale=1'">Atualizar esses</button></div>
        <div class="chips">${stale.slice(0, 40).map((s) => `<span title="${esc(s.it.name)}" data-qp="${esc(s.id)}" style="cursor:pointer">${icon(s.it)}</span>`).join('')}</div></div>
    </div>`;
  el.onclick = (e) => {
    const g = e.target.closest('[data-go]'); if (g) location.hash = '#/item/' + encodeURIComponent(g.dataset.go);
    const q = e.target.closest('[data-qp]'); if (q) quickPrice(q.dataset.qp);
  };
};

// ----- Mercado -----
const mk = { q: '', cat: '', sort: 'name', dir: 1, only: '' };
views.mercado = (el) => {
  const cats = {}; watchedStats().forEach((s) => (cats[s.it.cat] = (cats[s.it.cat] || 0) + 1));
  el.innerHTML = `
    <h1>Mercado</h1><p class="sub">Preços atuais, variação e sinais de todos os itens monitorados. Clique em um item para ver o histórico.</p>
    <div class="toolbar">
      <input type="search" id="mkQ" placeholder="Filtrar itens…" value="${esc(mk.q)}">
      <select id="mkOnly"><option value="">Todos</option><option value="fav">★ Favoritos</option><option value="priced">Com preço</option><option value="nopriced">Sem preço</option><option value="signal">Com sinal</option></select>
      <span class="spacer"></span>
      <button class="btn" onclick="location.hash='#/catalogo'">+ Adicionar itens</button>
      <button class="btn gold" id="mkQuick">+ Registrar preço</button>
    </div>
    <div class="chips" style="margin-bottom:14px"><button class="chip ${!mk.cat ? 'on' : ''}" data-cat="">Todas<b>${S.db.watch.length}</b></button>
      ${CAT_ORDER.filter((c) => cats[c]).map((c) => `<button class="chip ${mk.cat === c ? 'on' : ''}" data-cat="${c}">${CATS[c]}<b>${cats[c]}</b></button>`).join('')}</div>
    <div class="card flush"><div style="overflow:auto;max-height:calc(100vh - 290px)"><table id="mkT"></table></div></div>`;
  $('#mkOnly').value = mk.only;
  const cols = [['', ''], ['name', 'Item'], ['buy', 'Compra (WTB)', 'r'], ['sell', 'Venda (WTS)', 'r'], ['margin', 'Spread', 'r'], ['chLast', 'Últ. var.', 'r'], ['ch7', '7 dias', 'r'], ['ch30', '30 dias', 'r'], ['spark', 'Tendência'], ['npcBuy', 'NPC vende', 'r'], ['npc', 'NPC paga', 'r'], ['score', 'Sinal'], ['last', 'Atualizado', 'r'], ['', '']];
  const draw = () => {
    const n = norm(mk.q);
    let rows = watchedStats().filter((s) => (!mk.cat || s.it.cat === mk.cat) && (!n || norm(s.it.name).includes(n)));
    if (mk.only === 'fav') rows = rows.filter((s) => s.w?.fav);
    if (mk.only === 'priced') rows = rows.filter((s) => s.ref !== null);
    if (mk.only === 'nopriced') rows = rows.filter((s) => s.ref === null);
    if (mk.only === 'signal') rows = rows.filter((s) => s.signals.length);
    const key = { name: (s) => s.it.name, npc: (s) => s.npcSell, npcBuy: (s) => s.it.npc || null, last: (s) => (s.last ? +new Date(s.last) : null) }[mk.sort] || ((s) => s[mk.sort]);
    rows.sort((a, b) => {
      const va = key(a), vb = key(b);
      if (va === null || va === undefined) return 1; if (vb === null || vb === undefined) return -1;
      return (typeof va === 'string' ? va.localeCompare(vb) : va - vb) * mk.dir;
    });
    $('#mkT').innerHTML = `<thead><tr>${cols.map(([k, l, c]) => `<th class="${c || ''} ${k && k !== 'spark' ? 'sort' : ''}" data-k="${k}">${l}${mk.sort === k ? (mk.dir > 0 ? ' ↑' : ' ↓') : ''}</th>`).join('')}</tr></thead><tbody>
      ${rows.map((s) => `<tr class="click" data-id="${esc(s.id)}">
        <td style="width:28px"><button class="star ${s.w?.fav ? 'on' : ''}" data-fav title="Favorito">★</button></td>
        <td>${itemCell(s.it, CATS[s.it.cat])}</td>
        <td class="r buy" title="${fmtFull(s.buy)}">${fmt(s.buy)}</td>
        <td class="r sell" title="${fmtFull(s.sell)}">${fmt(s.sell)}</td>
        <td class="r">${s.spread !== null ? `${fmt(s.spread)}<br><small class="muted">${(s.margin * 100).toFixed(0)}%</small>` : '<span class="muted">—</span>'}</td>
        <td class="r">${chg(s.chLast)}</td><td class="r">${chg(s.ch7)}</td><td class="r">${chg(s.ch30)}</td>
        <td>${spark(s.spark)}</td>
        <td class="r muted" title="Preço da loja do NPC (preço base do item; nem todo item é vendido por NPCs)">${s.it.npc ? fmt(s.it.npc) : '—'}</td>
        <td class="r muted" title="Preço que o NPC paga (metade do preço de loja)">${s.npcSell ? fmt(s.npcSell) : '—'}</td>
        <td>${sigTags(s)}</td>
        <td class="r muted">${s.last ? ago(s.last) : 'nunca'}</td>
        <td class="r"><button class="btn sm" data-qp title="Registrar preço">+ preço</button></td></tr>`).join('') || `<tr><td colspan="14" class="empty">Nenhum item. <a href="#/catalogo">Adicione itens pelo catálogo</a>.</td></tr>`}</tbody>`;
  };
  draw();
  $('#mkQ').oninput = (e) => { mk.q = e.target.value; draw(); };
  $('#mkOnly').onchange = (e) => { mk.only = e.target.value; draw(); };
  $('#mkQuick').onclick = () => quickPrice();
  el.onclick = async (e) => {
    const c = e.target.closest('[data-cat]'); if (c) { mk.cat = c.dataset.cat; return views.mercado(el); }
    const th = e.target.closest('th.sort'); if (th) { const k = th.dataset.k; mk.dir = mk.sort === k ? -mk.dir : (k === 'name' ? 1 : -1); mk.sort = k; return draw(); }
    const tr = e.target.closest('tr[data-id]'); if (!tr) return;
    const id = tr.dataset.id;
    if (e.target.closest('[data-fav]')) { const w = S.stats.get(id).w; await http('PUT', '/api/watch/' + encodeURIComponent(id), { fav: !w.fav }); await reload(); return draw(); }
    if (e.target.closest('[data-qp]')) return quickPrice(id);
    location.hash = '#/item/' + encodeURIComponent(id);
  };
};

// ----- Atualização em lote -----
views.lote = (el, params) => {
  let list = watchedStats();
  const onlyStale = params.get('stale');
  if (onlyStale) list = list.filter((s) => !s.last || Date.now() - new Date(s.last) > 7 * DAY);
  const groups = {}; list.forEach((s) => (groups[s.it.cat] ||= []).push(s));
  el.innerHTML = `
    <h1>Atualizar preços</h1><p class="sub">Digite os preços que você está vendo no mercado agora. Use <kbd>Tab</kbd>/<kbd>Enter</kbd> para ir ao próximo campo. Só as linhas preenchidas são salvas.</p>
    <div class="toolbar">
      <input type="search" id="ltQ" placeholder="Filtrar…">
      <label class="row muted" style="gap:6px"><input type="checkbox" id="ltFav"> só favoritos</label>
      ${onlyStale ? '<a class="btn sm" href="#/lote">mostrar todos</a>' : ''}
      <span class="spacer"></span>
      <label class="row" style="gap:6px">Cidade *${citySelect('ltCity', lastCity)}</label>
      <button class="btn" id="ltPaste">Colar lista de texto</button>
      <button class="btn gold" id="ltSave">Salvar tudo <span id="ltCount"></span></button>
    </div>
    <div class="card flush"><div style="overflow:auto;max-height:calc(100vh - 240px)"><table class="batch"><thead><tr><th>Item</th><th class="r">Último compra / venda</th><th class="r">Compra (WTB)</th><th class="r">Venda (WTS)</th><th>Obs.</th><th class="r">Atualizado</th></tr></thead><tbody>
      ${CAT_ORDER.filter((c) => groups[c]).map((c) => `<tr><td colspan="6" class="section-h">${CATS[c]}</td></tr>` + groups[c].map((s) => `
        <tr data-id="${esc(s.id)}" data-name="${esc(norm(s.it.name))}" data-fav="${s.w?.fav ? 1 : 0}">
          <td>${itemCell(s.it)}</td>
          <td class="r last"><span class="buy">${fmt(s.buy)}</span> / <span class="sell">${fmt(s.sell)}</span></td>
          <td class="r"><input class="price" data-k="buy" placeholder="${s.buy !== null ? fmt(s.buy) : ''}"></td>
          <td class="r"><input class="price" data-k="sell" placeholder="${s.sell !== null ? fmt(s.sell) : ''}"></td>
          <td><input data-k="note" style="width:160px;padding:6px 8px"></td>
          <td class="r muted">${s.last ? ago(s.last) : 'nunca'}</td></tr>`).join('')).join('') || '<tr><td colspan="6" class="empty">Nenhum item monitorado</td></tr>'}
    </tbody></table></div></div>`;
  const inputs = () => $$('.batch input.price, .batch input[data-k=note]').filter((i) => i.closest('tr').style.display !== 'none');
  const count = () => { const n = $$('.batch tr[data-id]').filter((tr) => { const d = $$('input.price', tr).some((i) => i.value.trim()); tr.classList.toggle('dirty', d); return d; }).length; $('#ltCount').textContent = n ? `(${n})` : ''; return n; };
  el.addEventListener('input', count);
  el.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !e.target.matches('.batch input')) return;
    e.preventDefault(); const all = inputs(); const i = all.indexOf(e.target); all[(i + 1) % all.length]?.focus();
  });
  el.addEventListener('focusout', (e) => { // mostra o valor completo interpretado
    if (!e.target.matches('input.price')) return;
    const v = parsePrice(e.target.value); e.target.title = v !== null ? fmtFull(v) : '';
    if (v !== null && /k|m/i.test(e.target.value)) e.target.value = fmtFull(v);
  });
  const filter = () => {
    const n = norm($('#ltQ').value), fav = $('#ltFav').checked;
    $$('.batch tr[data-id]').forEach((tr) => (tr.style.display = (!n || tr.dataset.name.includes(n)) && (!fav || tr.dataset.fav === '1') ? '' : 'none'));
  };
  $('#ltQ').oninput = filter; $('#ltFav').onchange = filter;
  $('#ltSave').onclick = async () => {
    const date = new Date().toISOString();
    const payload = $$('.batch tr[data-id]').map((tr) => ({ itemId: tr.dataset.id, buy: parsePrice($('[data-k=buy]', tr).value), sell: parsePrice($('[data-k=sell]', tr).value), note: $('[data-k=note]', tr).value, date }))
      .filter((p) => p.buy !== null || p.sell !== null);
    if (!payload.length) return toast('Nenhum preço preenchido', true);
    if (needCity($('#ltCity'))) return;
    lastCity = $('#ltCity').value; payload.forEach((p) => (p.city = lastCity));
    try { await http('POST', '/api/prices', payload); toast(`✔ ${payload.length} preços salvos`); await reload(); route(); } catch (e) { toast(e.message, true); }
  };
  $('#ltPaste').onclick = pasteImport;
};

function pasteImport() {
  if (denyRO()) return;
  openModal(`<h2>Importar lista de preços</h2>
    <p class="reason">Uma linha por item: <b>nome ; compra ; venda</b> (separador <b>;</b> ou <b>tab</b> — ideal para colar do Excel/Google Sheets). Deixe vazio o que não souber.</p>
    <label class="f" style="margin-bottom:10px">Cidade onde viu os preços *${citySelect('piCity', lastCity)}</label>
    <textarea id="piT" placeholder="Coarse Bone Powder; 9k; 11k&#10;Steel; 45k; 52k&#10;Crystal: D Grade; ; 1,1k"></textarea>
    <div id="piPrev" class="pricehelp"></div>
    <div class="row" style="margin-top:14px"><span class="spacer"></span><button class="btn ghost" id="piC">Cancelar</button><button class="btn gold" id="piS">Importar</button></div>`, (m) => {
    let parsed = [];
    const parse = () => {
      parsed = $('#piT', m).value.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
        const [name, b, s] = l.split(/\t|;/).map((x) => x.trim());
        const n = norm(name || '');
        const it = S.catalog.find((c) => norm(c.name) === n) || searchItems(name || '', { limit: 1 })[0];
        return { line: name, it, buy: parsePrice(b), sell: parsePrice(s) };
      });
      $('#piPrev', m).innerHTML = parsed.map((p) => p.it ? `✔ ${esc(p.line)} → <b>${esc(p.it.name)}</b> <span class="buy">${fmt(p.buy)}</span> / <span class="sell">${fmt(p.sell)}</span>` : `<span class="down">✖ ${esc(p.line)} — não encontrado</span>`).join('<br>');
    };
    $('#piT', m).oninput = parse; $('#piT', m).focus();
    $('#piC', m).onclick = closeModal;
    $('#piS', m).onclick = async () => {
      const date = new Date().toISOString();
      const ok = parsed.filter((p) => p.it && (p.buy !== null || p.sell !== null)).map((p) => ({ itemId: p.it.id, buy: p.buy, sell: p.sell, date }));
      if (!ok.length) return toast('Nada para importar', true);
      if (needCity($('#piCity', m))) return;
      lastCity = $('#piCity', m).value; ok.forEach((p) => (p.city = lastCity));
      await http('POST', '/api/prices', ok); toast(`✔ ${ok.length} preços importados`); closeModal(); await reload(); route();
    };
  });
}

// ----- Detalhe do item -----
views.item = (el, params, id) => {
  const it = S.byId.get(id); if (!it) { el.innerHTML = '<div class="empty">Item não encontrado</div>'; return; }
  const st = S.stats.get(id) || { list: [], signals: [] };
  const watched = !!st.w;
  const pf = portfolio().rows.find((r) => r.it.id === id);
  el.innerHTML = `
    <div class="row" style="margin-bottom:18px">${icon(it, 'lg')}<div><h1>${esc(it.name)}</h1><div class="muted">${CATS[it.cat]}${it.kind ? ' · ' + esc(it.kind) : ''} · <a href="https://l2hub.info/c1/items/${encodeURIComponent(it.id)}" target="_blank" rel="noopener">ver no l2hub ↗</a></div></div>
      <span class="spacer"></span>
      ${watched ? `<button class="btn star-btn" id="itFav">${st.w.fav ? '★ Favorito' : '☆ Favoritar'}</button><button class="btn danger" id="itUnwatch">Parar de monitorar</button>` : '<button class="btn" id="itWatch">+ Monitorar</button>'}
      <button class="btn" id="itTrade">Registrar compra/venda</button>
      <button class="btn gold" id="itQp">+ Registrar preço</button></div>
    <div class="stat-row" style="margin-bottom:16px">
      <div class="stat"><div class="lbl">Compra (WTB)</div><div class="val buy">${fmt(st.buy)}</div></div>
      <div class="stat"><div class="lbl">Venda (WTS)</div><div class="val sell">${fmt(st.sell)}</div></div>
      <div class="stat"><div class="lbl">Spread</div><div class="val">${st.spread != null ? fmt(st.spread) + ` <small class="muted">${(st.margin * 100).toFixed(0)}%</small>` : '—'}</div></div>
      <div class="stat"><div class="lbl">Variação 7d / 30d</div><div class="val" style="font-size:14px">${chg(st.ch7)} · ${chg(st.ch30)}</div></div>
      <div class="stat"><div class="lbl">Média / mín / máx 30d</div><div class="val" style="font-size:14px">${fmt(st.avg30)} · ${fmt(st.min30)} · ${fmt(st.max30)}</div></div>
      <div class="stat" title="Preço base da loja do NPC. Nem todo item é vendido por NPCs."><div class="lbl">NPC vende · NPC paga</div><div class="val" style="font-size:14px">${it.npc ? fmt(it.npc) : '—'} · ${st.npcSell ? fmt(st.npcSell) : '—'}</div></div>
      <div class="stat"><div class="lbl">Volatilidade 30d</div><div class="val" style="font-size:14px">${st.vol != null ? (st.vol * 100).toFixed(0) + '%' : '—'}</div></div>
    </div>
    <div class="grid" style="grid-template-columns:minmax(0,2fr) minmax(280px,1fr)">
      <div class="card"><div class="row"><h2 style="margin:0">Histórico de preços</h2><span class="spacer"></span><div class="chips" id="itRange">${[['7', '7d'], ['30', '30d'], ['90', '90d'], ['0', 'Tudo']].map(([v, l]) => `<button class="chip ${v === (params.get('r') || '0') ? 'on' : ''}" data-r="${v}">${l}</button>`).join('')}</div></div><div class="chart" id="itChart" style="margin-top:10px"></div></div>
      <div class="grid" style="align-content:start">
        <div class="card"><h2>Análise</h2>${st.signals.length ? st.signals.map((s) => `<div style="margin-bottom:8px"><span class="tag ${s.t}">${s.l}</span> <span class="reason">${esc(s.r)}</span></div>`).join('') : '<p class="reason">Nenhum sinal forte. Continue registrando preços — com 3+ registros o sistema compara com a média de 30 dias.</p>'}</div>
        ${crystalCard(it)}
        ${pf ? `<div class="card"><h2>Na sua carteira</h2><div class="reason">${pf.qty} un · custo médio ${fmt(pf.avg)} · valor ${fmt(pf.value)} · <span class="${pf.unreal >= 0 ? 'up' : 'down'}">${fmt(pf.unreal)}</span></div></div>` : ''}
      </div>
    </div>
    ${cityTable(st.list)}
    <div class="card flush" style="margin-top:16px"><div style="padding:16px 16px 0"><h2>Registros (${st.list.length})</h2></div>
      <table><thead><tr><th>Data</th><th>Cidade</th><th class="r">Compra (WTB)</th><th class="r">Venda (WTS)</th><th class="r">Spread</th><th>Obs.</th><th></th></tr></thead><tbody>
      ${[...st.list].reverse().map((p) => `<tr data-pid="${p.id}"><td>${fmtDT(p.date)}</td><td>${esc(cityShort(p.city))}</td><td class="r buy">${fmtFull(p.buy)}</td><td class="r sell">${fmtFull(p.sell)}</td><td class="r muted">${p.buy != null && p.sell != null ? fmt(p.sell - p.buy) : '—'}</td><td class="muted">${esc(p.note)}</td>
        <td class="r"><button class="btn sm ghost" data-edit>editar</button><button class="btn sm ghost danger" data-del>excluir</button></td></tr>`).join('') || '<tr><td colspan="7" class="empty">Nenhum registro ainda</td></tr>'}
      </tbody></table></div>`;
  const r = Number(params.get('r') || 0);
  const pts = st.list.filter((p) => !r || Date.now() - new Date(p.date) <= r * DAY);
  lineChart($('#itChart'), [
    { name: 'Compra (WTB)', color: '#3987e5', points: pts.filter((p) => p.buy !== null).map((p) => ({ t: +new Date(p.date), v: p.buy })) },
    { name: 'Venda (WTS)', color: '#d95926', points: pts.filter((p) => p.sell !== null).map((p) => ({ t: +new Date(p.date), v: p.sell })) },
  ]);
  const enc = encodeURIComponent(id);
  $('#itQp').onclick = () => quickPrice(id);
  $('#itTrade').onclick = () => tradeModal(id);
  $('#itRange').onclick = (e) => { const c = e.target.closest('[data-r]'); if (c) location.hash = `#/item/${enc}?r=${c.dataset.r}`; };
  if ($('#itWatch')) $('#itWatch').onclick = async () => { await http('POST', '/api/watch', { id }); await reload(); route(); };
  if ($('#itUnwatch')) $('#itUnwatch').onclick = async () => { if (!confirm('Parar de monitorar? O histórico de preços é mantido.')) return; await http('DELETE', '/api/watch/' + enc); await reload(); route(); };
  if ($('#itFav')) $('#itFav').onclick = async () => { await http('PUT', '/api/watch/' + enc, { fav: !st.w.fav }); await reload(); route(); };
  el.onclick = async (e) => {
    const tr = e.target.closest('tr[data-pid]'); if (!tr) return;
    const p = S.db.prices.find((x) => x.id === tr.dataset.pid);
    if (e.target.closest('[data-del]')) { if (!confirm('Excluir este registro?')) return; await http('DELETE', '/api/prices/' + p.id); await reload(); route(); }
    if (e.target.closest('[data-edit]')) editPrice(p);
  };
};

// Preço mais recente por cidade
function byCity(list, days = 30) {
  const out = new Map();
  for (const p of list) {
    if (!p.city || Date.now() - new Date(p.date) > days * DAY) continue;
    const c = out.get(p.city) || { city: p.city, buy: null, sell: null, date: null, n: 0 };
    if (p.buy !== null) c.buy = p.buy;
    if (p.sell !== null) c.sell = p.sell;
    c.date = p.date; c.n++; out.set(p.city, c);
  }
  return [...out.values()];
}
// Cristais gerados ao quebrar (cristalizar) o item e o valor mínimo de cada cristal.
function crystalCard(it) {
  if (!it.cryN) return '';
  const cr = S.byId.get('crystal_' + it.cry.toLowerCase());
  const npcPays = Math.floor((it.npc || 0) / 2);
  const per = npcPays ? npcPays / it.cryN : null;
  const cs = cr && S.stats.get(cr.id);
  const mkt = cs && (cs.buy ?? cs.sell);
  const row = (l, v, t = '') => `<div class="row" style="justify-content:space-between" title="${t}"><span class="muted">${l}</span><b>${v}</b></div>`;
  return `<div class="card"><h2>Cristais ao quebrar</h2>
    <div class="row" style="gap:10px;align-items:center;margin-bottom:10px">${cr ? `<img src="icons/${cr.icon}.png" width="32" height="32" alt="">` : ''}
      <div><div style="font-size:20px"><b>${fmtFull(it.cryN)}</b> × ${cr ? `<a href="#/item/${cr.id}">${esc(cr.name)}</a>` : 'Crystal ' + it.cry}</div></div></div>
    ${row('NPC paga pelo item', npcPays ? fmtFull(npcPays) : '—', 'Metade do preço de loja do NPC')}
    ${row('Valor mínimo por cristal', per != null ? fmtFull(Math.round(per)) : '—', 'NPC paga ÷ quantidade de cristais. Abaixo disso, vale mais vender o item ao NPC do que quebrar.')}
    ${mkt ? row('Cristal no mercado', `<span class="${mkt >= per ? 'up' : 'down'}">${fmtFull(mkt)}</span>`, 'Último preço registrado do cristal') + row('Quebrar rende', fmtFull(mkt * it.cryN)) : ''}
  </div>`;
}

function cityTable(list) {
  const rows = byCity(list);
  if (!rows.length) return '';
  const sells = rows.filter((r) => r.sell !== null), buys = rows.filter((r) => r.buy !== null);
  const minSell = sells.length ? Math.min(...sells.map((r) => r.sell)) : null, maxBuy = buys.length ? Math.max(...buys.map((r) => r.buy)) : null;
  rows.sort((a, b) => CITY_LIST.indexOf(a.city) - CITY_LIST.indexOf(b.city));
  return `<div class="card flush" style="margin-top:16px"><div style="padding:16px 16px 0"><h2>Preço por cidade <span class="hint">último registro de cada cidade nos últimos 30 dias</span></h2></div>
    <table><thead><tr><th>Cidade</th><th class="r">Compra (WTB)</th><th class="r">Venda (WTS)</th><th class="r">Registros</th><th class="r">Atualizado</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td>${esc(r.city)}</td>
      <td class="r buy">${rows.length > 1 && r.buy !== null && r.buy === maxBuy ? '<span class="tag sellrec" title="Onde pagam mais pelo item">melhor p/ vender</span> ' : ''}${fmt(r.buy)}</td>
      <td class="r sell">${rows.length > 1 && r.sell !== null && r.sell === minSell ? '<span class="tag buyrec" title="Onde o item está mais barato">mais barato</span> ' : ''}${fmt(r.sell)}</td>
      <td class="r muted">${r.n}</td><td class="r muted">há ${ago(r.date)}</td></tr>`).join('')}</tbody></table></div>`;
}
function editPrice(p) {
  if (denyRO()) return;
  openModal(`<h2>Editar registro</h2>
    <div class="row"><label class="f">Compra (WTB)<input id="epB" class="price" value="${p.buy ?? ''}"></label>
    <label class="f">Venda (WTS)<input id="epS" class="price" value="${p.sell ?? ''}"></label></div>
    <label class="f" style="margin-top:10px">Cidade *${citySelect('epC', p.city || '')}</label>
    <label class="f" style="margin-top:10px">Observação<input id="epN" value="${esc(p.note || '')}"></label>
    <div class="row" style="margin-top:16px"><span class="spacer"></span><button class="btn ghost" id="epX">Cancelar</button><button class="btn gold" id="epOk">Salvar</button></div>`, (m) => {
    $('#epX', m).onclick = closeModal;
    $('#epOk', m).onclick = async () => {
      const buy = parsePrice($('#epB', m).value), sell = parsePrice($('#epS', m).value);
      if (buy === null && sell === null) return toast('Informe ao menos um preço', true);
      if (needCity($('#epC', m))) return;
      try { await http('PUT', '/api/prices/' + p.id, { buy, sell, city: $('#epC', m).value, note: $('#epN', m).value }); closeModal(); await reload(); route(); } catch (e) { toast(e.message, true); }
    };
  });
}
function arbitrage(all) {
  const out = [];
  for (const s of all) {
    const rows = byCity(s.list, 7);
    const sells = rows.filter((r) => r.sell !== null), buys = rows.filter((r) => r.buy !== null);
    if (!sells.length || !buys.length) continue;
    const cheap = sells.reduce((x, y) => (y.sell < x.sell ? y : x)), rich = buys.reduce((x, y) => (y.buy > x.buy ? y : x));
    if (cheap.city !== rich.city && rich.buy > cheap.sell) { s._arb = { from: cheap.city, to: rich.city, profit: rich.buy - cheap.sell }; out.push({ s, p: s._arb.profit / cheap.sell }); }
  }
  return out.sort((x, y) => y.p - x.p);
}

// ----- Oportunidades -----
views.oportunidades = (el) => {
  const all = withPrice();
  const block = (title, hint, rows, right) => `<div class="card flush"><div style="padding:16px 16px 0"><h2>${title} <span class="hint">${hint}</span></h2></div>
    <table><tbody>${rows.map((s) => `<tr class="click" data-go="${esc(s.id)}"><td>${itemCell(s.it, `<span class="buy">${fmt(s.buy)}</span> / <span class="sell">${fmt(s.sell)}</span>`)}</td><td class="r">${right(s)}</td></tr>`).join('') || '<tr><td class="empty">Nenhum item no momento</td></tr>'}</tbody></table></div>`;
  const below = all.filter((s) => s.avg30 && s.n >= 3).map((s) => ({ s, d: (s.ref - s.avg30) / s.avg30 }));
  el.innerHTML = `<h1>Oportunidades</h1><p class="sub">Sinais calculados automaticamente a partir dos seus registros. Passe o mouse nas etiquetas para ver o motivo.</p>
    <div class="card flush" style="margin-bottom:16px"><div style="padding:16px 16px 0"><h2>Ranking geral</h2></div><table><thead><tr><th>Item</th><th class="r">Compra</th><th class="r">Venda</th><th class="r">7 dias</th><th>Sinais</th><th>Motivo</th></tr></thead><tbody>
    ${all.filter((s) => s.signals.length).sort((a, b) => b.score - a.score).map((s) => `<tr class="click" data-go="${esc(s.id)}"><td>${itemCell(s.it, CATS[s.it.cat])}</td><td class="r buy">${fmt(s.buy)}</td><td class="r sell">${fmt(s.sell)}</td><td class="r">${chg(s.ch7)}</td><td>${sigTags(s)}</td><td class="reason">${esc(s.signals[0].r)}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">Nenhum sinal ainda — registre preços de compra e venda por alguns dias.</td></tr>'}
    </tbody></table></div>
    <div class="grid g2">
      ${block('Flip (comprar e revender)', 'maior spread % entre compra e venda', all.filter((s) => s.margin > 0).sort((a, b) => b.margin - a.margin).slice(0, 12), (s) => `${fmt(s.spread)} <span class="up">(${(s.margin * 100).toFixed(0)}%)</span>`)}
      ${block('Abaixo da média (comprar)', 'preço atual vs média de 30 dias', below.filter((x) => x.d < 0).sort((a, b) => a.d - b.d).slice(0, 12).map((x) => x.s), (s) => chg((s.ref - s.avg30) / s.avg30))}
      ${block('Acima da média (vender)', 'preço atual vs média de 30 dias', below.filter((x) => x.d > 0).sort((a, b) => b.d - a.d).slice(0, 12).map((x) => x.s), (s) => chg((s.ref - s.avg30) / s.avg30))}
      ${block('Momentum (investir)', 'maior alta em 7 dias', all.filter((s) => s.ch7 > 0).sort((a, b) => b.ch7 - a.ch7).slice(0, 12), (s) => chg(s.ch7))}
      ${block('Revenda ao NPC', 'compra no mercado abaixo do que o NPC paga', all.filter((s) => s.npcSell && s.buy !== null && s.buy < s.npcSell).sort((a, b) => (b.npcSell - b.buy) - (a.npcSell - a.buy)), (s) => `+${fmt(s.npcSell - s.buy)}/un`)}
      ${block('Arbitragem entre cidades', 'comprar numa cidade e vender em outra (últimos 7 dias)', arbitrage(all).slice(0, 12).map((x) => x.s), (s) => `+${fmt(s._arb.profit)}/un<br><small class="muted">${esc(cityShort(s._arb.from))} → ${esc(cityShort(s._arb.to))}</small>`)}
      ${block('Mais voláteis', 'oscilam muito — bons para trade, arriscados para guardar', all.filter((s) => s.vol).sort((a, b) => b.vol - a.vol).slice(0, 12), (s) => `${(s.vol * 100).toFixed(0)}%`)}
    </div>`;
  el.onclick = (e) => { const g = e.target.closest('[data-go]'); if (g) location.hash = '#/item/' + encodeURIComponent(g.dataset.go); };
};

// ----- Carteira -----
function portfolio() {
  const map = new Map();
  for (const t of [...S.db.trades].sort((a, b) => new Date(a.date) - new Date(b.date))) {
    const it = S.byId.get(t.itemId); if (!it) continue;
    const r = map.get(t.itemId) || { it, qty: 0, cost: 0, realized: 0, bought: 0 };
    if (t.type === 'buy') { r.qty += t.qty; r.cost += t.qty * t.price; r.bought += t.qty * t.price; }
    else { const avg = r.qty ? r.cost / r.qty : 0; const q = Math.min(t.qty, r.qty); r.realized += t.qty * t.price - q * avg; r.cost -= q * avg; r.qty -= q; }
    map.set(t.itemId, r);
  }
  const rows = [...map.values()].map((r) => {
    const st = S.stats.get(r.it.id);
    const px = st ? st.buy ?? st.sell : null; // valor conservador: quanto pagam (WTB)
    r.avg = r.qty ? r.cost / r.qty : 0; r.px = px; r.value = px !== null ? r.qty * px : r.cost;
    r.unreal = r.value - r.cost; r.st = st; return r;
  });
  const value = rows.reduce((a, r) => a + r.value, 0), cost = rows.reduce((a, r) => a + r.cost, 0), realized = rows.reduce((a, r) => a + r.realized, 0);
  return { rows, value, cost, realized, pl: value - cost + realized };
}
views.carteira = (el) => {
  const pf = portfolio();
  const trades = [...S.db.trades].sort((a, b) => new Date(b.date) - new Date(a.date));
  el.innerHTML = `<h1>Carteira de investimentos</h1><p class="sub">Registre o que você comprou para revender. O valor atual usa o preço de <b>Compra (WTB)</b> mais recente — quanto você conseguiria vender agora.</p>
    <div class="grid g4" style="margin-bottom:16px">
      <div class="card kpi"><div class="lbl">Valor de mercado</div><div class="val">${fmt(pf.value)}</div><div class="foot">${fmtFull(pf.value)} adena</div></div>
      <div class="card kpi"><div class="lbl">Custo em estoque</div><div class="val">${fmt(pf.cost)}</div></div>
      <div class="card kpi"><div class="lbl">Lucro não realizado</div><div class="val ${pf.value - pf.cost >= 0 ? 'up' : 'down'}">${fmt(pf.value - pf.cost)}</div></div>
      <div class="card kpi"><div class="lbl">Lucro realizado (vendas)</div><div class="val ${pf.realized >= 0 ? 'up' : 'down'}">${fmt(pf.realized)}</div></div>
    </div>
    <div class="toolbar"><span class="spacer"></span><button class="btn" id="pfSell">Registrar venda</button><button class="btn gold" id="pfBuy">Registrar compra</button></div>
    <div class="card flush" style="margin-bottom:16px"><table><thead><tr><th>Item</th><th class="r">Qtd</th><th class="r">Custo médio</th><th class="r">Preço atual</th><th class="r">Valor</th><th class="r">Resultado</th><th class="r">%</th><th class="r">Realizado</th><th>Sinal</th></tr></thead><tbody>
      ${pf.rows.filter((r) => r.qty > 0 || r.realized).map((r) => `<tr class="click" data-go="${esc(r.it.id)}"><td>${itemCell(r.it)}</td><td class="r">${fmtFull(r.qty)}</td><td class="r">${fmt(r.avg)}</td><td class="r">${fmt(r.px)}</td><td class="r">${fmt(r.value)}</td>
        <td class="r ${r.unreal >= 0 ? 'up' : 'down'}">${fmt(r.unreal)}</td><td class="r">${r.cost ? chg(r.unreal / r.cost) : '—'}</td><td class="r ${r.realized >= 0 ? 'up' : 'down'}">${fmt(r.realized)}</td><td>${r.st ? sigTags(r.st) : ''}</td></tr>`).join('') || '<tr><td colspan="9" class="empty">Nenhuma posição. Clique em “Registrar compra”.</td></tr>'}
    </tbody></table></div>
    <div class="card flush"><div style="padding:16px 16px 0"><h2>Histórico de operações</h2></div><table><thead><tr><th>Data</th><th>Item</th><th>Tipo</th><th class="r">Qtd</th><th class="r">Preço un.</th><th class="r">Total</th><th>Obs.</th><th></th></tr></thead><tbody>
      ${trades.map((t) => { const it = S.byId.get(t.itemId); return `<tr><td>${fmtDT(t.date)}</td><td>${it ? itemCell(it) : t.itemId}</td><td>${t.type === 'buy' ? '<span class="buy">Compra</span>' : '<span class="sell">Venda</span>'}</td><td class="r">${fmtFull(t.qty)}</td><td class="r">${fmt(t.price)}</td><td class="r">${fmt(t.qty * t.price)}</td><td class="muted">${esc(t.note)}</td><td class="r"><button class="btn sm ghost danger" data-del="${t.id}">excluir</button></td></tr>`; }).join('') || '<tr><td colspan="8" class="empty">Sem operações</td></tr>'}
    </tbody></table></div>`;
  $('#pfBuy').onclick = () => tradeModal(null, 'buy');
  $('#pfSell').onclick = () => tradeModal(null, 'sell');
  el.onclick = async (e) => {
    const d = e.target.closest('[data-del]'); if (d) { if (confirm('Excluir operação?')) { await http('DELETE', '/api/trades/' + d.dataset.del); await reload(); route(); } return; }
    const g = e.target.closest('[data-go]'); if (g) location.hash = '#/item/' + encodeURIComponent(g.dataset.go);
  };
};

// ----- Catálogo -----
const cg = { q: '', cat: 'basic', page: 0 };
views.catalogo = (el) => {
  const counts = {}; S.catalog.forEach((c) => (counts[c.cat] = (counts[c.cat] || 0) + 1));
  el.innerHTML = `<h1>Catálogo C1</h1><p class="sub">${S.catalog.length.toLocaleString('pt-BR')} itens do Lineage 2 Harbingers of War com ícones. Clique em <b>+</b> para monitorar um item.</p>
    <div class="toolbar"><input type="search" id="cgQ" placeholder="Buscar em todo o catálogo…" value="${esc(cg.q)}"><span class="spacer"></span><button class="btn" id="cgAll">Monitorar todos desta lista</button></div>
    <div class="chips" style="margin-bottom:14px">${CAT_ORDER.filter((c) => counts[c]).map((c) => `<button class="chip ${cg.cat === c ? 'on' : ''}" data-cat="${c}">${CATS[c]}<b>${counts[c] || 0}</b></button>`).join('')}</div>
    <div class="catgrid" id="cgG"></div><div class="row" style="justify-content:center;margin-top:14px" id="cgP"></div>`;
  let list = [];
  const PER = 120;
  const draw = () => {
    const watched = new Set(S.db.watch.map((w) => w.id));
    list = cg.q ? searchItems(cg.q, { limit: 2000 }) : S.catalog.filter((c) => c.cat === cg.cat);
    const pages = Math.ceil(list.length / PER); cg.page = Math.min(cg.page, Math.max(0, pages - 1));
    $('#cgG').innerHTML = list.slice(cg.page * PER, (cg.page + 1) * PER).map((c) => `<div class="catitem ${watched.has(c.id) ? 'watched' : ''}" data-id="${esc(c.id)}">${itemCell(c, (cg.q ? CATS[c.cat] + ' · ' : '') + (c.npc ? 'Loja NPC ' + fmt(c.npc) : (c.kind || '&nbsp;')))}
      ${watched.has(c.id) ? '<button class="btn sm" data-open title="Abrir">✓</button>' : '<button class="btn sm" data-add title="Monitorar">+</button>'}</div>`).join('') || '<div class="empty">Nada encontrado</div>';
    $('#cgP').innerHTML = pages > 1 ? Array.from({ length: pages }, (_, i) => `<button class="chip ${i === cg.page ? 'on' : ''}" data-page="${i}">${i + 1}</button>`).join('') : '';
  };
  draw();
  $('#cgQ').oninput = (e) => { cg.q = e.target.value; cg.page = 0; draw(); };
  $('#cgAll').onclick = async () => {
    if (list.length > 300 && !confirm(`Adicionar ${list.length} itens ao monitoramento?`)) return;
    await http('POST', '/api/watch', { ids: list.map((c) => c.id) }); toast(`${list.length} itens monitorados`); await reload(); draw();
  };
  el.onclick = async (e) => {
    const c = e.target.closest('[data-cat]'); if (c) { cg.cat = c.dataset.cat; cg.q = ''; cg.page = 0; return views.catalogo(el); }
    const p = e.target.closest('[data-page]'); if (p) { cg.page = +p.dataset.page; draw(); return el.scrollIntoView(); }
    const ci = e.target.closest('.catitem'); if (!ci) return;
    if (e.target.closest('[data-add]')) { await http('POST', '/api/watch', { id: ci.dataset.id }); toast('Adicionado: ' + S.byId.get(ci.dataset.id).name); await reload(); return draw(); }
    location.hash = '#/item/' + encodeURIComponent(ci.dataset.id);
  };
};

// ----- Backup & ajustes -----
views.config = (el) => {
  el.innerHTML = `<h1>Backup & Ajustes</h1><p class="sub">Seus dados ficam salvos na nuvem (Supabase), sincronizados em qualquer dispositivo onde você entrar com sua conta.</p>
    <div class="grid g2">
      <div class="card adm"><h2>Servidor</h2><label class="f">Nome exibido<input id="cfS" value="${esc(S.db.settings.server || '')}"></label><button class="btn sm" id="cfSave" style="margin-top:10px">Salvar</button></div>
      <div class="card"><h2>Exportar</h2><p class="reason">Backup completo (JSON) ou planilha do histórico de preços (CSV, abre no Excel).</p>
        <div class="row"><button class="btn gold" id="cfJson">Baixar backup JSON</button><button class="btn" id="cfCsv">Exportar preços CSV</button><button class="btn" id="cfCsv2">Exportar resumo do mercado CSV</button></div></div>
      <div class="card adm"><h2>Importar backup</h2><p class="reason">Substitui todos os dados atuais pelo arquivo (uma cópia de segurança do estado atual é salva antes).</p><input type="file" id="cfFile" accept=".json"></div>
      <div class="card"><h2>Como os sinais funcionam</h2><div class="reason">
        <b>Compra (WTB)</b>: preço que os jogadores pagam pelo item (lojas de compra / “WTB”).<br>
        <b>Venda (WTS)</b>: preço pedido nas lojas de venda (“WTS”).<br>
        <span class="tag flip">FLIP</span> spread ≥ 12%: compre pela WTB (abra loja de compra) e revenda pela WTS.<br>
        <span class="tag buyrec">COMPRAR</span> preço ≥ 10% abaixo da média de 30 dias.<br>
        <span class="tag sellrec">VENDER</span> preço ≥ 10% acima da média de 30 dias.<br>
        <span class="tag flip">ALTA</span> subiu ≥ 15% em 7 dias.<br>
        <span class="tag npc">NPC</span> o NPC paga (metade do preço de loja) mais que o preço de compra do mercado.<br>
        <span class="tag alert">ALVO</span> atingiu o preço-alvo que você definiu no item.</div></div>
    </div>`;
  const dl = (name, text, type) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); };
  const stamp = new Date().toISOString().slice(0, 10);
  $('#cfSave').onclick = async () => { await http('PUT', '/api/settings', { server: $('#cfS').value }); await reload(); setServerName(); toast('Salvo'); };
  $('#cfJson').onclick = () => dl(`l2price-backup-${stamp}.json`, JSON.stringify(S.db, null, 1), 'application/json');
  const csv = (rows) => '﻿' + rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
  $('#cfCsv').onclick = () => dl(`l2price-precos-${stamp}.csv`, csv([['Data', 'Item', 'Categoria', 'Cidade', 'Compra', 'Venda', 'Obs'], ...[...S.db.prices].sort((a, b) => new Date(a.date) - new Date(b.date)).map((p) => { const it = S.byId.get(p.itemId); return [new Date(p.date).toLocaleString('pt-BR'), it?.name, CATS[it?.cat], p.city || '', p.buy, p.sell, p.note]; })]), 'text/csv');
  $('#cfCsv2').onclick = () => dl(`l2price-mercado-${stamp}.csv`, csv([['Item', 'Categoria', 'Compra', 'Venda', 'Spread', 'Var 7d %', 'Var 30d %', 'Média 30d', 'NPC paga', 'Sinais', 'Atualizado'], ...watchedStats().map((s) => [s.it.name, CATS[s.it.cat], s.buy, s.sell, s.spread, s.ch7 != null ? (s.ch7 * 100).toFixed(1) : '', s.ch30 != null ? (s.ch30 * 100).toFixed(1) : '', s.avg30 ? Math.round(s.avg30) : '', s.npcSell || '', s.signals.map((x) => x.l).join(' '), s.last ? new Date(s.last).toLocaleString('pt-BR') : ''])]), 'text/csv');
  $('#cfFile').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (!confirm('Substituir todos os dados atuais por este backup?')) return;
    try { await http('POST', '/api/import', JSON.parse(await f.text())); await reload(); toast('Backup importado'); route(); } catch (err) { toast(err.message, true); }
  };
};

// ---------------- roteador ----------------
function route() {
  const h = location.hash.slice(2) || 'dashboard';
  const [pathPart, qs] = h.split('?');
  const [name, ...rest] = pathPart.split('/');
  let v = views[name] ? name : 'dashboard';
  if (!ADMIN && v === 'lote') v = 'mercado';
  $$('nav a').forEach((a) => a.classList.toggle('active', a.dataset.route === v || (v === 'item' && a.dataset.route === 'mercado')));
  const el = $('#app'); el.onclick = null;
  const fresh = el.cloneNode(false); el.replaceWith(fresh); // remove listeners antigos
  views[v](fresh, new URLSearchParams(qs || ''), decodeURIComponent(rest.join('/')));
}
const setServerName = () => ($('#serverName').textContent = S.db.settings.server || 'L2 Reborn · Legacy C1');

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('#loginBg').hidden) return ($('#loginBg').hidden = true);
  if (e.key === 'Escape' && !$('#modalBg').hidden) return closeModal();
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
  if (!typing && $('#modalBg').hidden && (e.key === 'n' || e.key === 'N')) { e.preventDefault(); quickPrice(); }
});
$('#quickBtn').onclick = () => quickPrice();
window.addEventListener('hashchange', route);
let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => location.hash.startsWith('#/item/') && route(), 250); });

// ---------------- login / inicialização ----------------
let started = false;
function passwordModal(first) {
  openModal(`<h2>${first ? 'Crie sua senha' : 'Trocar senha'}</h2>
    ${first ? '<p class="reason">Bem-vindo! Defina uma senha para entrar nas próximas vezes com seu e-mail.</p>' : ''}
    <label class="f">Nova senha (mínimo 6 caracteres)<input type="password" id="pw1" autocomplete="new-password"></label>
    <label class="f" style="margin-top:10px">Repita a senha<input type="password" id="pw2" autocomplete="new-password"></label>
    <div class="row" style="margin-top:16px"><span class="spacer"></span>${first ? '' : '<button class="btn ghost" id="pwX">Cancelar</button>'}<button class="btn gold" id="pwOk">Salvar senha</button></div>`, (m) => {
    if (!first) $('#pwX', m).onclick = closeModal;
    $('#pw1', m).focus();
    $('#pwOk', m).onclick = async () => {
      const p1 = $('#pw1', m).value, p2 = $('#pw2', m).value;
      if (p1.length < 6) return toast('A senha precisa ter pelo menos 6 caracteres', true);
      if (p1 !== p2) return toast('As senhas não conferem', true);
      const { error } = await sb.auth.updateUser({ password: p1 });
      if (error) return toast(error.message, true);
      toast('Senha salva!'); closeModal();
    };
  });
}

// Sessão: visitantes veem tudo sem login (somente leitura); administradores entram para editar.
let currentUser; // undefined = ainda não carregou; null = visitante
async function applySession(user) {
  const uid = user?.id || null;
  const changed = currentUser === undefined || (currentUser?.id || null) !== uid;
  currentUser = user || null;
  $('#userBox').hidden = !user; $('#loginBtn').hidden = !!user;
  if (user) { $('#userEmail').textContent = user.email; $('#loginBg').hidden = true; }
  if (!changed) return;
  try {
    ADMIN = user ? await checkAdmin() : false;
    if (!user) await checkAdmin(); // zera o estado de admin na camada de dados
    document.body.classList.toggle('readonly', !ADMIN);
    $('#roleTag').textContent = ADMIN ? 'administrador' : 'somente leitura';
    if (!S.db) $('#app').innerHTML = '<div class="empty">Carregando dados do mercado…</div>';
    await reload(); setServerName(); route();
  } catch (e) {
    $('#app').innerHTML = `<div class="empty">Erro ao carregar dados: ${esc(e.message)}</div>`;
  }
}
function openLogin() { $('#lgMsg').textContent = ''; $('#loginBg').hidden = false; $('#lgEmail').focus(); }

(async () => {
  S.catalog = await (await fetch('data/catalog.json')).json();
  S.byId = new Map(S.catalog.map((c) => [c.id, c]));
  setCatalog(S.catalog);
  if (!configured) { $('#app').innerHTML = '<div class="empty">Supabase não configurado: preencha <b>public/config.js</b>.</div>'; return; }

  $('#loginBtn').onclick = openLogin;
  $('#lgClose').onclick = () => ($('#loginBg').hidden = true);
  $('#loginBg').addEventListener('mousedown', (e) => { if (e.target.id === 'loginBg') $('#loginBg').hidden = true; });
  $('#loginForm').onsubmit = async (e) => {
    e.preventDefault();
    const email = $('#lgEmail').value.trim(), password = $('#lgPass').value;
    $('#lgBtn').disabled = true; $('#lgMsg').textContent = '';
    const { error } = await sb.auth.signInWithPassword({ email, password });
    $('#lgBtn').disabled = false;
    if (error) return ($('#lgMsg').innerHTML = `<span class="down">${esc(error.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos' : error.message)}</span>`);
    $('#lgPass').value = '';
  };
  $('#logoutBtn').onclick = async (e) => { e.preventDefault(); await sb.auth.signOut(); };
  $('#pwdBtn').onclick = (e) => { e.preventDefault(); passwordModal(false); };
  $('#lgForgot').onclick = async (e) => {
    e.preventDefault();
    const email = $('#lgEmail').value.trim();
    if (!email) return ($('#lgMsg').innerHTML = '<span class="down">Digite seu e-mail no campo acima e clique de novo em "Esqueci minha senha".</span>');
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.href.split('#')[0] });
    $('#lgMsg').innerHTML = error ? `<span class="down">${esc(error.message)}</span>` : '<span class="up">Enviamos um link para seu e-mail. Abra-o para criar uma nova senha.</span>';
  };
  let askPwd = window.__authType === 'invite' || window.__authType === 'recovery';

  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') askPwd = true;
    setTimeout(async () => { // fora do callback (recomendação do supabase-js)
      await applySession(session?.user || null);
      if (askPwd && session?.user) { askPwd = false; passwordModal(true); }
    });
  });
})();
