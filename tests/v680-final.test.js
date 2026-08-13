import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  BLOCK_BATTLE_HEIGHT, BLOCK_BATTLE_MAX_ROOMS, BLOCK_BATTLE_STAKES, BLOCK_BATTLE_WIDTH, validBlockBattleStake,
  BLOCK_BATTLE_GRAVITY_MS, TETROMINO_SHAPES, blockBattleGravityMs, blockBattleRankings, blockBattleSetConnected, blockBattleView, createBlockBattleRoom,
  joinBlockBattleRoom, leaveBlockBattleRoom, playBlockBattleActions, processBlockBattleTimers,
  requestBlockBattleRematch, spectateBlockBattleRoom
} from '../src/game/block-battle.js';
import { claimTerritory, initialTerritory, normalizeTerritory, processTerritorySeason, territoryView } from '../src/game/territory.js';
import { gameDayKey } from '../src/lib/time.js';
import { DurableJsonStore } from '../src/durable-store.js';
import { authRequest, createRoom, MemoryStorage, register, responseJson, stateWithUsers } from './helpers.js';

const KST_1759 = new Date('2026-08-11T08:59:00.000Z');
const KST_1800 = new Date('2026-08-11T09:00:00.000Z');
const KST_1801 = new Date('2026-08-11T09:01:00.000Z');
const KST_2230 = new Date('2026-08-11T13:30:00.000Z');
const KST_2400 = new Date('2026-08-11T15:00:00.000Z');

function players(count = 3, date = KST_1801) {
  const names = Array.from({ length: count }, (_, index) => [`user-${index + 1}`, `선수${index + 1}`]);
  const state = stateWithUsers(names, date);
  const pets = names.map(([userId]) => state.pets[state.users[userId].currentPetId]);
  for (const pet of pets) pet.stats.points = 10_000;
  return { state, pets };
}

test('블럭대전은 10×20, 7종 블럭, 3방이며 오목과 같은 판돈 규칙을 쓴다', () => {
  assert.equal(BLOCK_BATTLE_WIDTH, 10);
  assert.equal(BLOCK_BATTLE_HEIGHT, 20);
  assert.equal(BLOCK_BATTLE_MAX_ROOMS, 3);
  assert.deepEqual(BLOCK_BATTLE_STAKES, [100, 500, 1000, 2000, 3000]);
  for (const value of [100, 500, 1000, 2000, 3000, 4000, 10_000]) assert.equal(validBlockBattleStake(value), true);
  for (const value of [0, 200, 999, 1500, 2500, 3500, 1000.5, 'abc']) assert.equal(validBlockBattleStake(value), false);
  assert.deepEqual(Object.keys(TETROMINO_SHAPES).sort(), ['I', 'J', 'L', 'O', 'S', 'T', 'Z']);
  const { state, pets } = players(4);
  for (let index = 0; index < 3; index += 1) assert.equal(createBlockBattleRoom(state, pets[index], BLOCK_BATTLE_STAKES[index], KST_1801).ok, true);
  assert.equal(createBlockBattleRoom(state, pets[3], 100, KST_1801).ok, false);
  assert.equal(Object.keys(state.blockBattle.rooms).length, 3);
  assert.deepEqual(blockBattleView(state, pets[0].id, KST_1801).stakes, [100, 500, 1000, 2000, 3000]);
  const firstRoom = Object.values(state.blockBattle.rooms)[0];
  firstRoom.startedAt = KST_1801.toISOString();
  assert.equal(BLOCK_BATTLE_GRAVITY_MS, 700);
  assert.equal(blockBattleGravityMs(firstRoom, KST_1801), 700);
  assert.equal(blockBattleGravityMs(firstRoom, new Date(KST_1801.getTime() + 5 * 60_000)), 700);
  assert.equal(blockBattleGravityMs(firstRoom, new Date(KST_1801.getTime() + 60 * 60_000)), 700);
});

