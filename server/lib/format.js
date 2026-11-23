export function inr(n, digits = 0) {
  if (n == null || !isFinite(n)) return '—';
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
export function pct(n, digits = 2) {
  if (n == null || !isFinite(n)) return '—';
  return (n > 0 ? '+' : '') + n.toFixed(digits) + '%';
}
export function arrow(n) { return n > 0 ? '▲' : n < 0 ? '▼' : '■'; }
