export const inr = (n, d = 0) => (n == null || !isFinite(n) ? '—' : '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d }));
export const inrP = (n) => inr(n, n != null && Math.abs(n) < 1000 ? 2 : 0);
export const num = (n, d = 2) => (n == null || !isFinite(n) ? '—' : Number(n).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d }));
export const pct = (n, d = 2) => (n == null || !isFinite(n) ? '—' : (n > 0 ? '+' : '') + n.toFixed(d) + '%');
export const signed = (n, d = 0) => (n == null || !isFinite(n) ? '—' : (n > 0 ? '+' : n < 0 ? '−' : '') + inr(Math.abs(n), d));
export const arrow = (n) => (n == null ? '' : n > 0.005 ? '▲' : n < -0.005 ? '▼' : '■');
export function compactInr(n) {
  if (n == null || !isFinite(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e7) return '₹' + (n / 1e7).toLocaleString('en-IN', { maximumFractionDigits: 2 }) + ' Cr';
  if (a >= 1e5) return '₹' + (n / 1e5).toLocaleString('en-IN', { maximumFractionDigits: 2 }) + ' L';
  return inr(n);
}
export const crore = (n) => (n == null ? '—' : '₹' + Math.round(n / 1e7).toLocaleString('en-IN') + ' Cr');
export const istTime = (t) => (t ? new Date(t).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' }) : '—');
export const istDate = (t) => (t ? new Date(t).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export function ago(t) {
  if (!t) return '';
  const s = (Date.now() - t) / 1000;
  if (s < 90) return 'just now';
  if (s < 3600) return Math.round(s / 60) + ' min ago';
  if (s < 86400) return Math.round(s / 3600) + ' h ago';
  return Math.round(s / 86400) + ' d ago';
}
// P&L colour: green profit, red loss, grey flat; stronger tint for bigger moves.
export function tone(n, scale = 5) {
  if (n == null || !isFinite(n) || Math.abs(n) < 0.01) return { cls: 'text-flat', bg: 'transparent' };
  const k = Math.min(Math.abs(n) / scale, 1);
  const v = n > 0 ? 'var(--up)' : 'var(--down)';
  return { cls: n > 0 ? 'text-up' : 'text-down', bg: `rgb(${v} / ${0.06 + k * 0.22})`, weight: k > 0.6 ? 700 : k > 0.25 ? 600 : 500 };
}
