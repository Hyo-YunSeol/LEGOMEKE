import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const appUrl = new URL('../public/app.js', import.meta.url);
const cssUrl = new URL('../public/styles.css', import.meta.url);

test('싱글 테트리스 제한시간은 PC 벽시계가 아니라 서버 정렬 시계로 계산하고 조기 timeout 거절을 재동기화한다', async () => {
  const app = await readFile(appUrl, 'utf8');
  assert.match(app, /function singleTetrisTimeLeftMs\(\)[\s\S]*end - serverAlignedNow\(app\.data\?\.serverTime\)/);
  assert.doesNotMatch(app, /function singleTetrisTimeLeftMs\(\)[\s\S]{0,260}end - Date\.now\(\)/);
  assert.match(app, /earlyTimeout = reason === 'timeout'/);
  assert.match(app, /await loadBootstrap\(\{ silent: true \}\)/);
  assert.match(app, /if \(remaining > 0\)[\s\S]*startSingleTetrisTimers\(\)/);
});

test('사과게임 새 판 제안은 10x10 판 위에 배치되고 전용 모달은 하단 메뉴 높이를 제외한다', async () => {
  const [app, css] = await Promise.all([readFile(appUrl, 'utf8'), readFile(cssUrl, 'utf8')]);
  const appleMarkup = app.match(/if \(challenge\.gameId === 'apple'\) content = `([^`]+)`;/)?.[1] || '';
  assert.ok(appleMarkup.indexOf('id="apple-refresh-region"') >= 0);
  assert.ok(appleMarkup.indexOf('id="apple-board-stage"') >= 0);
  assert.ok(appleMarkup.indexOf('id="apple-refresh-region"') < appleMarkup.indexOf('id="apple-board-stage"'));
  assert.match(app, /setAppleGameModalMode\(appleGameMode\)/);
  assert.match(css, /\.modal-root\.apple-game-modal-root[\s\S]*height:calc\(var\(--visual-viewport-height,100dvh\) - var\(--bottom-nav-height,72px\) - env\(safe-area-inset-bottom\)\)/);
});

test('1대1 테트리스는 lock 즉시 다음 블록을 화면에 표시하고 서버 ACK로 최종 교정하며 NEXT와 큰 보드를 유지한다', async () => {
  const [app, css] = await Promise.all([readFile(appUrl, 'utf8'), readFile(cssUrl, 'utf8')]);
  assert.match(app, /function blockBattleVisualSelf\(/);
  assert.match(app, /서버 왕복을 기다리지 않고 화면용 visualSelf/);
  const queueStart = app.indexOf('function queueBlockBattleInput(action)');
  const queueEnd = app.indexOf('function territoryOwnerColor', queueStart);
  const queue = app.slice(queueStart, queueEnd);
  assert.match(queue, /\['softDrop', 'tick'\]\.includes\(action\) && blockBattleVerticalWouldLock\(room\)/);
  assert.match(queue, /if \(willLock\) previewBlockBattleLock\(room, \{ paint: true, mark: true \}\)/);
  assert.match(queue, /setTimeout\(flushBlockBattleInputs, 8\)/);
  assert.match(app, /data-block-next/);
  assert.match(css, /body\.block-battle-playing \.block-battle-player\.mine \.block-battle-board \{ width:min\(100%,390px\); \}/);
  assert.match(css, /grid-template-columns:minmax\(0,1fr\) 24px 70px/);
});
