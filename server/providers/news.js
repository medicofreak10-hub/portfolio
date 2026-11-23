// Free news via RSS: Google News (per stock) + Economic Times / Moneycontrol (market).
import { XMLParser } from 'fast-xml-parser';
import { fetchText } from './http.js';
import { sentiment, corporateTag } from '../analytics/sentiment.js';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });

function parseRss(xml, fallbackSource) {
  const j = parser.parse(xml);
  const items = [].concat(j?.rss?.channel?.item || []);
  return items.map((it) => {
    let title = String(it.title?.['#text'] ?? it.title ?? '').trim();
    let source = it.source?.['#text'] || it.source || fallbackSource;
    if (typeof source !== 'string') source = fallbackSource;
    if (source && title.endsWith(' - ' + source)) title = title.slice(0, -(source.length + 3));
    const ts = it.pubDate ? new Date(it.pubDate).getTime() : Date.now();
    const s = sentiment(title);
    return { title, url: it.link, source, ts, sentiment: s.label, tag: corporateTag(title) };
  }).filter((x) => x.title && x.url);
}

export async function stockNews(name, symbol) {
  const clean = name.replace(/\b(limited|ltd\.?|india|l)\b\.?/gi, '').replace(/\s+/g, ' ').trim();
  const q = encodeURIComponent(`"${clean}" OR "${symbol}" share when:14d`);
  const { text } = await fetchText(`https://news.google.com/rss/search?q=${q}&hl=en-IN&gl=IN&ceid=IN:en`);
  return parseRss(text, 'Google News').slice(0, 15).map((n) => ({ ...n, symbol }));
}

const MARKET_FEEDS = [
  ['https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms', 'Economic Times'],
  ['https://www.moneycontrol.com/rss/marketreports.xml', 'Moneycontrol'],
  ['https://news.google.com/rss/search?q=Sensex+Nifty+stock+market+when:2d&hl=en-IN&gl=IN&ceid=IN:en', 'Google News'],
];

export async function marketNews() {
  const results = await Promise.allSettled(MARKET_FEEDS.map(async ([u, s]) => parseRss((await fetchText(u)).text, s)));
  const all = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  if (!all.length) throw new Error('All market news feeds failed');
  const seen = new Set();
  return all.filter((n) => { const k = n.title.toLowerCase().slice(0, 60); if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => b.ts - a.ts).slice(0, 40);
}
