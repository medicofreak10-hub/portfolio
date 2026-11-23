import { test } from 'node:test';
import assert from 'node:assert/strict';
import { xirr, openLots, holdingXirr } from '../server/analytics/xirr.js';
import { sma, rsi, pivots, technicals } from '../server/analytics/indicators.js';
import { entryZone } from '../server/analytics/entryZone.js';
import { screen, businessScreen, purification, mfScreen } from '../server/analytics/shariah.js';
import * as S from '../server/analytics/scores.js';
import { sentiment, corporateTag } from '../server/analytics/sentiment.js';
import { marketStatus } from '../server/lib/time.js';
import { components as moodComponents } from '../server/mood.js';

const DAY = 86400000;

test('xirr: 10% over exactly one year', () => {
  const t0 = Date.UTC(2024, 0, 1);
  const r = xirr([{ t: t0, amount: -1000 }, { t: t0 + 365 * DAY, amount: 1100 }]);
  assert.ok(Math.abs(r - 10) < 0.01, r);
});

test('xirr: needs both signs', () => {
  assert.equal(xirr([{ t: 0, amount: -1 }, { t: DAY * 400, amount: -1 }]), null);
});

test('FIFO open lots with partial history uses opening lot priced to match broker average', () => {
  const h = { symbol: 'X', qty: 120, avgPrice: 50 };
  const tx = [
    { symbol: 'X', side: 'BUY', qty: 50, price: 60, date: '2026-05-01' },
    { symbol: 'X', side: 'SELL', qty: 30, price: 70, date: '2026-06-01' },
  ];
  const { lots, approx } = openLots(h, tx);
  assert.equal(approx, true);
  const qty = lots.reduce((s, l) => s + l.qty, 0);
  assert.equal(qty, 120);
  const cost = lots.reduce((s, l) => s + l.qty * l.price, 0);
  assert.ok(Math.abs(cost - 6000) < 1e-6);
});

test('FIFO with complete history needs no opening lot', () => {
  const h = { symbol: 'X', qty: 20, avgPrice: 12 };
  const tx = [
    { symbol: 'X', side: 'BUY', qty: 10, price: 10, date: '2025-01-01' },
    { symbol: 'X', side: 'BUY', qty: 20, price: 12, date: '2025-02-01' },
    { symbol: 'X', side: 'SELL', qty: 10, price: 15, date: '2025-03-01' },
  ];
  const { lots, approx } = openLots(h, tx);
  assert.equal(approx, false);
  assert.deepEqual(lots.map((l) => [l.qty, l.price]), [[20, 12]]);
  const r = holdingXirr(h, tx, 20 * 13.2, Date.UTC(2026, 1, 1));
  assert.ok(Math.abs(r.xirr - 10) < 0.5, r.xirr);
});

test('XIRR is withheld for holdings under two months', () => {
  const now = Date.UTC(2026, 10, 20);
  const r = holdingXirr({ symbol: 'Y', qty: 1, avgPrice: 100 }, [{ symbol: 'Y', side: 'BUY', qty: 1, price: 100, date: '2026-11-01' }], 130, now);
  assert.equal(r.xirr, null);
  assert.equal(r.tooRecent, true);
});

test('sma / rsi basics', () => {
  assert.deepEqual(sma([1, 2, 3, 4], 2), [null, 1.5, 2.5, 3.5]);
  const up = Array.from({ length: 30 }, (_, i) => 100 + i);
  assert.equal(rsi(up).at(-1), 100);
  const down = Array.from({ length: 30 }, (_, i) => 100 - i);
  assert.ok(rsi(down).at(-1) < 1);
});

function makeBars(fn, n = 300) {
  return Array.from({ length: n }, (_, i) => { const c = fn(i); return { t: Date.UTC(2025, 0, 1) + i * DAY, o: c, h: c * 1.01, l: c * 0.99, c, v: 1000 }; });
}

test('pivots find swing lows', () => {
  const bars = makeBars((i) => 100 + 10 * Math.sin(i / 8));
  const { lows, highs } = pivots(bars, 5);
  assert.ok(lows.length > 3 && highs.length > 3);
});

test('entry zone: levels ordered and status logic', () => {
  const bars = makeBars((i) => 100 + i * 0.2 + 6 * Math.sin(i / 6));
  const e = entryZone(bars);
  assert.ok(e.available);
  assert.ok(e.stopLoss < e.zoneLow && e.zoneLow < e.zoneHigh && e.zoneHigh < e.target1 && e.target1 <= e.target2, JSON.stringify(e));
  assert.ok(e.rr > 0);
  assert.equal(e.disclaimer, 'Technical guide only, not advice.');
  assert.ok(['in', 'near', 'wait', 'overbought', 'exit'].includes(e.status));
});

