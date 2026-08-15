import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState } from '../src/durable-store.js';
import {
  abandonMinesweeperGame,
  createPet,
  playMinesweeperGame,
  startMiniGame
} from '../src/game/engine.js';
import {
  MINESWEEPER_DIFFICULTIES,
  minesweeperChallengeView,
  minesweeperRankingsView,
  normalizeMinesweeperSeason,
  processMinesweeperSeason
} from '../src/game/minesweeper.js';

const BASE = new Date('2026-08-15T09:10:00.000Z'); // KST 18:10

function stateWithPet(id = 'u1', nickname = '윤설', date = BASE) {
  const state = initialState();
  const user = { id, nickname, generation: 1, currentPetId: null, sessionVersion: 1, notifications: [], createdAt: date.toISOString(), lastSeenAt: date.toISOString() };
  const pet = createPet(user, 1, date);
  user.currentPetId = pet.id;
  state.users[id] = user;
  state.pets[pet.id] = pet;
  return { state, pet };
}

function startMine(state, pet, difficulty = 'normal', date = BASE) {
  const started = startMiniGame(state, pet, 'minesweeper', date, { difficulty });
  assert.equal(started.ok, true, started.message);
  const challenge = state.miniGameChallenges[started.challenge.id];
  assert.ok(challenge);
  return challenge;
}

test('지뢰찾기 난이도/보상 규칙이 확정 사양과 일치한다', () => {
  assert.deepEqual(
    { rows: MINESWEEPER_DIFFICULTIES.normal.rows, cols: MINESWEEPER_DIFFICULTIES.normal.cols, mines: MINESWEEPER_DIFFICULTIES.normal.mines, success: MINESWEEPER_DIFFICULTIES.normal.successReward, fail: MINESWEEPER_DIFFICULTIES.normal.failReward, badge: MINESWEEPER_DIFFICULTIES.normal.badgeLabel },
    { rows: 10, cols: 10, mines: 12, success: 100, fail: 30, badge: '💥 지뢰왕' }
  );
  assert.deepEqual(
    { rows: MINESWEEPER_DIFFICULTIES.hard.rows, cols: MINESWEEPER_DIFFICULTIES.hard.cols, mines: MINESWEEPER_DIFFICULTIES.hard.mines, success: MINESWEEPER_DIFFICULTIES.hard.successReward, fail: MINESWEEPER_DIFFICULTIES.hard.failReward, badge: MINESWEEPER_DIFFICULTIES.hard.badgeLabel },
    { rows: 16, cols: 16, mines: 40, success: 200, fail: 50, badge: '💣 지뢰왕고수' }
  );
});

test('판을 열기만 해서는 횟수가 차감되지 않고 첫 공개에서 정확히 1회 차감된다', () => {
  const { state, pet } = stateWithPet();
  const before = pet.daily.miniGamesPlayed;
  const challenge = startMine(state, pet);
  assert.equal(pet.daily.miniGamesPlayed, before);
  assert.equal(challenge.usageCounted, false);
  assert.equal(challenge.minesweeperStartedAt, null);

  const first = playMinesweeperGame(state, pet, challenge.id, { action: 'reveal', row: 5, col: 5 }, BASE);
  assert.equal(first.ok, true);
  assert.equal(first.firstReveal, true);
  assert.equal(pet.daily.miniGamesPlayed, before + 1);
  assert.equal(challenge.usageCounted, true);

  const second = playMinesweeperGame(state, pet, challenge.id, { action: 'reveal', row: 5, col: 5 }, new Date(BASE.getTime() + 500));
  assert.equal(second.ok, true);
  assert.equal(pet.daily.miniGamesPlayed, before + 1);
});

test('첫 클릭과 주변 8칸에는 지뢰가 절대 생성되지 않고 클라이언트 뷰에는 숨겨진 지뢰가 노출되지 않는다', () => {
  const { state, pet } = stateWithPet();
  const challenge = startMine(state, pet);
  const row = 5;
  const col = 5;
  const first = playMinesweeperGame(state, pet, challenge.id, { action: 'reveal', row, col }, BASE);
  assert.equal(first.ok, true);
  assert.ok(Array.isArray(challenge.minesweeperBoard));
  for (let r = row - 1; r <= row + 1; r += 1) {
    for (let c = col - 1; c <= col + 1; c += 1) {
      assert.notEqual(challenge.minesweeperBoard[r * 10 + c], -1, `${r},${c}가 지뢰면 안 됩니다.`);
    }
  }
  const view = minesweeperChallengeView(challenge);
  assert.equal('minesweeperBoard' in view, false);
  for (let r = 0; r < view.rows; r += 1) {
    for (let c = 0; c < view.cols; c += 1) {
      if (!challenge.minesweeperRevealed[r * view.cols + c] && !challenge.minesweeperFlagged[r * view.cols + c]) assert.equal(view.cells[r][c], null);
    }
  }
});

