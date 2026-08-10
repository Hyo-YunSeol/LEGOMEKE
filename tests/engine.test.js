import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIONS_PER_DAY,
  BODY_STAGES,
  BREAK_WARNING_MAX,
  BREAK_INACTIVITY_HOURS,
  FISHING_REWARDS,
  MINI_GAMES_PER_DAY,
  STATUS_MESSAGE_MAX_LENGTH
} from '../src/game/constants.js';
import {
  addNotification,
  applyDailyReset,
  applyInactivityConsequence,
  applyHungerPenalty,
  createBung,
  createPet,
  eatAction,
  endLifeAndRestart,
  markPetBroken,
  markPetActive,
  restartBrokenPet,
  ensurePetSchema,
  exerciseAction,
  finishBung,
  finishMiniGame,
  getBodyStage,
  joinBung,
  oddEvenPayout,
  levelRanking,
  pointRanking,
  pokePet,
  pokeRanking,
  privateDashboard,
  publicProfile,
  rankingsView,
  restAction,
  socialAction,
  startBung,
  startFishing,
  startMiniGame,
  settleFishing,
  stopMiniGame,
  updateStatusMessage,
  workAction
} from '../src/game/engine.js';
import {
  completeDailyGoal,
  incrementGoalCounter,
  levelForPower,
  levelProgress,
  levelRequirement,
  territoryLimitForLevel
} from '../src/game/progression.js';
import { coupleDayCount, gameDayKey, nextGameDayAt } from '../src/lib/time.js';
import { stateWithUsers } from './helpers.js';

function current(state, userId = 'u1') {
  return state.pets[state.users[userId].currentPetId];
}

test('몸집 단계는 돼룩돼룩 이후 긴 돼지 구간을 거쳐 마지막 6단계만 공룡으로 이어진다', () => {
  const cases = [
    [0,'마름레고'],[60,'마름레고'],[70,'보통레고'],[129,'돼지레고'],[130,'코끼리레고'],[160,'맘모스레고'],
    [200,'돼룩돼룩레고'],[240,'왕돼룩레고'],[300,'대왕돼룩레고'],[380,'초돼룩레고'],[480,'왕꿀꿀레고'],
    [600,'폭돼레고'],[740,'돼왕레고'],[900,'돼황레고'],[1080,'괴수돼지레고'],[1280,'과적돼지레고'],
    [1500,'침대파괴돼지레고'],[1750,'재난문자돼지레고'],[2030,'국가비상돼지레고'],
    [2340,'프로토케라톱스레고'],[2690,'트리케라톱스레고'],[3080,'스테고사우루스레고'],
    [3510,'브라키오사우루스레고'],[3990,'파타고티탄레고'],[4520,'아르헨티노사우루스레고'],[999999,'아르헨티노사우루스레고']
  ];
  for (const [body, label] of cases) assert.equal(getBodyStage(body).label, label);
  assert.equal(BODY_STAGES.length, 28);
  for (let index = 1; index < BODY_STAGES.length; index += 1) {
    assert.equal(BODY_STAGES[index].min, BODY_STAGES[index - 1].max + 1, `몸집 단계 ${index + 1} 시작값은 이전 단계 다음 값이어야 한다`);
  }
});

test('게임 하루는 한국시간 00·06·12·18시 고정 경계로 6시간씩 바뀐다', () => {
  const cases = [
    ['2026-08-05T14:59:59.000Z', '2026-08-05@3', '2026-08-05T15:00:00.000Z'], // KST 23:59:59 -> 00:00
    ['2026-08-05T15:00:00.000Z', '2026-08-06@0', '2026-08-05T21:00:00.000Z'], // KST 00:00 -> 06:00
    ['2026-08-05T20:59:59.000Z', '2026-08-06@0', '2026-08-05T21:00:00.000Z'],
    ['2026-08-05T21:00:00.000Z', '2026-08-06@1', '2026-08-06T03:00:00.000Z'], // KST 06:00 -> 12:00
    ['2026-08-06T03:00:00.000Z', '2026-08-06@2', '2026-08-06T09:00:00.000Z'], // KST 12:00 -> 18:00
    ['2026-08-06T09:00:00.000Z', '2026-08-06@3', '2026-08-06T15:00:00.000Z']  // KST 18:00 -> 00:00
  ];
  for (const [iso, key, next] of cases) {
    const date = new Date(iso);
    assert.equal(gameDayKey(date), key);
    assert.equal(nextGameDayAt(date), next);
  }
});

test('개인게임은 한 게임 하루에 전체 합산 40회까지만 완료할 수 있다', () => {
  const state = stateWithUsers([['u1','윤설']]);
  const pet = current(state);
  const base = new Date('2026-08-06T00:00:00.000Z');
  assert.equal(MINI_GAMES_PER_DAY, 40);
  pet.daily.miniGamesPlayed = 39;

  const started = startMiniGame(state, pet, 'reaction', base);
  assert.equal(started.ok, true);
  state.miniGameChallenges[started.challenge.id].readyAt = base.getTime();
  const finished = finishMiniGame(state, pet, started.challenge.id, 1, new Date(base.getTime() + 200));
  assert.equal(finished.ok, true);
  assert.equal(pet.daily.miniGamesPlayed, 40);

  const blocked = startMiniGame(state, pet, 'number', new Date(base.getTime() + 1_000));
  assert.equal(blocked.ok, false);
  assert.match(blocked.message, /횟수를 모두 사용/);
});

