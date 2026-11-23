// End-to-end API test against the real server in demo mode.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mhp-api-'));
process.env.DATA_MODE = 'demo'; process.env.DISABLE_JOBS = '1'; process.env.PORT = '0';
process.env.APP_PIN = '';
const express = (await import('express')).default;
const routes = (await import('../server/routes.js')).default;
let server, base;
before(async () => {
  const app = express(); app.use(express.json()); app.use('/api', routes);
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => server.close());
const j = async (p, opts) => { const r = await fetch(base + p, opts); return { status: r.status, body: await r.json() }; };
const post = (p, b) => j(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });

test('status reports read-only demo', async () => {
  const { body } = await j('/status');
  assert.equal(body.readOnly, true); assert.equal(body.demo, true);
  assert.ok(['open', 'closed', 'preopen'].includes(body.market.state));
});

test('add holdings (stock, ETF, MF) and build portfolio', async () => {
  assert.equal((await post('/holdings', { symbol: 'YATHARTH', qty: 10, avgPrice: 800, buyDate: '2025-06-01' })).status, 200);
  assert.equal((await post('/holdings', { symbol: 'GOLDCASE', qty: 100, avgPrice: 20 })).body.type, 'etf');
  assert.equal((await post('/holdings', { type: 'mf', symbol: 'Parag Parikh Flexi Cap Fund Direct Growth', qty: 10, avgPrice: 80 })).body.type, 'mf');
  assert.equal((await post('/holdings', { symbol: 'X' })).status, 400);
  const { body: p } = await j('/portfolio');
  assert.equal(p.rows.length, 3);
  assert.ok(p.total.value > 0);
  assert.ok(Math.abs(p.total.invested - (10 * 800 + 2000 + 800)) < 1e-6);
  assert.match(p.summary.text, /^Your portfolio is (up|down) ₹/);
  assert.ok(p.sectorSplit.length && p.capSplit.length);
  const y = p.rows.find((r) => r.symbol === 'YATHARTH');
  assert.ok(y.xirr != null, 'xirr from buy date');
});

test('stock detail has entry zone, scores, shariah, news', async () => {
  const { body } = await j('/stock/YATHARTH');
  assert.ok(body.entry.available);
  for (const k of ['multibagger', 'piotroski', 'altman', 'magic', 'canslim', 'coffeecan']) assert.ok(body.scores[k], k);
  assert.ok(['Compliant', 'Non-compliant', 'Doubtful'].includes(body.shariah.status));
  assert.ok(Array.isArray(body.news));
  const h = await j('/stock/YATHARTH/history?range=1y');
  assert.equal(h.body.bars.length, h.body.sma200.length);
  assert.ok((await j('/stock/YATHARTH/history?range=1d')).body.intraday);
  const g = await j('/stock/GOLDCASE');
  assert.equal(g.body.shariah.status, 'Doubtful');
  assert.equal(g.body.scores, null);
});

test('watchlist, alert rules, overrides, dividends, settings', async () => {
  const w = await post('/watchlist', { symbol: 'KPITTECH', target: 2000, stopLoss: 1200 });
  assert.equal(w.status, 200);
  assert.equal((await post('/watchlist', { symbol: 'KPITTECH' })).status, 409);
  const wl = await j('/watchlist');
  assert.deepEqual(wl.body.map((x) => x.symbol), ['GOLDCASE', 'NIFTYBEES', 'KPITTECH'], 'default watchlist has the two ETFs');
  assert.equal(wl.body.find((x) => x.symbol === 'NIFTYBEES').analysis.shariah, 'Non-compliant');
  assert.equal(wl.body.find((x) => x.symbol === 'KPITTECH').target, 2000);
  assert.equal((await post('/alert-rules', { symbol: 'YATHARTH', kind: 'above', value: 1200 })).status, 200);
  assert.equal((await post('/alert-rules', { symbol: 'YATHARTH', kind: 'bogus', value: 1 })).status, 400);
  assert.equal((await post('/shariah-override', { symbol: 'GOLDCASE', status: 'Compliant', note: 'my scholar' })).status, 200);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal((await j('/stock/GOLDCASE')).body.shariah.status, 'Compliant');
  await post('/dividends', { symbol: 'YATHARTH', amount: 100 });
  const pur = await j('/purification');
  const y = pur.body.items.find((i) => i.symbol === 'YATHARTH');
  assert.equal(y.received, 100);
  const s = await j('/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ moveAlertPct: 4, shariah: { debtLimit: 30 } }) });
  assert.equal(s.body.moveAlertPct, 4); assert.equal(s.body.shariah.debtLimit, 30);
});

test('mood index, indices, discover, news, alerts', async () => {
  const m = await j('/mood');
  assert.ok(m.body.value >= 0 && m.body.value <= 100);
  assert.equal(m.body.label, 'Mood Index (calculated)');
  assert.ok(m.body.history.length >= 20, 'history back-filled');
  assert.equal((await j('/indices')).body.length, 4);
  assert.ok(Array.isArray((await j('/discover')).body.items));
  assert.ok((await j('/news?scope=market')).body.length > 0);
  await post('/push/test');
  assert.ok((await j('/alerts')).body.unseen >= 1);
});

test('no trading endpoints exist', async () => {
  for (const p of ['/order', '/orders', '/trade', '/place-order']) assert.equal((await fetch(base + p, { method: 'POST' })).status, 404);
});
