import test from 'node:test';
import assert from 'node:assert/strict';
import { DurableJsonStore, initialState } from '../src/durable-store.js';
import { createPet } from '../src/game/engine.js';
import { ensureDailyProgress } from '../src/game/progression.js';
import { authRequest, createRoom, MemoryStorage, register, responseJson } from './helpers.js';

const BASE = new Date('2026-08-12T06:00:00.000Z');

function addUser(state, id, nickname) {
  const user = {
    id,
    nickname,
    generation: 1,
    currentPetId: null,
    sessionVersion: 1,
    workoutBadge: false,
    notifications: [],
    createdAt: BASE.toISOString(),
    lastSeenAt: BASE.toISOString()
  };
  const pet = createPet(user, 1, BASE);
  user.currentPetId = pet.id;
  state.users[user.id] = user;
  state.pets[pet.id] = pet;
  return { user, pet };
}

test('삭제된 라이어게임 저장 데이터는 1회 환불 후 제거되고 임시 닉네임도 영구 닉네임으로 복원된다', async () => {
  const legacy = initialState();
  legacy.meta.version = 24;
  const { user, pet } = addUser(legacy, 'legacy-removed-user', '영구닉');
  pet.stats.points = 850;
  pet.records.pointsSpent = 150;
  pet.displayName = '임시닉레고';
  user.temporaryNickname = {
    nickname: '임시닉',
    expiresAt: new Date(BASE.getTime() + 60_000).toISOString()
  };
  legacy.liarGame = {
    players: {
      [pet.id]: {
        petId: pet.id,
        forfeited: false,
        escrowRemaining: 100,
        currentRoundStake: 50
      }
    }
  };
  legacy.publicEvents.push({ id: 'old-liar-news', type: 'liar', text: '라이어게임 종료 소식', createdAt: BASE.toISOString() });
  user.notifications.push({ id: 'old-liar-notice', type: 'liar', text: '라이어게임 알림', read: false, createdAt: BASE.toISOString() });
  legacy.shopOperations['old-nickname-ticket'] = {
    id: 'old-nickname-ticket', userId: user.id, petId: pet.id, itemId: 'nickname24h',
    result: { ok: true }, createdAt: BASE.toISOString()
  };
  legacy.adminAuditLogs.push({
    id: 'old-liar-audit', action: 'liar_force_end', adminUserId: 'admin', adminDisplayName: '운영자',
    targetUserId: user.id, targetPetId: pet.id, targetDisplayName: pet.displayName,
    detail: '라이어게임 강제 종료', createdAt: BASE.toISOString()
  });

  const json = JSON.stringify(legacy);
  const shared = new Map([
    ['state-manifest', { chunks: 1, characters: json.length, updatedAt: BASE.toISOString() }],
    ['state-chunk-0', json]
  ]);
  const storage = new MemoryStorage(shared);
  const migrated = await new DurableJsonStore(storage).load();
  const migratedUser = migrated.users[user.id];
  const migratedPet = migrated.pets[pet.id];

  assert.equal(migrated.meta.version, 27);
  assert.equal('liarGame' in migrated, false);
  assert.equal('temporaryNickname' in migratedUser, false);
  assert.equal(migratedPet.displayName, '영구닉레고');
  assert.equal(migratedPet.stats.points, 1_000);
  assert.equal(migratedPet.records.pointsSpent, 0);
  assert.equal(migrated.publicEvents.some((event) => event?.type === 'liar'), false);
  assert.equal(migratedUser.notifications.some((item) => item?.type === 'liar'), false);
  assert.equal('old-nickname-ticket' in migrated.shopOperations, false);
  assert.equal(migrated.adminAuditLogs.some((entry) => String(entry?.action ?? '').startsWith('liar') || String(entry?.detail ?? '').includes('라이어게임')), false);

  // 마이그레이션 결과가 다시 저장된 뒤 재로드해도 환불이 중복되지 않아야 한다.
  const reloaded = await new DurableJsonStore(storage).load();
  assert.equal(reloaded.pets[pet.id].stats.points, 1_000);
  assert.equal(reloaded.pets[pet.id].records.pointsSpent, 0);
  assert.equal('liarGame' in reloaded, false);
});

test('삭제된 라이어게임 API와 운영자 강제종료 API는 더 이상 존재하지 않는다', async () => {
  const { room } = await createRoom();
  const token = await register(room, '삭제확인');

  for (const path of ['/api/liar/join', '/api/admin/liar/force-end']) {
    const { response, data } = await responseJson(await room.fetch(authRequest(path, token, {
      method: 'POST',
      body: '{}'
    })));
    assert.equal(response.status, 404, `${path}: ${JSON.stringify(data)}`);
    assert.equal(data.ok, false);
    assert.match(data.message, /API 경로를 찾을 수 없습니다/);
  }
});

test('bootstrap에는 라이어게임 상태와 닉변권이 다시 노출되지 않는다', async () => {
  const { room } = await createRoom();
  const token = await register(room, '노출확인');
  const { response, data } = await responseJson(await room.fetch(authRequest('/api/bootstrap', token)));

  assert.equal(response.status, 200, JSON.stringify(data));
  const bootstrap = data.bootstrap;
  assert.ok(bootstrap);
  assert.equal('liarGame' in bootstrap, false);
  assert.equal('liar' in (bootstrap.admin ?? {}), false);
  assert.equal((bootstrap.catalog?.shopItems ?? []).some((item) => item?.id === 'nickname24h'), false);
  assert.equal('temporaryNickname' in (bootstrap.dashboard?.user ?? {}), false);
});


test('기존 테트리스 일일목표 완료 기록은 새 내부 키로 승계되어 중복 보상을 만들지 않는다', () => {
  const state = initialState();
  const { pet } = addUser(state, 'legacy-tetris-goal', '목표승계');
  pet.daily.legoGoals = { liarPlay: true };
  ensureDailyProgress(pet, BASE);
  assert.equal(pet.daily.legoGoals.blockBattlePlay, true);
  assert.equal('liarPlay' in pet.daily.legoGoals, false);
});
