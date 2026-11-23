// Tickertape Market Mood Index. No official public API — this uses the endpoint
// their website calls. If it fails we compute our own "Mood Index (calculated)".
import { fetchJson } from './http.js';

export async function mmi() {
  const j = await fetchJson('https://api.tickertape.in/mmi/now', { headers: { Accept: 'application/json', Origin: 'https://www.tickertape.in', Referer: 'https://www.tickertape.in/' } });
  const d = j?.data || j;
  const value = Number(d?.currentValue ?? d?.indicator ?? d?.value);
  if (!isFinite(value)) throw new Error('Unexpected Tickertape response');
  const daily = [].concat(d?.daily || []).map((x) => ({ date: String(x.date).slice(0, 10), value: Number(x.value ?? x.indicator) })).filter((x) => isFinite(x.value));
  return { value, source: 'Tickertape MMI', history: daily, updatedAt: d?.date || new Date().toISOString() };
}
