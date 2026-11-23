// Parse broker exports: Groww (stocks holdings, MF holdings, order history),
// Zerodha (Kite holdings CSV, Console holdings, tradebook), Screener.in export.
import ExcelJS from 'exceljs';
import * as store from './lib/store.js';
import * as data from './data.js';
import { UNIVERSE, UNIVERSE_MAP, isEtf, ETF_META } from './lib/universe.js';
import { setBasePrice } from './providers/mock.js';

export function parseCsv(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((x) => String(x).trim() !== ''));
}

function cellVal(v) {
  if (v == null) return null;
  if (typeof v === 'object') {
    if (v instanceof Date) return v;
    if ('result' in v) return v.result;
    if ('text' in v) return v.text;
    if ('richText' in v) return v.richText.map((t) => t.text).join('');
  }
  return v;
}

export async function readSheets(buffer, filename) {
  if (/\.csv$/i.test(filename)) return [{ name: 'csv', rows: parseCsv(buffer.toString('utf8')) }];
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb.worksheets.map((ws) => {
    const rows = [];
    ws.eachRow({ includeEmpty: false }, (r) => { const vals = r.values.slice(1).map(cellVal); rows.push(vals); });
    return { name: ws.name, rows };
  });
}

const num = (v) => { if (v == null || v === '') return null; if (typeof v === 'number') return v; const n = Number(String(v).replace(/[₹,%\s]/g, '')); return isFinite(n) ? n : null; };
const low = (v) => String(v ?? '').trim().toLowerCase();

function findHeader(rows, required) {
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const r = rows[i].map(low);
    if (required.every((k) => r.some((c) => c === k || c.startsWith(k)))) return { idx: i, cols: r };
  }
  return null;
}
const col = (cols, ...names) => { for (const n of names) { const i = cols.findIndex((c) => c === n || c.startsWith(n)); if (i >= 0) return i; } return -1; };

function parseDate(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v || '').trim();
  let m = s.match(/^(\d{2})[-/](\d{2})[-/](\d{4})/); if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return m[0];
  const d = new Date(s); return isNaN(d) ? null : d.toISOString().slice(0, 10);
}

function titleCase(s) { return String(s).toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\b(Ltd|Limited)\b\.?/g, (x) => x); }
function niceName(symbol, raw) { return UNIVERSE_MAP[symbol]?.name || ETF_META[symbol]?.name || titleCase(String(raw || symbol).replace(/\s+(LIMITED|LTD\.?)$/i, '')); }

function detect(sheet) {
  const r = sheet.rows;
  if (sheet.name.toLowerCase() === 'data sheet' || r.slice(0, 5).some((x) => low(x[0]) === 'company name')) return 'screener';
  if (findHeader(r, ['scheme name', 'units'])) return 'groww-mf';
  if (findHeader(r, ['stock name', 'symbol', 'type', 'quantity'])) return 'groww-orders';
  if (findHeader(r, ['stock name', 'isin', 'quantity', 'average buy price'])) return 'groww-holdings';
  if (findHeader(r, ['symbol', 'isin', 'trade_date', 'trade_type'])) return 'zerodha-tradebook';
  if (findHeader(r, ['symbol', 'isin', 'quantity available', 'average price'])) return 'zerodha-console';
  if (findHeader(r, ['instrument', 'qty.', 'avg. cost'])) return 'zerodha-kite';
  return null;
}

function growwOrders(rows) {
  const h = findHeader(rows, ['stock name', 'symbol', 'type', 'quantity']);
  const c = h.cols; const out = [];
  const iN = col(c, 'stock name'), iS = col(c, 'symbol'), iI = col(c, 'isin'), iT = col(c, 'type'), iQ = col(c, 'quantity'), iV = col(c, 'value'), iE = col(c, 'exchange'), iO = col(c, 'exchange order id'), iD = col(c, 'execution date'), iSt = col(c, 'order status');
  for (const r of rows.slice(h.idx + 1)) {
    if (!r[iS] || (iSt >= 0 && !/executed|complete/i.test(String(r[iSt])))) continue;
    const qty = num(r[iQ]), value = num(r[iV]);
    if (!qty || !value) continue;
    out.push({ symbol: String(r[iS]).trim().toUpperCase(), isin: r[iI], name: r[iN], side: /sell/i.test(r[iT]) ? 'SELL' : 'BUY', qty, price: value / qty, date: parseDate(r[iD]), exchange: r[iE] || 'NSE', orderId: String(r[iO] || ''), broker: 'Groww' });
  }
  return out;
}

