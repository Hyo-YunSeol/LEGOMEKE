import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, register, authRequest, responseJson } from './helpers.js';

async function api(room, token, path, body = {}, method = 'POST') {
  return responseJson(await room.fetch(authRequest(path, token, {
    method,
    body: method === 'GET' || method === 'DELETE' ? undefined : JSON.stringify(body)
  })));
}

async function bootstrap(room, token) {
  const { response, data } = await responseJson(await room.fetch(authRequest('/api/bootstrap', token)));
  assert.equal(response.status, 200, JSON.stringify(data));
  assert.equal(data.ok, true);
  return data.bootstrap;
}

function viewRoom(bootstrapData, roomId) {
  return bootstrapData.legodoku.rooms.find((room) => room.id === roomId);
}

test('레고도쿠 Worker API는 생성→입장→플레이→관전 비공개→재시작 복구까지 실제 저장 경로로 동작한다', async () => {
  const first = await createRoom();
  const hostToken = await register(first.room, '레고API호스트');
  const guestToken = await register(first.room, '레고API게스트');
  const spectatorToken = await register(first.room, '레고API관전자');

  const initialHost = await bootstrap(first.room, hostToken);
  const initialGuest = await bootstrap(first.room, guestToken);
  const initialSpectator = await bootstrap(first.room, spectatorToken);
  const petIds = [initialHost.dashboard.pet.id, initialGuest.dashboard.pet.id, initialSpectator.dashboard.pet.id];

  const state = await first.room.store.load();
  for (const petId of petIds) state.pets[petId].stats.points = 5_000;
  await first.room.store.save(state);

  const created = await api(first.room, hostToken, '/api/legodoku/rooms', { stakePoints: 500 });
  assert.equal(created.response.status, 201, JSON.stringify(created.data));
  assert.equal(created.data.ok, true);
  const roomId = created.data.roomId;
  assert.ok(roomId);

  const joined = await api(first.room, guestToken, `/api/legodoku/rooms/${roomId}/join`);
  assert.equal(joined.response.status, 200, JSON.stringify(joined.data));
  assert.equal(joined.data.ok, true);

  const spectated = await api(first.room, spectatorToken, `/api/legodoku/rooms/${roomId}/spectate`);
  assert.equal(spectated.response.status, 200, JSON.stringify(spectated.data));
  assert.equal(spectated.data.ok, true);

  const internal = await first.room.store.load();
  const internalRoom = internal.legodoku.rooms[roomId];
  assert.equal(internalRoom.status, 'playing');
  const hostPetId = initialHost.dashboard.pet.id;
  const correct = internalRoom.puzzle.solution[0];
  const wrong = Array.from({ length: 64 }, (_, index) => index).find((index) => !internalRoom.puzzle.solution.includes(index));
  const matchId = internalRoom.matchId;

  const correctResult = await api(first.room, hostToken, `/api/legodoku/rooms/${roomId}/cell`, {
    matchId,
    index: correct,
    actionId: 'api-correct-1'
  });
  assert.equal(correctResult.response.status, 200, JSON.stringify(correctResult.data));
  assert.equal(correctResult.data.correct, true);

  // 같은 actionId를 동시에 여러 번 보내도 직렬화 + 서버 dedupe로 실수 1회만 반영되어야 한다.
  const duplicateWrong = await Promise.all(Array.from({ length: 8 }, () => api(first.room, hostToken, `/api/legodoku/rooms/${roomId}/cell`, {
    matchId,
    index: wrong,
    actionId: 'api-wrong-once'
  })));
  assert.ok(duplicateWrong.every(({ response }) => response.status === 200));

  const guestView = viewRoom(await bootstrap(first.room, guestToken), roomId);
  assert.equal(guestView.players[hostPetId].foundCount, 1);
  assert.equal(guestView.players[hostPetId].mistakes, 1);
  assert.deepEqual(guestView.players[hostPetId].confirmed, [], '상대에게 맞힌 위치가 노출되면 안 된다');
  assert.deepEqual(guestView.puzzle.solution, [], '경기 중 정답 전체가 노출되면 안 된다');

  const spectatorView = viewRoom(await bootstrap(first.room, spectatorToken), roomId);
  assert.equal(spectatorView.viewerRole, 'spectator');
  assert.equal(spectatorView.players[hostPetId].foundCount, 1);
  assert.equal(spectatorView.players[hostPetId].mistakes, 1);
  assert.deepEqual(spectatorView.players[hostPetId].confirmed, [], '관전자에게 플레이어 위치가 노출되면 안 된다');
  assert.deepEqual(spectatorView.puzzle.solution, [], '관전자에게 정답이 노출되면 안 된다');

  // Durable Object가 재시작된 것처럼 새 인스턴스를 같은 storage로 생성해 전용 실시간 snapshot 복구를 검증한다.
  const restarted = await createRoom(first.shared);
  const restoredGuestView = viewRoom(await bootstrap(restarted.room, guestToken), roomId);
  assert.equal(restoredGuestView.status, 'playing');
  assert.equal(restoredGuestView.players[hostPetId].foundCount, 1);
  assert.equal(restoredGuestView.players[hostPetId].mistakes, 1);
  assert.deepEqual(restoredGuestView.players[hostPetId].confirmed, []);
});
