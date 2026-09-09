import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { FLEX_ITEMS } from '../src/game/constants.js';
import {
  LEVEL_BADGE_TIERS,
  awardLegoPower,
  levelBadgeForLevel,
  levelForPower,
  levelUpperBound,
  levelUpRewardPoints,
  territoryLimitForLevel
} from '../src/game/progression.js';
import { createPet, flexItemView, purchaseShopItem, seasonBadgeView } from '../src/game/engine.js';
import { processGameRankingSeason } from '../src/game/ranking-season.js';
import { createRoom, stateWithUsers } from './helpers.js';

function petAtLevel(level, nickname = '레벨러') {
  const date = new Date('2026-08-15T08:00:00.000Z');
  const user = { id: `u-${level}`, nickname, generation: 1 };
  const pet = createPet(user, 1, date);
  pet.stats.legoPower = levelUpperBound(level);
  assert.equal(levelForPower(pet.stats.legoPower), level);
  return { user, pet, date };
}

test('레벨업은 일반 500P·5단위 1000P·Lv.50 3000P와 체력/배고픔 완전회복을 한 번만 지급한다', () => {
  assert.equal(levelUpRewardPoints(6), 500);
  assert.equal(levelUpRewardPoints(15), 1000);
  assert.equal(levelUpRewardPoints(50), 3000);

  for (const [level, expected] of [[5, 1000], [6, 500], [15, 1000], [50, 3000]]) {
    const { pet, date } = petAtLevel(level - 1, `L${level}`);
    pet.stats.points = 123;
    pet.stats.stamina = 7;
    pet.stats.hunger = 3;
    const result = awardLegoPower(pet, 1, 'test-level-up', date);
    assert.equal(result.leveledUp, true, `Lv.${level}`);
    assert.equal(result.newLevel, level, `Lv.${level}`);
    assert.equal(result.levelRewardPoints, expected, `Lv.${level}`);
    assert.equal(pet.stats.points, 123 + expected, `Lv.${level}`);
    assert.equal(pet.stats.stamina, 100, `Lv.${level}`);
    assert.equal(pet.stats.hunger, 100, `Lv.${level}`);
    assert.equal(pet.records.pointsEarned, expected, `Lv.${level}`);
  }
});

test('레벨 메달은 5단위로 승급하고 Lv.50 이후 레고왕을 유지한다', () => {
  assert.equal(LEVEL_BADGE_TIERS.length, 10);
  assert.equal(levelBadgeForLevel(4), null);
  assert.equal(levelBadgeForLevel(5)?.label, '브론즈');
  assert.equal(levelBadgeForLevel(10)?.label, '실버');
  assert.equal(levelBadgeForLevel(15)?.label, '골드');
  assert.equal(levelBadgeForLevel(20)?.label, '플래티넘');
  assert.equal(levelBadgeForLevel(25)?.label, '에메랄드');
  assert.equal(levelBadgeForLevel(30)?.label, '사파이어');
  assert.equal(levelBadgeForLevel(35)?.label, '루비');
  assert.equal(levelBadgeForLevel(40)?.label, '다이아');
  assert.equal(levelBadgeForLevel(45)?.label, '마스터');
  assert.equal(levelBadgeForLevel(50)?.label, '레고왕');
  assert.equal(levelBadgeForLevel(99)?.label, '레고왕');
});

test('영토 한도는 3레벨마다 +1칸이며 Lv.28부터 최대 10칸이다', () => {
  for (const [level, limit] of [[1, 1], [3, 1], [4, 2], [7, 3], [10, 4], [14, 5], [20, 7], [25, 9], [27, 9], [28, 10], [49, 10]]) {
    assert.equal(territoryLimitForLevel(level), limit);
  }
  assert.equal(territoryLimitForLevel(500), 10);
});

test('플렉스 상점은 Lv.5~50 매 5레벨마다 신규 판매 5종이며 구버전 상품은 판매목록에서 제외된다', () => {
  const items = Object.values(FLEX_ITEMS).filter((item) => !item.retired);
  assert.equal(items.length, 50);
  for (let level = 5; level <= 50; level += 5) {
    const group = items.filter((item) => item.requiredLevel === level).sort((a, b) => a.order - b.order);
    assert.equal(group.length, 5, `Lv.${level}`);
    assert.ok(group.every((item) => item.durationHours === 24));
    assert.ok(group.every((item) => item.price >= 400 && item.price <= 3500));
  }
  assert.ok(Object.values(FLEX_ITEMS).some((item) => item.retired));
});

test('플렉스 구매 레벨 제한은 서버가 강제하고 Lv.25 이름표 상품은 해금 뒤 정상 장착된다', () => {
  const now = new Date('2026-08-15T08:00:00.000Z');
  const state = stateWithUsers([['flex-lock', '잠금검증']], now);
  const user = state.users['flex-lock'];
  const pet = state.pets[user.currentPetId];
  pet.stats.legoPower = levelUpperBound(24);
  pet.stats.points = 5000;

  const blocked = purchaseShopItem(state, user, pet, 'flameBadge', {}, 'flex-level-lock-001', now);
  assert.equal(blocked.ok, false);
  assert.match(blocked.message, /Lv\.25/);
  assert.equal(pet.stats.points, 5000);

  pet.stats.legoPower = levelUpperBound(24) + 1;
  assert.equal(levelForPower(pet.stats.legoPower), 25);
  const bought = purchaseShopItem(state, user, pet, 'flameBadge', {}, 'flex-level-lock-002', now);
  assert.equal(bought.ok, true);
  assert.equal(bought.price, 1500);
  assert.equal(pet.stats.points, 3500);
  assert.equal(flexItemView(pet, now)?.nameplateKey, 'flame');
});

