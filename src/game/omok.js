import { id } from '../lib/ids.js';
import {
  BLACK, WHITE, OMOK_SIZE, boardIsFull, checkFive, createOmokBoard,
  isForbiddenMove, normalizeBoard
} from './omok-rules.js';

export const OMOK_MAX_ROOMS = 3;
export const OMOK_TURN_SECONDS = 30;
export const OMOK_MAX_CONSECUTIVE_TIMEOUTS = 3;

const nowIso = (date = new Date()) => date.toISOString();
const asTime = (value, fallback = null) => {
  const time = new Date(value ?? '').getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : fallback;
};
const int = (value, fallback = 0) => Math.max(0, Math.floor(Number.isFinite(Number(value)) ? Number(value) : fallback));

export function validOmokStake(value) {
  const stake = Number(value);
  return Number.isSafeInteger(stake) && (stake === 100 || stake === 500 || (stake >= 1000 && stake % 1000 === 0));
}

export function initialOmok() {
  return { version: 1, rooms: {} };
}

function normalizeSpectators(raw, state, playerIds) {
  const result = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return result;
  for (const [petId, spectator] of Object.entries(raw)) {
    const pet = state?.pets?.[petId];
    if (!pet?.alive || playerIds.has(petId)) continue;
    result[petId] = {
      petId,
      displayName: pet.displayName,
      joinedAt: asTime(spectator?.joinedAt, nowIso()),
      connected: Boolean(spectator?.connected)
    };
  }
  return result;
}

export function normalizeOmok(raw, state) {
  const base = initialOmok();
  const omok = raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...base, ...raw } : base;
  omok.rooms = omok.rooms && typeof omok.rooms === 'object' && !Array.isArray(omok.rooms) ? omok.rooms : {};
  for (const [roomId, roomRaw] of Object.entries(omok.rooms)) {
    if (!roomRaw || typeof roomRaw !== 'object' || Array.isArray(roomRaw) || !validOmokStake(roomRaw.stakePoints)) {
      delete omok.rooms[roomId];
      continue;
    }
    const host = state?.pets?.[String(roomRaw.hostPetId ?? '')];
    const guest = roomRaw.guestPetId ? state?.pets?.[String(roomRaw.guestPetId)] : null;
    if (!host?.alive) { delete omok.rooms[roomId]; continue; }
    const status = ['waiting', 'playing', 'ended'].includes(roomRaw.status) ? roomRaw.status : 'waiting';
    if (status !== 'waiting' && !guest?.alive) { delete omok.rooms[roomId]; continue; }
    const room = roomRaw;
    room.id = String(room.id || roomId);
    room.roomNumber = Math.max(1, Math.min(OMOK_MAX_ROOMS, int(room.roomNumber, 1)));
    room.status = status;
    room.hostPetId = host.id;
    room.guestPetId = guest?.id ?? null;
    room.stakePoints = Number(room.stakePoints);
    const playerIds = [host.id, guest?.id].filter(Boolean);
    room.blackPetId = playerIds.includes(room.blackPetId) ? room.blackPetId : null;
    room.whitePetId = playerIds.includes(room.whitePetId) ? room.whitePetId : null;
    if (room.blackPetId && room.whitePetId === room.blackPetId) room.whitePetId = null;
    room.board = normalizeBoard(room.board);
    room.currentTurnPetId = [room.blackPetId, room.whitePetId].filter(Boolean).includes(room.currentTurnPetId) ? room.currentTurnPetId : null;
    room.turnStartedAt = asTime(room.turnStartedAt);
    const timeouts = room.consecutiveTimeouts && typeof room.consecutiveTimeouts === 'object' && !Array.isArray(room.consecutiveTimeouts) ? room.consecutiveTimeouts : {};
    room.consecutiveTimeouts = {};
    for (const petId of [host.id, guest?.id].filter(Boolean)) room.consecutiveTimeouts[petId] = Math.min(OMOK_MAX_CONSECUTIVE_TIMEOUTS, int(timeouts[petId]));
    const escrow = room.escrow && typeof room.escrow === 'object' && !Array.isArray(room.escrow) ? room.escrow : {};
    room.escrow = {};
    for (const petId of [host.id, guest?.id].filter(Boolean)) room.escrow[petId] = int(escrow[petId]);
    room.winnerPetId = state?.pets?.[room.winnerPetId]?.alive ? room.winnerPetId : null;
    room.loserPetId = state?.pets?.[room.loserPetId]?.alive ? room.loserPetId : null;
    room.result = ['win', 'draw', 'forfeit', 'timeout'].includes(room.result) ? room.result : null;
    room.resultReason = typeof room.resultReason === 'string' ? room.resultReason.slice(0, 160) : null;
    room.settled = Boolean(room.settled);
    room.settlementId = room.settlementId ? String(room.settlementId) : null;
    room.rematchRequests = Array.isArray(room.rematchRequests) ? [...new Set(room.rematchRequests.map(String).filter((petId) => petId === host.id || petId === guest?.id))] : [];
    room.processedMoveIds = Array.isArray(room.processedMoveIds) ? [...new Set(room.processedMoveIds.map(String))].slice(-300) : [];
    room.moveCount = int(room.moveCount);
    room.createdAt = asTime(room.createdAt, nowIso());
    room.startedAt = asTime(room.startedAt);
    room.endedAt = asTime(room.endedAt);
    room.updatedAt = asTime(room.updatedAt, room.createdAt);
    room.spectators = normalizeSpectators(room.spectators, state, new Set([host.id, guest?.id].filter(Boolean)));
    omok.rooms[roomId] = room;
  }
  omok.version = 1;
  return omok;
}

