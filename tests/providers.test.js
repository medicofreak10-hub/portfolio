// Live-provider parsers tested against canned responses (no network needed).
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { matchScheme } from '../server/providers/amfi.js';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });
function stub(map) {
  globalThis.fetch = async (url) => {
    const hit = Object.entries(map).find(([k]) => String(url).includes(k));
    if (!hit) return new Response('nope', { status: 404 });
    const body = typeof hit[1] === 'string' ? hit[1] : JSON.stringify(hit[1]);
    return new Response(body, { status: 200, headers: { 'set-cookie': 'nsit=abc; Path=/' } });
  };
}

test('AMFI NAV file parse + scheme matching', async () => {
  stub({ 'NAVAll.txt': `Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Net Asset Value;Date\n\nOpen Ended Schemes(Equity Scheme - Flexi Cap Fund)\nPPFAS Mutual Fund\n122639;INF879O01027;-;Parag Parikh Flexi Cap Fund - Direct Plan - Growth;95.1234;21-Nov-2026\n122640;INF879O01019;-;Parag Parikh Flexi Cap Fund - Regular Plan - Growth;88.0000;21-Nov-2026\n119212;INF740K01QD1;-;DSP Small Cap Fund - Direct Plan - IDCW;80.1;21-Nov-2026\n119213;INF740K01QE1;-;DSP Small Cap Fund - Direct Plan - Growth;246.5;21-Nov-2026\n` });
  const { navAll } = await import('../server/providers/amfi.js');
  const list = await navAll();
  assert.equal(list.length, 4);
  assert.equal(matchScheme(list, 'Parag Parikh Flexi Cap Fund Direct Growth').code, '122639');
  assert.equal(matchScheme(list, 'DSP Small Cap Direct Plan Growth').code, '119213');
});

test('Google News RSS parse with sentiment', async () => {
  stub({ 'news.google.com': `<?xml version="1.0"?><rss><channel><item><title>Yatharth Hospital shares surge 8% on strong results - Moneycontrol</title><link>https://x/1</link><pubDate>Fri, 21 Nov 2026 06:00:00 GMT</pubDate><source url="https://moneycontrol.com">Moneycontrol</source></item><item><title>Yatharth board meeting to consider Q3 results - ET</title><link>https://x/2</link><pubDate>Fri, 21 Nov 2026 05:00:00 GMT</pubDate><source url="https://et.com">ET</source></item></channel></rss>` });
  const { stockNews } = await import('../server/providers/news.js');
  const n = await stockNews('Yatharth Hospital & Trauma Care Limited', 'YATHARTH');
  assert.equal(n.length, 2);
  assert.equal(n[0].title, 'Yatharth Hospital shares surge 8% on strong results');
  assert.equal(n[0].source, 'Moneycontrol');
  assert.equal(n[0].sentiment, 'Positive');
  assert.equal(n[1].tag, 'Results');
});

test('NSE breadth, FII/DII and corporate actions', async () => {
  stub({
    'nseindia.com/api/allIndices': { data: [{ index: 'NIFTY 50', advances: '30', declines: '20' }, { index: 'NIFTY 500', advances: '300', declines: '190', unchanged: '10' }] },
    'fiidiiTradeReact': [{ category: 'DII **', date: '21-Nov-2026', netValue: '1500.5' }, { category: 'FII/FPI **', date: '21-Nov-2026', netValue: '-2300.25' }],
    'corporates-corporateActions': [{ subject: 'Interim Dividend - Rs 2 Per Share', exDate: '01-Dec-2026' }],
    'corporate-board-meetings': [{ bm_purpose: 'Financial Results', bm_date: '05-Dec-2026', bm_desc: 'To consider Q3 results' }],
    'www.nseindia.com/': '<html></html>',
  });
  const NSE = await import('../server/providers/nse.js');
  const b = await NSE.breadth();
  assert.equal(b.advances, 300); assert.ok(Math.abs(b.ratio - 300 / 190) < 1e-9);
  const f = await NSE.fiiDii();
  assert.equal(f.fiiNet, -2300.25); assert.equal(f.diiNet, 1500.5);
  const ca = await NSE.corporateActions('YATHARTH');
  assert.deepEqual(ca.map((c) => c.kind), ['Dividend', 'Results']);
});

test('Tickertape MMI parse', async () => {
  stub({ 'api.tickertape.in/mmi/now': { success: true, data: { currentValue: 38.4, date: '2026-11-21T10:00:00Z', daily: [{ date: '2026-11-20T00:00:00Z', value: 41.2 }] } } });
  const { mmi } = await import('../server/providers/tickertape.js');
  const r = await mmi();
  assert.equal(r.value, 38.4);
  assert.deepEqual(r.history, [{ date: '2026-11-20', value: 41.2 }]);
});