test('entry zone: strong rally is flagged overbought', () => {
  const bars = makeBars((i) => (i < 250 ? 100 : 100 * Math.pow(1.02, i - 250)));
  const e = entryZone(bars);
  assert.equal(e.status, 'overbought');
});

test('entry zone: collapse below stop is an exit warning', () => {
  const bars = makeBars((i) => (i < 295 ? 100 + 5 * Math.sin(i / 5) : 60));
  const e = entryZone(bars, { livePrice: 50 });
  assert.equal(e.status, 'exit');
});

test('entry zone: needs enough history', () => {
  assert.equal(entryZone(makeBars((i) => 100, 30)).available, false);
});

const settings = { shariah: { debtLimit: 33, interestIncomeLimit: 5, cashLimit: 33, receivablesLimit: 49 } };
const goodYear = { revenue: 1000, totalDebt: 50, interestIncome: 10, cash: 40, receivables: 100 };

test('shariah: compliant company', () => {
  const r = screen({ symbol: 'A', sector: 'Healthcare', industry: 'Medical Care Facilities', marketCap: 2000, years: [goodYear] }, settings);
  assert.equal(r.status, 'Compliant');
  assert.ok(Math.abs(r.purificationPct - 1) < 1e-9);
});

test('shariah: bank fails on business', () => {
  assert.equal(screen({ symbol: 'B', sector: 'Financial Services', industry: 'Banks—Regional', marketCap: 2000, years: [goodYear] }, settings).status, 'Non-compliant');
  assert.equal(businessScreen({ industry: 'Tobacco' }).result, 'fail');
  assert.equal(businessScreen({ industry: 'Beverages—Wineries & Distilleries' }).result, 'fail');
  assert.equal(businessScreen({ industry: 'Lodging' }).result, 'doubt');
});

test('shariah: high debt fails, missing data is doubtful', () => {
  assert.equal(screen({ symbol: 'C', sector: 'Industrials', industry: 'Tools', marketCap: 100, years: [{ ...goodYear, totalDebt: 50 }] }, settings).status, 'Non-compliant');
  assert.equal(screen({ symbol: 'D', sector: 'Industrials', industry: 'Tools', marketCap: 2000, years: [{ revenue: 1000 }] }, settings).status, 'Doubtful');
});

test('shariah: thresholds are configurable', () => {
  const p = { symbol: 'E', sector: 'Industrials', industry: 'Tools', marketCap: 1000, years: [{ ...goodYear, totalDebt: 310 }] };
  assert.equal(screen(p, settings).status, 'Compliant');
  assert.equal(screen(p, { shariah: { ...settings.shariah, debtLimit: 30 } }).status, 'Non-compliant');
});

test('shariah: ETFs, MFs and overrides', () => {
  assert.equal(screen({ symbol: 'NIFTYBEES', type: 'etf' }, settings).status, 'Non-compliant');
  assert.equal(screen({ symbol: 'GOLDCASE', type: 'etf' }, settings).status, 'Doubtful');
  assert.equal(mfScreen({ name: 'Tata Ethical Fund Direct Growth' }).status, 'Compliant');
  assert.equal(mfScreen({ name: 'HDFC Balanced Advantage Fund Direct Growth' }).status, 'Non-compliant');
  assert.equal(screen({ symbol: 'Z' }, settings, { override: { status: 'Compliant' } }).status, 'Compliant');
  assert.equal(purification(1000, 2.5), 25);
});

function yr(i, g = 0.25) {
  const rev = 1000 * Math.pow(1 + g, i);
  return { date: `${2018 + i}-03-31`, revenue: rev, operatingIncome: rev * 0.2, ebit: rev * 0.21, netIncome: rev * 0.15, grossProfit: rev * 0.4, interestExpense: 5, eps: rev * 0.15 / 100, shares: 100, totalAssets: rev * 1.2, currentAssets: rev * 0.6, currentLiabilities: rev * 0.25, totalLiabilities: rev * 0.4, totalDebt: rev * 0.05, longTermDebt: rev * 0.03, cash: rev * 0.1, receivables: rev * 0.15, equity: rev * 0.8, retainedEarnings: rev * 0.6, netPPE: rev * 0.4, cfo: rev * 0.16 };
}
const strong = { symbol: 'S', marketCap: 4e10, pe: 20, roe: 19, promoterHolding: 60, institutionalHolding: 12, pledgePct: 0, years: Array.from({ length: 8 }, (_, i) => yr(i)) };