test('레고력 레벨 곡선은 1~10, 11~22, 23~36으로 완만하게 증가한다', () => {
  assert.equal(levelRequirement(1), 10);
  assert.equal(levelRequirement(2), 12);
  assert.equal(levelRequirement(3), 14);
  assert.equal(levelForPower(1), 1);
  assert.equal(levelForPower(10), 1);
  assert.equal(levelForPower(11), 2);
  assert.equal(levelForPower(22), 2);
  assert.equal(levelForPower(23), 3);
  assert.deepEqual(levelProgress(23), { level: 3, totalPower: 23, current: 1, needed: 14, nextAt: 37 });
});

test('5×5 영토전 최대치는 Lv1 1칸, Lv2 2칸, Lv3 3칸, Lv4 이상 4칸이다', () => {
  assert.deepEqual([1,2,3,4,5,6,7,8,20].map(territoryLimitForLevel), [1,2,3,4,4,4,4,4,4]);
});

test('상태메시지는 공백을 정리해 20자까지 저장하고 21자부터 서버 로직에서 거부한다', () => {
  const state = stateWithUsers([['u1','윤설']]);
  const pet = current(state);
  assert.equal(STATUS_MESSAGE_MAX_LENGTH, 20);
  assert.equal(pet.statusMessage, '');
  let result = updateStatusMessage(pet, '  오늘도   레고 키우는 중  ');
  assert.equal(result.ok, true);
  assert.equal(pet.statusMessage, '오늘도 레고 키우는 중');
  result = updateStatusMessage(pet, '12345678901234567890');
  assert.equal(result.ok, true);
  assert.equal([...pet.statusMessage].length, 20);
  result = updateStatusMessage(pet, '123456789012345678901');
  assert.equal(result.ok, false);
  assert.equal([...pet.statusMessage].length, 20);
});

test('뉴레고는 포인트 0, 레고력 1, 레벨 1, 체력·배고픔 100으로 시작한다', () => {
  const state = stateWithUsers([['u1','윤설']]);
  const pet = current(state);
  assert.equal(pet.stats.points, 0);
  assert.equal(pet.stats.legoPower, 1);
  assert.equal(levelForPower(pet.stats.legoPower), 1);
  assert.equal(pet.stats.stamina, 100);
  assert.equal(pet.stats.hunger, 100);
  assert.equal(pet.stats.body, 70);
  for (const deleted of ['money','debt','mood','charm','reputation']) assert.equal(deleted in pet.stats, false);
});

test('구버전 돈·매력도·배고픔 데이터를 포인트·레고력·새 배고픔 방향으로 안전하게 변환한다', () => {
  const user = { id: 'old', nickname: '구형', generation: 1 };
  const pet = createPet(user);
  pet.schemaVersion = 5;
  pet.stats = { money: 123400, charm: 21, hunger: 80, stamina: 70, body: 95, debt: 10000, mood: 40 };
  pet.records = { charmEarned: 9, earned: 20000, spent: 5000 };
  ensurePetSchema(pet);
  assert.equal(pet.stats.points, 1234);
  assert.equal(pet.stats.legoPower, 21);
  assert.equal(pet.stats.hunger, 20);
  assert.equal('money' in pet.stats, false);
  assert.equal('debt' in pet.stats, false);
  assert.equal('charm' in pet.stats, false);
});

test('일하기는 500P를 벌고 체력 15·배고픔 10·행동 1회를 사용한다', () => {
  const state = stateWithUsers([['u1','윤설']]);
  const pet = current(state);
  const result = workAction(pet, new Date('2026-08-06T00:00:00Z'));
  assert.equal(result.ok, true);
  assert.equal(pet.stats.points, 500);
  assert.equal(pet.stats.stamina, 85);
  assert.equal(pet.stats.hunger, 90);
  assert.equal(pet.daily.actionsLeft, ACTIONS_PER_DAY - 1);
});

test('생활 행동은 30분 쿨타임을 서버에서 차단한다', () => {
  const state = stateWithUsers([['u1','윤설']]);
  const pet = current(state);
  const date = new Date('2026-08-06T00:00:00Z');
  assert.equal(workAction(pet, date).ok, true);
  const blocked = exerciseAction(pet, new Date(date.getTime() + 29 * 60_000));
  assert.equal(blocked.ok, false);
  assert.match(blocked.message, /남았습니다/);
  assert.equal(exerciseAction(pet, new Date(date.getTime() + 30 * 60_000)).ok, true);
});

