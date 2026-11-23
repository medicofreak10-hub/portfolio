import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mhp-test-'));
process.env.DATA_DIR = dir; process.env.DATA_MODE = 'demo';
const store = await import('../server/lib/store.js');
const { importFiles, parseCsv } = await import('../server/importer.js');
const AL = await import('../server/alerts.js');
const fx = (f) => ({ buffer: fs.readFileSync(path.join(import.meta.dirname, 'fixtures', f)), filename: f });

before(() => store.reset());

test('csv parser handles quotes', () => {
  assert.deepEqual(parseCsv('a,"b,c","d""e"\n1,2,3\n'), [['a', 'b,c', 'd"e'], ['1', '2', '3']]);
});

test('Zerodha Kite holdings CSV + tradebook import', async () => {
  const report = await importFiles([fx('kite_holdings.csv'), fx('zerodha_tradebook.csv')]);
  assert.ok(report.every((r) => r.ok), JSON.stringify(report));
  const db = store.get();
  const sag = db.holdings.find((h) => h.symbol === 'SAGILITY');
  assert.equal(sag.qty, 100); assert.equal(sag.avgPrice, 42.1); assert.equal(sag.type, 'stock');
  assert.equal(db.holdings.find((h) => h.symbol === 'GOLDCASE').type, 'etf');
  assert.ok(db.holdings.find((h) => h.symbol === 'YATHARTH'), 'strips -BE series suffix');
  assert.equal(db.transactions.length, 3, 'non-EQ segment skipped');
  // re-import is idempotent
  await importFiles([fx('zerodha_tradebook.csv')]);
  assert.equal(store.get().transactions.length, 3);
});

test('Groww stock + MF statements', async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  ws.addRows([['Name', 'Test User'], ['Holdings statement for stocks as on 20-11-2026'], ['Stock Name', 'ISIN', 'Quantity', 'Average buy price', 'Buy value', 'Closing price', 'Closing value', 'Unrealised P&L'], ['YATHARTH HOSP & TRA C S L', 'INE0JO301016', 10, 800, 8000, 1000, 10000, 2000]]);
  const mf = new ExcelJS.Workbook();
  mf.addWorksheet('Holdings').addRows([['HOLDINGS AS ON 2026-11-21'], ['Scheme Name', 'AMC', 'Category', 'Sub-category', 'Folio No.', 'Source', 'Units', 'Invested Value', 'Current Value', 'Returns', 'XIRR'], ['Parag Parikh Flexi Cap Fund Direct Growth', 'PPFAS Mutual Fund', 'Equity', 'Flexi Cap', '1000001', 'External', 100, '8000', '9000', 1000, '12.31%']]);
  const report = await importFiles([{ buffer: Buffer.from(await ws.workbook.xlsx.writeBuffer()), filename: 'Stocks_Holdings_Statement.xlsx' }, { buffer: Buffer.from(await mf.xlsx.writeBuffer()), filename: 'Holdings_Statement.xlsx' }]);
  assert.ok(report.every((r) => r.ok), JSON.stringify(report));
  const db = store.get();
  const y = db.holdings.find((h) => h.symbol === 'YATHARTH' && h.broker === 'Groww');
  assert.ok(y, 'ISIN resolved to symbol via universe name match');
  assert.equal(y.qty, 10);
  const m = db.holdings.find((h) => h.type === 'mf');
  assert.equal(m.reportedXirr, 12.31);
  assert.equal(m.avgPrice, 80);
});