function occupiedRoomNumbers(omok) {
  return new Set(Object.values(omok.rooms).map((room) => room.roomNumber));
}

function nextRoomNumber(omok) {
  const occupied = occupiedRoomNumbers(omok);
  for (let number = 1; number <= OMOK_MAX_ROOMS; number += 1) if (!occupied.has(number)) return number;
  return null;
}

function playerActiveRoom(omok, petId, exceptRoomId = null) {
  return Object.values(omok.rooms).find((room) => room.id !== exceptRoomId && room.status !== 'ended' && (room.hostPetId === petId || room.guestPetId === petId)) ?? null;
}

function roomPlayerIds(room) {
  return [room.hostPetId, room.guestPetId].filter(Boolean);
}

function opponentPetId(room, petId) {
  if (room.hostPetId === petId) return room.guestPetId;
  if (room.guestPetId === petId) return room.hostPetId;
  return null;
}

function ensureOmokRecords(pet) {
  pet.records ??= {};
  for (const key of ['omokWins', 'omokDraws', 'omokLosses']) pet.records[key] = int(pet.records[key]);
  pet.records.pointsEarned = int(pet.records.pointsEarned);
  pet.records.pointsSpent = int(pet.records.pointsSpent);
}

function deductStake(pet, stake) {
  ensureOmokRecords(pet);
  pet.stats.points = int(pet.stats.points);
  if (pet.stats.points < stake) return false;
  pet.stats.points -= stake;
  pet.records.pointsSpent += stake;
  return true;
}

function refundStake(pet, stake) {
  if (!pet?.alive || stake <= 0) return;
  ensureOmokRecords(pet);
  pet.stats.points += stake;
  pet.records.pointsSpent = Math.max(0, pet.records.pointsSpent - stake);
}

