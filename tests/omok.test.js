import test from 'node:test';
import assert from 'node:assert/strict';
import { BLACK, WHITE, createOmokBoard, checkFive, isForbiddenMove, isOverline } from '../src/game/omok-rules.js';
import { createOmokRoom, joinOmokRoom, omokRanking, playOmokMove, processOmokTimers, requestOmokRematch, selectOmokColor, spectateOmokRoom, submitOmokRps, validOmokStake } from '../src/game/omok.js';
import { stateWithUsers } from './helpers.js';

const BASE = new Date('2026-08-07T06:00:00.000Z');


function resolveOmokStart(state, roomId, host, guest, date = BASE) {
  assert.equal(submitOmokRps(state, host, roomId, 'rock', date).ok, true);
  assert.equal(submitOmokRps(state, guest, roomId, 'scissors', new Date(date.getTime() + 1)).ok, true);
  assert.equal(selectOmokColor(state, host, roomId, 'black', new Date(date.getTime() + 2)).ok, true);
  const room = state.omok.rooms[roomId];
  assert.equal(room.phase, 'turn');
  assert.equal(room.blackPetId, host.id);
  return room;
}

test('오목 판돈 규칙을 서버에서 검증한다', () => {
  for (const value of [100, 500, 1000, 2000, 5000]) assert.equal(validOmokStake(value), true);
  for (const value of [0, 200, 1500, 2500, 999, 1000.5]) assert.equal(validOmokStake(value), false);
});

test('흑 장목 금지, 정확한 5목 승리, 백 5목 이상 승리', () => {
  const board = createOmokBoard();
  for (let col = 3; col <= 7; col += 1) board[7][col] = BLACK;
  assert.equal(checkFive(board, 7, 5, BLACK, { exact: true }), true);
  board[7][8] = BLACK;
  assert.equal(isOverline(board, 7, 8, BLACK), true);
  assert.equal(checkFive(board, 7, 8, BLACK, { exact: true }), false);
  const white = createOmokBoard();
  for (let col = 2; col <= 7; col += 1) white[4][col] = WHITE;
  assert.equal(checkFive(white, 4, 5, WHITE, { exact: false }), true);
});



test('가로·세로·양쪽 대각선 5목을 모두 판정한다', () => {
  const horizontal = createOmokBoard();
  for (let col = 3; col <= 7; col += 1) horizontal[7][col] = BLACK;
  assert.equal(checkFive(horizontal, 7, 5, BLACK, { exact: true }), true);

  const vertical = createOmokBoard();
  for (let row = 3; row <= 7; row += 1) vertical[row][7] = BLACK;
  assert.equal(checkFive(vertical, 5, 7, BLACK, { exact: true }), true);

  const downRight = createOmokBoard();
  for (let i = 0; i < 5; i += 1) downRight[2 + i][3 + i] = BLACK;
  assert.equal(checkFive(downRight, 4, 5, BLACK, { exact: true }), true);

  const downLeft = createOmokBoard();
  for (let i = 0; i < 5; i += 1) downLeft[2 + i][11 - i] = WHITE;
  assert.equal(checkFive(downLeft, 4, 9, WHITE, { exact: false }), true);
});

test('교차 열린 4 두 개를 만드는 흑 수는 44 금수', () => {
  const board = createOmokBoard();
  for (const col of [5, 6, 8]) board[7][col] = BLACK;
  for (const row of [5, 6, 8]) board[row][7] = BLACK;
  const result = isForbiddenMove(board, 7, 7);
  assert.equal(result.forbidden, true);
  assert.equal(result.reason, 'double-four');
});

test('상대 돌에 막힌 가짜 33 형태는 정상 수로 허용한다', () => {
  const board = createOmokBoard();
  board[7][6] = BLACK; board[7][8] = BLACK;
  board[6][7] = BLACK; board[8][7] = BLACK;
  board[7][5] = WHITE; board[5][7] = WHITE;
  const result = isForbiddenMove(board, 7, 7);
  assert.equal(result.forbidden, false);
});

test('교차 열린 3 두 개를 만드는 흑 수는 33 금수', () => {
  const board = createOmokBoard();
  board[7][6] = BLACK; board[7][8] = BLACK;
  board[6][7] = BLACK; board[8][7] = BLACK;
  const result = isForbiddenMove(board, 7, 7);
  assert.equal(result.forbidden, true);
  assert.equal(result.reason, 'double-three');
});

