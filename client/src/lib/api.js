export class PinRequired extends Error {}
async function req(method, url, body) {
  const opts = { method, headers: {}, credentials: 'same-origin' };
  if (body instanceof FormData) opts.body = body;
  else if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const res = await fetch('/api' + url, opts);
  const json = await res.json().catch(() => ({}));
  if (res.status === 401 && json.pin) { window.dispatchEvent(new Event('pin-required')); throw new PinRequired('PIN required'); }
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}
// Read-only preview build (VITE_STATIC=1): GET requests are answered from a recorded snapshot.
const STATIC = import.meta.env.VITE_STATIC === '1';
let snap;
const snapshot = () => (snap ||= fetch(import.meta.env.BASE_URL + 'snapshot.json').then((r) => r.json()));
const PREVIEW_MSG = 'This is a read-only preview. Run the app on your computer or a cloud server to make changes.';
const staticApi = {
  get: async (u) => {
    const s = await snapshot();
    if (u in s) return s[u];
    if (/^\/stock\/[^/]+\/history/.test(u)) return { bars: [] };
    if (u.startsWith('/sparklines')) return {};
    if (u.startsWith('/search')) return [];
    throw new Error('Not included in this preview snapshot.');
  },
  post: async (u) => { if (u === '/alerts/seen') return { ok: true }; throw new Error(PREVIEW_MSG); },
  put: async () => { throw new Error(PREVIEW_MSG); },
  del: async () => { throw new Error(PREVIEW_MSG); },
};

export const api = STATIC ? staticApi : {
  get: (u) => req('GET', u),
  post: (u, b) => req('POST', u, b ?? {}),
  put: (u, b) => req('PUT', u, b),
  del: (u) => req('DELETE', u),
};
