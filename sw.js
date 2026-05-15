/* LogMyStack — service worker.
 *
 * Caches the app shell so the four card pages and the tracker load
 * even on flaky connections. Strategy:
 *   - install: pre-cache the shell URLs
 *   - fetch:   network-first for the app pages so users get fresh data
 *              when online, fall back to cache offline
 *   - push:    handle push events (server-driven reminders, future)
 */
const CACHE = 'lms-shell-v1';
const SHELL = [
  '/app/',
  '/app/feed/',
  '/app/create/',
  '/app/saved/',
  '/app/my/',
  '/app/_auth.js',
  '/app/_nav.js',
  '/app/icon.svg',
  '/manifest.json',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Only handle GETs we own
  if (e.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;
  // Network-first for the app shell
  if (url.pathname.startsWith('/app/') || url.pathname === '/manifest.json') {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
  }
});

// Push notifications (server sends these; client falls back to local notifications).
self.addEventListener('push', e => {
  let payload = { title: 'LogMyStack', body: 'Time to log your dose.' };
  try { if (e.data) payload = e.data.json(); } catch {}
  e.waitUntil(self.registration.showNotification(payload.title, {
    body: payload.body,
    icon: '/app/icon.svg',
    badge: '/app/icon.svg',
    data: payload.data || {},
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(clients => {
      const url = (e.notification.data && e.notification.data.url) || '/app/';
      const existing = clients.find(c => c.url.includes(url));
      if (existing) return existing.focus();
      return self.clients.openWindow(url);
    })
  );
});
