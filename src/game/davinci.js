import { id } from '../lib/ids.js';

export const DAVINCI_MAX_ROOMS = 2;
export const DAVINCI_MIN_PLAYERS = 2;
export const DAVINCI_MAX_PLAYERS = 4;
export const DAVINCI_FIRST_GUESS_SECONDS = 30;
export const DAVINCI_CHAIN_GUESS_SECONDS = 20;
export const DAVINCI_JOKER_SECONDS = 20;
export const DAVINCI_RPS_SECONDS = 10;
export const DAVINCI_ORDER_SECONDS = 10;
export const DAVINCI_PENALTY_SECONDS = 10;
export const DAVINCI_MAX_CONSECUTIVE_TIMEOUTS = 2;
export const DAVINCI_WAITING_ROOM_TTL_MS = 10 * 60_000;
export const DAVINCI_ENDED_ROOM_TTL_MS = 10 * 60_000;

const nowIso = (date = new Date()) => date.toISOString();
const int = (value, fallback = 0) => Math.max(0, Math.floor(Number.isFinite(Number(value)) ? Number(value) : fallback));
const asTime = (value, fallback = null) => {
  const time = new Date(value ?? '').getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : fallback;
};
const unique = (values) => [...new Set((values ?? []).map(String))];

export function validDavinciStake(value) {
  const stake = Number(value);
  return Number.isSafeInteger(stake) && (stake === 100 || stake === 500 || (stake >= 1000 && stake % 1000 === 0));
}

export function initialDavinci() {
  return { version: 1, rooms: {} };
}

function ensureDavinciRecords(pet) {
  pet.records ??= {};
  for (const key of ['davinciGames', 'davinciTotalWins', 'davinciTotalCorrect', 'davinciWins', 'davinciCorrect']) pet.records[key] = int(pet.records[key]);
  pet.records.pointsEarned = int(pet.records.pointsEarned);
  pet.records.pointsSpent = int(pet.records.pointsSpent);
}

function playerPet(state, petId) {
  const pet = state?.pets?.[petId];
  return pet?.alive ? pet : null;
}

function normalizeTile(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const color = raw.color === 'white' ? 'white' : raw.color === 'black' ? 'black' : null;
  if (!color) return null;
  const joker = Boolean(raw.joker);
  const value = joker ? null : Number(raw.value);
  if (!joker && (!Number.isInteger(value) || value < 0 || value > 11)) return null;
  return {
    id: String(raw.id || id('davtile')),
    color,
    value,
    joker,
    revealed: Boolean(raw.revealed)
  };
}

function normalizePlayer(raw, state) {
  const pet = playerPet(state, String(raw?.petId ?? ''));
  if (!pet) return null;
  const hand = Array.isArray(raw?.hand) ? raw.hand.map(normalizeTile).filter(Boolean) : [];
  const drawnTile = normalizeTile(raw?.drawnTile);
  return {
    petId: pet.id,
    userId: pet.userId,
    displayName: pet.displayName,
    joinedAt: asTime(raw?.joinedAt, nowIso()),
    ready: Boolean(raw?.ready),
    connected: raw?.connected !== false,
    hand,
    drawnTile,
    pendingInitialJokers: unique(raw?.pendingInitialJokers).filter((tileId) => !hand.some((tile) => tile.id === tileId)),
    eliminated: Boolean(raw?.eliminated),
    forfeited: Boolean(raw?.forfeited),
    leftRoom: Boolean(raw?.leftRoom),
    correctGuesses: int(raw?.correctGuesses),
    consecutiveTimeouts: Math.min(DAVINCI_MAX_CONSECUTIVE_TIMEOUTS, int(raw?.consecutiveTimeouts))
  };
}

function normalizeSpectators(raw, state, playerIds) {
  const result = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return result;
  for (const [petId, item] of Object.entries(raw)) {
    const pet = playerPet(state, petId);
    if (!pet || playerIds.has(petId)) continue;
    result[petId] = {
      petId,
      userId: pet.userId,
      displayName: pet.displayName,
      connected: item?.connected !== false,
      joinedAt: asTime(item?.joinedAt, nowIso())
    };
  }
  return result;
}

export function normalizeDavinci(raw, state) {
  const base = initialDavinci();
  const davinci = raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...base, ...raw } : base;
  davinci.rooms = davinci.rooms && typeof davinci.rooms === 'object' && !Array.isArray(davinci.rooms) ? davinci.rooms : {};
  for (const [roomId, roomRaw] of Object.entries(davinci.rooms)) {
    if (!roomRaw || typeof roomRaw !== 'object' || Array.isArray(roomRaw) || !validDavinciStake(roomRaw.stakePoints)) {
      delete davinci.rooms[roomId];
      continue;
    }
    const players = Array.isArray(roomRaw.players) ? roomRaw.players.map((item) => normalizePlayer(item, state)).filter(Boolean) : [];
    if (!players.length) { delete davinci.rooms[roomId]; continue; }
    const playerIds = new Set(players.map((player) => player.petId));
    const room = roomRaw;
    room.id = String(room.id || roomId);
    room.roomNumber = Math.max(1, Math.min(DAVINCI_MAX_ROOMS, int(room.roomNumber, 1)));
    room.status = ['waiting', 'playing', 'ended'].includes(room.status) ? room.status : 'waiting';
    room.phase = ['waiting', 'jokerSetup', 'rps', 'orderChoice', 'turn', 'drawnJokerPlacement', 'deckPenalty', 'ended'].includes(room.phase)
      ? room.phase : room.status === 'ended' ? 'ended' : room.status === 'playing' ? 'turn' : 'waiting';
    room.hostPetId = playerIds.has(room.hostPetId) ? room.hostPetId : players[0].petId;
    room.stakePoints = Number(room.stakePoints);
    room.players = players;
    room.deck = Array.isArray(room.deck) ? room.deck.map(normalizeTile).filter(Boolean).map((tile) => ({ ...tile, revealed: false })) : [];
    const escrow = room.escrow && typeof room.escrow === 'object' && !Array.isArray(room.escrow) ? room.escrow : {};
    room.escrow = Object.fromEntries(players.map((player) => [player.petId, int(escrow[player.petId])]));
    room.turnOrder = unique(room.turnOrder).filter((petId) => playerIds.has(petId));
    room.currentTurnPetId = playerIds.has(room.currentTurnPetId) ? room.currentTurnPetId : null;
    room.turnMode = room.turnMode === 'chain' ? 'chain' : 'first';
    room.awaitingDecision = Boolean(room.awaitingDecision);
    room.phaseStartedAt = asTime(room.phaseStartedAt);
    room.turnStartedAt = asTime(room.turnStartedAt);
    room.rpsCandidates = unique(room.rpsCandidates).filter((petId) => playerIds.has(petId));
    room.rpsChoices = room.rpsChoices && typeof room.rpsChoices === 'object' && !Array.isArray(room.rpsChoices) ? room.rpsChoices : {};
    for (const key of Object.keys(room.rpsChoices)) if (!room.rpsCandidates.includes(key) || !['rock', 'paper', 'scissors'].includes(room.rpsChoices[key])) delete room.rpsChoices[key];
    room.rpsRound = Math.max(1, int(room.rpsRound, 1));
    room.lastRpsResult = room.lastRpsResult && typeof room.lastRpsResult === 'object' && !Array.isArray(room.lastRpsResult) ? {
      round: Math.max(1, int(room.lastRpsResult.round, 1)),
      choices: room.lastRpsResult.choices && typeof room.lastRpsResult.choices === 'object' ? { ...room.lastRpsResult.choices } : {},
      winnerPetIds: unique(room.lastRpsResult.winnerPetIds).filter((petId) => playerIds.has(petId)),
      tie: Boolean(room.lastRpsResult.tie)
    } : null;
    room.rpsWinnerPetId = playerIds.has(room.rpsWinnerPetId) ? room.rpsWinnerPetId : null;
    room.orderChoice = ['first', 'last'].includes(room.orderChoice) ? room.orderChoice : null;
    room.winnerPetId = playerIds.has(room.winnerPetId) ? room.winnerPetId : null;
    room.resultReason = typeof room.resultReason === 'string' ? room.resultReason.slice(0, 180) : null;
    room.settled = Boolean(room.settled);
    room.rematchRequests = unique(room.rematchRequests).filter((petId) => playerIds.has(petId));
    room.guessLog = Array.isArray(room.guessLog) ? room.guessLog.filter((item) => item && typeof item === 'object').slice(-6).map((item) => ({
      id: String(item.id || id('davlog')),
      actorPetId: String(item.actorPetId || ''),
      actorName: String(item.actorName || '').slice(0, 40),
      targetPetId: String(item.targetPetId || ''),
      targetName: String(item.targetName || '').slice(0, 40),
      color: item.color === 'white' ? 'white' : 'black',
      guess: String(item.guess || '').slice(0, 12),
      correct: Boolean(item.correct),
      at: asTime(item.at, nowIso())
    })) : [];
    room.processedActionIds = unique(room.processedActionIds).slice(-160);
    room.matchId = String(room.matchId || '');
    room.createdAt = asTime(room.createdAt, nowIso());
    room.updatedAt = asTime(room.updatedAt, room.createdAt);
    room.startedAt = asTime(room.startedAt);
    room.endedAt = asTime(room.endedAt);
    const seatedPlayerIds = new Set(players.filter((player) => !player.leftRoom).map((player) => player.petId));
    room.spectators = normalizeSpectators(room.spectators, state, seatedPlayerIds);
    davinci.rooms[roomId] = room;
  }
  davinci.version = 1;
  return davinci;
}

