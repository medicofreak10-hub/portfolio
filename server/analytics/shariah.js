// Shariah screen computed by this app (S&P/TASIS-style ratios, thresholds configurable).
// Always "screened by app — verify with a qualified scholar / official index".
import { ETF_META } from '../lib/universe.js';

const NC_INDUSTRY = [/bank/i, /credit services/i, /insurance/i, /mortgage/i, /asset management/i, /capital markets/i, /financial conglomerate/i, /shell compan/i,
  /brewer/i, /distiller/i, /winer/i, /tobacco/i, /gambling/i, /casino/i];
const NC_NAME = [/\bbank\b/i, /\bfinance\b/i, /\bfinancial\b/i, /\bfinserv\b/i, /\binsurance\b/i, /\bhousing fin/i, /\bcredit\b/i, /\bcapital ltd\b/i,
  /brewer/i, /distiller/i, /\bspirits\b/i, /liquor/i, /tobacco/i, /cigarette/i, /casino/i, /lottery/i, /\bbeer\b/i];
const DOUBT_INDUSTRY = [/lodging/i, /hotel/i, /resorts/i, /entertainment/i, /broadcasting/i, /restaurants/i, /leisure/i, /electronic gaming/i, /advertising/i];
const NC_SUMMARY = [/alcoholic beverage/i, /\bliquor\b/i, /\bwhisky\b/i, /\bcigarettes?\b/i, /\bgambling\b/i, /\bbetting\b/i, /real[- ]money gaming/i, /\bpork\b/i, /\bnbfc\b/i, /\blending\b/i];

export function businessScreen({ sector, industry, name = '', summary = '' }) {
  const ind = `${industry || ''}`;
  if (sector === 'Financial Services' || NC_INDUSTRY.some((r) => r.test(ind))) return { result: 'fail', reason: `Business: ${industry || sector} (interest-based finance / prohibited activity)` };
  if (NC_NAME.some((r) => r.test(name))) return { result: 'fail', reason: `Business: company name indicates a prohibited activity` };
  const hit = NC_SUMMARY.find((r) => r.test(summary));
  if (hit) return { result: 'doubt', reason: `Business description mentions "${summary.match(hit)[0]}" — check revenue share` };
  if (DOUBT_INDUSTRY.some((r) => r.test(ind))) return { result: 'doubt', reason: `Business: ${industry} may include impermissible revenue (e.g. alcohol, music)` };
  return { result: 'pass', reason: `Business: ${industry || sector || 'n/a'} — permissible` };
}

function latest(years) { return years?.length ? years[years.length - 1] : null; }

export function screen(profile, settings, { override, inShariahIndex } = {}) {
  const lim = settings?.shariah || { debtLimit: 33, interestIncomeLimit: 5, cashLimit: 33, receivablesLimit: 49 };
  const sym = profile.symbol;
  const checks = [];

  if (override?.status) {
    return { status: override.status, source: 'Your override', checks: [{ name: 'Manual override', result: 'info', detail: override.note || 'Set by you' }], purificationPct: null };
  }

  const etf = ETF_META[sym];
  if (profile.type === 'etf' || etf) {
    const status = etf?.shariah || 'Doubtful';
    return { status, source: 'Fund composition', checks: [{ name: 'Fund holdings', result: status === 'Compliant' ? 'pass' : status === 'Doubtful' ? 'doubt' : 'fail', detail: etf?.reason || 'ETF holdings not screened — check the index it tracks.' }], purificationPct: null };
  }
  if (profile.type === 'mf') return mfScreen(profile);

  const biz = businessScreen(profile);
  checks.push({ name: 'Business activity', result: biz.result, detail: biz.reason });

  const y = latest(profile.years);
  const mcap = profile.marketCap;
  const ratio = (num, den) => (num != null && den ? (num / den) * 100 : null);

  const debt = y?.totalDebt ?? profile.totalDebt;
  const debtR = ratio(debt, mcap);
  checks.push(mk('Debt / Market cap', debtR, lim.debtLimit));

  let ii = y?.interestIncome;
  let iiNote = '';
  if (ii == null && y?.otherIncome != null) { ii = Math.max(0, y.otherIncome); iiNote = ' (other income used as upper bound)'; }
  const iiR = ratio(ii, y?.revenue);
  checks.push(mk('Interest income / Revenue', iiR, lim.interestIncomeLimit, iiNote));

  const cash = y?.cash ?? profile.totalCash;
  checks.push(mk('Cash & interest-bearing securities / Market cap', ratio(cash, mcap), lim.cashLimit));
  checks.push(mk('Receivables / Market cap', ratio(y?.receivables, mcap), lim.receivablesLimit));

  if (inShariahIndex) checks.push({ name: 'NIFTY 500 Shariah index', result: 'pass', detail: 'Listed as a constituent (cross-check).' });

  let status;
  if (checks.some((c) => c.result === 'fail')) status = 'Non-compliant';
  else if (checks.some((c) => c.result === 'doubt' || c.result === 'na')) status = 'Doubtful';
  else status = 'Compliant';
  // If only data is missing but NSE's Shariah index includes it, trust the index.
  if (status === 'Doubtful' && inShariahIndex && !checks.some((c) => c.result === 'doubt')) status = 'Compliant';

  return { status, source: 'Screened by app (verify with a scholar)', checks, purificationPct: iiR != null ? Math.min(iiR, 100) : null, thresholds: lim };
}

function mk(name, value, limit, note = '') {
  if (value == null || !isFinite(value)) return { name, result: 'na', value: null, limit, detail: `Data not available${note}` };
  return { name, result: value < limit ? 'pass' : 'fail', value, limit, detail: `${value.toFixed(1)}% (limit < ${limit}%)${note}` };
}

export function mfScreen(profile) {
  const n = profile.name || '';
  if (/shariah|ethical|islamic/i.test(n)) return { status: 'Compliant', source: 'Fund mandate', checks: [{ name: 'Fund mandate', result: 'pass', detail: 'Shariah/ethical mandate fund.' }], purificationPct: null };
  if (/gold|silver/i.test(n)) return { status: 'Doubtful', source: 'Fund mandate', checks: [{ name: 'Fund mandate', result: 'doubt', detail: 'Precious-metal funds are debated among scholars.' }], purificationPct: null };
  if (/healthcare|pharma|technology|\bit\b|digital/i.test(n) && !/balanced|hybrid|debt|liquid/i.test(n)) return { status: 'Doubtful', source: 'Fund mandate', checks: [{ name: 'Fund mandate', result: 'doubt', detail: 'Sector fund in mostly permissible businesses, but not Shariah-screened (holdings may fail ratio tests; fund keeps cash in interest-bearing instruments).' }], purificationPct: null };
  return { status: 'Non-compliant', source: 'Fund mandate', checks: [{ name: 'Fund mandate', result: 'fail', detail: /balanced|hybrid|debt|liquid|arbitrage/i.test(n) ? 'Holds interest-bearing debt instruments.' : 'Conventional diversified fund — typically holds banks/NBFCs/insurers.' }], purificationPct: null };
}

export function purification(dividendAmount, purificationPct) {
  if (!dividendAmount || purificationPct == null) return null;
  return (dividendAmount * purificationPct) / 100;
}
