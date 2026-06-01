/* qe service worker — makes the online site work offline and installable.
 *
 * Strategy (chosen for "stable & reliable", i.e. never serve a stuck old build):
 *   • Page navigations  -> network-first: always try the live version, fall back
 *     to cache only when offline. So a deploy shows up immediately when online.
 *   • Everything else (JS/CSS/data) -> stale-while-revalidate: instant from cache,
 *     refreshed in the background, so the next load is up to date.
 *
 * Bump CACHE to force a clean slate on a breaking change.
 * Note: service workers only run over http(s); the file:// copy is already offline.
 */
const CACHE = 'qe-v3';

// Small app shell so the dashboard opens offline on a cold start. Paths are
// relative to the SW's scope, so this works at a project subpath (/<repo>/).
const SHELL = [
  './',
  './index.html',
  './report.html',
  './assets/app.js',
  './assets/modules.js',
  './assets/style.css',
  './data/_counts.js',
  './data/_topics.js',
  './manifest.webmanifest',
  './icon.svg',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // Cache each item independently so one missing file can't abort the install.
      Promise.all(SHELL.map((url) => cache.add(url).catch(() => {})))
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch { return; }
  if (url.origin !== self.location.origin) return; // leave cross-origin alone

  // Page loads: network-first -> cache -> dashboard fallback.
  // Only successful responses are cached, so a transient 404/redirect can't get
  // stuck as the offline page. The fallback uses an absolute URL so it matches a
  // cache key regardless of which subpath (/ or /modules/) we navigated from.
  if (req.mode === 'navigate') {
    const indexUrl = new URL('./index.html', self.registration.scope).href;
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match(indexUrl)))
    );
    return;
  }

  // Assets & data: stale-while-revalidate.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