test('상대 참가 시 양쪽 판돈을 한 번만 확보하고 중복 입력을 한 번만 처리한다', () => {
  const { state, pets } = players(2);
  const created = createBlockBattleRoom(state, pets[0], 500, KST_1801);
  assert.equal(joinBlockBattleRoom(state, pets[1], created.roomId, KST_1801).ok, true);
  const room = state.blockBattle.rooms[created.roomId];
  assert.equal(pets[0].stats.points, 9_500);
  assert.equal(pets[1].stats.points, 9_500);
  assert.equal(room.escrow[pets[0].id], 500);
  assert.equal(room.escrow[pets[1].id], 500);
  const input = { matchId: room.matchId, requestId: 'block-batch-0001', actions: ['left', 'right', 'rotate'] };
  const first = playBlockBattleActions(state, pets[0], room.id, input, new Date(KST_1801.getTime() + 1_000));
  const activeAfter = structuredClone(room.players[pets[0].id].active);
  const duplicate = playBlockBattleActions(state, pets[0], room.id, input, new Date(KST_1801.getTime() + 1_100));
  assert.equal(first.ok, true);
  assert.equal(duplicate.duplicate, true);
  assert.deepEqual(room.players[pets[0].id].active, activeAfter);
});

test('2줄 동시 제거는 상대에게 1줄 방해를 보내고 오래된 대전 입력은 거부한다', () => {
  const { state, pets } = players(2);
  const { roomId } = createBlockBattleRoom(state, pets[0], 100, KST_1801);
  joinBlockBattleRoom(state, pets[1], roomId, KST_1801);
  const room = state.blockBattle.rooms[roomId];
  const player = room.players[pets[0].id];
  player.board[18] = Array(10).fill('G');
  player.board[19] = Array(10).fill('G');
  player.board[18][5] = null;
  player.board[19][5] = null;
  player.active = { type: 'I', rotation: 1, row: 0, col: 3 };
  const result = playBlockBattleActions(state, pets[0], roomId, { matchId: room.matchId, requestId: 'block-clear-0001', actions: ['hardDrop'] }, new Date(KST_1801.getTime() + 1_000));
  assert.equal(result.cleared, 2);
  assert.equal(result.attack, 1);
  assert.equal(room.players[pets[1].id].pendingGarbage, 1);
  const stale = playBlockBattleActions(state, pets[0], roomId, { matchId: 'old-match', requestId: 'block-stale-0001', actions: ['left'] }, new Date(KST_1801.getTime() + 2_000));
  assert.equal(stale.ok, false);
  assert.equal(stale.stale, true);
});

test('기권 승패·판돈 정산은 한 번만 실행되고 재대결은 양쪽 수락 뒤 시작한다', () => {
  const { state, pets } = players(2);
  const { roomId } = createBlockBattleRoom(state, pets[0], 100, KST_1801);
  joinBlockBattleRoom(state, pets[1], roomId, KST_1801);
  const left = leaveBlockBattleRoom(state, pets[0], roomId, new Date(KST_1801.getTime() + 2_000));
  const room = state.blockBattle.rooms[roomId];
  assert.equal(left.ok, true);
  assert.equal(room.status, 'ended');
  assert.equal(room.winnerPetId, pets[1].id);
  assert.equal(pets[1].stats.points, 10_100);
  assert.equal(pets[1].records.blockBattleWins, 1);
  assert.equal(pets[0].records.blockBattleLosses, 1);
  assert.equal(requestBlockBattleRematch(state, pets[0], roomId, new Date(KST_1801.getTime() + 3_000)).pending, true);
  assert.equal(requestBlockBattleRematch(state, pets[1], roomId, new Date(KST_1801.getTime() + 4_000)).started, true);
  assert.equal(room.status, 'playing');
  assert.equal(pets[0].stats.points, 9_800);
  assert.equal(pets[1].stats.points, 10_000);
});

