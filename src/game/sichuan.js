import { id } from '../lib/ids.js';

export const SICHUAN_ROWS = 8;
export const SICHUAN_COLS = 10;
export const SICHUAN_TILE_COUNT = SICHUAN_ROWS * SICHUAN_COLS;
export const SICHUAN_MATCH_SECONDS = 150;
export const SICHUAN_MAX_ROOMS = 3;
export const SICHUAN_WAITING_ROOM_TTL_MS = 10 * 60_000;
export const SICHUAN_ENDED_ROOM_TTL_MS = 10 * 60_000;
export const SICHUAN_STAKES = Object.freeze([100, 500, 1000, 2000, 3000]);
export const SICHUAN_ACTION_HISTORY = 96;

export const SICHUAN_TILES = Object.freeze([
  { id: 'cat', label: '고양이', src: '/flex/cat.svg' },
  { id: 'soccer', label: '축구공', src: '/flex/soccer-ball.svg' },
  { id: 'crown', label: '왕관', src: '/flex/golden-crown.svg' },
  { id: 'moon', label: '달', src: '/flex/crescent-moon.svg' },
  { id: 'diamond', label: '다이아', src: '/flex/diamond.svg' },
  { id: 'guitar', label: '기타', src: '/flex/guitar.svg' },
  { id: 'book', label: '마법책', src: '/flex/magic-book.svg' },
  { id: 'planet', label: '행성', src: '/flex/planet.svg' },
  { id: 'flower', label: '벚꽃', src: '/flex/cherry-blossom.svg' },
  { id: 'dragon', label: '드래곤', src: '/flex/baby-dragon.svg' },
  { id: 'sword', label: '검', src: '/flex/sword.svg' },
  { id: 'shield', label: '방패', src: '/flex/shield.svg' },
  { id: 'teddy', label: '곰인형', src: '/flex/teddy-bear.svg' },
  { id: 'skate', label: '스케이트보드', src: '/flex/skateboard.svg' },
  { id: 'coffee', label: '커피', src: '/flex/americano.svg' },
  { id: 'ribbon', label: '리본', src: '/flex/ribbon.svg' },
  { id: 'trident', label: '삼지창', src: '/flex/trident.svg' },
  { id: 'sunglasses', label: '선글라스', src: '/flex/sunglasses.svg' },
  { id: 'briefcase', label: '가방', src: '/flex/briefcase.svg' },
  { id: 'crystal', label: '수정구슬', src: '/flex/crystal-ball.svg' }
]);

const VALID_TILE_IDS = new Set(SICHUAN_TILES.map((tile) => tile.id));
const nowIso = (date = new Date()) => date.toISOString();
const int = (value, fallback = 0) => Number.isFinite(Number(value)) ? Math.floor(Number(value)) : fallback;
const cloneBoard = (board) => board.map((value) => value ?? null);

export function validSichuanStake(value) {
  const stake = Number(value);
  return Number.isSafeInteger(stake) && (stake === 100 || stake === 500 || (stake >= 1000 && stake % 1000 === 0));
}

function bumpRoomVersion(room, date = new Date()) {
  room.stateVersion = Math.max(0, int(room.stateVersion)) + 1;
  room.updatedAt = nowIso(date);
}

function shuffled(values) {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

function normalizeIndex(value) {
  const index = int(value, -1);
  return index >= 0 && index < SICHUAN_TILE_COUNT ? index : -1;
}

function toPadded(index) {
  return { row: Math.floor(index / SICHUAN_COLS) + 1, col: index % SICHUAN_COLS + 1 };
}

export function canConnectSichuan(board, firstValue, secondValue) {
  const first = normalizeIndex(firstValue);
  const second = normalizeIndex(secondValue);
  if (first < 0 || second < 0 || first === second) return false;
  const tile = board?.[first];
  if (!tile || tile !== board?.[second]) return false;

  const height = SICHUAN_ROWS + 2;
  const width = SICHUAN_COLS + 2;
  const occupied = Array.from({ length: height }, () => Array(width).fill(false));
  for (let index = 0; index < SICHUAN_TILE_COUNT; index += 1) {
    if (!board[index]) continue;
    const point = toPadded(index);
    occupied[point.row][point.col] = true;
  }
  const start = toPadded(first);
  const target = toPadded(second);
  occupied[start.row][start.col] = false;
  occupied[target.row][target.col] = false;

  const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const queue = [];
  const best = new Map();
  for (let direction = 0; direction < directions.length; direction += 1) {
    const [dr, dc] = directions[direction];
    const row = start.row + dr;
    const col = start.col + dc;
    if (row < 0 || row >= height || col < 0 || col >= width) continue;
    if (occupied[row][col] && (row !== target.row || col !== target.col)) continue;
    queue.push({ row, col, direction, turns: 0 });
    best.set(`${row}:${col}:${direction}`, 0);
  }

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    if (current.row === target.row && current.col === target.col) return true;
    for (let direction = 0; direction < directions.length; direction += 1) {
      const turns = current.turns + (direction === current.direction ? 0 : 1);
      if (turns > 2) continue;
      const [dr, dc] = directions[direction];
      const row = current.row + dr;
      const col = current.col + dc;
      if (row < 0 || row >= height || col < 0 || col >= width) continue;
      if (occupied[row][col] && (row !== target.row || col !== target.col)) continue;
      const key = `${row}:${col}:${direction}`;
      if ((best.get(key) ?? 99) <= turns) continue;
      best.set(key, turns);
      queue.push({ row, col, direction, turns });
    }
  }
  return false;
}

