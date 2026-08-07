import test from 'node:test';
import assert from 'node:assert/strict';
import { interactionHungerCostForBody, consumeInteractionHunger, lifeHungerCostsForBody } from '../src/game/activity.js';
import {
  createBung,
  finishBung,
  joinBung,
  recentEndedBungs,
  socialAction,
  startBung,
  startFishing,
  startMiniGame
} from '../src/game/engine.js';
import { stateWithUsers } from './helpers.js';

function current(state, userId = 'u1') {
  return state.pets[state.users[userId].currentPetId];
}

test('체형별 게임성 활동 배고픔 비용은 1~10 단계로 점진 증가한다', () => {
  const cases = [[60,1],[100,2],[130,3],[160,4],[240,5],[1080,6],[1500,7],[2340,8],[3080,9],[3990,10],[999999,10]];
  for (const [body, expected] of cases) assert.equal(interactionHungerCostForBody(body), expected, `몸집 ${body}`);
  assert.deepEqual(lifeHungerCostsForBody(60), { work: 10, rest: 5, exercise: 15 });
  assert.deepEqual(lifeHungerCostsForBody(3990), { work: 18, rest: 9, exercise: 25 });
});

test('활동 배고픔은 0 아래로 내려가지 않고 처음 0이 된 시각만 정확히 기록한다', () => {
  const state = stateWithUsers([['u1', '윤설']]);
  const pet = current(state);
  pet.stats.body = 200;
  pet.stats.hunger = 3;
  const firstAt = new Date('2026-08-07T00:00:00.000Z');
  const first = consumeInteractionHunger(pet, firstAt);
  assert.deepEqual(first, { cost: 4, deducted: 3, before: 3, after: 0 });
  assert.equal(pet.survival.hungerZeroAt, firstAt.toISOString());
  const second = consumeInteractionHunger(pet, new Date('2026-08-07T01:00:00.000Z'));
  assert.equal(second.after, 0);
  assert.equal(pet.survival.hungerZeroAt, firstAt.toISOString(), '이미 배고픔 0이면 기준 시각을 계속 밀면 안 된다');
});

test('미니게임·낚시·교미 신청은 실제 시작/접수될 때 체형별 배고픔을 한 번 소모한다', () => {
  const state = stateWithUsers([['u1', '윤설'], ['u2', '민균']]);
  const a = current(state, 'u1');
  const b = current(state, 'u2');
  a.stats.body = 160; // -4
  a.stats.points = 100;
  a.stats.hunger = 100;

  let result = startMiniGame(state, a, 'reaction', new Date('2026-08-07T00:00:00.000Z'));
  assert.equal(result.ok, true);
  assert.equal(a.stats.hunger, 96);
  state.miniGameChallenges[result.challenge.id].completed = true;

  result = startFishing(a, new Date('2026-08-07T00:01:00.000Z'));
  assert.equal(result.ok, true);
  assert.equal(a.stats.hunger, 92);

  result = socialAction(state, a, b, 'requestMating', {}, new Date('2026-08-07T00:02:00.000Z'));
  assert.equal(result.ok, true);
  assert.equal(a.stats.hunger, 88);
});

test('벙 정상 종료는 레고력·체력과 함께 참가자별 체형 배고픔을 적용한다', () => {
  const state = stateWithUsers([['u1', '방장'], ['u2', '참가자']]);
  const host = current(state, 'u1');
  const guest = current(state, 'u2');
  host.stats.points = 500;
  host.stats.body = 130; // -3
  guest.stats.body = 200; // -4
  const bung = createBung(state, host, { title: '테스트벙', stakePoints: 500 }).bung;
  assert.equal(joinBung(state, guest, bung).ok, true);
  assert.equal(startBung(state, host, bung).ok, true);
  assert.equal(finishBung(state, host, bung).ok, true);
  assert.equal(host.stats.hunger, 97);
  assert.equal(guest.stats.hunger, 96);
});

test('지난 벙은 정상 종료된 최신 10개만 종료시간 역순으로 노출한다', () => {
  const state = stateWithUsers([['u1', '방장'], ['u2', '참가자']]);
  const host = current(state, 'u1');
  const guest = current(state, 'u2');
  for (let index = 0; index < 12; index += 1) {
    const endedAt = new Date(Date.UTC(2026, 7, 7, index, 0, 0)).toISOString();
    state.bungs[`ended-${index}`] = {
      id: `ended-${index}`,
      title: `지난벙${index}`,
      hostPetId: host.id,
      stakePoints: 500,
      status: 'ended',
      createdAt: endedAt,
      startedAt: endedAt,
      endedAt,
      attendees: {
        [host.id]: { petId: host.id, status: 'completed', joinedAt: endedAt, rewarded: true },
        [guest.id]: { petId: guest.id, status: 'completed', joinedAt: endedAt, rewarded: true }
      }
    };
  }
  state.bungs.cancelled = { id: 'cancelled', title: '취소벙', hostPetId: host.id, stakePoints: 500, status: 'cancelled', endedAt: new Date().toISOString(), attendees: {} };
  state.bungs.live = { id: 'live', title: '진행벙', hostPetId: host.id, stakePoints: 500, status: 'live', attendees: {} };

  const list = recentEndedBungs(state, 10);
  assert.equal(list.length, 10);
  assert.equal(list[0].title, '지난벙11');
  assert.equal(list.at(-1).title, '지난벙2');
  assert.equal(list.some((item) => item.title === '취소벙' || item.title === '진행벙'), false);
  assert.deepEqual(list[0].attendees.map((item) => item.displayName), ['방장레고', '참가자레고']);
});

test('벙 정상 종료 시 저장 상태에서도 종료 기록은 최신 10개만 남긴다', () => {
  const state = stateWithUsers([['u1', '방장'], ['u2', '참가자']]);
  const host = current(state, 'u1');
  const guest = current(state, 'u2');
  host.stats.points = 500;
  for (let index = 0; index < 10; index += 1) {
    const endedAt = new Date(Date.UTC(2026, 7, 6, index, 0, 0)).toISOString();
    state.bungs[`old-${index}`] = {
      id: `old-${index}`,
      title: `예전벙${index}`,
      hostPetId: host.id,
      stakePoints: 500,
      status: 'ended',
      createdAt: endedAt,
      startedAt: endedAt,
      endedAt,
      attendees: { [host.id]: { petId: host.id, status: 'completed', joinedAt: endedAt, rewarded: true } }
    };
  }
  const at = new Date('2026-08-07T12:00:00.000Z');
  const bung = createBung(state, host, { title: '최신벙', stakePoints: 500 }, at).bung;
  assert.equal(joinBung(state, guest, bung, at).ok, true);
  assert.equal(startBung(state, host, bung, at).ok, true);
  assert.equal(finishBung(state, host, bung, at).ok, true);
  const ended = Object.values(state.bungs).filter((item) => item.status === 'ended');
  assert.equal(ended.length, 10);
  assert.equal(Boolean(state.bungs['old-0']), false, '가장 오래된 종료 벙은 제거되어야 한다');
  assert.equal(Boolean(state.bungs[bung.id]), true, '방금 종료한 벙은 남아야 한다');
});