test('헬스는 몸집 -2, 체력 -20, 배고픔 -15를 적용한다', () => {
  const state = stateWithUsers([['u1','윤설']]);
  const pet = current(state);
  pet.stats.body = 90;
  const result = exerciseAction(pet, new Date('2026-08-06T00:00:00Z'));
  assert.equal(result.ok, true);
  assert.equal(pet.stats.body, 88);
  assert.equal(pet.stats.stamina, 80);
  assert.equal(pet.stats.hunger, 85);
});

test('쉬기는 체력 +40, 배고픔 -5를 적용하고 체력 90 이상이면 막는다', () => {
  const state = stateWithUsers([['u1','윤설']]);
  const pet = current(state);
  assert.equal(restAction(pet).ok, false);
  pet.stats.stamina = 50;
  const result = restAction(pet, new Date('2026-08-06T00:00:00Z'));
  assert.equal(result.ok, true);
  assert.equal(pet.stats.stamina, 90);
  assert.equal(pet.stats.hunger, 95);
});

test('음식은 포인트만 사용하고 배고픔·몸집을 변경하며 행동 횟수는 쓰지 않는다', () => {
  const state = stateWithUsers([['u1','윤설']]);
  const pet = current(state);
  pet.stats.points = 100;
  pet.stats.hunger = 50;
  const beforeActions = pet.daily.actionsLeft;
  const result = eatAction(pet, 'ramen');
  assert.equal(result.ok, true);
  assert.equal(pet.stats.points, 70);
  assert.equal(pet.stats.hunger, 74);
  assert.equal(pet.stats.body, 72);
  assert.equal(pet.daily.balanceCounts.eat, 1);
  assert.equal(pet.daily.actionsLeft, beforeActions);
  assert.equal('lifeCrisis' in pet.stats, false);
});

test('거대 체형은 생활 행동 배고픔 소모가 단계적으로 증가하고 전용 음식은 몸집 조건을 지킨다', () => {
  const state = stateWithUsers([['u1','윤설']]);
  const pet = current(state);
  pet.stats.body = 4520;
  pet.stats.hunger = 100;
  pet.stats.stamina = 100;
  let result = workAction(pet, new Date('2026-08-06T00:00:00Z'));
  assert.equal(result.ok, true);
  assert.equal(pet.stats.hunger, 82); // 초거대 체급 일하기 -18

  pet.daily.nextActionAt = null;
  pet.stats.stamina = 50;
  result = restAction(pet, new Date('2026-08-06T00:31:00Z'));
  assert.equal(result.ok, true);
  assert.equal(pet.stats.hunger, 73); // 쉬기 -9

  pet.daily.nextActionAt = null;
  result = exerciseAction(pet, new Date('2026-08-06T01:02:00Z'));
  assert.equal(result.ok, true);
  assert.equal(pet.stats.hunger, 48); // 헬스 -25

  pet.stats.points = 5000;
  pet.stats.hunger = 10;
  pet.stats.body = 199;
  assert.equal(eatAction(pet, 'jokbalLarge').ok, false);
  pet.stats.body = 200;
  assert.equal(eatAction(pet, 'jokbalLarge').ok, true);
  pet.stats.hunger = 10;
  pet.stats.body = 1749;
  assert.equal(eatAction(pet, 'buffetSweep').ok, false);
  pet.stats.body = 1750;
  assert.equal(eatAction(pet, 'buffetSweep').ok, true);
  pet.stats.hunger = 10;
  pet.stats.body = 2339;
  assert.equal(eatAction(pet, 'dinoFeed').ok, false);
  pet.stats.body = 2340;
  assert.equal(eatAction(pet, 'dinoFeed').ok, true);
  assert.equal(pet.stats.hunger, 100);
});

test('배고픔 0은 현실 한 시간마다 최대 10P만 차감하고 포인트는 0 아래로 내려가지 않는다', () => {
  const state = stateWithUsers([['u1','윤설']]);
  const pet = current(state);
  pet.stats.points = 15;
  pet.stats.hunger = 0;
  pet.survival.hungerZeroAt = '2026-08-06T00:00:00.000Z';
  pet.survival.hungerPenaltyHoursApplied = 0;
  const result = applyHungerPenalty(pet, new Date('2026-08-06T03:10:00.000Z'));
  assert.equal(result.hours, 3);
  assert.equal(result.pointsLost, 15);
  assert.equal(pet.stats.points, 0);
  assert.equal('lifeCrisis' in pet.stats, false);
  assert.equal(applyHungerPenalty(pet, new Date('2026-08-06T03:50:00.000Z')).hours, 0);
});

function evaluatePatternDays(state, pet, counts, { hunger = 50, days = 2 } = {}) {
  let date = new Date('2026-08-06T06:00:00.000Z');
  for (let index = 0; index < days; index += 1) {
    Object.assign(pet.daily.balanceCounts, { work: 0, rest: 0, exercise: 0, eat: 0, bung: 0, mini: 0, fishing: 0 }, counts);
    pet.stats.hunger = hunger;
    date = new Date(date.getTime() + 6 * 60 * 60_000);
    applyDailyReset(pet, date, state);
  }
  return date;
}