function roomPlayer(room, petId) {
  return room.players.find((player) => player.petId === petId) ?? null;
}
function activePlayers(room) {
  return room.players.filter((player) => !player.eliminated && !player.forfeited);
}
function activePlayerIds(room) { return activePlayers(room).map((player) => player.petId); }
function isActivePlayer(room, petId) { return activePlayers(room).some((player) => player.petId === petId); }
function touch(room, date = new Date()) { room.updatedAt = nowIso(date); }

function occupiedRoomNumbers(davinci) { return new Set(Object.values(davinci.rooms).filter((room) => room.status !== 'ended').map((room) => room.roomNumber)); }
function nextRoomNumber(davinci) {
  const occupied = occupiedRoomNumbers(davinci);
  for (let number = 1; number <= DAVINCI_MAX_ROOMS; number += 1) if (!occupied.has(number)) return number;
  return null;
}
function playerActiveRoom(davinci, petId, exceptRoomId = null) {
  return Object.values(davinci.rooms).find((room) => room.id !== exceptRoomId && room.status !== 'ended' && room.players.some((player) => player.petId === petId && !player.leftRoom)) ?? null;
}

function deductStake(pet, stake) {
  ensureDavinciRecords(pet);
  pet.stats.points = int(pet.stats.points);
  if (pet.stats.points < stake) return false;
  pet.stats.points -= stake;
  pet.records.pointsSpent += stake;
  return true;
}
function refundStake(pet, stake) {
  if (!pet?.alive || stake <= 0) return;
  ensureDavinciRecords(pet);
  pet.stats.points += stake;
  pet.records.pointsSpent = Math.max(0, pet.records.pointsSpent - stake);
}

function tileRank(tile) {
  return (Number(tile.value) * 2) + (tile.color === 'white' ? 1 : 0);
}
function sortNumericTiles(tiles) { return [...tiles].sort((a, b) => tileRank(a) - tileRank(b)); }
function insertNumericTile(hand, tile) {
  const target = tileRank(tile);
  for (let position = 0; position <= hand.length; position += 1) {
    let before = null;
    for (let i = position - 1; i >= 0; i -= 1) if (!hand[i].joker) { before = hand[i]; break; }
    let after = null;
    for (let i = position; i < hand.length; i += 1) if (!hand[i].joker) { after = hand[i]; break; }
    if ((!before || tileRank(before) <= target) && (!after || target <= tileRank(after))) {
      hand.splice(position, 0, tile);
      return position;
    }
  }
  hand.push(tile);
  return hand.length - 1;
}

function buildDeck() {
  const deck = [];
  for (const color of ['black', 'white']) {
    for (let value = 0; value <= 11; value += 1) deck.push({ id: id('davtile'), color, value, joker: false, revealed: false });
    deck.push({ id: id('davtile'), color, value: null, joker: true, revealed: false });
  }
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [deck[index], deck[target]] = [deck[target], deck[index]];
  }
  return deck;
}

function resetRoundFields(room) {
  room.deck = [];
  room.escrow = Object.fromEntries(room.players.map((player) => [player.petId, 0]));
  room.turnOrder = [];
  room.currentTurnPetId = null;
  room.turnMode = 'first';
  room.awaitingDecision = false;
  room.turnStartedAt = null;
  room.phaseStartedAt = null;
  room.rpsCandidates = [];
  room.rpsChoices = {};
  room.rpsRound = 1;
  room.rpsWinnerPetId = null;
  room.lastRpsResult = null;
  room.orderChoice = null;
  room.winnerPetId = null;
  room.resultReason = null;
  room.settled = false;
  room.guessLog = [];
  room.processedActionIds = [];
  room.rematchRequests = [];
  room.matchId = '';
  for (const player of room.players) {
    player.hand = [];
    player.drawnTile = null;
    player.pendingInitialJokers = [];
    player.eliminated = false;
    player.forfeited = false;
    player.leftRoom = false;
    player.correctGuesses = 0;
    player.consecutiveTimeouts = 0;
  }
}

function beginRps(room, date = new Date()) {
  room.phase = 'rps';
  room.rpsCandidates = activePlayerIds(room);
  room.rpsChoices = {};
  room.rpsRound = 1;
  room.rpsWinnerPetId = null;
  room.phaseStartedAt = nowIso(date);
  touch(room, date);
}

function allInitialJokersPlaced(room) {
  return room.players.every((player) => !player.pendingInitialJokers.length);
}

function initializeMatch(state, room, date = new Date()) {
  if (room.players.length < DAVINCI_MIN_PLAYERS || room.players.length > DAVINCI_MAX_PLAYERS) return { ok: false, message: '2명 이상 4명 이하일 때 시작할 수 있습니다.' };
  const guestsNotReady = room.players.filter((player) => player.petId !== room.hostPetId && !player.ready);
  if (guestsNotReady.length) return { ok: false, message: '참가자 전원이 준비해야 시작할 수 있습니다.' };
  for (const player of room.players) {
    const pet = playerPet(state, player.petId);
    if (!pet || int(pet.stats?.points) < room.stakePoints) return { ok: false, message: `${player.displayName}의 포인트가 부족합니다.` };
  }
  const deducted = [];
  for (const player of room.players) {
    const pet = playerPet(state, player.petId);
    if (!deductStake(pet, room.stakePoints)) {
      for (const petId of deducted) refundStake(playerPet(state, petId), room.stakePoints);
      return { ok: false, message: `${player.displayName}의 판돈을 확보하지 못했습니다.` };
    }
    deducted.push(player.petId);
  }
  resetRoundFields(room);
  room.matchId = id('davmatch');
  room.status = 'playing';
  room.startedAt = nowIso(date);
  room.endedAt = null;
  room.escrow = Object.fromEntries(room.players.map((player) => [player.petId, room.stakePoints]));
  room.deck = buildDeck();
  const handSize = room.players.length === 4 ? 3 : 4;
  for (const player of room.players) {
    const dealt = room.deck.splice(0, handSize);
    const numeric = sortNumericTiles(dealt.filter((tile) => !tile.joker));
    const jokers = dealt.filter((tile) => tile.joker);
    player.hand = numeric;
    player.pendingInitialJokers = jokers.map((tile) => tile.id);
    // 초기 배치 전의 조커는 손 밖에 잠시 보관한다. ID로만 두면 비밀 조커의 색을 잃으므로 drawnTile가 아닌 임시 배열을 사용한다.
    player._initialJokerTiles = jokers;
    player.ready = false;
    player.connected = true;
  }
  if (room.players.some((player) => player.pendingInitialJokers.length)) {
    room.phase = 'jokerSetup';
    room.phaseStartedAt = nowIso(date);
  } else beginRps(room, date);
  touch(room, date);
  return { ok: true, roomId: room.id, message: '판돈을 확보했습니다. 게임 준비를 시작합니다.' };
}

