import test from 'node:test';
import assert from 'node:assert/strict';
import { stateWithUsers } from './helpers.js';
import {
  LEGODOKU_MAX_MISTAKES, LEGODOKU_MAX_ROOMS, LEGODOKU_MATCH_SECONDS, LEGODOKU_SIZE,
  countLegodokuSolutions, createLegodokuRoom, generateLegodokuPuzzle, joinLegodokuRoom,
  legodokuRanking, legodokuRoomView, playLegodokuCell, processLegodokuTimers,
  requestLegodokuRematch, spectateLegodokuRoom, validLegodokuStake
} from '../src/game/legodoku.js';

const BASE_MS = Date.parse('2026-09-01T07:00:00.000Z');
const at = (seconds = 0) => new Date(BASE_MS + seconds * 1000);
const pets = (state) => Object.values(state.pets);

function seeded(seed = 1) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function setup(stake = 500, count = 3) {
  const state = stateWithUsers(Array.from({ length: count }, (_, index) => [`u${index + 1}`, `레고${index + 1}`]), at());
  const ps = pets(state);
  for (const pet of ps) pet.stats.points = 10_000;
  const made = createLegodokuRoom(state, ps[0], stake, at());
  assert.equal(made.ok, true, made.message);
  const joined = joinLegodokuRoom(state, ps[1], made.roomId, at(1));
  assert.equal(joined.ok, true, joined.message);
  return { state, ps, roomId: made.roomId };
}

function assertConnectedRegions(regions) {
  for (let region = 0; region < 8; region += 1) {
    const indices = regions.map((value, index) => value === region ? index : -1).filter((index) => index >= 0);
    assert.ok(indices.length > 0, `영역 ${region}이 비어 있습니다.`);
    const target = new Set(indices);
    const seen = new Set([indices[0]]);
    const queue = [indices[0]];
    while (queue.length) {
      const index = queue.shift();
      const row = Math.floor(index / 8), col = index % 8;
      for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nr = row + dr, nc = col + dc;
        if (nr < 0 || nr >= 8 || nc < 0 || nc >= 8) continue;
        const next = nr * 8 + nc;
        if (!target.has(next) || seen.has(next)) continue;
        seen.add(next); queue.push(next);
      }
    }
    assert.equal(seen.size, target.size, `영역 ${region}은 한 덩어리로 이어져야 합니다.`);
  }
}

function assertValidSolution(puzzle) {
  assert.equal(puzzle.solution.length, 8);
  assert.equal(new Set(puzzle.solution.map((index) => Math.floor(index / 8))).size, 8, '행마다 1개여야 한다');
  assert.equal(new Set(puzzle.solution.map((index) => index % 8)).size, 8, '열마다 1개여야 한다');
  assert.equal(new Set(puzzle.solution.map((index) => puzzle.regions[index])).size, 8, '영역마다 1개여야 한다');
  const byRow = [...puzzle.solution].sort((a, b) => Math.floor(a / 8) - Math.floor(b / 8));
  for (let row = 1; row < byRow.length; row += 1) {
    assert.notEqual(Math.abs((byRow[row] % 8) - (byRow[row - 1] % 8)), 1, '바로 윗행 레고와 대각선으로 붙으면 안 된다');
  }
}

test('레고도쿠 확정 사양은 8×8·3분·3실수·3방이며 판돈 규칙은 기존 대전과 같다', () => {
  assert.equal(LEGODOKU_SIZE, 8);
  assert.equal(LEGODOKU_MATCH_SECONDS, 180);
  assert.equal(LEGODOKU_MAX_MISTAKES, 3);
  assert.equal(LEGODOKU_MAX_ROOMS, 3);
  assert.equal(validLegodokuStake(100), true);
  assert.equal(validLegodokuStake(500), true);
  assert.equal(validLegodokuStake(1000), true);
  assert.equal(validLegodokuStake(4000), true);
  assert.equal(validLegodokuStake(1500), false);
});

test('생성되는 레고도쿠 문제는 모두 중~중상이고 연결 영역·유일해·행열영역·대각선 규칙을 만족한다', () => {
  const random = seeded(20260901);
  const keys = new Set();
  for (let index = 0; index < 256; index += 1) {
    const puzzle = generateLegodokuPuzzle(random);
    assert.equal(puzzle.regions.length, 64);
    assert.ok(['중', '중상'].includes(puzzle.difficulty));
    assertConnectedRegions(puzzle.regions);
    assertValidSolution(puzzle);
    const solved = countLegodokuSolutions(puzzle.regions, 2);
    assert.equal(solved.count, 1, `문제 ${index}는 정답이 정확히 하나여야 한다`);
    assert.deepEqual([...solved.first].sort((a, b) => a - b), [...puzzle.solution].sort((a, b) => a - b));
    keys.add(puzzle.key);
  }
  assert.ok(keys.size > 120, `변형 문제 다양성이 부족합니다: ${keys.size}`);
});

