const CACHE = 'lego-life-v651-final';
const ASSETS = ['/', '/styles.css?v=651', '/app.js?v=651', '/manifest.webmanifest', '/pets/skinny.svg', '/pets/normal.svg', '/pets/yukdeok.svg', '/pets/jjap.svg', '/pets/myeol-tteop.svg', '/pets/chubby.svg', '/pets/bi-tteop.svg', '/pets/fat.svg', '/pets/three-digit.svg', '/pets/big-big-woman.svg', '/pets/royal-bi-tteop.svg', '/pets/hippo.svg', '/pets/elephant.svg', '/pets/mammoth.svg', '/pets/wild-boar.svg', '/pets/daeruk.svg', '/pets/pig-ultra-daeruk.svg', '/pets/pig-emperor.svg', '/pets/pig-monster.svg', '/pets/pig-bedbreaker.svg', '/pets/pig-disaster-text.svg', '/pets/pig-national-emergency.svg', '/pets/lego-protoceratops.svg', '/pets/lego-triceratops.svg', '/pets/lego-stegosaurus.svg', '/pets/lego-brachiosaurus.svg', '/pets/lego-patagotitan.svg', '/pets/lego-argentinosaurus.svg'];

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
