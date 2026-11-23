// NSE India website JSON (unofficial, free). NSE needs a session cookie and
// sometimes blocks automated clients; every call here is optional and cached.
import { fetchText, UA } from './http.js';

let cookie = '';
let cookieAt = 0;

async function session() {
  if (cookie && Date.now() - cookieAt < 10 * 60000) return cookie;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 12000);
  try {
    const res = await fetch('https://www.nseindia.com/', { headers: { 'User-Agent': UA, Accept: 'text/html' }, signal: ctl.signal });
    const set = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [res.headers.get('set-cookie') || ''];
    cookie = set.map((c) => c.split(';')[0]).filter(Boolean).join('; ');
    cookieAt = Date.now();
  } finally { clearTimeout(t); }
  return cookie;
}

async function api(path) {
  const c = await session();
  const { text } = await fetchText('https://www.nseindia.com' + path, {
    headers: { Cookie: c, Referer: 'https://www.nseindia.com/', Accept: 'application/json' },
  });
  return JSON.parse(text);
}

export async function breadth() {
  const j = await api('/api/allIndices');
  const rows = j?.data || [];
  const n500 = rows.find((r) => r.index === 'NIFTY 500') || rows.find((r) => r.index === 'NIFTY 50');
  const adv = Number(n500?.advances || 0), dec = Number(n500?.declines || 0);
  return { advances: adv, declines: dec, unchanged: Number(n500?.unchanged || 0), ratio: dec ? adv / dec : null, index: n500?.index };
}

export async function fiiDii() {
  const j = await api('/api/fiidiiTradeReact');
  const fii = j.find((r) => /FII|FPI/i.test(r.category));
  const dii = j.find((r) => /DII/i.test(r.category));
  return { date: fii?.date || dii?.date, fiiNet: Number(fii?.netValue || 0), diiNet: Number(dii?.netValue || 0) };
}

export async function corporateActions(symbol) {
  const [ca, bm] = await Promise.all([
    api(`/api/corporates-corporateActions?index=equities&symbol=${encodeURIComponent(symbol)}`).catch(() => []),
    api(`/api/corporate-board-meetings?index=equities&symbol=${encodeURIComponent(symbol)}`).catch(() => []),
  ]);
  const out = [];
  for (const a of [].concat(ca || []).slice(0, 15)) {
    const s = a.subject || '';
    const kind = /dividend/i.test(s) ? 'Dividend' : /split|sub-division/i.test(s) ? 'Split' : /bonus/i.test(s) ? 'Bonus' : /rights/i.test(s) ? 'Rights' : /buy ?back/i.test(s) ? 'Buyback' : 'Action';
    out.push({ symbol, kind, title: s, date: a.exDate || a.recDate, source: 'NSE' });
  }
  for (const b of [].concat(bm || []).slice(0, 10)) {
    const purpose = b.bm_purpose || '';
    out.push({ symbol, kind: /result/i.test(purpose + b.bm_desc) ? 'Results' : 'Board meeting', title: `${purpose}${b.bm_desc ? ' — ' + b.bm_desc.slice(0, 140) : ''}`, date: b.bm_date, source: 'NSE' });
  }
  return out;
}

export async function holidays() {
  const j = await api('/api/holiday-master?type=trading');
  const list = (j?.CM || []).map((h) => {
    const d = new Date(h.tradingDate + ' UTC');
    return isNaN(d) ? null : d.toISOString().slice(0, 10);
  }).filter(Boolean);
  return list;
}

export async function equityList() {
  const { text } = await fetchText('https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv', { timeout: 30000 });
  const map = {};
  for (const line of text.split(/\r?\n/).slice(1)) {
    const cols = line.split(',');
    if (cols.length < 7) continue;
    map[cols[6].trim()] = { symbol: cols[0].trim(), name: cols[1].trim() };
  }
  return map;
}

// NIFTY 500 Shariah index constituents, used as a cross-check for our own screen.
export async function shariahIndexList() {
  const urls = [
    'https://nsearchives.nseindia.com/content/indices/ind_nifty500shariah_list.csv',
    'https://nsearchives.nseindia.com/content/indices/ind_nifty500Shariah_list.csv',
    'https://nsearchives.nseindia.com/content/indices/ind_nifty50shariah_list.csv',
  ];
  for (const u of urls) {
    try {
      const { text } = await fetchText(u, { timeout: 20000 });
      const syms = text.split(/\r?\n/).slice(1).map((l) => l.split(',')[2]?.trim()).filter(Boolean);
      if (syms.length) return syms;
    } catch {}
  }
  return [];
}