test('두 플레이어는 같은 문제를 받고 경기 중 상대·관전자에게 정답 위치를 숨기고 진행도만 공개한다', () => {
  const { state, ps, roomId } = setup(500, 3);
  const room = state.legodoku.rooms[roomId];
  const correctIndex = room.puzzle.solution[0];
  const result = playLegodokuCell(state, ps[0], roomId, { matchId: room.matchId, index: correctIndex, actionId: 'correct-1' }, at(2));
  assert.equal(result.correct, true);
  assert.equal(spectateLegodokuRoom(state, ps[2], roomId, at(2)).ok, true);

  const hostView = legodokuRoomView(state, roomId, ps[0].id, at(2));
  const guestView = legodokuRoomView(state, roomId, ps[1].id, at(2));
  const spectatorView = legodokuRoomView(state, roomId, ps[2].id, at(2));
  assert.deepEqual(hostView.puzzle.regions, guestView.puzzle.regions);
  assert.equal(hostView.puzzle.solution.length, 0);
  assert.equal(guestView.puzzle.solution.length, 0);
  assert.equal(spectatorView.puzzle.solution.length, 0);
  assert.deepEqual(hostView.players[ps[0].id].confirmed, [correctIndex]);
  assert.deepEqual(guestView.players[ps[0].id].confirmed, []);
  assert.deepEqual(spectatorView.players[ps[0].id].confirmed, []);
  assert.equal(guestView.players[ps[0].id].foundCount, 1);
  assert.equal(spectatorView.players[ps[0].id].foundCount, 1);
});

test('오답은 실수를 올리고 3번째 오답에서 즉시 패배·판돈 정산하며 중복 actionId는 다시 처리하지 않는다', () => {
  const { state, ps, roomId } = setup(500, 2);
  const room = state.legodoku.rooms[roomId];
  const wrong = Array.from({ length: 64 }, (_, index) => index).filter((index) => !room.puzzle.solution.includes(index));
  const first = playLegodokuCell(state, ps[0], roomId, { matchId: room.matchId, index: wrong[0], actionId: 'wrong-1' }, at(2));
  assert.equal(first.correct, false);
  assert.equal(first.mistakes, 1);
  const duplicate = playLegodokuCell(state, ps[0], roomId, { matchId: room.matchId, index: wrong[0], actionId: 'wrong-1' }, at(2.1));
  assert.equal(duplicate.duplicate, true);
  assert.equal(room.players[ps[0].id].mistakes, 1);
  playLegodokuCell(state, ps[0], roomId, { matchId: room.matchId, index: wrong[1], actionId: 'wrong-2' }, at(3));
  const third = playLegodokuCell(state, ps[0], roomId, { matchId: room.matchId, index: wrong[2], actionId: 'wrong-3' }, at(4));
  assert.equal(third.finished, true);
  assert.equal(third.correct, false);
  assert.equal(room.status, 'ended');
  assert.equal(room.winnerPetId, ps[1].id);
  assert.equal(ps[0].records.legodokuLosses, 1);
  assert.equal(ps[1].records.legodokuWins, 1);
  assert.equal(ps[0].stats.points, 9_500);
  assert.equal(ps[1].stats.points, 10_500);
});

test('8개를 먼저 맞히면 즉시 승리하고 종료 뒤에는 정답 전체를 공개한다', () => {
  const { state, ps, roomId } = setup(100, 2);
  const room = state.legodoku.rooms[roomId];
  for (let index = 0; index < room.puzzle.solution.length; index += 1) {
    const result = playLegodokuCell(state, ps[0], roomId, { matchId: room.matchId, index: room.puzzle.solution[index], actionId: `head-${index}` }, at(2 + index));
    if (index < 7) assert.equal(result.finished, undefined);
    else assert.equal(result.finished, true);
  }
  assert.equal(room.status, 'ended');
  assert.equal(room.winnerPetId, ps[0].id);
  const guestView = legodokuRoomView(state, roomId, ps[1].id, at(10));
  assert.equal(guestView.puzzle.solution.length, 8);
  assert.equal(guestView.players[ps[0].id].confirmed.length, 8);
});

