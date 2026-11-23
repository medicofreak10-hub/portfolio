// Background jobs: live refresh + alerts during market hours, analysis refresh,
// news alerts, universe crawl and the evening email.
import * as store from './lib/store.js';
import * as data from './data.js';
import * as A from './analysis.js';
import * as P from './portfolio.js';
import * as AL from './alerts.js';
import { getMood } from './mood.js';
import { marketStatus, istMinutes, isTradingDay, istDateStr, setHolidays } from './lib/time.js';
import { emailConfigured, sendSummary } from './email.js';

export async function gatherSummary() {
  const db = store.get();
  const portfolio = await P.build();
  const mood = await getMood().catch(() => null);
  const syms = db.holdings.filter((h) => h.type !== 'mf');
  const news = (await Promise.all(syms.map((h) => data.stockNews(h.name, h.symbol).catch(() => [])))).flat().sort((a, b) => b.ts - a.ts);
  const top = news.find((n) => n.sentiment !== 'Neutral' || n.tag) || news[0];
  const today = istDateStr();
  const alerts = db.alerts.filter((a) => istDateStr(new Date(a.ts)) === today);
  return { portfolio, summary: P.dailySummary(portfolio, top), mood, news, alerts };
}

async function priceTick() {
  const db = store.get();
  const p = await P.build();
  const items = p.rows.filter((r) => r.type !== 'mf').map((r) => {
    const w = db.watchlist.find((x) => x.symbol === r.symbol);
    return { symbol: r.symbol, name: r.name, price: r.price, changePct: r.changePct, entry: r.analysis?.entry, target: w?.target, stopLoss: w?.stopLoss, source: 'holding' };
  });
  const wl = db.watchlist.filter((w) => !items.some((i) => i.symbol === w.symbol));
  const q = await data.quotes(wl.map((w) => ({ symbol: w.symbol, exchange: w.exchange || 'NSE' }))).catch(() => ({}));
  for (const w of wl) items.push({ symbol: w.symbol, name: w.name, price: q[w.symbol]?.price, changePct: q[w.symbol]?.changePct, target: w.target, stopLoss: w.stopLoss, entry: A.summaryOf(A.getCached(w.symbol))?.entry, source: 'watch' });
  AL.checkPrices(items);
}

async function analysisTick() {
  const db = store.get();
  const mine = [...db.holdings.filter((h) => h.type !== 'mf'), ...db.watchlist];
  const res = [];
  for (const h of mine) { try { res.push(await A.analyze(h.symbol, h.exchange || 'NSE', { type: h.type, name: h.name, force: true })); } catch {} }
  A.recomputeMagic();
  AL.checkShariah(res);
  AL.checkScores(res);
}

async function newsTick() {
  const db = store.get();
  const hs = db.holdings.filter((h) => h.type !== 'mf');
  const news = (await Promise.all(hs.map((h) => data.stockNews(h.name, h.symbol).catch(() => [])))).flat();
  AL.checkNews(news, hs.map((h) => h.symbol));
}

async function emailTick() {
  const db = store.get();
  if (!db.settings.emailEnabled || !emailConfigured() || !isTradingDay()) return;
  const [hh, mm] = db.settings.summaryTime.split(':').map(Number);
  if (istMinutes() < hh * 60 + mm || db.lastEmailDate === istDateStr()) return;
  db.lastEmailDate = istDateStr(); store.save();
  await sendSummary(await gatherSummary()).catch((e) => { console.error('email failed:', e.message); db.lastEmailDate = null; store.save(); });
}

const safe = (name, fn) => async () => { try { await fn(); } catch (e) { console.error(`[job ${name}]`, e.message); } };

export function start() {
  let minute = 0;
  const tickPrice = safe('price', priceTick), tickAn = safe('analysis', analysisTick), tickNews = safe('news', newsTick), tickEmail = safe('email', emailTick), tickMood = safe('mood', getMood);
  // startup
  setTimeout(async () => {
    await safe('holidays', async () => { const h = await data.holidays(); if (h?.length) setHolidays(h); })();
    await safe('shariah-index', A.loadShariahIndex)();
    await tickAn();
    await tickPrice();
    tickMood();
    safe('universe', () => A.refreshUniverse())();
  }, 500);
  setInterval(async () => {
    minute++;
    const open = marketStatus().open;
    if (open || minute % 10 === 0) await tickPrice();
    if (open && minute % 5 === 0) tickMood();
    if (minute % 15 === 0) tickNews();
    if (minute % (open ? 30 : 120) === 0) tickAn();
    if (minute % 720 === 0) safe('universe', () => A.refreshUniverse())();
    tickEmail();
  }, 60000);
}