test('테트리스도 동일한 시즌 TOP3 보상과 왕 칭호를 받고 여러 종목 1위 보상은 모두 중복 지급된다', () => {
  const date = new Date('2026-08-15T08:00:00.000Z');
  const state = stateWithUsers([['rank-a', '통합왕'], ['rank-b', '2등']], date);
  state.gameRankingSeason = { key:'season-old', startsAt:'2026-08-08T15:00:00.000Z', endsAt:'2026-08-11T15:00:00.000Z', initializedAt:'2026-08-08T15:00:00.000Z', lastSettledAt:null };
  const a = state.pets[state.users['rank-a'].currentPetId];
  const b = state.pets[state.users['rank-b'].currentPetId];
  a.stats.points = 0; b.stats.points = 0;
  a.records.appleBestScore = 5000; b.records.appleBestScore = 3000;
  a.records.omokWins = 5; b.records.omokWins = 2;
  a.records.seasonBlockBattleWins = 7; a.records.seasonBlockBattleLosses = 1;
  b.records.seasonBlockBattleWins = 4; b.records.seasonBlockBattleLosses = 2;

  const result = processGameRankingSeason(state, date);
  assert.equal(result.changed, true);
  assert.equal(result.awards.blockBattle[0].petId, a.id);
  assert.equal(result.awards.blockBattle[0].prize, 1000);
  assert.equal(a.stats.points, 3000, '3개 종목 1위 1000P가 각각 누적되어야 한다');
  const labels = seasonBadgeView(a, date).map((item) => item.label);
  for (const label of ['🍎왕', '⚫오목왕', '🧱테트리스왕']) assert.ok(labels.includes(label), label);
});

test('저장 정리는 7일/500개·관리자 100개·알림 50개·종료 벙 50개·미응답 신청 7일을 적용한다', async () => {
  const { room } = await createRoom();
  const state = await room.store.load();
  const now = Date.now();
  const fresh = new Date(now - 60_000).toISOString();
  const old = new Date(now - 8 * 24 * 60 * 60_000).toISOString();
  state.users.u = { id:'u', nickname:'정리', generation:1, currentPetId:null, notifications:Array.from({ length:80 }, (_, i) => ({ id:`n${i}`, text:'알림', createdAt:fresh })) };
  for (let i = 0; i < 60; i += 1) state.bungs[`b${i}`] = { id:`b${i}`, status:'ended', createdAt:fresh, endedAt:new Date(now - i * 1000).toISOString(), attendees:{} };
  state.requests.oldPending = { id:'oldPending', type:'match', fromPetId:'a', toPetId:'b', status:'pending', createdAt:old };
  state.requests.freshPending = { id:'freshPending', type:'match', fromPetId:'a', toPetId:'b', status:'pending', createdAt:fresh };
  for (const key of ['shopOperations','foodOperations','bungOperations','territoryOperations']) {
    state[key] = {};
    for (let i = 0; i < 510; i += 1) state[key][`${key}-${i}`] = { id:`${key}-${i}`, createdAt:new Date(now - i * 1000).toISOString() };
    state[key][`${key}-old`] = { id:`${key}-old`, createdAt:old };
  }
  state.adminPointOperations = Object.fromEntries(Array.from({ length:110 }, (_, i) => [`ap-${i}`, { id:`ap-${i}`, createdAt:new Date(now - i * 1000).toISOString() }]));
  state.adminAuditLogs = Array.from({ length:120 }, (_, i) => ({ id:`audit-${i}`, createdAt:new Date(now - i * 1000).toISOString() }));

  await room.store.save(state);
  assert.equal(state.users.u.notifications.length, 50);
  assert.equal(Object.keys(state.bungs).length, 50);
  assert.equal(state.requests.oldPending, undefined);
  assert.ok(state.requests.freshPending);
  for (const key of ['shopOperations','foodOperations','bungOperations','territoryOperations']) assert.equal(Object.keys(state[key]).length, 500, key);
  assert.equal(Object.keys(state.adminPointOperations).length, 100);
  assert.equal(state.adminAuditLogs.length, 100);
});

test('플렉스 UI는 PC 5열·모바일 2열이며 레벨 메달/이름표는 무한 애니메이션 없이 정적으로 표시된다', async () => {
  const [app, css] = await Promise.all([
    readFile(new URL('../public/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/styles.css', import.meta.url), 'utf8')
  ]);
  assert.match(app, /Array\.from\(\{ length: 10 \}/);
  assert.match(app, /5레벨마다 새 장비 5종 해금 · 능력치 효과 없음 · 24시간 장착/);
  assert.match(app, /levelBadgeHtml/);
  assert.match(css, /\.flex-shop-grid \{ display:grid; grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(css, /@media \(max-width: 520px\)[\s\S]*?\.flex-shop-grid \{ grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /\.nameplate-king \.flex-display-name/);
  assert.match(css, /\.pet-visual \.flex-item-image[\s\S]*?animation: none;/);
});
