import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initialState } from '../src/durable-store.js';
import { createPet, purchaseShopItem } from '../src/game/engine.js';
import { battleLimit } from '../src/game/battle-limit.js';

const BASE = new Date('2026-08-31T07:00:00.000Z');

function setupUser() {
  const state = initialState(BASE);
  const user = { id: 'ticket-user', nickname: '리필테스트', generation: 1, currentPetId: null, sessionVersion: 1, notifications: [], createdAt: BASE.toISOString(), lastSeenAt: BASE.toISOString() };
  const pet = createPet(user, 1, BASE);
  user.currentPetId = pet.id;
  state.users[user.id] = user;
  state.pets[pet.id] = pet;
  pet.stats.points = 100_000;
  return { state, user, pet };
}

test('대전 +20회권은 서로 다른 요청 ID로 세 번 연속 구매하면 매번 6,000P와 +20회가 정확히 누적된다', () => {
  const { state, user, pet } = setupUser();
  const beforePoints = pet.stats.points;
  for (let index = 1; index <= 3; index += 1) {
    const result = purchaseShopItem(state, user, pet, 'battle20', {}, `battle-repeat-${index}`, BASE);
    assert.equal(result.ok, true);
    assert.equal(result.price, 6_000);
    assert.equal(pet.daily.battleBonus, index * 20);
    assert.equal(battleLimit(pet), 30 + index * 20);
  }
  assert.equal(pet.stats.points, beforePoints - 18_000);
});

test('같은 대전권 요청 ID를 재전송하면 중복결제 없이 첫 결과만 돌려준다', () => {
  const { state, user, pet } = setupUser();
  const first = purchaseShopItem(state, user, pet, 'battle20', {}, 'battle-retry-same-id', BASE);
  const retry = purchaseShopItem(state, user, pet, 'battle20', {}, 'battle-retry-same-id', BASE);
  assert.equal(first.ok, true);
  assert.equal(retry.ok, true);
  assert.equal(retry.duplicate, true);
  assert.equal(pet.daily.battleBonus, 20);
  assert.equal(pet.stats.points, 94_000);
});

test('상점 반복구매 클라이언트는 서버 응답 확정과 UI 렌더 실패를 분리하고 busy 클릭에서 ID를 만들지 않는다', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /return performIdempotent\('\/api\/shop\/purchase',[\s\S]*`shop:\$\{itemId\}`/);
  const performStart = app.indexOf('async function perform(');
  const performEnd = app.indexOf('function operationRequestId', performStart);
  const perform = app.slice(performStart, performEnd);
  assert.match(perform, /result = await api\(/);
  assert.match(perform, /UI refresh after confirmed request failed/);
  assert.match(perform, /return result;[\s\S]*finally/);
  const idempotentStart = app.indexOf('async function performIdempotent');
  const idempotentEnd = app.indexOf('const BODY_STAGE_FALLBACK', idempotentStart);
  const idempotent = app.slice(idempotentStart, idempotentEnd);
  assert.match(idempotent, /if \(app\.busy\)[\s\S]*return null;[\s\S]*operationRequestId\(safeKey\)/);
  assert.match(idempotent, /if \(result\) app\.pendingOperationIds\.delete\(safeKey\)/);
});

test('1대1 테트리스는 첫 lock ACK 전 두 번째 hardDrop을 버리지 않고 예약한 뒤 ACK 직후 실행한다', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /blockBattleDeferredHardDrops: 0/);
  assert.match(app, /BLOCK_BATTLE_MAX_DEFERRED_HARD_DROPS = 8/);
  assert.match(app, /if \(awaitingLock && predictedLock && willLock\) \{[\s\S]*if \(action === 'hardDrop'\)[\s\S]*blockBattleDeferredHardDrops[\s\S]*return true;/);
  assert.match(app, /function drainBlockBattleDeferredHardDrop\(room = currentBlockBattleRoom\(\)\)/);
  assert.match(app, /drainBlockBattleDeferredHardDrop\(room\);/);
  assert.match(app, /app\.blockBattleDeferredHardDrops = 0;[\s\S]*stopBlockBattleHold\(\);/);
});

test('Space 키는 event.key뿐 아니라 event.code=Space도 hardDrop으로 인식한다', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /function tetrisKeyboardAction\(event\)/);
  assert.match(app, /Space:'hardDrop'/);
  assert.match(app, /const action = tetrisKeyboardAction\(event\);/);
});
