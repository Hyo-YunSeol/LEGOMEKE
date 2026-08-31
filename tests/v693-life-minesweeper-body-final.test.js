import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createPet, cookAction, applyHungerPenalty, nextHungerPenaltyAt, oddEvenPayout } from '../src/game/engine.js';
import { BODY_STAGES, HUNGER_PENALTY_POINTS_PER_HOUR, HUNGER_PENALTY_MAX_HOURS, ODD_EVEN_PAYOUT_PERCENT } from '../src/game/constants.js';
import { authRequest, createRoom, register, responseJson } from './helpers.js';

const BASE = new Date('2026-08-19T00:00:00.000Z');
const user = { id: 'u', nickname: '테스트', generation: 1, currentPetId: null, sessionVersion: 1, notifications: [], createdAt: BASE.toISOString(), lastSeenAt: BASE.toISOString() };

function petAt(date = BASE) {
  const pet = createPet(user, 1, date);
  pet.stats.points = 5000;
  return pet;
}

test('요리하기는 생활 행동 1회를 사용해 포만감을 최대 50 회복하고 체력 10을 사용하며 몸집은 바꾸지 않는다', () => {
  const pet = petAt();
  pet.stats.hunger = 30;
  pet.stats.body = 500;
  pet.stats.stamina = 77;
  const beforeActions = pet.daily.actionsLeft;
  const result = cookAction(pet, BASE);
  assert.equal(result.ok, true);
  assert.equal(pet.stats.hunger, 80);
  assert.equal(pet.stats.body, 500);
  assert.equal(pet.stats.stamina, 67);
  assert.equal(pet.daily.actionsLeft, beforeActions - 1);
  assert.equal(pet.records.cooks, 1);
  assert.match(result.message, /포만감 \+50/);
  assert.match(result.message, /체력 -10/);
});



test('체력이 10 미만이면 요리하기는 행동 횟수와 포만감을 소비하지 않는다', () => {
  const pet = petAt();
  pet.stats.hunger = 20;
  pet.stats.stamina = 9;
  const beforeActions = pet.daily.actionsLeft;
  const result = cookAction(pet, BASE);
  assert.equal(result.ok, false);
  assert.equal(pet.stats.hunger, 20);
  assert.equal(pet.stats.stamina, 9);
  assert.equal(pet.daily.actionsLeft, beforeActions);
  assert.match(result.message, /체력이 부족/);
});

test('포만감 100에서는 요리하기가 행동 횟수를 소비하지 않는다', () => {
  const pet = petAt();
  pet.stats.hunger = 100;
  const beforeActions = pet.daily.actionsLeft;
  const result = cookAction(pet, BASE);
  assert.equal(result.ok, false);
  assert.equal(pet.daily.actionsLeft, beforeActions);
});

test('굶주림은 시간당 50P이고 오프라인이어도 연속 최대 6시간 300P까지만 차감한다', () => {
  assert.equal(HUNGER_PENALTY_POINTS_PER_HOUR, 50);
  assert.equal(HUNGER_PENALTY_MAX_HOURS, 6);
  const pet = petAt();
  pet.stats.hunger = 0;
  pet.survival.hungerZeroAt = BASE.toISOString();
  pet.survival.hungerPenaltyHoursApplied = 0;
  const result = applyHungerPenalty(pet, new Date(BASE.getTime() + 72 * 3_600_000));
  assert.equal(result.hours, 6);
  assert.equal(result.pointsLost, 300);
  assert.equal(pet.stats.points, 4700);
  assert.equal(pet.survival.hungerPenaltyHoursApplied, 6);
  assert.equal(nextHungerPenaltyAt(pet), null);
});

test('포만감을 회복하면 굶주림 누적 시간이 초기화된다', () => {
  const pet = petAt();
  pet.stats.hunger = 0;
  pet.survival.hungerZeroAt = BASE.toISOString();
  pet.survival.hungerPenaltyHoursApplied = 4;
  cookAction(pet, new Date(BASE.getTime() + 4 * 3_600_000));
  assert.equal(pet.stats.hunger, 50);
  assert.equal(pet.survival.hungerZeroAt, null);
  assert.equal(pet.survival.hungerPenaltyHoursApplied, 0);
});

