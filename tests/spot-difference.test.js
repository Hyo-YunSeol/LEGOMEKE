import test from 'node:test';
import assert from 'node:assert/strict';
import { stateWithUsers } from './helpers.js';
import {
  SPOT_DIFFERENCE_COUNT, SPOT_DIFFERENCE_HITBOXES, SPOT_DIFFERENCE_MATCH_SECONDS,
  SPOT_DIFFERENCE_START_COUNTDOWN_MS, SPOT_DIFFERENCE_WRONG_LOCK_MS, SPOT_DIFFERENCE_THEMES,
  createSpotDifferenceRoom, joinSpotDifferenceRoom, playSpotDifferenceClick,
  processSpotDifferenceTimers, requestSpotDifferenceRematch, spotDifferenceRoomView,
  spotDifferenceRanking, validSpotDifferenceStake
} from '../src/game/spot-difference.js';
import { SPOT_CLIENT_HITBOXES, spotDifferenceHitIdAt } from '../public/spot-difference-scene.js';

const BASE_MS = Date.parse('2026-08-31T08:00:00.000Z');
const at = (seconds = 0) => new Date(BASE_MS + seconds * 1000);
const pets = (state) => Object.values(state.pets);

function setup(stake = 500) {
  const state = stateWithUsers([['spot-u1', '찾기A'], ['spot-u2', '찾기B']], at());
  const ps = pets(state);
  for (const pet of ps) pet.stats.points = 10_000;
  const made = createSpotDifferenceRoom(state, ps[0], stake, at());
  assert.equal(made.ok, true, made.message);
  const joined = joinSpotDifferenceRoom(state, ps[1], made.roomId, at(1));
  assert.equal(joined.ok, true, joined.message);
  return { state, ps, roomId: made.roomId, room: state.spotDifference.rooms[made.roomId] };
}

function pointFor(room, differenceId) {
  const hit = SPOT_DIFFERENCE_HITBOXES.find((item) => item.id === differenceId);
  assert.ok(hit, `hitbox ${differenceId} missing`);
  return { x: room.puzzle.mirrored ? 1 - hit.x : hit.x, y: hit.y };
}

function clickDifference(state, pet, room, differenceId, actionId, date) {
  const { x, y } = pointFor(room, differenceId);
  return playSpotDifferenceClick(state, pet, room.id, { matchId: room.matchId, actionId, x, y }, date);
}

test('틀린그림찾기는 7개·2분·3초 카운트다운·오답 1초 잠금 사양을 고정한다', () => {
  assert.equal(SPOT_DIFFERENCE_COUNT, 7);
  assert.equal(SPOT_DIFFERENCE_MATCH_SECONDS, 120);
  assert.equal(SPOT_DIFFERENCE_START_COUNTDOWN_MS, 3000);
  assert.equal(SPOT_DIFFERENCE_WRONG_LOCK_MS, 1000);
  assert.equal(SPOT_DIFFERENCE_THEMES.length, 10);
  assert.equal(validSpotDifferenceStake(100), true);
  assert.equal(validSpotDifferenceStake(500), true);
  assert.equal(validSpotDifferenceStake(3000), true);
  assert.equal(validSpotDifferenceStake(1500), false);
});

test('클라이언트와 서버는 같은 비율좌표 hitbox를 사용하고 정답 영역끼리 겹치지 않는다', () => {
  assert.deepEqual(SPOT_CLIENT_HITBOXES, SPOT_DIFFERENCE_HITBOXES);
  for (let i = 0; i < SPOT_DIFFERENCE_HITBOXES.length; i += 1) {
    const a = SPOT_DIFFERENCE_HITBOXES[i];
    for (let j = i + 1; j < SPOT_DIFFERENCE_HITBOXES.length; j += 1) {
      const b = SPOT_DIFFERENCE_HITBOXES[j];
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > a.r + b.r, `${a.id}/${b.id} 터치 영역이 겹치면 안 됩니다.`);
    }
  }
});

test('두 플레이어는 같은 랜덤 문제를 받고 카운트다운 전에는 정답 입력이 처리되지 않는다', () => {
  const { state, ps, room } = setup();
  assert.equal(room.status, 'playing');
  assert.equal(room.puzzle.differenceIds.length, 7);
  assert.equal(new Date(room.revealAt).getTime() - new Date(room.startedAt).getTime(), 3000);
  assert.equal(new Date(room.deadlineAt).getTime() - new Date(room.revealAt).getTime(), 120000);
  const firstId = room.puzzle.differenceIds[0];
  const { x, y } = pointFor(room, firstId);
  assert.equal(spotDifferenceHitIdAt(room.puzzle, x, y), firstId);
  const early = playSpotDifferenceClick(state, ps[0], room.id, { matchId: room.matchId, actionId: 'early', x, y }, at(2));
  assert.equal(early.countdown, true);
  assert.equal(room.players[ps[0].id].foundCount, 0);
});