function finishRoom(state, room, { result, winnerPetId = null, loserPetId = null, reason = '' }, date = new Date()) {
  if (room.settled || room.status === 'ended') return { changed: false };
  const playerIds = roomPlayerIds(room);
  const stakes = Object.fromEntries(playerIds.map((petId) => [petId, int(room.escrow[petId])]));
  room.status = 'ended';
  room.result = result;
  room.winnerPetId = winnerPetId;
  room.loserPetId = loserPetId;
  room.resultReason = String(reason || '').slice(0, 160);
  room.endedAt = nowIso(date);
  room.turnStartedAt = null;
  room.currentTurnPetId = null;
  room.rematchRequests = [];
  room.settled = true;
  room.settlementId = room.settlementId || id('omoksettle');

  if (result === 'draw') {
    for (const petId of playerIds) {
      refundStake(state.pets[petId], stakes[petId]);
      ensureOmokRecords(state.pets[petId]);
      state.pets[petId].records.omokDraws += 1;
    }
  } else {
    const winner = state.pets[winnerPetId];
    const loser = state.pets[loserPetId];
    const pot = Object.values(stakes).reduce((sum, value) => sum + value, 0);
    if (winner?.alive) {
      ensureOmokRecords(winner);
      winner.stats.points += pot;
      winner.records.pointsEarned += pot;
      winner.records.omokWins += 1;
    }
    if (loser?.alive) {
      ensureOmokRecords(loser);
      loser.records.omokLosses += 1;
    }
  }
  for (const petId of playerIds) room.escrow[petId] = 0;
  room.updatedAt = nowIso(date);
  return { changed: true };
}

function initializeMatch(state, room, date = new Date()) {
  const host = state.pets[room.hostPetId];
  const guest = state.pets[room.guestPetId];
  if (!host?.alive || !guest?.alive) return { ok: false, message: '대전 상대를 찾을 수 없습니다.' };
  if (host.stats.points < room.stakePoints || guest.stats.points < room.stakePoints) return { ok: false, message: '두 플레이어 모두 판돈을 보유해야 시작할 수 있습니다.' };
  // 모든 검증이 끝난 뒤 같은 Durable Object 직렬 작업 안에서 양쪽을 함께 차감한다.
  if (!deductStake(host, room.stakePoints)) return { ok: false, message: `${host.displayName}의 포인트가 부족합니다.` };
  if (!deductStake(guest, room.stakePoints)) {
    refundStake(host, room.stakePoints);
    return { ok: false, message: `${guest.displayName}의 포인트가 부족합니다.` };
  }
  const blackFirst = Math.random() < 0.5;
  room.blackPetId = blackFirst ? host.id : guest.id;
  room.whitePetId = blackFirst ? guest.id : host.id;
  room.board = createOmokBoard();
  room.currentTurnPetId = room.blackPetId;
  room.turnStartedAt = nowIso(date);
  room.consecutiveTimeouts = { [host.id]: 0, [guest.id]: 0 };
  room.escrow = { [host.id]: room.stakePoints, [guest.id]: room.stakePoints };
  room.status = 'playing';
  room.startedAt = nowIso(date);
  room.endedAt = null;
  room.winnerPetId = null;
  room.loserPetId = null;
  room.result = null;
  room.resultReason = null;
  room.settled = false;
  room.settlementId = null;
  room.rematchRequests = [];
  room.processedMoveIds = [];
  room.moveCount = 0;
  room.updatedAt = nowIso(date);
  return { ok: true };
}

export function createOmokRoom(state, pet, stakeValue, date = new Date()) {
  const omok = state.omok = normalizeOmok(state.omok, state);
  const existing = playerActiveRoom(omok, pet.id);
  if (existing) return { ok: true, message: '이미 참가 중인 오목방을 열었습니다.', roomId: existing.id };
  if (Object.keys(omok.rooms).length >= OMOK_MAX_ROOMS) return { ok: false, message: '동시에 운영할 수 있는 오목방 3개가 모두 사용 중입니다.' };
  if (!validOmokStake(stakeValue)) return { ok: false, message: '판돈은 100P, 500P, 또는 1,000P 이상 1,000P 단위로 설정해주세요.' };
  const stakePoints = Number(stakeValue);
  if (pet.stats.points < stakePoints) return { ok: false, message: `보유 포인트가 부족합니다. 현재 ${pet.stats.points}P입니다.` };
  const roomNumber = nextRoomNumber(omok);
  if (!roomNumber) return { ok: false, message: '빈 오목방이 없습니다.' };
  const room = {
    id: id('omok'), roomNumber, status: 'waiting', hostPetId: pet.id, guestPetId: null,
    stakePoints, blackPetId: null, whitePetId: null, board: createOmokBoard(), currentTurnPetId: null,
    turnStartedAt: null, consecutiveTimeouts: { [pet.id]: 0 }, escrow: { [pet.id]: 0 },
    spectators: {}, winnerPetId: null, loserPetId: null, result: null, resultReason: null,
    settled: false, settlementId: null, rematchRequests: [], processedMoveIds: [], moveCount: 0,
    createdAt: nowIso(date), startedAt: null, endedAt: null, updatedAt: nowIso(date)
  };
  omok.rooms[room.id] = room;
  return { ok: true, message: `${roomNumber}번 오목방을 만들었습니다.`, roomId: room.id };
}

