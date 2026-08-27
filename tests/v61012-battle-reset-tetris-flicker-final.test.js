import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initialState } from '../src/durable-store.js';
import { createPet } from '../src/game/engine.js';
import { gameDayKey } from '../src/lib/time.js';
import { createOmokRoom } from '../src/game/omok.js';
import {
  createBlockBattleRoom, joinBlockBattleRoom, playBlockBattleActions, blockBattleRoomView
} from '../src/game/block-battle.js';
import { cloneBlockBattleVisualPlayer, reconcileBlockBattleVisual } from '../public/block-battle-visual-state.js';

const BASE = new Date('2026-08-26T09:00:00.000Z'); // KST 18:00 경계
const NEXT_DAY = new Date(BASE.getTime() + 6 * 60 * 60 * 1000); // 다음 게임 하루, KST 00:00

function addUser(state, id, nickname) {
  const user = { id, nickname, generation: 1, currentPetId: null, sessionVersion: 1, notifications: [], createdAt: BASE.toISOString(), lastSeenAt: BASE.toISOString() };
  const pet = createPet(user, 1, BASE);
  user.currentPetId = pet.id;
  state.users[id] = user;
  state.pets[pet.id] = pet;
  pet.stats.points = 100_000;
  return { user, pet };
}

function setupBattle() {
  const state = initialState(BASE);
  const a = addUser(state, 'tetris-a', '테트A');
  const b = addUser(state, 'tetris-b', '테트B');
  const created = createBlockBattleRoom(state, a.pet, 100, BASE);
  assert.equal(created.ok, true);
  const joined = joinBlockBattleRoom(state, b.pet, created.roomId, BASE);
  assert.equal(joined.ok, true);
  return { state, a, b, roomId: created.roomId, room: state.blockBattle.rooms[created.roomId] };
}

test('공통 daily reset이 아직 실행되지 않았어도 대전 진입 자체가 6시간 경계를 강제 검증한다', () => {
  const state = initialState(BASE);
  const a = addUser(state, 'reset-a', '초기화A');
  a.pet.daily.battlePlayed = 17;
  a.pet.daily.battleBonus = 20;
  a.pet.daily.battleDate = gameDayKey(BASE);
  const oldDailyDate = a.pet.daily.date;

  const result = createOmokRoom(state, a.pet, 100, NEXT_DAY);
  assert.equal(result.ok, true);
  assert.equal(a.pet.daily.battlePlayed, 0);
  assert.equal(a.pet.daily.battleBonus, 0);
  assert.equal(a.pet.daily.battleDate, gameDayKey(NEXT_DAY));
  // 대전 전용 검증이 다른 생활 초기화의 기준키를 먼저 바꿔버리면 안 된다.
  assert.equal(a.pet.daily.date, oldDailyDate);
});

test('구버전 battleDate가 없는 저장 데이터도 daily.date를 기준으로 첫 접근에서 안전하게 6시간 초기화된다', () => {
  const state = initialState(BASE);
  const a = addUser(state, 'legacy-a', '구버전A');
  delete a.pet.daily.battleDate;
  a.pet.daily.battlePlayed = 29;
  a.pet.daily.battleBonus = 40;

  const result = createOmokRoom(state, a.pet, 100, NEXT_DAY);
  assert.equal(result.ok, true);
  assert.equal(a.pet.daily.battlePlayed, 0);
  assert.equal(a.pet.daily.battleBonus, 0);
  assert.equal(a.pet.daily.battleDate, gameDayKey(NEXT_DAY));
});