function zerodhaTradebook(rows) {
  const h = findHeader(rows, ['symbol', 'isin', 'trade_date', 'trade_type']);
  const c = h.cols; const out = [];
  for (const r of rows.slice(h.idx + 1)) {
    const seg = low(r[col(c, 'segment')]);
    if (seg && seg !== 'eq') continue;
    out.push({ symbol: String(r[col(c, 'symbol')]).trim().toUpperCase(), isin: r[col(c, 'isin')], side: /sell/i.test(r[col(c, 'trade_type')]) ? 'SELL' : 'BUY', qty: num(r[col(c, 'quantity')]), price: num(r[col(c, 'price')]), date: parseDate(r[col(c, 'trade_date')]), exchange: String(r[col(c, 'exchange')] || 'NSE').toUpperCase(), orderId: String(r[col(c, 'trade_id')] || r[col(c, 'order_id')] || ''), broker: 'Zerodha' });
  }
  return out.filter((t) => t.qty && t.price);
}

async function resolveIsin(isin, rawName) {
  const db = store.get();
  if (db.isinMap[isin]) return db.isinMap[isin].symbol;
  try { const m = await data.isinMap(); if (m[isin]) return m[isin].symbol; } catch {}
  const words = low(rawName).replace(/limited|ltd|&/g, ' ').split(/\s+/).filter((w) => w.length > 2);
  const u = UNIVERSE.find((x) => words.length && words.slice(0, 2).every((w) => low(x.name).includes(w)));
  if (u) return u.symbol;
  try { const s = await data.search(isin); if (s[0]) return s[0].symbol; } catch {}
  return null;
}

async function growwHoldings(rows) {
  const h = findHeader(rows, ['stock name', 'isin', 'quantity', 'average buy price']);
  const c = h.cols; const out = []; const unresolved = [];
  for (const r of rows.slice(h.idx + 1)) {
    const name = r[col(c, 'stock name')]; const isin = r[col(c, 'isin')];
    const qty = num(r[col(c, 'quantity')]); const avg = num(r[col(c, 'average buy price')]);
    if (!name || !qty) continue;
    const symbol = await resolveIsin(isin, name);
    if (!symbol) { unresolved.push(name); continue; }
    const close = num(r[col(c, 'closing price')]);
    out.push({ type: String(isin).startsWith('INF') || isEtf(symbol, name) ? 'etf' : 'stock', symbol, exchange: 'NSE', isin, name: niceName(symbol, name), qty, avgPrice: avg, broker: 'Groww', lastClose: close });
  }
  return { holdings: out, unresolved };
}

function growwMf(rows) {
  const h = findHeader(rows, ['scheme name', 'units']);
  const c = h.cols; const out = [];
  for (const r of rows.slice(h.idx + 1)) {
    const name = r[col(c, 'scheme name')]; const units = num(r[col(c, 'units')]);
    if (!name || !units) continue;
    const invested = num(r[col(c, 'invested value')]); const current = num(r[col(c, 'current value')]);
    const x = String(r[col(c, 'xirr')] ?? '').replace('%', '');
    out.push({ type: 'mf', symbol: 'MF-' + String(r[col(c, 'folio')] || name).replace(/\W/g, '').slice(-12), exchange: 'AMFI', name: String(name).trim(), amc: r[col(c, 'amc')], category: [r[col(c, 'category')], r[col(c, 'sub-category')]].filter(Boolean).join(' · '), folio: String(r[col(c, 'folio')] || ''), qty: Math.round(units * 10000) / 10000, avgPrice: invested / units, lastNav: current ? current / units : null, reportedXirr: x === '' || isNaN(Number(x)) ? null : Number(x), broker: r[col(c, 'source')] === 'External' ? 'External (via Groww)' : 'Groww' });
  }
  return out;
}

function zerodhaConsole(rows) {
  const h = findHeader(rows, ['symbol', 'isin', 'quantity available', 'average price']);
  const c = h.cols; const out = [];
  for (const r of rows.slice(h.idx + 1)) {
    const sym = String(r[col(c, 'symbol')] || '').trim(); const qty = num(r[col(c, 'quantity available')]) + (num(r[col(c, 'quantity long term')]) || 0) * 0;
    if (!sym || !qty) continue;
    const isin = r[col(c, 'isin')]; const avg = num(r[col(c, 'average price')]);
    if (/\s/.test(sym)) out.push({ type: 'mf', symbol: 'MF-' + String(isin || sym).replace(/\W/g, '').slice(-12), exchange: 'AMFI', name: sym, isin, qty, avgPrice: avg, lastNav: num(r[col(c, 'previous closing price')]), broker: 'Zerodha Coin' });
    else out.push({ type: String(isin).startsWith('INF') || isEtf(sym) ? 'etf' : 'stock', symbol: sym.toUpperCase(), exchange: 'NSE', isin, name: niceName(sym.toUpperCase(), sym), qty, avgPrice: avg, broker: 'Zerodha', lastClose: num(r[col(c, 'previous closing price')]) });
  }
  return out;
}

