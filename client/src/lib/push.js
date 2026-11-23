import { api } from './api.js';
function b64ToUint8(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}
export function notificationsSupported() { return 'Notification' in window && 'serviceWorker' in navigator; }
export async function enableNotifications(publicKey) {
  if (!notificationsSupported()) throw new Error('This browser does not support notifications. On iPhone, add the app to your Home Screen first.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notification permission was not granted.');
  const reg = await navigator.serviceWorker.ready;
  let pushOk = false;
  if ('PushManager' in window && window.isSecureContext && publicKey) {
    try {
      const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(publicKey) }));
      await api.post('/push/subscribe', sub.toJSON());
      pushOk = true;
    } catch (e) { console.warn('push subscribe failed', e); }
  }
  return { pushOk };
}
// In-page notification fallback while the app is open (works over plain http on localhost)
export async function showLocal(title, body, url) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try { const reg = await navigator.serviceWorker?.getRegistration(); if (reg) return reg.showNotification(title, { body, data: { url }, icon: '/icon-192.png' }); } catch {}
  try { new Notification(title, { body, icon: '/icon-192.png' }); } catch {}
}
