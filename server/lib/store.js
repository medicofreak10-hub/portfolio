// Tiny local JSON database. All personal data stays in ./data on this machine.
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

const FILE = path.join(config.dataDir, 'db.json');

export const DEFAULT_SETTINGS = {
  shariah: { debtLimit: 33, interestIncomeLimit: 5, cashLimit: 33, receivablesLimit: 49 },
  moveAlertPct: 5,
  emailEnabled: true,
  summaryTime: '18:00', // IST
  refreshSeconds: 60,
  scoreModel: 'multibagger',
};

function defaults() {
  return {
    version: 1,
    holdings: [],       // {id,type:'stock'|'etf'|'mf',symbol,exchange,isin,name,qty,avgPrice,buyDate,broker,schemeCode,folio,reportedXirr,lastClose}
    transactions: [],   // {id,symbol,isin,side:'BUY'|'SELL',qty,price,date,exchange,broker,orderId}
    // starts with the two ETFs from the original request; edit freely
    watchlist: [
      { id: 'w-goldcase', symbol: 'GOLDCASE', exchange: 'NSE', name: 'Zerodha Gold ETF', type: 'etf', target: null, stopLoss: null, note: '', addedAt: 0 },
      { id: 'w-niftybees', symbol: 'NIFTYBEES', exchange: 'NSE', name: 'Nippon India ETF Nifty 50 BeES', type: 'etf', target: null, stopLoss: null, note: '', addedAt: 0 },
    ],
    alertRules: [],     // {id,symbol,kind:'above'|'below'|'movePct',value,active,lastFired}
    alerts: [],         // log {id,ts,kind,symbol,title,body,seen}
    dividends: [],      // {id,symbol,amount,date}
    mmiHistory: [],     // {date,value,source,components}
    scoreHistory: {},   // symbol -> [{month,score}]
    shariahHistory: {}, // symbol -> {status,date}
    shariahOverrides: {}, // symbol -> {status,note}
    fundamentalUploads: {}, // symbol -> normalized fundamentals from Screener export
    isinMap: {},        // isin -> {symbol,name}
    pushSubs: [],
    newsSeen: {},       // url -> ts
    entryZoneState: {}, // symbol -> last status
    fired: {},          // alert de-dupe key -> date
    settings: structuredClone(DEFAULT_SETTINGS),
    lastEmailDate: null,
  };
}

let db = null;
let timer = null;

export function load() {
  if (db) return db;
  fs.mkdirSync(config.dataDir, { recursive: true });
  if (fs.existsSync(FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8'));
      const d = defaults();
      db = { ...d, ...parsed, settings: { ...d.settings, ...(parsed.settings || {}), shariah: { ...d.settings.shariah, ...(parsed.settings?.shariah || {}) } } };
    } catch (e) {
      const bak = FILE + '.corrupt-' + Date.now();
      fs.copyFileSync(FILE, bak);
      console.error('db.json was unreadable; backed up to', bak);
      db = defaults();
    }
  } else db = defaults();
  return db;
}

export function get() { return load(); }

export function save() {
  clearTimeout(timer);
  timer = setTimeout(flush, 200);
}

export function flush() {
  if (!db) return;
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
  fs.renameSync(tmp, FILE);
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function reset() { db = defaults(); flush(); }

process.on('exit', () => { try { flush(); } catch {} });