// normalize 과정에서 임시 조커 객체가 사라질 수 있으므로 pending ID는 별도 보관소로 승격한다.
function ensureInitialJokerStore(room) {
  room.initialJokerTiles = room.initialJokerTiles && typeof room.initialJokerTiles === 'object' && !Array.isArray(room.initialJokerTiles) ? room.initialJokerTiles : {};
  for (const player of room.players) {
    if (Array.isArray(player._initialJokerTiles)) {
      room.initialJokerTiles[player.petId] = player._initialJokerTiles.map((tile) => ({ ...tile }));
      delete player._initialJokerTiles;
    }
    room.initialJokerTiles[player.petId] = Array.isArray(room.initialJokerTiles[player.petId])
      ? room.initialJokerTiles[player.petId].map(normalizeTile).filter((tile) => tile?.joker)
      : [];
    player.pendingInitialJokers = room.initialJokerTiles[player.petId].map((tile) => tile.id);
  }
}

function finishRoom(state, room, winnerPetId, reason, date = new Date()) {
  if (room.status === 'ended' || room.settled) return { changed: false };
  const winner = playerPet(state, winnerPetId);
  const pot = Object.values(room.escrow ?? {}).reduce((sum, value) => sum + int(value), 0);
  room.status = 'ended';
  room.phase = 'ended';
  room.winnerPetId = winner?.id ?? null;
  room.resultReason = String(reason || '').slice(0, 180);
  room.endedAt = nowIso(date);
  room.turnStartedAt = null;
  room.phaseStartedAt = null;
  room.currentTurnPetId = null;
  room.awaitingDecision = false;
  room.rematchRequests = [];
  room.settled = true;
  if (winner) {
    ensureDavinciRecords(winner);
    winner.stats.points = int(winner.stats.points) + pot;
    winner.records.pointsEarned += pot;
    winner.records.davinciTotalWins += 1;
    winner.records.davinciWins += 1;
  }
  for (const player of room.players) {
    const pet = playerPet(state, player.petId);
    if (pet) {
      ensureDavinciRecords(pet);
      pet.records.davinciGames += 1;
    }
    room.escrow[player.petId] = 0;
  }
  touch(room, date);
  return { changed: true };
}

function maybeFinish(state, room, date = new Date()) {
  const alive = activePlayers(room);
  if (alive.length === 1) {
    finishRoom(state, room, alive[0].petId, `${alive[0].displayName}의 코드가 마지막까지 남았습니다.`, date);
    return true;
  }
  if (!alive.length) {
    // 정상 플레이에서는 발생하지 않지만, 동시에 계정이 제거되는 등의 복구 상황에서는 판돈을 환불한다.
    for (const player of room.players) {
      const amount = int(room.escrow[player.petId]);
      if (amount) refundStake(playerPet(state, player.petId), amount);
      room.escrow[player.petId] = 0;
    }
    room.status = 'ended'; room.phase = 'ended'; room.settled = true; room.endedAt = nowIso(date); room.resultReason = '남은 플레이어가 없어 게임이 종료되었습니다.'; touch(room, date);
    return true;
  }
  return false;
}

function allHandRevealed(player) {
  return player.hand.length > 0 && player.hand.every((tile) => tile.revealed);
}
function updateEliminations(room) {
  for (const player of room.players) if (!player.forfeited && allHandRevealed(player)) player.eliminated = true;
}

function currentPlayer(room) { return roomPlayer(room, room.currentTurnPetId); }
function nextActivePetId(room, currentPetId) {
  if (!room.turnOrder.length) return activePlayers(room)[0]?.petId ?? null;
  const currentIndex = Math.max(0, room.turnOrder.indexOf(currentPetId));
  for (let offset = 1; offset <= room.turnOrder.length; offset += 1) {
    const candidate = room.turnOrder[(currentIndex + offset) % room.turnOrder.length];
    if (isActivePlayer(room, candidate)) return candidate;
  }
  return null;
}

function beginTurn(room, petId, date = new Date()) {
  const player = roomPlayer(room, petId);
  if (!player || player.eliminated || player.forfeited) return false;
  room.currentTurnPetId = petId;
  room.phase = 'turn';
  room.turnMode = 'first';
  room.awaitingDecision = false;
  room.turnStartedAt = nowIso(date);
  room.phaseStartedAt = room.turnStartedAt;
  player.drawnTile = room.deck.length ? room.deck.shift() : null;
  touch(room, date);
  return true;
}

function advanceTurn(state, room, date = new Date()) {
  updateEliminations(room);
  if (maybeFinish(state, room, date)) return;
  const next = nextActivePetId(room, room.currentTurnPetId);
  if (next) beginTurn(room, next, date);
}

function afterDrawnTileSettled(state, room, date = new Date()) {
  const player = currentPlayer(room);
  if (player) player.drawnTile = null;
  advanceTurn(state, room, date);
}

function settleDrawnTile(state, room, { reveal = false } = {}, date = new Date()) {
  const player = currentPlayer(room);
  if (!player) return;
  const tile = player.drawnTile;
  if (!tile) { advanceTurn(state, room, date); return; }
  tile.revealed = Boolean(reveal);
  if (tile.joker) {
    room.phase = 'drawnJokerPlacement';
    room.phaseStartedAt = nowIso(date);
    room.turnStartedAt = null;
    room.awaitingDecision = false;
    touch(room, date);
    return;
  }
  insertNumericTile(player.hand, tile);
  player.drawnTile = null;
  advanceTurn(state, room, date);
}

function revealDeckEmptyPenalty(state, room, player, tileId, date = new Date()) {
  const tile = player.hand.find((item) => item.id === tileId && !item.revealed);
  if (!tile) return false;
  tile.revealed = true;
  updateEliminations(room);
  if (!maybeFinish(state, room, date)) advanceTurn(state, room, date);
  return true;
}

function logGuess(room, actor, target, tile, guess, correct, date) {
  const displayGuess = guess === 'joker' ? '조커' : String(guess);
  room.guessLog.push({ id: id('davlog'), actorPetId: actor.petId, actorName: actor.displayName, targetPetId: target.petId, targetName: target.displayName, color: tile.color, guess: displayGuess, correct, at: nowIso(date) });
  room.guessLog = room.guessLog.slice(-6);
}

