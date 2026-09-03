import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DurableJsonStore } from '../src/durable-store.js';
import { startMiniGame } from '../src/game/engine.js';
import { MemoryStorage, stateWithUsers } from './helpers.js';

const BASE = new Date('2026-09-03T07:00:00.000Z');

test('싱글 테트리스 진행판은 Durable Object 콜드 재시작 뒤에도 유지된다', async () => {
  const shared = new Map();
  const firstStore = new DurableJsonStore(new MemoryStorage(shared));
  const state = stateWithUsers([['u1', '콜드복구']], BASE);
  const pet = state.pets[state.users.u1.currentPetId];
  const started = startMiniGame(state, pet, 'tetrisSingle', BASE);
  assert.equal(started.ok, true);
  await firstStore.save(state, { forceBackup: true });

  const secondStore = new DurableJsonStore(new MemoryStorage(shared));
  const reloaded = await secondStore.load();
  const challenge = Object.values(reloaded.miniGameChallenges).find((item) => item?.petId === pet.id && item?.gameId === 'tetrisSingle' && !item?.completed);
  assert.ok(challenge, '콜드 재시작 뒤 진행 중 싱글 테트리스가 삭제되면 안 된다');
  assert.equal(challenge.id, started.challenge.id);
  assert.equal(challenge.tetrisDurationMs, started.challenge.tetrisDurationMs);
});

test('지뢰찾기는 bootstrap 복구를 자동 포기로 오인하지 않고 입력 큐를 제한한다', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const bootstrapStart = app.indexOf('async function loadBootstrap(');
  const bootstrapEnd = app.indexOf('\nfunction connectRealtime()', bootstrapStart);
  const bootstrap = app.slice(bootstrapStart, bootstrapEnd);
  assert.doesNotMatch(bootstrap, /minigames\/minesweeper\/abandon/);
  assert.match(app, /MINESWEEPER_ACTION_QUEUE_LIMIT = 64/);
  assert.match(app, /app\.minesweeperActionQueue\.length >= MINESWEEPER_ACTION_QUEUE_LIMIT/);
});

test('블록게임은 120개 버튼 DOM을 유지하고 timeout 및 정산 watchdog으로 멈춤을 복구한다', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const cellStart = app.indexOf('function blockCellHtml(');
  const cellEnd = app.indexOf('\nfunction blockBoardHtml(', cellStart);
  const cell = app.slice(cellStart, cellEnd);
  assert.match(cell, /return `<button/);
  assert.doesNotMatch(cell, /<span class="block-cell block-empty-cell"/);
  assert.match(app, /BLOCK_GAME_API_TIMEOUT_MS = 6_500/);
  assert.match(app, /BLOCK_GAME_SETTLEMENT_WATCH_MS = 15_000/);
  assert.match(app, /function armBlockGameSettlementWatch/);
  const refreshStart = app.indexOf('function refreshBlockMiniOnly(');
  const refreshEnd = app.indexOf('\nfunction openCreateOmok()', refreshStart);
  const refresh = app.slice(refreshStart, refreshEnd);
  assert.doesNotMatch(refresh, /replaceWith\(/);
  assert.match(refresh, /current\.disabled = empty/);
});

test('공통 API는 AbortController timeout을 사용하고 별도 재연결 UI는 추가하지 않는다', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const apiStart = app.indexOf('async function api(');
  const apiEnd = app.indexOf('\nfunction showAuth()', apiStart);
  const api = app.slice(apiStart, apiEnd);
  assert.match(api, /DEFAULT_API_TIMEOUT_MS/);
  assert.match(api, /new AbortController\(\)/);
  assert.match(api, /controller\.abort\(\)/);
  assert.match(api, /서버 응답이 지연되어 요청을 중단했습니다/);
  assert.doesNotMatch(app, /재연결 중/);
});

test('삭제된 반응속도·숫자맞히기 클라이언트 런타임과 관리자 진단 복사 기능을 정리한다', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /function scheduleReactionReady/);
  assert.doesNotMatch(app, /id="number-game-form"/);
  assert.doesNotMatch(app, /id="reaction-stage"/);
  assert.match(app, /data-action="admin-copy-diagnostics"/);
  assert.match(app, /function buildAdminDiagnosticText/);
  assert.match(app, /function copyAdminDiagnostics/);
});

test('블록게임·대전권 설명은 실제 현재 규칙과 일치한다', async () => {
  const constants = await readFile(new URL('../src/game/constants.js', import.meta.url), 'utf8');
  assert.match(constants, /같은 색 블록 2개 이상을 눌러 더 이상 지울 수 없을 때까지 진행합니다/);
  assert.match(constants, /오목·테트리스대전·사천성·레고도쿠 합산 한도를 20회/);
});
