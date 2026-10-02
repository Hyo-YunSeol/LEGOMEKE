import test from 'node:test';
import assert from 'node:assert/strict';
import { stateWithUsers } from './helpers.js';
import {
  SICHUAN_TILE_COUNT, SICHUAN_TILES, canConnectSichuan, generateSichuanBoard,
  hasSichuanMove, createSichuanRoom, joinSichuanRoom, spectateSichuanRoom,
  playSichuanPair, processSichuanTimers, requestSichuanRematch, leaveSichuanRoom,
  sichuanRoomView, sichuanRanking, validSichuanStake
} from '../src/game/sichuan.js';

const at = (sec = 0) => new Date(Date.parse('2026-08-23T10:00:00.000Z') + sec * 1000);
const pets = (state) => Object.values(state.pets);

function setup(stake = 500, count = 2) {
  const names = Array.from({ length: count }, (_, index) => [`u${index + 1}`, `레고${index + 1}`]);
  const state = stateWithUsers(names, at());
  const ps = pets(state);
  for (const pet of ps) pet.stats.points = 10_000;
  const made = createSichuanRoom(state, ps[0], stake, at());
  assert.equal(made.ok, true, made.message);
  const joined = joinSichuanRoom(state, ps[1], made.roomId, at(1));
  assert.equal(joined.ok, true, joined.message);
  return { state, ps, roomId: made.roomId };
}

test('사천성 판돈 규칙은 기존 1:1 대전과 동일하다', () => {
  assert.equal(validSichuanStake(100), true);
  assert.equal(validSichuanStake(500), true);
  assert.equal(validSichuanStake(1000), true);
  assert.equal(validSichuanStake(4000), true);
  assert.equal(validSichuanStake(1500), false);
  assert.equal(validSichuanStake(50), false);
});

test('8×10 판은 20종 그림을 정확히 4개씩 생성한다', () => {
  const board = generateSichuanBoard();
  assert.equal(board.length, SICHUAN_TILE_COUNT);
  const counts = new Map();
  for (const tile of board) counts.set(tile, (counts.get(tile) || 0) + 1);
  assert.equal(counts.size, SICHUAN_TILES.length);
  for (const tile of SICHUAN_TILES) assert.equal(counts.get(tile.id), 4, tile.id);
  assert.equal(hasSichuanMove(board), true);
});

test('같은 그림은 직선과 판 바깥 경로를 포함해 최대 2회 꺾기로 연결한다', () => {
  const board = Array(SICHUAN_TILE_COUNT).fill(null);
  board[11] = 'cat';
  board[12] = 'cat';
  assert.equal(canConnectSichuan(board, 11, 12), true);

  const outside = Array(SICHUAN_TILE_COUNT).fill(null);
  outside[0] = 'moon';
  outside[9] = 'moon';
  for (let col = 1; col < 9; col += 1) outside[col] = 'cat';
  assert.equal(canConnectSichuan(outside, 0, 9), true, '윗쪽 판 바깥을 돌아 연결되어야 한다');

  outside[10] = 'diamond';
  assert.equal(canConnectSichuan(outside, 0, 10), false, '다른 그림은 연결할 수 없다');
});

test('두 플레이어는 완전히 같은 시작판을 받지만 진행판은 독립 복사본이다', () => {
  const { state, ps, roomId } = setup();
  const room = state.sichuan.rooms[roomId];
  const first = room.players[ps[0].id];
  const second = room.players[ps[1].id];
  assert.deepEqual(first.board, second.board);
  assert.notEqual(first.board, second.board);
  assert.equal(room.deadlineAt, at(151).toISOString());

  // 실제 제거 가능한 첫 쌍을 찾아 한쪽만 진행시킨다.
  let pair = null;
  for (let a = 0; a < first.board.length && !pair; a += 1) {
    for (let b = a + 1; b < first.board.length; b += 1) {
      if (canConnectSichuan(first.board, a, b)) { pair = [a, b]; break; }
    }
  }
  assert.ok(pair);
  const result = playSichuanPair(state, ps[0], roomId, { matchId: room.matchId, first: pair[0], second: pair[1], actionId: 'pair-one' }, at(2));
  assert.equal(result.ok, true);
  assert.equal(result.removed, true);
  assert.equal(room.players[ps[0].id].board[pair[0]], null);
  assert.notEqual(room.players[ps[1].id].board[pair[0]], null);
});

test('다른 그림 또는 연결 불가능 선택은 패와 판돈을 바꾸지 않는다', () => {
  const { state, ps, roomId } = setup();
  const room = state.sichuan.rooms[roomId];
  const player = room.players[ps[0].id];
  const first = player.board.findIndex(Boolean);
  const second = player.board.findIndex((tile, index) => index !== first && tile && tile !== player.board[first]);
  const before = structuredClone(player.board);
  const result = playSichuanPair(state, ps[0], roomId, { matchId: room.matchId, first, second, actionId: 'wrong-icons' }, at(2));
  assert.equal(result.ok, true);
  assert.equal(result.removed, false);
  assert.deepEqual(player.board, before);
  assert.equal(ps[0].stats.points, 9500);
});