function evaluateRps(room, date = new Date()) {
  const candidates = room.rpsCandidates.filter((petId) => isActivePlayer(room, petId));
  if (candidates.length <= 1) {
    room.rpsWinnerPetId = candidates[0] ?? activePlayers(room)[0]?.petId ?? null;
    room.phase = 'orderChoice'; room.phaseStartedAt = nowIso(date); room.rpsChoices = {}; touch(room, date); return;
  }
  if (!candidates.every((petId) => ['rock', 'paper', 'scissors'].includes(room.rpsChoices[petId]))) return;
  const kinds = [...new Set(candidates.map((petId) => room.rpsChoices[petId]))];
  const roundChoices = Object.fromEntries(candidates.map((petId) => [petId, room.rpsChoices[petId]]));
  if (kinds.length === 1 || kinds.length === 3) {
    room.lastRpsResult = { round: room.rpsRound, choices: roundChoices, winnerPetIds: [], tie: true };
    room.rpsChoices = {}; room.rpsRound += 1; room.phaseStartedAt = nowIso(date); touch(room, date); return;
  }
  const beats = { rock: 'scissors', scissors: 'paper', paper: 'rock' };
  const winningKind = beats[kinds[0]] === kinds[1] ? kinds[0] : kinds[1];
  const winners = candidates.filter((petId) => room.rpsChoices[petId] === winningKind);
  room.lastRpsResult = { round: room.rpsRound, choices: roundChoices, winnerPetIds: [...winners], tie: false };
  if (winners.length === 1) {
    room.rpsWinnerPetId = winners[0]; room.rpsCandidates = winners; room.rpsChoices = {}; room.phase = 'orderChoice'; room.phaseStartedAt = nowIso(date); touch(room, date); return;
  }
  room.rpsCandidates = winners;
  room.rpsChoices = {};
  room.rpsRound += 1;
  room.phaseStartedAt = nowIso(date);
  touch(room, date);
}

function chooseOrder(room, choice, date = new Date()) {
  const winner = room.rpsWinnerPetId;
  if (!winner || !isActivePlayer(room, winner)) return false;
  const others = activePlayerIds(room).filter((petId) => petId !== winner);
  for (let i = others.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [others[i], others[j]] = [others[j], others[i]];
  }
  room.orderChoice = choice;
  room.turnOrder = choice === 'last' ? [...others, winner] : [winner, ...others];
  room.phaseStartedAt = null;
  beginTurn(room, room.turnOrder[0], date);
  return true;
}

export function createDavinciRoom(state, pet, stakeValue, date = new Date()) {
  const davinci = state.davinci = normalizeDavinci(state.davinci, state);
  if (!pet?.alive) return { ok: false, message: '현재 레고를 찾을 수 없습니다.' };
  if (!validDavinciStake(stakeValue)) return { ok: false, message: '판돈은 100P, 500P, 또는 1,000P 이상 1,000P 단위로 설정해주세요.' };
  if (playerActiveRoom(davinci, pet.id)) return { ok: false, message: '이미 다른 다빈치코드 방에 참가 중입니다.' };
  if (Object.values(davinci.rooms).filter((room) => room.status !== 'ended').length >= DAVINCI_MAX_ROOMS) return { ok: false, message: '다빈치코드 방은 최대 2개까지 만들 수 있습니다.' };
  const roomNumber = nextRoomNumber(davinci);
  if (!roomNumber) return { ok: false, message: '사용 가능한 방 번호가 없습니다.' };
  const roomId = id('davroom');
  davinci.rooms[roomId] = {
    id: roomId, roomNumber, status: 'waiting', phase: 'waiting', hostPetId: pet.id, stakePoints: Number(stakeValue),
    players: [{ petId: pet.id, userId: pet.userId, displayName: pet.displayName, joinedAt: nowIso(date), ready: false, connected: true, hand: [], drawnTile: null, pendingInitialJokers: [], eliminated: false, forfeited: false, leftRoom: false, correctGuesses: 0, consecutiveTimeouts: 0 }],
    spectators: {}, deck: [], escrow: {}, turnOrder: [], currentTurnPetId: null, turnMode: 'first', awaitingDecision: false,
    phaseStartedAt: null, turnStartedAt: null, rpsCandidates: [], rpsChoices: {}, rpsRound: 1, rpsWinnerPetId: null, orderChoice: null,
    lastRpsResult: null, winnerPetId: null, resultReason: null, settled: false, rematchRequests: [], guessLog: [], processedActionIds: [], initialJokerTiles: {}, matchId: '',
    createdAt: nowIso(date), updatedAt: nowIso(date), startedAt: null, endedAt: null
  };
  return { ok: true, roomId, message: `${roomNumber}번 다빈치코드 방을 만들었습니다.` };
}

export function joinDavinciRoom(state, pet, roomId, date = new Date()) {
  const davinci = state.davinci = normalizeDavinci(state.davinci, state);
  const room = davinci.rooms[roomId];
  if (!room || room.status !== 'waiting') return { ok: false, message: '참가할 수 있는 대기방이 아닙니다.' };
  if (room.players.some((player) => player.petId === pet.id && !player.leftRoom)) return { ok: true, roomId, message: '이미 이 방에 참가 중입니다.' };
  // 이전 판에서 포기하고 나간 기록이 같은 방에 남아 있으면 대기방 참가 전에 제거한다.
  room.players = room.players.filter((player) => !(player.petId === pet.id && player.leftRoom));
  if (room.players.length >= DAVINCI_MAX_PLAYERS) return { ok: false, message: '이 방은 4명이 모두 찼습니다.' };
  if (playerActiveRoom(davinci, pet.id, roomId)) return { ok: false, message: '이미 다른 다빈치코드 방에 참가 중입니다.' };
  room.players.push({ petId: pet.id, userId: pet.userId, displayName: pet.displayName, joinedAt: nowIso(date), ready: false, connected: true, hand: [], drawnTile: null, pendingInitialJokers: [], eliminated: false, forfeited: false, leftRoom: false, correctGuesses: 0, consecutiveTimeouts: 0 });
  delete room.spectators[pet.id];
  room.rematchRequests = [];
  touch(room, date);
  return { ok: true, roomId, message: `${room.roomNumber}번방에 참가했습니다. 준비 버튼을 눌러주세요.` };
}

export function setDavinciReady(state, pet, roomId, readyValue, date = new Date()) {
  const davinci = state.davinci = normalizeDavinci(state.davinci, state);
  const room = davinci.rooms[roomId];
  const player = room ? roomPlayer(room, pet.id) : null;
  if (!room || room.status !== 'waiting' || !player) return { ok: false, message: '대기 중인 참가자만 준비 상태를 바꿀 수 있습니다.' };
  if (room.hostPetId === pet.id) return { ok: false, message: '방장은 게임 시작 버튼으로 준비를 확정합니다.' };
  player.ready = Boolean(readyValue);
  touch(room, date);
  return { ok: true, roomId, message: player.ready ? '준비했습니다.' : '준비를 취소했습니다.' };
}

export function startDavinciRoom(state, pet, roomId, date = new Date()) {
  const davinci = state.davinci = normalizeDavinci(state.davinci, state);
  const room = davinci.rooms[roomId];
  if (!room || room.status !== 'waiting') return { ok: false, message: '시작할 수 있는 대기방이 아닙니다.' };
  if (room.hostPetId !== pet.id) return { ok: false, message: '방장만 게임을 시작할 수 있습니다.' };
  const result = initializeMatch(state, room, date);
  if (result.ok) ensureInitialJokerStore(room);
  return result;
}

