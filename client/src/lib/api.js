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
export const api = {
  get: (u) => req('GET', u),
  post: (u, b) => req('POST', u, b ?? {}),
  put: (u, b) => req('PUT', u, b),
  del: (u) => req('DELETE', u),
};
