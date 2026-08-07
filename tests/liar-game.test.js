import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LIAR_MIN_PLAYERS,
  LIAR_MAX_PLAYERS,
  LIAR_PLAYER_OPTIONS,
  LIAR_TOTAL_ROUNDS,
  LIAR_DISCUSSION_OPTIONS,
  LIAR_BET_OPTIONS,
  LIAR_VOTING_SECONDS,
  LIAR_REVOTE_SECONDS,
  LIAR_GUESS_SECONDS,
  LIAR_RESULT_SECONDS,
  initialLiarGame,
  normalizeLiarGame,
  liarJoin,
  liarToggleReady,
  liarUpdateSettings,
  liarStart,
  liarVote,
  liarGuess,
  liarSetConnected,
  liarLeave,
  liarAddChat,
  deleteLiarChat,
  forceEndLiarGame,
  consumeLiarPublicEvent,
  liarGameView,
  liarNextAlarmAt,
  advanceLiarGame
} from '../src/game/liar-game.js';
import { stateWithUsers } from './helpers.js';

const BASE = new Date('2026-08-06T03:00:00.000Z');

function setup(count = 3, points = 1_000) {
  const names = Array.from({ length: count }, (_, index) => [`u${index + 1}`, `참가자${index + 1}`]);
  const state = stateWithUsers(names, BASE);
  const pets = names.map(([userId]) => state.pets[state.users[userId].currentPetId]);
  for (const pet of pets) pet.stats.points = points;
  state.liarGame = initialLiarGame();
  return { state, pets };
}

function joinReady(state, pets, date = BASE) {
  for (const pet of pets) assert.equal(liarJoin(state, pet, date).ok, true);
  for (const pet of pets) assert.equal(liarToggleReady(state, pet, date).ok, true);
}

function withFixedRandom(callback, value = 0) {
  const original = Math.random;
  try {
    Math.random = () => value;
    return callback();
  } finally {
    Math.random = original;
  }
}

function expire(state, milliseconds = 1) {
  const end = new Date(state.liarGame.phaseEndsAt).getTime();
  return advanceLiarGame(state, new Date(end + milliseconds));
}

function voteFor(state, pets, target) {
  for (const pet of pets) assert.equal(liarVote(state, pet, target.id, BASE).ok, true);
}

test('라이어게임은 1라운드이며 최소 3명·최대 12명, 토론 60/120초, 판돈 10/100/500P를 사용한다', () => {
  assert.equal(LIAR_MIN_PLAYERS, 3);
  assert.equal(LIAR_MAX_PLAYERS, 12);
  assert.deepEqual(LIAR_PLAYER_OPTIONS, [3,4,5,6,7,8,9,10,11,12]);
  assert.equal(LIAR_TOTAL_ROUNDS, 1);
  assert.deepEqual(LIAR_DISCUSSION_OPTIONS, [60, 120]);
  assert.deepEqual(LIAR_BET_OPTIONS, [10, 100, 500]);
  assert.equal(LIAR_VOTING_SECONDS, 20);
  assert.equal(LIAR_REVOTE_SECONDS, 20);
  assert.equal(LIAR_GUESS_SECONDS, 20);
  assert.equal(LIAR_RESULT_SECONDS, 20);
});

test('방장만 토론·판돈·최대 인원을 설정할 수 있고 현재 인원보다 작게 줄일 수 없다', () => {
  const { state, pets } = setup(4);
  liarJoin(state, pets[0], BASE);
  liarJoin(state, pets[1], BASE);
  liarJoin(state, pets[2], BASE);
  assert.equal(liarUpdateSettings(state, pets[1], { discussionSeconds: 120, betPoints: 500, maxPlayers: 4 }, BASE).ok, false);
  assert.equal(liarUpdateSettings(state, pets[0], { discussionSeconds: 120, betPoints: 500, maxPlayers: 4 }, BASE).ok, true);
  assert.equal(state.liarGame.settings.discussionSeconds, 120);
  assert.equal(state.liarGame.settings.betPoints, 500);
  assert.equal(state.liarGame.settings.maxPlayers, 4);
  assert.equal(liarUpdateSettings(state, pets[0], { maxPlayers: 2 }, BASE).ok, true, '유효 범위 밖 값은 기존 설정 유지');
  assert.equal(state.liarGame.settings.maxPlayers, 4);
  assert.equal(liarJoin(state, pets[3], BASE).ok, true);
  assert.equal(liarUpdateSettings(state, pets[0], { maxPlayers: 3 }, BASE).ok, false, '현재 4명보다 작게 줄일 수 없음');
  assert.equal(state.liarGame.settings.maxPlayers, 4);
});

