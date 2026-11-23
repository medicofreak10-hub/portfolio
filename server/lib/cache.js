// In-memory TTL cache with in-flight de-duplication, plus optional disk persistence
// so the app shows the last known data (marked stale) when a source is down.
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

const mem = new Map();
const inflight = new Map();
const DIR = path.join(config.dataDir, 'cache');

function diskPath(key) {
  return path.join(DIR, key.replace(/[^a-z0-9._-]/gi, '_').slice(0, 150) + '.json');
}

export async function cached(key, ttlMs, fn, { persist = false } = {}) {
  const now = Date.now();
  const hit = mem.get(key);
  if (hit && now - hit.t < ttlMs) return hit.v;
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    try {
      const v = await fn();
      mem.set(key, { t: Date.now(), v });
      if (persist) {
        fs.mkdirSync(DIR, { recursive: true });
        fs.writeFile(diskPath(key), JSON.stringify({ t: Date.now(), v }), () => {});
      }
      return v;
    } catch (err) {
      // fall back to stale memory or disk copy
      let stale = hit;
      if (!stale && persist) {
        try { stale = JSON.parse(fs.readFileSync(diskPath(key), 'utf8')); } catch {}
      }
      if (stale) {
        const v = stale.v;
        if (v && typeof v === 'object' && !Array.isArray(v)) return { ...v, stale: true, staleSince: stale.t };
        return v;
      }
      throw err;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

export function peek(key) { return mem.get(key)?.v; }
export function clearCache() { mem.clear(); }
