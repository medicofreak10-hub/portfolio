// Web Push (free, self-hosted VAPID). Keys come from .env, or are generated once
// and stored locally in data/vapid.json (never committed).
import * as webpush from 'web-push';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import * as store from './lib/store.js';

let keys = null;
export function vapidKeys() {
  if (keys) return keys;
  if (config.vapidPublic && config.vapidPrivate) keys = { publicKey: config.vapidPublic, privateKey: config.vapidPrivate };
  else {
    const f = path.join(config.dataDir, 'vapid.json');
    try { keys = JSON.parse(fs.readFileSync(f, 'utf8')); }
    catch { keys = webpush.generateVAPIDKeys(); fs.mkdirSync(config.dataDir, { recursive: true }); fs.writeFileSync(f, JSON.stringify(keys)); }
  }
  webpush.setVapidDetails(config.vapidSubject, keys.publicKey, keys.privateKey);
  return keys;
}

export async function pushAll(payload) {
  const db = store.get();
  if (!db.pushSubs.length) return 0;
  vapidKeys();
  let sent = 0;
  const keep = [];
  for (const sub of db.pushSubs) {
    try { await webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 3600 }); sent++; keep.push(sub); }
    catch (e) { if (e.statusCode !== 404 && e.statusCode !== 410) keep.push(sub); }
  }
  if (keep.length !== db.pushSubs.length) { db.pushSubs = keep; store.save(); }
  return sent;
}