test('재접속 30초 동안 게임을 멈추고 만료 뒤 한 번만 기권 정산한다', () => {
  const { state, pets } = players(2);
  const { roomId } = createBlockBattleRoom(state, pets[0], 100, KST_1801);
  joinBlockBattleRoom(state, pets[1], roomId, KST_1801);
  const room = state.blockBattle.rooms[roomId];
  const rowBefore = room.players[pets[0].id].active.row;
  blockBattleSetConnected(state, pets[0].id, false, new Date(KST_1801.getTime() + 1_000));
  processBlockBattleTimers(state, new Date(KST_1801.getTime() + 20_000));
  assert.equal(room.status, 'playing');
  assert.equal(room.players[pets[0].id].active.row, rowBefore);
  processBlockBattleTimers(state, new Date(KST_1801.getTime() + 32_000));
  const winnerPoints = pets[1].stats.points;
  assert.equal(room.status, 'ended');
  processBlockBattleTimers(state, new Date(KST_1801.getTime() + 40_000));
  assert.equal(pets[1].stats.points, winnerPoints);
});

test('관전자는 전체 판을 보되 조작할 수 없고 누적 승패 TOP5가 정렬된다', () => {
  const { state, pets } = players(3);
  const { roomId } = createBlockBattleRoom(state, pets[0], 100, KST_1801);
  joinBlockBattleRoom(state, pets[1], roomId, KST_1801);
  assert.equal(spectateBlockBattleRoom(state, pets[2], roomId, KST_1801).ok, true);
  const view = blockBattleView(state, pets[2].id, KST_1801).rooms[0];
  assert.equal(view.viewerRole, 'spectator');
  assert.equal(view.players[pets[0].id].board.length, 20);
  assert.equal(playBlockBattleActions(state, pets[2], roomId, { matchId: view.matchId, requestId: 'spectator-input', actions: ['left'] }, KST_1801).ok, false);
  pets[0].records.blockBattleWins = 2;
  pets[1].records.blockBattleWins = 2;
  pets[0].records.blockBattleLosses = 3;
  pets[1].records.blockBattleLosses = 1;
  assert.equal(blockBattleRankings(state).top[0].petId, pets[1].id);
});

test('17:59 점령은 18:00에 정확히 한 번 정산·초기화된다', () => {
  const { state, pets } = players(1, KST_1759);
  state.territory = initialTerritory(KST_1759, 7);
  assert.equal(claimTerritory(state, pets[0], 2, 2, KST_1759).ok, true);
  const pointsBefore = pets[0].stats.points;
  const first = processTerritorySeason(state, KST_1800);
  assert.equal(first.changed, true);
  assert.equal(Object.keys(state.territory.cells).length, 0);
  assert.equal(pets[0].stats.points, pointsBefore + 500);
  assert.equal(state.territory.endsAt, KST_2400.toISOString());
  assert.ok(state.publicEvents.some((event) => event.text === '18:00에 이전 영토전이 종료되어 영토가 초기화되고 새 회차가 시작되었습니다.'));
  const second = processTerritorySeason(state, new Date(KST_1800.getTime() + 1));
  assert.equal(second.changed, false);
  assert.equal(pets[0].stats.points, pointsBefore + 500);
});

test('18:01 점령은 22:30 새로고침·재접속·과거 알람 처리에도 유지된다', () => {
  const { state, pets } = players(1, KST_1801);
  state.territory = initialTerritory(KST_1801, 8);
  claimTerritory(state, pets[0], 1, 1, KST_1801);
  const before = structuredClone(state.territory.cells);
  assert.equal(processTerritorySeason(state, KST_2230).changed, false);
  assert.deepEqual(state.territory.cells, before);
  assert.equal(territoryView(state, pets[0].id).cells.find((cell) => cell.row === 1 && cell.col === 1).mine, true);
});

