// Builds the live portfolio view: values, P&L, XIRR, splits, movers, daily summary.
import * as data from './data.js';
import * as store from './lib/store.js';
import * as A from './analysis.js';
import { holdingXirr, xirr } from './analytics/xirr.js';
import { ETF_META } from './lib/universe.js';
import { mfScreen } from './analytics/shariah.js';
import { inr, pct } from './lib/format.js';

export async function quotesFor(items) {
  const eq = items.filter((h) => h.type !== 'mf');
  return data.quotes(eq.map((h) => ({ symbol: h.symbol, exchange: h.exchange || 'NSE' })));
}

export async function build() {
  const db = store.get();
  const holdings = db.holdings.filter((h) => h.qty > 0);
  const q = await quotesFor(holdings).catch(() => ({}));
  const navs = Object.fromEntries(await Promise.all(holdings.filter((h) => h.type === 'mf').map(async (h) => [h.id, await data.mfNav(h).catch(() => null)])));

  let stale = false;
  const rows = holdings.map((h) => {
    let price = null, prevClose = null, changePct = null, quoteTime = null;
    if (h.type === 'mf') {
      const n = navs[h.id];
      price = n?.nav ?? h.lastNav ?? null;
      prevClose = n?.prevNav ?? null;
      quoteTime = n?.date || null;
      if (n?.code && !h.schemeCode) { h.schemeCode = n.code; store.save(); }
    } else {
      const qq = q[h.symbol];
      if (qq?.stale) stale = true;
      price = qq?.price ?? h.lastClose ?? null;
      prevClose = qq?.prevClose ?? null;
      quoteTime = qq?.time ?? null;
    }
    const invested = h.qty * h.avgPrice;
    const value = price != null ? h.qty * price : null;
    const dayChange = price != null && prevClose ? (price - prevClose) * h.qty : null;
    changePct = price != null && prevClose ? ((price - prevClose) / prevClose) * 100 : null;
    const pnl = value != null ? value - invested : null;
    let xr = { xirr: null, approx: false };
    if (h.type === 'mf') xr = { xirr: h.reportedXirr ?? null, approx: false, source: 'Groww statement' };
    else if (value) xr = holdingXirr(h, db.transactions, value);
    const an = h.type === 'mf' ? null : A.getCached(h.symbol);
    return {
      id: h.id, type: h.type, symbol: h.symbol, exchange: h.exchange, name: h.name, isin: h.isin, broker: h.broker, folio: h.folio,
      qty: h.qty, avgPrice: h.avgPrice, price, prevClose, changePct, dayChange, invested, value, pnl, pnlPct: pnl != null && invested ? (pnl / invested) * 100 : null,
      xirr: xr.xirr, xirrApprox: xr.approx, xirrNote: xr.tooRecent ? 'Held < 2 months — not annualised' : xr.source || (xr.approx ? 'Approx. (trades before statement period)' : ''),
      quoteTime, high52: q[h.symbol]?.high52 ?? an?.tech?.high52 ?? null, low52: q[h.symbol]?.low52 ?? an?.tech?.low52 ?? null,
      sector: h.type === 'mf' ? `Mutual fund — ${h.category || 'Equity'}` : an?.profile?.sector || ETF_META[h.symbol]?.sector || null,
      cap: h.type === 'mf' ? 'Mutual fund' : h.type === 'etf' ? 'ETF' : A.capBucket(an?.profile?.marketCap),
      analysis: h.type === 'mf' ? { shariah: db.shariahOverrides[h.symbol]?.status || mfScreen({ name: h.name }).status, shariahNote: mfScreen({ name: h.name }).checks[0].detail } : A.summaryOf(an),
      category: h.category,
    };
  });

  const sum = (k, f = (r) => true) => rows.filter(f).reduce((s, r) => s + (r[k] || 0), 0);
  const total = { invested: sum('invested'), value: sum('value'), dayChange: sum('dayChange') };
  total.pnl = total.value - total.invested;
  total.pnlPct = total.invested ? (total.pnl / total.invested) * 100 : null;
  const prevValue = total.value - total.dayChange;
  total.dayChangePct = prevValue ? (total.dayChange / prevValue) * 100 : null;
  for (const r of rows) r.weight = total.value ? ((r.value || 0) / total.value) * 100 : 0;

  // combined XIRR for stocks/ETFs from their cash flows
  const flows = [];
  for (const h of holdings.filter((x) => x.type !== 'mf')) {
    const r = rows.find((x) => x.id === h.id);
    if (!r?.value) continue;
    const res = holdingXirr(h, db.transactions, r.value);
    if (res.flows) flows.push(...res.flows.slice(0, -1));
  }
  const eqValue = sum('value', (r) => r.type !== 'mf');
  total.equityXirr = flows.length ? xirr([...flows, { t: Date.now(), amount: eqValue }]) : null;

  const split = (key) => {
    const m = {};
    for (const r of rows) { const k = r[key] || 'Unknown'; m[k] = (m[k] || 0) + (r.value || 0); }
    return Object.entries(m).map(([name, value]) => ({ name, value, pct: total.value ? (value / total.value) * 100 : 0 })).sort((a, b) => b.value - a.value);
  };
  const movers = rows.filter((r) => r.changePct != null && r.type !== 'mf').sort((a, b) => b.changePct - a.changePct);
  const gainers = movers.filter((r) => r.changePct > 0).slice(0, 3);
  const losers = movers.filter((r) => r.changePct < 0).reverse().slice(0, 3);

  return { rows, total, sectorSplit: split('sector'), capSplit: split('cap'), gainers, losers, stale, asOf: Date.now() };
}

export function dailySummary(p, newsTop) {
  const t = p.total;
  const up = t.dayChange >= 0;
  const best = p.gainers[0] || [...p.rows].filter((r) => r.changePct != null).sort((a, b) => b.changePct - a.changePct)[0];
  const worst = p.losers[0];
  const parts = [`Your portfolio is ${up ? 'up' : 'down'} ${inr(Math.abs(t.dayChange))} (${pct(t.dayChangePct)}) today`];
  if (best) parts.push(`best stock ${best.name || best.symbol} ${pct(best.changePct)}`);
  if (worst) parts.push(`weakest ${worst.name || worst.symbol} ${pct(worst.changePct)}`);
  let text = parts.join(', ') + '.';
  if (newsTop) text += ` News to read: "${newsTop.title}".`;
  return { text, up, best, worst, news: newsTop || null };
}
