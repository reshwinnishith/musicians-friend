const CACHE_NAME = 'musicians-friend-v5';
const SHELL_FILES = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/auth.js',
  '/manifest.json',
  'https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@2.44.0/tabler-icons.min.css'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Network first for Drive/Google APIs, cache first for app shell
  if (e.request.url.includes('googleapis.com') || e.request.url.includes('anthropic.com')) {
    return; // Let these go through normally
  }
  e.respondWith(
    caches.match(e.request).then(cached => {
      return cached || fetch(e.request).then(response => {
        if (response.ok && e.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return response;
      }).catch(() => cached || caches.match('/index.html'));
    })
  );
});