export function sichuanAvailablePairs(board, { stopAfterFirst = false } = {}) {
  const positions = new Map();
  for (let index = 0; index < SICHUAN_TILE_COUNT; index += 1) {
    const tile = board?.[index];
    if (!tile) continue;
    if (!positions.has(tile)) positions.set(tile, []);
    positions.get(tile).push(index);
  }
  const pairs = [];
  for (const indexes of positions.values()) {
    for (let left = 0; left < indexes.length; left += 1) {
      for (let right = left + 1; right < indexes.length; right += 1) {
        if (!canConnectSichuan(board, indexes[left], indexes[right])) continue;
        pairs.push([indexes[left], indexes[right]]);
        if (stopAfterFirst) return pairs;
      }
    }
  }
  return pairs;
}

export function hasSichuanMove(board) {
  return sichuanAvailablePairs(board, { stopAfterFirst: true }).length > 0;
}

function solvesWithGreedy(board, attempts = 8) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const working = cloneBoard(board);
    let removed = 0;
    while (removed < SICHUAN_TILE_COUNT) {
      const pairs = sichuanAvailablePairs(working);
      if (!pairs.length) break;
      const [first, second] = pairs[Math.floor(Math.random() * pairs.length)];
      working[first] = null;
      working[second] = null;
      removed += 2;
    }
    if (removed === SICHUAN_TILE_COUNT) return true;
  }
  return false;
}

function fallbackSolvableBoard() {
  const pairTiles = shuffled(SICHUAN_TILES.flatMap((tile) => [tile.id, tile.id]));
  const board = Array(SICHUAN_TILE_COUNT).fill(null);
  let pairIndex = 0;
  for (let row = 0; row < SICHUAN_ROWS; row += 1) {
    const starts = row % 2 === 0 ? [0, 2, 4, 6, 8] : [8, 6, 4, 2, 0];
    for (const col of starts) {
      const tile = pairTiles[pairIndex++];
      board[row * SICHUAN_COLS + col] = tile;
      board[row * SICHUAN_COLS + col + 1] = tile;
    }
  }
  return board;
}

export function generateSichuanBoard() {
  const base = SICHUAN_TILES.flatMap((tile) => [tile.id, tile.id, tile.id, tile.id]);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const board = shuffled(base);
    if (solvesWithGreedy(board, 6)) return board;
  }
  return fallbackSolvableBoard();
}

function normalizeBoard(raw) {
  return Array.from({ length: SICHUAN_TILE_COUNT }, (_, index) => {
    const tile = raw?.[index];
    return VALID_TILE_IDS.has(tile) ? tile : null;
  });
}

function normalizePlayer(raw, pet) {
  const board = normalizeBoard(raw?.board);
  return {
    petId: pet.id,
    userId: pet.userId,
    displayName: pet.displayName,
    board,
    removedCount: Math.max(0, Math.min(SICHUAN_TILE_COUNT, int(raw?.removedCount, board.filter((tile) => !tile).length))),
    blocked: Boolean(raw?.blocked),
    completed: Boolean(raw?.completed),
    lastMove: raw?.lastMove && typeof raw.lastMove === 'object' ? {
      first: normalizeIndex(raw.lastMove.first), second: normalizeIndex(raw.lastMove.second), at: raw.lastMove.at || null
    } : null
  };
}

export function initialSichuan() {
  return { version: 1, rooms: {} };
}

