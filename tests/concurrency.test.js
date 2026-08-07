import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, register, authRequest, responseJson } from './helpers.js';

async function bootstrap(room, token) {
  const { response, data } = await responseJson(await room.fetch(authRequest('/api/bootstrap', token)));
  assert.equal(response.status, 200, JSON.stringify(data));
  return data.bootstrap;
}

async function api(room, token, path, body = {}, method = 'POST') {
  return responseJson(await room.fetch(authRequest(path, token, {
    method,
    body: method === 'GET' || method === 'DELETE' ? undefined : JSON.stringify(body)
  })));
}

test('동시 동일 닉네임 가입은 정확히 한 계정만 생성한다', async () => {
  const { room } = await createRoom();
  const request = () => room.fetch(new Request('https://game.test/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nickname: '동시가입', pin: '1234' })
  }));

  const responses = await Promise.all(Array.from({ length: 12 }, request));
  const statuses = responses.map((response) => response.status);
  assert.equal(statuses.filter((status) => status === 201).length, 1);
  assert.equal(statuses.filter((status) => status === 409).length, 11);

  const state = await room.store.load();
  assert.equal(Object.values(state.users).filter((user) => user.nickname === '동시가입').length, 1);
});

test('동시 생활 행동은 포인트와 행동 횟수를 한 번만 변경한다', async () => {
  const { room } = await createRoom();
  const token = await register(room, '행동동시');
  const results = await Promise.all(Array.from({ length: 10 }, () => api(room, token, '/api/actions/work')));
  assert.equal(results.filter((result) => result.response.status === 200).length, 1);
  assert.equal(results.filter((result) => result.response.status === 400).length, 9);
  const boot = await bootstrap(room, token);
  assert.equal(boot.dashboard.pet.stats.points, 500);
  assert.equal(boot.dashboard.pet.daily.actionsLeft, 4);
});

test('두 사용자가 같은 빈칸을 동시에 첫 본진으로 누르면 한 명만 성공하고 다른 요청은 안전하게 거부된다', async () => {
  const { room } = await createRoom();
  const tokenA = await register(room, '영토A');
  const tokenB = await register(room, '영토B');
  const results = await Promise.all([
    api(room, tokenA, '/api/territory/claim', { row: 2, col: 2 }),
    api(room, tokenB, '/api/territory/claim', { row: 2, col: 2 })
  ]);
  assert.equal(results.filter((result) => result.response.status === 200).length, 1);
  assert.equal(results.filter((result) => result.response.status === 400).length, 1);
  const bootA = await bootstrap(room, tokenA);
  const bootB = await bootstrap(room, tokenB);
  const cellA = bootA.territory.cells.find((cell) => cell.row === 2 && cell.col === 2);
  const cellB = bootB.territory.cells.find((cell) => cell.row === 2 && cell.col === 2);
  assert.ok(cellA.ownerPetId);
  assert.equal(cellA.ownerPetId, cellB.ownerPetId);
  assert.equal(cellA.home, true);
  assert.equal([bootA.territory.my.owned, bootB.territory.my.owned].sort((a, b) => a - b).join(','), '0,1');
});

test('완료된 낚시를 여러 기기에서 동시에 정산해도 한 번만 지급한다', async () => {
  const { room } = await createRoom();
  const token = await register(room, '낚시동시');
  const originalRandom = Math.random;
  try {
    Math.random = () => 0.999;
    assert.equal((await api(room, token, '/api/fishing/start')).response.status, 200);
  } finally {
    Math.random = originalRandom;
  }
  const state = await room.store.load();
  const petId = (await bootstrap(room, token)).dashboard.pet.id;
  state.pets[petId].daily.fishing.startedAt = new Date(Date.now() - 31_000).toISOString();
  state.pets[petId].daily.fishing.readyAt = new Date(Date.now() - 1_000).toISOString();
  await room.store.save(state);

  const results = await Promise.all(Array.from({ length: 10 }, () => api(room, token, '/api/fishing/claim')));
  assert.ok(results.filter((result) => result.response.status === 200).length <= 1);
  assert.ok(results.every((result) => [200, 400].includes(result.response.status)));
  const boot = await bootstrap(room, token);
  assert.equal(boot.dashboard.pet.stats.points, 500);
  assert.equal(boot.dashboard.pet.daily.fishing, null);
});

