// v6.10.24: input/profile/block/admin/territory fixes + synchronized static asset cache.
const CACHE = 'lego-life-v6101240-safe-fixes-final';
const VERSION = '6101240';
const versioned = (path) => `${path}?v=${VERSION}`;
const ASSETS = ['/', versioned('/styles.css'), versioned('/app.js'), versioned('/block-battle-visual-state.js'), versioned('/legodoku/bi-tteop-head.svg'), '/manifest.webmanifest', versioned('/icons/icon-192.png'), versioned('/icons/icon-512.png'), versioned('/icons/icon-maskable-512.png'), ...[
  'skinny', 'normal', 'yukdeok', 'jjap', 'myeol-tteop', 'chubby', 'bi-tteop', 'fat', 'three-digit', 'big-big-woman',
  'royal-bi-tteop', 'hippo', 'elephant', 'mammoth', 'wild-boar', 'daeruk', 'pig-ultra-daeruk', 'pig-emperor',
  'pig-monster', 'pig-bedbreaker', 'pig-disaster-text', 'pig-national-emergency', 'lego-protoceratops',
  'lego-triceratops', 'lego-stegosaurus', 'lego-brachiosaurus', 'lego-patagotitan', 'lego-argentinosaurus',
  'lego-blue-whale', 'lego-ultra-whale', 'lego-abyss-monster', 'lego-kraken', 'lego-deep-sea-disaster', 'lego-leviathan',
  'form-baby-dino','form-malang-bear','form-rabbit-bean','form-cat-bean','form-hamster','form-frog','form-puppy','form-piglet','form-chick','form-black-wolf','form-baby-dragon',
].map((name) => versioned(`/pets/${name}.svg`)), ...[
  'americano', 'bouquet', 'sunglasses', 'pig', 'dog', 'headset', 'champagne', 'luxury-bag', 'cat', 'rabbit',
  'money-bundle', 'black-card', 'trophy', 'panda', 'diamond', 'gold-bars', 'ribbon', 'teddy-bear', 'otter', 'cherry-blossom',
  'guitar', 'skateboard', 'soccer-ball', 'lion', 'flame-badge', 'sword', 'trident', 'shield', 'wolf', 'demon-wings',
  'briefcase', 'top-hat', 'goblet', 'peacock', 'golden-crown', 'magic-wand', 'magic-book', 'crystal-ball', 'baby-dragon', 'angel-wings',
  'crescent-moon', 'star-charm', 'planet', 'unicorn', 'galaxy', 'holy-sword', 'royal-throne', 'golden-trophy', 'golden-dragon', 'lego-king-crown','ball-cap','beanie','tint-glasses','teddy-backpack','gaming-headset','slim-sunglasses','cat-ear-headset','sport-goggles','visor','dark-cape','halo','crystal-visor','neon-headset','legendary-wings'
].map((name) => versioned(`/flex/${name}.svg`)), ...[
  'life', 'nature', 'fantasy'
].flatMap((theme) => [
  'cat', 'soccer', 'crown', 'moon', 'diamond', 'guitar', 'book', 'planet', 'flower', 'dragon',
  'sword', 'shield', 'teddy', 'skate', 'coffee', 'ribbon', 'trident', 'sunglasses', 'briefcase', 'crystal'
].map((tileId) => versioned(`/sichuan/themes/${theme}/${tileId}.svg`)))];

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
