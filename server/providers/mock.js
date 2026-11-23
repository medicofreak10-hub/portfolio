// DEMO DATA ONLY — deterministic synthetic market data used when DATA_MODE=demo
// (offline testing). The UI shows a "Demo data" banner whenever this is active.
import { UNIVERSE_MAP, ETF_META } from '../lib/universe.js';
import { istMinutes, isTradingDay, OPEN_MIN, CLOSE_MIN } from '../lib/time.js';
import { sentiment, corporateTag } from '../analytics/sentiment.js';

const BASE = {
  NIFTY: 26050, SENSEX: 85200, BANKNIFTY: 59300, INDIAVIX: 12.4, '^NSEI': 26050,
  SAGILITY: 45.25, YATHARTH: 1093.25, PACEDIGITK: 165.36,
  GOLDCASE: 24.1, NIFTYBEES: 291.5, MID150CASE: 10.4, GOLDBEES: 101.2,
};
const extraBase = {};
export function setBasePrice(symbol, price) { if (price > 0) extraBase[symbol] = price; }

function hash(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function gauss(r) { return Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r()); }

function basePrice(sym) { return extraBase[sym] ?? BASE[sym] ?? 100 + (hash(sym) % 2900); }
function vol(sym) { return sym === 'INDIAVIX' ? 0.06 : ['NIFTY', 'SENSEX', 'BANKNIFTY'].includes(sym) ? 0.009 : /CASE|BEES/.test(sym) ? 0.008 : 0.018 + (hash(sym + 'v') % 100) / 4000; }

function istDay(t) { return new Date(t + 19800000).toISOString().slice(0, 10); }

// Trading sessions (as IST date strings) ending at the last session before "today's live session"
function sessionDays(n) {
  // completed sessions strictly before today (today's bar comes from intraday())
  const out = [];
  let t = Date.now() - 86400000;
  while (out.length < n) {
    if (isTradingDay(new Date(t))) out.push(istDay(t));
    t -= 86400000;
  }
  return out.reverse();
}

const dailyCache = new Map();
function daily(sym) {
  const key = sym + istDay(Date.now());
  if (dailyCache.has(key)) return dailyCache.get(key);
  const days = sessionDays(1250);
  const r = rng(hash(sym));
  const sigma = vol(sym);
  const drift = sym === 'INDIAVIX' ? 0 : 0.0003 + ((hash(sym + 'd') % 100) - 40) / 200000;
  let p = 1; const raw = [];
  for (const d of days) {
    const ret = drift + sigma * gauss(r);
    const o = p; p = sym === 'INDIAVIX' ? Math.max(0.6, Math.min(2.2, p * Math.exp(ret) * (1 - 0.02 * (p - 1)))) : p * Math.exp(ret);
    const h = Math.max(o, p) * (1 + Math.abs(gauss(r)) * sigma * 0.4);
    const l = Math.min(o, p) * (1 - Math.abs(gauss(r)) * sigma * 0.4);
    raw.push({ d, o, h, l, c: p, v: Math.round((50000 + (hash(sym) % 900000)) * (0.6 + r())) });
  }
  const scale = basePrice(sym) / raw[raw.length - 1].c;
  const bars = raw.map((b) => ({ t: Date.parse(b.d + 'T10:00:00Z'), o: b.o * scale, h: b.h * scale, l: b.l * scale, c: b.c * scale, v: b.v }));
  dailyCache.set(key, bars);
  return bars;
}

export function intraday(sym) {
  const d = daily(sym);
  const prev = d[d.length - 1].c;
  const todayLive = isTradingDay() && istMinutes() >= OPEN_MIN;
  if (!todayLive) {
    // show last session as a synthetic minute path ending at its close
    return pathFor(sym, d[d.length - 1].t, d.length > 1 ? d[d.length - 2].c : prev, CLOSE_MIN, prev);
  }
  const endMin = Math.min(istMinutes(), CLOSE_MIN);
  return pathFor(sym, Date.now(), prev, endMin);
}

function pathFor(sym, dayT, prevClose, endMin, forceClose) {
  const day = istDay(dayT);
  const r = rng(hash(sym + day));
  const sigma = vol(sym) / Math.sqrt(375);
  const bars = [];
  let p = prevClose * (1 + gauss(r) * vol(sym) * 0.3);
  for (let m = OPEN_MIN; m <= endMin; m++) {
    const o = p;
    p = p * Math.exp(sigma * gauss(r));
    const t = Date.parse(day + 'T00:00:00Z') + (m - 330) * 60000;
    bars.push({ t, o, h: Math.max(o, p), l: Math.min(o, p), c: p, v: Math.round(500 + r() * 5000) });
  }
  if (forceClose && bars.length) {
    const k = forceClose / bars[bars.length - 1].c;
    for (const b of bars) { b.o *= k; b.h *= k; b.l *= k; b.c *= k; }
  }
  return bars;
}