export function joinOmokRoom(state, pet, roomId, date = new Date()) {
  const omok = state.omok = normalizeOmok(state.omok, state);
  const room = omok.rooms[roomId];
  if (!room) return { ok: false, message: '오목방을 찾을 수 없습니다.' };
  if (room.hostPetId === pet.id || room.guestPetId === pet.id) return { ok: true, message: '이미 이 방의 플레이어입니다.', roomId: room.id };
  if (room.status !== 'waiting' || room.guestPetId) return { ok: false, message: '현재 플레이어로 참가할 수 없는 방입니다.' };
  if (playerActiveRoom(omok, pet.id)) return { ok: false, message: '한 사용자는 동시에 여러 오목방의 플레이어가 될 수 없습니다.' };
  if (room.hostPetId === pet.id) return { ok: false, message: '자기 자신과 대결할 수 없습니다.' };
  const host = state.pets[room.hostPetId];
  if (!host?.alive) return { ok: false, message: '방장을 찾을 수 없습니다.' };
  if (host.stats.points < room.stakePoints) return { ok: false, message: '방장의 포인트가 판돈보다 부족해 게임을 시작할 수 없습니다.' };
  if (pet.stats.points < room.stakePoints) return { ok: false, message: `판돈 ${room.stakePoints}P가 필요합니다.` };
  room.guestPetId = pet.id;
  delete room.spectators[pet.id];
  const started = initializeMatch(state, room, date);
  if (!started.ok) {
    room.guestPetId = null;
    return started;
  }
  return { ok: true, message: '상대 참가가 확정되어 오목게임을 시작했습니다.', roomId: room.id };
}

export function spectateOmokRoom(state, pet, roomId, date = new Date()) {
  const omok = state.omok = normalizeOmok(state.omok, state);
  const room = omok.rooms[roomId];
  if (!room) return { ok: false, message: '오목방을 찾을 수 없습니다.' };
  if (room.status !== 'playing') return { ok: false, message: '게임 중인 방만 새로 관전할 수 있습니다.' };
  if (room.hostPetId === pet.id || room.guestPetId === pet.id) return { ok: false, message: '플레이어는 관전자로 들어갈 수 없습니다.' };
  room.spectators[pet.id] = { petId: pet.id, displayName: pet.displayName, joinedAt: room.spectators[pet.id]?.joinedAt ?? nowIso(date), connected: true };
  room.updatedAt = nowIso(date);
  return { ok: true, message: '오목 관전을 시작했습니다.', roomId: room.id };
}

export function leaveOmokSpectator(state, pet, roomId, date = new Date()) {
  const omok = state.omok = normalizeOmok(state.omok, state);
  const room = omok.rooms[roomId];
  if (!room?.spectators?.[pet.id]) return { ok: false, message: '관전 중인 방이 아닙니다.' };
  delete room.spectators[pet.id];
  room.updatedAt = nowIso(date);
  return { ok: true, message: '오목 관전을 종료했습니다.' };
}