export function normalizeSichuan(raw, state, date = new Date()) {
  const game = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : initialSichuan();
  game.version = 1;
  game.rooms = game.rooms && typeof game.rooms === 'object' && !Array.isArray(game.rooms) ? game.rooms : {};
  for (const [roomId, rawRoom] of Object.entries(game.rooms)) {
    const host = state?.pets?.[rawRoom?.hostPetId];
    const guest = state?.pets?.[rawRoom?.guestPetId];
    const status = ['waiting', 'playing', 'ended'].includes(rawRoom?.status) ? rawRoom.status : 'waiting';
    if (!host?.alive || !validSichuanStake(rawRoom?.stakePoints) || (status !== 'waiting' && !guest?.alive)) {
      delete game.rooms[roomId];
      continue;
    }
    const room = rawRoom;
    room.id = String(room.id || roomId);
    room.roomNumber = Math.max(1, Math.min(SICHUAN_MAX_ROOMS, int(room.roomNumber, 1)));
    room.status = status;
    room.hostPetId = host.id;
    room.guestPetId = guest?.id ?? null;
    room.stakePoints = Number(room.stakePoints);
    room.matchId = String(room.matchId || id('sichuanmatch'));
    room.players = room.players && typeof room.players === 'object' && !Array.isArray(room.players) ? room.players : {};
    if (status !== 'waiting') {
      room.players[host.id] = normalizePlayer(room.players[host.id], host);
      room.players[guest.id] = normalizePlayer(room.players[guest.id], guest);
    } else room.players = {};
    room.spectators = room.spectators && typeof room.spectators === 'object' && !Array.isArray(room.spectators) ? room.spectators : {};
    for (const [petId, spectator] of Object.entries(room.spectators)) {
      const pet = state?.pets?.[petId];
      if (!pet?.alive || [host.id, guest?.id].includes(petId)) delete room.spectators[petId];
      else room.spectators[petId] = { petId, userId: pet.userId, displayName: pet.displayName, joinedAt: spectator?.joinedAt || nowIso(date) };
    }
    room.escrow = room.escrow && typeof room.escrow === 'object' && !Array.isArray(room.escrow) ? room.escrow : {};
    for (const petId of [host.id, guest?.id].filter(Boolean)) room.escrow[petId] = Math.max(0, int(room.escrow[petId]));
    room.processedActionIds = Array.isArray(room.processedActionIds) ? [...new Set(room.processedActionIds.map(String))].slice(-SICHUAN_ACTION_HISTORY) : [];
    room.stateVersion = Math.max(0, int(room.stateVersion));
    room.rematchRequests = Array.isArray(room.rematchRequests) ? [...new Set(room.rematchRequests.map(String).filter((petId) => [host.id, guest?.id].includes(petId)))] : [];
    room.departedPetIds = Array.isArray(room.departedPetIds) ? [...new Set(room.departedPetIds.map(String).filter((petId) => [host.id, guest?.id].includes(petId)))] : [];
    room.settled = Boolean(room.settled);
    room.winnerPetId = state?.pets?.[room.winnerPetId]?.alive ? room.winnerPetId : null;
    room.loserPetId = state?.pets?.[room.loserPetId]?.alive ? room.loserPetId : null;
    room.result = ['win', 'draw'].includes(room.result) ? room.result : null;
    room.resultReason = room.resultReason ? String(room.resultReason).slice(0, 180) : null;
    room.createdAt = room.createdAt || nowIso(date);
    room.startedAt = room.startedAt || null;
    room.deadlineAt = room.deadlineAt || null;
    room.endedAt = room.endedAt || null;
    room.updatedAt = room.updatedAt || room.createdAt;
    game.rooms[roomId] = room;
  }
  return game;
}

function occupiedNumbers(game) { return new Set(Object.values(game.rooms).filter((room) => room.status !== 'ended').map((room) => room.roomNumber)); }
function nextRoomNumber(game) {
  const occupied = occupiedNumbers(game);
  for (let room = 1; room <= SICHUAN_MAX_ROOMS; room += 1) if (!occupied.has(room)) return room;
  return null;
}
function activePlayerRoom(game, petId, except = null) {
  return Object.values(game.rooms).find((room) => room.id !== except && room.status !== 'ended' && [room.hostPetId, room.guestPetId].includes(petId)) ?? null;
}
function opponentId(room, petId) { return room.hostPetId === petId ? room.guestPetId : room.hostPetId; }

function awardResultRecords(pet, { win = false, loss = false, draw = false } = {}) {
  if (!pet?.alive) return;
  pet.records ??= {};
  pet.records.sichuanGames = int(pet.records.sichuanGames) + 1;
  if (win) {
    pet.records.sichuanWins = int(pet.records.sichuanWins) + 1;
    pet.records.seasonSichuanWins = int(pet.records.seasonSichuanWins) + 1;
  }
  if (loss) {
    pet.records.sichuanLosses = int(pet.records.sichuanLosses) + 1;
    pet.records.seasonSichuanLosses = int(pet.records.seasonSichuanLosses) + 1;
  }
  if (draw) {
    pet.records.sichuanDraws = int(pet.records.sichuanDraws) + 1;
    pet.records.seasonSichuanDraws = int(pet.records.seasonSichuanDraws) + 1;
  }
}

