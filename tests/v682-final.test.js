import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  BLOCK_BATTLE_BATCH_HISTORY,
  createBlockBattleRoom,
  joinBlockBattleRoom,
  leaveBlockBattleRoom,
  playBlockBattleActions
} from '../src/game/block-battle.js';
import { claimTerritory, initialTerritory, normalizeTerritory } from '../src/game/territory.js';
import { authRequest, createRoom, register, responseJson, stateWithUsers } from './helpers.js';

const NOW = new Date('2026-08-12T00:10:00.000Z');

function localBattle() {
  const state = stateWithUsers([['host', '장시간방장'], ['guest', '장시간손님']], NOW);
  const host = state.pets[state.users.host.currentPetId];
  const guest = state.pets[state.users.guest.currentPetId];
  host.stats.points = 1_000;
  guest.stats.points = 1_000;
  const created = createBlockBattleRoom(state, host, 100, NOW);
  assert.equal(joinBlockBattleRoom(state, guest, created.roomId, NOW).ok, true);
  return { state, host, guest, room: state.blockBattle.rooms[created.roomId] };
}

test('장시간 테트리스 입력 기록은 고정 상한을 넘지 않고 무효 입력도 상태 버전을 부풀리지 않는다', () => {
  const { state, host, room } = localBattle();
  for (let index = 0; index < 320; index += 1) {
    const action = index % 2 ? 'right' : 'left';
    const result = playBlockBattleActions(state, host, room.id, {
      matchId: room.matchId,
      requestId: `long-battle-${String(index).padStart(4, '0')}`,
      actions: [action]
    }, new Date(NOW.getTime() + index));
    assert.equal(result.ok, true);
  }
  assert.equal(room.processedBatchIds.length, BLOCK_BATTLE_BATCH_HISTORY);

  for (let index = 0; index < 12; index += 1) {
    playBlockBattleActions(state, host, room.id, {
      matchId: room.matchId,
      requestId: `wall-limit-${String(index).padStart(3, '0')}`,
      actions: ['left']
    }, NOW);
  }
  const versionAtWall = room.stateVersion;
  const noChange = playBlockBattleActions(state, host, room.id, {
    matchId: room.matchId,
    requestId: 'wall-no-change-0001',
    actions: ['left']
  }, NOW);
  assert.equal(noChange.ok, true);
  assert.equal(noChange.changed, false);
  assert.equal(room.stateVersion, versionAtWall);
  assert.equal(room.lastProcessedBatchByPet[host.id], 'wall-no-change-0001', '무효 입력도 ACK는 남겨 재전송을 끝내야 한다');
});

test('게임 종료 뒤 도착한 테트리스 입력은 오류가 아니라 안전한 폐기로 응답하고 정산을 반복하지 않는다', () => {
  const { state, host, guest, room } = localBattle();
  assert.equal(leaveBlockBattleRoom(state, guest, room.id, new Date(NOW.getTime() + 1_000)).ok, true);
  const pointsAfterSettlement = host.stats.points;
  const settlementId = room.settlementId;
  const late = playBlockBattleActions(state, host, room.id, {
    matchId: room.matchId,
    requestId: 'late-after-end-0001',
    actions: ['left', 'tick']
  }, new Date(NOW.getTime() + 2_000));
  assert.equal(late.ok, false);
  assert.equal(late.discarded, true);
  assert.equal(late.terminal, true);
  assert.equal(host.stats.points, pointsAfterSettlement);
  assert.equal(room.settlementId, settlementId);
});

test('WebSocket·HTTP 재전송 테트리스 입력은 전체 게임 시간 순회와 알람 재등록을 매번 실행하지 않는다', async () => {
  const { room, ctx } = await createRoom();
  const hostToken = await register(room, '경량방장');
  const guestToken = await register(room, '경량손님');
  let state = await room.store.load();
  for (const pet of Object.values(state.pets)) pet.stats.points = 1_000;
  await room.store.save(state);
  const created = await responseJson(await room.fetch(authRequest('/api/block-battle/rooms', hostToken, {
    method: 'POST', body: JSON.stringify({ stakePoints: 100 })
  })));
  await room.fetch(authRequest(`/api/block-battle/rooms/${created.data.roomId}/join`, guestToken, { method: 'POST', body: '{}' }));
  state = await room.store.load();
  const hostUser = Object.values(state.users).find((user) => user.nickname === '경량방장');
  const battle = state.blockBattle.rooms[created.data.roomId];
  let globalTimeScans = 0;
  let alarmWrites = 0;
  const originalProcessTimeState = room.processTimeState.bind(room);
  const originalScheduleNextAlarm = room.scheduleNextAlarm.bind(room);
  room.processTimeState = async (...args) => { globalTimeScans += 1; return originalProcessTimeState(...args); };
  room.scheduleNextAlarm = async (...args) => { alarmWrites += 1; return originalScheduleNextAlarm(...args); };
  const sent = [];
  const socket = { deserializeAttachment: () => ({ userId: hostUser.id }), send: (value) => sent.push(JSON.parse(value)) };
  ctx.sockets.push(socket);
  await room.webSocketMessage(socket, JSON.stringify({
    type: 'block-battle-input', roomId: battle.id, matchId: battle.matchId,
    requestId: 'fast-path-input-0001', actions: ['left']
  }));
  assert.equal(globalTimeScans, 0);
  assert.equal(alarmWrites, 0);
  assert.ok(sent.some((message) => message.type === 'block-battle-state'));

  const fallback = await responseJson(await room.fetch(authRequest(`/api/block-battle/rooms/${battle.id}/input`, hostToken, {
    method: 'POST',
    body: JSON.stringify({ matchId: battle.matchId, requestId: 'fast-path-input-0002', actions: ['right'] })
  })));
  assert.equal(fallback.response.status, 200);
  assert.equal(fallback.data.ok, true);
  assert.equal(globalTimeScans, 0);
  assert.equal(alarmWrites, 0);
});

