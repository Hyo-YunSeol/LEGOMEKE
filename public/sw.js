const CACHE = 'lego-life-v644-final';
const ASSETS = [
  '/',
  '/styles.css?v=644',
  '/app.js?v=644',
  '/manifest.webmanifest',
  '/pets/skinny.svg',
  '/pets/normal.svg',
  '/pets/jjap.svg',
  '/pets/chubby.svg',
  '/pets/tteop.svg',
  '/pets/real-tteop.svg',
  '/pets/pig.svg',
  '/pets/elephant.svg',
  '/pets/mammoth.svg',
  '/pets/daeruk.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).pathname.startsWith('/api/')) return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
