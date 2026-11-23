// AMFI official daily NAVs (free) + mfapi.in for NAV history.
import { fetchText, fetchJson } from './http.js';

export async function navAll() {
  const { text } = await fetchText('https://www.amfiindia.com/spages/NAVAll.txt', { timeout: 30000 });
  const list = [];
  for (const line of text.split(/\r?\n/)) {
    const c = line.split(';');
    if (c.length < 6 || !/^\d+$/.test(c[0])) continue;
    const nav = Number(c[4]);
    if (!isFinite(nav)) continue;
    list.push({ code: c[0], isin: c[1], isin2: c[2], name: c[3].trim(), nav, date: c[5] });
  }
  return list;
}

const norm = (s) => s.toLowerCase().replace(/[-–()]/g, ' ').replace(/\b(fund|plan|option|the)\b/g, ' ').replace(/\s+/g, ' ').trim();

export function matchScheme(list, name) {
  const target = norm(name);
  const words = target.split(' ').filter((w) => w.length > 1);
  let best = null, bestScore = 0;
  for (const s of list) {
    const n = norm(s.name);
    if (!/direct/.test(n) !== !/direct/.test(target)) continue;
    if (/growth/.test(target) && !/growth/.test(n)) continue;
    if (/idcw|dividend/.test(n) && !/idcw|dividend/.test(target)) continue;
    let score = 0;
    for (const w of words) if (n.includes(w)) score++;
    score = score / Math.max(words.length, n.split(' ').length * 0.8);
    if (score > bestScore) { bestScore = score; best = s; }
  }
  return bestScore >= 0.6 ? best : null;
}

export async function navHistory(code) {
  const j = await fetchJson(`https://api.mfapi.in/mf/${code}`);
  return (j.data || []).map((d) => {
    const [dd, mm, yy] = d.date.split('-');
    return { t: Date.UTC(+yy, +mm - 1, +dd), c: Number(d.nav) };
  }).reverse();
}
