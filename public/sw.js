// Honeyguide service worker: precache the app shell so it opens with no signal.
const VERSION = '__VERSION__';
const CACHE = `honeyguide-${VERSION}`;
const ASSETS = __ASSETS__;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('honeyguide-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Never cache API, auth, storage or weather calls: those carry private data.
  if (url.origin !== self.location.origin) return;
  const scope = new URL(self.registration.scope);
  const isShell = url.pathname === scope.pathname || url.pathname === scope.pathname + 'index.html';
  if (req.mode === 'navigate' && isShell) {
    // App shell first, so it opens instantly with no signal; a new version arrives with the next worker.
    event.respondWith(caches.match('./').then((hit) => hit || fetch(req)));
    return;
  }
  if (req.mode === 'navigate') {
    // Other pages (privacy policy, account deletion): network first, cached copy offline.
    event.respondWith(fetch(req).catch(() => caches.match(req, { ignoreSearch: true })));
    return;
  }
  event.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
