// Market Mood Index: Tickertape's official MMI when reachable, otherwise our own
// "Mood Index (calculated)" from VIX, NIFTY vs DMAs, breadth, FII/DII and gold vs equity.
import * as data from './data.js';
import * as store from './lib/store.js';
import { sma, pctReturn } from './analytics/indicators.js';
import { istDateStr } from './lib/time.js';

const clamp = (x) => Math.max(0, Math.min(100, x));
export const ZONES = [
  { max: 30, key: 'extreme-fear', label: 'Extreme Fear', tip: 'Extreme fear — historically a good time to look for quality entries.' },
  { max: 50, key: 'fear', label: 'Fear', tip: 'Fear zone — look for entries in strong stocks.' },
  { max: 70, key: 'greed', label: 'Greed', tip: 'Greed zone — be selective, avoid chasing.' },
  { max: 101, key: 'extreme-greed', label: 'Extreme Greed', tip: 'Extreme greed — be cautious; consider booking partial profits.' },
];
export function zoneOf(v) { return ZONES.find((z) => v < z.max) || ZONES[3]; }

export function components({ vix, nifty, sma50, sma200, adRatio, fiiNet, diiNet, niftyRet1m, goldRet1m }) {
  const c = [];
  if (vix != null) c.push({ name: 'India VIX', value: vix, score: clamp(((24 - vix) / 13) * 80 + 10), weight: 25 });
  if (nifty && sma50) c.push({ name: 'NIFTY vs 50 DMA', value: ((nifty - sma50) / sma50) * 100, score: clamp(50 + ((nifty - sma50) / sma50) * 100 * 7), weight: 20 });
  if (nifty && sma200) c.push({ name: 'NIFTY vs 200 DMA', value: ((nifty - sma200) / sma200) * 100, score: clamp(50 + ((nifty - sma200) / sma200) * 100 * 3.5), weight: 20 });
  if (adRatio != null && isFinite(adRatio)) c.push({ name: 'Advance / Decline', value: adRatio, score: clamp(50 + Math.log2(adRatio) * 35), weight: 15 });
  if (fiiNet != null) c.push({ name: 'FII + DII net (₹ cr)', value: fiiNet + (diiNet || 0) * 0.5, score: clamp(50 + ((fiiNet + (diiNet || 0) * 0.5) / 4000) * 40), weight: 10 });
  if (niftyRet1m != null && goldRet1m != null) c.push({ name: 'Equity vs gold (1M)', value: niftyRet1m - goldRet1m, score: clamp(50 + (niftyRet1m - goldRet1m) * 6), weight: 10 });
  const w = c.reduce((s, x) => s + x.weight, 0);
  return { value: w ? c.reduce((s, x) => s + x.score * x.weight, 0) / w : null, components: c };
}

async function calculated() {
  const [niftyBars, vixQ, br, fd, gold] = await Promise.all([
    data.history('NIFTY', 'NSE', '2y'), data.quotes([{ symbol: 'INDIAVIX' }, { symbol: 'NIFTY' }]),
    data.breadth().catch(() => null), data.fiiDii().catch(() => null), data.history('GOLDBEES', 'NSE', '1y').catch(() => []),
  ]);
  const closes = niftyBars.map((b) => b.c);
  const nifty = vixQ.NIFTY?.price ?? closes[closes.length - 1];
  const res = components({
    vix: vixQ.INDIAVIX?.price, nifty, sma50: sma(closes, 50).at(-1), sma200: sma(closes, 200).at(-1),
    adRatio: br?.ratio, fiiNet: fd?.fiiNet, diiNet: fd?.diiNet, niftyRet1m: pctReturn(niftyBars, 30), goldRet1m: gold.length ? pctReturn(gold, 30) : null,
  });
  return { ...res, source: 'Mood Index (calculated)' };
}

// Backfill history from VIX/NIFTY/gold bars (breadth & flows unavailable historically)
async function backfill(days = 30) {
  const [nb, vb, gb] = await Promise.all([data.history('NIFTY', 'NSE', '2y'), data.history('INDIAVIX', 'NSE', '1y'), data.history('GOLDBEES', 'NSE', '1y').catch(() => [])]);
  const closes = nb.map((b) => b.c);
  const s50 = sma(closes, 50), s200 = sma(closes, 200);
  const out = [];
  for (let i = Math.max(0, nb.length - days); i < nb.length; i++) {
    const d = new Date(nb[i].t + 19800000).toISOString().slice(0, 10);
    const vix = [...vb].reverse().find((b) => b.t <= nb[i].t + 86400000)?.c;
    const sub = nb.slice(0, i + 1);
    const gsub = gb.filter((b) => b.t <= nb[i].t + 86400000);
    const r = components({ vix, nifty: closes[i], sma50: s50[i], sma200: s200[i], niftyRet1m: pctReturn(sub, 30), goldRet1m: gsub.length ? pctReturn(gsub, 30) : null });
    if (r.value != null) out.push({ date: d, value: Math.round(r.value * 10) / 10, source: 'calculated' });
  }
  return out;
}

export async function getMood() {
  const db = store.get();
  let cur;
  try {
    const tt = await data.tickertapeMmi();
    cur = { value: tt.value, source: tt.source, official: true, components: [] };
    if (tt.history?.length) {
      for (const h of tt.history) upsert(db, { date: h.date, value: h.value, source: 'tickertape' });
    }
  } catch {
    cur = { ...(await calculated()), official: false };
  }
  if (cur.value == null) throw new Error('Mood index unavailable');
  cur.value = Math.round(cur.value * 10) / 10;
  upsert(db, { date: istDateStr(), value: cur.value, source: cur.official ? 'tickertape' : 'calculated' });
  if (db.mmiHistory.length < 20) {
    try { for (const h of await backfill(30)) if (!db.mmiHistory.find((x) => x.date === h.date)) db.mmiHistory.push(h); } catch {}
    db.mmiHistory.sort((a, b) => a.date.localeCompare(b.date));
  }
  db.mmiHistory = db.mmiHistory.slice(-400);
  store.save();
  const z = zoneOf(cur.value);
  return { ...cur, zone: z.key, zoneLabel: z.label, tip: z.tip, history: db.mmiHistory.slice(-30), label: cur.official ? 'Market Mood Index (Tickertape)' : 'Mood Index (calculated)' };
}

function upsert(db, rec) {
  const i = db.mmiHistory.findIndex((x) => x.date === rec.date);
  if (i >= 0) db.mmiHistory[i] = rec; else db.mmiHistory.push(rec);
  db.mmiHistory.sort((a, b) => a.date.localeCompare(b.date));
}