test('테트리스 공격은 방해줄 개수와 동일한 구멍 큐를 서버에서 미리 확정해 클라이언트에 전달한다', () => {
  const { state, a, b, roomId, room } = setupBattle();
  const host = room.players[a.pet.id];

  // O 블록 한 번으로 아래 2줄을 완성해 1줄 공격을 만든다.
  host.board = Array.from({ length: 20 }, () => Array(10).fill(null));
  host.board[18] = Array(10).fill('J');
  host.board[19] = Array(10).fill('J');
  for (const row of [18, 19]) { host.board[row][4] = null; host.board[row][5] = null; }
  host.active = { type: 'O', rotation: 0, row: 18, col: 3 };

  const attack = playBlockBattleActions(state, a.pet, roomId, {
    matchId: room.matchId, requestId: 'attack-batch-001', actions: ['hardDrop']
  }, new Date(BASE.getTime() + 1000));
  assert.equal(attack.ok, true);
  assert.equal(attack.attack, 1);

  const guest = room.players[b.pet.id];
  assert.equal(guest.pendingGarbage, 1);
  assert.equal(guest.pendingGarbageHoles.length, 1);
  assert.ok(Number.isInteger(guest.pendingGarbageHoles[0]));
  assert.ok(guest.pendingGarbageHoles[0] >= 0 && guest.pendingGarbageHoles[0] < 10);

  const view = blockBattleRoomView(state, roomId, b.pet.id, new Date(BASE.getTime() + 1000));
  assert.deepEqual(view.players[b.pet.id].pendingGarbageHoles, guest.pendingGarbageHoles);
});

test('대기 방해줄은 미리 전달된 같은 구멍으로 적용되어 서버 확정판이 예측 가능한 상태가 된다', () => {
  const { state, a, b, roomId, room } = setupBattle();
  const guest = room.players[b.pet.id];
  guest.board = Array.from({ length: 20 }, () => Array(10).fill(null));
  guest.pendingGarbage = 2;
  guest.pendingGarbageHoles = [2, 7];
  guest.active = { type: 'O', rotation: 0, row: 0, col: 3 };

  const result = playBlockBattleActions(state, b.pet, roomId, {
    matchId: room.matchId, requestId: 'garbage-batch-001', actions: ['hardDrop']
  }, new Date(BASE.getTime() + 2000));
  assert.equal(result.ok, true);
  assert.equal(guest.pendingGarbage, 0);
  assert.deepEqual(guest.pendingGarbageHoles, []);
  assert.equal(guest.board[18][2], null);
  assert.equal(guest.board[19][7], null);
  assert.equal(guest.board[18].filter((cell) => cell === 'G').length, 9);
  assert.equal(guest.board[19].filter((cell) => cell === 'G').length, 9);
});

test('ACK 서버판이 로컬 예측판과 같으면 force reconcile도 visual 객체를 교체하지 않는다', () => {
  const emptyBoard = () => Array.from({ length: 20 }, () => Array(10).fill(null));
  const server = {
    petId: 'p1', displayName: '나', connected: true, board: emptyBoard(),
    active: { type: 'I', rotation: 0, row: 0, col: 3 }, next: ['T', 'S', 'Z'],
    lines: 2, score: 10, pieces: 1, attackSent: 1, pendingGarbage: 1, pendingGarbageHoles: [6]
  };
  const visualPlayer = cloneBlockBattleVisualPlayer(server);
  visualPlayer.next = ['T', 'S']; // 로컬은 공개된 next를 한 칸 shift해 길이가 짧아질 수 있다.
  const current = { key: 'r:m:p1', player: visualPlayer };
  const reconciled = reconcileBlockBattleVisual(current, server, 'r:m:p1', { force: true });
  assert.strictEqual(reconciled, current);
  assert.deepEqual(reconciled.player.next, ['T', 'S', 'Z']);
});

test('클라이언트 lock 예측은 서버가 준 방해줄 구멍을 즉시 적용하고 active 연속성 보호를 실제 수신 경로에서 사용한다', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /function blockBattleApplyPredictedGarbage/);
  assert.match(app, /pendingGarbageHoles/);
  assert.match(app, /blockBattleApplyPredictedGarbage\(predictedBoard, pendingGarbageHoles\.slice\(0, incoming\)\)/);
  assert.match(app, /preserveBlockBattleActiveContinuity\(previous, room\)/);
  assert.doesNotMatch(app, /실제 방해줄 모양과 최종 board는 ACK 수신 시 서버 상태로 교정한다/);
});