function zerodhaKite(rows) {
  const h = findHeader(rows, ['instrument', 'qty.', 'avg. cost']);
  const c = h.cols; const out = [];
  for (const r of rows.slice(h.idx + 1)) {
    let sym = String(r[col(c, 'instrument')] || '').trim().toUpperCase(); const qty = num(r[col(c, 'qty.')]);
    if (!sym || !qty) continue;
    let exchange = 'NSE';
    if (/-BE$|-SM$|-ST$/.test(sym)) sym = sym.replace(/-(BE|SM|ST)$/, '');
    if (/^\d{6}$/.test(sym)) exchange = 'BSE';
    out.push({ type: isEtf(sym) ? 'etf' : 'stock', symbol: sym, exchange, name: niceName(sym, sym), qty, avgPrice: num(r[col(c, 'avg. cost')]), broker: 'Zerodha', lastClose: num(r[col(c, 'ltp')]) });
  }
  return out;
}

// Screener.in "Export to Excel" -> Data Sheet. Values are in ₹ crore.
export function parseScreener(rows) {
  const CR = 1e7;
  let company = null, section = null; const sec = {};
  for (const r of rows) {
    const label = String(r[0] ?? '').trim();
    const l = label.toLowerCase();
    if (l === 'company name') { company = r[1]; continue; }
    if (/^profit & loss/.test(l)) { section = 'pl'; continue; }
    if (/^quarters/.test(l)) { section = 'q'; continue; }
    if (/^balance sheet/.test(l)) { section = 'bs'; continue; }
    if (/^cash flow/.test(l)) { section = 'cf'; continue; }
    if (/^price/.test(l) && section === 'cf') { section = 'price'; }
    if (/^derived/.test(l)) { section = 'derived'; continue; }
    if (!section) continue;
    sec[section] = sec[section] || {};
    sec[section][l] = r.slice(1);
  }
  const dates = (sec.pl?.['report date'] || []).map((d) => (d ? parseDate(d) : null));
  if (!dates.filter(Boolean).length) throw new Error('Not a Screener export (no Report Date row)');
  const g = (s, k, i) => { const row = sec[s]?.[k]; return row ? num(row[i]) : null; };
  const bsDates = (sec.bs?.['report date'] || []).map((d) => (d ? parseDate(d) : null));
  const years = [];
  dates.forEach((d, i) => {
    if (!d) return;
    const bi = bsDates.indexOf(d) >= 0 ? bsDates.indexOf(d) : i;
    const sales = g('pl', 'sales', i), pbt = g('pl', 'profit before tax', i), intr = g('pl', 'interest', i), oi = g('pl', 'other income', i), np = g('pl', 'net profit', i), dep = g('pl', 'depreciation', i);
    const eqCap = g('bs', 'equity share capital', bi), res = g('bs', 'reserves', bi), borrow = g('bs', 'borrowings', bi), otherLiab = g('bs', 'other liabilities', bi);
    const total = g('bs', 'total', bi), netBlock = g('bs', 'net block', bi), recv = g('bs', 'receivables', bi), inv = g('bs', 'inventory', bi), cashB = g('bs', 'cash & bank', bi), shares = g('bs', 'no. of equity shares', bi);
    const cfo = g('cf', 'cash from operating activity', bi);
    const x = (v) => (v == null ? null : v * CR);
    const ebit = pbt != null ? pbt + (intr || 0) : null;
    years.push({
      date: d, revenue: x(sales), operatingIncome: ebit != null ? x(ebit - (oi || 0)) : null, ebit: x(ebit), netIncome: x(np), interestExpense: x(intr), interestIncome: null, otherIncome: x(oi),
      eps: np != null && shares ? (np * CR) / shares : null, shares, totalAssets: x(total), currentAssets: recv != null || inv != null || cashB != null ? x((recv || 0) + (inv || 0) + (cashB || 0)) : null,
      currentLiabilities: x(otherLiab), totalLiabilities: total != null && eqCap != null ? x(total - eqCap - (res || 0)) : null, totalDebt: x(borrow), longTermDebt: x(borrow), cash: x(cashB), receivables: x(recv),
      equity: eqCap != null ? x(eqCap + (res || 0)) : null, retainedEarnings: x(res), netPPE: x(netBlock), workingCapital: null, cfo: x(cfo), capex: null, grossProfit: null, depreciation: x(dep),
    });
  });
  return { company, years: years.filter((y) => y.revenue != null || y.totalAssets != null), source: 'Screener.in export' };
}

