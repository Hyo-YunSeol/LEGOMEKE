import { id } from '../lib/ids.js';
import { completeDailyGoal } from './progression.js';

export const BLOCK_BATTLE_WIDTH = 10;
export const BLOCK_BATTLE_HEIGHT = 20;
export const BLOCK_BATTLE_MAX_ROOMS = 3;
export const BLOCK_BATTLE_WAITING_ROOM_TTL_MS = 10 * 60_000;
export const BLOCK_BATTLE_ENDED_ROOM_TTL_MS = 10 * 60_000;
export const BLOCK_BATTLE_STAKES = Object.freeze([100, 500, 1000, 2000, 3000]);
export const BLOCK_BATTLE_RECONNECT_SECONDS = 30;
export const BLOCK_BATTLE_GRAVITY_MS = 700;
// 패킷별 왕복시간 차이 때문에 정상 700ms tick이 서버에 수십 ms 일찍 도착할 수 있다.
// 허용 시에도 lastGravityAt은 원래 700ms 경계로 기록해 낙하 속도를 가속할 수 없게 한다.
export const BLOCK_BATTLE_TICK_EARLY_TOLERANCE_MS = 120;
// 정상 플레이 중에는 클라이언트의 700ms tick이 낙하를 담당한다. 서버는 브라우저가
// 멈추거나 네트워크가 끊겨 tick이 장시간 오지 않을 때만 안전망으로 따라잡는다.
// 이 유예가 없으면 수동 입력 직전 서버 자동 중력이 먼저 실행되어 블록이 한 칸
// 튀거나 같은 낙하가 두 번 적용된 것처럼 보일 수 있다.
export const BLOCK_BATTLE_SERVER_FALLBACK_IDLE_MS = BLOCK_BATTLE_GRAVITY_MS * 3;
export const BLOCK_BATTLE_BATCH_HISTORY = 96;

const TYPES = Object.freeze(['I', 'J', 'L', 'O', 'S', 'T', 'Z']);
const GARBAGE = 'G';
const ATTACK_LINES = Object.freeze({ 1: 0, 2: 1, 3: 2, 4: 4 });
const VALID_ACTIONS = new Set(['left', 'right', 'rotate', 'softDrop', 'hardDrop', 'tick']);

