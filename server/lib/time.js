// IST helpers and NSE market-hours logic.
const IST_OFFSET_MIN = 330;

export function nowIST(d = new Date()) {
  // returns a Date whose UTC fields equal IST wall-clock fields
  return new Date(d.getTime() + IST_OFFSET_MIN * 60000);
}

export function istDateStr(d = new Date()) {
  return nowIST(d).toISOString().slice(0, 10);
}

export function istMinutes(d = new Date()) {
  const t = nowIST(d);
  return t.getUTCHours() * 60 + t.getUTCMinutes();
}

// NSE trading holidays (weekday closures). Best-effort list; the live NSE
// holiday API overrides it when reachable (see providers/nse.js).
export const NSE_HOLIDAYS = new Set([
  // 2025
  '2025-02-26', '2025-03-14', '2025-03-31', '2025-04-10', '2025-04-14', '2025-04-18', '2025-05-01',
  '2025-08-15', '2025-08-27', '2025-10-02', '2025-10-21', '2025-10-22', '2025-11-05', '2025-12-25',
  // 2026 (verify against NSE circular; live list is preferred)
  '2026-01-26', '2026-03-03', '2026-03-26', '2026-03-31', '2026-04-03', '2026-04-14', '2026-05-01',
  '2026-05-28', '2026-06-26', '2026-09-14', '2026-10-02', '2026-10-20', '2026-11-10', '2026-11-24', '2026-12-25',
]);

let extraHolidays = new Set();
export function setHolidays(list) { extraHolidays = new Set(list); }

export function isTradingDay(d = new Date()) {
  const t = nowIST(d);
  const dow = t.getUTCDay();
  if (dow === 0 || dow === 6) return false;
  const ds = t.toISOString().slice(0, 10);
  if (extraHolidays.size) return !extraHolidays.has(ds);
  return !NSE_HOLIDAYS.has(ds);
}

export const OPEN_MIN = 9 * 60 + 15;
export const CLOSE_MIN = 15 * 60 + 30;

export function marketStatus(d = new Date()) {
  const m = istMinutes(d);
  const trading = isTradingDay(d);
  let state = 'closed';
  if (trading && m >= OPEN_MIN && m < CLOSE_MIN) state = 'open';
  else if (trading && m >= 9 * 60 && m < OPEN_MIN) state = 'preopen';
  const label = state === 'open' ? 'Market open' : state === 'preopen' ? 'Pre-open' : 'Market closed';
  return { state, open: state === 'open', label, istTime: nowIST(d).toISOString().slice(11, 16), tradingDay: trading };
}

export function daysAgo(n) { return new Date(Date.now() - n * 86400000); }