test('동시 매칭 수락은 한 번만 처리되고 양쪽 커플 상태가 일치한다', async () => {
  const { room } = await createRoom();
  const tokenA = await register(room, '매칭A');
  const tokenB = await register(room, '매칭B');
  const bootA = await bootstrap(room, tokenA);
  const bootB = await bootstrap(room, tokenB);
  await api(room, tokenA, '/api/social/action', { targetPetId: bootB.dashboard.pet.id, action: 'requestMatch' });
  const request = (await bootstrap(room, tokenB)).requests[0];
  const results = await Promise.all(Array.from({ length: 6 }, () => api(room, tokenB, '/api/social/action', {
    targetPetId: bootA.dashboard.pet.id,
    requestId: request.id,
    action: 'acceptMatch'
  })));
  assert.equal(results.filter((result) => result.response.status === 200).length, 1);
  assert.equal(results.filter((result) => result.response.status === 400).length, 5);
  const afterA = await bootstrap(room, tokenA);
  const afterB = await bootstrap(room, tokenB);
  assert.equal(afterA.dashboard.pet.partnerPetId, afterB.dashboard.pet.id);
  assert.equal(afterB.dashboard.pet.partnerPetId, afterA.dashboard.pet.id);
  assert.equal(afterA.dashboard.pet.coupleDay, afterB.dashboard.pet.coupleDay);
});

test('오류가 발생한 요청 뒤에도 직렬화 큐가 멈추지 않는다', async () => {
  const { room } = await createRoom();
  const bad = await room.fetch(new Request('https://game.test/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{broken-json'
  }));
  assert.equal(bad.status, 500);
  const token = await register(room, '큐복구');
  assert.ok(token);
});


test('같은 사용자의 홀짝 시작 요청이 동시에 겹쳐도 배팅액은 한 번만 차감된다', async () => {
  const { room } = await createRoom();
  const token = await register(room, '홀짝동시');
  const initial = await bootstrap(room, token);
  const state = await room.store.load();
  state.pets[initial.dashboard.pet.id].stats.points = 1000;
  await room.store.save(state);

  const results = await Promise.all(Array.from({ length: 10 }, () => api(room, token, '/api/minigames/start', {
    gameId: 'oddEven',
    stakePoints: 100
  })));
  assert.equal(results.filter((result) => result.response.status === 200).length, 1);
  assert.equal(results.filter((result) => result.response.status === 400).length, 9);
  const boot = await bootstrap(room, token);
  assert.equal(boot.dashboard.pet.stats.points, 900);
  assert.equal(boot.activeMiniChallenge.stake, 100);
});

test('사과게임 동일 선택 요청이 동시에 반복되어도 서버 예정 포인트와 최종 정산은 한 번만 반영된다', async () => {
  const { room } = await createRoom();
  const token = await register(room, '사과동시');
  let result = await api(room, token, '/api/minigames/start', { gameId: 'apple' });
  assert.equal(result.response.status, 200);
  const challengeId = result.data.bootstrap.activeMiniChallenge.id;
  const petId = result.data.bootstrap.dashboard.pet.id;

  let state = await room.store.load();
  const challenge = state.miniGameChallenges[challengeId];
  challenge.appleBoard = Array.from({ length: 10 }, () => Array(10).fill(null));
  challenge.appleBoard[0][0] = 1;
  challenge.appleBoard[0][1] = 9;
  challenge.appleBoard[9][9] = 5; // 보드를 비우지 않아 중복 요청 경로 자체를 검증한다.
  await room.store.save(state);

  const selections = await Promise.all(Array.from({ length: 12 }, () => api(room, token, '/api/minigames/apple/select', {
    challengeId,
    startRow: 0, startCol: 0, endRow: 0, endCol: 1,
    requestId: 'same-apple-request',
    reward: 999999,
    points: 999999
  })));
  assert.equal(selections.filter((entry) => entry.response.status === 200).length, 12);

  state = await room.store.load();
  assert.equal(state.miniGameChallenges[challengeId].applePendingPoints, 5);
  assert.equal(state.miniGameChallenges[challengeId].appleRemovedCount, 2);
  assert.equal(state.pets[petId].stats.points, 0);

  state.miniGameChallenges[challengeId].expiresAt = new Date(Date.now() - 1000).toISOString();
  await room.store.save(state);
  await Promise.all(Array.from({ length: 10 }, () => bootstrap(room, token)));
  const boot = await bootstrap(room, token);
  assert.equal(boot.dashboard.pet.stats.points, 5);
  assert.equal(boot.dashboard.pet.daily.miniGamesPlayed, 1);
  assert.equal(boot.dashboard.pet.records.miniGames, 1);
});