test('같은 불균형을 2게임날 연속 반복하면 하루 최대 파손 경고 1회만 올라간다', () => {
  const state = stateWithUsers([['u1','윤설']], new Date('2026-08-06T06:00:00.000Z'));
  const pet = current(state);
  evaluatePatternDays(state, pet, { eat: 5 }, { days: 2 });
  assert.equal(pet.integrity.breakWarnings, 1);
  assert.match(pet.integrity.stageMessage, /배부른/);
  assert.equal(state.users.u1.notifications.some((item) => item.type === 'break-warning' && item.payload?.popup), true);
});

test('과식·굶주림·일만 하기·벙만 하기·특정 행동 반복은 각각 연속 패턴으로 파손 경고를 만든다', () => {
  const cases = [
    [{ eat: 5 }, 50, 'overeat'],
    [{ work: 1 }, 0, 'starve'],
    [{ work: 4 }, 50, 'work'],
    [{ bung: 4 }, 50, 'bung'],
    [{ fishing: 5 }, 50, 'repeat']
  ];
  for (const [counts, hunger, cause] of cases) {
    const state = stateWithUsers([['u1','윤설']], new Date('2026-08-06T06:00:00.000Z'));
    const pet = current(state);
    evaluatePatternDays(state, pet, counts, { hunger, days: 2 });
    assert.equal(pet.integrity.breakWarnings, 1, cause);
    assert.equal(pet.integrity.cause, cause);
  }
});

test('파손 경고 3회 상태에서 다음 경고 조건이 성립하면 자동 세대교체가 아니라 파손 상태로 멈춘다', () => {
  const state = stateWithUsers([['u1','윤설']], new Date('2026-08-06T06:00:00.000Z'));
  const pet = current(state);
  pet.integrity.breakWarnings = BREAK_WARNING_MAX;
  const oldId = pet.id;
  evaluatePatternDays(state, pet, { work: 4 }, { days: 2 });
  assert.equal(pet.integrity.broken, true);
  assert.equal(state.users.u1.currentPetId, oldId);
  assert.equal(pet.alive, true);
  assert.equal(state.publicEvents.some((item) => item.type === 'break'), true);
});

test('균형 있는 게임날을 2회 연속 보내면 파손 경고가 1회 줄어든다', () => {
  const state = stateWithUsers([['u1','윤설']], new Date('2026-08-06T06:00:00.000Z'));
  const pet = current(state);
  pet.integrity.breakWarnings = 2;
  evaluatePatternDays(state, pet, { work: 1, rest: 1, mini: 1 }, { hunger: 50, days: 2 });
  assert.equal(pet.integrity.breakWarnings, 1);
  assert.equal(state.users.u1.notifications.some((item) => item.type === 'break-recovery'), true);
});

test('7일 미접속은 파손 경고를 한 번만 올리고 다시 활동하면 다음 장기 미접속을 다시 셀 수 있다', () => {
  const base = new Date('2026-08-06T00:00:00.000Z');
  const state = stateWithUsers([['u1','윤설']], base);
  const pet = current(state);
  const weekLater = new Date(base.getTime() + BREAK_INACTIVITY_HOURS * 3_600_000 + 1);
  assert.equal(applyInactivityConsequence(state, pet, weekLater).warningAdded, true);
  assert.equal(pet.integrity.breakWarnings, 1);
  assert.equal(applyInactivityConsequence(state, pet, new Date(weekLater.getTime() + 3_600_000)).changed, false);
  markPetActive(pet, new Date(weekLater.getTime() + 3_600_000));
  const secondWeek = new Date(weekLater.getTime() + 3_600_000 + BREAK_INACTIVITY_HOURS * 3_600_000 + 1);
  assert.equal(applyInactivityConsequence(state, pet, secondWeek).warningAdded, true);
  assert.equal(pet.integrity.breakWarnings, 2);
});

test('파손된 레고는 사용자가 재시작을 선택했을 때만 과거 기록으로 이동하고 2세대로 초기화된다', () => {
  const state = stateWithUsers();
  const old = current(state, 'u1');
  const partner = current(state, 'u2');
  old.stats.points = 9999;
  old.stats.legoPower = 80;
  old.statusMessage = '부서지기 직전';
  old.partnerPetId = partner.id;
  partner.partnerPetId = old.id;
  old.coupleStartedAt = partner.coupleStartedAt = '2026-08-01T00:00:00Z';
  state.pokes.pair = { id: 'pair', petIds: [old.id, partner.id], counts: { [old.id]: 3, [partner.id]: 2 }, total: 5, lastActorPetId: old.id };
  state.territory.cells = { '0:0': { ownerPetId: old.id, claimedAt: new Date().toISOString() } };
  markPetBroken(state, old, 'work');
  assert.equal(state.users.u1.currentPetId, old.id, '파손만으로 세대가 자동 교체되면 안 됨');
  const result = restartBrokenPet(state, 'u1');
  const fresh = current(state, 'u1');
  assert.equal(result.ok, true);
  assert.equal(fresh.generation, 2);
  assert.equal(old.alive, false);
  assert.equal(old.endReason, '파손');
  assert.match(old.endDetail, /과로/);
  assert.equal(fresh.stats.points, 0);
  assert.equal(fresh.stats.legoPower, 1);
  assert.equal(fresh.statusMessage, '');
  assert.equal(fresh.partnerPetId, null);
  assert.equal(fresh.integrity.breakWarnings, 0);
  assert.equal(partner.partnerPetId, null);
  assert.equal(Object.keys(state.pokes).length, 0);
  assert.equal(Object.keys(state.territory.cells).length, 0);
});

