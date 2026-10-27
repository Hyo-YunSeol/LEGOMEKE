import test from 'node:test';
import assert from 'node:assert/strict';
import { createYutRoom } from '../src/game/yutnori.js';
import { createRoom, register, stateWithUsers, authRequest } from './helpers.js';

const date = new Date('2026-10-28T00:00:00.000Z');
function fixture() {
  const state = stateWithUsers([['creator', '윷만드는사람'], ['other', '상대선수']], date);
  const [creator, other] = Object.values(state.pets);
  return { state, creator, other };
}

for (const key of ['blockBattle', 'sichuan', 'legodoku']) {
  test(`${key} 대기방(players: {})이 있더라도 다른 사람은 윷놀이 방 생성 가능`, () => {
    const { state, creator, other } = fixture();
    state[key] = { rooms: { 'other-room': { id: 'other-room', status: 'waiting', hostPetId: other.id, players: {}, spectators: {} } } };
    const result = createYutRoom(state, creator, { mode: 'solo', seats: 2 }, date);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.ok(state.yut.rooms[result.roomId]);
  });
  test(`${key} 플레이어 객체맵의 petId 키를 인식하여 중복 참가를 막음`, () => {
    const { state, creator, other } = fixture();
    state[key] = { rooms: { 'active-room': { status: 'playing', players: { [creator.id]: { connected: true } }, hostPetId: other.id } } };
    const result = createYutRoom(state, creator, { mode: 'solo', seats: 2 }, date);
    assert.equal(result.ok, false);
    assert.match(result.message, /이미 참가 중/);
    assert.equal(Object.keys(state.yut.rooms).length, 0);
  });
}

test('오목은 host/guest 식별자로, 루미큐브는 players 배열로 중복 참가 차단', () => {
  for (const [key, playerField] of [
    ['omok', (p) => ({ hostPetId: p.id, guestPetId: null })],
    ['rummikub', (p) => ({ players: [{ petId: p.id, ready: true }] })]
  ]) {
    const { state, creator } = fixture();
    state[key] = { rooms: { match: { status: 'waiting', ...playerField(creator) } } };
    const result = createYutRoom(state, creator, { mode: 'solo', seats: 2 }, date);
    assert.equal(result.ok, false, key);
    assert.match(result.message, /이미 참가 중/);
  }
});

test('종료된 방, 기타 사용자와 빈 방은 윷놀이 생성을 가로막지 않음', () => {
  const { state, creator, other } = fixture();
  state.blockBattle = { rooms: {
    ended: { status: 'ended', players: { [creator.id]: { petId: creator.id } }, hostPetId: creator.id },
    empty: { status: 'waiting', players: {} },
    other: { status: 'playing', players: { [other.id]: { petId: other.id } }, hostPetId: other.id }
  } };
  state.sichuan = { rooms: { idle: { status: 'waiting', players: null } } };
  state.legodoku = { rooms: { older: { status: 'waiting', players: 0 } } };
  state.rummikub = { rooms: { other: { status: 'waiting', players: [other.id] } } };
  assert.equal(createYutRoom(state, creator, { mode: 'solo', seats: 2 }, date).ok, true);
});

test('HTTP: 실제 테트리스 대전 대기방 존재 시 다른 사용자의 윷놀이 API가 201 생성 성공', async () => {
  const { room } = await createRoom();
  const userA = await register(room, '기존테트대기');
  const userB = await register(room, '새윷방생성');
  const stored = await room.store.load();
  for (const pet of Object.values(stored.pets)) pet.stats.points = 1000;
  await room.store.save(stored);
  const post = (path, token, data) => room.fetch(authRequest(path, token, { method: 'POST', body: JSON.stringify(data) }));
  const existing = await post('/api/block-battle/rooms', userA, { stakePoints: 100 });
  const existingData = await existing.json();
  assert.equal(existing.status, 201, existingData.message);
  const response = await post('/api/yut/rooms', userB, { mode: 'solo', seats: 2 });
  const result = await response.json();
  assert.equal(response.status, 201, result.message);
  assert.equal(result.ok, true);
  assert.ok(result.roomId);
  const state = await room.store.load();
  assert.ok(state.blockBattle.rooms[existingData.roomId]);
  assert.ok(state.yut.rooms[result.roomId]);
  // 기존 다른 게임 유저는 이미 참가 중인 방이 있으므로 윷놀이 방을 추가로 열 수 없습니다.
  const blocked = await post('/api/yut/rooms', userA, { mode: 'solo', seats: 2 });
  assert.equal(blocked.status, 400);
  assert.match((await blocked.json()).message, /이미 참가 중/);
});