test('오목 참가 시 양쪽 판돈을 함께 확보하고 승리 정산은 한 번만 된다', () => {
  const state = stateWithUsers([['u1', '윤설'], ['u2', '민균']], BASE);
  const a = state.pets[state.users.u1.currentPetId];
  const b = state.pets[state.users.u2.currentPetId];
  a.stats.points = 5000; b.stats.points = 5000;
  const created = createOmokRoom(state, a, 500, BASE);
  assert.equal(created.ok, true);
  const originalRandom = Math.random;
  Math.random = () => 0;
  let joined;
  try { joined = joinOmokRoom(state, b, created.roomId, BASE); } finally { Math.random = originalRandom; }
  assert.equal(joined.ok, true);
  assert.equal(a.stats.points, 4500);
  assert.equal(b.stats.points, 4500);
  const room = resolveOmokStart(state, created.roomId, a, b, BASE);
  const black = state.pets[room.blackPetId];
  for (let col = 3; col <= 6; col += 1) room.board[7][col] = BLACK;
  room.currentTurnPetId = black.id;
  room.turnStartedAt = BASE.toISOString();
  const moved = playOmokMove(state, black, room.id, 7, 7, 'winning-move', new Date(BASE.getTime() + 1000));
  assert.equal(moved.finished, true);
  assert.equal(room.status, 'ended');
  const winnerPoints = black.stats.points;
  assert.equal(winnerPoints, 5500);
  assert.equal(black.records.omokWins, 1);
  const duplicate = playOmokMove(state, black, room.id, 7, 7, 'winning-move', new Date(BASE.getTime() + 1100));
  assert.equal(duplicate.duplicate, true);
  assert.equal(black.stats.points, winnerPoints);
  assert.equal(black.records.omokWins, 1);
});

test('관전자는 착수할 수 없고 게임 상태를 바꾸지 못한다', () => {
  const state = stateWithUsers([['u1', '윤설'], ['u2', '민균'], ['u3', '태섭']], BASE);
  const [a,b,c] = ['u1','u2','u3'].map((u) => state.pets[state.users[u].currentPetId]);
  for (const pet of [a,b,c]) pet.stats.points = 5000;
  const roomResult = createOmokRoom(state, a, 100, BASE);
  joinOmokRoom(state, b, roomResult.roomId, BASE);
  assert.equal(spectateOmokRoom(state, c, roomResult.roomId, BASE).ok, true);
  const before = JSON.stringify(state.omok.rooms[roomResult.roomId].board);
  const move = playOmokMove(state, c, roomResult.roomId, 0, 0, 'spectator-move', BASE);
  assert.equal(move.ok, false);
  assert.equal(JSON.stringify(state.omok.rooms[roomResult.roomId].board), before);
});

test('연속 3회 시간초과 시 상대 승리 및 정산', () => {
  const state = stateWithUsers([['u1', '윤설'], ['u2', '민균']], BASE);
  const a = state.pets[state.users.u1.currentPetId];
  const b = state.pets[state.users.u2.currentPetId];
  a.stats.points = 1000; b.stats.points = 1000;
  const created = createOmokRoom(state, a, 100, BASE);
  joinOmokRoom(state, b, created.roomId, BASE);
  const room = resolveOmokStart(state, created.roomId, a, b, BASE);
  const loser = state.pets[room.currentTurnPetId];
  room.consecutiveTimeouts[loser.id] = 2;
  room.turnStartedAt = BASE.toISOString();
  processOmokTimers(state, new Date(BASE.getTime() + 31_000));
  assert.equal(room.status, 'ended');
  assert.equal(room.result, 'timeout');
  assert.equal(room.loserPetId, loser.id);
  assert.equal(loser.records.omokLosses, 1);
});

test('오목방은 최대 3개까지만 생성된다', () => {
  const state = stateWithUsers([['u1','A'],['u2','B'],['u3','C'],['u4','D']], BASE);
  const pets = ['u1','u2','u3','u4'].map((u) => state.pets[state.users[u].currentPetId]);
  for (const pet of pets) pet.stats.points = 10000;
  assert.equal(createOmokRoom(state, pets[0], 100, BASE).ok, true);
  assert.equal(createOmokRoom(state, pets[1], 100, BASE).ok, true);
  assert.equal(createOmokRoom(state, pets[2], 100, BASE).ok, true);
  assert.equal(createOmokRoom(state, pets[3], 100, BASE).ok, false);
});


