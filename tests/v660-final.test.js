import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { FOODS, SHOP_ITEMS } from '../src/game/constants.js';
import { DurableJsonStore, initialState } from '../src/durable-store.js';
import {
  applyDailyReset,
  createPet,
  dailyFishingLimit,
  dailyMiniGameLimit,
  eatAction,
  ensurePetSchema,
  exerciseAction,
  finishMiniGame,
  purchaseShopItem,
  settleExpiredMiniGames,
  startMiniGame,
  workAction
} from '../src/game/engine.js';
import { levelUpperBound } from '../src/game/progression.js';
import { authRequest, createRoom, MemoryStorage, register, responseJson } from './helpers.js';

const BASE = new Date('2026-08-11T00:00:00.000Z');

function addUser(state, id, nickname) {
  const user = { id, nickname, generation: 1, currentPetId: null, sessionVersion: 1, workoutBadge: false, notifications: [], createdAt: BASE.toISOString(), lastSeenAt: BASE.toISOString() };
  const pet = createPet(user, 1, BASE);
  user.currentPetId = pet.id;
  state.users[id] = user;
  state.pets[pet.id] = pet;
  return { user, pet };
}

test('v6.5.3 저장 데이터는 계정과 진행상황을 보존한 채 최신 버전으로 마이그레이션된다', async () => {
  const legacy = initialState();
  const { user, pet } = addUser(legacy, 'legacy-user', '기존회원');
  legacy.meta.version = 19;
  legacy.meta.revision = 77;
  pet.stats.points = 12_345;
  pet.stats.body = 165;
  pet.stats.legoPower = 432;
  pet.records.works = 23;
  const json = JSON.stringify(legacy);
  const shared = new Map([
    ['state-manifest', { chunks: 1, characters: json.length, updatedAt: BASE.toISOString() }],
    ['state-chunk-0', json]
  ]);
  const store = new DurableJsonStore(new MemoryStorage(shared));
  const migrated = await store.load();
  const migratedPet = migrated.pets[user.currentPetId];
  assert.equal(migrated.meta.version, 30);
  assert.equal(migrated.users[user.id].nickname, '기존회원');
  assert.equal(migratedPet.stats.points, 12_345);
  assert.equal(migratedPet.stats.body, 165);
  assert.equal(migratedPet.stats.legoPower, 432);
  assert.equal(migratedPet.records.works, 23);
  assert.deepEqual(migrated.shopOperations, {});
});

test('음식은 살찌는/다이어트 각 8단계이고 같은 단계 가격은 동일하며 유지 음식은 없다', () => {
  const foods = Object.values(FOODS);
  const regular = foods.filter((item) => item.category === 'gain' || item.category === 'diet');
  assert.equal(regular.length, 16);
  assert.equal(foods.filter((item) => item.category === 'maintain').length, 0);
  for (const category of ['gain', 'diet']) {
    const items = regular.filter((item) => item.category === category).sort((a, b) => a.tier - b.tier);
    assert.equal(items.length, 8);
    assert.deepEqual(items.map((item) => item.tier), [1,2,3,4,5,6,7,8]);
    for (let index = 1; index < items.length; index += 1) assert.ok(items[index].price > items[index - 1].price);
  }
  for (let tier = 1; tier <= 8; tier += 1) {
    const gain = regular.find((item) => item.category === 'gain' && item.tier === tier);
    const diet = regular.find((item) => item.category === 'diet' && item.tier === tier);
    assert.equal(gain.price, diet.price);
  }
  assert.equal(FOODS.energyDrink.category, 'energy');
  assert.equal(FOODS.energyDrink.stamina, 50);
});

test('다이어트 음식은 body를 실제로 낮추고 체형 단계와 결과 문구도 다시 계산한다', () => {
  const state = initialState();
  const { pet } = addUser(state, 'diet-user', '다이어터');
  pet.stats.points = 10_000;
  pet.stats.hunger = 0;
  pet.stats.body = 165;
  pet.stats.legoPower = levelUpperBound(4) + 1;
  const result = eatAction(pet, 'corn', BASE);
  assert.equal(result.ok, true);
  assert.equal(pet.stats.body, 155);
  assert.equal(result.bodyDelta, -10);
  assert.equal(result.bodyStage.key, 'fat');
  assert.match(result.message, /몸집 -10/);
  assert.doesNotMatch(result.message, /\+\-/);

});

test('최저 몸집의 헬스도 실제 변화량과 결과 문구가 일치한다', () => {
  const state = initialState();
  const { pet } = addUser(state, 'minimum-body-user', '최저몸집');
  pet.stats.body = 60;
  const result = exerciseAction(pet, BASE);
  assert.equal(result.ok, true);
  assert.equal(pet.stats.body, 60);
  assert.match(result.message, /몸집 변화 없음/);
});

