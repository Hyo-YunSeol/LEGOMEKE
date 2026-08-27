import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createBlockBattleRoom,
  joinBlockBattleRoom,
  playBlockBattleActions,
  blockBattleRoomView
} from '../src/game/block-battle.js';
import { stateWithUsers } from './helpers.js';

const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const worker = await readFile(new URL('../src/worker.js', import.meta.url), 'utf8');
const engine = await readFile(new URL('../src/game/block-battle.js', import.meta.url), 'utf8');
const sw = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

test('참가 직후 첫 블록은 API 완료 전에 WebSocket 시작 snapshot을 받을 준비를 한다', () => {
  const joinStart = app.indexOf("if (action === 'block-battle-join')");
  const joinEnd = app.indexOf("if (action === 'block-battle-spectate')", joinStart);
  const join = app.slice(joinStart, joinEnd);
  assert.ok(joinStart >= 0 && joinEnd > joinStart);
  assert.ok(join.indexOf('app.blockBattleLobbyForced = false') < join.indexOf('await perform('));
  assert.ok(join.indexOf('app.blockBattleRoomId = idValue') < join.indexOf('await perform('));
  assert.match(app, /const playerMatchStarted = Boolean\(previous\?\.status === 'waiting'[\s\S]*room\.viewerRole === 'player'\)/);
  assert.match(app, /if \(playerMatchStarted\) \{[\s\S]*app\.blockBattleLobbyForced = false;[\s\S]*app\.blockBattleRoomId = room\.id;/);

  const routeStart = worker.indexOf("if (route === 'join')");
  const routeEnd = worker.indexOf("this.broadcastRefresh('block-battle-lobby')", routeStart);
  const route = worker.slice(routeStart, routeEnd);
  assert.ok(routeStart >= 0 && routeEnd > routeStart);
  assert.ok(route.indexOf('this.sendBlockBattleState(state, roomId)') < route.indexOf('await this.store.save(state)'));
});

test('방해줄 lock도 서버 ACK 장벽 없이 동일한 구멍 큐로 즉시 예측한다', () => {
  assert.doesNotMatch(app, /if \(attack <= 0 && pendingGarbage > 0\) return false/);
  assert.match(app, /pendingGarbageHoles/);
  assert.match(app, /const incoming = Math\.min\(8, pendingGarbage\)/);
  assert.match(app, /kept\.push\(Array\.from\(\{ length: 10 \}, \(_, col\) => col === hole \? null : 'G'\)\)/);
  assert.match(engine, /function legacyGarbageHole\(player, offset\)/);
  assert.match(engine, /function ensureGarbageHoles\(player\)/);
  assert.match(engine, /const hole = player\.pendingGarbageHoles\.shift\(\)/);
  assert.match(engine, /pendingGarbageHoles: full \? \[\.\.\.player\.pendingGarbageHoles\] : \[\]/);
});

test('서버가 예약한 방해줄 구멍과 실제 적용된 구멍이 정확히 일치한다', () => {
  const date = new Date('2026-08-27T06:00:00.000Z');
  const state = stateWithUsers([['u1', 'A'], ['u2', 'B']], date);
  const [host, guest] = Object.values(state.pets);
  host.stats.points = 10_000;
  guest.stats.points = 10_000;
  const created = createBlockBattleRoom(state, host, 100, date);
  assert.equal(created.ok, true);
  const joined = joinBlockBattleRoom(state, guest, created.roomId, date);
  assert.equal(joined.ok, true);
  const room = state.blockBattle.rooms[created.roomId];

  const attacker = room.players[host.id];
  attacker.board = Array.from({ length: 20 }, () => Array(10).fill(null));
  for (let row = 16; row < 20; row += 1) {
    attacker.board[row] = Array.from({ length: 10 }, (_, col) => col === 4 ? null : 'G');
  }
  attacker.active = { type: 'I', rotation: 1, row: 16, col: 2 };
  const attackResult = playBlockBattleActions(state, host, room.id, {
    roomId: room.id, matchId: room.matchId, actions: ['hardDrop'], requestId: 'attack-4-lines'
  }, new Date(date.getTime() + 100));
  assert.equal(attackResult.ok, true);
  assert.equal(room.players[guest.id].pendingGarbage, 4);
  const queuedHoles = [...room.players[guest.id].pendingGarbageHoles];
  assert.equal(queuedHoles.length, 4);
  assert.ok(queuedHoles.every((hole) => Number.isInteger(hole) && hole >= 0 && hole < 10));

  const defender = room.players[guest.id];
  defender.board = Array.from({ length: 20 }, () => Array(10).fill(null));
  defender.active = { type: 'O', rotation: 0, row: 0, col: 3 };
  const defendResult = playBlockBattleActions(state, guest, room.id, {
    roomId: room.id, matchId: room.matchId, actions: ['hardDrop'], requestId: 'consume-garbage'
  }, new Date(date.getTime() + 200));
  assert.equal(defendResult.ok, true);
  assert.equal(defender.pendingGarbage, 0);
  assert.deepEqual(defender.pendingGarbageHoles, []);
  const actualHoles = defender.board.slice(-4).map((row) => row.findIndex((cell) => cell == null));
  assert.deepEqual(actualHoles, queuedHoles);

  const view = blockBattleRoomView(state, room.id, guest.id, new Date(date.getTime() + 250));
  assert.deepEqual(view.players[guest.id].pendingGarbageHoles, []);
});

test('정적 캐시는 v6.10.6으로 갱신되어 수정 JS가 기존 서비스워커 캐시에 묻히지 않는다', () => {
  assert.equal(pkg.version, '6.10.6');
  assert.match(sw, /lego-life-v610106-tetris-instant-spawn-final/);
  assert.match(sw, /const VERSION = '610106'/);
  assert.match(app, /\/sw\.js\?v=610106/);
});