export function leaveOmokRoom(state, pet, roomId, date = new Date()) {
  const omok = state.omok = normalizeOmok(state.omok, state);
  const room = omok.rooms[roomId];
  if (!room) return { ok: false, message: '오목방을 찾을 수 없습니다.' };
  const isPlayer = room.hostPetId === pet.id || room.guestPetId === pet.id;
  if (!isPlayer) return leaveOmokSpectator(state, pet, roomId, date);
  if (room.status === 'waiting') {
    if (room.hostPetId !== pet.id) return { ok: false, message: '대기 중인 방을 나갈 수 없습니다.' };
    delete omok.rooms[room.id];
    return { ok: true, message: '오목방을 닫았습니다.' };
  }
  if (room.status === 'playing') {
    const opponent = opponentPetId(room, pet.id);
    finishRoom(state, room, { result: 'forfeit', winnerPetId: opponent, loserPetId: pet.id, reason: `${pet.displayName}이 게임 중 나가 기권패했습니다.` }, date);
    return { ok: true, message: '게임에서 나가 기권패 처리되었습니다.' };
  }
  delete omok.rooms[room.id];
  return { ok: true, message: '종료된 오목방에서 나갔습니다.' };
}

function forbiddenLabel(reason) {
  return ({ 'double-three': '33 금수', 'double-four': '44 금수', overline: '장목 금수', occupied: '이미 돌이 있는 자리', board: '바둑판 밖' })[reason] ?? '금수';
}

export function playOmokMove(state, pet, roomId, rowValue, colValue, requestIdValue, date = new Date()) {
  processOmokTimers(state, date);
  const omok = state.omok = normalizeOmok(state.omok, state);
  const room = omok.rooms[roomId];
  if (!room) return { ok: false, message: '오목방을 찾을 수 없습니다.' };
  const requestId = String(requestIdValue ?? '').trim().slice(0, 100);
  if (!requestId) return { ok: false, message: '착수 요청 ID가 필요합니다.' };
  if (room.processedMoveIds.includes(requestId)) return { ok: true, duplicate: true, message: '이미 처리된 착수 요청입니다.' };
  if (room.status !== 'playing' || room.settled) return { ok: false, message: '이미 종료되었거나 진행 중이 아닌 게임입니다.' };
  if (![room.hostPetId, room.guestPetId].includes(pet.id)) return { ok: false, message: '관전자 또는 비참가자는 착수할 수 없습니다.' };
  if (room.currentTurnPetId !== pet.id) return { ok: false, message: '현재 자신의 차례가 아닙니다.' };
  const row = Number(rowValue);
  const col = Number(colValue);
  if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row >= OMOK_SIZE || col < 0 || col >= OMOK_SIZE) return { ok: false, message: '착수 위치가 올바르지 않습니다.' };
  if (room.board[row][col] !== null) return { ok: false, message: '이미 돌이 놓인 자리입니다.' };
  const color = room.blackPetId === pet.id ? BLACK : WHITE;
  if (color === BLACK) {
    const forbidden = isForbiddenMove(room.board, row, col);
    if (forbidden.forbidden) return { ok: false, message: `${forbiddenLabel(forbidden.reason)}라 둘 수 없습니다.`, forbidden: forbidden.reason };
  }
  room.board[row][col] = color;
  room.processedMoveIds.push(requestId);
  room.processedMoveIds = room.processedMoveIds.slice(-300);
  room.moveCount += 1;
  room.consecutiveTimeouts[pet.id] = 0;
  room.updatedAt = nowIso(date);
  const won = color === BLACK
    ? checkFive(room.board, row, col, BLACK, { exact: true })
    : checkFive(room.board, row, col, WHITE, { exact: false });
  if (won) {
    const opponent = opponentPetId(room, pet.id);
    finishRoom(state, room, { result: 'win', winnerPetId: pet.id, loserPetId: opponent, reason: `${pet.displayName}이 오목을 완성했습니다.` }, date);
    return { ok: true, finished: true, message: '오목을 완성해 승리했습니다.' };
  }
  if (boardIsFull(room.board)) {
    finishRoom(state, room, { result: 'draw', reason: '바둑판이 가득 차 무승부입니다.' }, date);
    return { ok: true, finished: true, message: '바둑판이 가득 차 무승부가 되었습니다.' };
  }
  room.currentTurnPetId = opponentPetId(room, pet.id);
  room.turnStartedAt = nowIso(date);
  return { ok: true, finished: false, message: `${row + 1}행 ${col + 1}열에 착수했습니다.` };
}