function finishWin(state, room, winnerPetId, loserPetId, reason, date = new Date()) {
  if (room.settled || room.status !== 'playing') return false;
  const winner = state.pets[winnerPetId];
  const loser = state.pets[loserPetId];
  room.status = 'ended';
  room.result = 'win';
  room.winnerPetId = winner?.alive ? winnerPetId : null;
  room.loserPetId = loserPetId;
  room.resultReason = String(reason || '사천성 대전이 종료되었습니다.').slice(0, 180);
  room.endedAt = nowIso(date);
  room.deadlineAt = null;
  room.settled = true;
  room.settlementId ||= id('sichuansettle');
  room.rematchRequests = [];
  const pot = Object.values(room.escrow).reduce((sum, value) => sum + Math.max(0, int(value)), 0);
  if (winner?.alive) {
    winner.stats.points += pot;
    winner.records.pointsEarned += pot;
    winner.records.maxPoints = Math.max(int(winner.records.maxPoints), winner.stats.points);
  }
  awardResultRecords(winner, { win: true });
  awardResultRecords(loser, { loss: true });
  for (const petId of [room.hostPetId, room.guestPetId]) room.escrow[petId] = 0;
  bumpRoomVersion(room, date);
  return true;
}

function finishDraw(state, room, reason, date = new Date()) {
  if (room.settled || room.status !== 'playing') return false;
  room.status = 'ended';
  room.result = 'draw';
  room.winnerPetId = null;
  room.loserPetId = null;
  room.resultReason = String(reason || '동점으로 무승부 처리되었습니다.').slice(0, 180);
  room.endedAt = nowIso(date);
  room.deadlineAt = null;
  room.settled = true;
  room.settlementId ||= id('sichuansettle');
  room.rematchRequests = [];
  for (const petId of [room.hostPetId, room.guestPetId]) {
    const pet = state.pets[petId];
    const refund = Math.max(0, int(room.escrow[petId]));
    if (pet?.alive) {
      pet.stats.points += refund;
      pet.records.pointsSpent = Math.max(0, int(pet.records.pointsSpent) - refund);
      awardResultRecords(pet, { draw: true });
    }
    room.escrow[petId] = 0;
  }
  bumpRoomVersion(room, date);
  return true;
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
  const board = generateSichuanBoard();
  room.escrow = { [host.id]: room.stakePoints, [guest.id]: room.stakePoints };
  room.players = {
    [host.id]: { petId: host.id, userId: host.userId, displayName: host.displayName, board: cloneBoard(board), removedCount: 0, blocked: false, completed: false, lastMove: null },
    [guest.id]: { petId: guest.id, userId: guest.userId, displayName: guest.displayName, board: cloneBoard(board), removedCount: 0, blocked: false, completed: false, lastMove: null }
  };
  room.status = 'playing';
  room.matchId = id('sichuanmatch');
  room.processedActionIds = [];
  room.rematchRequests = [];
  room.departedPetIds = [];
  room.settled = false;
  room.settlementId = null;
  room.winnerPetId = null;
  room.loserPetId = null;
  room.result = null;
  room.resultReason = null;
  room.startedAt = nowIso(date);
  room.deadlineAt = new Date(date.getTime() + SICHUAN_MATCH_SECONDS * 1000).toISOString();
  room.endedAt = null;
  bumpRoomVersion(room, date);
  return { ok: true };
}

export function createSichuanRoom(state, pet, stakeValue, date = new Date()) {
  const game = state.sichuan = normalizeSichuan(state.sichuan, state, date);
  if (!validSichuanStake(stakeValue)) return { ok: false, message: '판돈은 100P, 500P, 또는 1,000P 이상 1,000P 단위로 설정해주세요.' };
  const existing = activePlayerRoom(game, pet.id);
  if (existing) return { ok: true, roomId: existing.id, message: '이미 참가 중인 사천성 대전방을 열었습니다.' };
  if (Object.values(game.rooms).filter((room) => room.status !== 'ended').length >= SICHUAN_MAX_ROOMS) return { ok: false, message: '동시에 운영할 수 있는 사천성 대전방 3개가 모두 사용 중입니다.' };
  if (pet.stats.points < Number(stakeValue)) return { ok: false, message: `판돈 ${stakeValue}P가 필요합니다.` };
  const roomNumber = nextRoomNumber(game);
  const room = {
    id: id('sichuanroom'), roomNumber, status: 'waiting', hostPetId: pet.id, guestPetId: null,
    stakePoints: Number(stakeValue), matchId: id('sichuanmatch'), players: {}, spectators: {}, escrow: {},
    processedActionIds: [], stateVersion: 0, rematchRequests: [], departedPetIds: [], settled: false, settlementId: null,
    winnerPetId: null, loserPetId: null, result: null, resultReason: null,
    createdAt: nowIso(date), startedAt: null, deadlineAt: null, endedAt: null, updatedAt: nowIso(date)
  };
  game.rooms[room.id] = room;
  return { ok: true, roomId: room.id, message: `${roomNumber}번 사천성 대전방을 만들었습니다.` };
}

