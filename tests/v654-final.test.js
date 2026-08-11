import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MINI_GAMES } from '../src/game/constants.js';

test('개인 미니게임 4개는 PC와 모바일에서 2열 2줄로 표시된다', async () => {
  const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
  assert.equal(Object.keys(MINI_GAMES).length, 4);
  assert.match(css, /\.personal-game-wrap \.game-grid\s*\{\s*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /@media \(max-width:\s*470px\)[\s\S]*?\.personal-game-wrap \.game-grid\s*\{\s*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
});

test('하단 메뉴는 터치 직후 캐시 화면을 보이고 무거운 갱신은 화면 표시 뒤 또는 유휴 시간에 처리한다', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
  assert.match(app, /bottomNav\?\.addEventListener\('pointerdown'/);
  assert.match(app, /function cancelTabWarmup/);
  assert.match(app, /requestIdleCallback/);
  assert.match(app, /function scheduleActiveTabRefresh/);
  assert.match(app, /app\.tabRefreshTimer = setTimeout/);
  assert.doesNotMatch(app, /requestAnimationFrame\(\(\) => \{[\s\S]{0,500}requestAnimationFrame\(\(\) => \{/);
  assert.match(css, /\.bottom-nav\s*\{[\s\S]*?backdrop-filter:\s*none/);
  assert.match(css, /\.bottom-nav \.nav-item\s*\{[\s\S]*?transition:\s*none/);
});

test('배포 버전과 브라우저 캐시 키는 6.5.4로 모두 맞는다', async () => {
  const worker = await readFile(new URL('../src/worker.js', import.meta.url), 'utf8');
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const sw = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
  assert.match(worker, /APP_VERSION = '6\.5\.4-final'/);
  assert.match(app, /\.svg\?v=654/);
  assert.match(app, /sw\.js\?v=654/);
  assert.match(html, /styles\.css\?v=654/);
  assert.match(html, /app\.js\?v=654/);
  assert.match(sw, /lego-life-v654-final/);
});
