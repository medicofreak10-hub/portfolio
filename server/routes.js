import express from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import { config } from './config.js';
import * as store from './lib/store.js';
import * as data from './data.js';
import * as A from './analysis.js';
import * as P from './portfolio.js';
import { getMood } from './mood.js';
import { importFiles } from './importer.js';
import { marketStatus } from './lib/time.js';
import { sma } from './analytics/indicators.js';
import { purification } from './analytics/shariah.js';
import { vapidKeys } from './push.js';
import { emailConfigured, sendSummary } from './email.js';
import { notify } from './alerts.js';
import { gatherSummary } from './jobs.js';
import { isEtf, ETF_META, UNIVERSE } from './lib/universe.js';

const r = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 10 } });
const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => { console.error(req.path, e.message); res.status(500).json({ error: e.message }); });

// ---- optional PIN ----
const token = () => crypto.createHash('sha256').update('hp:' + config.appPin).digest('hex');
r.post('/login', (req, res) => {
  if (!config.appPin) return res.json({ ok: true });
  if (String(req.body?.pin || '') !== config.appPin) return res.status(401).json({ error: 'Wrong PIN' });
  res.cookie('hp_auth', token(), { httpOnly: true, sameSite: 'strict', maxAge: 180 * 86400000 });
  res.json({ ok: true });
});
r.use((req, res, next) => {
  if (!config.appPin) return next();
  const c = (req.headers.cookie || '').split(';').map((x) => x.trim()).find((x) => x.startsWith('hp_auth='));
  if (c && c.slice(8) === token()) return next();
  res.status(401).json({ error: 'PIN required', pin: true });
});

r.get('/status', (req, res) => {
  res.json({ market: marketStatus(), demo: data.demo, health: data.health, crawl: A.crawlState(), email: emailConfigured(), pushKey: vapidKeys().publicKey, readOnly: true, serverTime: Date.now() });
});

r.get('/indices', wrap(async (req, res) => res.json(await data.indices())));
r.get('/mood', wrap(async (req, res) => res.json(await getMood())));

r.get('/portfolio', wrap(async (req, res) => {
  const p = await P.build();
  const news = await holdingsNews(6).catch(() => []);
  const top = news.find((n) => n.sentiment !== 'Neutral' || n.tag) || news[0];
  res.json({ ...p, summary: P.dailySummary(p, top) });
}));

r.get('/sparklines', wrap(async (req, res) => {
  const syms = String(req.query.symbols || '').split(',').filter(Boolean).slice(0, 60);
  const out = {};
  await Promise.all(syms.map(async (s) => {
    const [sym, ex] = s.split(':');
    try {
      const bars = await data.history(sym, ex || 'NSE', '1d');
      const step = Math.max(1, Math.floor(bars.length / 80));
      out[sym] = bars.filter((_, i) => i % step === 0 || i === bars.length - 1).map((b) => b.c);
    } catch { out[sym] = []; }
  }));
  res.json(out);
}));

// ---- stock detail ----
function findItem(symbol) {
  const db = store.get();
  return db.holdings.find((h) => h.symbol === symbol) || db.watchlist.find((w) => w.symbol === symbol) || null;
}

r.get('/stock/:symbol', wrap(async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const item = findItem(symbol);
  if (item?.type === 'mf') return res.json(await mfDetail(item));
  const exchange = req.query.exchange || item?.exchange || 'NSE';
  const a = await A.analyze(symbol, exchange, { type: item?.type, name: item?.name, force: req.query.refresh === '1' });
  const [q, news, ca] = await Promise.all([
    data.quotes([{ symbol, exchange }]).catch(() => ({})),
    data.stockNews(a.profile.name || symbol, symbol).catch(() => []),
    isEtf(symbol) ? [] : data.corporateActions(symbol).catch(() => []),
  ]);
  const db = store.get();
  res.json({ ...a, quote: q[symbol] || null, news, corporateActions: ca, alternatives: A.alternatives(symbol), holding: db.holdings.find((h) => h.symbol === symbol) || null, watch: db.watchlist.find((w) => w.symbol === symbol) || null, scoreHistory: db.scoreHistory[symbol] || [], override: db.shariahOverrides[symbol] || null });
}));

