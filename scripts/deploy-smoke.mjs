import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [worker, app, styles, sw, index, pkg, wranglerText] = await Promise.all([
  import('../src/worker.js'),
  readFile(new URL('../public/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/styles.css', import.meta.url), 'utf8'),
  readFile(new URL('../public/sw.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../package.json', import.meta.url), 'utf8'),
  readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8')
]);

assert.equal(typeof worker.default?.fetch, 'function', 'Worker default fetch export is missing.');
assert.equal(typeof worker.LegoGameRoom, 'function', 'LegoGameRoom Durable Object export is missing.');

const requiredAppMarkers = [
  'function davinciSection()',
  'function davinciLobby()',
  'function davinciRoomView(room)',
  'data-action="davinci-create"',
  '/api/davinci/rooms/',
  '<section class="section davinci-wrap">${davinciSection()}</section>',
  '🧩 다빈치 TOP 5'
];
for (const marker of requiredAppMarkers) assert.ok(app.includes(marker), `Davinci UI marker missing: ${marker}`);

const requiredWorkerMarkers = [
  "from './game/davinci.js'",
  "pathname === '/api/davinci/rooms'",
  "'/api/davinci/rooms/:roomId/join'",
  "'/api/davinci/rooms/:roomId/start'",
  "'/api/davinci/rooms/:roomId/guess'",
  "'/api/davinci/rooms/:roomId/rematch'",
  'davinci: (() =>',
  'davinci: davinciRanking'
];
const workerSource = await readFile(new URL('../src/worker.js', import.meta.url), 'utf8');
for (const marker of requiredWorkerMarkers) assert.ok(workerSource.includes(marker), `Davinci server marker missing: ${marker}`);

assert.ok(styles.includes('.davinci-wrap'), 'Davinci styles are missing.');
assert.ok(index.includes('/app.js?v=69301'), 'index.html app cache version is not 69301.');
assert.ok(index.includes('/styles.css?v=69301'), 'index.html style cache version is not 69301.');
assert.ok(sw.includes("const VERSION = '69301'"), 'service worker cache version is not 69301.');
assert.ok(app.includes("/sw.js?v=69301"), 'app service worker registration cache version is not 69301.');
assert.equal(JSON.parse(pkg).version, '6.9.3', 'package version mismatch.');
const wrangler = JSON.parse(wranglerText);
assert.equal(wrangler.main, 'src/worker.js', 'wrangler main entry mismatch.');
assert.equal(wrangler.assets?.directory, './public', 'wrangler static assets directory mismatch.');
assert.equal(wrangler.assets?.binding, 'ASSETS', 'wrangler ASSETS binding mismatch.');
assert.ok((wrangler.durable_objects?.bindings || []).some((item) => item.name === 'GAME_ROOM' && item.class_name === 'LegoGameRoom'), 'GAME_ROOM Durable Object binding is missing.');

console.log('Deploy smoke OK: Worker imports, Davinci UI/API, and cache-busting assets are connected.');