test('6시간 초기화는 생활·미니게임·낚시·오늘 목표를 함께 초기화한다', () => {
  const state = stateWithUsers([['u1','윤설']], new Date('2026-08-05T15:00:00Z'));
  const pet = current(state);
  pet.daily.actionsLeft = 0;
  pet.daily.miniGamesPlayed = 20;
  pet.daily.fishingPlayed = 10;
  pet.daily.legoGoals.life = true;
  const result = applyDailyReset(pet, new Date('2026-08-05T21:00:00Z'));
  assert.equal(result.changed, true);
  assert.equal(pet.daily.actionsLeft, 5);
  assert.equal(pet.daily.miniGamesPlayed, 0);
  assert.equal(pet.daily.fishingPlayed, 0);
  assert.equal(pet.daily.legoGoals.life, false);
});

test('오늘의 레고력 목표 10개는 각각 한 번만 지급되고 카운터 목표는 5회 기준을 지킨다', () => {
  const state = stateWithUsers([['u1','윤설']]);
  const pet = current(state);
  incrementGoalCounter(pet, 'life', 3);
  incrementGoalCounter(pet, 'mini', 2);
  incrementGoalCounter(pet, 'fishing', 5);
  completeDailyGoal(pet, 'liarPlay');
  completeDailyGoal(pet, 'omokPlay');
  completeDailyGoal(pet, 'bungJoin');
  completeDailyGoal(pet, 'bungHost');
  incrementGoalCounter(pet, 'mating', 5);
  incrementGoalCounter(pet, 'poke', 5);
  completeDailyGoal(pet, 'levelUp');
  assert.equal(pet.daily.legoGoals.mating, true);
  assert.equal(pet.daily.legoGoals.poke, true);
  assert.equal(pet.daily.legoGoals.levelUp, true);
  assert.equal(pet.stats.legoPower, 11);
  assert.equal(completeDailyGoal(pet, 'bungHost').awarded, false);
  assert.equal(pet.stats.legoPower, 11);
});

test('레고력이 실제 레벨 경계를 넘으면 그 게임 하루 레벨업 목표가 자동으로 한 번만 +1을 준다', () => {
  const state = stateWithUsers([['u1','윤설']]);
  const pet = current(state);
  pet.stats.legoPower = 10;
  const result = completeDailyGoal(pet, 'liarPlay');
  assert.equal(result.leveledUp, true);
  assert.equal(result.levelUpBonus, true);
  assert.equal(pet.daily.legoGoals.levelUp, true);
  assert.equal(pet.stats.legoPower, 12, '레벨 경계 +1과 레벨업 오늘 목표 +1');
  assert.equal(completeDailyGoal(pet, 'levelUp').awarded, false);
  assert.equal(pet.stats.legoPower, 12);
});

test('벙은 최소 500P를 즉시 차감하고 2~30명일 때 시작한다', () => {
  const state = stateWithUsers();
  const host = current(state, 'u1');
  const guest = current(state, 'u2');
  host.stats.points = 1000;
  const created = createBung(state, host, { title: '치킨벙', stakePoints: 500 });
  assert.equal(created.ok, true);
  assert.equal(host.stats.points, 500);
  assert.equal(startBung(state, host, created.bung).ok, false);
  assert.equal(joinBung(state, guest, created.bung).ok, true);
  assert.equal(startBung(state, host, created.bung).ok, true);
});

test('벙 정상 종료는 참가 목표와 방장 개최 목표를 각각 한 번 지급한다', () => {
  const state = stateWithUsers();
  const host = current(state, 'u1');
  const guest = current(state, 'u2');
  host.stats.points = 2000;
  const bung = createBung(state, host, { title: '벙1', stakePoints: 500 }).bung;
  joinBung(state, guest, bung);
  startBung(state, host, bung);
  const first = finishBung(state, host, bung);
  assert.equal(first.ok, true);
  assert.equal(host.stats.stamina, 80);
  assert.equal(guest.stats.stamina, 80);
  assert.equal(host.stats.legoPower, 4);
  assert.equal(guest.stats.legoPower, 3);
  const secondBung = createBung(state, host, { title: '벙2', stakePoints: 500 }).bung;
  joinBung(state, guest, secondBung);
  startBung(state, host, secondBung);
  finishBung(state, host, secondBung);
  assert.equal(host.stats.legoPower, 5);
  assert.equal(guest.stats.legoPower, 4);
  assert.equal('chat' in secondBung, false);
  assert.equal('impressions' in secondBung, false);
});