test('cagr and roce', () => {
  assert.ok(Math.abs(S.cagr(strong.years, 'revenue', 3) - 25) < 1e-6);
  assert.ok(S.roce(strong.years[0]) > 15);
});

test('multibagger: strong grower scores high with breakdown', () => {
  const m = S.multibagger(strong, { tech: { price: 110, sma200: 100, ret1y: 40 }, nifty: { ret1y: 10 }, industryPE: 30, peerMaxMcap: strong.marketCap * 10 });
  assert.ok(m.score >= 70, m.score);
  assert.equal(m.components.reduce((s, c) => s + c.weight, 0), 100);
  assert.ok(m.strengths.length > 0);
  assert.match(m.label, /not a guarantee/);
});

test('multibagger: weak company scores low and is flagged', () => {
  const weak = { symbol: 'W', marketCap: 1e12, pe: 80, roe: 3, promoterHolding: 20, pledgePct: 30, years: Array.from({ length: 5 }, (_, i) => ({ ...yr(i, -0.05), totalDebt: 3000, equity: 1000, cfo: -10, netIncome: 10 })) };
  const m = S.multibagger(weak, { tech: { price: 90, sma200: 100, ret1y: -20 }, nifty: { ret1y: 10 } });
  assert.ok(m.score < 40, m.score);
  assert.ok(m.flags.length > 0);
  assert.equal(S.band(m.score).key, 'weak');
});

test('piotroski, altman, coffee can, canslim, magic rank', () => {
  const p = S.piotroski(strong);
  // flat ratios: the four 'improving' tests can't pass, the other five do
  assert.equal(p.known, 9); assert.equal(p.score, 5);
  const a = S.altman(strong);
  assert.equal(a.label, 'Safe zone');
  const c = S.coffeeCan(strong);
  assert.equal(c.pass, true);
  assert.match(c.label, /Passes on 7 yrs/);
  const cs = S.canslim(strong, { tech: { price: 98, high52: 100, ret6m: 30 }, nifty: { ret6m: 5, price: 10, sma50: 9, sma200: 8 }, upDownVol: 1.5 });
  assert.ok(cs.score >= 4, JSON.stringify(cs.tests));
  const ranks = S.magicRank({ A: { roc: 50, ey: 10 }, B: { roc: 10, ey: 2 }, C: { roc: 30, ey: 8 } });
  assert.equal(ranks.A.rank, 1); assert.equal(ranks.B.rank, 3); assert.equal(ranks.A.norm, 100);
});

test('sentiment and corporate tags', () => {
  assert.equal(sentiment('Yatharth shares jump after strong Q2 results').label, 'Positive');
  assert.equal(sentiment('Pace Digitek stock falls 8% as margins come under pressure').label, 'Negative');
  assert.equal(sentiment('Company to hold AGM on Friday').label, 'Neutral');
  assert.equal(corporateTag('Board meeting to consider Q3 results'), 'Results');
  assert.equal(corporateTag('Company announces 1:1 bonus issue'), 'Bonus');
  assert.equal(corporateTag('Interim dividend of Rs 5 declared'), 'Dividend');
});

test('market hours in IST', () => {
  // Mon 2026-11-23 10:00 IST = 04:30 UTC
  assert.equal(marketStatus(new Date('2026-11-23T04:30:00Z')).state, 'open');
  assert.equal(marketStatus(new Date('2026-11-23T10:30:00Z')).state, 'closed'); // 16:00 IST
  assert.equal(marketStatus(new Date('2026-11-23T03:40:00Z')).state, 'preopen'); // 09:10 IST
  assert.equal(marketStatus(new Date('2026-11-22T05:00:00Z')).state, 'closed'); // Sunday
});

test('mood index components map to zones', () => {
  const fear = moodComponents({ vix: 24, nifty: 90, sma50: 100, sma200: 105, adRatio: 0.3, fiiNet: -5000, diiNet: 0, niftyRet1m: -8, goldRet1m: 4 });
  const greed = moodComponents({ vix: 10, nifty: 110, sma50: 100, sma200: 95, adRatio: 3, fiiNet: 5000, diiNet: 2000, niftyRet1m: 6, goldRet1m: -2 });
  assert.ok(fear.value < 30, fear.value);
  assert.ok(greed.value > 70, greed.value);
});