export function placeDavinciJoker(state, pet, roomId, positionValue, date = new Date()) {
  const davinci = state.davinci = normalizeDavinci(state.davinci, state);
  const room = davinci.rooms[roomId];
  const player = room ? roomPlayer(room, pet.id) : null;
  if (!room || room.status !== 'playing' || !player) return { ok: false, message: '다빈치코드 게임을 찾을 수 없습니다.' };
  const position = Math.floor(Number(positionValue));
  if (room.phase === 'jokerSetup') {
    ensureInitialJokerStore(room);
    const pending = room.initialJokerTiles?.[pet.id] ?? [];
    const tile = pending[0];
    if (!tile) return { ok: false, message: '배치할 조커가 없습니다.' };
    if (!Number.isInteger(position) || position < 0 || position > player.hand.length) return { ok: false, message: '조커 위치가 올바르지 않습니다.' };
    player.hand.splice(position, 0, tile);
    pending.shift();
    player.pendingInitialJokers = pending.map((item) => item.id);
    room.initialJokerTiles[pet.id] = pending;
    room.phaseStartedAt = nowIso(date);
    if (allInitialJokersPlaced(room)) beginRps(room, date);
    else touch(room, date);
    return { ok: true, roomId, message: pending.length ? '다음 조커 위치를 선택해주세요.' : '조커 배치를 완료했습니다.' };
  }
  if (room.phase === 'drawnJokerPlacement' && room.currentTurnPetId === pet.id) {
    const tile = player.drawnTile;
    if (!tile?.joker) return { ok: false, message: '배치할 조커가 없습니다.' };
    if (!Number.isInteger(position) || position < 0 || position > player.hand.length) return { ok: false, message: '조커 위치가 올바르지 않습니다.' };
    player.hand.splice(position, 0, tile);
    player.drawnTile = null;
    afterDrawnTileSettled(state, room, date);
    return { ok: true, roomId, message: '조커를 배치했습니다.' };
  }
  return { ok: false, message: '지금은 조커를 배치할 수 없습니다.' };
}

export function submitDavinciRps(state, pet, roomId, choice, date = new Date()) {
  const davinci = state.davinci = normalizeDavinci(state.davinci, state);
  const room = davinci.rooms[roomId];
  if (!room || room.status !== 'playing' || room.phase !== 'rps') return { ok: false, message: '가위바위보 진행 중이 아닙니다.' };
  if (!room.rpsCandidates.includes(pet.id)) return { ok: false, message: '이번 가위바위보 참가자가 아닙니다.' };
  if (!['rock', 'paper', 'scissors'].includes(choice)) return { ok: false, message: '가위, 바위, 보 중 하나를 선택해주세요.' };
  if (room.rpsChoices[pet.id]) return { ok: false, message: '이미 선택했습니다.' };
  room.rpsChoices[pet.id] = choice;
  touch(room, date);
  evaluateRps(room, date);
  return { ok: true, roomId, message: room.phase === 'orderChoice' ? '가위바위보 승자가 결정되었습니다.' : '선택했습니다.' };
}

export function selectDavinciOrder(state, pet, roomId, choice, date = new Date()) {
  const davinci = state.davinci = normalizeDavinci(state.davinci, state);
  const room = davinci.rooms[roomId];
  if (!room || room.phase !== 'orderChoice' || room.rpsWinnerPetId !== pet.id) return { ok: false, message: '선공·후공을 선택할 수 없습니다.' };
  if (!['first', 'last'].includes(choice)) return { ok: false, message: '선공 또는 후공을 선택해주세요.' };
  chooseOrder(room, choice, date);
  return { ok: true, roomId, message: choice === 'first' ? '선공을 선택했습니다.' : '후공을 선택했습니다.' };
}

function actionDuplicate(room, actionId) {
  const key = String(actionId ?? '').trim();
  if (!key) return false;
  if (room.processedActionIds.includes(key)) return true;
  room.processedActionIds.push(key);
  room.processedActionIds = room.processedActionIds.slice(-160);
  return false;
}

export function guessDavinciTile(state, pet, roomId, targetPetId, tileId, guessValue, actionId, date = new Date()) {
  const davinci = state.davinci = normalizeDavinci(state.davinci, state);
  const room = davinci.rooms[roomId];
  if (!room || room.status !== 'playing' || room.phase !== 'turn') return { ok: false, message: '지금은 숫자를 추리할 수 없습니다.' };
  if (room.currentTurnPetId !== pet.id) return { ok: false, message: '내 차례가 아닙니다.' };
  if (room.awaitingDecision) return { ok: false, message: '계속 추리할지 멈출지 먼저 선택해주세요.' };
  if (actionDuplicate(room, actionId)) return { ok: true, duplicate: true, roomId, message: '이미 처리한 추리입니다.' };
  const actor = roomPlayer(room, pet.id);
  const target = roomPlayer(room, String(targetPetId ?? ''));
  if (!actor || actor.eliminated || actor.forfeited || !target || target.petId === actor.petId || target.eliminated || target.forfeited) return { ok: false, message: '추리할 상대가 올바르지 않습니다.' };
  const tile = target.hand.find((item) => item.id === String(tileId ?? ''));
  if (!tile || tile.revealed) return { ok: false, message: '이미 공개됐거나 존재하지 않는 타일입니다.' };
  const guess = String(guessValue ?? '').trim().toLowerCase();
  const validGuess = guess === 'joker' || (/^(?:[0-9]|1[01])$/.test(guess));
  if (!validGuess) return { ok: false, message: '0~11 또는 조커를 선택해주세요.' };
  const correct = tile.joker ? guess === 'joker' : Number(guess) === tile.value;
  logGuess(room, actor, target, tile, guess, correct, date);
  actor.consecutiveTimeouts = 0;
  if (correct) {
    tile.revealed = true;
    actor.correctGuesses += 1;
    const actorPet = playerPet(state, actor.petId);
    if (actorPet) {
      ensureDavinciRecords(actorPet);
      actorPet.records.davinciTotalCorrect += 1;
      actorPet.records.davinciCorrect += 1;
    }
    updateEliminations(room);
    if (maybeFinish(state, room, date)) return { ok: true, correct: true, finished: true, roomId, message: '정답! 마지막 코드까지 해독해 승리자가 결정되었습니다.' };
    room.turnMode = 'chain';
    room.awaitingDecision = true;
    room.turnStartedAt = nowIso(date);
    room.phaseStartedAt = room.turnStartedAt;
    touch(room, date);
    return { ok: true, correct: true, roomId, message: '정답입니다! 계속 추리하거나 여기서 멈출 수 있습니다.' };
  }
  if (actor.drawnTile) {
    settleDrawnTile(state, room, { reveal: true }, date);
  } else {
    room.phase = 'deckPenalty';
    room.phaseStartedAt = nowIso(date);
    room.turnStartedAt = null;
    room.awaitingDecision = false;
    touch(room, date);
  }
  return { ok: true, correct: false, roomId, message: actor.drawnTile?.joker ? '오답입니다. 뽑은 조커를 공개 상태로 배치해야 합니다.' : '오답입니다. 이번 턴의 패널티가 적용됩니다.' };
}

export function decideDavinciTurn(state, pet, roomId, decision, date = new Date()) {
  const davinci = state.davinci = normalizeDavinci(state.davinci, state);
  const room = davinci.rooms[roomId];
  if (!room || room.phase !== 'turn' || room.currentTurnPetId !== pet.id || !room.awaitingDecision) return { ok: false, message: '지금은 계속 여부를 선택할 수 없습니다.' };
  if (decision === 'continue') {
    room.awaitingDecision = false;
    room.turnMode = 'chain';
    room.turnStartedAt = nowIso(date);
    room.phaseStartedAt = room.turnStartedAt;
    touch(room, date);
    return { ok: true, roomId, message: '추리를 계속합니다.' };
  }
  if (decision === 'stop') {
    room.awaitingDecision = false;
    settleDrawnTile(state, room, { reveal: false }, date);
    return { ok: true, roomId, message: '여기서 멈추고 다음 사람에게 차례를 넘겼습니다.' };
  }
  return { ok: false, message: '계속 추리 또는 멈추기를 선택해주세요.' };
}

