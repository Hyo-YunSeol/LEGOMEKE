import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { SICHUAN_THEMES } from '../src/game/sichuan.js';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [app, worker, styles, sw, index, store] = await Promise.all([
  read('public/app.js'), read('src/worker.js'), read('public/styles.css'),
  read('public/sw.js'), read('public/index.html'), read('src/durable-store.js')
]);

assert.match(worker, /APP_VERSION = '6\.10\.23-legodoku-sichuan-final'/);
assert.match(index, /styles\.css\?v=6101232/);
assert.match(index, /app\.js\?v=6101232/);
assert.match(app, /sw\.js\?v=6101232/);
assert.match(sw, /const CACHE = 'lego-life-v6101232-legodoku-sichuan-final'/);
assert.match(sw, /const VERSION = '6101232'/);

assert.match(app, /체형도감 TOP 5/);
assert.match(app, /rankings\.bodyStages/);
assert.match(app, /function sichuanTheme\(/);
assert.match(app, /테마는 시작 시 랜덤/);
assert.match(styles, /\.sichuan-cell img\{[^}]*width:94%;height:94%/);
assert.match(styles, /\.ranking-section \.rank-tabs-grid\s*\{\s*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);

assert.equal(Object.keys(SICHUAN_THEMES).length, 3);
const ids = SICHUAN_THEMES.life.tiles.map((tile) => tile.id);
assert.equal(ids.length, 20);
for (const [themeKey, theme] of Object.entries(SICHUAN_THEMES)) {
  assert.deepEqual(theme.tiles.map((tile) => tile.id), ids, `${themeKey} tile ids must stay board-compatible`);
  assert.equal(theme.tiles.length, 20);
  for (const tile of theme.tiles) {
    assert.match(tile.src, new RegExp(`^/sichuan/themes/${themeKey}/[a-z-]+\\.svg$`));
    await access(new URL(`../public${tile.src}`, import.meta.url));
    const svg = await readFile(new URL(`../public${tile.src}`, import.meta.url), 'utf8');
    assert.match(svg, /<svg[^>]+viewBox="0 0 100 100"/);
  }
}

for (const source of [app, worker, styles]) {
  assert.doesNotMatch(source, /davinci|spotDifference|spot-difference|spotdiff|다빈치|틀린그림/i);
}
for (const path of ['src/game/davinci.js', 'src/game/spot-difference.js', 'public/spot-difference-scene.js']) {
  await assert.rejects(access(new URL(`../${path}`, import.meta.url)), undefined, `${path} must be removed`);
}
assert.match(store, /refundRemovedGameEscrow\(state\)/);
assert.match(store, /delete state\.davinci;/);
assert.match(store, /delete state\.spotDifference;/);

console.log('Deploy smoke OK: v6.10.23 Legodoku + Sichuan final assets and existing game features are connected.');
