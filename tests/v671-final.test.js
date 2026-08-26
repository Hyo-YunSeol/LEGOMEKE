import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DurableJsonStore } from '../src/durable-store.js';
import { privateDashboard, publicProfile } from '../src/game/engine.js';
import {
  clearEndedOmokRooms,
  createOmokRoom,
  joinOmokRoom,
  leaveOmokRoom
} from '../src/game/omok.js';
import { authRequest, createRoom, MemoryStorage, register, responseJson, stateWithUsers } from './helpers.js';

const BASE = new Date('2026-08-11T03:00:00.000Z');

function petsFor(state) {
  return Object.values(state.users).map((user) => state.pets[user.currentPetId]);
}


test('최신 저장 버전은 로드할 때 매번 불필요하게 다시 저장하지 않는다', async () => {
  const shared = new Map();
  const firstStorage = new MemoryStorage(shared);
  const firstStore = new DurableJsonStore(firstStorage);
  await firstStore.load();

  class CountingStorage extends MemoryStorage {
    constructor(map) {
      super(map);
      this.putCalls = 0;
    }
    async put(key, value) {
      this.putCalls += 1;
      return super.put(key, value);
    }
  }

  const secondStorage = new CountingStorage(shared);
  const secondStore = new DurableJsonStore(secondStorage);
  const loaded = await secondStore.load();
  assert.equal(loaded.meta.version, 27);
  assert.equal(secondStorage.putCalls, 0);
});


test('운영자 종료방 비우기는 정산된 종료방만 제거하고 진행·대기방과 승패 기록을 보존한다', () => {
  const state = stateWithUsers([
    ['o1', '오목1'], ['o2', '오목2'], ['o3', '오목3'], ['o4', '오목4'], ['o5', '오목5']
  ], BASE);
  const pets = petsFor(state);
  for (const pet of pets) pet.stats.points = 1_000;

  const ended = createOmokRoom(state, pets[0], 100, BASE);
  joinOmokRoom(state, pets[1], ended.roomId, BASE);
  leaveOmokRoom(state, pets[0], ended.roomId, BASE);
  assert.equal(state.omok.rooms[ended.roomId].status, 'ended');
  assert.equal(state.omok.rooms[ended.roomId].settled, true);

  const waiting = createOmokRoom(state, pets[2], 100, BASE);
  const playing = createOmokRoom(state, pets[3], 100, BASE);
  joinOmokRoom(state, pets[4], playing.roomId, BASE);
  const recordsBefore = pets.map((pet) => structuredClone(pet.records));
  const pointsBefore = pets.map((pet) => pet.stats.points);

  const cleared = clearEndedOmokRooms(state);
  assert.equal(cleared.ok, true);
  assert.equal(cleared.cleared, 1);
  assert.equal(state.omok.rooms[ended.roomId], undefined);
  assert.equal(state.omok.rooms[waiting.roomId].status, 'waiting');
  assert.equal(state.omok.rooms[playing.roomId].status, 'playing');
  assert.deepEqual(pets.map((pet) => pet.records), recordsBefore);
  assert.deepEqual(pets.map((pet) => pet.stats.points), pointsBefore);
  assert.equal(clearEndedOmokRooms(state).cleared, 0, '반복 실행도 안전해야 한다');
});

test('운영자 종료방 비우기 API는 권한을 확인하고 정산된 방만 제거한다', async () => {
  const created = await createRoom();
  const adminToken = await register(created.room, '오목운영자');
  await register(created.room, '오목상대');
  const state = await created.room.store.load();
  const adminUser = Object.values(state.users).find((user) => user.nickname === '오목운영자');
  const opponentUser = Object.values(state.users).find((user) => user.nickname === '오목상대');
  created.room.env.ADMIN_USER_IDS = adminUser.id;
  const adminPet = state.pets[adminUser.currentPetId];
  const opponentPet = state.pets[opponentUser.currentPetId];
  adminPet.stats.points = 1_000;
  opponentPet.stats.points = 1_000;
  const now = new Date();
  const ended = createOmokRoom(state, adminPet, 100, now);
  joinOmokRoom(state, opponentPet, ended.roomId, now);
  leaveOmokRoom(state, opponentPet, ended.roomId, now);
  await created.room.store.save(state);

  const cleared = await responseJson(await created.room.fetch(authRequest('/api/admin/omok/clear-ended', adminToken, {
    method: 'POST', body: JSON.stringify({})
  })));
  assert.equal(cleared.response.status, 200);
  assert.equal(cleared.data.cleared, 1);
  const saved = await created.room.store.load();
  assert.equal(saved.omok.rooms[ended.roomId], undefined);
  assert.equal(saved.pets[adminPet.id].records.omokWins, adminPet.records.omokWins);
  assert.equal(saved.pets[opponentPet.id].records.omokLosses, opponentPet.records.omokLosses);
});


test('프로필은 상호 커플 관계일 때 상대 이름과 D-day를 표시하고 솔로로 오인하지 않는다', () => {
  const state = stateWithUsers([['c1', '커플1'], ['c2', '커플2']], BASE);
  const [first, second] = petsFor(state);
  const startedAt = new Date(Date.now() - 2 * 24 * 60 * 60_000).toISOString();
  first.partnerPetId = second.id;
  second.partnerPetId = first.id;
  first.coupleStartedAt = startedAt;
  second.coupleStartedAt = startedAt;
  const profile = publicProfile(state, first.id, second.id);
  assert.equal(profile.partnerPetId, second.id);
  assert.equal(profile.partnerDisplayName, second.displayName);
  assert.match(profile.coupleLabel, new RegExp(`^${second.displayName}와 커플 D\\+\\d+$`));
  assert.notEqual(profile.coupleLabel, '솔로');
  const dashboard = privateDashboard(state, first.userId);
  assert.equal(dashboard.pet.partnerDisplayName, second.displayName);
  assert.equal(dashboard.pet.coupleLabel, profile.coupleLabel);
});

test('프런트 회귀 방어는 제거 기능 잔여 참조 없이 사과 모달·관리자 부분 새로고침을 유지한다', async () => {
  const [app, css, worker] = await Promise.all([
    readFile(new URL('../public/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/styles.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/worker.js', import.meta.url), 'utf8')
  ]);
  assert.doesNotMatch(app, /liar|nickname24h|temporaryNickname/i);
  assert.doesNotMatch(worker, /liar|nickname24h|temporaryNickname/i);
  assert.match(app, /function syncAppleGameLayout/);
  assert.match(app, /function refreshAdminMembers/);
  assert.match(app, /list\.innerHTML = adminMembersHtml/);
  assert.match(css, /body\.apple-game-open/);
  assert.match(css, /\.modal-root\.apple-modal-root \.modal/);
  assert.match(worker, /\/api\/admin\/omok\/clear-ended/);
});
