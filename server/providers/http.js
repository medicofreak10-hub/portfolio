const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export async function fetchText(url, { headers = {}, timeout = 15000 } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*', 'Accept-Language': 'en-IN,en;q=0.9', ...headers }, signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return { text: await res.text(), headers: res.headers };
  } finally { clearTimeout(t); }
}

export async function fetchJson(url, opts) {
  const { text } = await fetchText(url, opts);
  return JSON.parse(text);
}

export { UA };
