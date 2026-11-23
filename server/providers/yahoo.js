// Live data from Yahoo Finance (unofficial, free). NSE quotes are ~1-2 min delayed.
import YahooFinance from 'yahoo-finance2';
import { yahooTicker } from './symbols.js';

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] });
const NOVALIDATE = { validateResult: false };

export async function quotes(items) {
  // items: [{symbol, exchange}]
  const tickers = [...new Set(items.map((i) => yahooTicker(i.symbol, i.exchange)))];
  const out = {};
  for (let i = 0; i < tickers.length; i += 40) {
    const batch = tickers.slice(i, i + 40);
    const res = await yf.quote(batch, {}, NOVALIDATE);
    for (const q of [].concat(res || [])) {
      out[q.symbol] = {
        price: q.regularMarketPrice,
        change: q.regularMarketChange,
        changePct: q.regularMarketChangePercent,
        prevClose: q.regularMarketPreviousClose,
        open: q.regularMarketOpen,
        dayHigh: q.regularMarketDayHigh,
        dayLow: q.regularMarketDayLow,
        volume: q.regularMarketVolume,
        avgVolume: q.averageDailyVolume3Month,
        high52: q.fiftyTwoWeekHigh,
        low52: q.fiftyTwoWeekLow,
        pe: q.trailingPE,
        marketCap: q.marketCap,
        name: q.longName || q.shortName,
        time: q.regularMarketTime ? new Date(q.regularMarketTime).getTime() : Date.now(),
      };
    }
  }
  return out;
}

const RANGE = {
  '1d': { days: 1, interval: '1m' },
  '5d': { days: 7, interval: '5m' },
  '1mo': { days: 31, interval: '1d' },
  '1y': { days: 366, interval: '1d' },
  '2y': { days: 740, interval: '1d' },
  '5y': { days: 1830, interval: '1d' },
  '10y': { days: 3660, interval: '1wk' },
};

export async function history(symbol, exchange, range = '1y') {
  const r = RANGE[range] || RANGE['1y'];
  const period1 = new Date(Date.now() - r.days * 86400000);
  const res = await yf.chart(yahooTicker(symbol, exchange), { period1, interval: r.interval }, NOVALIDATE);
  let bars = (res?.quotes || [])
    .filter((b) => b.close != null)
    .map((b) => ({ t: new Date(b.date).getTime(), o: b.open, h: b.high, l: b.low, c: b.close, v: b.volume || 0 }));
  if (range === '1d' && bars.length) {
    // keep only the latest session
    const last = new Date(bars[bars.length - 1].t + 19800000).toISOString().slice(0, 10);
    bars = bars.filter((b) => new Date(b.t + 19800000).toISOString().slice(0, 10) === last);
  }
  return bars;
}

function pick(row, ...keys) {
  if (!row) return null;
  for (const k of keys) {
    for (const rk of Object.keys(row)) if (rk.toLowerCase() === k.toLowerCase() && row[rk] != null) return Number(row[rk]);
  }
  return null;
}

function normYear(r) {
  return {
    date: new Date(r.date).toISOString().slice(0, 10),
    revenue: pick(r, 'totalRevenue', 'operatingRevenue'),
    grossProfit: pick(r, 'grossProfit'),
    operatingIncome: pick(r, 'operatingIncome'),
    ebit: pick(r, 'EBIT', 'operatingIncome'),
    ebitda: pick(r, 'EBITDA', 'normalizedEBITDA'),
    netIncome: pick(r, 'netIncome', 'netIncomeCommonStockholders'),
    interestExpense: Math.abs(pick(r, 'interestExpense', 'interestExpenseNonOperating') || 0) || null,
    interestIncome: pick(r, 'interestIncome', 'interestIncomeNonOperating'),
    otherIncome: pick(r, 'otherIncomeExpense', 'otherNonOperatingIncomeExpenses'),
    eps: pick(r, 'dilutedEPS', 'basicEPS'),
    shares: pick(r, 'ordinarySharesNumber', 'shareIssued', 'dilutedAverageShares', 'basicAverageShares'),
    totalAssets: pick(r, 'totalAssets'),
    currentAssets: pick(r, 'currentAssets'),
    currentLiabilities: pick(r, 'currentLiabilities'),
    totalLiabilities: pick(r, 'totalLiabilitiesNetMinorityInterest'),
    totalDebt: pick(r, 'totalDebt'),
    longTermDebt: pick(r, 'longTermDebt', 'longTermDebtAndCapitalLeaseObligation'),
    cash: pick(r, 'cashCashEquivalentsAndShortTermInvestments', 'cashAndCashEquivalents'),
    receivables: pick(r, 'accountsReceivable', 'receivables'),
    equity: pick(r, 'stockholdersEquity', 'commonStockEquity'),
    retainedEarnings: pick(r, 'retainedEarnings'),
    netPPE: pick(r, 'netPPE'),
    workingCapital: pick(r, 'workingCapital'),
    cfo: pick(r, 'operatingCashFlow', 'cashFlowFromContinuingOperatingActivities'),
    capex: pick(r, 'capitalExpenditure'),
  };
}

