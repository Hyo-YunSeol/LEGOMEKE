// v6.10.38: fixed WebSocket duplicate polling and versioned static-asset cache reads.
const CACHE = 'lego-life-v6101410-yutnori';
const VERSION = '6101410';
const versioned = (path) => `${path}?v=${VERSION}`;
const petPath = (name) => name.startsWith('form-') && name.includes('-evo-') ? `/pets/evolution/${name.split('-evo-')[0]}/${name}.svg` : `/pets/${name.startsWith('form-')?'forms':name.startsWith('lego-')?'legend':name.startsWith('pig-')?'pig':'body'}/${name}.svg`;
const versionedSichuan = (path) => `${path}?v=${VERSION}&s=6101410`;
const ASSETS = ['/', versioned('/styles.css'), versioned('/app.js'), versioned('/block-battle-visual-state.js'), versioned('/legodoku/bi-tteop-head.svg'), '/manifest.webmanifest', versioned('/icons/icon-192.png'), versioned('/icons/icon-512.png'), versioned('/icons/icon-maskable-512.png'), ...[
  'skinny', 'normal', 'yukdeok', 'jjap', 'myeol-tteop', 'chubby', 'bi-tteop', 'fat', 'three-digit', 'big-big-woman',
  'royal-bi-tteop', 'hippo', 'elephant', 'mammoth', 'wild-boar', 'daeruk', 'pig-ultra-daeruk', 'pig-emperor',
  'pig-monster', 'pig-bedbreaker', 'pig-disaster-text', 'pig-national-emergency', 'lego-protoceratops',
  'lego-triceratops', 'lego-stegosaurus', 'lego-brachiosaurus', 'lego-patagotitan', 'lego-argentinosaurus',
  'lego-blue-whale', 'lego-ultra-whale', 'lego-abyss-monster', 'lego-kraken', 'lego-deep-sea-disaster', 'lego-leviathan',
  'form-baby-dino','form-malang-bear','form-rabbit-bean','form-cat-bean','form-hamster','form-frog','form-puppy','form-piglet','form-chick','form-black-wolf','form-baby-dragon',
].map((name) => versioned(petPath(name))), ...[
  'form-piglet','form-cat-bean','form-puppy','form-rabbit-bean','form-malang-bear','form-hamster','form-baby-dino'
].flatMap((species) => Array.from({length:8}, (_,i) => versioned(petPath(`${species}-evo-${i+1}`)))), ...[
  'americano', 'bouquet', 'sunglasses', 'pig', 'dog', 'headset', 'champagne', 'luxury-bag', 'cat', 'rabbit',
  'money-bundle', 'black-card', 'trophy', 'panda', 'diamond', 'gold-bars', 'ribbon', 'teddy-bear', 'otter', 'cherry-blossom',
  'guitar', 'skateboard', 'soccer-ball', 'lion', 'flame-badge', 'sword', 'trident', 'shield', 'wolf', 'demon-wings',
  'briefcase', 'top-hat', 'goblet', 'peacock', 'golden-crown', 'magic-wand', 'magic-book', 'crystal-ball', 'baby-dragon', 'angel-wings',
  'crescent-moon', 'star-charm', 'planet', 'unicorn', 'galaxy', 'holy-sword', 'royal-throne', 'golden-trophy', 'golden-dragon', 'lego-king-crown','ball-cap','beanie','tint-glasses','teddy-backpack','gaming-headset','slim-sunglasses','cat-ear-headset','sport-goggles','visor','dark-cape','halo','crystal-visor','neon-headset','legendary-wings'
].map((name) => versioned(`/flex/${name}.svg`)), ...[
  'neon', 'ocean', 'camp', 'music', 'space'
].flatMap((theme) => [
  'cat', 'soccer', 'crown', 'moon', 'diamond', 'guitar', 'book', 'planet', 'flower', 'dragon',
  'sword', 'shield', 'teddy', 'skate', 'coffee', 'ribbon', 'trident', 'sunglasses', 'briefcase', 'crystal'
].map((tileId) => versionedSichuan(`/sichuan/themes/${theme}/${tileId}.svg`)))];

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
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/')) return;
  // Immutable, versioned CSS/JS/image files are already precached on install.
  // Reading them from Cache Storage first avoids network stalls on repeated loads.
  // Keep HTML navigations network-first so deploys and login pages stay fresh.
  if (url.origin === self.location.origin && url.searchParams.has('v') &&
      ['style', 'script', 'image', 'font', 'manifest'].includes(event.request.destination)) {
    event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
    return;
  }
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