export function joinSichuanRoom(state, pet, roomId, date = new Date()) {
  const game = state.sichuan = normalizeSichuan(state.sichuan, state, date);
  const room = game.rooms[roomId];
  if (!room) return { ok: false, message: '사천성 대전방을 찾을 수 없습니다.' };
  if ([room.hostPetId, room.guestPetId].includes(pet.id)) return { ok: true, roomId, message: '이미 이 방의 플레이어입니다.' };
  if (room.status !== 'waiting' || room.guestPetId) return { ok: false, message: '현재 플레이어로 참가할 수 없는 방입니다.' };
  if (activePlayerRoom(game, pet.id)) return { ok: false, message: '한 사용자는 동시에 여러 사천성 대전방의 선수가 될 수 없습니다.' };
  if (pet.stats.points < room.stakePoints || state.pets[room.hostPetId].stats.points < room.stakePoints) return { ok: false, message: '둘 중 한 명의 포인트가 부족해 시작할 수 없습니다.' };
  room.guestPetId = pet.id;
  delete room.spectators[pet.id];
  const started = startMatch(state, room, date);
  if (!started.ok) { room.guestPetId = null; return started; }
  return { ok: true, roomId, started: true, message: '상대 참가가 확정되어 사천성 대전을 시작했습니다.' };
}

export function spectateSichuanRoom(state, pet, roomId, date = new Date()) {
  const game = state.sichuan = normalizeSichuan(state.sichuan, state, date);
  const room = game.rooms[roomId];
  if (!room || room.status !== 'playing') return { ok: false, message: '진행 중인 사천성 대전만 관전할 수 있습니다.' };
  if ([room.hostPetId, room.guestPetId].includes(pet.id)) return { ok: false, message: '플레이어는 관전자로 들어갈 수 없습니다.' };
  room.spectators[pet.id] = { petId: pet.id, userId: pet.userId, displayName: pet.displayName, joinedAt: room.spectators[pet.id]?.joinedAt || nowIso(date) };
  bumpRoomVersion(room, date);
  return { ok: true, roomId, message: '사천성 대전 관전을 시작했습니다.' };
}

export function leaveSichuanSpectator(state, pet, roomId, date = new Date()) {
  const game = state.sichuan = normalizeSichuan(state.sichuan, state, date);
  const room = game.rooms[roomId];
  if (!room) return { ok: true, deleted: true, message: '이미 정리된 사천성 대전방입니다.' };
  if (!room.spectators?.[pet.id]) return { ok: true, message: '이미 관전을 종료했습니다.' };
  delete room.spectators[pet.id];
  bumpRoomVersion(room, date);
  return { ok: true, message: '관전을 종료했습니다.' };
}

export function leaveSichuanRoom(state, pet, roomId, date = new Date()) {
  const game = state.sichuan = normalizeSichuan(state.sichuan, state, date);
  const room = game.rooms[roomId];
  if (!room) return { ok: true, deleted: true, message: '이미 정리된 사천성 대전방입니다.' };
  if (![room.hostPetId, room.guestPetId].includes(pet.id)) return leaveSichuanSpectator(state, pet, roomId, date);
  if (room.status === 'waiting') { delete game.rooms[roomId]; return { ok: true, message: '대기방을 닫았습니다.' }; }
  if (room.status === 'playing') {
    finishWin(state, room, opponentId(room, pet.id), pet.id, `${pet.displayName}이 나가 기권패했습니다.`, date);
    if (!room.departedPetIds.includes(pet.id)) room.departedPetIds.push(pet.id);
    room.rematchRequests = room.rematchRequests.filter((petId) => petId !== pet.id);
    bumpRoomVersion(room, date);
    return { ok: true, forfeited: true, message: '기권패 처리되었습니다.' };
  }
  if (!room.departedPetIds.includes(pet.id)) room.departedPetIds.push(pet.id);
  room.rematchRequests = room.rematchRequests.filter((petId) => petId !== pet.id);
  if ([room.hostPetId, room.guestPetId].filter(Boolean).every((petId) => room.departedPetIds.includes(petId))) delete game.rooms[roomId];
  else bumpRoomVersion(room, date);
  return { ok: true, message: '사천성 대전방에서 나갔습니다.' };
}

