// Technical indicators on arrays of bars {t,o,h,l,c,v}.
export function sma(values, n) {
  const out = new Array(values.length).fill(null);
  let s = 0;
  for (let i = 0; i < values.length; i++) {
    s += values[i];
    if (i >= n) s -= values[i - n];
    if (i >= n - 1) out[i] = s / n;
  }
  return out;
}

export function rsi(closes, n = 14) {
  const out = new Array(closes.length).fill(null);
  if (closes.length <= n) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= n; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  gain /= n; loss /= n;
  out[n] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let i = n + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gain = (gain * (n - 1) + Math.max(d, 0)) / n;
    loss = (loss * (n - 1) + Math.max(-d, 0)) / n;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

export function atr(bars, n = 14) {
  if (bars.length < 2) return null;
  const trs = [];
  for (let i = 1; i < bars.length; i++) {
    const b = bars[i], p = bars[i - 1].c;
    trs.push(Math.max(b.h - b.l, Math.abs(b.h - p), Math.abs(b.l - p)));
  }
  const recent = trs.slice(-n);
  return recent.reduce((a, b) => a + b, 0) / recent.length;
}

// Pivot lows/highs: bar whose low (high) is the extreme of +-k neighbours.
export function pivots(bars, k = 5) {
  const lows = [], highs = [];
  for (let i = k; i < bars.length - k; i++) {
    let isLow = true, isHigh = true;
    for (let j = i - k; j <= i + k; j++) {
      if (j === i) continue;
      if (bars[j].l < bars[i].l) isLow = false;
      if (bars[j].h > bars[i].h) isHigh = false;
    }
    if (isLow) lows.push({ i, t: bars[i].t, price: bars[i].l });
    if (isHigh) highs.push({ i, t: bars[i].t, price: bars[i].h });
  }
  return { lows, highs };
}

// Group nearby levels (within tol fraction) into support zones, strength = touches.
export function clusterLevels(levels, tol = 0.02) {
  const sorted = [...levels].sort((a, b) => a - b);
  const clusters = [];
  for (const p of sorted) {
    const c = clusters[clusters.length - 1];
    if (c && Math.abs(p - c.avg) / c.avg <= tol) {
      c.members.push(p);
      c.avg = c.members.reduce((a, b) => a + b, 0) / c.members.length;
    } else clusters.push({ avg: p, members: [p] });
  }
  return clusters.map((c) => ({ price: c.avg, touches: c.members.length }));
}

export function pctReturn(bars, days) {
  if (!bars.length) return null;
  const last = bars[bars.length - 1];
  const target = last.t - days * 86400000;
  let base = null;
  for (const b of bars) { if (b.t <= target) base = b; else break; }
  base = base || bars[0];
  return ((last.c - base.c) / base.c) * 100;
}

export function technicals(bars) {
  if (!bars || bars.length < 20) return null;
  const closes = bars.map((b) => b.c);
  const s20 = sma(closes, 20), s50 = sma(closes, 50), s200 = sma(closes, 200);
  const r = rsi(closes, 14);
  const last = bars.length - 1;
  const year = bars.filter((b) => b.t >= bars[last].t - 365 * 86400000);
  const vols = bars.slice(-50).map((b) => b.v || 0);
  return {
    price: closes[last],
    sma20: s20[last], sma50: s50[last], sma200: s200[last],
    rsi: r[last],
    atr: atr(bars.slice(-30)),
    high52: Math.max(...year.map((b) => b.h)),
    low52: Math.min(...year.map((b) => b.l)),
    ret1m: pctReturn(bars, 30), ret3m: pctReturn(bars, 91), ret6m: pctReturn(bars, 182), ret1y: pctReturn(bars, 365),
    avgVol50: vols.reduce((a, b) => a + b, 0) / (vols.length || 1),
    lastVol: bars[last].v || 0,
  };
}
