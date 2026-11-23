// Swing-trading entry zone from supports, DMAs, RSI and swing lows.
// "Technical guide only, not advice."
import { pivots, clusterLevels, technicals } from './indicators.js';

export function entryZone(bars, { livePrice } = {}) {
  const tech = technicals(bars);
  if (!tech || bars.length < 60) return { available: false, reason: 'Not enough price history (needs ~3 months).' };
  const price = livePrice ?? tech.price;
  const atr = tech.atr || price * 0.02;
  const recent = bars.slice(-250);
  const { lows, highs } = pivots(recent, 5);

  // Candidate supports: clustered swing lows + 20/50/200 DMA
  const swingLows = lows.map((l) => l.price);
  const clusters = clusterLevels(swingLows, 0.025);
  const cands = [
    ...clusters.map((c) => ({ price: c.price, kind: c.touches > 1 ? `Support (${c.touches} touches)` : 'Swing low', w: 1 + c.touches * 0.5 })),
    ...(tech.sma20 ? [{ price: tech.sma20, kind: '20 DMA', w: 1 }] : []),
    ...(tech.sma50 ? [{ price: tech.sma50, kind: '50 DMA', w: 1.5 }] : []),
    ...(tech.sma200 ? [{ price: tech.sma200, kind: '200 DMA', w: 2 }] : []),
  ].filter((c) => c.price > 0);

  // Nearest meaningful support at/below price (within 20%), preferring stronger levels
  const below = cands.filter((c) => c.price <= price * 1.005 && c.price >= price * 0.8)
    .sort((a, b) => b.price - a.price);
  let anchor = below[0];
  // if the nearest is a weak single low very close by, prefer a stronger level within 1.5 ATR below it
  if (anchor) {
    const stronger = below.find((c) => c.w > anchor.w && anchor.price - c.price < 1.5 * atr);
    if (stronger) anchor = stronger;
  }
  let note = '';
  if (!anchor) {
    // price is below all supports (breakdown) -> use lowest recent swing low
    const minLow = Math.min(...recent.slice(-60).map((b) => b.l));
    anchor = { price: minLow, kind: '60-day low', w: 1 };
    note = 'Price is below its usual supports — wait for a base to form.';
  }

  const zoneLow = anchor.price - 0.25 * atr;
  const zoneHigh = anchor.price + 0.75 * atr;
  const mid = (zoneLow + zoneHigh) / 2;

  // Stop below the next swing low under the zone, or 1 ATR under zone
  const lowerLows = swingLows.filter((p) => p < zoneLow && p > zoneLow - 2.5 * atr).sort((a, b) => b - a);
  let stopLoss = lowerLows.length ? lowerLows[0] - 0.25 * atr : zoneLow - 1.0 * atr;
  stopLoss = Math.min(stopLoss, zoneLow - 0.5 * atr);
  const risk = mid - stopLoss;

  const resist = highs.map((h) => h.price).filter((p) => p > mid + 1.5 * risk).sort((a, b) => a - b);
  const target1 = resist[0] && resist[0] < mid + 4 * risk ? resist[0] : mid + 2 * risk;
  const t2c = Math.max(tech.high52, ...(resist.slice(1, 2)));
  const target2 = t2c > target1 + 0.5 * risk ? Math.min(t2c, mid + 5 * risk) : mid + 3 * risk;
  const rr = risk > 0 ? (target1 - mid) / risk : null;

  // Status badge
  const rsi = tech.rsi;
  const dist = price > zoneHigh ? (price - zoneHigh) / price : price < zoneLow ? (zoneLow - price) / price : 0;
  let status, label, emoji;
  if (price < stopLoss) { status = 'exit'; emoji = '🔴'; label = 'Below stop-loss — exit warning'; }
  else if ((rsi != null && rsi > 70) || (tech.sma50 && price > tech.sma50 * 1.15)) { status = 'overbought'; emoji = '🟠'; label = 'Overbought — avoid chasing'; }
  else if (dist === 0 && rsi != null && rsi < 40) { status = 'in'; emoji = '🟢'; label = 'In entry zone'; }
  else if (dist === 0) { status = 'near'; emoji = '🟡'; label = 'In zone, RSI not cooled yet'; }
  else if (dist <= 0.03) { status = 'near'; emoji = '🟡'; label = 'Near entry zone'; }
  else { status = 'wait'; emoji = '🔵'; label = 'Hold / wait'; }

  return {
    available: true,
    price, zoneLow, zoneHigh, stopLoss, target1, target2, rr,
    status, emoji, label, basis: anchor.kind, note,
    rsi, sma20: tech.sma20, sma50: tech.sma50, sma200: tech.sma200, atr,
    distancePct: price > zoneHigh ? ((price - zoneHigh) / zoneHigh) * 100 : price < zoneLow ? -((zoneLow - price) / zoneLow) * 100 : 0,
    disclaimer: 'Technical guide only, not advice.',
  };
}