export function playSichuanPair(state, pet, roomId, input = {}, date = new Date()) {
  const game = state.sichuan = normalizeSichuan(state.sichuan, state, date);
  const room = game.rooms[roomId];
  if (!room) return { ok: false, terminal: true, stale: true, message: '사천성 대전방이 이미 정리되었습니다.' };
  processSichuanTimers(state, date, { roomId });
  if (room.status !== 'playing' || room.settled) return { ok: false, terminal: true, message: '이미 종료된 사천성 대전입니다.' };
  if (![room.hostPetId, room.guestPetId].includes(pet.id)) return { ok: false, message: '관전자는 패를 선택할 수 없습니다.' };
  if (String(input.matchId || '') !== room.matchId) return { ok: false, stale: true, message: '이전 대전의 입력이라 무시했습니다.' };
  const actionId = String(input.actionId || '').trim().slice(0, 100);
  if (!actionId) return { ok: false, message: '입력 요청 ID가 필요합니다.' };
  if (room.processedActionIds.includes(actionId)) return { ok: true, duplicate: true, actionId, stateVersion: room.stateVersion, message: '이미 처리된 선택입니다.' };
  const first = normalizeIndex(input.first);
  const second = normalizeIndex(input.second);
  if (first < 0 || second < 0 || first === second) return { ok: false, message: '선택한 패 위치가 올바르지 않습니다.' };
  const player = room.players[pet.id];
  if (!player?.board?.[first] || !player.board[second]) return { ok: true, removed: false, message: '이미 제거된 패입니다.' };
  if (player.board[first] !== player.board[second]) return { ok: true, removed: false, message: '같은 그림의 패를 선택해주세요.' };

  room.processedActionIds.push(actionId);
  room.processedActionIds = room.processedActionIds.slice(-SICHUAN_ACTION_HISTORY);
  if (!canConnectSichuan(player.board, first, second)) {
    return { ok: true, removed: false, actionId, stateVersion: room.stateVersion, message: '최대 두 번 꺾어도 연결할 수 없는 패입니다.' };
  }

  player.board[first] = null;
  player.board[second] = null;
  player.removedCount = Math.min(SICHUAN_TILE_COUNT, int(player.removedCount) + 2);
  player.lastMove = { first, second, at: nowIso(date) };
  bumpRoomVersion(room, date);

  if (player.removedCount >= SICHUAN_TILE_COUNT || player.board.every((tile) => !tile)) {
    player.completed = true;
    finishWin(state, room, pet.id, opponentId(room, pet.id), `${pet.displayName}이 모든 패를 먼저 제거했습니다.`, date);
    return { ok: true, removed: true, finished: true, actionId, stateVersion: room.stateVersion, message: '모든 패를 제거해 승리했습니다!' };
  }

  if (!hasSichuanMove(player.board)) {
    player.blocked = true;
    const winnerPetId = opponentId(room, pet.id);
    finishWin(state, room, winnerPetId, pet.id, `${pet.displayName}에게 더 이상 제거 가능한 패가 없어 즉시 패배했습니다.`, date);
    return { ok: true, removed: true, blocked: true, finished: true, actionId, stateVersion: room.stateVersion, message: '더 이상 제거 가능한 패가 없어 패배했습니다.' };
  }

  return { ok: true, removed: true, actionId, stateVersion: room.stateVersion, message: '패를 제거했습니다.' };
}

export function requestSichuanRematch(state, pet, roomId, date = new Date()) {
  const game = state.sichuan = normalizeSichuan(state.sichuan, state, date);
  const room = game.rooms[roomId];
  if (!room || room.status !== 'ended') return { ok: false, message: '종료된 방에서만 재대결할 수 있습니다.' };
  if (![room.hostPetId, room.guestPetId].includes(pet.id) || room.departedPetIds.includes(pet.id)) return { ok: false, message: '방을 나간 플레이어 또는 관전자는 재대결을 요청할 수 없습니다.' };
  if (room.departedPetIds.length) return { ok: false, message: '상대가 방을 나가 재대결할 수 없습니다.' };
  if (!room.rematchRequests.includes(pet.id)) room.rematchRequests.push(pet.id);
  const otherId = opponentId(room, pet.id);
  if (!room.rematchRequests.includes(otherId)) return { ok: true, pending: true, message: '상대의 재대결 수락을 기다립니다.' };
  if (activePlayerRoom(game, pet.id, room.id) || activePlayerRoom(game, otherId, room.id)) { room.rematchRequests = []; return { ok: false, message: '둘 중 한 명이 다른 사천성 대전방에서 플레이 중입니다.' }; }
  const started = startMatch(state, room, date);
  if (!started.ok) room.rematchRequests = [];
  return started.ok ? { ok: true, started: true, message: '재대결을 시작했습니다.' } : started;
}

