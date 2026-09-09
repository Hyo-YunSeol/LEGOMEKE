import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState } from '../src/durable-store.js';
import { purchaseShopItem, dailyMiniGameLimit, createPet } from '../src/game/engine.js';
import { BATTLE_PLAYS_PER_DAY, battleLimit } from '../src/game/battle-limit.js';
import { createOmokRoom, joinOmokRoom } from '../src/game/omok.js';
import { createBlockBattleRoom, joinBlockBattleRoom } from '../src/game/block-battle.js';
import { createSichuanRoom, joinSichuanRoom } from '../src/game/sichuan.js';

const BASE = new Date('2026-08-26T09:00:00.000Z');

function addUser(state, id, nickname) {
  const user = { id, nickname, generation: 1, currentPetId: null, sessionVersion: 1, notifications: [], createdAt: BASE.toISOString(), lastSeenAt: BASE.toISOString() };
  const pet = createPet(user, 1, BASE);
  user.currentPetId = pet.id;
  state.users[id] = user;
  state.pets[pet.id] = pet;
  return { user, pet };
}

function setup() {
  const state = initialState(BASE);
  const a = addUser(state, 'battle-a', '대전A');
  const b = addUser(state, 'battle-b', '대전B');
  a.pet.stats.points = 100_000;
  b.pet.stats.points = 100_000;
  return { state, a, b };
}

test('개인게임 +20회권은 4,000P이며 구매 제한 없이 누적된다', () => {
  const { state, a } = setup();
  const before = dailyMiniGameLimit(a.pet);
  const one = purchaseShopItem(state, a.user, a.pet, 'miniGame20', {}, 'mini20-a', BASE);
  const two = purchaseShopItem(state, a.user, a.pet, 'miniGame20', {}, 'mini20-b', BASE);
  assert.equal(one.ok, true);
  assert.equal(two.ok, true);
  assert.equal(one.price, 4_000);
  assert.equal(dailyMiniGameLimit(a.pet), before + 40);
});

test('대전은 기본 30회이고 +20회권 4,000P를 제한 없이 누적 구매한다', () => {
  const { state, a } = setup();
  assert.equal(BATTLE_PLAYS_PER_DAY, 30);
  assert.equal(battleLimit(a.pet), 30);
  const one = purchaseShopItem(state, a.user, a.pet, 'battle20', {}, 'battle20-a', BASE);
  const two = purchaseShopItem(state, a.user, a.pet, 'battle20', {}, 'battle20-b', BASE);
  assert.equal(one.ok, true);
  assert.equal(two.ok, true);
  assert.equal(one.price, 4_000);
  assert.equal(a.pet.daily.battleBonus, 40);
  assert.equal(battleLimit(a.pet), 70);
});

test('오목·테트리스·사천성 실제 시작은 같은 합산 대전 횟수를 각각 1회 사용한다', () => {
  const { state, a, b } = setup();

  const omok = createOmokRoom(state, a.pet, 100, BASE);
  assert.equal(omok.ok, true);
  assert.equal(joinOmokRoom(state, b.pet, omok.roomId, BASE).ok, true);

  const tetris = createBlockBattleRoom(state, a.pet, 100, BASE);
  assert.equal(tetris.ok, true);
  assert.equal(joinBlockBattleRoom(state, b.pet, tetris.roomId, BASE).ok, true);

  const sichuan = createSichuanRoom(state, a.pet, 100, BASE);
  assert.equal(sichuan.ok, true);
  assert.equal(joinSichuanRoom(state, b.pet, sichuan.roomId, BASE).ok, true);


  assert.equal(a.pet.daily.battlePlayed, 3);
  assert.equal(b.pet.daily.battlePlayed, 3);
});

test('합산 한도를 다 쓰면 세 대전 모두 방 생성부터 막고 포인트 횟수권 구매 후 다시 허용한다', () => {
  const { state, a } = setup();
  a.pet.daily.battlePlayed = 30;
  for (const create of [createOmokRoom, createBlockBattleRoom, createSichuanRoom]) {
    const denied = create(state, a.pet, 100, BASE);
    assert.equal(denied.ok, false);
    assert.match(denied.message, /횟수를 모두 사용/);
  }
  const ticket = purchaseShopItem(state, a.user, a.pet, 'battle20', {}, 'battle-unlock', BASE);
  assert.equal(ticket.ok, true);
  assert.equal(battleLimit(a.pet), 50);
  assert.equal(createOmokRoom(state, a.pet, 100, BASE).ok, true);
});