test('방장이 정한 최대 인원까지는 참가할 수 있고 게임 시작 후 신규 참가는 게임 중으로 차단된다', () => {
  const { state, pets } = setup(5);
  assert.equal(liarJoin(state, pets[0], BASE).ok, true);
  assert.equal(liarUpdateSettings(state, pets[0], { maxPlayers: 4 }, BASE).ok, true);
  assert.equal(liarJoin(state, pets[1], BASE).ok, true);
  assert.equal(liarJoin(state, pets[2], BASE).ok, true);
  assert.equal(liarJoin(state, pets[3], BASE).ok, true);
  const full = liarJoin(state, pets[4], BASE);
  assert.equal(full.ok, false);
  assert.match(full.message, /가득/);
  for (const pet of pets.slice(0, 4)) assert.equal(liarToggleReady(state, pet, BASE).ok, true);
  assert.equal(withFixedRandom(() => liarStart(state, pets[0], BASE)).ok, true);
  const during = liarJoin(state, pets[4], BASE);
  assert.equal(during.ok, false);
  assert.match(during.message, /게임이 진행 중/);
  const outsiderView = liarGameView(state, pets[4].id);
  assert.equal(outsiderView.phase, 'discussion');
  assert.equal(outsiderView.joined, false);
  assert.equal(outsiderView.settings.maxPlayers, 4);
});

test('게임 시작은 전원 준비와 1라운드 판돈만 요구하고 한 번만 보관한다', () => {
  const { state, pets } = setup(3, 99);
  for (const pet of pets) liarJoin(state, pet, BASE);
  assert.equal(liarStart(state, pets[0], BASE).ok, false, '준비 전 시작 차단');
  for (const pet of pets) liarToggleReady(state, pet, BASE);
  liarUpdateSettings(state, pets[0], { betPoints: 100 }, BASE);
  assert.equal(liarStart(state, pets[0], BASE).ok, false, '100P 미만 참가자 차단');
  for (const pet of pets) pet.stats.points = 1_000;

  const result = withFixedRandom(() => liarStart(state, pets[0], BASE));
  assert.equal(result.ok, true);
  assert.equal(state.liarGame.phase, 'discussion');
  assert.equal(state.liarGame.roundNo, 1);
  for (const pet of pets) {
    assert.equal(pet.stats.points, 900);
    assert.equal(pet.stats.hunger, 99, '라이어게임 시작 참가자는 체형에 따른 활동 배고픔을 소모한다');
  }
  for (const player of Object.values(state.liarGame.players)) {
    assert.equal(player.currentRoundStake, 100);
    assert.equal(player.escrowRemaining, 0);
  }
});

test('역할과 제시어는 해당 참가자에게만 공개하고 결과 단계에서 전체 공개한다', () => {
  const { state, pets } = setup();
  joinReady(state, pets);
  withFixedRandom(() => liarStart(state, pets[0], BASE));
  const liarView = liarGameView(state, pets[0].id);
  const citizenView = liarGameView(state, pets[1].id);
  const outsiderView = liarGameView(state, 'not-joined');
  assert.equal(liarView.isLiar, true);
  assert.equal(liarView.word, null);
  assert.equal(liarView.category, '음식');
  assert.equal(citizenView.isLiar, false);
  assert.equal(citizenView.word, '떡볶이');
  assert.equal(citizenView.category, '음식');
  assert.equal(outsiderView.word, null);
  assert.equal(outsiderView.category, null);
  assert.equal(liarView.liarPetId, null);
});

