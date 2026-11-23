// Data facade: picks live providers or demo data, adds caching and graceful failure.
import { config } from './config.js';
import { cached } from './lib/cache.js';
import { yahooTicker, INDICES } from './providers/symbols.js';
import * as Y from './providers/yahoo.js';
import * as NSE from './providers/nse.js';
import * as AMFI from './providers/amfi.js';
import * as NEWS from './providers/news.js';
import * as TT from './providers/tickertape.js';
import * as MOCK from './providers/mock.js';
import { UNIVERSE_MAP } from './lib/universe.js';

export const demo = config.dataMode === 'demo';
const MIN = 60000, HOUR = 3600000, DAY = 86400000;

export const health = { lastOk: {}, lastErr: {} };
function track(name, p) {
  return p.then((v) => { health.lastOk[name] = Date.now(); delete health.lastErr[name]; return v; },
    (e) => { health.lastErr[name] = { at: Date.now(), msg: String(e.message || e).slice(0, 200) }; throw e; });
}

// items: [{symbol, exchange}] -> { [symbol]: quote }
export async function quotes(items, ttl = 55000) {
  if (!items.length) return {};
  if (demo) return Object.fromEntries(items.map((i) => [i.symbol, MOCK.quote(i.symbol)]));
  const key = 'q:' + items.map((i) => yahooTicker(i.symbol, i.exchange)).sort().join(',');
  const byTicker = await cached(key, ttl, () => track('yahoo', Y.quotes(items)), { persist: true });
  const out = {};
  for (const i of items) {
    const q = byTicker[yahooTicker(i.symbol, i.exchange)];
    if (q) out[i.symbol] = byTicker.stale ? { ...q, stale: true } : q;
  }
  return out;
}

export async function indices() {
  const items = INDICES.map((i) => ({ symbol: i.key, exchange: 'NSE' }));
  const q = await quotes(items);
  return INDICES.map((i) => ({ ...(q[i.key] || {}), key: i.key, name: i.name }));
}

export async function history(symbol, exchange = 'NSE', range = '1y') {
  if (demo) return MOCK.history(symbol, range);
  const ttl = range === '1d' ? 55000 : range === '5d' ? 5 * MIN : 6 * HOUR;
  return cached(`h:${symbol}:${exchange}:${range}`, ttl, () => track('yahoo', Y.history(symbol, exchange, range)), { persist: range !== '1d' });
}

export async function fundamentals(symbol, exchange = 'NSE') {
  if (demo) return MOCK.fundamentals(symbol);
  return cached(`f:${symbol}:${exchange}`, DAY, () => track('yahoo', Y.fundamentals(symbol, exchange)), { persist: true });
}

export async function stockNews(name, symbol) {
  if (demo) return MOCK.stockNews(name, symbol);
  return cached(`n:${symbol}`, 15 * MIN, () => track('news', NEWS.stockNews(name, symbol)), { persist: true });
}

export async function marketNews() {
  if (demo) return MOCK.marketNews();
  return cached('n:market', 10 * MIN, () => track('news', NEWS.marketNews()), { persist: true });
}

export async function breadth() {
  if (demo) return MOCK.breadth();
  return cached('nse:breadth', 2 * MIN, () => track('nse', NSE.breadth()), { persist: true });
}

export async function fiiDii() {
  if (demo) return MOCK.fiiDii();
  return cached('nse:fiidii', HOUR, () => track('nse', NSE.fiiDii()), { persist: true });
}

export async function corporateActions(symbol) {
  if (demo) return MOCK.corporateActions(symbol);
  return cached(`nse:ca:${symbol}`, 12 * HOUR, () => track('nse', NSE.corporateActions(symbol)), { persist: true });
}

export async function holidays() {
  if (demo) return null;
  return cached('nse:holidays', 7 * DAY, () => track('nse', NSE.holidays()), { persist: true });
}

export async function isinMap() {
  if (demo) return {};
  return cached('nse:equitylist', 7 * DAY, () => track('nse', NSE.equityList()), { persist: true });
}

export async function shariahIndex() {
  if (demo) return [];
  return cached('nse:shariah', 7 * DAY, () => NSE.shariahIndexList(), { persist: true }).catch(() => []);
}

export async function tickertapeMmi() {
  if (demo) throw new Error('demo');
  return cached('tt:mmi', 5 * MIN, () => track('tickertape', TT.mmi()));
}

let navList = null;
async function navs() {
  navList = await cached('amfi:all', 6 * HOUR, () => track('amfi', AMFI.navAll()), { persist: true });
  return Array.isArray(navList) ? navList : [];
}

// holding: {name, schemeCode, qty, lastNav}
export async function mfNav(h) {
  if (demo) return MOCK.navFor(h.name, h.lastNav);
  const list = await navs();
  let s = h.schemeCode ? list.find((x) => x.code === String(h.schemeCode)) : null;
  if (!s) s = AMFI.matchScheme(list, h.name);
  if (!s) return null;
  const hist = await mfHistory(s.code, h).catch(() => []);
  const prev = hist.length > 1 ? hist[hist.length - 2].c : null;
  return { code: s.code, name: s.name, nav: s.nav, prevNav: prev, date: s.date };
}

export async function mfHistory(code, h) {
  if (demo) return MOCK.navHistory(h?.name || code, h?.lastNav || 50);
  return cached(`mf:${code}`, 6 * HOUR, () => track('amfi', AMFI.navHistory(code)), { persist: true });
}

export async function search(q) {
  const local = Object.values(UNIVERSE_MAP).filter((u) => u.symbol.includes(q.toUpperCase()) || u.name.toLowerCase().includes(q.toLowerCase())).slice(0, 8)
    .map((u) => ({ symbol: u.symbol, exchange: 'NSE', name: u.name, type: 'EQUITY' }));
  if (demo) return local;
  try {
    const remote = await cached(`s:${q}`, HOUR, () => Y.search(q));
    const seen = new Set(remote.map((r) => r.symbol));
    return [...remote, ...local.filter((l) => !seen.has(l.symbol))];
  } catch { return local; }
}

export { MOCK };