test('Screener export parsing', async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Data Sheet');
  const dates = ['2022-03-31', '2023-03-31', '2024-03-31', '2025-03-31'].map((d) => new Date(d));
  ws.addRows([
    ['COMPANY NAME', 'Yatharth Hospital'], [], ['PROFIT & LOSS'], ['Report Date', ...dates], ['Sales', 400, 520, 670, 880], ['Other Income', 5, 6, 8, 10], ['Depreciation', 20, 25, 30, 35], ['Interest', 10, 8, 6, 5], ['Profit before tax', 80, 100, 140, 180], ['Net profit', 60, 75, 105, 135],
    [], ['BALANCE SHEET'], ['Report Date', ...dates], ['Equity Share Capital', 80, 80, 86, 86], ['Reserves', 300, 380, 700, 840], ['Borrowings', 100, 80, 50, 40], ['Other Liabilities', 60, 70, 80, 90], ['Total', 540, 610, 916, 1056], ['Net Block', 300, 340, 450, 520], ['Receivables', 60, 70, 90, 110], ['Inventory', 10, 12, 14, 15], ['Cash & Bank', 20, 25, 150, 120], ['No. of Equity Shares', 80000000, 80000000, 86000000, 86000000],
    [], ['CASH FLOW:'], ['Report Date', ...dates], ['Cash from Operating Activity', 70, 85, 100, 130],
  ]);
  const r = await importFiles([{ buffer: Buffer.from(await wb.xlsx.writeBuffer()), filename: 'Yatharth.xlsx' }], { symbol: 'YATHARTH' });
  assert.ok(r[0].ok, JSON.stringify(r));
  const up = store.get().fundamentalUploads.YATHARTH;
  assert.equal(up.years.length, 4);
  const last = up.years.at(-1);
  assert.equal(last.revenue, 880e7); assert.equal(last.ebit, 185e7); assert.equal(last.equity, 926e7); assert.equal(last.cfo, 130e7);
});

test('unknown file is reported, not crashed', async () => {
  const r = await importFiles([{ buffer: Buffer.from('foo,bar\n1,2\n'), filename: 'random.csv' }]);
  assert.equal(r[0].ok, false);
});

test('alerts: target, stop-loss, move, entry-zone and once-per-day de-dupe', () => {
  const db = store.get();
  db.alerts = []; db.fired = {}; db.entryZoneState = { AAA: 'wait' };
  AL.checkPrices([{ symbol: 'AAA', name: 'Aaa', price: 110, changePct: 6, target: 105, stopLoss: 90, entry: { status: 'in', zoneLow: 100, zoneHigh: 112, stopLoss: 95 }, source: 'watch' }]);
  const kinds = db.alerts.map((a) => a.kind).sort();
  assert.deepEqual(kinds, ['entry', 'move', 'price']);
  AL.checkPrices([{ symbol: 'AAA', name: 'Aaa', price: 111, changePct: 6.5, target: 105, entry: { status: 'in' }, source: 'watch' }]);
  assert.equal(db.alerts.length, 3, 'no duplicate alerts on the same day');
  AL.checkPrices([{ symbol: 'BBB', price: 80, changePct: -1, stopLoss: 85, source: 'watch' }]);
  assert.match(db.alerts[0].title, /stop-loss/);
});

test('alerts: custom rules, shariah change, score change, news', () => {
  const db = store.get();
  db.alerts = []; db.fired = {};
  db.alertRules = [{ id: 'r1', symbol: 'CCC', kind: 'below', value: 50, active: true }];
  AL.checkPrices([{ symbol: 'CCC', price: 49, changePct: -2 }]);
  assert.equal(db.alerts[0].kind, 'rule');
  db.shariahHistory = { DDD: { status: 'Compliant', date: '2026-10-01' } };
  AL.checkShariah([{ symbol: 'DDD', shariah: { status: 'Non-compliant' }, profile: { name: 'Ddd' } }]);
  assert.equal(db.alerts[0].kind, 'shariah');
  assert.match(db.alerts[0].body, /Compliant → Non-compliant/);
  db.scoreHistory = { EEE: [{ month: '2000-01', score: 50 }] };
  AL.checkScores([{ symbol: 'EEE', scores: { multibagger: { score: 65 } }, profile: { name: 'Eee' } }]);
  assert.equal(db.alerts[0].kind, 'score');
  AL.checkNews([{ symbol: 'FFF', url: 'u1', ts: Date.now(), sentiment: 'Negative', title: 'FFF falls' }, { symbol: 'FFF', url: 'u2', ts: Date.now(), sentiment: 'Neutral', title: 'meh' }], ['FFF']);
  assert.equal(db.alerts[0].kind, 'news');
  assert.equal(db.alerts.filter((a) => a.kind === 'news').length, 1);
});