test('실패 보상은 보통 30P이고 지뢰 실패 후 한 번만 정산된다', () => {
  const { state, pet } = stateWithPet();
  const challenge = startMine(state, pet, 'normal');
  const pointsBefore = pet.stats.points;
  playMinesweeperGame(state, pet, challenge.id, { action: 'reveal', row: 5, col: 5 }, BASE);
  const mineIndex = challenge.minesweeperBoard.findIndex((value) => value === -1);
  assert.ok(mineIndex >= 0);
  const result = playMinesweeperGame(state, pet, challenge.id, { action: 'reveal', row: Math.floor(mineIndex / 10), col: mineIndex % 10 }, new Date(BASE.getTime() + 1250));
  assert.equal(result.ok, true);
  assert.equal(result.failed, true);
  assert.equal(result.reward, 30);
  assert.equal(pet.stats.points, pointsBefore + 30);
  const duplicate = playMinesweeperGame(state, pet, challenge.id, { action: 'reveal', row: 0, col: 0 }, new Date(BASE.getTime() + 1500));
  assert.equal(duplicate.ok, false);
  assert.equal(pet.stats.points, pointsBefore + 30);
});

test('클리어는 보통 100P를 지급하고 성공 시간만 개인 최고 기록에 저장한다', () => {
  const { state, pet } = stateWithPet();
  const challenge = startMine(state, pet, 'normal');
  const pointsBefore = pet.stats.points;
  let now = BASE;
  let result = playMinesweeperGame(state, pet, challenge.id, { action: 'reveal', row: 5, col: 5 }, now);
  for (let index = 0; index < 100 && !result.finished; index += 1) {
    if (challenge.minesweeperBoard[index] === -1 || challenge.minesweeperRevealed[index]) continue;
    now = new Date(now.getTime() + 10);
    result = playMinesweeperGame(state, pet, challenge.id, { action: 'reveal', row: Math.floor(index / 10), col: index % 10 }, now);
  }
  assert.equal(result.cleared, true);
  assert.equal(result.reward, 100);
  assert.equal(pet.stats.points, pointsBefore + 100);
  assert.ok(pet.records.minesweeperNormalBestMs > 0);
  assert.equal(pet.records.minesweeperHardBestMs, 0);
});

test('포기는 0P이며 시작 전 포기는 횟수도 소모하지 않고 시작 후 포기는 사용 횟수를 돌려주지 않는다', () => {
  {
    const { state, pet } = stateWithPet('u-before', '시작전');
    const before = pet.daily.miniGamesPlayed;
    const challenge = startMine(state, pet);
    const pointsBefore = pet.stats.points;
    const result = abandonMinesweeperGame(state, pet, challenge.id, new Date(BASE.getTime() + 100));
    assert.equal(result.ok, true);
    assert.equal(result.reward, 0);
    assert.equal(pet.daily.miniGamesPlayed, before);
    assert.equal(pet.stats.points, pointsBefore);
  }
  {
    const { state, pet } = stateWithPet('u-after', '시작후');
    const before = pet.daily.miniGamesPlayed;
    const challenge = startMine(state, pet);
    playMinesweeperGame(state, pet, challenge.id, { action: 'reveal', row: 4, col: 4 }, BASE);
    const pointsBefore = pet.stats.points;
    const result = abandonMinesweeperGame(state, pet, challenge.id, new Date(BASE.getTime() + 1000));
    assert.equal(result.ok, true);
    assert.equal(result.reward, 0);
    assert.equal(pet.daily.miniGamesPlayed, before + 1);
    assert.equal(pet.stats.points, pointsBefore);
  }
});

test('지뢰찾기 랭킹은 난이도별 빠른 시간 우선, 완전 동률은 먼저 기록한 사람이 우선이다', () => {
  const state = initialState();
  const a = stateWithPet('a', '먼저', BASE);
  const b = stateWithPet('b', '나중', BASE);
  state.users = { ...a.state.users, ...b.state.users };
  state.pets = { ...a.state.pets, ...b.state.pets };
  const pets = Object.values(state.pets);
  pets[0].records.minesweeperNormalBestMs = 12340;
  pets[0].records.minesweeperNormalBestAt = '2026-08-15T09:01:00.000Z';
  pets[1].records.minesweeperNormalBestMs = 12340;
  pets[1].records.minesweeperNormalBestAt = '2026-08-15T09:02:00.000Z';
  pets[1].records.minesweeperHardBestMs = 30000;
  pets[1].records.minesweeperHardBestAt = '2026-08-15T09:03:00.000Z';
  const view = minesweeperRankingsView(state, pets[1].id, BASE);
  assert.equal(view.normal[0].displayName, '먼저레고');
  assert.equal(view.normal[1].displayName, '나중레고');
  assert.equal(view.hard[0].displayName, '나중레고');
  assert.equal(view.mine.normal.rank, 2);
  assert.equal(view.mine.hard.rank, 1);
});