test('재대결은 양쪽 수락과 판돈 보유 확인 후 이전 판 상태를 완전히 초기화한다', () => {
  const state = stateWithUsers([['u1', '윤설'], ['u2', '민균']], BASE);
  const a = state.pets[state.users.u1.currentPetId];
  const b = state.pets[state.users.u2.currentPetId];
  a.stats.points = 3000; b.stats.points = 3000;
  const created = createOmokRoom(state, a, 500, BASE);
  joinOmokRoom(state, b, created.roomId, BASE);
  const room = resolveOmokStart(state, created.roomId, a, b, BASE);
  const black = state.pets[room.blackPetId];
  const white = state.pets[room.whitePetId];
  for (let col = 3; col <= 6; col += 1) room.board[7][col] = BLACK;
  room.currentTurnPetId = black.id;
  playOmokMove(state, black, room.id, 7, 7, 'finish-before-rematch', new Date(BASE.getTime() + 1000));
  assert.equal(room.status, 'ended');
  assert.equal(requestOmokRematch(state, black, room.id, new Date(BASE.getTime() + 2000)).pending, true);
  const second = requestOmokRematch(state, white, room.id, new Date(BASE.getTime() + 3000));
  assert.equal(second.started, true);
  assert.equal(room.status, 'playing');
  assert.equal(room.phase, 'rps');
  assert.equal(room.blackPetId, null);
  assert.equal(room.whitePetId, null);
  assert.equal(room.currentTurnPetId, null);
  assert.equal(room.moveCount, 0);
  assert.equal(room.settled, false);
  assert.equal(room.winnerPetId, null);
  assert.equal(room.loserPetId, null);
  assert.equal(room.result, null);
  assert.equal(room.rematchRequests.length, 0);
  assert.equal(room.processedMoveIds.length, 0);
  assert.equal(room.board.flat().every((cell) => cell === null), true);
  assert.equal(room.consecutiveTimeouts[a.id], 0);
  assert.equal(room.consecutiveTimeouts[b.id], 0);
  assert.equal(room.escrow[a.id], 500);
  assert.equal(room.escrow[b.id], 500);
});

test('재대결 시 한쪽 포인트가 부족하면 새 판돈을 차감하지 않고 시작을 막는다', () => {
  const state = stateWithUsers([['u1', 'A'], ['u2', 'B']], BASE);
  const a = state.pets[state.users.u1.currentPetId];
  const b = state.pets[state.users.u2.currentPetId];
  a.stats.points = 1000; b.stats.points = 1000;
  const created = createOmokRoom(state, a, 500, BASE);
  joinOmokRoom(state, b, created.roomId, BASE);
  const room = resolveOmokStart(state, created.roomId, a, b, BASE);
  const black = state.pets[room.blackPetId];
  const white = state.pets[room.whitePetId];
  for (let col = 3; col <= 6; col += 1) room.board[7][col] = BLACK;
  room.currentTurnPetId = black.id;
  playOmokMove(state, black, room.id, 7, 7, 'finish-low-balance', new Date(BASE.getTime() + 1000));
  white.stats.points = 0;
  const beforeBlack = black.stats.points;
  const beforeWhite = white.stats.points;
  requestOmokRematch(state, black, room.id, new Date(BASE.getTime() + 2000));
  const result = requestOmokRematch(state, white, room.id, new Date(BASE.getTime() + 3000));
  assert.equal(result.ok, false);
  assert.equal(room.status, 'ended');
  assert.equal(black.stats.points, beforeBlack);
  assert.equal(white.stats.points, beforeWhite);
  assert.deepEqual(room.rematchRequests, []);
});

test('오목 랭킹은 승리 많은 순, 동률이면 패배 적은 순으로 TOP 5를 표시한다', () => {
  const state = stateWithUsers([
    ['u1', '윤설'], ['u2', '민균'], ['u3', '태섭'], ['u4', '영광'],
    ['u5', '야옹'], ['u6', '콩순'], ['u7', '동은']
  ], BASE);
  const rows = [
    ['u1', 18, 2, 5],
    ['u2', 15, 1, 7],
    ['u3', 11, 4, 9],
    ['u4', 8, 0, 3],
    ['u5', 6, 2, 8],
    ['u6', 6, 1, 4],
    ['u7', 2, 9, 0]
  ];
  for (const [userId, wins, draws, losses] of rows) {
    const pet = state.pets[state.users[userId].currentPetId];
    pet.records.omokWins = wins;
    pet.records.omokDraws = draws;
    pet.records.omokLosses = losses;
  }

  const ranking = omokRanking(state, 5);
  assert.equal(ranking.length, 5);
  assert.deepEqual(ranking.map((item) => item.displayName), ['윤설레고', '민균레고', '태섭레고', '영광레고', '콩순레고']);
  assert.deepEqual(ranking.map((item) => item.rank), [1, 2, 3, 4, 5]);
  assert.deepEqual(ranking[4], {
    petId: state.users.u6.currentPetId,
    displayName: '콩순레고',
    wins: 6,
    draws: 1,
    losses: 4,
    rank: 5
  });
});