test('홀짝은 직접 건 20P를 차감하고 1연승 정산 시 판돈의 1.3배를 반환한다', (t) => {
  t.mock.method(Math, 'random', () => 0);
  const state = stateWithUsers([['u1','윤설']]);
  const pet = current(state);
  pet.stats.points = 100;
  const start = startMiniGame(state, pet, 'oddEven', new Date(), { stakePoints: 20 });
  assert.equal(start.challenge.stake, 20);
  assert.equal(pet.stats.points, 80);
  const win = finishMiniGame(state, pet, start.challenge.id, 'odd');
  assert.equal(win.finished, false);
  assert.equal(win.pendingPayout, 26);
  const stop = stopMiniGame(state, pet, start.challenge.id);
  assert.equal(stop.reward, 26);
  assert.equal(stop.netProfit, 6);
  assert.equal(pet.stats.points, 106);
});

test('홀짝 2연승에서 그만하면 배팅액의 1.6배를 반환한다', (t) => {
  t.mock.method(Math, 'random', () => 0);
  const state = stateWithUsers([['u1','윤설']]);
  const pet = current(state);
  pet.stats.points = 200;
  const game = startMiniGame(state, pet, 'oddEven', new Date(), { stakePoints: 30 });
  finishMiniGame(state, pet, game.challenge.id, 'odd');
  const second = finishMiniGame(state, pet, game.challenge.id, 'odd');
  assert.equal(second.pendingPayout, 48);
  const stop = stopMiniGame(state, pet, game.challenge.id);
  assert.equal(stop.reward, 48);
  assert.equal(stop.netProfit, 18);
  assert.equal(pet.stats.points, 218);
});

test('홀짝 3연승은 배팅액의 2배를 반환하고 오답은 건 포인트 전액을 잃는다', (t) => {
  t.mock.method(Math, 'random', () => 0);
  const state = stateWithUsers([['u1','윤설']]);
  const pet = current(state);
  pet.stats.points = 300;
  let game = startMiniGame(state, pet, 'oddEven', new Date(), { stakePoints: 20 });
  finishMiniGame(state, pet, game.challenge.id, 'odd');
  finishMiniGame(state, pet, game.challenge.id, 'odd');
  const third = finishMiniGame(state, pet, game.challenge.id, 'odd');
  assert.equal(third.reward, 40);
  assert.equal(third.netProfit, 20);
  assert.equal(pet.stats.points, 320);

  pet.daily.miniGamesPlayed = 0;
  game = startMiniGame(state, pet, 'oddEven', new Date(), { stakePoints: 40 });
  const loss = finishMiniGame(state, pet, game.challenge.id, 'even');
  assert.equal(loss.reward, 0);
  assert.equal(loss.stake, 40);
  assert.equal(pet.stats.points, 280);
});

test('홀짝은 최대 배팅 상한 없이 보유 포인트까지 10P 단위로 배팅할 수 있다', () => {
  const state = stateWithUsers([['u1','윤설']]);
  const pet = current(state);
  pet.stats.points = 5000;
  const large = startMiniGame(state, pet, 'oddEven', new Date(), { stakePoints: 5000 });
  assert.equal(large.ok, true);
  assert.equal(large.challenge.stake, 5000);
  assert.equal(pet.stats.points, 0);

  large.challenge.completed = true;
  pet.stats.points = 100;
  for (const stakePoints of [0, -10, 1.5, 9, 15, 110]) {
    const result = startMiniGame(state, pet, 'oddEven', new Date(), { stakePoints });
    assert.equal(result.ok, false);
    assert.equal(pet.stats.points, 100);
  }
});

test('홀짝 지급액은 1승 1.3배, 2승 1.6배, 3승 2배이며 항상 정수다', () => {
  assert.equal(oddEvenPayout(100, 1), 130);
  assert.equal(oddEvenPayout(100, 2), 160);
  assert.equal(oddEvenPayout(100, 3), 200);
  assert.equal(oddEvenPayout(30, 2), 48);
  assert.equal(oddEvenPayout(15, 2), 0);
});

test('번개 반응은 반응속도 구간별 포인트를 지급하고 미리 누르면 0P다', () => {
  const state = stateWithUsers([['u1','윤설']]);
  const pet = current(state);
  const base = new Date('2026-08-06T00:00:00Z');
  let start = startMiniGame(state, pet, 'reaction', base);
  state.miniGameChallenges[start.challenge.id].readyAt = base.getTime() + 1000;
  let result = finishMiniGame(state, pet, start.challenge.id, 1, new Date(base.getTime() + 1150));
  assert.equal(result.reward, 100);
  start = startMiniGame(state, pet, 'reaction', new Date(base.getTime() + 2000));
  state.miniGameChallenges[start.challenge.id].readyAt = base.getTime() + 5000;
  result = finishMiniGame(state, pet, start.challenge.id, 1, new Date(base.getTime() + 4000));
  assert.equal(result.reward, 0);
});