test('3분 종료는 정답 수 우선, 동수면 실수 적은 쪽, 모두 같으면 무승부다', () => {
  {
    const { state, ps, roomId } = setup(500, 2);
    const room = state.legodoku.rooms[roomId];
    room.players[ps[0].id].confirmed = room.puzzle.solution.slice(0, 5); room.players[ps[0].id].foundCount = 5;
    room.players[ps[1].id].confirmed = room.puzzle.solution.slice(0, 4); room.players[ps[1].id].foundCount = 4;
    const result = processLegodokuTimers(state, at(182), { roomId });
    assert.equal(result.settled, true);
    assert.equal(room.winnerPetId, ps[0].id);
  }
  {
    const { state, ps, roomId } = setup(500, 2);
    const room = state.legodoku.rooms[roomId];
    room.players[ps[0].id].confirmed = room.puzzle.solution.slice(0, 4); room.players[ps[0].id].foundCount = 4;
    room.players[ps[1].id].confirmed = room.puzzle.solution.slice(0, 4); room.players[ps[1].id].foundCount = 4;
    room.players[ps[0].id].mistakes = 1; room.players[ps[1].id].mistakes = 2;
    processLegodokuTimers(state, at(182), { roomId });
    assert.equal(room.winnerPetId, ps[0].id);
  }
  {
    const { state, ps, roomId } = setup(500, 2);
    const room = state.legodoku.rooms[roomId];
    room.players[ps[0].id].confirmed = room.puzzle.solution.slice(0, 4); room.players[ps[0].id].foundCount = 4;
    room.players[ps[1].id].confirmed = room.puzzle.solution.slice(0, 4); room.players[ps[1].id].foundCount = 4;
    room.players[ps[0].id].mistakes = 1; room.players[ps[1].id].mistakes = 1;
    processLegodokuTimers(state, at(182), { roomId });
    assert.equal(room.result, 'draw');
    assert.equal(ps[0].stats.points, 10_000);
    assert.equal(ps[1].stats.points, 10_000);
    assert.equal(ps[0].records.legodokuDraws, 1);
    assert.equal(ps[1].records.legodokuDraws, 1);
  }
});

test('레고도쿠 방은 정확히 3개까지만 만들 수 있다', () => {
  const state = stateWithUsers(Array.from({ length: 4 }, (_, index) => [`u${index + 1}`, `방장${index + 1}`]), at());
  const ps = pets(state);
  for (const pet of ps) pet.stats.points = 10_000;
  for (let index = 0; index < 3; index += 1) assert.equal(createLegodokuRoom(state, ps[index], 100, at(index)).ok, true);
  const fourth = createLegodokuRoom(state, ps[3], 100, at(4));
  assert.equal(fourth.ok, false);
  assert.match(fourth.message, /3개가 모두 사용 중/);
});

test('재대결은 양쪽 수락 뒤 판돈을 다시 차감하고 직전과 다른 새 문제로 시작한다', () => {
  const { state, ps, roomId } = setup(100, 2);
  const room = state.legodoku.rooms[roomId];
  const oldKey = room.puzzle.key;
  for (let index = 0; index < 8; index += 1) playLegodokuCell(state, ps[0], roomId, { matchId: room.matchId, index: room.puzzle.solution[index], actionId: `finish-${index}` }, at(2 + index));
  assert.equal(room.status, 'ended');
  const first = requestLegodokuRematch(state, ps[0], roomId, at(12));
  assert.equal(first.pending, true);
  const second = requestLegodokuRematch(state, ps[1], roomId, at(13));
  assert.equal(second.started, true);
  assert.equal(room.status, 'playing');
  assert.notEqual(room.puzzle.key, oldKey);
  assert.equal(room.players[ps[0].id].foundCount, 0);
  assert.equal(room.players[ps[1].id].mistakes, 0);
});

test('레고도쿠 시즌 랭킹은 승수 우선, 동률이면 패수 적은 순으로 정렬한다', () => {
  const state = stateWithUsers([['u1','A'],['u2','B'],['u3','C']], at());
  const ps = pets(state);
  ps[0].records.seasonLegodokuWins = 3; ps[0].records.seasonLegodokuLosses = 2;
  ps[1].records.seasonLegodokuWins = 3; ps[1].records.seasonLegodokuLosses = 1;
  ps[2].records.seasonLegodokuWins = 2; ps[2].records.seasonLegodokuDraws = 9;
  const ranking = legodokuRanking(state, ps[0].id);
  assert.equal(ranking.top[0].petId, ps[1].id);
  assert.equal(ranking.top[1].petId, ps[0].id);
  assert.equal(ranking.mine.rank, 2);
});