async function mfDetail(h) {
  const nav = await data.mfNav(h).catch(() => null);
  const { mfScreen } = await import('./analytics/shariah.js');
  return { symbol: h.symbol, type: 'mf', profile: { name: h.name, sector: h.category, symbol: h.symbol }, holding: h, nav, shariah: store.get().shariahOverrides[h.symbol] ? { status: store.get().shariahOverrides[h.symbol].status, checks: [{ name: 'Manual override', result: 'info', detail: store.get().shariahOverrides[h.symbol].note || '' }] } : mfScreen({ name: h.name }), news: [], corporateActions: [], alternatives: [] };
}

r.get('/stock/:symbol/history', wrap(async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const range = String(req.query.range || '1y');
  const item = findItem(symbol);
  const exchange = req.query.exchange || item?.exchange || 'NSE';
  if (item?.type === 'mf') {
    const nav = await data.mfNav(item);
    const hist = nav ? await data.mfHistory(nav.code, item) : [];
    const days = { '1d': 5, '5d': 7, '1mo': 31, '1y': 366, '5y': 1830 }[range] || 366;
    const bars = hist.filter((b) => b.t >= Date.now() - days * 86400000).map((b) => ({ t: b.t, o: b.c, h: b.c, l: b.c, c: b.c, v: 0 }));
    return res.json({ bars, line: true });
  }
  if (range === '1d' || range === '5d') return res.json({ bars: await data.history(symbol, exchange, range), intraday: true });
  const full = await data.history(symbol, exchange, '5y');
  const closes = full.map((b) => b.c);
  const s20 = sma(closes, 20), s50 = sma(closes, 50), s200 = sma(closes, 200);
  const days = { '1mo': 31, '1y': 366, '5y': 1830 }[range] || 366;
  const from = Date.now() - days * 86400000;
  const idx = full.map((b, i) => i).filter((i) => full[i].t >= from);
  res.json({ bars: idx.map((i) => full[i]), sma20: idx.map((i) => s20[i]), sma50: idx.map((i) => s50[i]), sma200: idx.map((i) => s200[i]) });
}));

// ---- holdings CRUD ----
r.get('/holdings', (req, res) => res.json(store.get().holdings));
r.post('/holdings', wrap(async (req, res) => {
  const b = req.body || {};
  const symbol = String(b.symbol || '').trim().toUpperCase();
  if (!symbol || !(b.qty > 0) || !(b.avgPrice > 0)) return res.status(400).json({ error: 'symbol, qty and avgPrice are required' });
  const type = b.type || (isEtf(symbol, b.name) ? 'etf' : 'stock');
  const h = { id: store.uid(), type, symbol: type === 'mf' ? 'MF-' + symbol.replace(/\W/g, '').slice(0, 12) : symbol, exchange: type === 'mf' ? 'AMFI' : b.exchange || 'NSE', name: b.name || ETF_META[symbol]?.name || UNIVERSE.find((u) => u.symbol === symbol)?.name || symbol, qty: Number(b.qty), avgPrice: Number(b.avgPrice), buyDate: b.buyDate || null, broker: b.broker || 'Manual', schemeCode: b.schemeCode || null };
  store.get().holdings.push(h); store.save();
  A.analyze(h.symbol, h.exchange, { type: h.type, name: h.name }).catch(() => {});
  res.json(h);
}));
r.put('/holdings/:id', (req, res) => {
  const h = store.get().holdings.find((x) => x.id === req.params.id);
  if (!h) return res.status(404).json({ error: 'not found' });
  for (const k of ['qty', 'avgPrice', 'buyDate', 'name', 'exchange', 'broker', 'schemeCode']) if (k in req.body) h[k] = ['qty', 'avgPrice'].includes(k) ? Number(req.body[k]) : req.body[k];
  store.save(); res.json(h);
});
r.delete('/holdings/:id', (req, res) => { const db = store.get(); db.holdings = db.holdings.filter((x) => x.id !== req.params.id); store.save(); res.json({ ok: true }); });

r.post('/import', upload.array('files', 10), wrap(async (req, res) => {
  const files = (req.files || []).map((f) => ({ buffer: f.buffer, filename: f.originalname }));
  if (!files.length) return res.status(400).json({ error: 'No files uploaded' });
  const report = await importFiles(files, { symbol: req.body?.symbol?.toUpperCase() });
  A.refreshUniverse().catch(() => {});
  for (const x of report) if (x.symbol) A.analyze(x.symbol, 'NSE', { force: true }).catch(() => {});
  res.json({ report });
}));

