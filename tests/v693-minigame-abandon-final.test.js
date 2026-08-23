import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { startMiniGame, stopMiniGame, abandonMinesweeperGame } from '../src/game/engine.js';
import { authRequest, createRoom, register, responseJson, stateWithUsers } from './helpers.js';

const BASE = new Date('2026-08-23T14:00:00.000Z');

function setup(name = '포기테스트') {
  const state = stateWithUsers([['u1', name]], BASE);
  const pet = state.pets[state.users.u1.currentPetId];
  pet.stats.points = 1000;
  pet.stats.hunger = 100;
  return { state, pet };
}

test('사과게임 포기는 현재까지 획득 예정 포인트를 한 번만 정산하고 사용 횟수를 돌려주지 않는다', () => {
  const { state, pet } = setup('사과포기');
  const started = startMiniGame(state, pet, 'apple', BASE);
  assert.equal(started.ok, true);
  assert.equal(pet.daily.miniGamesPlayed, 1);
  const challenge = state.miniGameChallenges[started.challenge.id];
  challenge.applePendingPoints = 17;
  challenge.appleScore = 620;
  challenge.appleRemovedCount = 31;
  const result = stopMiniGame(state, pet, challenge.id, new Date(BASE.getTime() + 30_000));
  assert.equal(result.ok, true);
  assert.equal(result.finished, true);
  assert.equal(result.stopped, true);
  assert.equal(result.abandoned, true);
  assert.equal(result.reward, 17);
  assert.equal(pet.stats.points, 1017);
  assert.equal(pet.daily.miniGamesPlayed, 1);
  assert.equal(pet.records.appleBestScore, 620);
  const duplicate = stopMiniGame(state, pet, challenge.id, new Date(BASE.getTime() + 31_000));
  assert.equal(duplicate.ok, false);
  assert.equal(pet.stats.points, 1017);
});

test('블록게임 포기는 현재까지 획득 예정 포인트를 정산하고 ALL CLEAR 보너스를 임의로 지급하지 않는다', () => {
  const { state, pet } = setup('블록포기');
  const started = startMiniGame(state, pet, 'block', BASE);
  assert.equal(started.ok, true);
  const challenge = state.miniGameChallenges[started.challenge.id];
  challenge.blockPendingPoints = 29;
  challenge.blockRemovedCount = 7;
  challenge.blockRemainingCount = 113;
  challenge.blockMoveCount = 2;
  challenge.blockAllClear = false;
  const result = stopMiniGame(state, pet, challenge.id, new Date(BASE.getTime() + 1_000));
  assert.equal(result.ok, true);
  assert.equal(result.reward, 29);
  assert.equal(result.stopped, true);
  assert.equal(result.abandoned, true);
  assert.equal(result.allClear, false);
  assert.equal(pet.stats.points, 1029);
  assert.equal(pet.daily.miniGamesPlayed, 1);
});

test('지뢰찾기는 첫 클릭 전 포기하면 개인게임 횟수를 차감하지 않고 0P로 종료한다', () => {
  const { state, pet } = setup('지뢰포기');
  const started = startMiniGame(state, pet, 'minesweeper', BASE, { difficulty: 'normal' });
  assert.equal(started.ok, true);
  assert.equal(pet.daily.miniGamesPlayed, 0);
  const result = abandonMinesweeperGame(state, pet, started.challenge.id, new Date(BASE.getTime() + 1_000));
  assert.equal(result.ok, true);
  assert.equal(result.abandoned, true);
  assert.equal(result.reward, 0);
  assert.equal(pet.stats.points, 1000);
  assert.equal(pet.daily.miniGamesPlayed, 0);
});

test('사과·블록·지뢰찾기는 화면에서 동일한 포기하기 버튼 문구와 공통 스타일을 사용한다', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const styles = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
  assert.match(app, /apple-abandon-controls[^`]*data-action="abandon-mini"[^`]*>포기하기<\/button>/u);
  assert.match(app, /minesweeper-controls[^`]*data-action="minesweeper-abandon"[^`]*>포기하기<\/button>/u);
  assert.match(app, /block-controls[^`]*data-action="abandon-mini"[^`]*>포기하기<\/button>/u);
  assert.doesNotMatch(app, /그만하고 \$\{points\(challenge\.blockPendingPoints/u);
  assert.match(styles, /\.mini-abandon-controls/u);
  assert.match(styles, /\.mini-abandon-button/u);
});


test('사과게임 포기 API는 서버 정산을 한 번만 수행하고 재요청으로 중복 지급하지 않는다', async () => {
  const { room } = await createRoom();
  const token = await register(room, '사과API포기');
  const started = await responseJson(await room.fetch(authRequest('/api/minigames/start', token, {
    method: 'POST', body: JSON.stringify({ gameId: 'apple' })
  })));
  assert.equal(started.response.status, 200);
  let state = await room.store.load();
  const challenge = state.miniGameChallenges[started.data.challenge.id];
  challenge.applePendingPoints = 13;
  challenge.appleScore = 520;
  challenge.appleRemovedCount = 26;
  await room.store.save(state);

  const first = await responseJson(await room.fetch(authRequest('/api/minigames/stop', token, {
    method: 'POST', body: JSON.stringify({ challengeId: challenge.id })
  })));
  assert.equal(first.response.status, 200);
  assert.equal(first.data.abandoned, true);
  assert.equal(first.data.reward, 13);

  const duplicate = await responseJson(await room.fetch(authRequest('/api/minigames/stop', token, {
    method: 'POST', body: JSON.stringify({ challengeId: challenge.id })
  })));
  assert.equal(duplicate.response.status, 400);
  state = await room.store.load();
  const pet = Object.values(state.pets)[0];
  assert.equal(pet.stats.points, 13);
  assert.equal(pet.daily.miniGamesPlayed, 1);
});

test('블록게임 포기 API도 현재 예정 포인트만 지급하고 사용 횟수를 유지한다', async () => {
  const { room } = await createRoom();
  const token = await register(room, '블록API포기');
  const started = await responseJson(await room.fetch(authRequest('/api/minigames/start', token, {
    method: 'POST', body: JSON.stringify({ gameId: 'block' })
  })));
  assert.equal(started.response.status, 200);
  let state = await room.store.load();
  const challenge = state.miniGameChallenges[started.data.challenge.id];
  challenge.blockPendingPoints = 21;
  challenge.blockRemovedCount = 6;
  challenge.blockRemainingCount = 114;
  await room.store.save(state);

  const stopped = await responseJson(await room.fetch(authRequest('/api/minigames/stop', token, {
    method: 'POST', body: JSON.stringify({ challengeId: challenge.id })
  })));
  assert.equal(stopped.response.status, 200);
  assert.equal(stopped.data.abandoned, true);
  assert.equal(stopped.data.reward, 21);
  state = await room.store.load();
  const pet = Object.values(state.pets)[0];
  assert.equal(pet.stats.points, 21);
  assert.equal(pet.daily.miniGamesPlayed, 1);
});
