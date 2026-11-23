// Alert engine: price targets/stop-loss, ±X% moves, entry-zone entries, Shariah
// status changes, multibagger score changes, and news for holdings.
import * as store from './lib/store.js';
import { pushAll } from './push.js';
import { istDateStr } from './lib/time.js';
import { inr, pct } from './lib/format.js';

export function notify({ kind, symbol, title, body, url }) {
  const db = store.get();
  const a = { id: store.uid(), ts: Date.now(), kind, symbol, title, body, url: url || (symbol ? `/stock/${symbol}` : '/'), seen: false };
  db.alerts.unshift(a);
  db.alerts = db.alerts.slice(0, 300);
  store.save();
  pushAll({ title, body, url: a.url, tag: `${kind}:${symbol || ''}` }).catch(() => {});
  return a;
}

function once(key, fn) {
  const db = store.get();
  const today = istDateStr();
  if (db.fired[key] === today) return false;
  db.fired[key] = today;
  fn();
  return true;
}

// items: [{symbol,name,price,changePct, target, stopLoss, entry, source:'holding'|'watch'}]
export function checkPrices(items) {
  const db = store.get();
  const move = db.settings.moveAlertPct || 5;
  for (const it of items) {
    if (it.price == null) continue;
    const nm = it.name || it.symbol;
    if (it.target && it.price >= it.target) once(`tgt:${it.symbol}:${it.target}`, () => notify({ kind: 'price', symbol: it.symbol, title: `🎯 ${nm} hit target ${inr(it.target, 2)}`, body: `Now ${inr(it.price, 2)}` }));
    if (it.stopLoss && it.price <= it.stopLoss) once(`sl:${it.symbol}:${it.stopLoss}`, () => notify({ kind: 'price', symbol: it.symbol, title: `🛑 ${nm} fell to stop-loss ${inr(it.stopLoss, 2)}`, body: `Now ${inr(it.price, 2)}` }));
    if (it.changePct != null && Math.abs(it.changePct) >= move) once(`mv:${it.symbol}:${Math.sign(it.changePct)}`, () => notify({ kind: 'move', symbol: it.symbol, title: `${it.changePct > 0 ? '▲' : '▼'} ${nm} ${pct(it.changePct)} today`, body: `Price ${inr(it.price, 2)}` }));
    if (it.entry?.status) {
      const prev = db.entryZoneState[it.symbol];
      if (prev && prev !== 'in' && it.entry.status === 'in') once(`ez:${it.symbol}`, () => notify({ kind: 'entry', symbol: it.symbol, title: `🟢 ${nm} entered its entry zone`, body: `Zone ${inr(it.entry.zoneLow, 1)}–${inr(it.entry.zoneHigh, 1)}, SL ${inr(it.entry.stopLoss, 1)}. Technical guide only, not advice.` }));
      if (prev && prev !== 'exit' && it.entry.status === 'exit' && it.source === 'holding') once(`ex:${it.symbol}`, () => notify({ kind: 'entry', symbol: it.symbol, title: `🔴 ${nm} is below its stop-loss`, body: `Price ${inr(it.price, 2)} < SL ${inr(it.entry.stopLoss, 2)}` }));
      db.entryZoneState[it.symbol] = it.entry.status;
    }
  }
  for (const r of db.alertRules.filter((r) => r.active)) {
    const it = items.find((i) => i.symbol === r.symbol);
    if (!it || it.price == null) continue;
    const hit = r.kind === 'above' ? it.price >= r.value : r.kind === 'below' ? it.price <= r.value : r.kind === 'movePct' ? Math.abs(it.changePct || 0) >= r.value : false;
    if (hit) once(`rule:${r.id}`, () => notify({ kind: 'rule', symbol: r.symbol, title: `🔔 ${it.name || r.symbol}: ${r.kind === 'above' ? 'above' : r.kind === 'below' ? 'below' : 'moved ≥'} ${r.kind === 'movePct' ? r.value + '%' : inr(r.value, 2)}`, body: `Now ${inr(it.price, 2)} (${pct(it.changePct)})` }));
  }
  store.save();
}

export function checkShariah(analyses) {
  const db = store.get();
  for (const a of analyses) {
    const st = a.shariah?.status; if (!st) continue;
    const prev = db.shariahHistory[a.symbol];
    if (prev && prev.status !== st) notify({ kind: 'shariah', symbol: a.symbol, title: `☪ ${a.profile?.name || a.symbol}: Shariah status changed`, body: `${prev.status} → ${st}` });
    if (!prev || prev.status !== st) db.shariahHistory[a.symbol] = { status: st, date: istDateStr() };
  }
  store.save();
}

export function checkScores(analyses) {
  const db = store.get();
  const month = istDateStr().slice(0, 7);
  for (const a of analyses) {
    const s = a.scores?.multibagger?.score; if (s == null) continue;
    const hist = (db.scoreHistory[a.symbol] = db.scoreHistory[a.symbol] || []);
    const last = hist[hist.length - 1];
    if (last?.month === month) { last.score = s; continue; }
    if (last && Math.abs(s - last.score) >= 10) notify({ kind: 'score', symbol: a.symbol, title: `${s > last.score ? '⬆' : '⬇'} ${a.profile?.name || a.symbol}: score ${last.score} → ${s}`, body: 'Multibagger potential score changed by 10+ points since last month (not a guarantee).' });
    hist.push({ month, score: s });
    if (hist.length > 36) hist.shift();
  }
  store.save();
}

export function checkNews(newsItems, holdingSymbols) {
  const db = store.get();
  const fresh = Date.now() - 12 * 3600000;
  for (const n of newsItems) {
    if (!holdingSymbols.includes(n.symbol) || db.newsSeen[n.url] || n.ts < fresh) continue;
    db.newsSeen[n.url] = Date.now();
    if (n.sentiment === 'Negative' || n.tag) notify({ kind: 'news', symbol: n.symbol, title: `${n.tag ? '📅 ' + n.tag : '📰 Negative news'}: ${n.symbol}`, body: n.title, url: n.url });
  }
  const cut = Date.now() - 14 * 86400000;
  for (const [k, v] of Object.entries(db.newsSeen)) if (v < cut) delete db.newsSeen[k];
  store.save();
}