test('6시간 게임 하루 경계에서 보통/어려움 기록을 초기화하고 직전 1위에게 다음 게임 하루 칭호를 준다', () => {
  const beforeBoundary = new Date('2026-08-15T08:59:00.000Z'); // KST 17:59
  const afterBoundary = new Date('2026-08-15T09:01:00.000Z'); // KST 18:01
  const { state, pet } = stateWithPet('champ', '챔피언', beforeBoundary);
  state.minesweeperSeason = normalizeMinesweeperSeason(null, beforeBoundary);
  pet.records.minesweeperNormalBestMs = 11100;
  pet.records.minesweeperNormalBestAt = '2026-08-15T08:30:00.000Z';
  pet.records.minesweeperHardBestMs = 55000;
  pet.records.minesweeperHardBestAt = '2026-08-15T08:40:00.000Z';
  const settled = processMinesweeperSeason(state, afterBoundary);
  assert.equal(settled.changed, true);
  assert.equal(settled.champions.length, 2);
  assert.equal(pet.records.minesweeperNormalBestMs, 0);
  assert.equal(pet.records.minesweeperHardBestMs, 0);
  assert.ok(new Date(pet.seasonBadges.minesweeperNormal).getTime() > afterBoundary.getTime());
  assert.ok(new Date(pet.seasonBadges.minesweeperHard).getTime() > afterBoundary.getTime());
});

import { authRequest, createRoom, register, responseJson } from './helpers.js';

test('지뢰찾기 API는 난이도·첫 클릭 차감·포기 흐름을 연결하고 숨은 지뢰 배열을 응답에 노출하지 않는다', async () => {
  const { room } = await createRoom();
  const token = await register(room, '지뢰테스트');
  const started = await responseJson(await room.fetch(authRequest('/api/minigames/start', token, {
    method: 'POST', body: JSON.stringify({ gameId: 'minesweeper', difficulty: 'hard' })
  })));
  assert.equal(started.data.ok, true, JSON.stringify(started.data));
  const challenge = started.data.bootstrap.activeMiniChallenge;
  assert.equal(challenge.gameId, 'minesweeper');
  assert.equal(challenge.difficulty, 'hard');
  assert.equal(challenge.rows, 16);
  assert.equal(challenge.cols, 16);
  assert.equal(challenge.mines, 40);
  assert.equal(challenge.startedAt, null);
  assert.equal(started.data.bootstrap.dashboard.pet.daily.miniGamesPlayed, 0);
  assert.equal('minesweeperBoard' in challenge, false);

  const revealed = await responseJson(await room.fetch(authRequest('/api/minigames/minesweeper/action', token, {
    method: 'POST', body: JSON.stringify({ challengeId: challenge.id, action: 'reveal', row: 8, col: 8 })
  })));
  assert.equal(revealed.data.ok, true, JSON.stringify(revealed.data));
  assert.equal(revealed.data.bootstrap.dashboard.pet.daily.miniGamesPlayed, 1);
  assert.ok(revealed.data.challenge.startedAt);
  assert.equal('minesweeperBoard' in revealed.data.challenge, false);
  assert.equal(revealed.data.challenge.cells.length, 16);
  assert.equal(revealed.data.challenge.cells[0].length, 16);

  const abandoned = await responseJson(await room.fetch(authRequest('/api/minigames/minesweeper/abandon', token, {
    method: 'POST', body: JSON.stringify({ challengeId: challenge.id })
  })));
  assert.equal(abandoned.data.ok, true, JSON.stringify(abandoned.data));
  assert.equal(abandoned.data.reward, 0);
  assert.equal(abandoned.data.bootstrap.activeMiniChallenge, null);
  assert.equal(abandoned.data.bootstrap.dashboard.pet.daily.miniGamesPlayed, 1);
});

test('6시간 초기화 경계를 넘긴 진행 중 지뢰판은 새 시즌 기록으로 넘어가지 않고 0P 포기 종료된다', () => {
  const beforeBoundary = new Date('2026-08-15T08:58:00.000Z');
  const afterBoundary = new Date('2026-08-15T09:00:01.000Z');
  const { state, pet } = stateWithPet('boundary', '경계', beforeBoundary);
  state.minesweeperSeason = normalizeMinesweeperSeason(null, beforeBoundary);
  const challenge = startMine(state, pet, 'normal', beforeBoundary);
  playMinesweeperGame(state, pet, challenge.id, { action: 'reveal', row: 5, col: 5 }, beforeBoundary);
  const pointsBefore = pet.stats.points;
  const settled = processMinesweeperSeason(state, afterBoundary);
  assert.equal(settled.changed, true);
  assert.equal(challenge.completed, true);
  assert.equal(challenge.minesweeperStatus, 'abandoned');
  assert.equal(challenge.reward, 0);
  assert.equal(pet.stats.points, pointsBefore);
  const late = playMinesweeperGame(state, pet, challenge.id, { action: 'reveal', row: 0, col: 0 }, afterBoundary);
  assert.equal(late.ok, false);
  assert.equal(pet.records.minesweeperNormalBestMs, 0);
});
