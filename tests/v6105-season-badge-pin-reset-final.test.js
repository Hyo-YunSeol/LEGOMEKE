import test from 'node:test';
import assert from 'node:assert/strict';
import { createPet, seasonBadgeView } from '../src/game/engine.js';
import { DurableJsonStore, initialState } from '../src/durable-store.js';
import { processGameRankingSeason } from '../src/game/ranking-season.js';
import { gameRankingSeasonWindow } from '../src/lib/time.js';
import { MemoryStorage, authRequest, createRoom, register, responseJson, stateWithUsers } from './helpers.js';

const BASE = new Date('2026-08-26T08:00:00.000Z');

async function bootstrap(room, token) {
  return responseJson(await room.fetch(authRequest('/api/bootstrap', token)));
}

test('싱글 테트리스 칭호 명칭과 사천성왕 칭호가 노출된다', () => {
  const state = stateWithUsers([['u1', '칭호']], BASE);
  const pet = Object.values(state.pets)[0];
  const expiresAt = new Date(BASE.getTime() + 60 * 60_000).toISOString();
  pet.seasonBadges.singleTetris = expiresAt;
  pet.seasonBadges.sichuan = expiresAt;

  const badges = seasonBadgeView(pet, BASE);
  assert.equal(badges.find((badge) => badge.key === 'singleTetris')?.label, '🧱싱글테트리스왕');
  assert.equal(badges.find((badge) => badge.key === 'sichuan')?.label, '🀄사천성왕');
});

test('사천성 시즌 종료 시 1위에게 다음 시즌 종료까지 사천성왕을 자동 부여한다', () => {
  const state = stateWithUsers([['u1', '우승자'], ['u2', '준우승']], BASE);
  const [winner, runnerUp] = Object.values(state.pets);
  winner.records.seasonSichuanWins = 5;
  winner.records.seasonSichuanLosses = 1;
  runnerUp.records.seasonSichuanWins = 4;
  runnerUp.records.seasonSichuanLosses = 0;
  state.gameRankingSeason = {
    key: 'season-previous',
    startsAt: new Date(BASE.getTime() - 6 * 24 * 60 * 60_000).toISOString(),
    endsAt: new Date(BASE.getTime() - 3 * 24 * 60 * 60_000).toISOString(),
    initializedAt: new Date(BASE.getTime() - 6 * 24 * 60 * 60_000).toISOString(),
    lastSettledAt: null
  };

  const result = processGameRankingSeason(state, BASE);
  assert.equal(result.changed, true);
  assert.equal(result.awards.sichuan[0]?.petId, winner.id);
  assert.equal(winner.seasonBadges.sichuan, gameRankingSeasonWindow(BASE).endsAt);
  assert.equal(runnerUp.seasonBadges.sichuan, null);
});

test('이미 배포된 v27의 잘못된 다매 사천성왕을 레알다매레고로 한 번만 정정하고 v29로 올린다', async () => {
  const storage = new MemoryStorage();
  const writer = new DurableJsonStore(storage);
  const state = initialState();
  state.meta.version = 27;

  const wrongUser = {
    id: 'damae-user', nickname: '다매', generation: 1, currentPetId: null, sessionVersion: 1,
    notifications: [], createdAt: BASE.toISOString(), lastSeenAt: BASE.toISOString()
  };
  const wrongPet = createPet(wrongUser, 1, BASE);
  wrongUser.currentPetId = wrongPet.id;
  wrongPet.seasonBadges.sichuan = state.gameRankingSeason.endsAt;
  state.users[wrongUser.id] = wrongUser;
  state.pets[wrongPet.id] = wrongPet;

  const targetUser = {
    id: 'real-damae-user', nickname: '레알다매', generation: 1, currentPetId: null, sessionVersion: 1,
    notifications: [], createdAt: BASE.toISOString(), lastSeenAt: BASE.toISOString()
  };
  const targetPet = createPet(targetUser, 1, BASE);
  targetUser.currentPetId = targetPet.id;
  assert.equal(targetPet.displayName, '레알다매레고');
  state.users[targetUser.id] = targetUser;
  state.pets[targetPet.id] = targetPet;
  await writer.save(state, { forceBackup: true });

  const firstLoad = await new DurableJsonStore(storage).load();
  const correctedWrong = firstLoad.pets[firstLoad.users['damae-user'].currentPetId];
  const correctedTarget = firstLoad.pets[firstLoad.users['real-damae-user'].currentPetId];
  assert.equal(firstLoad.meta.version, 29);
  assert.equal(correctedWrong.seasonBadges.sichuan, null);
  assert.equal(correctedWrong.kingHistory.sichuan, false);
  assert.equal(correctedTarget.seasonBadges.sichuan, firstLoad.gameRankingSeason.endsAt);
  assert.equal(correctedTarget.kingHistory.sichuan, true);

  correctedTarget.seasonBadges.sichuan = null;
  await new DurableJsonStore(storage).save(firstLoad, { forceBackup: true });
  const secondLoad = await new DurableJsonStore(storage).load();
  assert.equal(secondLoad.meta.version, 29);
  assert.equal(secondLoad.pets[secondLoad.users['real-damae-user'].currentPetId].seasonBadges.sichuan, null, '기존 정정은 다시 실행되면 안 된다');
});

test('운영자 PIN 변경은 새 PIN을 저장하고 기존 토큰과 기존 PIN을 무효화한다', async () => {
  const shared = new Map();
  const first = await createRoom(shared);
  const adminToken = await register(first.room, '핀관리자', '1234');
  const targetToken = await register(first.room, '핀대상', '1234');
  const initial = await first.room.store.load();
  const adminUser = Object.values(initial.users).find((user) => user.nickname === '핀관리자');
  const targetUser = Object.values(initial.users).find((user) => user.nickname === '핀대상');
  assert.ok(adminUser && targetUser);

  const second = await createRoom(shared, { ADMIN_USER_IDS: adminUser.id });
  const changed = await responseJson(await second.room.fetch(authRequest('/api/admin/pin-reset', adminToken, {
    method: 'POST',
    body: JSON.stringify({ targetUserId: targetUser.id, pin: '9876' })
  })));
  assert.equal(changed.response.status, 200, JSON.stringify(changed.data));
  assert.match(changed.data.message, /PIN을 변경/);

  const oldToken = await bootstrap(second.room, targetToken);
  assert.equal(oldToken.response.status, 401);

  const oldPinLogin = await responseJson(await second.room.fetch(new Request('https://game.test/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nickname: '핀대상', pin: '1234' })
  })));
  assert.equal(oldPinLogin.response.status, 401);

  const newPinLogin = await responseJson(await second.room.fetch(new Request('https://game.test/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nickname: '핀대상', pin: '9876' })
  })));
  assert.equal(newPinLogin.response.status, 200, JSON.stringify(newPinLogin.data));
  assert.ok(newPinLogin.data.token);

  const finalState = await second.room.store.load();
  assert.equal(finalState.adminAuditLogs[0]?.action, 'pin_reset');
});