export function chooseDavinciPenaltyTile(state, pet, roomId, tileId, date = new Date()) {
  const davinci = state.davinci = normalizeDavinci(state.davinci, state);
  const room = davinci.rooms[roomId];
  if (!room || room.phase !== 'deckPenalty' || room.currentTurnPetId !== pet.id) return { ok: false, message: '지금은 공개할 타일을 선택할 수 없습니다.' };
  const player = roomPlayer(room, pet.id);
  if (!player || !revealDeckEmptyPenalty(state, room, player, String(tileId ?? ''), date)) return { ok: false, message: '공개할 수 있는 비공개 타일을 선택해주세요.' };
  return { ok: true, roomId, message: '자기 타일 하나를 공개하고 차례를 넘겼습니다.' };
}

export function spectateDavinciRoom(state, pet, roomId, date = new Date()) {
  const davinci = state.davinci = normalizeDavinci(state.davinci, state);
  const room = davinci.rooms[roomId];
  if (!room || room.status === 'waiting') return { ok: false, message: '게임이 시작된 방만 관전할 수 있습니다.' };
  if (room.players.some((player) => player.petId === pet.id && !player.leftRoom)) return { ok: false, message: '참가자는 관전자 등록이 필요하지 않습니다.' };
  room.spectators[pet.id] = { petId: pet.id, userId: pet.userId, displayName: pet.displayName, connected: true, joinedAt: room.spectators[pet.id]?.joinedAt || nowIso(date) };
  touch(room, date);
  return { ok: true, roomId, message: '다빈치코드 관전을 시작했습니다.' };
}
export function leaveDavinciSpectator(state, pet, roomId, date = new Date()) {
  const davinci = state.davinci = normalizeDavinci(state.davinci, state);
  const room = davinci.rooms[roomId];
  if (!room) return { ok: true, deleted: true, message: '이미 정리된 다빈치코드 방입니다.' };
  if (!room.spectators?.[pet.id]) return { ok: true, message: '이미 관전을 종료했습니다.' };
  delete room.spectators[pet.id];
  touch(room, date);
  return { ok: true, roomId, message: '관전을 종료했습니다.' };
}

function convertEndedToWaiting(room, date = new Date()) {
  room.status = 'waiting'; room.phase = 'waiting'; room.startedAt = null; room.endedAt = null;
  resetRoundFields(room);
  room.initialJokerTiles = {};
  for (const player of room.players) player.ready = false;
  touch(room, date);
}

export function leaveDavinciRoom(state, pet, roomId, date = new Date()) {
  const davinci = state.davinci = normalizeDavinci(state.davinci, state);
  const room = davinci.rooms[roomId];
  if (!room) return { ok: true, deleted: true, message: '이미 정리된 다빈치코드 방입니다.' };
  const index = room.players.findIndex((player) => player.petId === pet.id);
  if (index < 0) return room.status === 'ended'
    ? { ok: true, roomId, departed: true, message: '이미 종료된 방에서 나갔습니다.' }
    : { ok: false, message: '이 방의 참가자가 아닙니다.' };
  if (room.status === 'playing') {
    const player = room.players[index];
    player.forfeited = true;
    player.eliminated = true;
    player.leftRoom = true;
    player.connected = false;
    player.ready = false;
    // 포기자는 더 이상 추리 대상이 아니므로 남은 코드를 공개해 화면/관전 상태도 일관되게 만든다.
    for (const tile of player.hand) tile.revealed = true;
    player.drawnTile = null;
    room.rematchRequests = room.rematchRequests.filter((petId) => petId !== pet.id);
    updateEliminations(room);
    if (!maybeFinish(state, room, date) && room.currentTurnPetId === pet.id) advanceTurn(state, room, date);
    touch(room, date);
    return { ok: true, roomId, forfeited: true, message: '게임을 포기했습니다. 판돈은 반환되지 않습니다.' };
  }
  room.players.splice(index, 1);
  if (room.status === 'ended') room.players = room.players.filter((player) => !player.leftRoom);
  delete room.spectators[pet.id];
  room.rematchRequests = room.rematchRequests.filter((petId) => petId !== pet.id);
  if (!room.players.length) {
    delete davinci.rooms[roomId];
    return { ok: true, roomId, deleted: true, message: '방을 나갔습니다.' };
  }
  if (room.hostPetId === pet.id) room.hostPetId = room.players[0].petId;
  // 종료 결과 확인으로 나간 플레이어가 있다고 해서 방을 대기방으로 되살리지 않는다.
  // 남은 참가자도 결과를 확인할 수 있도록 ended 상태를 유지하고, 마지막 참가자가 나가면 삭제한다.
  touch(room, date);
  return { ok: true, roomId, departed: room.status === 'ended', message: '방을 나갔습니다.' };
}

export function requestDavinciRematch(state, pet, roomId, date = new Date()) {
  const davinci = state.davinci = normalizeDavinci(state.davinci, state);
  const room = davinci.rooms[roomId];
  if (!room || room.status !== 'ended') return { ok: false, message: '종료된 방에서만 재대결할 수 있습니다.' };
  const participant = room.players.find((player) => player.petId === pet.id && !player.leftRoom);
  if (!participant) return { ok: false, message: '방에 남아 있는 기존 참가자만 재대결할 수 있습니다.' };
  if (!room.rematchRequests.includes(pet.id)) room.rematchRequests.push(pet.id);
  const remaining = room.players.filter((player) => !player.leftRoom);
  const required = remaining.map((player) => player.petId);
  room.rematchRequests = room.rematchRequests.filter((petId) => required.includes(petId));
  if (remaining.length < DAVINCI_MIN_PLAYERS) {
    room.players = remaining;
    room.hostPetId = remaining[0]?.petId ?? null;
    if (!room.players.length) {
      delete davinci.rooms[roomId];
      return { ok: true, roomId, deleted: true, message: '남은 참가자가 없어 방을 닫았습니다.' };
    }
    convertEndedToWaiting(room, date);
    return { ok: true, waiting: true, roomId, message: '다른 참가자가 나가 대기방으로 돌아왔습니다. 새 참가자를 기다려주세요.' };
  }
  if (!required.every((petId) => room.rematchRequests.includes(petId))) {
    touch(room, date);
    return { ok: true, pending: true, roomId, message: `재대결 요청 완료 (${room.rematchRequests.length}/${required.length})` };
  }
  room.players = remaining;
  if (!room.players.some((player) => player.petId === room.hostPetId)) room.hostPetId = room.players[0].petId;
  for (const player of room.players) { player.leftRoom = false; player.ready = player.petId !== room.hostPetId; }
  const result = initializeMatch(state, room, date);
  if (result.ok) ensureInitialJokerStore(room);
  else room.rematchRequests = [];
  return result.ok ? { ...result, message: '전원이 동의해 재대결을 시작합니다.' } : result;
}

export function davinciSetConnected(state, petId, connected) {
  const davinci = state.davinci = normalizeDavinci(state.davinci, state);
  let changed = false;
  for (const room of Object.values(davinci.rooms)) {
    const player = roomPlayer(room, petId);
    if (player && !player.leftRoom && player.connected !== Boolean(connected)) { player.connected = Boolean(connected); changed = true; }
    const spectator = room.spectators?.[petId];
    if (spectator && spectator.connected !== Boolean(connected)) { spectator.connected = Boolean(connected); changed = true; }
  }
  return { changed };
}