export function quote(sym) {
  const d = daily(sym);
  const todayLive = isTradingDay() && istMinutes() >= OPEN_MIN;
  const id = intraday(sym);
  const last = id[id.length - 1];
  const prevClose = todayLive ? d[d.length - 1].c : d[d.length - 2].c;
  const price = last.c;
  const year = d.slice(-250);
  const f = fundamentals(sym);
  return {
    price, prevClose, change: price - prevClose, changePct: ((price - prevClose) / prevClose) * 100,
    open: id[0].o, dayHigh: Math.max(...id.map((b) => b.h)), dayLow: Math.min(...id.map((b) => b.l)),
    volume: id.reduce((s, b) => s + b.v, 0) * 20, avgVolume: d.slice(-60).reduce((s, b) => s + b.v, 0) / 60,
    high52: Math.max(...year.map((b) => b.h), price), low52: Math.min(...year.map((b) => b.l), price),
    pe: f?.pe ?? null, marketCap: f?.marketCap ?? null, name: f?.name || sym, time: last.t,
  };
}

export function history(sym, range) {
  if (range === '1d') return intraday(sym);
  const d = daily(sym);
  const todayLive = isTradingDay() && istMinutes() >= OPEN_MIN;
  const all = todayLive ? [...d, (() => { const id = intraday(sym); return { t: Date.now(), o: id[0].o, h: Math.max(...id.map((b) => b.h)), l: Math.min(...id.map((b) => b.l)), c: id[id.length - 1].c, v: 1e5 }; })()] : d;
  const n = { '5d': 5, '1mo': 22, '1y': 250, '2y': 500, '5y': 1250, '10y': 1250 }[range] || 250;
  return all.slice(-n);
}

const fundCache = new Map();
export function fundamentals(sym) {
  if (['NIFTY', 'SENSEX', 'BANKNIFTY', 'INDIAVIX'].includes(sym) || ETF_META[sym] || /BEES$|CASE$/.test(sym)) return null;
  if (fundCache.has(sym)) return fundCache.get(sym);
  const r = rng(hash(sym + 'f'));
  const u = UNIVERSE_MAP[sym] || {};
  const price = basePrice(sym);
  const shares = (5 + r() * 60) * 1e7;
  const growth = 0.05 + r() * 0.3;
  const margin = 0.06 + r() * 0.22;
  const years = [];
  let rev = (price * shares) / (2 + r() * 6);
  const nYears = sym === 'PACEDIGITK' || sym === 'SAGILITY' ? 4 : 6 + Math.floor(r() * 5);
  const debtRatio = sym === 'BANKBARODA' ? 6 : r() * 0.6;
  for (let i = nYears - 1; i >= 0; i--) {
    const g = growth + (r() - 0.5) * 0.1;
    const yrRev = rev / Math.pow(1 + growth, i);
    const ni = yrRev * (margin + (r() - 0.5) * 0.03) * 0.75;
    const ta = yrRev * (0.9 + r() * 0.6);
    const eq = ta * (0.5 + r() * 0.3);
    years.push({
      date: `${2026 - i - 1}-03-31`, revenue: yrRev, grossProfit: yrRev * (0.3 + margin), operatingIncome: yrRev * margin, ebit: yrRev * margin * 1.05,
      netIncome: ni, interestExpense: eq * debtRatio * 0.09, interestIncome: yrRev * r() * 0.03, otherIncome: yrRev * 0.02,
      eps: ni / shares, shares: shares * (1 - i * 0.002), totalAssets: ta, currentAssets: ta * 0.45, currentLiabilities: ta * (0.18 + r() * 0.15),
      totalLiabilities: ta - eq, totalDebt: eq * debtRatio, longTermDebt: eq * debtRatio * 0.6, cash: ta * 0.08 * (0.5 + r()), receivables: yrRev * 0.18,
      equity: eq, retainedEarnings: eq * 0.7, netPPE: ta * 0.35, workingCapital: ta * 0.2, cfo: ni * (0.5 + r() * 0.8), capex: -yrRev * 0.05, _g: g,
    });
  }
  const last = years[years.length - 1];
  const out = {
    source: 'Demo data', name: u.name || sym, sector: u.sector || 'Industrials', industry: u.industry || 'Specialty Industrial Machinery',
    summary: `${u.name || sym} (demo profile).`, marketCap: price * shares, price, pe: (price * shares) / last.netIncome, pb: (price * shares) / last.equity,
    eps: last.eps, roe: (last.netIncome / last.equity) * 100, debtToEquity: last.totalDebt / last.equity, operatingMargin: margin * 100,
    totalCash: last.cash, totalDebt: last.totalDebt, dividendYield: r() * 1.2, promoterHolding: 30 + r() * 45, institutionalHolding: 2 + r() * 25,
    pledgePct: r() < 0.15 ? r() * 20 : 0, beta: 0.6 + r(), years,
    quarters: Array.from({ length: 8 }, (_, i) => ({ date: `q${i}`, revenue: last.revenue / 4 * (1 + (i - 7) * growth / 4), netIncome: last.netIncome / 4 * (1 + (i - 7) * growth / 3.5) })),
    earningsDate: new Date(Date.now() + (5 + (hash(sym) % 50)) * 86400000).toISOString(),
  };
  fundCache.set(sym, out);
  return out;
}

