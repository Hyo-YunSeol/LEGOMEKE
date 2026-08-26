import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
const sw = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
const worker = await readFile(new URL('../src/worker.js', import.meta.url), 'utf8');
const blockBattle = await readFile(new URL('../src/game/block-battle.js', import.meta.url), 'utf8');

test('1대1 자동 낙하 tick은 서버 확정 전 로컬 active를 미리 움직이지 않는다', () => {
  const queueStart = app.indexOf('function queueBlockBattleInput(action)');
  const queueEnd = app.indexOf('function territoryOwnerColor', queueStart);
  assert.ok(queueStart >= 0 && queueEnd > queueStart);
  const queue = app.slice(queueStart, queueEnd);
  assert.match(queue, /const willLock = action === 'hardDrop'\s*\|\| \(action === 'softDrop'/);
  assert.doesNotMatch(queue, /else if \(action === 'tick'\) \{\s*previewBlockBattleInput\(action\)/);
  assert.match(queue, /tick은 여기서 paint\/preview하지 않는다/);
});

test('ACK 전 자동 tick은 상대 push나 bootstrap을 받을 때 로컬에서 replay하지 않는다', () => {
  const start = app.indexOf('function replayBlockBattlePendingInputs');
  const end = app.indexOf('function syncBlockBattleGravity', start);
  assert.ok(start >= 0 && end > start);
  const replay = app.slice(start, end);
  assert.match(replay, /pendingActions\.filter\(\(action\) => action !== 'tick'\)/);
  assert.match(replay, /app\.blockBattleInputBuffer\.filter\(\(action\) => action !== 'tick'\)/);
  assert.match(replay, /pendingActions\.includes\('tick'\)/);
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

test('v6.10.10 캐시와 앱 버전이 새 동기화 수정본으로 고정된다', () => {
  assert.match(sw, /const CACHE = 'lego-life-v610110-battle-tetris-sync-final'/);
  assert.match(sw, /const VERSION = '610110'/);
  assert.match(worker, /APP_VERSION = '6\.10\.10-battle-tetris-sync-final'/);
});