test('숫자 맞히기는 빈 입력을 거부하고 최대 5회 기회를 적용한다', () => {
  const state = stateWithUsers([['u1','윤설']]);
  const pet = current(state);
  const start = startMiniGame(state, pet, 'number');
  const challenge = state.miniGameChallenges[start.challenge.id];
  challenge.target = 42;
  assert.equal(challenge.maxAttempts, 5);
  assert.equal(finishMiniGame(state, pet, challenge.id, '').ok, false);
  for (const guess of [10, 20, 30, 40]) {
    const result = finishMiniGame(state, pet, challenge.id, guess);
    assert.equal(result.finished, false);
  }
  const last = finishMiniGame(state, pet, challenge.id, 41);
  assert.equal(last.finished, true);
  assert.equal(last.reward, 0);
  assert.equal(last.attempts, 5);
});

test('낚시는 30초 뒤 한 번만 정산하고 최종 포인트표를 사용한다', (t) => {
  t.mock.method(Math, 'random', () => .9999);
  const state = stateWithUsers([['u1','윤설']]);
  const pet = current(state);
  const date = new Date('2026-08-06T00:00:00Z');
  const started = startFishing(pet, date);
  assert.equal(started.ok, true);
  assert.equal(new Date(started.fishing.readyAt).getTime() - date.getTime(), 30_000);
  const settled = settleFishing(pet, new Date(date.getTime() + 30_001));
  assert.equal(settled.result.label, '잔치집 삼합');
  assert.equal(settled.result.reward, 500);
  assert.equal(pet.stats.points, 500);
  assert.equal(settleFishing(pet, new Date(date.getTime() + 60_000)), null);
  assert.deepEqual(FISHING_REWARDS.map((item) => item.reward), [0,5,10,20,50,100,200,300,500]);
});

test('매칭 수락은 양쪽 커플과 D+1을 만들고 한쪽 이별은 양쪽을 솔로로 만든다', () => {
  const state = stateWithUsers();
  const a = current(state, 'u1');
  const b = current(state, 'u2');
  const date = new Date('2026-08-06T00:00:00Z');
  const request = socialAction(state, a, b, 'requestMatch', {}, date);
  assert.equal(request.ok, true);
  const pending = Object.values(state.requests)[0];
  assert.equal(socialAction(state, b, a, 'acceptMatch', { requestId: pending.id }, date).ok, true);
  assert.equal(a.partnerPetId, b.id);
  assert.equal(b.partnerPetId, a.id);
  assert.equal(coupleDayCount(a.coupleStartedAt, date), 1);
  assert.equal(socialAction(state, a, b, 'breakup', {}, date).ok, true);
  assert.equal(a.partnerPetId, null);
  assert.equal(b.partnerPetId, null);
  assert.equal(socialAction(state, a, b, 'requestMatch', {}, new Date(date.getTime() + 23 * 60 * 60_000)).ok, false);
});

test('교미 신청은 상대에게 대기 요청과 알림을 보내고 수락하면 궁합도와 웃긴 결과를 전체 소식에 공개한다', (t) => {
  t.mock.method(Math, 'random', () => 0.87);
  const state = stateWithUsers();
  const a = current(state, 'u1');
  const b = current(state, 'u2');
  const requestResult = socialAction(state, a, b, 'requestMating');
  assert.equal(requestResult.ok, true);
  const request = Object.values(state.requests).find((item) => item.type === 'mating');
  assert.ok(request);
  assert.equal(request.status, 'pending');
  assert.equal(state.users.u2.notifications[0]?.text, `${a.displayName}이 교미 신청을 걸었습니다.`);
  const accepted = socialAction(state, b, a, 'acceptMating', { requestId: request.id });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.compatibility, 87);
  assert.match(state.publicEvents[0]?.text ?? '', /궁합도는 87%/);
  assert.match(state.publicEvents[0]?.text ?? '', /궁합/);
  assert.equal(a.warnings, 0);
});



