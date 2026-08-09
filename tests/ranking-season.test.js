import test from 'node:test';
import assert from 'node:assert/strict';
import { gameRankingSeasonKey, gameRankingSeasonWindow, nextGameRankingSeasonAt } from '../src/lib/time.js';
import { normalizeGameRankingSeason, processGameRankingSeason } from '../src/game/ranking-season.js';
import { stateWithUsers } from './helpers.js';

const START = new Date('2026-08-07T15:00:00.000Z'); // KST 2026-08-08 00:00
const BEFORE_END = new Date('2026-08-10T14:59:59.000Z');
const END = new Date('2026-08-10T15:00:00.000Z'); // KST 2026-08-11 00:00

function pet(state, userId) { return state.pets[state.users[userId].currentPetId]; }

test('게임 랭킹 시즌은 KST 00시를 기준으로 정확히 72시간마다 바뀐다', () => {
  const window = gameRankingSeasonWindow(START);
  assert.equal(window.startsAt, '2026-08-07T15:00:00.000Z');
  assert.equal(window.endsAt, '2026-08-10T15:00:00.000Z');
  assert.equal(nextGameRankingSeasonAt(START), window.endsAt);
  assert.equal(gameRankingSeasonKey(BEFORE_END), window.key);
  assert.notEqual(gameRankingSeasonKey(END), window.key);
});

test('홀짝·사과·오목 시즌 TOP3는 500/300/100P를 한 번만 받고 세 게임 기록은 초기화된다', () => {
  const state = stateWithUsers([['u1','윤설'],['u2','민균'],['u3','태섭'],['u4','영광']], START);
  state.gameRankingSeason = normalizeGameRankingSeason(null, START);
  const [a,b,c,d] = ['u1','u2','u3','u4'].map((id) => pet(state,id));
  for (const item of [a,b,c,d]) item.stats.points = 0;

  a.records.oddEvenBest = 3; a.records.oddEvenBestAt = '2026-08-08T01:00:00.000Z';
  b.records.oddEvenBest = 3; b.records.oddEvenBestAt = '2026-08-08T02:00:00.000Z';
  c.records.oddEvenBest = 2; c.records.oddEvenBestAt = '2026-08-08T03:00:00.000Z';

  b.records.appleBestScore = 5000; b.records.appleBestAt = '2026-08-08T01:00:00.000Z';
  a.records.appleBestScore = 4000; a.records.appleBestAt = '2026-08-08T02:00:00.000Z';
  c.records.appleBestScore = 3000; c.records.appleBestAt = '2026-08-08T03:00:00.000Z';

  c.records.omokWins = 5; c.records.omokLosses = 1; c.records.omokDraws = 0;
  a.records.omokWins = 5; a.records.omokLosses = 2; a.records.omokDraws = 3;
  b.records.omokWins = 4; b.records.omokLosses = 0; b.records.omokDraws = 1;

  assert.equal(processGameRankingSeason(state, BEFORE_END).changed, false);
  const settled = processGameRankingSeason(state, END);
  assert.equal(settled.changed, true);
  assert.equal(settled.events.length, 3);
  assert.match(settled.events[0].text, /🌓 홀짝 시즌 종료! 1위 윤설레고 500P · 2위 민균레고 300P · 3위 태섭레고 100P/);
  assert.match(settled.events[1].text, /🍎 사과게임 시즌 종료! 1위 민균레고 500P · 2위 윤설레고 300P · 3위 태섭레고 100P/);
  assert.match(settled.events[2].text, /⚫ 오목 시즌 종료! 1위 태섭레고 500P · 2위 윤설레고 300P · 3위 민균레고 100P/);

  assert.equal(a.stats.points, 1100);
  assert.equal(b.stats.points, 900);
  assert.equal(c.stats.points, 700);
  assert.equal(d.stats.points, 0);
  for (const item of [a,b,c,d]) {
    assert.equal(item.records.oddEvenBest, 0);
    assert.equal(item.records.oddEvenBestAt, null);
    assert.equal(item.records.appleBestScore, 0);
    assert.equal(item.records.appleBestAt, null);
    assert.equal(item.records.omokWins, 0);
    assert.equal(item.records.omokDraws, 0);
    assert.equal(item.records.omokLosses, 0);
  }

  const before = [a.stats.points,b.stats.points,c.stats.points,d.stats.points];
  const duplicate = processGameRankingSeason(state, new Date(END.getTime() + 60_000));
  assert.equal(duplicate.changed, false);
  assert.deepEqual([a.stats.points,b.stats.points,c.stats.points,d.stats.points], before, '같은 시즌 경계는 두 번 정산하지 않는다');
});