export const TETROMINO_SHAPES = Object.freeze({
  I: Object.freeze([
    [[0, 1], [1, 1], [2, 1], [3, 1]], [[2, 0], [2, 1], [2, 2], [2, 3]],
    [[0, 2], [1, 2], [2, 2], [3, 2]], [[1, 0], [1, 1], [1, 2], [1, 3]]
  ]),
  J: Object.freeze([
    [[0, 0], [0, 1], [1, 1], [2, 1]], [[1, 0], [2, 0], [1, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [2, 2]], [[1, 0], [1, 1], [0, 2], [1, 2]]
  ]),
  L: Object.freeze([
    [[2, 0], [0, 1], [1, 1], [2, 1]], [[1, 0], [1, 1], [1, 2], [2, 2]],
    [[0, 1], [1, 1], [2, 1], [0, 2]], [[0, 0], [1, 0], [1, 1], [1, 2]]
  ]),
  O: Object.freeze(Array.from({ length: 4 }, () => [[1, 0], [2, 0], [1, 1], [2, 1]])),
  S: Object.freeze([
    [[1, 0], [2, 0], [0, 1], [1, 1]], [[1, 0], [1, 1], [2, 1], [2, 2]],
    [[1, 1], [2, 1], [0, 2], [1, 2]], [[0, 0], [0, 1], [1, 1], [1, 2]]
  ]),
  T: Object.freeze([
    [[1, 0], [0, 1], [1, 1], [2, 1]], [[1, 0], [1, 1], [2, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [1, 2]], [[1, 0], [0, 1], [1, 1], [1, 2]]
  ]),
  Z: Object.freeze([
    [[0, 0], [1, 0], [1, 1], [2, 1]], [[2, 0], [1, 1], [2, 1], [1, 2]],
    [[0, 1], [1, 1], [1, 2], [2, 2]], [[1, 0], [0, 1], [1, 1], [0, 2]]
  ])
});

const nowIso = (date = new Date()) => date.toISOString();
const int = (value, fallback = 0) => Number.isFinite(Number(value)) ? Math.floor(Number(value)) : fallback;
const emptyBoard = () => Array.from({ length: BLOCK_BATTLE_HEIGHT }, () => Array(BLOCK_BATTLE_WIDTH).fill(null));
export function validBlockBattleStake(value) {
  const stake = Number(value);
  return Number.isSafeInteger(stake) && (stake === 100 || stake === 500 || (stake >= 1000 && stake % 1000 === 0));
}

function bumpRoomVersion(room, date = new Date()) {
  room.stateVersion = Math.max(0, int(room.stateVersion)) + 1;
  room.updatedAt = nowIso(date);
}

function shuffledBag() {
  const bag = [...TYPES];
  for (let index = bag.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [bag[index], bag[swap]] = [bag[swap], bag[index]];
  }
  return bag;
}

function normalizeBoard(raw) {
  return Array.from({ length: BLOCK_BATTLE_HEIGHT }, (_, row) => Array.from({ length: BLOCK_BATTLE_WIDTH }, (_, col) => {
    const value = raw?.[row]?.[col];
    return TYPES.includes(value) || value === GARBAGE ? value : null;
  }));
}

function fillQueue(player) {
  while (player.queue.length < 14) player.queue.push(...shuffledBag());
}

function spawnPiece(player) {
  fillQueue(player);
  const type = player.queue.shift();
  player.active = { type, rotation: 0, row: 0, col: 3 };
  fillQueue(player);
  return !collides(player.board, player.active);
}

function cellsFor(piece) {
  return TETROMINO_SHAPES[piece.type][piece.rotation].map(([x, y]) => [piece.row + y, piece.col + x]);
}

function collides(board, piece) {
  return cellsFor(piece).some(([row, col]) => col < 0 || col >= BLOCK_BATTLE_WIDTH || row >= BLOCK_BATTLE_HEIGHT || (row >= 0 && board[row][col]));
}

function movePiece(player, rowDelta, colDelta) {
  const candidate = { ...player.active, row: player.active.row + rowDelta, col: player.active.col + colDelta };
  if (collides(player.board, candidate)) return false;
  player.active = candidate;
  return true;
}

function rotatePiece(player) {
  const rotation = (player.active.rotation + 1) % 4;
  for (const colOffset of [0, -1, 1, -2, 2]) {
    const candidate = { ...player.active, rotation, col: player.active.col + colOffset };
    if (!collides(player.board, candidate)) {
      player.active = candidate;
      return true;
    }
  }
  return false;
}

function clearFullLines(player) {
  const kept = player.board.filter((row) => row.some((cell) => !cell));
  const cleared = BLOCK_BATTLE_HEIGHT - kept.length;
  while (kept.length < BLOCK_BATTLE_HEIGHT) kept.unshift(Array(BLOCK_BATTLE_WIDTH).fill(null));
  player.board = kept;
  player.lines += cleared;
  return cleared;
}

function addGarbage(player, amount) {
  const lines = Math.max(0, Math.min(8, int(amount)));
  for (let count = 0; count < lines; count += 1) {
    if (player.board[0].some(Boolean)) return false;
    player.board.shift();
    const hole = Math.floor(Math.random() * BLOCK_BATTLE_WIDTH);
    player.board.push(Array.from({ length: BLOCK_BATTLE_WIDTH }, (_, col) => col === hole ? null : GARBAGE));
  }
  player.receivedGarbage += lines;
  return true;
}

function opponentId(room, petId) {
  return room.hostPetId === petId ? room.guestPetId : room.hostPetId;
}

function finishRoom(state, room, loserPetId, reason, date = new Date()) {
  if (room.settled || room.status !== 'playing') return false;
  const winnerPetId = opponentId(room, loserPetId);
  const winner = state.pets[winnerPetId];
  const loser = state.pets[loserPetId];
  room.status = 'ended';
  room.winnerPetId = winner?.alive ? winnerPetId : null;
  room.loserPetId = loserPetId;
  room.resultReason = String(reason || '게임오버').slice(0, 160);
  room.endedAt = nowIso(date);
  bumpRoomVersion(room, date);
  room.settled = true;
  room.settlementId ||= id('blocksettle');
  room.rematchRequests = [];
  const pot = Object.values(room.escrow).reduce((sum, value) => sum + Math.max(0, int(value)), 0);
  if (winner?.alive) {
    winner.stats.points += pot;
    winner.records.pointsEarned += pot;
    winner.records.maxPoints = Math.max(int(winner.records.maxPoints), winner.stats.points);
    winner.records.blockBattleWins = int(winner.records.blockBattleWins) + 1;
  }
  if (loser?.alive) loser.records.blockBattleLosses = int(loser.records.blockBattleLosses) + 1;
  for (const petId of [room.hostPetId, room.guestPetId]) {
    const pet = state.pets[petId];
    if (pet?.alive) {
      pet.records.blockBattleGames = int(pet.records.blockBattleGames) + 1;
      completeDailyGoal(pet, 'blockBattlePlay', date);
    }
    room.escrow[petId] = 0;
  }
  return true;
}

function finishNoContest(state, room, reason, date = new Date()) {
  if (room.settled || room.status !== 'playing') return false;
  room.status = 'ended';
  room.winnerPetId = null;
  room.loserPetId = null;
  room.resultReason = String(reason || '대전 취소').slice(0, 160);
  room.endedAt = nowIso(date);
  bumpRoomVersion(room, date);
  room.settled = true;
  room.settlementId ||= id('blocksettle');
  room.rematchRequests = [];
  for (const petId of [room.hostPetId, room.guestPetId]) {
    const pet = state.pets[petId];
    const refund = Math.max(0, int(room.escrow[petId]));
    if (pet?.alive) {
      pet.stats.points += refund;
      pet.records.pointsSpent = Math.max(0, int(pet.records.pointsSpent) - refund);
    }
    room.escrow[petId] = 0;
  }
  return true;
}

function lockPiece(state, room, petId, date = new Date()) {
  const player = room.players[petId];
  for (const [row, col] of cellsFor(player.active)) {
    if (row < 0) {
      finishRoom(state, room, petId, `${player.displayName}의 블록이 천장에 닿았습니다.`, date);
      return { ended: true, cleared: 0, attack: 0 };
    }
    player.board[row][col] = player.active.type;
  }
  player.pieces += 1;
  const cleared = clearFullLines(player);
  let attack = ATTACK_LINES[cleared] ?? 0;
  const cancelled = Math.min(player.pendingGarbage, attack);
  player.pendingGarbage -= cancelled;
  attack -= cancelled;
  if (attack > 0) {
    const opponent = room.players[opponentId(room, petId)];
    opponent.pendingGarbage = Math.min(20, opponent.pendingGarbage + attack);
    player.attackSent += attack;
    room.lastAttack = { fromPetId: petId, toPetId: opponent.petId, lines: attack, at: nowIso(date) };
  } else if (player.pendingGarbage > 0) {
    const incoming = Math.min(8, player.pendingGarbage);
    player.pendingGarbage -= incoming;
    if (!addGarbage(player, incoming)) {
      finishRoom(state, room, petId, `${player.displayName}이 방해줄을 버티지 못했습니다.`, date);
      return { ended: true, cleared, attack: 0 };
    }
  }
  if (!spawnPiece(player)) {
    finishRoom(state, room, petId, `${player.displayName}의 블록이 천장에 닿았습니다.`, date);
    return { ended: true, cleared, attack };
  }
  player.lastGravityAt = nowIso(date);
  return { ended: room.status === 'ended', cleared, attack };
}

function applyAction(state, room, petId, action, date = new Date()) {
  const player = room.players[petId];
  if (!player?.active || room.status !== 'playing') return { changed: false };
  let gravityDate = date;
  if (action === 'tick') {
    const lastGravityMs = new Date(player.lastGravityAt).getTime();
    const gravity = blockBattleGravityMs(room, date);
    const elapsed = date.getTime() - lastGravityMs;
    // 클라이언트 tick은 서버 중력 시각을 깨우는 신호일 뿐이다. 예정 시각보다 이른
    // tick을 무제한 허용하면 가속되므로 작은 네트워크 지터만 허용한다. 허용 범위에서
    // 일찍 도착한 경우에도 중력 기준시각은 원래 예정시각으로 고정한다.
    if (!Number.isFinite(elapsed) || elapsed < gravity - BLOCK_BATTLE_TICK_EARLY_TOLERANCE_MS) return { changed: false };
    const scheduledAt = lastGravityMs + gravity;
    if (Number.isFinite(scheduledAt) && date.getTime() < scheduledAt) gravityDate = new Date(scheduledAt);
  }
  if (action === 'left') return { changed: movePiece(player, 0, -1) };
  if (action === 'right') return { changed: movePiece(player, 0, 1) };
  if (action === 'rotate') return { changed: rotatePiece(player) };
  if (action === 'hardDrop') {
    while (movePiece(player, 1, 0)) player.score += 2;
    const result = lockPiece(state, room, petId, date);
    return { changed: true, locked: true, ...result };
  }
  if (action === 'softDrop') {
    if (movePiece(player, 1, 0)) {
      player.score += 1;
      // 수동 하강 직후 기존 자동 낙하가 겹치면 한 번 눌렀는데 두 칸 움직인 것처럼
      // 느껴질 수 있다. 성공한 수동 하강을 새 중력 주기의 시작점으로 삼는다.
      player.lastGravityAt = nowIso(date);
      return { changed: true };
    }
    const result = lockPiece(state, room, petId, date);
    return { changed: true, locked: true, ...result };
  }
  if (movePiece(player, 1, 0)) {
    player.lastGravityAt = nowIso(gravityDate);
    return { changed: true };
  }
  const result = lockPiece(state, room, petId, gravityDate);
  return { changed: true, locked: true, ...result };
}

function normalizePlayer(raw, pet, date) {
  const player = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  player.petId = pet.id;
  player.userId = pet.userId;
  player.displayName = pet.displayName;
  player.board = normalizeBoard(player.board);
  player.queue = Array.isArray(player.queue) ? player.queue.filter((type) => TYPES.includes(type)).slice(0, 28) : [];
  player.active = player.active && TYPES.includes(player.active.type)
    ? { type: player.active.type, rotation: Math.max(0, Math.min(3, int(player.active.rotation))), row: int(player.active.row), col: int(player.active.col, 3) }
    : null;
  player.lines = Math.max(0, int(player.lines));
  player.score = Math.max(0, int(player.score));
  player.pieces = Math.max(0, int(player.pieces));
  player.attackSent = Math.max(0, int(player.attackSent));
  player.receivedGarbage = Math.max(0, int(player.receivedGarbage));
  player.pendingGarbage = Math.max(0, Math.min(20, int(player.pendingGarbage)));
  player.connected = player.connected !== false;
  player.reconnectDeadlineAt = Number.isFinite(new Date(player.reconnectDeadlineAt ?? '').getTime()) ? new Date(player.reconnectDeadlineAt).toISOString() : null;
  player.lastGravityAt = Number.isFinite(new Date(player.lastGravityAt ?? '').getTime()) ? new Date(player.lastGravityAt).toISOString() : nowIso(date);
  player.lastClientInputAt = Number.isFinite(new Date(player.lastClientInputAt ?? '').getTime()) ? new Date(player.lastClientInputAt).toISOString() : nowIso(date);
  if (!player.active) spawnPiece(player);
  fillQueue(player);
  return player;
}

function initialPlayer(pet, date = new Date()) {
  const player = {
    petId: pet.id, userId: pet.userId, displayName: pet.displayName,
    board: emptyBoard(), queue: [], active: null,
    lines: 0, score: 0, pieces: 0, attackSent: 0, receivedGarbage: 0, pendingGarbage: 0,
    connected: true, reconnectDeadlineAt: null, lastGravityAt: nowIso(date), lastClientInputAt: nowIso(date)
  };
  spawnPiece(player);
  return player;
}

export function initialBlockBattle() {
  return { version: 1, rooms: {} };
}

export function normalizeBlockBattle(raw, state, date = new Date()) {
  const battle = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : initialBlockBattle();
  battle.version = 1;
  battle.rooms = battle.rooms && typeof battle.rooms === 'object' && !Array.isArray(battle.rooms) ? battle.rooms : {};
  for (const [roomId, rawRoom] of Object.entries(battle.rooms)) {
    const host = state?.pets?.[rawRoom?.hostPetId];
    const guest = state?.pets?.[rawRoom?.guestPetId];
    const status = ['waiting', 'playing', 'ended'].includes(rawRoom?.status) ? rawRoom.status : 'waiting';
    if (!host?.alive || !validBlockBattleStake(rawRoom?.stakePoints) || (status !== 'waiting' && !guest?.alive)) {
      delete battle.rooms[roomId];
      continue;
    }
    const room = rawRoom;
    room.id = String(room.id || roomId);
    room.roomNumber = Math.max(1, Math.min(BLOCK_BATTLE_MAX_ROOMS, int(room.roomNumber, 1)));
    room.status = status;
    room.hostPetId = host.id;
    room.guestPetId = guest?.id ?? null;
    room.stakePoints = Number(room.stakePoints);
    room.matchId = String(room.matchId || id('blockmatch'));
    room.players = room.players && typeof room.players === 'object' && !Array.isArray(room.players) ? room.players : {};
    if (status !== 'waiting') {
      room.players[host.id] = normalizePlayer(room.players[host.id], host, date);
      room.players[guest.id] = normalizePlayer(room.players[guest.id], guest, date);
    } else room.players = {};
    room.spectators = room.spectators && typeof room.spectators === 'object' && !Array.isArray(room.spectators) ? room.spectators : {};
    for (const [petId, spectator] of Object.entries(room.spectators)) {
      const pet = state?.pets?.[petId];
      if (!pet?.alive || [host.id, guest?.id].includes(petId)) delete room.spectators[petId];
      else room.spectators[petId] = { petId, userId: pet.userId, displayName: pet.displayName, connected: spectator?.connected !== false, joinedAt: spectator?.joinedAt || nowIso(date) };
    }
    room.escrow = room.escrow && typeof room.escrow === 'object' && !Array.isArray(room.escrow) ? room.escrow : {};
    for (const petId of [host.id, guest?.id].filter(Boolean)) room.escrow[petId] = Math.max(0, int(room.escrow[petId]));
    // 재전송은 0.9초 안에 확인하므로 최근 요청만 보존하면 충분하다. 한 판이 길어져도
    // 요청 ID 배열의 복제·정규화·저장 비용이 계속 커지지 않도록 상한을 작게 고정한다.
    room.processedBatchIds = Array.isArray(room.processedBatchIds)
      ? [...new Set(room.processedBatchIds.map(String))].slice(-BLOCK_BATTLE_BATCH_HISTORY)
      : [];
    room.lastProcessedBatchByPet = room.lastProcessedBatchByPet && typeof room.lastProcessedBatchByPet === 'object' && !Array.isArray(room.lastProcessedBatchByPet)
      ? Object.fromEntries(Object.entries(room.lastProcessedBatchByPet)
        .filter(([petId, requestId]) => [host.id, guest?.id].includes(petId) && typeof requestId === 'string' && requestId.length <= 100))
      : {};
    room.stateVersion = Math.max(0, int(room.stateVersion));
    room.rematchRequests = Array.isArray(room.rematchRequests) ? [...new Set(room.rematchRequests.map(String).filter((petId) => [host.id, guest?.id].includes(petId)))] : [];
    room.settled = Boolean(room.settled);
    room.winnerPetId = state?.pets?.[room.winnerPetId]?.alive ? room.winnerPetId : null;
    room.loserPetId = state?.pets?.[room.loserPetId]?.alive ? room.loserPetId : null;
    room.createdAt = room.createdAt || nowIso(date);
    room.startedAt = room.startedAt || null;
    room.endedAt = room.endedAt || null;
    room.updatedAt = room.updatedAt || room.createdAt;
    battle.rooms[roomId] = room;
  }
  return battle;
}

function occupiedNumbers(battle) { return new Set(Object.values(battle.rooms).map((room) => room.roomNumber)); }
function nextRoomNumber(battle) {
  const occupied = occupiedNumbers(battle);
  for (let room = 1; room <= BLOCK_BATTLE_MAX_ROOMS; room += 1) if (!occupied.has(room)) return room;
  return null;
}
function activePlayerRoom(battle, petId, except = null) {
  return Object.values(battle.rooms).find((room) => room.id !== except && room.status !== 'ended' && [room.hostPetId, room.guestPetId].includes(petId)) ?? null;
}

export function createBlockBattleRoom(state, pet, stakeValue, date = new Date()) {
  const battle = state.blockBattle = normalizeBlockBattle(state.blockBattle, state, date);
  if (!validBlockBattleStake(stakeValue)) return { ok: false, message: '판돈은 100P, 500P, 또는 1,000P 이상 1,000P 단위로 설정해주세요.' };
  const existing = activePlayerRoom(battle, pet.id);
  if (existing) return { ok: true, roomId: existing.id, message: '이미 참가 중인 테트리스대전 방을 열었습니다.' };
  if (Object.keys(battle.rooms).length >= BLOCK_BATTLE_MAX_ROOMS) return { ok: false, message: '동시에 운영할 수 있는 테트리스대전 방 3개가 모두 사용 중입니다.' };
  if (pet.stats.points < Number(stakeValue)) return { ok: false, message: `판돈 ${stakeValue}P가 필요합니다.` };
  const roomNumber = nextRoomNumber(battle);
  const room = {
    id: id('blockroom'), roomNumber, status: 'waiting', hostPetId: pet.id, guestPetId: null,
    stakePoints: Number(stakeValue), matchId: id('blockmatch'), players: {}, spectators: {}, escrow: {},
    processedBatchIds: [], lastProcessedBatchByPet: {}, stateVersion: 0,
    rematchRequests: [], settled: false, settlementId: null,
    winnerPetId: null, loserPetId: null, resultReason: null, lastAttack: null,
    createdAt: nowIso(date), startedAt: null, endedAt: null, updatedAt: nowIso(date)
  };
  battle.rooms[room.id] = room;
  return { ok: true, roomId: room.id, message: `${roomNumber}번 테트리스대전 방을 만들었습니다.` };
}

function startMatch(state, room, date = new Date()) {
  const host = state.pets[room.hostPetId];
  const guest = state.pets[room.guestPetId];
  if (!host?.alive || !guest?.alive) return { ok: false, message: '두 플레이어를 모두 찾을 수 없습니다.' };
  if (host.stats.points < room.stakePoints || guest.stats.points < room.stakePoints) return { ok: false, message: '두 플레이어 모두 판돈을 보유해야 시작할 수 있습니다.' };
  host.stats.points -= room.stakePoints;
  host.records.pointsSpent += room.stakePoints;
  guest.stats.points -= room.stakePoints;
  guest.records.pointsSpent += room.stakePoints;
  room.escrow = { [host.id]: room.stakePoints, [guest.id]: room.stakePoints };
  room.players = { [host.id]: initialPlayer(host, date), [guest.id]: initialPlayer(guest, date) };
  room.status = 'playing';
  room.matchId = id('blockmatch');
  room.processedBatchIds = [];
  room.lastProcessedBatchByPet = {};
  room.rematchRequests = [];
  room.settled = false;
  room.settlementId = null;
  room.winnerPetId = null;
  room.loserPetId = null;
  room.resultReason = null;
  room.lastAttack = null;
  room.startedAt = nowIso(date);
  room.endedAt = null;
  bumpRoomVersion(room, date);
  return { ok: true };
}

export function joinBlockBattleRoom(state, pet, roomId, date = new Date()) {
  const battle = state.blockBattle = normalizeBlockBattle(state.blockBattle, state, date);
  const room = battle.rooms[roomId];
  if (!room) return { ok: false, message: '테트리스대전 방을 찾을 수 없습니다.' };
  if ([room.hostPetId, room.guestPetId].includes(pet.id)) return { ok: true, roomId, message: '이미 이 방의 플레이어입니다.' };
  if (room.status !== 'waiting' || room.guestPetId) return { ok: false, message: '현재 플레이어로 참가할 수 없는 방입니다.' };
  if (activePlayerRoom(battle, pet.id)) return { ok: false, message: '한 사용자는 동시에 여러 테트리스대전 방의 선수가 될 수 없습니다.' };
  if (pet.stats.points < room.stakePoints || state.pets[room.hostPetId].stats.points < room.stakePoints) return { ok: false, message: '둘 중 한 명의 포인트가 부족해 시작할 수 없습니다.' };
  room.guestPetId = pet.id;
  delete room.spectators[pet.id];
  const started = startMatch(state, room, date);
  if (!started.ok) { room.guestPetId = null; return started; }
  return { ok: true, roomId, started: true, message: '상대 참가가 확정되어 테트리스대전을 시작했습니다.' };
}

export function spectateBlockBattleRoom(state, pet, roomId, date = new Date()) {
  const battle = state.blockBattle = normalizeBlockBattle(state.blockBattle, state, date);
  const room = battle.rooms[roomId];
  if (!room || room.status !== 'playing') return { ok: false, message: '진행 중인 테트리스대전만 관전할 수 있습니다.' };
  if ([room.hostPetId, room.guestPetId].includes(pet.id)) return { ok: false, message: '플레이어는 관전자로 들어갈 수 없습니다.' };
  room.spectators[pet.id] = { petId: pet.id, userId: pet.userId, displayName: pet.displayName, connected: true, joinedAt: room.spectators[pet.id]?.joinedAt || nowIso(date) };
  bumpRoomVersion(room, date);
  return { ok: true, roomId, message: '테트리스대전 관전을 시작했습니다.' };
}

export function leaveBlockBattleSpectator(state, pet, roomId, date = new Date()) {
  const battle = state.blockBattle = normalizeBlockBattle(state.blockBattle, state, date);
  const target = battle.rooms[roomId];
  if (!target?.spectators?.[pet.id]) return { ok: false, message: '관전 중인 방이 아닙니다.' };
  delete target.spectators[pet.id];
  bumpRoomVersion(target, date);
  return { ok: true, message: '관전을 종료했습니다.' };
}

export function leaveBlockBattleRoom(state, pet, roomId, date = new Date()) {
  const battle = state.blockBattle = normalizeBlockBattle(state.blockBattle, state, date);
  const room = battle.rooms[roomId];
  if (!room) return { ok: false, message: '테트리스대전 방을 찾을 수 없습니다.' };
  if (![room.hostPetId, room.guestPetId].includes(pet.id)) return leaveBlockBattleSpectator(state, pet, roomId, date);
  if (room.status === 'waiting') { delete battle.rooms[roomId]; return { ok: true, message: '대기방을 닫았습니다.' }; }
  if (room.status === 'playing') finishRoom(state, room, pet.id, `${pet.displayName}이 나가 기권패했습니다.`, date);
  else delete battle.rooms[roomId];
  return { ok: true, message: room.status === 'ended' ? '테트리스대전 방에서 나갔습니다.' : '기권패 처리되었습니다.' };
}

export function playBlockBattleActions(state, pet, roomId, input = {}, date = new Date()) {
  const battle = state.blockBattle = normalizeBlockBattle(state.blockBattle, state, date);
  const room = battle.rooms[roomId];
  // 종료 직전 전송된 입력이나 이전 대전 입력은 사용자 잘못이 아니다. 클라이언트가
  // 오류 팝업 없이 입력 큐를 폐기할 수 있도록 명시적인 discard 상태를 내려준다.
  if (!room) return { ok: false, discarded: true, terminal: true, stale: true, message: '테트리스대전 방이 이미 정리되었습니다.' };
  if (room.status !== 'playing' || room.settled) return { ok: false, discarded: true, terminal: true, message: '이미 종료된 테트리스대전의 늦은 입력을 폐기했습니다.' };
  if (![room.hostPetId, room.guestPetId].includes(pet.id)) return { ok: false, message: '관전자는 블록을 조작할 수 없습니다.' };
  if (String(input.matchId || '') !== room.matchId) return { ok: false, discarded: true, stale: true, message: '이전 대전의 입력이라 무시했습니다.' };
  const batchId = String(input.requestId || '').trim().slice(0, 100);
  if (!batchId) return { ok: false, message: '입력 요청 ID가 필요합니다.' };
  if (room.processedBatchIds.includes(batchId)) {
    // HTTP fallback 재전송도 살아 있는 클라이언트의 신호다. 중복 배치를 상태 변경 없이
    // ACK하면서 heartbeat만 갱신해 같은 요청 직후 서버 fallback 중력이 끼어들지 않게 한다.
    if (room.players[pet.id]?.connected) room.players[pet.id].lastClientInputAt = nowIso(date);
    return { ok: true, duplicate: true, requestId: batchId, stateVersion: room.stateVersion, message: '이미 처리된 입력입니다.' };
  }
  const actions = Array.isArray(input.actions) ? input.actions.slice(0, 24).map(String) : [];
  if (!actions.length || actions.some((action) => !VALID_ACTIONS.has(action))) return { ok: false, message: '블록 입력이 올바르지 않습니다.' };
  if (!room.players[pet.id]?.connected) return { ok: false, discarded: true, paused: true, message: '재접속 처리가 끝나기 전의 입력을 폐기했습니다.' };
  if (Object.values(room.players).some((player) => !player.connected)) return { ok: false, discarded: true, paused: true, message: '상대 재접속을 기다리는 동안 들어온 입력을 폐기했습니다.' };
  // 이 플레이어의 클라이언트가 정상적으로 살아 있다는 신호다. 서버 자동 중력은
  // 이 시각을 기준으로 잠시 물러나고 클라이언트 tick과 경쟁하지 않는다.
  room.players[pet.id].lastClientInputAt = nowIso(date);
  room.processedBatchIds.push(batchId);
  room.processedBatchIds = room.processedBatchIds.slice(-BLOCK_BATTLE_BATCH_HISTORY);
  room.lastProcessedBatchByPet[pet.id] = batchId;
  let locked = false;
  let cleared = 0;
  let attack = 0;
  let changed = false;
  for (const action of actions) {
    if (room.status !== 'playing') break;
    const result = applyAction(state, room, pet.id, action, date);
    changed ||= Boolean(result.changed);
    locked ||= Boolean(result.locked);
    cleared += int(result.cleared);
    attack += int(result.attack);
  }
  // 벽에 붙은 채 반복된 좌우 입력이나 너무 이른 자동 낙하는 확인만 하고 상태 버전은
  // 올리지 않는다. 요청 ID는 저장되므로 재전송 멱등성과 클라이언트 ACK는 유지된다.
  if (room.status === 'playing' && changed) bumpRoomVersion(room, date);
  return { ok: true, requestId: batchId, stateVersion: room.stateVersion, changed, locked, cleared, attack, finished: room.status === 'ended', message: attack ? `${attack}줄 공격을 보냈습니다.` : locked ? '블록을 고정했습니다.' : changed ? '입력을 반영했습니다.' : '변경 없는 입력을 확인했습니다.' };
}

export function requestBlockBattleRematch(state, pet, roomId, date = new Date()) {
  const battle = state.blockBattle = normalizeBlockBattle(state.blockBattle, state, date);
  const room = battle.rooms[roomId];
  if (!room || room.status !== 'ended') return { ok: false, message: '종료된 방에서만 재대결할 수 있습니다.' };
  if (![room.hostPetId, room.guestPetId].includes(pet.id)) return { ok: false, message: '관전자는 재대결을 요청할 수 없습니다.' };
  if (!room.rematchRequests.includes(pet.id)) room.rematchRequests.push(pet.id);
  const otherId = opponentId(room, pet.id);
  if (!room.rematchRequests.includes(otherId)) return { ok: true, pending: true, message: '상대의 재대결 수락을 기다립니다.' };
  if (activePlayerRoom(battle, pet.id, room.id) || activePlayerRoom(battle, otherId, room.id)) { room.rematchRequests = []; return { ok: false, message: '둘 중 한 명이 다른 방에서 플레이 중입니다.' }; }
  const started = startMatch(state, room, date);
  if (!started.ok) room.rematchRequests = [];
  return started.ok ? { ok: true, started: true, message: '재대결을 시작했습니다.' } : started;
}

export function blockBattleSetConnected(state, petId, connected, date = new Date()) {
  const battle = state.blockBattle = normalizeBlockBattle(state.blockBattle, state, date);
  let changed = false;
  for (const room of Object.values(battle.rooms)) {
    const spectator = room.spectators?.[petId];
    if (spectator && spectator.connected !== Boolean(connected)) { spectator.connected = Boolean(connected); bumpRoomVersion(room, date); changed = true; }
    const player = room.players?.[petId];
    if (!player || room.status !== 'playing' || player.connected === Boolean(connected)) continue;
    player.connected = Boolean(connected);
    player.reconnectDeadlineAt = connected ? null : new Date(date.getTime() + BLOCK_BATTLE_RECONNECT_SECONDS * 1000).toISOString();
    if (connected) for (const member of Object.values(room.players)) {
      member.lastGravityAt = nowIso(date);
      member.lastClientInputAt = nowIso(date);
    }
    bumpRoomVersion(room, date);
    changed = true;
  }
  return { changed };
}

export function processBlockBattleTimers(state, date = new Date(), { roomId: targetRoomId = null } = {}) {
  const battle = state.blockBattle = normalizeBlockBattle(state.blockBattle, state, date);
  let changed = false;
  let settled = false;
  // 실시간 입력 경로에서는 해당 방만 처리한다. 예전에는 좌우 입력 한 번에도 모든
  // 테트리스 방의 중력 타이머를 훑어 다른 방 상태까지 바뀔 수 있었다.
  const roomEntries = targetRoomId
    ? (battle.rooms[targetRoomId] ? [[targetRoomId, battle.rooms[targetRoomId]]] : [])
    : Object.entries(battle.rooms);
  for (const [roomId, room] of roomEntries) {
    if (room.status === 'waiting') {
      const base = new Date(room.updatedAt ?? room.createdAt ?? '').getTime();
      if (Number.isFinite(base) && base + BLOCK_BATTLE_WAITING_ROOM_TTL_MS <= date.getTime()) { delete battle.rooms[roomId]; changed = true; }
      continue;
    }
    if (room.status === 'ended' && room.settled) {
      const base = new Date(room.endedAt ?? room.updatedAt ?? room.createdAt ?? '').getTime();
      if (Number.isFinite(base) && base + BLOCK_BATTLE_ENDED_ROOM_TTL_MS <= date.getTime()) { delete battle.rooms[roomId]; changed = true; }
      continue;
    }
    if (room.status !== 'playing') continue;
    const expiredDisconnected = Object.values(room.players).filter((player) => !player.connected && new Date(player.reconnectDeadlineAt).getTime() <= date.getTime());
    if (expiredDisconnected.length) {
      if (expiredDisconnected.length === Object.keys(room.players).length) finishNoContest(state, room, '양쪽 모두 재접속하지 않아 판돈을 반환하고 대전을 종료했습니다.', date);
      else finishRoom(state, room, expiredDisconnected[0].petId, `${expiredDisconnected[0].displayName}이 30초 안에 재접속하지 않아 기권패했습니다.`, date);
      changed = true;
      settled = true;
      continue;
    }
    if (Object.values(room.players).some((player) => !player.connected)) continue;
    const gravity = blockBattleGravityMs(room, date);
    let roomChanged = false;
    for (const player of Object.values(room.players)) {
      const lastClientInput = new Date(player.lastClientInputAt ?? '').getTime();
      // 최근 클라이언트 입력/tick이 도착했다면 서버는 중력을 적용하지 않는다.
      // 정상 플레이의 낙하 권한을 한쪽(클라이언트 tick)으로 고정해 서버 보정 때문에
      // 블록이 순간적으로 아래로 튀는 현상을 없앤다.
      if (Number.isFinite(lastClientInput) && date.getTime() - lastClientInput < BLOCK_BATTLE_SERVER_FALLBACK_IDLE_MS) continue;
      let last = new Date(player.lastGravityAt).getTime();
      if (!Number.isFinite(last)) last = date.getTime();
      let steps = Math.min(12, Math.floor((date.getTime() - last) / gravity));
      while (steps > 0 && room.status === 'playing') {
        const result = applyAction(state, room, player.petId, 'tick', new Date(last + gravity));
        last += gravity;
        steps -= 1;
        if (!result.changed) continue;
        changed = true;
        roomChanged = true;
        if (room.status === 'ended') settled = true;
      }
      player.lastGravityAt = new Date(Math.min(last, date.getTime())).toISOString();
    }
    if (roomChanged && room.status === 'playing') bumpRoomVersion(room, date);
  }
  return { changed, settled };
}

export function blockBattleGravityMs(_room, _date = new Date()) {
  // 플레이 시간이 길어져도 자동 낙하 주기를 가속하지 않는다.
  // 고정 주기로 유지해 후반부 tick/저장/동기화 처리량이 시간에 따라 폭증하지 않게 한다.
  return BLOCK_BATTLE_GRAVITY_MS;
}

export function blockBattleNextAlarmAt(state, date = new Date()) {
  const battle = normalizeBlockBattle(state.blockBattle, state, date);
  const candidates = [];
  const now = date.getTime();
  for (const room of Object.values(battle.rooms)) {
    if (room.status === 'waiting') candidates.push(new Date(room.updatedAt ?? room.createdAt ?? '').getTime() + BLOCK_BATTLE_WAITING_ROOM_TTL_MS);
    else if (room.status === 'ended' && room.settled) candidates.push(new Date(room.endedAt ?? room.updatedAt ?? room.createdAt ?? '').getTime() + BLOCK_BATTLE_ENDED_ROOM_TTL_MS);
    else if (room.status === 'playing') {
      for (const player of Object.values(room.players)) if (!player.connected && player.reconnectDeadlineAt) candidates.push(new Date(player.reconnectDeadlineAt).getTime());
      candidates.push(now + 1_000);
    }
  }
  const valid = candidates.filter((value) => Number.isFinite(value) && value > now);
  return valid.length ? new Date(Math.min(...valid)).toISOString() : null;
}

function playerPublic(player, { full = false, gravityMs = BLOCK_BATTLE_GRAVITY_MS } = {}) {
  const board = full ? player.board.map((row) => [...row]) : player.board.map((row) => row.map((cell) => cell ? 'X' : null));
  const lastGravityMs = new Date(player.lastGravityAt ?? '').getTime();
  const gravityDueAt = full && Number.isFinite(lastGravityMs)
    ? new Date(lastGravityMs + Math.max(1, Number(gravityMs) || BLOCK_BATTLE_GRAVITY_MS)).toISOString()
    : null;
  return {
    petId: player.petId, displayName: player.displayName, connected: player.connected,
    reconnectDeadlineAt: player.reconnectDeadlineAt, board,
    active: full && player.active ? { ...player.active } : null,
    next: full ? player.queue.slice(0, 3) : [],
    gravityDueAt,
    lines: player.lines, score: player.score, pieces: player.pieces,
    attackSent: player.attackSent, pendingGarbage: player.pendingGarbage
  };
}

function publicRoomView(state, room, viewerPetId, date) {
  const isPlayer = [room.hostPetId, room.guestPetId].includes(viewerPetId);
  const isSpectator = Boolean(room.spectators?.[viewerPetId]);
  const viewerRole = isPlayer ? 'player' : isSpectator ? 'spectator' : 'none';
  const host = state.pets[room.hostPetId];
  const guest = state.pets[room.guestPetId];
  const canViewBoards = isPlayer || isSpectator || room.status === 'ended';
  return {
    id: room.id, roomNumber: room.roomNumber, status: room.status, stakePoints: room.stakePoints,
    matchId: isPlayer ? room.matchId : null,
    host: host ? { petId: host.id, displayName: host.displayName } : null,
    guest: guest ? { petId: guest.id, displayName: guest.displayName } : null,
    viewerRole, spectatorCount: Object.keys(room.spectators).length,
    stateVersion: room.stateVersion,
    lastProcessedRequestId: isPlayer ? room.lastProcessedBatchByPet?.[viewerPetId] ?? null : null,
    players: canViewBoards && room.status !== 'waiting' ? {
      [room.hostPetId]: playerPublic(room.players[room.hostPetId], { full: true, gravityMs: blockBattleGravityMs(room, date) }),
      [room.guestPetId]: playerPublic(room.players[room.guestPetId], { full: true, gravityMs: blockBattleGravityMs(room, date) })
    } : {},
    selfPetId: isPlayer ? viewerPetId : null,
    opponentPetId: isPlayer ? opponentId(room, viewerPetId) : null,
    gravityMs: room.status === 'playing' ? blockBattleGravityMs(room, date) : null,
    lastAttack: room.lastAttack ? { ...room.lastAttack } : null,
    winnerPetId: room.winnerPetId, loserPetId: room.loserPetId, resultReason: room.resultReason,
    rematchRequestedByMe: room.rematchRequests.includes(viewerPetId),
    startedAt: room.startedAt, endedAt: room.endedAt, updatedAt: room.updatedAt
  };
}

export function blockBattleRoomView(state, roomId, viewerPetId, date = new Date()) {
  const battle = state.blockBattle = normalizeBlockBattle(state.blockBattle, state, date);
  const room = battle.rooms[roomId];
  return room ? publicRoomView(state, room, viewerPetId, date) : null;
}

export function blockBattleView(state, viewerPetId, date = new Date()) {
  const battle = state.blockBattle = normalizeBlockBattle(state.blockBattle, state, date);
  const rooms = Object.values(battle.rooms)
    .sort((a, b) => a.roomNumber - b.roomNumber)
    .map((room) => publicRoomView(state, room, viewerPetId, date));
  return { maxRooms: BLOCK_BATTLE_MAX_ROOMS, stakes: [...BLOCK_BATTLE_STAKES], width: BLOCK_BATTLE_WIDTH, height: BLOCK_BATTLE_HEIGHT, serverTime: date.getTime(), rooms };
}

export function clearEndedBlockBattleRooms(state, date = new Date()) {
  const battle = state.blockBattle = normalizeBlockBattle(state.blockBattle, state, date);
  const endedRoomIds = Object.values(battle.rooms).filter((room) => room.status === 'ended' && room.settled).map((room) => room.id);
  for (const roomId of endedRoomIds) delete battle.rooms[roomId];
  return { ok: true, cleared: endedRoomIds.length, message: endedRoomIds.length ? `종료된 테트리스대전 방 ${endedRoomIds.length}개를 비웠습니다.` : '비울 종료 테트리스대전 방이 없습니다.' };
}

export function blockBattleRankings(state, viewerPetId = null) {
  const entries = Object.values(state.pets ?? {}).filter((pet) => pet?.alive).map((pet) => ({
    petId: pet.id, displayName: pet.displayName,
    wins: Math.max(0, int(pet.records?.blockBattleWins)), losses: Math.max(0, int(pet.records?.blockBattleLosses))
  })).filter((entry) => entry.wins || entry.losses).sort((a, b) => b.wins - a.wins || a.losses - b.losses || a.displayName.localeCompare(b.displayName, 'ko'));
  const myIndex = viewerPetId ? entries.findIndex((entry) => entry.petId === viewerPetId) : -1;
  return {
    top: entries.slice(0, 5).map((entry, index) => ({ ...entry, rank: index + 1 })),
    mine: myIndex >= 0 ? { ...entries[myIndex], rank: myIndex + 1 } : null
  };
}

export function removePetFromBlockBattle(state, petId, date = new Date()) {
  const battle = state.blockBattle = normalizeBlockBattle(state.blockBattle, state, date);
  for (const room of Object.values(battle.rooms)) {
    delete room.spectators?.[petId];
    if (room.status === 'waiting' && room.hostPetId === petId) delete battle.rooms[room.id];
    else if (room.status === 'playing' && [room.hostPetId, room.guestPetId].includes(petId)) finishRoom(state, room, petId, '플레이어 상태가 종료되어 기권패 처리되었습니다.', date);
    else if (room.status === 'ended' && [room.hostPetId, room.guestPetId].includes(petId)) delete battle.rooms[room.id];
  }
}
