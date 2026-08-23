import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const APP = new URL('../public/app.js', import.meta.url);
const CSS = new URL('../public/styles.css', import.meta.url);
const HTML = new URL('../public/index.html', import.meta.url);
const SW = new URL('../public/sw.js', import.meta.url);
const WORKER = new URL('../src/worker.js', import.meta.url);

test('v6.8.7 테트리스 시작 직후 lastAttack=null은 공격 알림 렌더링을 중단시키지 않는다', async () => {
  const app = await readFile(APP, 'utf8');
  assert.match(app, /if \(room\?\.status !== 'playing' \|\| !room\.lastAttack \|\| Number\(room\.lastAttack\.lines\) <= 0\) return '';/);
  assert.doesNotMatch(app, /Number\(room\?\.lastAttack\?\.lines\) <= 0/);
});

test('v6.8.7 낮은 가로 모바일 화면도 테트리스 판과 조작부를 별도로 축소한다', async () => {
  const css = await readFile(CSS, 'utf8');
  assert.match(css, /@media \(pointer:coarse\) and \(max-height:520px\)/);
  assert.match(css, /block-battle-player\.mine[\s\S]*?max-height:520px|@media \(pointer:coarse\)[\s\S]*?\.block-battle-player\.mine \.block-battle-board/);
  assert.match(css, /\.block-battle-player\.compact \.block-battle-board \{ width:min\(100%,70px\); \}/);
  assert.match(css, /\.block-battle-controls button \{ min-height:44px/);
});

test('v6.8.7 게임 순위 4종은 2×2이고 커플·찌르기는 더보기 전 렌더링하지 않는다', async () => {
  const [app, css] = await Promise.all([readFile(APP, 'utf8'), readFile(CSS, 'utf8')]);
  assert.match(css, /\.ranking-section \.game-rank-grid \{ grid-template-columns:repeat\(2,minmax\(0,1fr\)\) !important;/);
  assert.match(app, /const relationRows = app\.rankingRelationsExpanded\s*\?/);
  assert.match(app, /data-action="toggle-relation-rankings"/);
});


test('v6.8.7 비정상 테트리스 부분 상태도 화면 전체 오류 대신 안전 복구한다', async () => {
  const app = await readFile(APP, 'utf8');
  assert.match(app, /Array\.from\(\{ length: 20 \}[\s\S]*?player\.board\?\.\[rowIndex\]\?\.\[colIndex\] \?\? null/);
  assert.match(app, /if \(!shape \|\| !Array\.isArray\(player\?\.board\)\) return true;/);
  assert.match(app, /!Number\.isFinite\(Number\(player\.active\.row\)\)/);
  assert.match(app, /!Number\.isFinite\(Number\(player\.active\.col\)\)/);
});

test('v6.9.0 정적 자산·Worker 버전은 690으로 전부 동기화된다', async () => {
  const [html, app, sw, worker] = await Promise.all([readFile(HTML,'utf8'),readFile(APP,'utf8'),readFile(SW,'utf8'),readFile(WORKER,'utf8')]);
  assert.match(html, /app\.js\?v=69801/);
  assert.match(html, /styles\.css\?v=69801/);
  assert.match(app, /sw\.js\?v=69801/);
  assert.match(app, /\.svg\?v=69801/);
  assert.match(sw, /lego-life-v69801-single-tetris-2min-final/);
  assert.match(sw, /const VERSION = '69801'/);
  assert.match(worker, /const APP_VERSION = '6\.9\.8-single-tetris-2min-final'/);
});