export function processSichuanTimers(state, date = new Date(), { roomId: targetRoomId = null } = {}) {
  const game = state.sichuan = normalizeSichuan(state.sichuan, state, date);
  let changed = false;
  let settled = false;
  const entries = targetRoomId ? (game.rooms[targetRoomId] ? [[targetRoomId, game.rooms[targetRoomId]]] : []) : Object.entries(game.rooms);
  for (const [roomId, room] of entries) {
    if (room.status === 'waiting') {
      const base = new Date(room.updatedAt ?? room.createdAt ?? '').getTime();
      if (Number.isFinite(base) && base + SICHUAN_WAITING_ROOM_TTL_MS <= date.getTime()) { delete game.rooms[roomId]; changed = true; }
      continue;
    }
    if (room.status === 'ended' && room.settled) {
      const base = new Date(room.endedAt ?? room.updatedAt ?? room.createdAt ?? '').getTime();
      if (Number.isFinite(base) && base + SICHUAN_ENDED_ROOM_TTL_MS <= date.getTime()) { delete game.rooms[roomId]; changed = true; }
      continue;
    }
    if (room.status !== 'playing') continue;
    const deadline = new Date(room.deadlineAt ?? '').getTime();
    if (!Number.isFinite(deadline) || deadline > date.getTime()) continue;
    const host = room.players[room.hostPetId];
    const guest = room.players[room.guestPetId];
    const hostRemoved = int(host?.removedCount);
    const guestRemoved = int(guest?.removedCount);
    if (hostRemoved === guestRemoved) finishDraw(state, room, `2분 30초 종료 · 양쪽 모두 ${hostRemoved}개 제거로 동점입니다.`, date);
    else {
      const winnerPetId = hostRemoved > guestRemoved ? room.hostPetId : room.guestPetId;
      const loserPetId = winnerPetId === room.hostPetId ? room.guestPetId : room.hostPetId;
      finishWin(state, room, winnerPetId, loserPetId, `2분 30초 종료 · ${Math.max(hostRemoved, guestRemoved)}개 대 ${Math.min(hostRemoved, guestRemoved)}개로 더 많이 제거했습니다.`, date);
    }
    changed = true;
    settled = true;
  }
  return { changed, settled };
}

export function sichuanNextAlarmAt(state, date = new Date()) {
  const game = normalizeSichuan(state.sichuan, state, date);
  const now = date.getTime();
  const candidates = [];
  for (const room of Object.values(game.rooms)) {
    if (room.status === 'waiting') candidates.push(new Date(room.updatedAt ?? room.createdAt ?? '').getTime() + SICHUAN_WAITING_ROOM_TTL_MS);
    else if (room.status === 'playing') candidates.push(new Date(room.deadlineAt ?? '').getTime());
    else if (room.status === 'ended' && room.settled) candidates.push(new Date(room.endedAt ?? room.updatedAt ?? '').getTime() + SICHUAN_ENDED_ROOM_TTL_MS);
  }
  const valid = candidates.filter((value) => Number.isFinite(value) && value > now);
  return valid.length ? new Date(Math.min(...valid)).toISOString() : null;
}

function playerPublic(player, { fullBoard = false } = {}) {
  return {
    petId: player.petId,
    displayName: player.displayName,
    board: fullBoard ? cloneBoard(player.board) : [],
    removedCount: int(player.removedCount),
    remainingCount: Math.max(0, SICHUAN_TILE_COUNT - int(player.removedCount)),
    blocked: Boolean(player.blocked),
    completed: Boolean(player.completed),
    lastMove: player.lastMove ? { ...player.lastMove } : null
  };
}

