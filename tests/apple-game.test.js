import test from 'node:test';
import assert from 'node:assert/strict';
import { MINI_GAMES_PER_DAY, FISHING_PER_DAY } from '../src/game/constants.js';
import { createAppleBoard, selectAppleRectangle } from '../src/game/apple-game.js';
import { rankingsView, startMiniGame, selectAppleGame, settleExpiredMiniGames } from '../src/game/engine.js';
import { stateWithUsers } from './helpers.js';

const BASE = new Date('2026-08-07T05:00:00.000Z');

test('개인게임 30회와 낚시 20회 상수', () => {
  assert.equal(MINI_GAMES_PER_DAY, 30);
  assert.equal(FISHING_PER_DAY, 20);
});

test('사과 보드는 10x10이고 숫자는 1~9', () => {
  const board = createAppleBoard(() => 0.999);
  assert.equal(board.length, 10);
  assert.equal(board.every((row) => row.length === 10), true);
  assert.equal(board.flat().every((value) => value >= 1 && value <= 9), true);
});

test('합 10만 제거하고 중복 요청은 다시 지급하지 않는다', () => {
  const challenge = {
    completed: false,
    expiresAt: new Date(BASE.getTime() + 120_000).toISOString(),
    appleBoard: Array.from({ length: 10 }, () => Array(10).fill(9)),
    applePendingPoints: 0, appleScore: 0, appleRemovedCount: 0, appleSuccesses: 0, appleProcessedRequestIds: []
  };
  challenge.appleBoard[0][0] = 1;
  challenge.appleBoard[0][1] = 2;
  challenge.appleBoard[0][2] = 7;
  const result = selectAppleRectangle(challenge, { startRow: 0, startCol: 0, endRow: 0, endCol: 2 }, 'req-1', BASE);
  assert.equal(result.removed, true);
  assert.equal(result.gainedPoints, 3);
  assert.equal(challenge.applePendingPoints, 3);
  assert.equal(challenge.appleScore, 60);
  assert.deepEqual(challenge.appleBoard[0].slice(0, 3), [null, null, null]);
  const duplicate = selectAppleRectangle(challenge, { startRow: 0, startCol: 0, endRow: 0, endCol: 2 }, 'req-1', BASE);
  assert.equal(duplicate.duplicate, true);
  assert.equal(challenge.applePendingPoints, 3);
});

test('사과게임 포인트는 서버 상태에서 계산하고 종료 시 한 번만 정산한다', () => {
  const state = stateWithUsers([['u1', '윤설']], BASE);
  const pet = state.pets[state.users.u1.currentPetId];
  pet.stats.points = 1000;
  const started = startMiniGame(state, pet, 'apple', BASE);
  assert.equal(started.ok, true);
  const challenge = state.miniGameChallenges[started.challenge.id];
  challenge.appleBoard = Array.from({ length: 10 }, () => Array(10).fill(null));
  challenge.appleBoard[0][0] = 4;
  challenge.appleBoard[0][1] = 6;
  const selected = selectAppleGame(state, pet, challenge.id, { startRow: 0, startCol: 0, endRow: 0, endCol: 1 }, 'server-1', new Date(BASE.getTime() + 1000));
  assert.equal(selected.ok, true);
  assert.equal(selected.cleared, true);
  assert.equal(pet.stats.points, 1002);
  assert.equal(pet.daily.miniGamesPlayed, 1);
  assert.equal(pet.records.appleBestScore, 40);
  const pointsAfter = pet.stats.points;
  const repeat = selectAppleGame(state, pet, challenge.id, { startRow: 0, startCol: 0, endRow: 0, endCol: 1 }, 'server-1', new Date(BASE.getTime() + 2000));
  assert.equal(repeat.ok, false);
  assert.equal(pet.stats.points, pointsAfter);
  assert.equal(pet.daily.miniGamesPlayed, 1);
});

test('만료된 사과게임은 서버 정산 루틴에서 한 번만 완료된다', () => {
  const state = stateWithUsers([['u1', '윤설']], BASE);
  const pet = state.pets[state.users.u1.currentPetId];
  const started = startMiniGame(state, pet, 'apple', BASE);
  const challenge = state.miniGameChallenges[started.challenge.id];
  challenge.applePendingPoints = 7;
  challenge.appleScore = 100;
  challenge.expiresAt = new Date(BASE.getTime() + 1000).toISOString();
  const first = settleExpiredMiniGames(state, new Date(BASE.getTime() + 2000));
  const pointsAfter = pet.stats.points;
  assert.equal(first.changed, true);
  assert.equal(pet.daily.miniGamesPlayed, 1);
  assert.equal(pet.records.appleBestScore, 100);
  const second = settleExpiredMiniGames(state, new Date(BASE.getTime() + 3000));
  assert.equal(second.changed, false);
  assert.equal(pet.stats.points, pointsAfter);
  assert.equal(pet.daily.miniGamesPlayed, 1);
});

test('사과게임 랭킹은 한 판 최고점수 TOP 5이며 동점은 먼저 달성한 사용자가 앞선다', () => {
  const state = stateWithUsers([
    ['u1', '윤설'], ['u2', '민균'], ['u3', '태섭'], ['u4', '영광'],
    ['u5', '야옹'], ['u6', '콩순'], ['u7', '동은']
  ], BASE);
  const rows = [
    ['u1', 1820, 7000],
    ['u2', 1640, 6000],
    ['u3', 1510, 5000],
    ['u4', 1430, 4000],
    ['u5', 1280, 3000],
    ['u6', 1280, 2000],
    ['u7', 900, 1000]
  ];
  for (const [userId, score, offsetMs] of rows) {
    const pet = state.pets[state.users[userId].currentPetId];
    pet.records.appleBestScore = score;
    pet.records.appleBestAt = new Date(BASE.getTime() + offsetMs).toISOString();
  }

  const ranking = rankingsView(state).apple;
  assert.equal(ranking.length, 5);
  assert.deepEqual(ranking.map((item) => item.displayName), ['윤설레고', '민균레고', '태섭레고', '영광레고', '콩순레고']);
  assert.deepEqual(ranking.map((item) => item.rank), [1, 2, 3, 4, 5]);
  assert.equal(ranking[4].score, 1280);
  assert.equal(ranking.some((item) => item.displayName === '야옹레고'), false);
});