test('교미 궁합도는 7개 구간 문구를 사용하고 수락 완료 5회만 양쪽 교미 목표에 반영한다', (t) => {
  const state = stateWithUsers();
  const a = current(state, 'u1');
  const b = current(state, 'u2');
  const samples = [
    [0.10, /뜨거운 밤|레고 결합부|M텔비|연락처|없던 일|퇴실/],
    [0.40, /체력|어색한 침묵|카톡|괜찮았지|만족한 척/],
    [0.55, /CF|엘리베이터|은밀한 관계|같은 시간/],
    [0.65, /옷매무새|보이스룸/],
    [0.75, /호흡|손잡고|흡연실|허용 범위|옷을 입고|머리를 묶고/],
    [0.85, /목적지가 같|문 잠그는 걸 잊|현장을 본 레고|벌써/],
    [0.95, /연장|호야 비상계단|한국밥|상어|사실관계/]
  ];
  for (const [randomValue, pattern] of samples) {
    socialAction(state, a, b, 'requestMating');
    const request = Object.values(state.requests).filter((item) => item.type === 'mating' && item.status === 'pending').at(-1);
    const mock = t.mock.method(Math, 'random', () => randomValue);
    const accepted = socialAction(state, b, a, 'acceptMating', { requestId: request.id });
    mock.mock.restore();
    assert.match(accepted.resultText, pattern);
  }
  assert.equal(a.daily.goalCounters.mating, 7);
  assert.equal(b.daily.goalCounters.mating, 7);
  assert.equal(a.daily.legoGoals.mating, true);
  assert.equal(b.daily.legoGoals.mating, true);
});
test('교미 신청을 거절하면 신청자에게 50% 확률로 일반 경고가 누적되고 발생한 경우 전체 소식에도 뜬다', (t) => {
  t.mock.method(Math, 'random', () => 0);
  const state = stateWithUsers();
  const a = current(state, 'u1');
  const b = current(state, 'u2');
  socialAction(state, a, b, 'requestMating');
  const request = Object.values(state.requests).find((item) => item.type === 'mating');
  const rejected = socialAction(state, b, a, 'rejectMating', { requestId: request.id });
  assert.equal(rejected.ok, true);
  assert.equal(rejected.warned, true);
  assert.equal(a.warnings, 1);
  assert.equal(a.records.warnings, 1);
  assert.equal(state.users.u1.notifications.some((item) => item.type === 'warning' && item.payload?.popup), true);
  assert.match(state.publicEvents[0]?.text ?? '', /경고 1회/);
  assert.equal(a.integrity.breakWarnings, 0, '일반 경고와 파손 경고는 분리되어야 함');
});

test('교미 거절 경고 확률을 피하면 일반 경고와 전체 소식은 생기지 않는다', (t) => {
  t.mock.method(Math, 'random', () => 0.99);
  const state = stateWithUsers();
  const a = current(state, 'u1');
  const b = current(state, 'u2');
  const beforeNews = state.publicEvents.length;
  socialAction(state, a, b, 'requestMating');
  const request = Object.values(state.requests).find((item) => item.type === 'mating');
  const rejected = socialAction(state, b, a, 'rejectMating', { requestId: request.id });
  assert.equal(rejected.warned, false);
  assert.equal(a.warnings, 0);
  assert.equal(state.publicEvents.length, beforeNews);
});

test('찌르기는 되찌르기 전 연속 찌르기를 막고 상호 기록만 TOP 5에 잡는다', () => {
  const state = stateWithUsers();
  const a = current(state, 'u1');
  const b = current(state, 'u2');
  assert.equal(pokePet(state, a, b).ok, true);
  assert.equal(pokePet(state, a, b).ok, false);
  assert.equal(pokeRanking(state).length, 0);
  assert.equal(pokePet(state, b, a).ok, true);
  assert.equal(pokeRanking(state)[0].total, 2);
});

test('포인트·레벨·커플·찌르기·홀짝·오목 랭킹은 살아 있는 현재 레고만 사용한다', () => {
  const state = stateWithUsers([['u1','윤설'],['u2','민균'],['u3','영광']]);
  current(state,'u1').stats.points = 200;
  current(state,'u2').stats.points = 300;
  current(state,'u1').stats.legoPower = 23;
  current(state,'u2').stats.legoPower = 11;
  current(state,'u1').records.oddEvenBest = 3;
  current(state,'u1').records.oddEvenBestAt = '2026-08-06T00:00:01.000Z';
  current(state,'u2').records.oddEvenBest = 2;
  current(state,'u2').records.omokWins = 4;
  current(state,'u2').records.omokLosses = 1;
  assert.equal(pointRanking(state)[0].displayName, '민균레고');
  assert.equal(levelRanking(state)[0].displayName, '윤설레고');
  const rankings = rankingsView(state);
  assert.equal(rankings.points.length, 3);
  assert.equal(rankings.levels[0].level, 3);
  assert.equal(rankings.oddEven[0].displayName, '윤설레고');
  assert.equal(rankings.oddEven[0].streak, 3);
  assert.equal(rankings.omok[0].displayName, '민균레고');
});

test('공개 프로필에는 삭제된 돈·빚·기분·호감도·선물 데이터가 노출되지 않는다', () => {
  const state = stateWithUsers();
  const a = current(state,'u1');
  const b = current(state,'u2');
  const profile = publicProfile(state, b.id, a.id, true);
  assert.equal('money' in profile.stats, false);
  assert.equal('debt' in profile.stats, false);
  assert.equal('mood' in profile.stats, false);
  assert.equal('charm' in profile.stats, false);
  assert.equal('affinity' in profile, false);
  assert.equal('gifts' in profile, false);
});

test('대시보드는 필요한 포인트·레벨·생활·핵심 기록만 반환한다', () => {
  const state = stateWithUsers([['u1','윤설']]);
  addNotification(state, 'u1', '테스트');
  const dashboard = privateDashboard(state, 'u1');
  assert.equal(dashboard.pet.stats.level, 1);
  assert.equal(dashboard.pet.daily.goals.total, 10);
  assert.equal('salaryPreview' in dashboard.pet, false);
  assert.equal('job' in dashboard.pet, false);
});
