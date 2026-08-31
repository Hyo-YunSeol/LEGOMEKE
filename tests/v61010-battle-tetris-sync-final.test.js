import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
const sw = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
const worker = await readFile(new URL('../src/worker.js', import.meta.url), 'utf8');
const blockBattle = await readFile(new URL('../src/game/block-battle.js', import.meta.url), 'utf8');

test('1대1 자동 낙하와 조작은 서버 객체가 아닌 격리 visualSelf에 정확히 한 번만 적용된다', () => {
  const queueStart = app.indexOf('function queueBlockBattleInput(action)');
  const queueEnd = app.indexOf('function territoryOwnerColor', queueStart);
  assert.ok(queueStart >= 0 && queueEnd > queueStart);
  const queue = app.slice(queueStart, queueEnd);
  assert.match(app, /blockBattleVisualSelf: null/);
  assert.match(app, /function blockBattleVisualSelf\(/);
  assert.match(queue, /const changed = previewBlockBattleInput\(action\)/);
  assert.match(queue, /visualSelf에서 즉시 한 칸만 움직인다/);
  assert.match(queue, /\['softDrop', 'tick'\]\.includes\(action\) && blockBattleVerticalWouldLock\(room\)/);
  assert.match(queue, /if \(willLock\) app\.blockBattleLockQueued = true;[\s\S]*if \(willLock\) previewBlockBattleLock\(room, \{ paint: true, mark: true \}\)/);
});

test('서버 push나 bootstrap 수신 때 pending 입력을 visualSelf에 다시 replay하지 않는다', () => {
  const start = app.indexOf('function replayBlockBattlePendingInputs');
  const end = app.indexOf('function syncBlockBattleGravity', start);
  assert.ok(start >= 0 && end > start);
  const replay = app.slice(start, end);
  assert.doesNotMatch(replay, /pendingActions/);
  assert.doesNotMatch(replay, /previewBlockBattleInput/);
  assert.match(replay, /pending input은 visualSelf에 입력 순간 정확히 한 번만 적용된다/);
});

test('게임 중 generic refresh는 1대1 테트리스 200셀 DOM을 통째로 재생성하지 않는다', () => {
  assert.match(app, /blockBattleLivePatched = Boolean\(liveBlockBattleRoom\?\.status === 'playing' && patchBlockBattleDynamic\(liveBlockBattleRoom, \{ paintSelf: paintBlockBattleSelf \}\)\)/);
  assert.match(app, /if \(tab === 'games' && pane\.dataset\.rendered === 'true'\)[\s\S]*patchBlockBattleDynamic\(liveBlockBattleRoom, \{ paintSelf: false \}\)[\s\S]*return;/);
  assert.match(app, /liveBlockBattleRoom\?\.status === 'playing' && patchBlockBattleDynamic\(liveBlockBattleRoom, \{ paintSelf: false \}\)/);
});

test('PC 재합성 원인이 될 수 있는 1대1 테트리스 paint containment를 제거한다', () => {
  assert.match(css, /\.block-battle-stage \{ overscroll-behavior:contain; \}/);
  assert.match(css, /\.block-battle-board \{ contain:none; \}/);
  assert.doesNotMatch(css, /\.block-battle-stage \{ contain:layout paint;/);
  assert.doesNotMatch(css, /\.block-battle-board \{ contain:layout paint; \}/);
});

test('서버는 클라이언트 tick을 한 번만 확정하고 최근 입력 중에는 fallback 중력이 경쟁하지 않는다', () => {
  assert.match(worker, /playBlockBattleActions\(state, pet, String\(data\.roomId \|\| ''\), data, date\)/);
  assert.match(blockBattle, /date\.getTime\(\) - lastClientInput < BLOCK_BATTLE_SERVER_FALLBACK_IDLE_MS/);
});

test('v6.10.13 캐시와 앱 버전이 일회성 초기화·안정 렌더 수정본으로 고정된다', () => {
  assert.match(sw, /const CACHE = 'lego-life-v610113-battle-ticket-space-harddrop-final'/);
  assert.match(sw, /const VERSION = '610113'/);
  assert.match(worker, /APP_VERSION = '6\.10\.13-battle-ticket-space-harddrop-final'/);
});
