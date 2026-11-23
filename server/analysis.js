// Per-symbol analysis: technicals, entry zone, Shariah screen and all scoring models.
import * as data from './data.js';
import * as store from './lib/store.js';
import { technicals } from './analytics/indicators.js';
import { entryZone } from './analytics/entryZone.js';
import { screen } from './analytics/shariah.js';
import * as S from './analytics/scores.js';
import { UNIVERSE, UNIVERSE_MAP, ETF_META, isEtf } from './lib/universe.js';

const results = new Map(); // symbol -> analysis
let niftyTech = null;
let shariahIdx = new Set();
let magic = {};

export function getCached(symbol) { return results.get(symbol); }
export function allCached() { return [...results.values()]; }

async function nifty() {
  if (niftyTech && Date.now() - niftyTech.at < 3600000) return niftyTech.v;
  const bars = await data.history('NIFTY', 'NSE', '2y');
  niftyTech = { at: Date.now(), v: technicals(bars) };
  return niftyTech.v;
}

function mergeUpload(profile, upload) {
  if (!upload) return profile;
  const merged = { ...(profile || {}), ...Object.fromEntries(Object.entries(upload).filter(([k, v]) => v != null && k !== 'years')) };
  if (upload.years?.length && upload.years.length >= (profile?.years?.length || 0)) merged.years = upload.years;
  merged.source = (profile?.source ? profile.source + ' + ' : '') + 'Screener upload';
  return merged;
}

function median(a) { const v = a.filter((x) => x > 0 && isFinite(x)).sort((x, y) => x - y); return v.length ? v[Math.floor(v.length / 2)] : null; }

function peerStats(profile) {
  const peers = allCached().filter((r) => r.profile && r.symbol !== profile.symbol && r.type === 'stock');
  let same = peers.filter((r) => r.profile.industry && r.profile.industry === profile.industry);
  if (same.length < 3) same = peers.filter((r) => r.profile.sector === profile.sector);
  return {
    industryPE: median(same.map((r) => r.profile.pe).concat(profile.pe ? [profile.pe] : [])),
    peerMaxMcap: Math.max(profile.marketCap || 0, ...same.map((r) => r.profile.marketCap || 0)) || null,
  };
}

export async function analyze(symbol, exchange = 'NSE', { type, name, force = false } = {}) {
  const prev = results.get(symbol);
  if (prev && !force && Date.now() - prev.at < 30 * 60000) return prev;
  const db = store.get();
  const etf = type === 'etf' || isEtf(symbol, name);
  const t = etf ? 'etf' : 'stock';

  const [bars, fund, nt] = await Promise.all([
    data.history(symbol, exchange, '5y').catch(() => []),
    etf ? Promise.resolve(null) : data.fundamentals(symbol, exchange).catch(() => null),
    nifty().catch(() => null),
  ]);
  const u = UNIVERSE_MAP[symbol];
  let profile = mergeUpload(fund, db.fundamentalUploads[symbol]);
  profile = { ...(profile || {}), symbol, exchange, type: t,
    name: profile?.name || name || u?.name || ETF_META[symbol]?.name || symbol,
    sector: profile?.sector || u?.sector || ETF_META[symbol]?.sector || null,
    industry: profile?.industry || u?.industry || null,
    years: profile?.years || [], quarters: profile?.quarters || [] };

  const tech = technicals(bars);
  const entry = entryZone(bars);
  const sh = screen(profile, db.settings, { override: db.shariahOverrides[symbol], inShariahIndex: shariahIdx.has(symbol) });

  let scores = null;
  if (!etf) {
    const peers = peerStats(profile);
    const ctx = { tech, nifty: nt, industryPE: peers.industryPE, peerMaxMcap: peers.peerMaxMcap, ownPEavg: S.ownPEAverage(profile, bars), upDownVol: S.upDownVolume(bars) };
    scores = {
      multibagger: S.multibagger(profile, ctx),
      piotroski: S.piotroski(profile),
      altman: S.altman(profile),
      magic: { model: 'magic', ...S.magicRaw(profile), ...(magic[symbol] || {}) },
      canslim: S.canslim(profile, ctx),
      coffeecan: S.coffeeCan(profile),
      ctx: { industryPE: peers.industryPE, ownPEavg: ctx.ownPEavg },
    };
  }
  const derived = etf ? null : S.derived(profile);
  const res = { symbol, exchange, type: t, at: Date.now(), profile: stripProfile(profile), tech, entry, shariah: sh, scores, derived, barsCount: bars.length };
  results.set(symbol, res);
  return res;
}

function stripProfile(p) {
  const { summary, ...rest } = p;
  return { ...rest, summary: summary ? summary.slice(0, 600) : '' };
}

