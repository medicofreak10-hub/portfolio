// Scoring models. Every score is "potential / quality indicator, not a guarantee".
const clamp = (x, a = 0, b = 100) => Math.max(a, Math.min(b, x));
const lin = (x, lo, hi) => (x == null || !isFinite(x) ? null : clamp(((x - lo) / (hi - lo)) * 100));
const avg = (arr) => { const v = arr.filter((x) => x != null && isFinite(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const CR = 1e7; // 1 crore

export function cagr(years, field, n) {
  if (!years || years.length < n + 1) return null;
  const end = years[years.length - 1][field], start = years[years.length - 1 - n][field];
  if (end == null || start == null || start <= 0 || end <= 0) return null;
  return (Math.pow(end / start, 1 / n) - 1) * 100;
}

export function roce(y) {
  if (!y || y.ebit == null || y.totalAssets == null) return null;
  const ce = y.totalAssets - (y.currentLiabilities || 0);
  return ce > 0 ? (y.ebit / ce) * 100 : null;
}

export function derived(profile) {
  const ys = profile.years || [];
  const y = ys[ys.length - 1], p = ys[ys.length - 2];
  const roeCalc = y?.netIncome != null && y?.equity ? (y.netIncome / y.equity) * 100 : null;
  return {
    salesCagr3: cagr(ys, 'revenue', 3), salesCagr5: cagr(ys, 'revenue', 5),
    profitCagr3: cagr(ys, 'netIncome', 3), profitCagr5: cagr(ys, 'netIncome', 5),
    epsGrowth: y?.eps != null && p?.eps > 0 ? ((y.eps - p.eps) / p.eps) * 100 : profile.earningsGrowth ?? null,
    roe: profile.roe ?? roeCalc,
    roce: roce(y),
    opMargin: y?.operatingIncome != null && y?.revenue ? (y.operatingIncome / y.revenue) * 100 : profile.operatingMargin ?? null,
    opMarginOld: ys.length >= 4 && ys[ys.length - 4].operatingIncome != null && ys[ys.length - 4].revenue ? (ys[ys.length - 4].operatingIncome / ys[ys.length - 4].revenue) * 100 : null,
    cfoToProfit: avg(ys.slice(-3).map((r) => (r.cfo != null && r.netIncome > 0 ? r.cfo / r.netIncome : null))),
    debtToEquity: profile.debtToEquity ?? (y?.totalDebt != null && y?.equity ? y.totalDebt / y.equity : null),
    interestCover: y?.ebit != null && y?.interestExpense ? y.ebit / y.interestExpense : y?.ebit > 0 && (y?.interestExpense === 0 || y?.totalDebt === 0) ? 50 : null,
    currentRatio: y?.currentAssets && y?.currentLiabilities ? y.currentAssets / y.currentLiabilities : null,
    yearsOfData: ys.length,
  };
}

function component(name, weight, metrics) {
  const vals = metrics.filter((m) => m.score != null);
  return { name, weight, score: vals.length ? avg(vals.map((m) => m.score)) : null, metrics };
}

function m(label, value, score, fmt = 'pct', hint = '') { return { label, value, score, fmt, hint }; }

// ctx: { tech, nifty, industryPE, ownPEavg, peerMaxMcap }
export function multibagger(profile, ctx = {}) {
  const d = derived(profile);
  const t = ctx.tech || {};
  const pe = profile.pe;
  const peg = pe > 0 && (d.profitCagr3 ?? d.epsGrowth) > 0 ? pe / (d.profitCagr3 ?? d.epsGrowth) : null;
  const mcapCr = profile.marketCap ? profile.marketCap / CR : null;
  const sizeScore = mcapCr == null ? null : mcapCr < 5000 ? 100 : mcapCr < 20000 ? 85 : mcapCr < 50000 ? 65 : mcapCr < 100000 ? 40 : 15;
  const runway = mcapCr && ctx.peerMaxMcap ? lin(1 - profile.marketCap / ctx.peerMaxMcap, 0, 0.9) : null;
  const rs = t.ret1y != null && ctx.nifty?.ret1y != null ? t.ret1y - ctx.nifty.ret1y : null;

  const comps = [
    component('Growth', 25, [
      m('3-yr sales CAGR', d.salesCagr3, lin(d.salesCagr3, 0, 25), 'pct', '> 20% is strong'),
      m('3-yr profit CAGR', d.profitCagr3, lin(d.profitCagr3, 0, 25)),
      m('5-yr sales CAGR', d.salesCagr5, lin(d.salesCagr5, 0, 25), 'pct', d.salesCagr5 == null ? 'needs 6 yrs data (upload Screener export)' : ''),
      m('5-yr profit CAGR', d.profitCagr5, lin(d.profitCagr5, 0, 25)),
      m('EPS growth (latest yr)', d.epsGrowth, lin(d.epsGrowth, 0, 30)),
    ]),
    component('Quality', 20, [
      m('ROE', d.roe, lin(d.roe, 5, 22), 'pct', '> 15% is good'),
      m('ROCE', d.roce, lin(d.roce, 5, 22), 'pct', '> 15% is good'),
      m('Operating margin trend (3y)', d.opMargin != null && d.opMarginOld != null ? d.opMargin - d.opMarginOld : null, d.opMargin != null && d.opMarginOld != null ? lin(d.opMargin - d.opMarginOld, -5, 5) : null, 'pp'),
      m('Cash flow / profit (3y avg)', d.cfoToProfit, lin(d.cfoToProfit, 0.4, 1.0), 'x', '≥ 0.8 means profits turn into cash'),
    ]),
    component('Balance sheet', 15, [
      m('Debt / Equity', d.debtToEquity, d.debtToEquity == null ? null : clamp(100 - d.debtToEquity * 70), 'x', '< 0.5 is comfortable'),
      m('Interest cover', d.interestCover, lin(d.interestCover, 1.5, 10), 'x'),
      m('Current ratio', d.currentRatio, lin(d.currentRatio, 0.8, 2), 'x'),
    ]),
    component('Valuation', 15, [
      m('PEG', peg, peg == null ? null : clamp(100 - ((peg - 0.8) / 2.2) * 100), 'x', '< 1.5 preferred'),
      m('P/E vs industry', pe && ctx.industryPE ? pe / ctx.industryPE : null, pe && ctx.industryPE ? clamp(100 - ((pe / ctx.industryPE - 0.7) / 1.3) * 100) : null, 'x', 'below 1x = cheaper than peers'),
      m('P/E vs own 5-yr avg', pe && ctx.ownPEavg ? pe / ctx.ownPEavg : null, pe && ctx.ownPEavg ? clamp(100 - ((pe / ctx.ownPEavg - 0.7) / 1.0) * 100) : null, 'x'),
    ]),
    component('Size & runway', 10, [
      m('Market cap (₹ cr)', mcapCr, sizeScore, 'cr', 'smaller = more room to grow'),
      m('Room vs largest peer', runway == null ? null : 1 - profile.marketCap / ctx.peerMaxMcap, runway, 'ratio'),
    ]),
    component('Ownership', 10, [
      m('Promoter / insider holding', profile.promoterHolding, lin(profile.promoterHolding, 25, 65), 'pct'),
      m('Promoter pledge', profile.pledgePct, profile.pledgePct == null ? null : clamp(100 - profile.pledgePct * 5), 'pct'),
      m('Institutional holding', profile.institutionalHolding, lin(profile.institutionalHolding, 1, 20), 'pct', 'FII/DII trend needs shareholding history'),
    ]),
    component('Momentum', 5, [
      m('1-yr return vs NIFTY', rs, lin(rs, -20, 30), 'pp'),
      m('Price above 200 DMA', t.sma200 ? (t.price > t.sma200 ? 'Yes' : 'No') : null, t.sma200 ? (t.price > t.sma200 ? 100 : 0) : null, 'text'),
    ]),
  ];

  const avail = comps.filter((c) => c.score != null);
  const wsum = avail.reduce((a, c) => a + c.weight, 0);
  const score = wsum ? Math.round(avail.reduce((a, c) => a + c.score * c.weight, 0) / wsum) : null;
  const coverage = Math.round((comps.flatMap((c) => c.metrics).filter((x) => x.score != null).length / comps.flatMap((c) => c.metrics).length) * 100);

  const strengths = [], flags = [];
  for (const c of comps) for (const x of c.metrics) {
    if (x.score == null) continue;
    if (x.score >= 80) strengths.push(`${x.label}: ${fmtVal(x)}`);
    if (x.score <= 25) flags.push(`${x.label}: ${fmtVal(x)}`);
  }
  if (d.cfoToProfit != null && d.cfoToProfit < 0.3) flags.push('Weak cash conversion — profits not turning into cash');
  if (d.debtToEquity != null && d.debtToEquity > 1) flags.push('High debt (D/E > 1)');
  if (profile.pledgePct > 10) flags.push(`Promoter pledge ${profile.pledgePct.toFixed(1)}%`);
  if (d.yearsOfData < 4) flags.push(`Only ${d.yearsOfData} yrs of financials — score is provisional`);

  return { model: 'multibagger', score, band: band(score), components: comps, strengths: [...new Set(strengths)].slice(0, 6), flags: [...new Set(flags)].slice(0, 6), coverage, label: 'Multibagger potential score (not a guarantee)' };
}

function fmtVal(x) {
  if (typeof x.value === 'string') return x.value;
  if (x.value == null) return 'n/a';
  if (x.fmt === 'pct') return x.value.toFixed(1) + '%';
  if (x.fmt === 'pp') return (x.value > 0 ? '+' : '') + x.value.toFixed(1) + ' pts';
  if (x.fmt === 'cr') return '₹' + Math.round(x.value).toLocaleString('en-IN') + ' cr';
  return x.value.toFixed(2) + (x.fmt === 'x' ? 'x' : '');
}

export function band(score) {
  if (score == null) return { key: 'na', label: 'Insufficient data', emoji: '⚪' };
  if (score >= 80) return { key: 'high', label: 'High potential', emoji: '🟢' };
  if (score >= 60) return { key: 'good', label: 'Good', emoji: '🟡' };
  if (score >= 40) return { key: 'avg', label: 'Average', emoji: '🟠' };
  return { key: 'weak', label: 'Weak', emoji: '🔴' };
}

export function piotroski(profile) {
  const ys = profile.years || [];
  const y = ys[ys.length - 1], p = ys[ys.length - 2];
  const tests = [];
  const add = (label, ok, detail = '') => tests.push({ label, pass: ok == null ? null : !!ok, detail });
  const roa = (r) => (r?.netIncome != null && r?.totalAssets ? r.netIncome / r.totalAssets : null);
  const cr = (r) => (r?.currentAssets && r?.currentLiabilities ? r.currentAssets / r.currentLiabilities : null);
  const lev = (r) => (r?.totalAssets ? (r.longTermDebt ?? r.totalDebt ?? null) / r.totalAssets : null);
  const gm = (r) => (r?.grossProfit != null && r?.revenue ? r.grossProfit / r.revenue : r?.operatingIncome != null && r?.revenue ? r.operatingIncome / r.revenue : null);
  const at = (r) => (r?.revenue && r?.totalAssets ? r.revenue / r.totalAssets : null);
  const both = (f) => (f(y) != null && f(p) != null ? [f(y), f(p)] : null);
  add('Positive net profit (ROA > 0)', roa(y) == null ? null : roa(y) > 0);
  add('Positive operating cash flow', y?.cfo == null ? null : y.cfo > 0);
  add('ROA improving', both(roa) ? both(roa)[0] > both(roa)[1] : null);
  add('Cash flow > profit (quality)', y?.cfo != null && y?.netIncome != null ? y.cfo > y.netIncome : null);
  add('Leverage falling', both(lev) ? both(lev)[0] <= both(lev)[1] : null);
  add('Current ratio improving', both(cr) ? both(cr)[0] > both(cr)[1] : null);
  add('No share dilution', y?.shares && p?.shares ? y.shares <= p.shares * 1.005 : null);
  add('Margin improving', both(gm) ? both(gm)[0] > both(gm)[1] : null);
  add('Asset turnover improving', both(at) ? both(at)[0] > both(at)[1] : null);
  const known = tests.filter((t) => t.pass != null);
  const score = known.length ? known.filter((t) => t.pass).length : null;
  return { model: 'piotroski', score, outOf: 9, known: known.length, tests, norm: score == null ? null : Math.round((score / 9) * 100), label: score == null ? 'n/a' : score >= 7 ? 'Strong' : score >= 4 ? 'Average' : 'Weak' };
}

export function altman(profile) {
  const ys = profile.years || [];
  const y = ys[ys.length - 1];
  if (!y?.totalAssets) return { model: 'altman', score: null, label: 'n/a', note: 'Balance sheet not available' };
  const TA = y.totalAssets;
  const wc = y.workingCapital ?? (y.currentAssets != null && y.currentLiabilities != null ? y.currentAssets - y.currentLiabilities : null);
  const TL = y.totalLiabilities ?? (y.equity != null ? TA - y.equity : null);
  const parts = {
    A: wc != null ? wc / TA : null,
    B: y.retainedEarnings != null ? y.retainedEarnings / TA : null,
    C: y.ebit != null ? y.ebit / TA : null,
    D: profile.marketCap && TL ? profile.marketCap / TL : null,
    E: y.revenue != null ? y.revenue / TA : null,
  };
  const missing = Object.entries(parts).filter(([, v]) => v == null).map(([k]) => k);
  const z = 1.2 * (parts.A || 0) + 1.4 * (parts.B || 0) + 3.3 * (parts.C || 0) + 0.6 * Math.min(parts.D || 0, 10) + 1.0 * (parts.E || 0);
  const label = z > 2.99 ? 'Safe zone' : z >= 1.81 ? 'Grey zone' : 'Distress zone';
  return { model: 'altman', score: Number(z.toFixed(2)), label, parts, missing, norm: Math.round(clamp(((z - 1.1) / (3.5 - 1.1)) * 100)), note: missing.length ? `Missing: ${missing.join(', ')} (treated as 0)` : '' };
}

export function magicRaw(profile) {
  const y = (profile.years || []).slice(-1)[0];
  if (!y?.ebit || !profile.marketCap) return { roc: null, ey: null };
  const nwc = (y.currentAssets ?? 0) - (y.currentLiabilities ?? 0) - Math.max(0, (y.cash ?? 0) - 0.05 * (y.revenue || 0));
  const capital = Math.max(nwc, 0) + (y.netPPE ?? 0);
  const ev = profile.marketCap + (y.totalDebt ?? 0) - (y.cash ?? 0);
  return { roc: capital > 0 ? (y.ebit / capital) * 100 : null, ey: ev > 0 ? (y.ebit / ev) * 100 : null };
}

// Rank all symbols by ROC and EY (Greenblatt), lower combined rank = better.
export function magicRank(rawBySymbol) {
  const syms = Object.keys(rawBySymbol).filter((s) => rawBySymbol[s].roc != null && rawBySymbol[s].ey != null);
  const rank = (key) => Object.fromEntries([...syms].sort((a, b) => rawBySymbol[b][key] - rawBySymbol[a][key]).map((s, i) => [s, i + 1]));
  const r1 = rank('roc'), r2 = rank('ey');
  const combined = syms.map((s) => [s, r1[s] + r2[s]]).sort((a, b) => a[1] - b[1]);
  const out = {};
  combined.forEach(([s], i) => {
    out[s] = { rank: i + 1, of: combined.length, rocRank: r1[s], eyRank: r2[s], norm: combined.length > 1 ? Math.round(100 - (i / (combined.length - 1)) * 100) : 50 };
  });
  return out;
}

export function canslim(profile, ctx = {}) {
  const t = ctx.tech || {}, nifty = ctx.nifty || {};
  const ys = profile.years || [], qs = profile.quarters || [];
  const q = qs[qs.length - 1], qYago = qs.length >= 5 ? qs[qs.length - 5] : null;
  const qGrowth = q?.netIncome != null && qYago?.netIncome > 0 ? ((q.netIncome - qYago.netIncome) / qYago.netIncome) * 100 : null;
  const aGrowth = cagr(ys, 'netIncome', 3) ?? cagr(ys, 'netIncome', 2);
  const nearHigh = t.price && t.high52 ? (t.price / t.high52) : null;
  const upDown = ctx.upDownVol;
  const rs6 = t.ret6m != null && nifty.ret6m != null ? t.ret6m - nifty.ret6m : null;
  const inst = profile.institutionalHolding;
  const mkt = nifty.price && nifty.sma50 && nifty.sma200 ? nifty.price > nifty.sma50 && nifty.price > nifty.sma200 : null;
  const tests = [
    { key: 'C', label: 'Current quarterly profit growth ≥ 25% YoY', value: qGrowth, pass: qGrowth == null ? null : qGrowth >= 25 },
    { key: 'A', label: 'Annual profit growth ≥ 25% (3y CAGR)', value: aGrowth, pass: aGrowth == null ? null : aGrowth >= 25 },
    { key: 'N', label: 'New highs: within 15% of 52-wk high', value: nearHigh != null ? (nearHigh - 1) * 100 : null, pass: nearHigh == null ? null : nearHigh >= 0.85 },
    { key: 'S', label: 'Supply/demand: up-day volume > down-day volume', value: upDown, pass: upDown == null ? null : upDown > 1.1 },
    { key: 'L', label: 'Leader: 6-month return beats NIFTY by 10%+', value: rs6, pass: rs6 == null ? null : rs6 >= 10 },
    { key: 'I', label: 'Institutional sponsorship 5–60%', value: inst, pass: inst == null ? null : inst >= 5 && inst <= 60 },
    { key: 'M', label: 'Market in uptrend (NIFTY > 50 & 200 DMA)', value: mkt == null ? null : mkt ? 'Yes' : 'No', pass: mkt },
  ];
  const known = tests.filter((x) => x.pass != null);
  const score = known.length ? known.filter((x) => x.pass).length : null;
  return { model: 'canslim', score, outOf: 7, tests, norm: score == null ? null : Math.round((score / 7) * 100), label: score == null ? 'n/a' : score >= 6 ? 'Strong fit' : score >= 4 ? 'Partial fit' : 'Weak fit' };
}

export function coffeeCan(profile) {
  const ys = (profile.years || []).slice(-11);
  const rows = [];
  for (let i = 1; i < ys.length; i++) {
    const g = ys[i].revenue && ys[i - 1].revenue > 0 ? ((ys[i].revenue - ys[i - 1].revenue) / ys[i - 1].revenue) * 100 : null;
    const r = roce(ys[i]);
    rows.push({ year: ys[i].date.slice(0, 4), salesGrowth: g, roce: r, pass: g != null && r != null ? g >= 10 && r >= 15 : null });
  }
  const known = rows.filter((r) => r.pass != null);
  const mcapOk = profile.marketCap ? profile.marketCap >= 100 * CR : null;
  const allPass = known.length > 0 && known.every((r) => r.pass) && mcapOk !== false;
  let label;
  if (!known.length) label = 'n/a';
  else if (!allPass) label = 'Fails';
  else if (known.length >= 10) label = 'Passes (10 yrs)';
  else label = `Passes on ${known.length} yrs of data`;
  return { model: 'coffeecan', rows, yearsChecked: known.length, pass: allPass, label, norm: known.length ? Math.round((known.filter((r) => r.pass).length / known.length) * 100) : null, note: known.length < 10 ? 'Needs 10 years — upload a Screener.in export for the full test.' : '' };
}

// Own historical P/E average from annual EPS + price history
export function ownPEAverage(profile, dailyBars) {
  if (!dailyBars?.length) return null;
  const pes = [];
  for (const y of (profile.years || []).slice(-5)) {
    if (!(y.eps > 0)) continue;
    const t = new Date(y.date).getTime();
    let bar = null;
    for (const b of dailyBars) { if (b.t <= t) bar = b; else break; }
    if (bar) pes.push(bar.c / y.eps);
  }
  return pes.length >= 2 ? avg(pes) : null;
}

export function upDownVolume(bars) {
  const r = (bars || []).slice(-50);
  let up = 0, down = 0;
  for (let i = 1; i < r.length; i++) { if (r[i].c >= r[i - 1].c) up += r[i].v || 0; else down += r[i].v || 0; }
  return down ? up / down : null;
}