function publicRoomView(state, room, viewerPetId, date = new Date()) {
  const isPlayer = [room.hostPetId, room.guestPetId].includes(viewerPetId) && !room.departedPetIds.includes(viewerPetId);
  const isSpectator = Boolean(room.spectators?.[viewerPetId]);
  const viewerRole = isPlayer ? 'player' : isSpectator ? 'spectator' : 'none';
  const host = state.pets[room.hostPetId];
  const guest = state.pets[room.guestPetId];
  const players = {};
  if (room.status !== 'waiting') {
    players[room.hostPetId] = playerPublic(room.players[room.hostPetId], { fullBoard: isSpectator || room.status === 'ended' || viewerPetId === room.hostPetId });
    players[room.guestPetId] = playerPublic(room.players[room.guestPetId], { fullBoard: isSpectator || room.status === 'ended' || viewerPetId === room.guestPetId });
  }
  return {
    id: room.id, roomNumber: room.roomNumber, status: room.status, stakePoints: room.stakePoints,
    matchId: isPlayer ? room.matchId : null,
    host: host ? { petId: host.id, displayName: host.displayName } : null,
    guest: guest ? { petId: guest.id, displayName: guest.displayName } : null,
    viewerRole, selfPetId: isPlayer ? viewerPetId : null, opponentPetId: isPlayer ? opponentId(room, viewerPetId) : null,
    spectatorCount: Object.keys(room.spectators ?? {}).length, players, stateVersion: room.stateVersion,
    winnerPetId: room.winnerPetId, loserPetId: room.loserPetId, result: room.result, resultReason: room.resultReason,
    rematchRequestedByMe: room.rematchRequests.includes(viewerPetId),
    startedAt: room.startedAt, deadlineAt: room.deadlineAt, endedAt: room.endedAt, updatedAt: room.updatedAt,
    serverTime: date.getTime()
  };
}

export function sichuanRoomView(state, roomId, viewerPetId, date = new Date()) {
  const game = state.sichuan = normalizeSichuan(state.sichuan, state, date);
  const room = game.rooms[roomId];
  return room ? publicRoomView(state, room, viewerPetId, date) : null;
}

export function sichuanView(state, viewerPetId, date = new Date()) {
  const game = state.sichuan = normalizeSichuan(state.sichuan, state, date);
  return {
    maxRooms: SICHUAN_MAX_ROOMS,
    stakes: [...SICHUAN_STAKES],
    rows: SICHUAN_ROWS,
    cols: SICHUAN_COLS,
    matchSeconds: SICHUAN_MATCH_SECONDS,
    tiles: SICHUAN_TILES.map((tile) => ({ ...tile })),
    serverTime: date.getTime(),
    rooms: Object.values(game.rooms).sort((a, b) => a.roomNumber - b.roomNumber).map((room) => publicRoomView(state, room, viewerPetId, date))
  };
}

export function clearEndedSichuanRooms(state, date = new Date()) {
  const game = state.sichuan = normalizeSichuan(state.sichuan, state, date);
  const ids = Object.values(game.rooms).filter((room) => room.status === 'ended' && room.settled).map((room) => room.id);
  for (const roomId of ids) delete game.rooms[roomId];
  return { ok: true, cleared: ids.length, message: ids.length ? `종료된 사천성 대전방 ${ids.length}개를 비웠습니다.` : '비울 종료 사천성 대전방이 없습니다.' };
}

export function sichuanRanking(state, viewerPetId = null) {
  const entries = Object.values(state.pets ?? {}).filter((pet) => pet?.alive).map((pet) => ({
    petId: pet.id,
    displayName: pet.displayName,
    wins: int(pet.records?.seasonSichuanWins),
    draws: int(pet.records?.seasonSichuanDraws),
    losses: int(pet.records?.seasonSichuanLosses)
  })).filter((entry) => entry.wins || entry.draws || entry.losses)
    .sort((a, b) => b.wins - a.wins || a.losses - b.losses || b.draws - a.draws || a.displayName.localeCompare(b.displayName, 'ko'));
  const myIndex = viewerPetId ? entries.findIndex((entry) => entry.petId === viewerPetId) : -1;
  return {
    top: entries.slice(0, 5).map((entry, index) => ({ ...entry, rank: index + 1 })),
    mine: myIndex >= 0 ? { ...entries[myIndex], rank: myIndex + 1 } : null
  };
}

export function removePetFromSichuan(state, petId, date = new Date()) {
  const game = state.sichuan = normalizeSichuan(state.sichuan, state, date);
  for (const room of Object.values(game.rooms)) {
    delete room.spectators?.[petId];
    if (room.status === 'waiting' && room.hostPetId === petId) delete game.rooms[room.id];
    else if (room.status === 'playing' && [room.hostPetId, room.guestPetId].includes(petId)) finishWin(state, room, opponentId(room, petId), petId, '플레이어 상태가 종료되어 기권패 처리되었습니다.', date);
    else if (room.status === 'ended' && [room.hostPetId, room.guestPetId].includes(petId)) delete game.rooms[room.id];
  }
}