test('제거 후 더 이상 가능한 쌍이 없으면 즉시 패배하고 상대가 판돈을 받는다', () => {
  const { state, ps, roomId } = setup(500);
  const room = state.sichuan.rooms[roomId];
  const player = room.players[ps[0].id];
  player.board = Array(SICHUAN_TILE_COUNT).fill(null);
  player.board[0] = 'cat';
  player.board[1] = 'cat';
  player.board[22] = 'soccer'; // 고의로 한 장만 남긴 복구 경계 상태: 제거 후 가능한 쌍 0개
  player.removedCount = 77;
  const result = playSichuanPair(state, ps[0], roomId, { matchId: room.matchId, first: 0, second: 1, actionId: 'blocked-after-pair' }, at(2));
  assert.equal(result.finished, true);
  assert.equal(result.blocked, true);
  assert.equal(room.status, 'ended');
  assert.equal(room.winnerPetId, ps[1].id);
  assert.equal(ps[1].stats.points, 10_500);
  assert.equal(ps[0].records.sichuanLosses, 1);
  assert.equal(ps[1].records.sichuanWins, 1);
});

test('2분30초 종료 시 더 많이 제거한 쪽이 승리하고 동점이면 판돈을 반환한다', () => {
  {
    const { state, ps, roomId } = setup(500);
    const room = state.sichuan.rooms[roomId];
    room.players[ps[0].id].removedCount = 30;
    room.players[ps[1].id].removedCount = 20;
    const timed = processSichuanTimers(state, at(152), { roomId });
    assert.equal(timed.settled, true);
    assert.equal(room.winnerPetId, ps[0].id);
    assert.equal(ps[0].stats.points, 10_500);
    assert.equal(ps[1].stats.points, 9_500);
  }
  {
    const { state, ps, roomId } = setup(500);
    const room = state.sichuan.rooms[roomId];
    room.players[ps[0].id].removedCount = 24;
    room.players[ps[1].id].removedCount = 24;
    processSichuanTimers(state, at(152), { roomId });
    assert.equal(room.result, 'draw');
    assert.equal(ps[0].stats.points, 10_000);
    assert.equal(ps[1].stats.points, 10_000);
    assert.equal(ps[0].records.sichuanDraws, 1);
    assert.equal(ps[1].records.sichuanDraws, 1);
  }
});

test('플레이어는 상대 전체 판을 받지 않고 관전자만 양쪽 판을 볼 수 있다', () => {
  const { state, ps, roomId } = setup(500, 3);
  const playerView = sichuanRoomView(state, roomId, ps[0].id, at(2));
  assert.equal(playerView.players[ps[0].id].board.length, 80);
  assert.equal(playerView.players[ps[1].id].board.length, 0);
  assert.equal(spectateSichuanRoom(state, ps[2], roomId, at(2)).ok, true);
  const spectatorView = sichuanRoomView(state, roomId, ps[2].id, at(2));
  assert.equal(spectatorView.viewerRole, 'spectator');
  assert.equal(spectatorView.players[ps[0].id].board.length, 80);
  assert.equal(spectatorView.players[ps[1].id].board.length, 80);
});

test('기권하고 나간 플레이어는 재대결 유령 인원으로 남지 않는다', () => {
  const { state, ps, roomId } = setup(100);
  const result = leaveSichuanRoom(state, ps[0], roomId, at(2));
  assert.equal(result.forfeited, true);
  assert.equal(state.sichuan.rooms[roomId].status, 'ended');
  assert.equal(sichuanRoomView(state, roomId, ps[0].id, at(2)).viewerRole, 'none');
  assert.equal(requestSichuanRematch(state, ps[0], roomId, at(3)).ok, false);
  assert.equal(requestSichuanRematch(state, ps[1], roomId, at(3)).ok, false);
});

test('사천성 시즌 랭킹은 승수 우선으로 정렬한다', () => {
  const state = stateWithUsers([['u1','A'],['u2','B'],['u3','C']], at());
  const ps = pets(state);
  ps[0].records.seasonSichuanWins = 3; ps[0].records.seasonSichuanLosses = 2;
  ps[1].records.seasonSichuanWins = 3; ps[1].records.seasonSichuanLosses = 1;
  ps[2].records.seasonSichuanWins = 2; ps[2].records.seasonSichuanDraws = 9;
  const rank = sichuanRanking(state, ps[0].id);
  assert.equal(rank.top[0].petId, ps[1].id);
  assert.equal(rank.top[1].petId, ps[0].id);
  assert.equal(rank.mine.rank, 2);
});

test('마지막 한 쌍을 제거하면 즉시 승리로 정산된다', () => {
  const { state, ps, roomId } = setup(500);
  const room = state.sichuan.rooms[roomId];
  const player = room.players[ps[0].id];
  player.board = Array(SICHUAN_TILE_COUNT).fill(null);
  player.board[0] = 'cat';
  player.board[1] = 'cat';
  player.removedCount = 78;
  const result = playSichuanPair(state, ps[0], roomId, { matchId: room.matchId, first: 0, second: 1, actionId: 'final-pair' }, at(2));
  assert.equal(result.ok, true);
  assert.equal(result.removed, true);
  assert.equal(result.finished, true);
  assert.equal(room.status, 'ended');
  assert.equal(room.players[ps[0].id].completed, true);
  assert.equal(room.winnerPetId, ps[0].id);
  assert.equal(ps[0].stats.points, 10_500);
});