export async function fundamentals(symbol, exchange) {
  const t = yahooTicker(symbol, exchange);
  const modules = ['price', 'summaryDetail', 'defaultKeyStatistics', 'financialData', 'assetProfile', 'majorHoldersBreakdown', 'calendarEvents'];
  const [qs, annual, quarterly] = await Promise.all([
    yf.quoteSummary(t, { modules }, NOVALIDATE),
    yf.fundamentalsTimeSeries(t, { period1: '2014-01-01', type: 'annual', module: 'all' }, NOVALIDATE).catch(() => []),
    yf.fundamentalsTimeSeries(t, { period1: new Date(Date.now() - 800 * 86400000), type: 'quarterly', module: 'financials' }, NOVALIDATE).catch(() => []),
  ]);
  const p = qs?.price || {}, sd = qs?.summaryDetail || {}, ks = qs?.defaultKeyStatistics || {}, fd = qs?.financialData || {}, ap = qs?.assetProfile || {}, mh = qs?.majorHoldersBreakdown || {};
  const years = (annual || []).map(normYear).filter((y) => y.revenue != null || y.totalAssets != null).sort((a, b) => a.date.localeCompare(b.date));
  const quarters = (quarterly || []).map(normYear).filter((y) => y.revenue != null || y.netIncome != null).sort((a, b) => a.date.localeCompare(b.date));
  const ce = qs?.calendarEvents || {};
  return {
    source: 'Yahoo Finance',
    name: p.longName || p.shortName || symbol,
    sector: ap.sector || null,
    industry: ap.industry || null,
    summary: ap.longBusinessSummary || '',
    marketCap: p.marketCap ?? sd.marketCap ?? null,
    price: p.regularMarketPrice ?? null,
    pe: sd.trailingPE ?? null,
    forwardPE: sd.forwardPE ?? null,
    pb: ks.priceToBook ?? null,
    eps: ks.trailingEps ?? null,
    roe: fd.returnOnEquity != null ? fd.returnOnEquity * 100 : null,
    roa: fd.returnOnAssets != null ? fd.returnOnAssets * 100 : null,
    debtToEquity: fd.debtToEquity != null ? fd.debtToEquity / 100 : null,
    operatingMargin: fd.operatingMargins != null ? fd.operatingMargins * 100 : null,
    profitMargin: fd.profitMargins != null ? fd.profitMargins * 100 : null,
    revenueGrowth: fd.revenueGrowth != null ? fd.revenueGrowth * 100 : null,
    earningsGrowth: fd.earningsGrowth != null ? fd.earningsGrowth * 100 : null,
    totalCash: fd.totalCash ?? null,
    totalDebt: fd.totalDebt ?? null,
    dividendYield: sd.dividendYield != null ? sd.dividendYield * 100 : null,
    high52: sd.fiftyTwoWeekHigh ?? null,
    low52: sd.fiftyTwoWeekLow ?? null,
    beta: sd.beta ?? null,
    promoterHolding: mh.insidersPercentHeld != null ? mh.insidersPercentHeld * 100 : null,
    institutionalHolding: mh.institutionsPercentHeld != null ? mh.institutionsPercentHeld * 100 : null,
    sharesOutstanding: ks.sharesOutstanding ?? null,
    pledgePct: null,
    earningsDate: ce.earnings?.earningsDate?.[0] ? new Date(ce.earnings.earningsDate[0]).toISOString() : null,
    exDividendDate: ce.exDividendDate ? new Date(ce.exDividendDate).toISOString() : null,
    years,
    quarters,
  };
}

export async function search(q) {
  const res = await yf.search(q, { quotesCount: 8, newsCount: 0 }, NOVALIDATE);
  return (res?.quotes || [])
    .filter((x) => /\.(NS|BO)$/.test(x.symbol || ''))
    .map((x) => ({ symbol: x.symbol.replace(/\.(NS|BO)$/, ''), exchange: x.symbol.endsWith('.BO') ? 'BSE' : 'NSE', name: x.longname || x.shortname, type: x.quoteType }));
}
