import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const APP = new URL('../public/app.js', import.meta.url);
const HTML = new URL('../public/index.html', import.meta.url);
const SW = new URL('../public/sw.js', import.meta.url);
const WORKER = new URL('../src/worker.js', import.meta.url);
const PACKAGE = new URL('../package.json', import.meta.url);

test('v6.9.0 진행 중 실시간 게임은 최초·같은 게임 탭 pointerdown 안에서 즉시 렌더링한다', async () => {
  const source = await readFile(APP, 'utf8');
  assert.match(source, /const realtimeGameOpen = tabName === 'games' && Boolean\(app\.data && \(currentOmokRoom\(\) \|\| currentBlockBattleRoom\(\) \|\| currentSichuanRoom\(\) \|\| currentDavinciRoom\(\)\)\)/);
  assert.match(source, /if \(needsImmediateRealtimeRender\) \{[\s\S]*?renderTab\(tabName, \{ force: true \}\);/);
  assert.match(source, /if \(realtimeGameOpen && pane\) \{[\s\S]*?renderTab\(tabName, \{ force: true \}\);[\s\S]*?\} else \{[\s\S]*?scheduleTabRender\(tabName, \{ afterPaint: true \}\);/);
});

test('v6.9.0 테트리스 시작 직후 null 공격 상태와 부분 보드는 안전 처리한다', async () => {
  const source = await readFile(APP, 'utf8');
  assert.match(source, /if \(room\?\.status !== 'playing' \|\| !room\.lastAttack \|\| Number\(room\.lastAttack\.lines\) <= 0\) return '';/);
  assert.match(source, /Array\.from\(\{ length: 20 \}, \(_, rowIndex\) =>[\s\S]*?player\.board\?\.\[rowIndex\]\?\.\[colIndex\] \?\? null/);
});

test('v6.9.0 배포 버전과 캐시는 690으로 동기화된다', async () => {
  const [app, html, sw, worker, pkg] = await Promise.all([
    readFile(APP, 'utf8'), readFile(HTML, 'utf8'), readFile(SW, 'utf8'), readFile(WORKER, 'utf8'), readFile(PACKAGE, 'utf8')
  ]);
  assert.match(html, /styles\.css\?v=69901/);
  assert.match(html, /app\.js\?v=69901/);
  assert.match(app, /\/sw\.js\?v=69901/);
  assert.match(sw, /lego-life-v69901-single-tetris-viewport-final/);
  assert.match(sw, /VERSION = '69901'/);
  assert.match(worker, /APP_VERSION = '6\.9\.9-single-tetris-viewport-final'/);
  assert.equal(JSON.parse(pkg).version, '6.9.9');
});