function randomRps() { return ['rock', 'paper', 'scissors'][Math.floor(Math.random() * 3)]; }
function randomPosition(length) { return Math.floor(Math.random() * (Math.max(0, length) + 1)); }

function applyTurnTimeout(state, room, deadlineDate) {
  const player = currentPlayer(room);
  if (!player) { advanceTurn(state, room, deadlineDate); return; }
  if (room.awaitingDecision) {
    room.awaitingDecision = false;
    settleDrawnTile(state, room, { reveal: false }, deadlineDate);
    return;
  }
  player.consecutiveTimeouts += 1;
  if (player.consecutiveTimeouts >= DAVINCI_MAX_CONSECUTIVE_TIMEOUTS) {
    player.forfeited = true; player.eliminated = true;
    for (const tile of player.hand) tile.revealed = true;
    player.drawnTile = null;
    if (!maybeFinish(state, room, deadlineDate)) advanceTurn(state, room, deadlineDate);
    return;
  }
  if (player.drawnTile) {
    if (player.drawnTile.joker) {
      player.drawnTile.revealed = true;
      player.hand.splice(randomPosition(player.hand.length), 0, player.drawnTile);
      player.drawnTile = null;
      advanceTurn(state, room, deadlineDate);
    } else settleDrawnTile(state, room, { reveal: true }, deadlineDate);
  } else {
    const hidden = player.hand.filter((tile) => !tile.revealed);
    if (hidden.length) revealDeckEmptyPenalty(state, room, player, hidden[Math.floor(Math.random() * hidden.length)].id, deadlineDate);
    else { player.eliminated = true; if (!maybeFinish(state, room, deadlineDate)) advanceTurn(state, room, deadlineDate); }
  }
}

export function processDavinciTimers(state, date = new Date()) {
  const davinci = state.davinci = normalizeDavinci(state.davinci, state);
  let changed = false;
  for (const [roomId, room] of Object.entries(davinci.rooms)) {
    if (room.status === 'waiting') {
      const base = new Date(room.updatedAt || room.createdAt).getTime();
      if (Number.isFinite(base) && base + DAVINCI_WAITING_ROOM_TTL_MS <= date.getTime()) { delete davinci.rooms[roomId]; changed = true; }
      continue;
    }
    if (room.status === 'ended') {
      const base = new Date(room.endedAt || room.updatedAt).getTime();
      if (Number.isFinite(base) && base + DAVINCI_ENDED_ROOM_TTL_MS <= date.getTime()) { delete davinci.rooms[roomId]; changed = true; }
      continue;
    }
    ensureInitialJokerStore(room);
    let guard = 0;
    while (room.status === 'playing' && guard++ < 8) {
      const startedMs = new Date(room.phase === 'turn' ? room.turnStartedAt : room.phaseStartedAt).getTime();
      if (!Number.isFinite(startedMs)) break;
      let seconds = null;
      if (room.phase === 'jokerSetup' || room.phase === 'drawnJokerPlacement') seconds = DAVINCI_JOKER_SECONDS;
      else if (room.phase === 'rps') seconds = DAVINCI_RPS_SECONDS;
      else if (room.phase === 'orderChoice') seconds = DAVINCI_ORDER_SECONDS;
      else if (room.phase === 'deckPenalty') seconds = DAVINCI_PENALTY_SECONDS;
      else if (room.phase === 'turn') seconds = room.turnMode === 'chain' ? DAVINCI_CHAIN_GUESS_SECONDS : DAVINCI_FIRST_GUESS_SECONDS;
      if (!seconds) break;
      const deadline = startedMs + seconds * 1000;
      if (deadline > date.getTime()) break;
      const at = new Date(deadline);
      changed = true;
      if (room.phase === 'jokerSetup') {
        ensureInitialJokerStore(room);
        const player = room.players.find((candidate) => (room.initialJokerTiles?.[candidate.petId] ?? []).length);
        if (!player) { beginRps(room, at); continue; }
        const pending = room.initialJokerTiles[player.petId];
        const tile = pending.shift();
        player.hand.splice(randomPosition(player.hand.length), 0, tile);
        player.pendingInitialJokers = pending.map((item) => item.id);
        room.phaseStartedAt = nowIso(at);
        if (allInitialJokersPlaced(room)) beginRps(room, at);
      } else if (room.phase === 'rps') {
        for (const petId of room.rpsCandidates) if (!room.rpsChoices[petId]) room.rpsChoices[petId] = randomRps();
        evaluateRps(room, at);
      } else if (room.phase === 'orderChoice') {
        chooseOrder(room, Math.random() < 0.5 ? 'first' : 'last', at);
      } else if (room.phase === 'drawnJokerPlacement') {
        const player = currentPlayer(room);
        if (player?.drawnTile?.joker) { player.hand.splice(randomPosition(player.hand.length), 0, player.drawnTile); player.drawnTile = null; }
        advanceTurn(state, room, at);
      } else if (room.phase === 'deckPenalty') {
        const player = currentPlayer(room);
        const hidden = player?.hand?.filter((tile) => !tile.revealed) ?? [];
        if (hidden.length) revealDeckEmptyPenalty(state, room, player, hidden[Math.floor(Math.random() * hidden.length)].id, at);
        else { if (player) player.eliminated = true; if (!maybeFinish(state, room, at)) advanceTurn(state, room, at); }
      } else if (room.phase === 'turn') {
        applyTurnTimeout(state, room, at);
      }
    }
  }
  return { changed };
}

export function davinciNextAlarmAt(state, date = new Date()) {
  const davinci = state.davinci = normalizeDavinci(state.davinci, state);
  const now = date.getTime();
  const times = [];
  for (const room of Object.values(davinci.rooms)) {
    if (room.status === 'waiting') times.push(new Date(room.updatedAt || room.createdAt).getTime() + DAVINCI_WAITING_ROOM_TTL_MS);
    else if (room.status === 'ended') times.push(new Date(room.endedAt || room.updatedAt).getTime() + DAVINCI_ENDED_ROOM_TTL_MS);
    else {
      const base = new Date(room.phase === 'turn' ? room.turnStartedAt : room.phaseStartedAt).getTime();
      let seconds = null;
      if (room.phase === 'jokerSetup' || room.phase === 'drawnJokerPlacement') seconds = DAVINCI_JOKER_SECONDS;
      else if (room.phase === 'rps') seconds = DAVINCI_RPS_SECONDS;
      else if (room.phase === 'orderChoice') seconds = DAVINCI_ORDER_SECONDS;
      else if (room.phase === 'deckPenalty') seconds = DAVINCI_PENALTY_SECONDS;
      else if (room.phase === 'turn') seconds = room.turnMode === 'chain' ? DAVINCI_CHAIN_GUESS_SECONDS : DAVINCI_FIRST_GUESS_SECONDS;
      if (Number.isFinite(base) && seconds) times.push(base + seconds * 1000);
    }
  }
  const valid = times.filter((value) => Number.isFinite(value) && value > now);
  return valid.length ? new Date(Math.min(...valid)).toISOString() : null;
}

export function removePetFromDavinci(state, petId, date = new Date()) {
  const davinci = state.davinci = normalizeDavinci(state.davinci, state);
  for (const [roomId, room] of Object.entries(davinci.rooms)) {
    delete room.spectators?.[petId];
    const player = roomPlayer(room, petId);
    if (!player) continue;
    if (room.status === 'playing') {
      player.forfeited = true; player.eliminated = true; player.leftRoom = true; player.connected = false;
      for (const tile of player.hand) tile.revealed = true;
      player.drawnTile = null;
      if (!maybeFinish(state, room, date) && room.currentTurnPetId === petId) advanceTurn(state, room, date);
    } else {
      room.players = room.players.filter((item) => item.petId !== petId);
      if (!room.players.length) delete davinci.rooms[roomId];
      else {
        if (room.hostPetId === petId) room.hostPetId = room.players[0].petId;
        if (room.status === 'ended') convertEndedToWaiting(room, date);
      }
    }
  }
}