test('횟수권은 현재 게임 하루 한도만 늘리고 동일 요청은 한 번만 차감·지급된다', () => {
  const state = initialState();
  const { user, pet } = addUser(state, 'boost-user', '횟수');
  pet.stats.points = 4_500;
  const first = purchaseShopItem(state, user, pet, 'miniGame20', {}, 'shop-mini-same-001', BASE);
  const duplicate = purchaseShopItem(state, user, pet, 'miniGame20', {}, 'shop-mini-same-001', BASE);
  const fishing = purchaseShopItem(state, user, pet, 'fishing5', {}, 'shop-fishing-0001', BASE);
  assert.equal(first.ok, true);
  assert.equal(duplicate.duplicate, true);
  assert.equal(fishing.ok, true);
  assert.equal(pet.stats.points, 0);
  assert.equal(dailyMiniGameLimit(pet), 60);
  assert.equal(dailyFishingLimit(pet), 25);

  applyDailyReset(pet, new Date(BASE.getTime() + 6 * 60 * 60_000));
  assert.equal(dailyMiniGameLimit(pet), 40);
  assert.equal(dailyFishingLimit(pet), 20);
});

test('복권은 100P·500P·500P 세 번 가능하고 당첨과 중복 요청을 안전하게 처리한다', () => {
  const state = initialState();
  const { user, pet } = addUser(state, 'lottery-user', '복권');
  pet.stats.points = 1_000;
  const miss = purchaseShopItem(state, user, pet, 'lottery', {}, 'lottery-first-001', BASE, () => 0);
  const jackpot = purchaseShopItem(state, user, pet, 'lottery', {}, 'lottery-second-01', new Date(BASE.getTime() + 1_000), () => 0.9999);
  const duplicate = purchaseShopItem(state, user, pet, 'lottery', {}, 'lottery-second-01', new Date(BASE.getTime() + 2_000), () => 0);
  const third = purchaseShopItem(state, user, pet, 'lottery', {}, 'lottery-third-001', new Date(BASE.getTime() + 3_000), () => 0.5);
  const fourth = purchaseShopItem(state, user, pet, 'lottery', {}, 'lottery-fourth-01', new Date(BASE.getTime() + 4_000), () => 0.5);
  assert.equal(miss.prize, 0);
  assert.equal(jackpot.prize, 5_000);
  assert.equal(duplicate.duplicate, true);
  assert.equal(third.ok, true);
  assert.equal(third.prize, 50);
  assert.equal(fourth.ok, false);
  assert.equal(pet.daily.lotteryPlays, 3);
  assert.equal(pet.stats.points, 4_950);
});

test('체력·배고픔 유지권은 1시간 동안 100을 유지하고 만료 후 기존 감소가 복귀한다', () => {
  const state = initialState();
  const { user, pet } = addUser(state, 'effect-user', '유지권');
  pet.stats.points = 2_000;
  pet.stats.stamina = 10;
  pet.stats.hunger = 10;
  assert.equal(purchaseShopItem(state, user, pet, 'staminaHour', {}, 'stamina-hour-001', BASE).ok, true);
  assert.equal(purchaseShopItem(state, user, pet, 'hungerHour', {}, 'hunger-hour-0001', BASE).ok, true);
  const protectedWork = workAction(pet, new Date(BASE.getTime() + 1_000));
  assert.equal(protectedWork.ok, true);
  assert.equal(pet.stats.stamina, 100);
  assert.equal(pet.stats.hunger, 100);

  const afterExpiry = new Date(BASE.getTime() + 60 * 60_000 + 2_000);
  ensurePetSchema(pet, afterExpiry);
  const normalWork = workAction(pet, afterExpiry);
  assert.equal(normalWork.ok, true);
  assert.equal(pet.stats.stamina, 85);
  assert.equal(pet.stats.hunger, 90);
});

test('닉네임 변경권은 상점과 구매 처리에서 제거됐다', () => {
  const state = initialState();
  const { user, pet } = addUser(state, 'nick-owner', '원래');
  pet.stats.points = 1_000;
  assert.equal(SHOP_ITEMS.nickname24h, undefined);
  const result = purchaseShopItem(state, user, pet, 'nickname24h', { nickname: '임시이름' }, 'nickname-owner-01', BASE);
  assert.equal(result.ok, false);
  assert.match(result.message, /선택할 수 없는 상점 상품/);
  assert.equal(pet.displayName, '원래레고');
});

