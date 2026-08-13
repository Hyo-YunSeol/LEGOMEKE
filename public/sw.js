const CACHE = 'lego-life-v69000-final';
const VERSION = '69000';
const versioned = (path) => `${path}?v=${VERSION}`;
const ASSETS = ['/', versioned('/styles.css'), versioned('/app.js'), '/manifest.webmanifest', versioned('/icons/icon-192.png'), versioned('/icons/icon-512.png'), versioned('/icons/icon-maskable-512.png'), ...[
  'skinny', 'normal', 'yukdeok', 'jjap', 'myeol-tteop', 'chubby', 'bi-tteop', 'fat', 'three-digit', 'big-big-woman',
  'royal-bi-tteop', 'hippo', 'elephant', 'mammoth', 'wild-boar', 'daeruk', 'pig-ultra-daeruk', 'pig-emperor',
  'pig-monster', 'pig-bedbreaker', 'pig-disaster-text', 'pig-national-emergency', 'lego-protoceratops',
  'lego-triceratops', 'lego-stegosaurus', 'lego-brachiosaurus', 'lego-patagotitan', 'lego-argentinosaurus'
].map((name) => versioned(`/pets/${name}.svg`)), ...[
  'americano', 'bouquet', 'money-bundle', 'luxury-bag', 'gold-bars', 'black-card', 'diamond', 'golden-crown',
  'sunglasses', 'headset', 'champagne', 'pig', 'dog', 'cat', 'trophy', 'angel-wings'
].map((name) => versioned(`/flex/${name}.svg`))];

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