const NEWS_T = [
  ['{n} shares jump after strong Q2 results; profit rises {p}%', 'Results'],
  ['{n} bags new order worth ₹{o} crore', null],
  ['{n} board meeting on {d} to consider quarterly results', 'Board meeting'],
  ['Brokerage upgrades {n}, raises target price', null],
  ['{n} stock falls {p}% as margins come under pressure', null],
  ['{n} announces interim dividend of ₹{v} per share', 'Dividend'],
  ['{n}: promoter offloads stake in block deal', null],
  ['{n} trades flat ahead of sector data', null],
];
export function stockNews(name, symbol) {
  const r = rng(hash(symbol + istDay(Date.now())));
  return Array.from({ length: 4 }, (_, i) => {
    const [tpl] = NEWS_T[Math.floor(r() * NEWS_T.length)];
    const title = '[Demo] ' + tpl.replace('{n}', name).replace('{p}', String(2 + Math.floor(r() * 12))).replace('{o}', String(50 + Math.floor(r() * 900))).replace('{v}', String(1 + Math.floor(r() * 9))).replace('{d}', 'Dec 5');
    const s = sentiment(title);
    return { title, url: `https://news.google.com/search?q=${encodeURIComponent(name)}`, source: 'Demo feed', ts: Date.now() - (i * 7 + Math.floor(r() * 6)) * 3600000, sentiment: s.label, tag: corporateTag(title), symbol };
  });
}

export function marketNews() {
  const items = ['Sensex, Nifty end higher led by IT and pharma gains', 'FIIs turn net sellers for third session; DIIs buy', 'Nifty Smallcap index hits record high', 'India VIX falls to multi-week low as volatility eases', 'Rupee slips against dollar on crude prices', 'Auto stocks rally on strong monthly sales data', 'Metal stocks decline as China demand concerns weigh'];
  return items.map((t, i) => { const title = '[Demo] ' + t; return { title, url: 'https://economictimes.indiatimes.com/markets', source: 'Demo feed', ts: Date.now() - i * 5400000, sentiment: sentiment(title).label, tag: corporateTag(title) }; });
}

export function breadth() { const r = rng(hash('br' + istDay(Date.now()) + Math.floor(istMinutes() / 15))); const a = 150 + Math.floor(r() * 250); return { advances: a, declines: 500 - a - 10, unchanged: 10, ratio: a / (490 - a), index: 'NIFTY 500 (demo)' }; }
export function fiiDii() { const r = rng(hash('fii' + istDay(Date.now()))); return { date: istDay(Date.now()), fiiNet: Math.round((r() - 0.55) * 6000), diiNet: Math.round((r() - 0.3) * 5000) }; }
export function corporateActions(symbol) {
  const f = fundamentals(symbol); if (!f) return [];
  return [{ symbol, kind: 'Results', title: 'Board meeting — quarterly results (demo)', date: f.earningsDate?.slice(0, 10), source: 'Demo' }];
}
export function navFor(name, fallbackNav) {
  const base = fallbackNav || 10 + (hash(name) % 200);
  const r = rng(hash(name + istDay(Date.now())));
  return { code: String(100000 + (hash(name) % 50000)), name, nav: base * (1 + (r() - 0.48) * 0.01), prevNav: base, date: istDay(Date.now()) };
}
export function navHistory(name, nav) {
  const r = rng(hash(name)); const out = []; let p = 1;
  for (let i = 1250; i >= 0; i--) { p *= Math.exp(0.0005 + 0.009 * gauss(r)); out.push({ t: Date.now() - i * 86400000, c: p }); }
  const k = nav / out[out.length - 1].c; return out.map((b) => ({ t: b.t, c: b.c * k }));
}