test('삭제된 번개반응은 새 판 시작을 막고 구버전 진행판은 보상 없이 정리한다', () => {
  const state = initialState();
  const { pet } = addUser(state, 'reaction-user', '번개');
  const started = startMiniGame(state, pet, 'reaction', BASE);
  assert.equal(started.ok, false);
  assert.match(started.message, /선택할 수 없는 미니게임/);

  state.miniGameChallenges.legacyReaction = {
    id: 'legacyReaction', petId: pet.id, gameId: 'reaction', createdAt: BASE.toISOString(),
    expiresAt: new Date(BASE.getTime() + 60_000).toISOString(), completed: false, reward: 0
  };
  const changed = settleExpiredMiniGames(state, new Date(BASE.getTime() + 1000));
  assert.equal(changed.changed, true);
  assert.equal(state.miniGameChallenges.legacyReaction.completed, true);
  assert.equal(state.miniGameChallenges.legacyReaction.removedGame, true);
  assert.equal(state.miniGameChallenges.legacyReaction.reward, 0);
});

test('상점 구매 API도 동시 동일 요청을 한 번만 처리한다', async () => {
  const { room } = await createRoom();
  const token = await register(room, '상점동시');
  const state = await room.store.load();
  const user = Object.values(state.users).find((item) => item.nickname === '상점동시');
  state.pets[user.currentPetId].stats.points = 4_000;
  await room.store.save(state);
  const request = () => room.fetch(authRequest('/api/shop/purchase', token, { method: 'POST', body: JSON.stringify({ itemId: 'miniGame20', requestId: 'same-shop-api-0001' }) }));
  const responses = await Promise.all([request(), request()]);
  const payloads = await Promise.all(responses.map((response) => responseJson(response)));
  assert.ok(payloads.every(({ response }) => response.status === 200));
  const saved = await room.store.load();
  const pet = saved.pets[user.currentPetId];
  assert.equal(pet.stats.points, 0);
  assert.equal(pet.daily.miniGameBonus, 20);
});

test('상점 요청 ID는 새로고침·재접속에 해당하는 새 서버 인스턴스에서도 한 번만 처리된다', async () => {
  const shared = new Map();
  const first = await createRoom(shared);
  const token = await register(first.room, '상점재접속');
  let state = await first.room.store.load();
  const user = Object.values(state.users).find((item) => item.nickname === '상점재접속');
  state.pets[user.currentPetId].stats.points = 1_000;
  await first.room.store.save(state);
  const requestBody = { itemId: 'fishing5', requestId: 'reconnect-shop-0001' };
  const firstPurchase = await responseJson(await first.room.fetch(authRequest('/api/shop/purchase', token, { method: 'POST', body: JSON.stringify(requestBody) })));
  assert.equal(firstPurchase.response.status, 200);

  const second = await createRoom(shared);
  const retried = await responseJson(await second.room.fetch(authRequest('/api/shop/purchase', token, { method: 'POST', body: JSON.stringify(requestBody) })));
  assert.equal(retried.response.status, 200);
  assert.equal(retried.data.duplicate, true);
  state = await second.room.store.load();
  assert.equal(state.pets[user.currentPetId].stats.points, 500);
  assert.equal(state.pets[user.currentPetId].daily.fishingBonus, 5);
});

test('프런트는 사과 셀 캐시·부분 갱신, 접힌 주민목록, 분리 상점, 과거 레고 제거를 포함한다', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
  const worker = await readFile(new URL('../src/worker.js', import.meta.url), 'utf8');
  assert.match(app, /cells:\s*\[\.\.\.board\.children\]/);
  assert.match(app, /requestAnimationFrame\(\(\) => \{[\s\S]*?paintAppleSelection/);
  assert.doesNotMatch(app, /\$\$\('\.apple-cell'\)\.forEach/);
  assert.match(app, /function refreshAppleMiniOnly/);
  assert.match(app, /레고 주민목록 보기 ▼/);
  assert.match(app, /레고 주민목록 접기 ▲/);
  assert.match(app, /\/api\/shop\/purchase/);
  assert.doesNotMatch(app, /sectionHeading\('과거 레고'/);
  assert.doesNotMatch(app, /clientReactionMs/);
  assert.match(css, /\.food-column-heads,[\s\S]*?grid-template-columns:\s*repeat\(3/);
  assert.doesNotMatch(css, /\.shop[^\n{]*\{[^}]*animation:/);
  assert.doesNotMatch(css, /\.tab-pane\s*\{[^}]*contain:\s*layout/);
  assert.match(worker, /SHOP_ITEMS/);
  assert.doesNotMatch(worker, /history:\s*Object\.values\(state\.pets\)/);
  assert.equal(Object.keys(SHOP_ITEMS).length, 7);
});