test('종료 전 seasonId 불일치와 비정상 endsAt은 영토를 보존하고 현재 한국시간 회차로 복구한다', () => {
  const { state, pets } = players(1, KST_1801);
  state.territory = initialTerritory(KST_1801, 9);
  claimTerritory(state, pets[0], 3, 3, KST_1801);
  state.territory.seasonId = 'wrong-season';
  const mismatch = normalizeTerritory(state.territory, state, KST_2230);
  assert.equal(mismatch.seasonId, gameDayKey(KST_2230));
  assert.equal(mismatch.endsAt, KST_2400.toISOString());
  assert.equal(Object.keys(mismatch.cells).length, 1);
  mismatch.endsAt = 'invalid';
  const recovered = normalizeTerritory(mismatch, state, KST_2230);
  assert.equal(recovered.endsAt, KST_2400.toISOString());
  assert.equal(Object.keys(recovered.cells).length, 1);
  assert.ok(recovered.recoveryLog.some((entry) => entry.reasons.includes('invalid-endsAt')));
});

test('고정 경계가 아닌 endsAt과 회차-종료시각 불일치는 22:30에도 맵을 지우지 않고 복구한다', () => {
  const { state, pets } = players(1, KST_1801);
  state.territory = initialTerritory(KST_1801, 10);
  claimTerritory(state, pets[0], 2, 4, KST_1801);
  state.territory.endsAt = '2026-08-11T13:00:00.000Z'; // 한국시간 22:00은 회차 경계가 아니다.
  const mismatchedSeason = processTerritorySeason(state, KST_2230);
  assert.equal(mismatchedSeason.changed, true);
  assert.equal(mismatchedSeason.reset, false);
  assert.equal(state.territory.endsAt, KST_2400.toISOString());
  assert.equal(Object.keys(state.territory.cells).length, 1);
  assert.ok(state.territory.recoveryLog.some((entry) => entry.reasons.includes('invalid-endsAt-boundary')));

  state.territory.seasonId = 'corrupt-season';
  state.territory.endsAt = KST_1800.toISOString();
  const invalidSeason = processTerritorySeason(state, KST_2230);
  assert.equal(invalidSeason.changed, true);
  assert.equal(invalidSeason.reset, false);
  assert.equal(state.territory.seasonId, gameDayKey(KST_2230));
  assert.equal(state.territory.endsAt, KST_2400.toISOString());
  assert.equal(Object.keys(state.territory.cells).length, 1);
  assert.ok(state.territory.recoveryLog.some((entry) => entry.reasons.includes('invalid-seasonId')));
});

test('저장소 재로딩·재배포에 해당하는 새 인스턴스에서도 현재 5×5 영토를 보존한다', async () => {
  const shared = new Map();
  const now = new Date();
  const state = stateWithUsers([['persist-user', '영토보존']], now);
  const pet = state.pets[state.users['persist-user'].currentPetId];
  state.territory = initialTerritory(now, 11);
  state.territory.cells['4:4'] = { ownerPetId: pet.id, claimedAt: now.toISOString(), home: true };
  const first = new DurableJsonStore(new MemoryStorage(shared));
  await first.save(state);
  const second = new DurableJsonStore(new MemoryStorage(shared));
  const loaded = await second.load();
  assert.equal(loaded.territory.size, 5);
  assert.equal(loaded.territory.cells['4:4'].ownerPetId, pet.id);
  assert.equal(loaded.territory.endsAt, state.territory.endsAt);
});

test('동시에 두 명이 같은 대기방에 참가해도 한 명만 확정되고 판돈은 정확히 한 번만 빠진다', async () => {
  const { room } = await createRoom();
  const hostToken = await register(room, '블럭방장');
  const guestOneToken = await register(room, '블럭손님1');
  const guestTwoToken = await register(room, '블럭손님2');
  const state = await room.store.load();
  for (const pet of Object.values(state.pets)) pet.stats.points = 1_000;
  await room.store.save(state);
  const created = await responseJson(await room.fetch(authRequest('/api/block-battle/rooms', hostToken, { method: 'POST', body: JSON.stringify({ stakePoints: 100 }) })));
  assert.equal(created.response.status, 201);
  const join = (token) => room.fetch(authRequest(`/api/block-battle/rooms/${created.data.roomId}/join`, token, { method: 'POST', body: '{}' }));
  const responses = await Promise.all([join(guestOneToken), join(guestTwoToken)]);
  const payloads = await Promise.all(responses.map(responseJson));
  assert.equal(payloads.filter((item) => item.data.ok).length, 1);
  const saved = await room.store.load();
  const battleRoom = saved.blockBattle.rooms[created.data.roomId];
  assert.equal(battleRoom.status, 'playing');
  assert.equal(Object.keys(battleRoom.players).length, 2);
  const balances = Object.values(saved.pets).map((pet) => pet.stats.points).sort((a, b) => a - b);
  assert.deepEqual(balances, [900, 900, 1000]);
});