export function recomputeMagic() {
  const raw = {};
  for (const r of allCached()) if (r.type === 'stock') raw[r.symbol] = S.magicRaw(r.profile);
  magic = S.magicRank(raw);
  for (const r of allCached()) if (r.scores && magic[r.symbol]) r.scores.magic = { model: 'magic', ...raw[r.symbol], ...magic[r.symbol] };
}

export async function loadShariahIndex() {
  const list = await data.shariahIndex();
  shariahIdx = new Set(list);
  return list.length;
}

// Background crawl of the discovery universe + user's symbols (rate-limited).
let crawling = false;
export async function refreshUniverse({ delayMs = data.demo ? 0 : 1500, onProgress } = {}) {
  if (crawling) return;
  crawling = true;
  try {
    const db = store.get();
    const mine = [...db.holdings.filter((h) => h.type !== 'mf'), ...db.watchlist].map((h) => ({ symbol: h.symbol, exchange: h.exchange || 'NSE', type: h.type, name: h.name }));
    const list = [...mine, ...UNIVERSE.filter((u) => !mine.some((m) => m.symbol === u.symbol))];
    let i = 0;
    for (const item of list) {
      try { await analyze(item.symbol, item.exchange, { type: item.type, name: item.name }); } catch (e) { /* skip */ }
      i++;
      onProgress?.(i, list.length);
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    }
    recomputeMagic();
  } finally { crawling = false; }
}
export function crawlState() { return { crawling, analysed: results.size, total: UNIVERSE.length }; }

export function summaryOf(a) {
  if (!a) return null;
  const sc = a.scores;
  return {
    symbol: a.symbol, name: a.profile?.name, sector: a.profile?.sector, industry: a.profile?.industry, type: a.type,
    shariah: a.shariah?.status, entry: a.entry?.available ? { status: a.entry.status, emoji: a.entry.emoji, label: a.entry.label, zoneLow: a.entry.zoneLow, zoneHigh: a.entry.zoneHigh, stopLoss: a.entry.stopLoss, target1: a.entry.target1, target2: a.entry.target2, rr: a.entry.rr } : null,
    rsi: a.tech?.rsi ?? null, high52: a.tech?.high52 ?? a.profile?.high52, low52: a.tech?.low52 ?? a.profile?.low52,
    pe: a.profile?.pe ?? null, roe: a.derived?.roe ?? null, roce: a.derived?.roce ?? null, debtToEquity: a.derived?.debtToEquity ?? null,
    salesCagr3: a.derived?.salesCagr3 ?? null, profitCagr3: a.derived?.profitCagr3 ?? null, marketCap: a.profile?.marketCap ?? null,
    scores: sc ? {
      multibagger: sc.multibagger?.score ?? null, piotroski: sc.piotroski?.score ?? null, altman: sc.altman?.score ?? null,
      magic: sc.magic?.norm ?? null, magicRank: sc.magic?.rank ?? null, canslim: sc.canslim?.score ?? null, coffeecan: sc.coffeecan?.label ?? null, coffeecanNorm: sc.coffeecan?.norm ?? null,
    } : null,
  };
}

export function capBucket(mcap) {
  if (!mcap) return 'Unknown';
  const cr = mcap / 1e7;
  return cr >= 100000 ? 'Large cap' : cr >= 30000 ? 'Mid cap' : cr >= 5000 ? 'Small cap' : 'Micro cap';
}

export function alternatives(symbol, limit = 5) {
  const me = results.get(symbol);
  if (!me?.profile || me.type !== 'stock') return [];
  const myScore = me.scores?.multibagger?.score ?? 0;
  const pool = allCached().filter((r) => r.symbol !== symbol && r.type === 'stock' && r.shariah?.status === 'Compliant' && (r.scores?.multibagger?.score ?? -1) > myScore);
  let peers = pool.filter((r) => r.profile.industry && r.profile.industry === me.profile.industry);
  if (peers.length < 3) peers = [...peers, ...pool.filter((r) => r.profile.sector === me.profile.sector && !peers.includes(r))];
  return peers.sort((a, b) => b.scores.multibagger.score - a.scores.multibagger.score).slice(0, limit).map(summaryOf);
}

export function discover({ sector, limit = 20, caps = ['Small cap', 'Mid cap', 'Micro cap'] } = {}) {
  return allCached()
    .filter((r) => r.type === 'stock' && r.shariah?.status === 'Compliant' && r.scores?.multibagger?.score != null)
    .filter((r) => caps.includes(capBucket(r.profile.marketCap)))
    .filter((r) => !sector || r.profile.sector === sector)
    .sort((a, b) => b.scores.multibagger.score - a.scores.multibagger.score)
    .slice(0, limit)
    .map((r) => ({ ...summaryOf(r), cap: capBucket(r.profile.marketCap) }));
}