export function clearEndedDavinciRooms(state) {
  const davinci = state.davinci = normalizeDavinci(state.davinci, state);
  const ids = Object.values(davinci.rooms).filter((room) => room.status === 'ended' && room.settled).map((room) => room.id);
  for (const roomId of ids) delete davinci.rooms[roomId];
  return { ok: true, cleared: ids.length, message: ids.length ? `종료된 다빈치코드 방 ${ids.length}개를 비웠습니다.` : '비울 종료 다빈치코드 방이 없습니다.' };
}

export function davinciRanking(state, viewerPetId = null, limit = 5) {
  const rows = Object.values(state.pets ?? {}).filter((pet) => pet?.alive).map((pet) => {
    ensureDavinciRecords(pet);
    return { petId: pet.id, displayName: pet.displayName, wins: pet.records.davinciWins, correct: pet.records.davinciCorrect };
  }).filter((row) => row.wins || row.correct)
    .sort((a, b) => b.wins - a.wins || b.correct - a.correct || a.displayName.localeCompare(b.displayName, 'ko'));
  const ranked = rows.map((row, index) => {
    const previous = rows[index - 1];
    const rank = previous && previous.wins === row.wins && previous.correct === row.correct ? null : index + 1;
    let resolvedRank = rank;
    if (resolvedRank == null) {
      for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
        if (rows[cursor].wins === row.wins && rows[cursor].correct === row.correct) continue;
        resolvedRank = cursor + 2; break;
      }
      if (resolvedRank == null) resolvedRank = 1;
    }
    return { ...row, rank: resolvedRank };
  });
  return { top: ranked.slice(0, limit), mine: viewerPetId ? ranked.find((row) => row.petId === viewerPetId) ?? null : null };
}

function publicTile(tile, ownerPetId, viewerPetId, viewerIsOwner, drawn = false) {
  const visible = viewerIsOwner || tile.revealed;
  return {
    id: tile.id,
    color: tile.color,
    revealed: Boolean(tile.revealed),
    hidden: !visible,
    value: visible && !tile.joker ? tile.value : null,
    joker: visible ? Boolean(tile.joker) : false,
    drawn: Boolean(drawn),
    ownerPetId
  };
}

function playerView(room, player, viewerPetId) {
  const mine = player.petId === viewerPetId && !player.leftRoom;
  return {
    petId: player.petId,
    displayName: player.displayName,
    ready: player.ready,
    connected: player.connected,
    eliminated: player.eliminated,
    forfeited: player.forfeited,
    leftRoom: player.leftRoom,
    correctGuesses: player.correctGuesses,
    consecutiveTimeouts: player.consecutiveTimeouts,
    hand: player.hand.map((tile) => publicTile(tile, player.petId, viewerPetId, mine)),
    drawnTile: mine && player.drawnTile ? publicTile(player.drawnTile, player.petId, viewerPetId, true, true) : null,
    pendingJokerCount: mine ? player.pendingInitialJokers.length : 0,
    pendingJokers: mine ? (room.initialJokerTiles?.[player.petId] ?? []).map((tile) => ({ id: tile.id, color: tile.color, joker: true })) : []
  };
}

export function davinciRoomView(state, roomId, viewerPetId, date = new Date()) {
  const davinci = state.davinci = normalizeDavinci(state.davinci, state);
  const room = davinci.rooms[roomId];
  if (!room) return null;
  ensureInitialJokerStore(room);
  const participant = roomPlayer(room, viewerPetId);
  const player = participant && !participant.leftRoom ? participant : null;
  const spectator = room.spectators?.[viewerPetId];
  const viewerRole = player ? 'player' : spectator ? 'spectator' : 'none';
  const rpsChoices = {};
  // 결과가 확정되기 전에는 다른 사람의 가위바위보 선택을 절대 노출하지 않는다.
  if (room.phase !== 'rps') Object.assign(rpsChoices, room.rpsChoices);
  else if (viewerRole === 'player' && room.rpsChoices[viewerPetId]) rpsChoices[viewerPetId] = room.rpsChoices[viewerPetId];
  const now = date.getTime();
  let deadlineAt = null;
  const base = new Date(room.phase === 'turn' ? room.turnStartedAt : room.phaseStartedAt).getTime();
  let seconds = null;
  if (room.phase === 'jokerSetup' || room.phase === 'drawnJokerPlacement') seconds = DAVINCI_JOKER_SECONDS;
  else if (room.phase === 'rps') seconds = DAVINCI_RPS_SECONDS;
  else if (room.phase === 'orderChoice') seconds = DAVINCI_ORDER_SECONDS;
  else if (room.phase === 'deckPenalty') seconds = DAVINCI_PENALTY_SECONDS;
  else if (room.phase === 'turn') seconds = room.turnMode === 'chain' ? DAVINCI_CHAIN_GUESS_SECONDS : DAVINCI_FIRST_GUESS_SECONDS;
  if (Number.isFinite(base) && seconds) deadlineAt = new Date(base + seconds * 1000).toISOString();
  return {
    id: room.id,
    roomNumber: room.roomNumber,
    status: room.status,
    phase: room.phase,
    stakePoints: room.stakePoints,
    hostPetId: room.hostPetId,
    players: room.players.map((item) => playerView(room, item, viewerPetId)),
    viewerRole,
    selfPetId: viewerPetId,
    spectatorCount: Object.values(room.spectators ?? {}).filter((item) => item.connected).length,
    deckCount: room.deck.length,
    turnOrder: [...room.turnOrder],
    currentTurnPetId: room.currentTurnPetId,
    turnMode: room.turnMode,
    awaitingDecision: room.awaitingDecision,
    isMyTurn: room.currentTurnPetId === viewerPetId && player && !player.eliminated && !player.forfeited,
    rpsCandidates: [...room.rpsCandidates],
    rpsChoices,
    rpsRound: room.rpsRound,
    lastRpsResult: room.lastRpsResult ? structuredClone(room.lastRpsResult) : null,
    rpsWinnerPetId: room.rpsWinnerPetId,
    orderChoice: room.orderChoice,
    winnerPetId: room.winnerPetId,
    resultReason: room.resultReason,
    rematchRequests: [...room.rematchRequests],
    rematchRequestedByMe: room.rematchRequests.includes(viewerPetId),
    rematchEligibleCount: room.players.filter((item) => !item.leftRoom).length,
    guessLog: room.guessLog.map((item) => ({ ...item })),
    deadlineAt,
    serverTime: now,
    createdAt: room.createdAt,
    startedAt: room.startedAt,
    endedAt: room.endedAt
  };
}

export function davinciView(state, viewerPetId, date = new Date()) {
  const davinci = state.davinci = normalizeDavinci(state.davinci, state);
  const rooms = Object.values(davinci.rooms).sort((a, b) => a.roomNumber - b.roomNumber || new Date(a.createdAt) - new Date(b.createdAt))
    .map((room) => davinciRoomView(state, room.id, viewerPetId, date));
  return {
    rooms,
    maxRooms: DAVINCI_MAX_ROOMS,
    minPlayers: DAVINCI_MIN_PLAYERS,
    maxPlayers: DAVINCI_MAX_PLAYERS,
    ranking: davinciRanking(state, viewerPetId, 5),
    serverTime: date.getTime()
  };
}
