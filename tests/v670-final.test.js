import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { FLEX_ITEMS, SHOP_ITEMS } from '../src/game/constants.js';
import { ensurePetSchema, flexItemView, publicProfile, purchaseShopItem } from '../src/game/engine.js';
import { levelUpperBound } from '../src/game/progression.js';
import { selectAppleRectangle } from '../src/game/apple-game.js';
import { authRequest, createRoom, register, responseJson, stateWithUsers } from './helpers.js';

const FLEX_EXPECTED = Object.freeze({
  americano: 500, bouquet: 500, sunglasses: 500, pig: 700, dog: 700,
  headset: 500, champagne: 500, luxuryBag: 500, cat: 700, rabbit: 700,
  moneyBundle: 500, blackCard: 500, trophy: 500, panda: 700, diamond: 1500,
  goldBars: 500, ribbon: 500, teddyBear: 500, otter: 700, cherryBlossom: 1500,
  guitar: 500, skateboard: 500, soccerBall: 500, lion: 700, flameBadge: 1500,
  sword: 500, trident: 500, shield: 500, wolf: 700, demonWings: 1500,
  briefcase: 500, topHat: 500, goblet: 500, peacock: 700, goldenCrown: 1500,
  magicWand: 500, magicBook: 500, crystalBall: 500, babyDragon: 700, angelWings: 1500,
  crescentMoon: 500, starCharm: 500, planet: 500, unicorn: 700, galaxy: 1500,
  holySword: 500, royalThrone: 500, goldenTrophy: 500, goldenDragon: 700, legoKingCrown: 1500
});

async function api(room, token, path, body) {
  return responseJson(await room.fetch(authRequest(path, token, {
    method: 'POST',
    body: JSON.stringify(body)
  })));
}

test('플렉스 50종과 기존 상점 유지권의 최종 가격이 정확하다', () => {
  assert.deepEqual(Object.fromEntries(Object.entries(FLEX_ITEMS).map(([id, item]) => [id, item.price])), FLEX_EXPECTED);
  assert.ok(Object.values(FLEX_ITEMS).every((item) => item.durationHours === 24));
  assert.equal(SHOP_ITEMS.staminaHour.price, 500);
  assert.equal(SHOP_ITEMS.hungerHour.price, 700);
});

test('플렉스 구매는 24시간 장착·교체·멱등 구매 방지·만료 정리를 보장한다', () => {
  const now = new Date();
  const state = stateWithUsers([['flex-user', '플렉서']], now);
  const user = state.users['flex-user'];
  const pet = state.pets[user.currentPetId];
  pet.stats.points = 10_000;

  pet.stats.legoPower = levelUpperBound(34) + 1;
  const first = purchaseShopItem(state, user, pet, 'americano', {}, 'flex-buy-0001', now);
  assert.equal(first.ok, true);
  assert.equal(first.price, 500);
  assert.equal(pet.stats.points, 9_500);
  assert.equal(flexItemView(pet, now).id, 'americano');
  assert.equal(new Date(pet.flexItem.expiresAt).getTime() - now.getTime(), 24 * 60 * 60_000);

  const duplicate = purchaseShopItem(state, user, pet, 'americano', {}, 'flex-buy-0001', new Date(now.getTime() + 1000));
  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.duplicate, true);
  assert.equal(pet.stats.points, 9_500);

  const replaced = purchaseShopItem(state, user, pet, 'goldenCrown', {}, 'flex-buy-0002', new Date(now.getTime() + 2000));
  assert.equal(replaced.ok, true);
  assert.equal(pet.stats.points, 8_000);
  assert.equal(flexItemView(pet, new Date(now.getTime() + 2000)).id, 'goldenCrown');
  assert.equal(publicProfile(state, pet.id, pet.id).flexItem.id, 'goldenCrown');
  assert.ok(state.publicEvents.some((event) => event.type === 'flex-item'));

  ensurePetSchema(pet, new Date(now.getTime() + 24 * 60 * 60_000 + 3000));
  assert.equal(pet.flexItem, null);
  assert.equal(flexItemView(pet, new Date(now.getTime() + 24 * 60 * 60_000 + 3000)), null);
});

test('영토 요청은 재시도해도 한 번만 비용을 쓰고, 규칙상 거절은 HTTP 오류 대신 이유를 반환한다', async () => {
  const { room } = await createRoom();
  const token = await register(room, '영토재시도');
  const request = { row: 2, col: 2, requestId: 'territory-op-0001' };
  const first = await api(room, token, '/api/territory/claim', request);
  const retry = await api(room, token, '/api/territory/claim', request);
  assert.equal(first.response.status, 200);
  assert.equal(first.data.ok, true);
  assert.equal(retry.response.status, 200);
  assert.equal(retry.data.ok, true);
  assert.equal(retry.data.duplicate, true);

  const state = await room.store.load();
  const user = Object.values(state.users).find((entry) => entry.nickname === '영토재시도');
  assert.equal(state.pets[user.currentPetId].stats.hunger, 99);

  const denied = await api(room, token, '/api/territory/claim', { row: 2, col: 2, requestId: 'territory-op-0002' });
  assert.equal(denied.response.status, 200);
  assert.equal(denied.data.ok, false);
  assert.match(denied.data.message, /이미|ubcf8진|내 영토/);
});

test('다른 기기에서 사과판이 바뀐 후 느리게 도착한 선택은 현재 판을 훼손하지 않는다', () => {
  const now = new Date();
  const board = Array.from({ length: 10 }, () => Array(10).fill(1));
  board[0][1] = 9;
  const challenge = {
    expiresAt: new Date(now.getTime() + 60_000).toISOString(),
    appleBoard: board,
    applePendingPoints: 0,
    appleScore: 0,
    appleRemovedCount: 0,
    appleSuccesses: 0,
    appleBoardsGenerated: 2,
    appleAvailableMoves: 6,
    appleNewBoardAvailable: false,
    appleProcessedRequestIds: [],
    appleRefreshRequestIds: []
  };
  const result = selectAppleRectangle(challenge, {
    startRow: 0, startCol: 0, endRow: 0, endCol: 1, boardGeneration: 1
  }, 'apple-select-0001', now);
  assert.equal(result.ok, true);
  assert.equal(result.stale, true);
  assert.equal(result.removed, false);
  assert.equal(challenge.appleBoard[0][0], 1);
  assert.equal(challenge.appleBoard[0][1], 9);
  assert.equal(challenge.applePendingPoints, 0);
});

test('플렉스 SVG 50종과 모바일 미니게임 2×2 레이아웃이 배포 자산에 포함된다', async () => {
  const assetKeys = Object.values(FLEX_ITEMS).map((item) => item.assetKey);
  const svgs = await Promise.all(assetKeys.map((key) => readFile(new URL(`../public/flex/${key}.svg`, import.meta.url), 'utf8')));
  assert.ok(svgs.every((svg) => /<svg\b/.test(svg) && !/<script\b/i.test(svg)));
  const styles = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
  assert.match(styles, /@media \(max-width: 520px\)[\s\S]*?\.personal-game-wrap \.game-grid \{ grid-template-columns: repeat\(2,minmax\(0,1fr\)\) !important;/);
});
