import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stateWithUsers } from './helpers.js';
import {
  SPOT_DIFFERENCE_HITBOXES,
  SPOT_DIFFERENCE_RECENT_HISTORY,
  createSpotDifferenceRoom,
  joinSpotDifferenceRoom,
  leaveSpotDifferenceRoom,
  playSpotDifferenceClick,
  requestSpotDifferenceRematch
} from '../src/game/spot-difference.js';

const BASE_MS = Date.parse('2026-08-31T09:00:00.000Z');
const atMs = (ms) => new Date(BASE_MS + ms);

function puzzleKey(puzzle) {
  return `v${Number(puzzle.assetVersion)}:${puzzle.themeId}:${Number(puzzle.variant)}:${[...puzzle.differenceIds].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))).join(',')}`;
}

function pointFor(puzzle, differenceId) {
  const hit = SPOT_DIFFERENCE_HITBOXES.find((item) => item.id === differenceId);
  assert.ok(hit, `missing ${differenceId}`);
  return { x: puzzle.mirrored ? 1 - hit.x : hit.x, y: hit.y };
}

function finishByHost(state, host, room, round) {
  const revealMs = Date.parse(room.revealAt);
  room.puzzle.differenceIds.forEach((differenceId, index) => {
    const { x, y } = pointFor(room.puzzle, differenceId);
    const result = playSpotDifferenceClick(state, host, room.id, {
      matchId: room.matchId,
      actionId: `bulk-${round}-${index}`,
      x,
      y
    }, new Date(revealMs + 50 + index * 20));
    assert.equal(result.ok, true, result.message);
    assert.equal(result.correct, true, result.message);
  });
  assert.equal(room.status, 'ended');
}

test('200판 연속 재대결에서도 같은 조합과 바로 전 테마를 재사용하지 않고 최근 기록은 200개로 제한한다', () => {
  const state = stateWithUsers([['combo-u1', '200판A'], ['combo-u2', '200판B']], atMs(0));
  const players = Object.values(state.pets);
  for (const pet of players) {
    pet.stats.points = 10_000_000;
    pet.daily.battleBonus = 1000;
  }

  const made = createSpotDifferenceRoom(state, players[0], 100, atMs(0));
  assert.equal(made.ok, true, made.message);
  const joined = joinSpotDifferenceRoom(state, players[1], made.roomId, atMs(1000));
  assert.equal(joined.ok, true, joined.message);

  const room = state.spotDifference.rooms[made.roomId];
  const seen = new Set();
  let previousTheme = null;

  for (let round = 0; round < 205; round += 1) {
    const key = puzzleKey(room.puzzle);
    assert.equal(seen.has(key), false, `round ${round + 1}: 최근 200판 안에 같은 조합이 재출제되었습니다.`);
    if (previousTheme) assert.notEqual(room.puzzle.themeId, previousTheme, `round ${round + 1}: 바로 전 테마가 반복되었습니다.`);
    seen.add(key);
    if (seen.size > SPOT_DIFFERENCE_RECENT_HISTORY) {
      // 이 테스트는 서버와 동일하게 최근 200개만 감시한다.
      const oldest = seen.values().next().value;
      seen.delete(oldest);
    }
    previousTheme = room.puzzle.themeId;

    finishByHost(state, players[0], room, round);
    if (round === 204) break;
    const base = 60_000 + round * 1000;
    const first = requestSpotDifferenceRematch(state, players[0], room.id, atMs(base));
    assert.equal(first.pending, true, first.message);
    const second = requestSpotDifferenceRematch(state, players[1], room.id, atMs(base + 10));
    assert.equal(second.started, true, second.message);
  }

  assert.equal(state.spotDifference.playerPuzzleHistory[players[0].id].length, SPOT_DIFFERENCE_RECENT_HISTORY);
  assert.equal(state.spotDifference.playerPuzzleHistory[players[1].id].length, SPOT_DIFFERENCE_RECENT_HISTORY);
  assert.ok(state.spotDifference.recentPuzzleKeys.length <= SPOT_DIFFERENCE_RECENT_HISTORY);
});

test('방을 완전히 나갔다 새 방을 만들어도 플레이어 최근판 기록과 직전 테마 금지가 유지된다', () => {
  const state = stateWithUsers([['combo-room-u1', '방이동A'], ['combo-room-u2', '방이동B']], atMs(0));
  const players = Object.values(state.pets);
  for (const pet of players) {
    pet.stats.points = 100_000;
    pet.daily.battleBonus = 100;
  }

  const firstMade = createSpotDifferenceRoom(state, players[0], 100, atMs(0));
  joinSpotDifferenceRoom(state, players[1], firstMade.roomId, atMs(1000));
  const firstRoom = state.spotDifference.rooms[firstMade.roomId];
  const oldKey = puzzleKey(firstRoom.puzzle);
  const oldTheme = firstRoom.puzzle.themeId;
  finishByHost(state, players[0], firstRoom, 'leave-room');

  assert.equal(leaveSpotDifferenceRoom(state, players[0], firstRoom.id, atMs(20_000)).ok, true);
  assert.equal(leaveSpotDifferenceRoom(state, players[1], firstRoom.id, atMs(20_010)).ok, true);
  assert.equal(state.spotDifference.rooms[firstRoom.id], undefined);

  const secondMade = createSpotDifferenceRoom(state, players[0], 100, atMs(21_000));
  assert.equal(secondMade.ok, true, secondMade.message);
  const secondJoined = joinSpotDifferenceRoom(state, players[1], secondMade.roomId, atMs(22_000));
  assert.equal(secondJoined.ok, true, secondJoined.message);
  const secondRoom = state.spotDifference.rooms[secondMade.roomId];
  assert.notEqual(puzzleKey(secondRoom.puzzle), oldKey);
  assert.notEqual(secondRoom.puzzle.themeId, oldTheme);
  assert.ok(state.spotDifference.playerPuzzleHistory[players[0].id].includes(oldKey));
});

test('사과게임 PC는 ResizeObserver 없이 CSS 고정 크기로 유지하고 모바일에서만 안정된 컨테이너 높이를 사용한다', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
  const start = app.indexOf('function syncAppleGameLayout()');
  const end = app.indexOf('function buildApplePrefix', start);
  const layout = app.slice(start, end);
  assert.doesNotMatch(app, /appleLayoutObserver/);
  assert.doesNotMatch(layout, /new ResizeObserver/);
  assert.doesNotMatch(layout, /stage\.clientHeight/);
  assert.match(layout, /if \(!compactViewport\) \{[\s\S]*board\.style\.removeProperty\('width'\)[\s\S]*board\.style\.removeProperty\('height'\)/);
  assert.match(layout, /game\.clientHeight - fixedHeight - verticalPadding - 4/);
  assert.match(css, /@media \(min-width:701px\) and \(pointer:fine\)[\s\S]*\.apple-board \{ width:min\(100%,520px\) !important; height:auto !important; aspect-ratio:1 \/ 1; \}/);
});

test('PC 1대1 랭킹은 한 줄 강제 배치가 아니라 카드 그리드로 줄바꿈한다', async () => {
  const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.battle-game-rank-grid\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important\}/);
  assert.match(css, /@media\(max-width:640px\)[\s\S]*\.battle-game-rank-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
});