test('라이어가 지목 후 정답을 맞히면 해당 라운드 총 판돈을 가져간다', () => {
  const { state, pets } = setup(3, 1_000);
  joinReady(state, pets);
  liarUpdateSettings(state, pets[0], { betPoints: 100 }, BASE);
  withFixedRandom(() => liarStart(state, pets[0], BASE));
  expire(state);
  assert.equal(state.liarGame.phase, 'voting');
  voteFor(state, pets, pets[0]);
  assert.equal(state.liarGame.phase, 'liar_guess');
  assert.equal(liarGuess(state, pets[1], '떡볶이', BASE).ok, false);
  assert.equal(liarGuess(state, pets[0], ' 떡 볶 이 ', BASE).ok, true);
  assert.equal(state.liarGame.phase, 'result');
  assert.equal(state.liarGame.roundResult.payout.pot, 300);
  assert.equal(state.liarGame.roundResult.payout.each, 300);
  assert.equal(pets[0].stats.points, 1_200);
  assert.equal(pets[1].stats.points, 900);
  assert.equal(pets[2].stats.points, 900);
});

test('시민 승리 시 라운드 판돈을 연결된 시민 승자끼리 균등 분배하고 나머지는 버린다', () => {
  const { state, pets } = setup(4, 1_000);
  joinReady(state, pets);
  withFixedRandom(() => liarStart(state, pets[0], BASE));
  expire(state);
  voteFor(state, pets, pets[0]);
  assert.equal(liarGuess(state, pets[0], '오답', BASE).ok, true);
  const payout = state.liarGame.roundResult.payout;
  assert.equal(payout.pot, 40);
  assert.equal(payout.each, 13);
  assert.equal(payout.discarded, 1);
  assert.equal(pets[0].stats.points, 990);
  assert.deepEqual(pets.slice(1).map((pet) => pet.stats.points), [1003, 1003, 1003]);
});

test('1라운드 정상 종료 시 참가·승리 목표와 기록은 한 번만 반영된다', () => {
  const { state, pets } = setup(3, 1_000);
  joinReady(state, pets);
  const original = Math.random;
  try {
    Math.random = () => 0;
    liarStart(state, pets[0], BASE);
    expire(state);
    voteFor(state, pets, pets[0]);
    liarGuess(state, pets[0], '오답', BASE);
    expire(state);
  } finally {
    Math.random = original;
  }
  assert.equal(state.liarGame.phase, 'game_over');
  assert.deepEqual(pets.map((pet) => pet.records.liarGames), [1, 1, 1]);
  assert.deepEqual(pets.map((pet) => pet.records.liarWins), [0, 1, 1]);
  assert.deepEqual(pets.map((pet) => pet.stats.legoPower), [2, 3, 3], '참가 +1, 승자 추가 +1');
  assert.deepEqual(pets.map((pet) => pet.daily.legoGoals.liarPlay), [true, true, true]);
  assert.deepEqual(pets.map((pet) => pet.daily.legoGoals.liarWin), [false, true, true]);
  assert.equal(consumeLiarPublicEvent(state)?.text.includes('라이어게임 종료'), true);
  assert.equal(consumeLiarPublicEvent(state), null, '소식은 한 번만 소비한다');
});

test('진행 중 이탈자는 현재 판돈을 포기하고 3명 미만이면 나머지 참가자만 환불받는다', () => {
  const { state, pets } = setup(3, 1_000);
  joinReady(state, pets);
  liarUpdateSettings(state, pets[0], { betPoints: 100 }, BASE);
  withFixedRandom(() => liarStart(state, pets[0], BASE));
  const result = liarSetConnected(state, pets[2].id, false, BASE);
  assert.equal(result.autoEnded, true);
  assert.equal(state.liarGame.phase, 'waiting');
  assert.equal(pets[0].stats.points, 1_000);
  assert.equal(pets[1].stats.points, 1_000);
  assert.equal(pets[2].stats.points, 900, '이탈자는 현재 1라운드 판돈을 포기한다');
});