test('홀짝 배당은 1.5배·2.5배·4배다', () => {
  assert.deepEqual({ ...ODD_EVEN_PAYOUT_PERCENT }, { 1: 150, 2: 250, 3: 400 });
  assert.equal(oddEvenPayout(1000, 1), 1500);
  assert.equal(oddEvenPayout(1000, 2), 2500);
  assert.equal(oddEvenPayout(1000, 3), 4000);
});

test('해양편은 보존되고 레비아탄 뒤 신화편 12단계가 연속 범위로 확장된다', async () => {
  const marine = BODY_STAGES.slice(27, 34);
  assert.deepEqual(marine.map((s) => [s.min, Number.isFinite(s.max) ? s.max : null, s.label]), [
    [4520, 5099, '아르헨티노사우루스레고'],
    [5100, 5729, '대왕고래레고'],
    [5730, 6409, '초거대고래레고'],
    [6410, 7139, '심해괴수레고'],
    [7140, 7919, '크라켄레고'],
    [7920, 8749, '심해재난레고'],
    [8750, 9699, '레비아탄레고']
  ]);
  const myth = BODY_STAGES.slice(34);
  assert.deepEqual(myth.map((s) => [s.min, Number.isFinite(s.max) ? s.max : null, s.label]), [
    [9700, 10699, '베헤모스레고'], [10700, 11799, '펜리르레고'], [11800, 12999, '히드라레고'],
    [13000, 14299, '오로치레고'], [14300, 15699, '가루다레고'], [15700, 17199, '니드호그레고'],
    [17200, 18799, '요르문간드레고'], [18800, 20499, '아펩레고'], [20500, 22299, '아틀라스레고'],
    [22300, 24199, '수르트레고'], [24200, 26199, '티폰레고'], [26200, null, '신화재앙레고']
  ]);
  for (const stage of [...marine.slice(1), ...myth]) {
    const svg = await readFile(new URL(`../public/pets/${stage.assetKey}.svg`, import.meta.url), 'utf8');
    assert.match(svg, /<svg/);
    assert.match(svg, new RegExp(stage.label));
  }
});


test('요리하기 API와 구버전 exercise 경로 모두 새 요리하기 규칙으로 처리된다', async () => {
  const { room } = await createRoom();
  const token = await register(room, '요리테스트');
  let cookState = await room.store.load();
  const cookUser = Object.values(cookState.users).find((user) => user.nickname === '요리테스트');
  cookState.pets[cookUser.currentPetId].stats.hunger = 40;
  await room.store.save(cookState);
  let parsed = await responseJson(await room.fetch(authRequest('/api/actions/cook', token, { method: 'POST', body: '{}' })));
  assert.equal(parsed.response.status, 200, JSON.stringify(parsed.data));
  assert.match(parsed.data.message, /요리해서 먹었습니다/);

  const { room: legacyRoom } = await createRoom();
  const legacyToken = await register(legacyRoom, '구버전요리');
  cookState = await legacyRoom.store.load();
  const legacyUser = Object.values(cookState.users).find((user) => user.nickname === '구버전요리');
  cookState.pets[legacyUser.currentPetId].stats.hunger = 40;
  await legacyRoom.store.save(cookState);
  parsed = await responseJson(await legacyRoom.fetch(authRequest('/api/actions/exercise', legacyToken, { method: 'POST', body: '{}' })));
  assert.equal(parsed.response.status, 200, JSON.stringify(parsed.data));
  assert.match(parsed.data.message, /요리해서 먹었습니다/);
});

test('지뢰찾기 클라이언트 큐는 공개되지 않는 challenge.board를 검사하지 않는다', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const start = app.indexOf('async function drainMinesweeperActionQueue');
  const end = app.indexOf('async function abandonMinesweeperExplicit', start);
  const source = app.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(source, /challenge\.board/);
  assert.match(source, /minesweeperActionQueue\.shift\(\)/);
  assert.match(app, /MINESWEEPER_LONG_PRESS_MS = 400/);
  assert.doesNotMatch(app, /navigator\.vibrate/);
});

test('화면 문구는 포만감으로 통일되고 헬스 대신 요리하기를 노출한다', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /<strong>요리하기<\/strong><small>포만감 \+50 · 체력 -10/);
  assert.match(app, /포만감이 0인 상태가 1시간 지속될 때마다 50P 감소 · 최대 6시간/);
  assert.doesNotMatch(app, /data-action="exercise"/);
  assert.doesNotMatch(app, /bar\('배고픔'/);
});