test('본진은 전면전에서도 항상 보호되고 0칸 참가자는 일반 영토로만 재진입한다', () => {
  const names = [['territory-owner', '영토주인'], ['territory-helper', '영토보조'], ['territory-new', '영토신규']];
  const state = stateWithUsers(names, NOW);
  const pets = names.map(([userId]) => state.pets[state.users[userId].currentPetId]);
  const [owner, helper, newcomer] = pets;
  newcomer.stats.points = 100;
  state.territory = initialTerritory(NOW);
  for (let index = 0; index < 25; index += 1) {
    const holder = index === 24 ? helper : owner;
    state.territory.cells[`${Math.floor(index / 5)}:${index % 5}`] = {
      ownerPetId: holder.id,
      claimedAt: new Date(NOW.getTime() + index).toISOString(),
      home: index === 0 || index === 24
    };
  }
  state.territory = normalizeTerritory(state.territory, state, NOW);
  assert.equal(state.territory.battleUnlocked, true);

  const homeAttempt = claimTerritory(state, newcomer, 0, 0, new Date(NOW.getTime() + 100));
  assert.equal(homeAttempt.ok, false);
  assert.match(homeAttempt.message, /본진.*보호/);
  assert.equal(state.territory.cells['0:0'].ownerPetId, owner.id);
  assert.equal(newcomer.stats.points, 100);

  const entered = claimTerritory(state, newcomer, 0, 1, new Date(NOW.getTime() + 200));
  assert.equal(entered.ok, true);
  assert.equal(entered.stolenFromPetId, owner.id);
  assert.equal(state.territory.cells['0:1'].ownerPetId, newcomer.id);
  assert.equal(state.territory.cells['0:1'].home, true);
  assert.equal(newcomer.stats.points, 50);
  assert.equal(state.territory.cells['0:0'].ownerPetId, owner.id);
  assert.equal(state.territory.cells['0:0'].home, true);
});

test('포화 영토의 같은 건물을 동시에 노려도 오래된 화면의 뒤 요청은 새 소유자까지 연쇄 탈취하지 않는다', async () => {
  const { room } = await createRoom();
  const ownerToken = await register(room, '포화소유자');
  const helperToken = await register(room, '포화보조');
  const firstToken = await register(room, '포화공격1');
  const secondToken = await register(room, '포화공격2');
  const state = await room.store.load();
  const users = Object.fromEntries(Object.values(state.users).map((user) => [user.nickname, user]));
  const owner = state.pets[users['포화소유자'].currentPetId];
  const helper = state.pets[users['포화보조'].currentPetId];
  const first = state.pets[users['포화공격1'].currentPetId];
  const second = state.pets[users['포화공격2'].currentPetId];
  first.stats.points = 100;
  second.stats.points = 100;
  state.territory = initialTerritory(new Date());
  for (let index = 0; index < 25; index += 1) {
    const pet = index === 24 ? helper : owner;
    state.territory.cells[`${Math.floor(index / 5)}:${index % 5}`] = {
      ownerPetId: pet.id,
      claimedAt: new Date(Date.now() + index).toISOString(),
      home: index === 0 || index === 24
    };
  }
  state.territory = normalizeTerritory(state.territory, state, new Date());
  await room.store.save(state);
  const body = (requestId) => ({
    row: 0, col: 1, requestId, seasonId: state.territory.seasonId, expectedOwnerPetId: owner.id
  });
  const attack = (token, requestId) => room.fetch(authRequest('/api/territory/claim', token, {
    method: 'POST', body: JSON.stringify(body(requestId))
  })).then(responseJson);
  const results = await Promise.all([
    attack(firstToken, 'full-map-attack-0001'),
    attack(secondToken, 'full-map-attack-0002')
  ]);
  assert.equal(results.filter((item) => item.data.ok).length, 1);
  assert.equal(results.filter((item) => item.data.stale).length, 1);
  const saved = await room.store.load();
  const balances = [saved.pets[first.id].stats.points, saved.pets[second.id].stats.points].sort((a, b) => a - b);
  assert.deepEqual(balances, [50, 100]);
  assert.ok([first.id, second.id].includes(saved.territory.cells['0:1'].ownerPetId));
});

test('후반 성능·종료 정리·영토 포화 재진입 코드가 배포 소스에 연결되어 있다', async () => {
  const [app, worker] = await Promise.all([
    readFile(new URL('../public/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/worker.js', import.meta.url), 'utf8')
  ]);
  assert.match(app, /tickPending/);
  assert.match(app, /scheduleBlockBattleDomUpdate/);
  assert.match(app, /expectedBlockBattleDiscard/);
  assert.match(worker, /실시간 조작은 전체 회원/);
  assert.match(app, /본진은 전면전 여부와 관계없이 항상 보호/);
  assert.match(app, /expectedOwnerPetId/);
});