test('오목 동일 승리 착수가 동시에 반복되어도 판돈 정산과 승패 기록은 정확히 한 번만 반영된다', async () => {
  const { room } = await createRoom();
  const tokenA = await register(room, '오목동시A');
  const tokenB = await register(room, '오목동시B');
  const bootA = await bootstrap(room, tokenA);
  const bootB = await bootstrap(room, tokenB);

  let state = await room.store.load();
  state.pets[bootA.dashboard.pet.id].stats.points = 1000;
  state.pets[bootB.dashboard.pet.id].stats.points = 1000;
  await room.store.save(state);

  const created = await api(room, tokenA, '/api/omok/rooms', { stakePoints: 100 });
  assert.equal(created.response.status, 201);
  const roomId = created.data.roomId;
  const joined = await api(room, tokenB, `/api/omok/rooms/${roomId}/join`);
  assert.equal(joined.response.status, 200);

  state = await room.store.load();
  const omokRoom = state.omok.rooms[roomId];
  const blackPetId = omokRoom.blackPetId;
  const blackToken = blackPetId === bootA.dashboard.pet.id ? tokenA : tokenB;
  for (let col = 3; col <= 6; col += 1) omokRoom.board[7][col] = 'black';
  omokRoom.currentTurnPetId = blackPetId;
  omokRoom.turnStartedAt = new Date().toISOString();
  await room.store.save(state);

  const moves = await Promise.all(Array.from({ length: 12 }, () => api(room, blackToken, `/api/omok/rooms/${roomId}/move`, {
    row: 7, col: 7, requestId: 'same-omok-winning-request'
  })));
  assert.equal(moves.filter((entry) => entry.response.status === 200).length, 12);

  state = await room.store.load();
  const finished = state.omok.rooms[roomId];
  const winner = state.pets[blackPetId];
  const loserPetId = finished.hostPetId === blackPetId ? finished.guestPetId : finished.hostPetId;
  const loser = state.pets[loserPetId];
  assert.equal(finished.status, 'ended');
  assert.equal(finished.settled, true);
  assert.equal(winner.stats.points, 1100);
  assert.equal(loser.stats.points, 900);
  assert.equal(winner.records.omokWins, 1);
  assert.equal(loser.records.omokLosses, 1);
});

test('관리자 동일 포인트 지급 요청이 동시에 반복되어도 한 번만 반영된다', async () => {
  const shared = new Map();
  const first = await createRoom(shared);
  const adminToken = await register(first.room, '포인트관리자');
  const targetToken = await register(first.room, '포인트대상');
  const adminBoot = await bootstrap(first.room, adminToken);
  const targetPetId = (await bootstrap(first.room, targetToken)).dashboard.pet.id;

  const second = await createRoom(shared, { ADMIN_USER_IDS: adminBoot.admin.userId });
  const requests = await Promise.all(Array.from({ length: 12 }, () => api(second.room, adminToken, '/api/admin/points', {
    targetPetId,
    delta: 777,
    requestId: 'same-admin-point-request-0001'
  })));
  assert.equal(requests.filter((entry) => entry.response.status === 200).length, 12);
  assert.equal(requests.filter((entry) => entry.data.duplicate === true).length, 11);
  const boot = await bootstrap(second.room, targetToken);
  assert.equal(boot.dashboard.pet.stats.points, 777);
});
