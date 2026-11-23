/* Service worker: offline shell, last-known API data, and push notifications. */
import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { NetworkFirst } from 'workbox-strategies';

self.skipWaiting();
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
precacheAndRoute(self.__WB_MANIFEST || []);
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api\//] }));
registerRoute(({ url, request }) => url.pathname.startsWith('/api/') && request.method === 'GET' && !url.pathname.startsWith('/api/export'),
  new NetworkFirst({ cacheName: 'api', networkTimeoutSeconds: 8 }));

self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data.json(); } catch { d = { title: 'My Halal Portfolio', body: event.data?.text() }; }
  event.waitUntil(self.registration.showNotification(d.title || 'My Halal Portfolio', { body: d.body || '', icon: '/icon-192.png', badge: '/icon-192.png', tag: d.tag, data: { url: d.url || '/' } }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const external = /^https?:/.test(url) && !url.startsWith(self.location.origin);
    if (external) return self.clients.openWindow(url);
    for (const c of all) { if ('focus' in c) { c.navigate(url).catch(() => {}); return c.focus(); } }
    return self.clients.openWindow(url);
  })());
});