function advanceRoomTimeout(state, room, date = new Date()) {
  if (room.status !== 'playing' || room.settled || !room.currentTurnPetId || !room.turnStartedAt) return false;
  let changed = false;
  for (let guard = 0; guard < 12 && room.status === 'playing'; guard += 1) {
    const startedAt = new Date(room.turnStartedAt).getTime();
    if (!Number.isFinite(startedAt)) { room.turnStartedAt = nowIso(date); return true; }
    const deadline = startedAt + OMOK_TURN_SECONDS * 1000;
    if (deadline > date.getTime()) break;
    changed = true;
    const timedOutPetId = room.currentTurnPetId;
    room.consecutiveTimeouts[timedOutPetId] = int(room.consecutiveTimeouts[timedOutPetId]) + 1;
    if (room.consecutiveTimeouts[timedOutPetId] >= OMOK_MAX_CONSECUTIVE_TIMEOUTS) {
      const winnerPetId = opponentPetId(room, timedOutPetId);
      const loser = state.pets[timedOutPetId];
      finishRoom(state, room, { result: 'timeout', winnerPetId, loserPetId: timedOutPetId, reason: `${loser?.displayName ?? '플레이어'}이 연속 3회 시간초과로 기권패했습니다.` }, new Date(deadline));
      break;
    }
    room.currentTurnPetId = opponentPetId(room, timedOutPetId);
    room.turnStartedAt = new Date(deadline).toISOString();
    room.updatedAt = room.turnStartedAt;
  }
  return changed;
}

export function processOmokTimers(state, date = new Date()) {
  const omok = state.omok = normalizeOmok(state.omok, state);
  let changed = false;
  for (const room of Object.values(omok.rooms)) if (advanceRoomTimeout(state, room, date)) changed = true;
  return { changed };
}

export function omokNextAlarmAt(state) {
  const omok = state.omok = normalizeOmok(state.omok, state);
  const times = Object.values(omok.rooms)
    .filter((room) => room.status === 'playing' && room.turnStartedAt)
    .map((room) => new Date(room.turnStartedAt).getTime() + OMOK_TURN_SECONDS * 1000)
    .filter(Number.isFinite);
  return times.length ? new Date(Math.min(...times)).toISOString() : null;
}

export function requestOmokRematch(state, pet, roomId, date = new Date()) {
  const omok = state.omok = normalizeOmok(state.omok, state);
  const room = omok.rooms[roomId];
  if (!room || room.status !== 'ended') return { ok: false, message: '종료된 오목방에서만 재대결할 수 있습니다.' };
  if (![room.hostPetId, room.guestPetId].includes(pet.id)) return { ok: false, message: '관전자는 재대결을 요청하거나 수락할 수 없습니다.' };
  const otherPetId = opponentPetId(room, pet.id);
  const other = state.pets[otherPetId];
  if (!other?.alive) return { ok: false, message: '상대방이 없어 재대결할 수 없습니다.' };
  if (!room.rematchRequests.includes(pet.id)) room.rematchRequests.push(pet.id);
  if (!room.rematchRequests.includes(otherPetId)) {
    room.updatedAt = nowIso(date);
    return { ok: true, pending: true, message: '재대결을 요청했습니다. 상대방의 수락을 기다립니다.' };
  }
  if (playerActiveRoom(omok, pet.id, room.id) || playerActiveRoom(omok, otherPetId, room.id)) {
    room.rematchRequests = [];
    return { ok: false, message: '둘 중 한 명이 다른 오목방에서 플레이 중입니다.' };
  }
  if (pet.stats.points < room.stakePoints || other.stats.points < room.stakePoints) {
    room.rematchRequests = [];
    return { ok: false, message: '둘 중 한 명의 포인트가 부족해 재대결을 시작할 수 없습니다.' };
  }
  const started = initializeMatch(state, room, date);
  if (!started.ok) { room.rematchRequests = []; return started; }
  return { ok: true, started: true, message: '재대결을 시작했습니다.' };
}