test('블럭대전 API의 동시 동일 입력은 한 번만 반영되고 경량 실시간 상태도 재시작 뒤 복구된다', async () => {
  const { room, ctx, shared } = await createRoom();
  const hostToken = await register(room, '실시간방장');
  const guestToken = await register(room, '실시간손님');
  let state = await room.store.load();
  for (const pet of Object.values(state.pets)) pet.stats.points = 1_000;
  await room.store.save(state);
  const created = await responseJson(await room.fetch(authRequest('/api/block-battle/rooms', hostToken, { method: 'POST', body: JSON.stringify({ stakePoints: 100 }) })));
  await room.fetch(authRequest(`/api/block-battle/rooms/${created.data.roomId}/join`, guestToken, { method: 'POST', body: '{}' }));
  state = await room.store.load();
  const host = Object.values(state.users).find((user) => user.nickname === '실시간방장');
  const battleRoom = state.blockBattle.rooms[created.data.roomId];
  const body = { matchId: battleRoom.matchId, requestId: 'same-live-input-0001', actions: ['left'] };
  const input = () => room.fetch(authRequest(`/api/block-battle/rooms/${battleRoom.id}/input`, hostToken, { method: 'POST', body: JSON.stringify(body) }));
  const responses = await Promise.all([input(), input()]);
  const payloads = await Promise.all(responses.map(responseJson));
  assert.ok(payloads.every((item) => item.response.status === 200));
  assert.equal(payloads.filter((item) => item.data.duplicate).length, 1);

  const sent = [];
  const socket = { deserializeAttachment: () => ({ userId: host.id }), send: (value) => sent.push(JSON.parse(value)) };
  ctx.sockets.push(socket);
  const latest = await room.store.load();
  const latestRoom = latest.blockBattle.rooms[battleRoom.id];
  await room.webSocketMessage(socket, JSON.stringify({ type: 'block-battle-input', roomId: latestRoom.id, matchId: latestRoom.matchId, requestId: 'ws-live-input-0002', actions: ['right'] }));
  assert.ok(sent.some((message) => message.type === 'block-battle-state' && message.room.id === latestRoom.id));
  const expectedColumn = (await room.store.load()).blockBattle.rooms[latestRoom.id].players[host.currentPetId].active.col;
  const { room: reloadedRoom } = await createRoom(shared);
  const restored = await reloadedRoom.store.load();
  assert.equal(restored.blockBattle.rooms[latestRoom.id].players[host.currentPetId].active.col, expectedColumn);
  assert.ok(Object.values(restored.blockBattle.rooms[latestRoom.id].players).every((player) => player.connected === false));
});

test('영토전 화면은 한국시간 다음 초기화와 안내를 표시하고 단조 시계로 남은 시간을 계산한다', async () => {
  const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(source, /다음 초기화: \$\{territoryResetText\(territory\.endsAt\)\}/);
  assert.match(source, /영토전은 한국시간 00시·06시·12시·18시에 새 회차가 시작됩니다\. 점령 시각부터 6시간을 계산하는 방식이 아니며, 현재 영토는 표시된 다음 초기화 시각까지 유지됩니다\./);
  assert.match(source, /timeZone: 'Asia\/Seoul'/);
  assert.match(source, /monotonicNow\(\) - app\.bootstrapSyncedAt/);
});
