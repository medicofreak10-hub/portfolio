// XIRR via Newton-Raphson with bisection fallback. flows: [{t: ms, amount}] (outflow negative)
export function xirr(flows) {
  if (!flows || flows.length < 2) return null;
  if (!flows.some((f) => f.amount < 0) || !flows.some((f) => f.amount > 0)) return null;
  const t0 = Math.min(...flows.map((f) => f.t));
  const yrs = flows.map((f) => (f.t - t0) / (365 * 86400000));
  if (Math.max(...yrs) < 1 / 365) return null;
  const npv = (r) => flows.reduce((s, f, i) => s + f.amount / Math.pow(1 + r, yrs[i]), 0);
  const d = (r) => flows.reduce((s, f, i) => s - (yrs[i] * f.amount) / Math.pow(1 + r, yrs[i] + 1), 0);
  let r = 0.1;
  for (let i = 0; i < 60; i++) {
    const v = npv(r), dv = d(r);
    if (!isFinite(v) || !isFinite(dv) || dv === 0) break;
    const nr = r - v / dv;
    if (nr <= -0.9999) break;
    if (Math.abs(nr - r) < 1e-8) return nr * 100;
    r = nr;
  }
  let lo = -0.9999, hi = 100;
  if (npv(lo) * npv(hi) > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (npv(lo) * npv(mid) <= 0) hi = mid; else lo = mid;
  }
  return ((lo + hi) / 2) * 100;
}

// Build the open (unsold) lots for a holding from trade history using FIFO.
// If history doesn't fully explain the current quantity (e.g. bought before the
// statement period), an "opening lot" is assumed at the start of history,
// priced so the open lots match the broker's average price.
export function openLots(holding, txns) {
  const list = txns.filter((t) => t.symbol === holding.symbol).sort((a, b) => a.date.localeCompare(b.date));
  const net = list.reduce((s, t) => s + (t.side === 'BUY' ? t.qty : -t.qty), 0);
  const opening = Math.max(0, holding.qty - net);
  const firstDate = list[0]?.date || holding.buyDate;
  const lots = [];
  if (opening > 0) lots.push({ qty: opening, price: null, date: holding.buyDate || firstDate, opening: true });
  for (const t of list) {
    if (t.side === 'BUY') lots.push({ qty: t.qty, price: t.price, date: t.date });
    else {
      let q = t.qty;
      while (q > 0 && lots.length) {
        const l = lots[0];
        const take = Math.min(l.qty, q);
        l.qty -= take; q -= take;
        if (l.qty <= 1e-9) lots.shift();
      }
    }
  }
  // trim to current qty from the oldest (if broker shows fewer shares than history implies)
  let total = lots.reduce((s, l) => s + l.qty, 0);
  while (total > holding.qty + 1e-9 && lots.length) {
    const excess = total - holding.qty;
    const take = Math.min(lots[0].qty, excess);
    lots[0].qty -= take; total -= take;
    if (lots[0].qty <= 1e-9) lots.shift();
  }
  const known = lots.filter((l) => !l.opening).reduce((s, l) => s + l.qty * l.price, 0);
  const op = lots.find((l) => l.opening);
  let approx = !list.length;
  if (op) {
    const p = (holding.qty * holding.avgPrice - known) / op.qty;
    op.price = p > 0 ? p : holding.avgPrice;
    approx = true;
  }
  if (!lots.length && holding.qty > 0) lots.push({ qty: holding.qty, price: holding.avgPrice, date: holding.buyDate || new Date().toISOString().slice(0, 10), opening: true });
  return { lots: lots.filter((l) => l.qty > 0 && l.date), approx };
}

export function holdingXirr(holding, txns, currentValue, now = Date.now()) {
  const { lots, approx } = openLots(holding, txns);
  if (!lots.length || !currentValue) return { xirr: null, approx };
  const flows = lots.map((l) => ({ t: new Date(l.date).getTime(), amount: -l.qty * l.price }));
  flows.push({ t: now, amount: currentValue });
  // XIRR on a short holding period annualises wildly; report null (P&L % still shown)
  const invested = lots.reduce((s, l) => s + l.qty * l.price, 0);
  const avgDays = lots.reduce((s, l) => s + l.qty * l.price * (now - new Date(l.date).getTime()), 0) / invested / 86400000;
  if (avgDays < 60) return { xirr: null, approx, tooRecent: true, flows };
  return { xirr: xirr(flows), approx, flows };
}