export function omokSetConnected(state, petId, connected) {
  const omok = state.omok = normalizeOmok(state.omok, state);
  let changed = false;
  for (const room of Object.values(omok.rooms)) {
    const spectator = room.spectators?.[petId];
    if (!spectator || spectator.connected === Boolean(connected)) continue;
    spectator.connected = Boolean(connected);
    changed = true;
  }
  return { changed };
}

export function removePetFromOmok(state, petId, date = new Date()) {
  const omok = state.omok = normalizeOmok(state.omok, state);
  for (const room of Object.values(omok.rooms)) {
    delete room.spectators?.[petId];
    if (room.status === 'waiting' && room.hostPetId === petId) delete omok.rooms[room.id];
    else if (room.status === 'playing' && [room.hostPetId, room.guestPetId].includes(petId)) {
      const opponent = opponentPetId(room, petId);
      if (state.pets[opponent]?.alive) finishRoom(state, room, { result: 'forfeit', winnerPetId: opponent, loserPetId: petId, reason: '플레이어 상태가 종료되어 기권패 처리되었습니다.' }, date);
    } else if (room.status === 'ended' && [room.hostPetId, room.guestPetId].includes(petId)) delete omok.rooms[room.id];
  }
}

export function omokRanking(state, limit = 5) {
  return Object.values(state.pets ?? {})
    .filter((pet) => pet?.alive)
    .map((pet) => {
      ensureOmokRecords(pet);
      return { petId: pet.id, displayName: pet.displayName, wins: pet.records.omokWins, draws: pet.records.omokDraws, losses: pet.records.omokLosses };
    })
    .filter((item) => item.wins || item.draws || item.losses)
    .sort((a, b) => b.wins - a.wins || a.losses - b.losses || b.draws - a.draws || a.displayName.localeCompare(b.displayName, 'ko'))
    .slice(0, limit)
    .map((item, index) => ({ ...item, rank: index + 1 }));
}

function playerView(state, petId) {
  const pet = state.pets[petId];
  return pet?.alive ? { petId: pet.id, displayName: pet.displayName } : null;
}

export function omokView(state, viewerPetId) {
  const omok = state.omok = normalizeOmok(state.omok, state);
  const rooms = Object.values(omok.rooms)
    .sort((a, b) => a.roomNumber - b.roomNumber || new Date(a.createdAt) - new Date(b.createdAt))
    .map((room) => {
      const viewerRole = room.hostPetId === viewerPetId || room.guestPetId === viewerPetId
        ? 'player'
        : room.spectators?.[viewerPetId] ? 'spectator' : 'none';
      return {
        id: room.id, roomNumber: room.roomNumber, status: room.status, stakePoints: room.stakePoints,
        host: playerView(state, room.hostPetId), guest: playerView(state, room.guestPetId),
        black: playerView(state, room.blackPetId), white: playerView(state, room.whitePetId),
        board: room.board.map((line) => [...line]), currentTurnPetId: room.currentTurnPetId,
        turnStartedAt: room.turnStartedAt, consecutiveTimeouts: { ...room.consecutiveTimeouts },
        spectatorCount: Object.values(room.spectators ?? {}).filter((item) => item.connected).length,
        viewerRole, isMyTurn: room.currentTurnPetId === viewerPetId,
        winnerPetId: room.winnerPetId, loserPetId: room.loserPetId, result: room.result, resultReason: room.resultReason,
        rematchRequests: [...room.rematchRequests], rematchRequestedByMe: room.rematchRequests.includes(viewerPetId),
        createdAt: room.createdAt, startedAt: room.startedAt, endedAt: room.endedAt, moveCount: room.moveCount
      };
    });
  return { rooms, maxRooms: OMOK_MAX_ROOMS, turnSeconds: OMOK_TURN_SECONDS, ranking: omokRanking(state, 5), serverTime: Date.now() };
}
