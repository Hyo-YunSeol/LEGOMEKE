import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { cloneBlockBattleVisualPlayer, reconcileBlockBattleVisual } from '../public/block-battle-visual-state.js';

const emptyBoard = () => Array.from({ length: 20 }, () => Array(10).fill(null));
const player = (overrides = {}) => ({
  petId: 'p1', displayName: '나', connected: true,
  board: emptyBoard(), active: { type: 'O', rotation: 0, row: 0, col: 3 }, next: ['I', 'T'],
  lines: 0, score: 0, pieces: 0, attackSent: 0, pendingGarbage: 0,
  ...overrides
});

test('visual player clone은 서버 board/active와 참조를 공유하지 않는다', () => {
  const server = player();
  const visual = cloneBlockBattleVisualPlayer(server);
  visual.active.row = 4;
  visual.board[19][0] = 'G';
  visual.next.shift();
  assert.equal(server.active.row, 0);
  assert.equal(server.board[19][0], null);
  assert.deepEqual(server.next, ['I', 'T']);
});

test('같은 piece의 더 최신 서버 push가 와도 떨어지는 visual active와 board를 되감지 않는다', () => {
  const key = 'r1:m1:p1';
  let state = reconcileBlockBattleVisual(null, player(), key);
  state.player.active.row = 5; // 로컬 중력이 이미 보여준 위치
  state.player.active.col = 2;
  state.player.board[19][0] = 'Z'; // 화면 전용 상태가 서버 객체와 독립인지 함께 확인
  const samePiecePush = player({ active: { type: 'O', rotation: 0, row: 3, col: 3 }, lines: 4, attackSent: 2 });
  const next = reconcileBlockBattleVisual(state, samePiecePush, key);
  assert.strictEqual(next, state);
  assert.equal(next.player.active.row, 5);
  assert.equal(next.player.active.col, 2);
  assert.equal(next.player.board[19][0], 'Z');
  assert.equal(next.player.lines, 4);
  assert.equal(next.player.attackSent, 2);
});

test('서버에서 lock이 확정되어 pieces가 증가한 순간에만 board와 새 active를 authoritative 상태로 교체한다', () => {
  const key = 'r1:m1:p1';
  let state = reconcileBlockBattleVisual(null, player(), key);
  state.player.active.row = 18;
  const board = emptyBoard();
  board[18][4] = 'O'; board[18][5] = 'O'; board[19][4] = 'O'; board[19][5] = 'O';
  const locked = player({ pieces: 1, board, active: { type: 'I', rotation: 0, row: 0, col: 3 }, next: ['T', 'S'] });
  const next = reconcileBlockBattleVisual(state, locked, key);
  assert.notStrictEqual(next, state);
  assert.equal(next.player.pieces, 1);
  assert.equal(next.player.active.type, 'I');
  assert.equal(next.player.active.row, 0);
  assert.equal(next.player.board[19][4], 'O');
});

test('같은 piece의 force ACK도 로컬 active 위치를 교체하지 않아 낙하 블록 연속성을 유지한다', () => {
  const key = 'r1:m1:p1';
  let state = reconcileBlockBattleVisual(null, player(), key);
  state.player.active.col = 1;
  const activeRef = state.player.active;
  const server = player({ active: { type: 'O', rotation: 0, row: 0, col: 2 } });
  const next = reconcileBlockBattleVisual(state, server, key, { force: true });
  assert.strictEqual(next.player.active, activeRef);
  assert.equal(next.player.active.col, 1);
});

test('1대1 테트리스 플레이 중 generic bootstrap/render는 live board를 전체 재생성하지 않는 보호 코드를 가진다', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /blockBattleLivePatched = Boolean\(liveBlockBattleRoom\?\.status === 'playing' && patchBlockBattleDynamic\(liveBlockBattleRoom, \{ paintSelf: paintBlockBattleSelf \}\)\)/);
  assert.match(app, /generic bootstrap[\s\S]*200셀 판이 통째로 삭제·재생성/);
  assert.match(app, /if \(tab === 'games' && pane\.dataset\.rendered === 'true'\)[\s\S]*patchBlockBattleDynamic\(liveBlockBattleRoom, \{ paintSelf: false \}\)[\s\S]*return;/);
  assert.match(app, /liveBlockBattleRoom\?\.status === 'playing' && patchBlockBattleDynamic\(liveBlockBattleRoom, \{ paintSelf: false \}\)/);
  assert.match(app, /data-block-room-key/);
  assert.match(app, /function blockBattleLiveDomMatches[\s\S]*stage\.dataset\.blockRoomKey !== expectedKey/);
  assert.match(app, /최종 방어선:[\s\S]*renderTab\('games'\)[\s\S]*blockBattleLiveDomMatches\(liveBlockBattleRoom, pane\)[\s\S]*return;/);
});

test('pending 입력은 서버 snapshot 수신 때 두 번 replay되지 않고 로컬 중력 timer는 match당 하나다', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const replayStart = app.indexOf('function replayBlockBattlePendingInputs');
  const replayEnd = app.indexOf('function syncBlockBattleGravity', replayStart);
  const replay = app.slice(replayStart, replayEnd);
  assert.doesNotMatch(replay, /previewBlockBattleInput/);
  assert.doesNotMatch(replay, /pendingActions/);
  const gravityStart = app.indexOf('function syncBlockBattleGravity');
  const gravityEnd = app.indexOf('function renderBlockBattleRegion', gravityStart);
  const gravity = app.slice(gravityStart, gravityEnd);
  assert.match(gravity, /const key = active \? `\$\{room\.id\}:\$\{room\.matchId\}` : null/);
  assert.doesNotMatch(gravity, /self\?\.gravityDueAt|const dueAt\s*=/);
  assert.match(gravity, /setTimeout\(run, BLOCK_BATTLE_GRAVITY_MS\)/);
});
