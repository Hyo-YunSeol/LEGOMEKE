// v6.10.20: 레비아탄 전직 · 플렉스 상점 리워크 · 의미 기반 틀린그림찾기 v5 · 경기 DOM 고정
// · 대전 로비 중복/TMI 설명 정리 · 3방 · 45초 · 3→2→1 · 오답 5회 패배 · 최근 200판 중복 방지.
const CACHE = 'lego-life-v610120-advancement-shop-spotdiff-semantic-final';
const VERSION = '610120';
const versioned = (path) => `${path}?v=${VERSION}`;
const ASSETS = ['/', versioned('/styles.css'), versioned('/app.js'), versioned('/block-battle-visual-state.js'), versioned('/spot-difference-scene.js'), '/manifest.webmanifest', versioned('/icons/icon-192.png'), versioned('/icons/icon-512.png'), versioned('/icons/icon-maskable-512.png'), ...[
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
  'apple', 'duck', 'rocket', 'potion', 'cactus', 'fish', 'cake', 'camera', 'umbrella', 'whale',
  'mushroom', 'star', 'frog', 'robot', 'donut', 'lightning', 'chest', 'ghost', 'cherry', 'dice'
].map((name) => versioned(`/sichuan/${name}.svg`)), ...[
  'body-guide', 'lego-room', 'convenience', 'beach', 'game-room', 'picnic', 'camping', 'cafe', 'festival', 'space-lab'
].flatMap((themeId) => [0, 1].flatMap((variant) => [
  versioned(`/spot-atlas/${themeId}-${variant}-base.webp`),
  versioned(`/spot-atlas/${themeId}-${variant}-changed.webp`)
]))];

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