test('4명 게임에서 방장 이탈 시 게임은 유지되고 다음 참가자에게 방장이 이전된다', () => {
  const { state, pets } = setup(4, 1_000);
  joinReady(state, pets);
  withFixedRandom(() => liarStart(state, pets[0], BASE));
  const result = liarLeave(state, pets[0], BASE);
  assert.equal(result.ok, true);
  assert.equal(state.liarGame.phase, 'discussion');
  assert.equal(state.liarGame.players[pets[0].id].forfeited, true);
  assert.equal(state.liarGame.hostPetId, pets[1].id);
});

test('재투표도 동률이면 라이어가 승리하며 중복 투표는 차단된다', () => {
  const { state, pets } = setup(4, 1_000);
  joinReady(state, pets);
  withFixedRandom(() => liarStart(state, pets[0], BASE));
  expire(state);
  assert.equal(liarVote(state, pets[0], pets[1].id, BASE).ok, true);
  assert.equal(liarVote(state, pets[0], pets[0].id, BASE).ok, false);
  liarVote(state, pets[1], pets[0].id, BASE);
  liarVote(state, pets[2], pets[0].id, BASE);
  liarVote(state, pets[3], pets[1].id, BASE);
  assert.equal(state.liarGame.voteRound, 2);
  assert.equal(state.liarGame.phase, 'voting');
  liarVote(state, pets[0], pets[1].id, BASE);
  liarVote(state, pets[1], pets[0].id, BASE);
  liarVote(state, pets[2], pets[0].id, BASE);
  liarVote(state, pets[3], pets[1].id, BASE);
  assert.equal(state.liarGame.phase, 'result');
  assert.equal(state.liarGame.roundResult.liarWon, true);
  assert.match(state.liarGame.roundResult.reason, /재투표도 동률/);
});

test('운영자 강제 종료는 연결된 참가자의 현재·남은 판돈을 전부 환불한다', () => {
  const { state, pets } = setup(3, 2_000);
  joinReady(state, pets);
  liarUpdateSettings(state, pets[0], { betPoints: 500 }, BASE);
  assert.equal(withFixedRandom(() => liarStart(state, pets[0], BASE)).ok, true);
  assert.deepEqual(pets.map((pet) => pet.stats.points), [1_500, 1_500, 1_500]);
  assert.equal(forceEndLiarGame(state, BASE).ok, true);
  assert.deepEqual(pets.map((pet) => pet.stats.points), [2_000, 2_000, 2_000]);
  assert.equal(state.liarGame.phase, 'waiting');
});

test('라이어 채팅은 빈 입력·초고속 중복을 막고 운영자 삭제는 일반 채팅만 지운다', () => {
  const { state, pets } = setup();
  liarJoin(state, pets[0], BASE);
  assert.equal(liarAddChat(state, pets[0], '   ', BASE).ok, false);
  const sent = liarAddChat(state, pets[0], '안녕하세요', BASE);
  assert.equal(sent.ok, true);
  assert.equal(liarAddChat(state, pets[0], '연속', new Date(BASE.getTime() + 100)).ok, false);
  const systems = state.liarGame.messages.filter((message) => message.type === 'system').length;
  assert.equal(deleteLiarChat(state, sent.chat.id).ok, true);
  assert.equal(state.liarGame.messages.some((message) => message.id === sent.chat.id), false);
  assert.equal(state.liarGame.messages.filter((message) => message.type === 'system').length, systems);
});

test('잘못되거나 없는 단계 시각은 null로 정리되어 Cloudflare 알람 0 오류를 만들지 않는다', () => {
  const { state } = setup();
  state.liarGame.phaseEndsAt = 0;
  state.liarGame.updatedAt = 'invalid';
  state.liarGame = normalizeLiarGame(state.liarGame, state);
  assert.equal(state.liarGame.phaseEndsAt, null);
  assert.equal(liarNextAlarmAt(state), null);
});