function dedupeTxns(db, txns) {
  const key = (t) => t.orderId ? `${t.broker}:${t.orderId}:${t.symbol}:${t.qty}` : `${t.symbol}:${t.date}:${t.side}:${t.qty}:${t.price.toFixed(2)}`;
  const seen = new Set(db.transactions.map(key));
  let added = 0;
  for (const t of txns) { if (seen.has(key(t))) continue; seen.add(key(t)); db.transactions.push({ id: store.uid(), ...t }); added++; }
  return added;
}

function replaceHoldings(db, list, broker, types) {
  db.holdings = db.holdings.filter((h) => !(h.broker === broker && types.includes(h.type)) && !(types.includes('mf') && h.type === 'mf' && /groww/i.test(broker) && /groww/i.test(h.broker || '')));
  for (const h of list) {
    const existing = db.holdings.find((x) => x.symbol === h.symbol && x.type === h.type);
    if (existing) Object.assign(existing, h, { id: existing.id });
    else db.holdings.push({ id: store.uid(), ...h });
    if (h.lastClose) setBasePrice(h.symbol, h.lastClose);
  }
}

// files: [{buffer, filename, symbol?}] -> report
export async function importFiles(files, { symbol } = {}) {
  const db = store.get();
  const report = [];
  const parsed = [];
  for (const f of files) {
    try {
      const sheets = await readSheets(f.buffer, f.filename);
      let found = false;
      for (const s of sheets) { const kind = detect(s); if (kind) { parsed.push({ kind, sheet: s, file: f.filename }); found = true; } }
      if (!found) report.push({ file: f.filename, ok: false, message: 'Format not recognised. Supported: Groww holdings/orders/MF statements, Zerodha Kite/Console holdings, Zerodha tradebook, Screener.in export.' });
    } catch (e) { report.push({ file: f.filename, ok: false, message: 'Could not read file: ' + e.message }); }
  }
  // orders first so ISIN->symbol mapping is available for holdings statements
  const order = ['groww-orders', 'zerodha-tradebook', 'groww-holdings', 'zerodha-console', 'zerodha-kite', 'groww-mf', 'screener'];
  parsed.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  for (const p of parsed) {
    const rows = p.sheet.rows;
    if (p.kind === 'groww-orders' || p.kind === 'zerodha-tradebook') {
      const tx = p.kind === 'groww-orders' ? growwOrders(rows) : zerodhaTradebook(rows);
      for (const t of tx) if (t.isin && !db.isinMap[t.isin]) db.isinMap[t.isin] = { symbol: t.symbol, name: t.name };
      const added = dedupeTxns(db, tx);
      report.push({ file: p.file, kind: p.kind, ok: true, message: `${tx.length} trades read, ${added} new` });
    } else if (p.kind === 'groww-holdings') {
      const { holdings, unresolved } = await growwHoldings(rows);
      replaceHoldings(db, holdings, 'Groww', ['stock', 'etf']);
      report.push({ file: p.file, kind: p.kind, ok: true, message: `${holdings.length} stock/ETF holdings imported${unresolved.length ? `; could not find NSE symbol for: ${unresolved.join(', ')} (add manually)` : ''}` });
    } else if (p.kind === 'groww-mf') {
      const list = growwMf(rows);
      replaceHoldings(db, list, 'Groww', ['mf']);
      report.push({ file: p.file, kind: p.kind, ok: true, message: `${list.length} mutual fund folios imported` });
    } else if (p.kind === 'zerodha-console' || p.kind === 'zerodha-kite') {
      const list = p.kind === 'zerodha-console' ? zerodhaConsole(rows) : zerodhaKite(rows);
      replaceHoldings(db, list.filter((h) => h.type !== 'mf'), 'Zerodha', ['stock', 'etf']);
      const mfs = list.filter((h) => h.type === 'mf');
      if (mfs.length) replaceHoldings(db, mfs, 'Zerodha Coin', ['mf']);
      report.push({ file: p.file, kind: p.kind, ok: true, message: `${list.length} holdings imported from Zerodha` });
    } else if (p.kind === 'screener') {
      const res = parseScreener(rows);
      const sym = symbol || UNIVERSE.find((u) => res.company && low(res.company).includes(low(u.name).split(' ')[0]))?.symbol || db.holdings.find((h) => res.company && low(h.name).startsWith(low(res.company).split(' ')[0]))?.symbol;
      if (!sym) { report.push({ file: p.file, kind: p.kind, ok: false, message: `Read ${res.years.length} years for "${res.company}", but couldn't match a symbol — upload it from the stock's page.` }); continue; }
      db.fundamentalUploads[sym] = { years: res.years, source: res.source, uploadedAt: Date.now() };
      report.push({ file: p.file, kind: p.kind, ok: true, symbol: sym, message: `${res.years.length} years of financials saved for ${sym}` });
    }
  }
  store.save();
  return report;
}