// ---- watchlist ----
r.get('/watchlist', wrap(async (req, res) => {
  const wl = store.get().watchlist;
  const q = await data.quotes(wl.map((w) => ({ symbol: w.symbol, exchange: w.exchange || 'NSE' }))).catch(() => ({}));
  await Promise.all(wl.map((w) => A.analyze(w.symbol, w.exchange || 'NSE', { type: w.type, name: w.name }).catch(() => null)));
  res.json(wl.map((w) => ({ ...w, quote: q[w.symbol] || null, analysis: A.summaryOf(A.getCached(w.symbol)) })));
}));
r.post('/watchlist', (req, res) => {
  const b = req.body || {}; const symbol = String(b.symbol || '').trim().toUpperCase();
  if (!symbol) return res.status(400).json({ error: 'symbol required' });
  const db = store.get();
  if (db.watchlist.some((w) => w.symbol === symbol)) return res.status(409).json({ error: 'Already in watchlist' });
  const w = { id: store.uid(), symbol, exchange: b.exchange || 'NSE', name: b.name || ETF_META[symbol]?.name || UNIVERSE.find((u) => u.symbol === symbol)?.name || symbol, type: isEtf(symbol, b.name) ? 'etf' : 'stock', target: b.target ? Number(b.target) : null, stopLoss: b.stopLoss ? Number(b.stopLoss) : null, note: b.note || '', addedAt: Date.now() };
  db.watchlist.push(w); store.save();
  A.analyze(symbol, w.exchange, { type: w.type, name: w.name }).catch(() => {});
  res.json(w);
});
r.put('/watchlist/:id', (req, res) => {
  const w = store.get().watchlist.find((x) => x.id === req.params.id);
  if (!w) return res.status(404).json({ error: 'not found' });
  for (const k of ['target', 'stopLoss', 'note']) if (k in req.body) w[k] = k === 'note' ? req.body[k] : req.body[k] === '' || req.body[k] == null ? null : Number(req.body[k]);
  store.save(); res.json(w);
});
r.delete('/watchlist/:id', (req, res) => { const db = store.get(); db.watchlist = db.watchlist.filter((x) => x.id !== req.params.id); store.save(); res.json({ ok: true }); });

// ---- news ----
async function holdingsNews(limit = 60) {
  const db = store.get();
  const syms = [...db.holdings.filter((h) => h.type !== 'mf'), ...db.watchlist.filter((w) => !db.holdings.some((h) => h.symbol === w.symbol))];
  const lists = await Promise.all(syms.map((h) => data.stockNews(h.name || h.symbol, h.symbol).then((l) => l.map((n) => ({ ...n, name: h.name, held: db.holdings.some((x) => x.symbol === h.symbol) }))).catch(() => [])));
  const seen = new Set();
  return lists.flat().filter((n) => (seen.has(n.url) ? false : seen.add(n.url))).sort((a, b) => b.ts - a.ts).slice(0, limit);
}
r.get('/news', wrap(async (req, res) => {
  if (req.query.scope === 'market') return res.json(await data.marketNews());
  res.json(await holdingsNews());
}));
r.get('/corporate-actions', wrap(async (req, res) => {
  const db = store.get();
  const syms = db.holdings.filter((h) => h.type === 'stock').map((h) => h.symbol);
  const lists = await Promise.all(syms.map((s) => data.corporateActions(s).catch(() => [])));
  res.json(lists.flat().sort((a, b) => String(b.date).localeCompare(String(a.date))));
}));

// ---- discover / alternatives ----
r.get('/discover', (req, res) => {
  const all = A.allCached().filter((x) => x.type === 'stock');
  res.json({ items: A.discover({ sector: req.query.sector || null }), sectors: [...new Set(all.map((x) => x.profile.sector).filter(Boolean))].sort(), crawl: A.crawlState() });
});

// ---- alerts ----
r.get('/alerts', (req, res) => { const db = store.get(); res.json({ alerts: db.alerts.slice(0, 100), unseen: db.alerts.filter((a) => !a.seen).length, rules: db.alertRules }); });
r.post('/alerts/seen', (req, res) => { for (const a of store.get().alerts) a.seen = true; store.save(); res.json({ ok: true }); });
r.post('/alert-rules', (req, res) => {
  const b = req.body || {};
  if (!b.symbol || !['above', 'below', 'movePct'].includes(b.kind) || !(Number(b.value) > 0)) return res.status(400).json({ error: 'symbol, kind (above|below|movePct) and value required' });
  const rule = { id: store.uid(), symbol: b.symbol.toUpperCase(), kind: b.kind, value: Number(b.value), active: true };
  store.get().alertRules.push(rule); store.save(); res.json(rule);
});
r.delete('/alert-rules/:id', (req, res) => { const db = store.get(); db.alertRules = db.alertRules.filter((x) => x.id !== req.params.id); store.save(); res.json({ ok: true }); });

