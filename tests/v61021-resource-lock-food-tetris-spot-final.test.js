import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stateWithUsers } from './helpers.js';
import { FOODS } from '../src/game/constants.js';
import {
  createBung, eatAction, joinBung, startMiniGame, workAction
} from '../src/game/engine.js';
import { hungerActionLock, staminaActionLock } from '../src/game/activity.js';
import {
  SPOT_DIFFERENCE_ATLAS_VERSION, SPOT_DIFFERENCE_MATCH_SECONDS,
  spotDifferenceHitboxesForPuzzle
} from '../src/game/spot-difference.js';

const BASE = new Date('2026-09-01T03:00:00.000Z');
const tenMinutesAgo = (extraMs = 1) => new Date(BASE.getTime() - 10 * 60_000 - extraMs).toISOString();

test('체력 0은 10분 전까지 유예하고 10분을 넘기면 체력을 쓰는 활동만 잠그며 에너지드링크로 즉시 해제한다', () => {
  const state = stateWithUsers([['host','호스트'],['guest','게스트']], BASE);
  const [host, guest] = Object.values(state.pets);
  host.stats.points = 10_000;
  guest.stats.points = 10_000;
  guest.stats.hunger = 100;
  guest.stats.stamina = 0;
  guest.survival.staminaZeroAt = new Date(BASE.getTime() - 9 * 60_000 - 59_000).toISOString();
  assert.equal(staminaActionLock(guest, BASE).locked, false);

  guest.survival.staminaZeroAt = tenMinutesAgo();
  const blockedWork = workAction(guest, BASE);
  assert.equal(blockedWork.ok, false);
  assert.equal(blockedWork.resourceLock, 'stamina');
  assert.match(blockedWork.message, /체력.*10분|에너지드링크/);

  const created = createBung(state, host, { title:'체력 테스트 벙', stakePoints:500, requestId:'bung-lock-test-0001' }, BASE);
  assert.equal(created.ok, true);
  const blockedJoin = joinBung(state, guest, state.bungs[created.bung.id], BASE);
  assert.equal(blockedJoin.ok, false);
  assert.equal(blockedJoin.resourceLock, 'stamina');

  const drink = eatAction(guest, 'energyDrink', BASE);
  assert.equal(drink.ok, true);
  assert.equal(guest.stats.stamina, 50);
  assert.equal(guest.survival.staminaZeroAt, null);
  assert.equal(staminaActionLock(guest, BASE).locked, false);
  assert.equal(joinBung(state, guest, state.bungs[created.bung.id], BASE).ok, true);
});

test('포만감 0이 10분을 넘기면 포만감을 쓰는 게임을 막고 음식을 먹으면 즉시 해제한다', () => {
  const state = stateWithUsers([['hungry','배고픈레고']], BASE);
  const pet = Object.values(state.pets)[0];
  pet.stats.points = 10_000;
  pet.stats.stamina = 100;
  pet.stats.hunger = 0;
  pet.survival.hungerZeroAt = tenMinutesAgo();
  assert.equal(hungerActionLock(pet, BASE).locked, true);

  const blocked = startMiniGame(state, pet, 'block', BASE);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.resourceLock, 'hunger');
  assert.match(blocked.message, /배고파서/);

  const meal = eatAction(pet, 'triangle', BASE);
  assert.equal(meal.ok, true);
  assert.ok(pet.stats.hunger > 0);
  assert.equal(pet.survival.hungerZeroAt, null);
  assert.equal(hungerActionLock(pet, BASE).locked, false);
  assert.equal(startMiniGame(state, pet, 'block', BASE).ok, true);
});

test('음식점 데이터는 유지 음식 없이 2열 8단계 가격 대칭 + 체력 50 에너지드링크 사양이다', async () => {
  const foods = Object.values(FOODS);
  assert.equal(foods.some((food) => food.category === 'maintain'), false);
  for (let tier = 1; tier <= 8; tier += 1) {
    const gain = foods.find((food) => food.category === 'gain' && food.tier === tier);
    const diet = foods.find((food) => food.category === 'diet' && food.tier === tier);
    assert.ok(gain && diet);
    assert.equal(gain.price, diet.price);
  }
  assert.equal(FOODS.energyDrink.price, 300);
  assert.equal(FOODS.energyDrink.stamina, 50);
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
  assert.match(app, /<b>살찌는 음식<\/b><b>다이어트 음식<\/b>/);
  assert.doesNotMatch(app, /유지 음식/);
  assert.match(css, /food-tier-row \{ display: grid; grid-template-columns: repeat\(2,/);
});

test('1대1 Space는 예약 hardDrop이 없고 키 반복·합성 click을 차단한다', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /DeferredHardDrops|deferredHardDrops|drainBlockBattleDeferredHardDrop/);
  assert.match(app, /if \(awaitingLock && predictedLock && willLock\) return false;/);
  assert.match(app, /if \(event\.repeat\) return;/);
  assert.match(app, /blockBattleKeyboardSuppressClickUntil = Date\.now\(\) \+ 450/);
  assert.match(app, /event\?\.detail === 0 && Date\.now\(\) <= Number\(app\.blockBattleKeyboardSuppressClickUntil \|\| 0\)/);
});

test('틀린그림찾기 새 판은 실사 atlas v6·30초·18 후보로 고정한다', () => {
  assert.equal(SPOT_DIFFERENCE_ATLAS_VERSION, 6);
  assert.equal(SPOT_DIFFERENCE_MATCH_SECONDS, 30);
  const boxes = spotDifferenceHitboxesForPuzzle({ assetVersion:6, themeId:'body-guide', variant:0, seed:123 });
  assert.equal(boxes.length, 18);
  assert.ok(boxes.every((box) => box.r >= 0.048 && box.r <= 0.055001));
});