test('오답은 1초 잠금이고 난타 중 정답을 눌러도 잠금이 끝날 때까지 인정되지 않는다', () => {
  const { state, ps, room } = setup();
  const wrong = playSpotDifferenceClick(state, ps[0], room.id, { matchId: room.matchId, actionId: 'wrong', x: 0.50, y: 0.96 }, at(5));
  assert.equal(wrong.correct, false);
  assert.equal(room.players[ps[0].id].wrongClicks, 1);
  assert.equal(room.players[ps[0].id].lockedUntil, at(6).toISOString());
  const firstId = room.puzzle.differenceIds[0];
  const locked = clickDifference(state, ps[0], room, firstId, 'locked-correct', at(5.5));
  assert.equal(locked.locked, true);
  assert.equal(room.players[ps[0].id].foundCount, 0);
  const correct = clickDifference(state, ps[0], room, firstId, 'correct-after-lock', at(6.01));
  assert.equal(correct.correct, true);
  assert.equal(room.players[ps[0].id].foundCount, 1);
});

test('상대에게는 찾은 개수만 보이고 내가 찾은 정답 위치만 내 화면에 공개된다', () => {
  const { state, ps, roomId, room } = setup();
  const answer = room.puzzle.differenceIds[0];
  clickDifference(state, ps[0], room, answer, 'privacy-one', at(5));
  const aView = spotDifferenceRoomView(state, roomId, ps[0].id, at(5));
  const bView = spotDifferenceRoomView(state, roomId, ps[1].id, at(5));
  assert.deepEqual(aView.players[ps[0].id].foundIds, [answer]);
  assert.deepEqual(aView.players[ps[1].id].foundIds, []);
  assert.equal(aView.players[ps[1].id].foundCount, 0);
  assert.deepEqual(bView.players[ps[0].id].foundIds, []);
  assert.equal(bView.players[ps[0].id].foundCount, 1);
});

test('7개를 먼저 찾으면 즉시 승리하고 판돈·승패 기록은 정확히 한 번 정산된다', () => {
  const { state, ps, room } = setup(500);
  room.puzzle.differenceIds.forEach((differenceId, index) => {
    const result = clickDifference(state, ps[0], room, differenceId, `finish-${index}`, at(5 + index));
    assert.equal(result.correct, true);
  });
  assert.equal(room.status, 'ended');
  assert.equal(room.result, 'win');
  assert.equal(room.winnerPetId, ps[0].id);
  assert.equal(ps[0].stats.points, 10_500);
  assert.equal(ps[1].stats.points, 9_500);
  assert.equal(ps[0].records.spotDifferenceWins, 1);
  assert.equal(ps[1].records.spotDifferenceLosses, 1);
  const duplicateAfterEnd = playSpotDifferenceClick(state, ps[0], room.id, { matchId: room.matchId, actionId: 'after-end', x: 0.1, y: 0.1 }, at(20));
  assert.equal(duplicateAfterEnd.terminal, true);
  assert.equal(ps[0].stats.points, 10_500);
});

test('2분 종료 동수는 같은 개수에 먼저 도달한 플레이어가 이기고 0대0은 무승부다', () => {
  {
    const { state, ps, roomId, room } = setup(500);
    const idA = room.puzzle.differenceIds[0];
    const idB = room.puzzle.differenceIds[1];
    clickDifference(state, ps[0], room, idA, 'tie-a1', at(5));
    clickDifference(state, ps[1], room, idA, 'tie-b1', at(6));
    clickDifference(state, ps[0], room, idB, 'tie-a2', at(7));
    clickDifference(state, ps[1], room, idB, 'tie-b2', at(8));
    const deadline = new Date(room.deadlineAt);
    const settled = processSpotDifferenceTimers(state, new Date(deadline.getTime() + 1), { roomId });
    assert.equal(settled.settled, true);
    assert.equal(room.winnerPetId, ps[0].id);
    assert.match(room.resultReason, /먼저 도달/);
  }
  {
    const { state, ps, roomId, room } = setup(500);
    const deadline = new Date(room.deadlineAt);
    processSpotDifferenceTimers(state, new Date(deadline.getTime() + 1), { roomId });
    assert.equal(room.result, 'draw');
    assert.equal(ps[0].stats.points, 10_000);
    assert.equal(ps[1].stats.points, 10_000);
    assert.equal(ps[0].records.spotDifferenceDraws, 1);
    assert.equal(ps[1].records.spotDifferenceDraws, 1);
  }
});

test('재대결은 바로 전 테마와 동일 문제를 재사용하지 않고 시즌 랭킹을 승수 우선으로 정렬한다', () => {
  const { state, ps, room } = setup(100);
  const oldTheme = room.puzzle.themeId;
  const oldKey = room.puzzle.key;
  room.puzzle.differenceIds.forEach((differenceId, index) => clickDifference(state, ps[0], room, differenceId, `rematch-win-${index}`, at(5 + index)));
  assert.equal(requestSpotDifferenceRematch(state, ps[0], room.id, at(20)).pending, true);
  const rematch = requestSpotDifferenceRematch(state, ps[1], room.id, at(21));
  assert.equal(rematch.started, true, rematch.message);
  assert.notEqual(room.puzzle.themeId, oldTheme);
  assert.notEqual(room.puzzle.key, oldKey);

  ps[0].records.seasonSpotDifferenceWins = 3; ps[0].records.seasonSpotDifferenceLosses = 2;
  ps[1].records.seasonSpotDifferenceWins = 3; ps[1].records.seasonSpotDifferenceLosses = 1;
  const ranking = spotDifferenceRanking(state, ps[0].id);
  assert.equal(ranking.top[0].petId, ps[1].id);
  assert.equal(ranking.mine.rank, 2);
});