// ---- shariah ----
r.post('/shariah-override', (req, res) => {
  const { symbol, status, note } = req.body || {};
  if (!symbol || !['Compliant', 'Non-compliant', 'Doubtful'].includes(status)) return res.status(400).json({ error: 'symbol and valid status required' });
  store.get().shariahOverrides[symbol] = { status, note: note || '' }; store.save();
  A.analyze(symbol, 'NSE', { force: true }).catch(() => {});
  res.json({ ok: true });
});
r.delete('/shariah-override/:symbol', (req, res) => { delete store.get().shariahOverrides[req.params.symbol]; store.save(); A.analyze(req.params.symbol, 'NSE', { force: true }).catch(() => {}); res.json({ ok: true }); });

r.get('/purification', (req, res) => {
  const db = store.get();
  const items = db.holdings.filter((h) => h.type !== 'mf').map((h) => {
    const a = A.getCached(h.symbol);
    const divs = db.dividends.filter((d) => d.symbol === h.symbol);
    const received = divs.reduce((s, d) => s + d.amount, 0);
    const p = a?.shariah?.purificationPct ?? null;
    return { symbol: h.symbol, name: h.name, status: a?.shariah?.status || null, purificationPct: p, dividends: divs, received, purify: purification(received, p) };
  });
  res.json({ items, total: items.reduce((s, i) => s + (i.purify || 0), 0) });
});
r.post('/dividends', (req, res) => {
  const { symbol, amount, date } = req.body || {};
  if (!symbol || !(Number(amount) > 0)) return res.status(400).json({ error: 'symbol and amount required' });
  const d = { id: store.uid(), symbol, amount: Number(amount), date: date || new Date().toISOString().slice(0, 10) };
  store.get().dividends.push(d); store.save(); res.json(d);
});
r.delete('/dividends/:id', (req, res) => { const db = store.get(); db.dividends = db.dividends.filter((d) => d.id !== req.params.id); store.save(); res.json({ ok: true }); });

// ---- settings / push / email ----
r.get('/settings', (req, res) => res.json(store.get().settings));
r.put('/settings', (req, res) => {
  const s = store.get().settings; const b = req.body || {};
  if (b.shariah) for (const k of ['debtLimit', 'interestIncomeLimit', 'cashLimit', 'receivablesLimit']) if (b.shariah[k] > 0) s.shariah[k] = Number(b.shariah[k]);
  if (b.moveAlertPct > 0) s.moveAlertPct = Number(b.moveAlertPct);
  if (typeof b.emailEnabled === 'boolean') s.emailEnabled = b.emailEnabled;
  if (/^\d{2}:\d{2}$/.test(b.summaryTime || '')) s.summaryTime = b.summaryTime;
  if (b.scoreModel) s.scoreModel = b.scoreModel;
  store.save();
  if (b.shariah) for (const a of A.allCached()) A.analyze(a.symbol, a.exchange, { force: true }).catch(() => {});
  res.json(s);
});
r.post('/push/subscribe', (req, res) => {
  const sub = req.body; if (!sub?.endpoint) return res.status(400).json({ error: 'bad subscription' });
  const db = store.get(); if (!db.pushSubs.some((s) => s.endpoint === sub.endpoint)) db.pushSubs.push(sub); store.save(); res.json({ ok: true });
});
r.post('/push/test', wrap(async (req, res) => { const a = notify({ kind: 'test', title: '🔔 Test alert', body: 'Notifications are working.' }); res.json({ ok: true, alert: a }); }));
r.post('/email/test', wrap(async (req, res) => { await sendSummary(await gatherSummary()); res.json({ ok: true }); }));
r.get('/email/preview', wrap(async (req, res) => { const { renderSummary } = await import('./email.js'); res.type('html').send(renderSummary(await gatherSummary())); }));

r.get('/search', wrap(async (req, res) => res.json(req.query.q ? await data.search(String(req.query.q)) : [])));
r.get('/export', (req, res) => { res.setHeader('Content-Disposition', 'attachment; filename="my-halal-portfolio-backup.json"'); res.json(store.get()); });

export default r;
