import { id } from '../lib/ids.js';
import { consumeInteractionHunger } from './activity.js';
import { completeDailyGoal } from './progression.js';

export const LIAR_MIN_PLAYERS = 3;
export const LIAR_MAX_PLAYERS = 12;
export const LIAR_PLAYER_OPTIONS = Array.from({ length: LIAR_MAX_PLAYERS - LIAR_MIN_PLAYERS + 1 }, (_, index) => LIAR_MIN_PLAYERS + index);
export const LIAR_DISCUSSION_OPTIONS = [60, 120];
export const LIAR_BET_OPTIONS = [10, 100, 500];
export const LIAR_MAX_MESSAGES = 120;
export const LIAR_TOTAL_ROUNDS = 1;
export const LIAR_VOTING_SECONDS = 20;
export const LIAR_REVOTE_SECONDS = 20;
export const LIAR_GUESS_SECONDS = 20;
export const LIAR_RESULT_SECONDS = 20;

export const LIAR_WORD_BANK = {
  음식: ['떡볶이', '김치찌개', '삼겹살', '치킨', '냉면', '초밥', '햄버거', '피자', '마라탕', '붕어빵', '라면', '비빔밥', '수박', '팥빙수', '짜장면', '탕수육', '김밥', '닭발', '족발', '샌드위치'],
  장소: ['놀이공원', '노래방', '편의점', '공항', '수영장', '찜질방', '헬스장', '학교', '도서관', '결혼식장', '캠핑장', '동물원', 'PC방', '병원', '영화관', '지하철', '카페', '미용실'],
  직업: ['소방관', '간호사', '교사', '요리사', '경찰관', '개발자', '유튜버', '미용사', '변호사', '파일럿', '배우', '운동선수', '택배기사', '연구원', '사진작가', '아나운서', '수의사'],
  사물: ['우산', '냉장고', '선풍기', '칫솔', '리모컨', '이어폰', '거울', '지갑', '충전기', '가위', '전자레인지', '베개', '엘리베이터', '카메라', '에어컨', '세탁기', '노트북', '손전등', '체중계'],
  동물: ['고양이', '강아지', '기린', '펭귄', '문어', '호랑이', '토끼', '코끼리', '햄스터', '캥거루', '돌고래', '악어', '다람쥐', '독수리', '판다', '사자', '거북이', '해파리'],
  '취미·활동': ['등산', '낚시', '볼링', '요리', '사진 촬영', '드라이브', '캠핑', '독서', '러닝', '게임', '쇼핑', '여행', '수영', '노래 부르기', '자전거', '보드게임', '영화 보기', '뜨개질']
};

const nowIso = (date = new Date()) => date.toISOString();
const cleanText = (value, maxLength) => String(value ?? '').replace(/\s+/gu, ' ').trim().slice(0, maxLength);
const parseTime = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};
const randomItem = (items) => items[Math.floor(Math.random() * items.length)];
const nonNegativeInt = (value) => Math.max(0, Math.floor(Number(value) || 0));

export function initialLiarGame() {
  return {
    version: 3,
    phase: 'waiting',
    hostPetId: null,
    players: {},
    spectators: {},
    settings: { totalRounds: LIAR_TOTAL_ROUNDS, discussionSeconds: 60, maxPlayers: LIAR_MAX_PLAYERS, betPoints: 10 },
    roundNo: 0,
    roundPlayerIds: [],
    category: null,
    word: null,
    liarPetId: null,
    phaseEndsAt: null,
    votes: {},
    voteRound: 1,
    voteCandidateIds: [],
    accusedPetId: null,
    roundResult: null,
    messages: [],
    publicEventPending: null,
    updatedAt: nowIso()
  };
}

function validPhase(value) {
  return ['waiting', 'discussion', 'voting', 'liar_guess', 'result', 'game_over'].includes(value) ? value : 'waiting';
}

function addSystem(game, text, date = new Date()) {
  game.messages.push({ id: id('liarmsg'), type: 'system', text: cleanText(text, 260), createdAt: nowIso(date) });
  game.messages = game.messages.slice(-LIAR_MAX_MESSAGES);
  game.updatedAt = nowIso(date);
}

function connectedPlayers(game, { roundOnly = false } = {}) {
  const allowed = roundOnly ? new Set(game.roundPlayerIds) : null;
  return Object.values(game.players)
    .filter((player) => player.connected && !player.forfeited && (!allowed || allowed.has(player.petId)))
    .sort((a, b) => new Date(a.joinedAt) - new Date(b.joinedAt));
}

function oldestConnectedPlayerId(game) {
  return connectedPlayers(game)[0]?.petId ?? null;
}

export function normalizeLiarGame(raw, state) {
  const base = initialLiarGame();
  const game = raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...base, ...raw } : base;
  game.phase = validPhase(game.phase);
  game.players = game.players && typeof game.players === 'object' && !Array.isArray(game.players) ? game.players : {};
  game.spectators = game.spectators && typeof game.spectators === 'object' && !Array.isArray(game.spectators) ? game.spectators : {};
  game.settings = game.settings && typeof game.settings === 'object' && !Array.isArray(game.settings) ? game.settings : {};
  game.settings.totalRounds = LIAR_TOTAL_ROUNDS;
  game.settings.discussionSeconds = LIAR_DISCUSSION_OPTIONS.includes(Number(game.settings.discussionSeconds)) ? Number(game.settings.discussionSeconds) : 60;
  game.settings.maxPlayers = Math.max(LIAR_MIN_PLAYERS, Math.min(LIAR_MAX_PLAYERS, Math.floor(Number(game.settings.maxPlayers) || LIAR_MAX_PLAYERS)));
  game.settings.betPoints = LIAR_BET_OPTIONS.includes(Number(game.settings.betPoints)) ? Number(game.settings.betPoints) : 10;
  game.roundNo = Math.max(0, Math.min(LIAR_TOTAL_ROUNDS, Math.floor(Number(game.roundNo) || 0)));
  game.roundPlayerIds = Array.isArray(game.roundPlayerIds) ? [...new Set(game.roundPlayerIds.map(String))] : [];
  game.votes = game.votes && typeof game.votes === 'object' && !Array.isArray(game.votes) ? game.votes : {};
  game.voteRound = Number(game.voteRound) === 2 ? 2 : 1;
  game.voteCandidateIds = Array.isArray(game.voteCandidateIds) ? [...new Set(game.voteCandidateIds.map(String))] : [];
  game.messages = Array.isArray(game.messages) ? game.messages.slice(-LIAR_MAX_MESSAGES) : [];
  game.phaseEndsAt = parseTime(game.phaseEndsAt) == null ? null : new Date(parseTime(game.phaseEndsAt)).toISOString();
  game.updatedAt = parseTime(game.updatedAt) == null ? nowIso() : new Date(parseTime(game.updatedAt)).toISOString();

  for (const [petId, player] of Object.entries(game.players)) {
    const pet = state?.pets?.[petId];
    if (!pet?.alive || !player || typeof player !== 'object' || Array.isArray(player)) {
      delete game.players[petId];
      continue;
    }
    player.petId = petId;
    player.userId = pet.userId;
    player.displayName = pet.displayName;
    player.joinedAt = parseTime(player.joinedAt) == null ? nowIso() : new Date(parseTime(player.joinedAt)).toISOString();
    player.connected = Boolean(player.connected);
    player.ready = Boolean(player.ready);
    player.score = nonNegativeInt(player.score);
    player.lastChatAt = parseTime(player.lastChatAt) == null ? null : new Date(parseTime(player.lastChatAt)).toISOString();
    player.escrowRemaining = nonNegativeInt(player.escrowRemaining);
    player.currentRoundStake = nonNegativeInt(player.currentRoundStake);
    player.forfeited = Boolean(player.forfeited);
  }

  for (const [petId, spectator] of Object.entries(game.spectators)) {
    const pet = state?.pets?.[petId];
    if (!pet?.alive || game.players[petId] || !spectator || typeof spectator !== 'object' || Array.isArray(spectator)) {
      delete game.spectators[petId];
      continue;
    }
    spectator.petId = petId;
    spectator.userId = pet.userId;
    spectator.displayName = pet.displayName;
    spectator.joinedAt = parseTime(spectator.joinedAt) == null ? nowIso() : new Date(parseTime(spectator.joinedAt)).toISOString();
    spectator.connected = Boolean(spectator.connected);
  }

  game.roundPlayerIds = game.roundPlayerIds.filter((petId) => game.players[petId]);
  game.voteCandidateIds = game.voteCandidateIds.filter((petId) => game.roundPlayerIds.includes(petId));
  for (const [voterId, targetId] of Object.entries(game.votes)) {
    if (!game.roundPlayerIds.includes(voterId) || !game.roundPlayerIds.includes(targetId)) delete game.votes[voterId];
  }
  if (!game.players[game.hostPetId] || !game.players[game.hostPetId].connected) game.hostPetId = oldestConnectedPlayerId(game);
  if (!game.players[game.liarPetId]) game.liarPetId = null;
  if (['waiting', 'game_over'].includes(game.phase)) {
    for (const [petId, player] of Object.entries(game.players)) if (!player.connected) delete game.players[petId];
  }
  return game;
}

function resetRoundFields(game) {
  game.roundPlayerIds = [];
  game.category = null;
  game.word = null;
  game.liarPetId = null;
  game.phaseEndsAt = null;
  game.votes = {};
  game.voteRound = 1;
  game.voteCandidateIds = [];
  game.accusedPetId = null;
  game.roundResult = null;
}

function refundPlayer(state, player, { includeCurrent = true } = {}) {
  if (player.forfeited) return 0;
  const pet = state.pets[player.petId];
  if (!pet?.alive) return 0;
  const refund = player.escrowRemaining + (includeCurrent ? player.currentRoundStake : 0);
  if (refund > 0) {
    pet.stats.points += refund;
    pet.records.pointsSpent = Math.max(0, (pet.records.pointsSpent ?? 0) - refund);
  }
  player.escrowRemaining = 0;
  if (includeCurrent) player.currentRoundStake = 0;
  return refund;
}

function refundAll(state, game, options = {}) {
  let total = 0;
  for (const player of Object.values(game.players)) total += refundPlayer(state, player, options);
  return total;
}

function returnToWaitingForTooFewPlayers(state, game, date = new Date()) {
  const refunded = refundAll(state, game, { includeCurrent: true });
  const connected = connectedPlayers(game);
  const fresh = initialLiarGame();
  fresh.settings = { ...game.settings };
  for (const player of connected) {
    if (!state.pets[player.petId]?.alive) continue;
    fresh.players[player.petId] = { ...player, connected: true, ready: false, score: 0, escrowRemaining: 0, currentRoundStake: 0, forfeited: false };
  }
  fresh.hostPetId = oldestConnectedPlayerId(fresh);
  addSystem(fresh, `접속 인원이 부족해 게임이 종료되었습니다. ${refunded}P를 환불했습니다.`, date);
  state.liarGame = fresh;
  return fresh;
}

export function liarJoin(state, pet, date = new Date()) {
  const game = state.liarGame = normalizeLiarGame(state.liarGame, state);
  const existing = game.players[pet.id];
  if (existing) {
    existing.connected = true;
    existing.forfeited = false;
    existing.displayName = pet.displayName;
    game.updatedAt = nowIso(date);
    return { ok: true, message: '라이어게임에 다시 연결했습니다.' };
  }
  if (game.phase !== 'waiting') return { ok: false, message: '게임이 진행 중입니다. 현재 게임이 끝난 뒤 참가해주세요.' };
  delete game.spectators[pet.id];
  if (Object.keys(game.players).length >= game.settings.maxPlayers) return { ok: false, message: '라이어게임 참가 인원이 가득 찼습니다.' };
  game.players[pet.id] = {
    petId: pet.id, userId: pet.userId, displayName: pet.displayName, joinedAt: nowIso(date),
    connected: true, ready: false, score: 0, lastChatAt: null,
    escrowRemaining: 0, currentRoundStake: 0, forfeited: false
  };
  if (!game.hostPetId) {
    game.hostPetId = pet.id;
    addSystem(game, `${pet.displayName}이 방장이 되었습니다.`, date);
  } else addSystem(game, `${pet.displayName}이 참가했습니다.`, date);
  return { ok: true, message: '라이어게임에 참가했습니다.' };
}

export function liarSpectate(state, pet, date = new Date()) {
  const game = state.liarGame = normalizeLiarGame(state.liarGame, state);
  if (game.players[pet.id]) return { ok: false, message: '플레이어는 관전자로 들어갈 수 없습니다.' };
  if (game.phase === 'waiting') return { ok: false, message: '게임이 진행 중일 때만 관전할 수 있습니다.' };
  const existing = game.spectators[pet.id];
  game.spectators[pet.id] = {
    petId: pet.id, userId: pet.userId, displayName: pet.displayName,
    joinedAt: existing?.joinedAt ?? nowIso(date), connected: true
  };
  game.updatedAt = nowIso(date);
  return { ok: true, message: '라이어게임 관전을 시작했습니다.' };
}

export function liarStopSpectating(state, pet, date = new Date()) {
  const game = state.liarGame = normalizeLiarGame(state.liarGame, state);
  if (!game.spectators[pet.id]) return { ok: false, message: '라이어게임을 관전 중이 아닙니다.' };
  delete game.spectators[pet.id];
  game.updatedAt = nowIso(date);
  return { ok: true, message: '라이어게임 관전을 종료했습니다.' };
}

function forfeitPlayer(game, player, date = new Date()) {
  player.connected = false;
  player.forfeited = true;
  player.escrowRemaining = 0;
  addSystem(game, `${player.displayName}이 이탈해 남은 판돈을 포기했습니다.`, date);
}

export function liarSetConnected(state, petId, connected, date = new Date()) {
  const game = state.liarGame = normalizeLiarGame(state.liarGame, state);
  const player = game.players[petId];
  if (!player) {
    const spectator = game.spectators[petId];
    if (!spectator || spectator.connected === Boolean(connected)) return { changed: false };
    spectator.connected = Boolean(connected);
    game.updatedAt = nowIso(date);
    return { changed: true, spectator: true };
  }
  if (connected) {
    if (player.connected) return { changed: false };
    if (!['waiting', 'game_over'].includes(game.phase)) return { changed: false };
    player.connected = true;
    player.forfeited = false;
    addSystem(game, `${player.displayName}이 다시 접속했습니다.`, date);
  } else {
    if (!player.connected) return { changed: false };
    if (['waiting', 'game_over'].includes(game.phase)) {
      delete game.players[petId];
      addSystem(game, `${player.displayName}이 연결 종료로 퇴장했습니다.`, date);
    } else forfeitPlayer(game, player, date);
  }
  if (game.hostPetId === petId && !game.players[petId]?.connected) {
    game.hostPetId = oldestConnectedPlayerId(game);
    if (game.hostPetId) addSystem(game, `${game.players[game.hostPetId].displayName}이 새 방장이 되었습니다.`, date);
  }
  if (!connected && !['waiting', 'game_over'].includes(game.phase) && connectedPlayers(game).length < LIAR_MIN_PLAYERS) {
    returnToWaitingForTooFewPlayers(state, game, date);
    return { changed: true, autoEnded: true };
  }
  if (!connected && connectedPlayers(game).length === 0) state.liarGame = initialLiarGame();
  return { changed: true };
}

export function liarLeave(state, pet, date = new Date()) {
  const game = state.liarGame = normalizeLiarGame(state.liarGame, state);
  const player = game.players[pet.id];
  if (!player) return { ok: false, message: '라이어게임에 참가 중이 아닙니다.' };
  if (['waiting', 'game_over'].includes(game.phase)) {
    delete game.players[pet.id];
    addSystem(game, `${player.displayName}이 퇴장했습니다.`, date);
  } else forfeitPlayer(game, player, date);
  if (game.hostPetId === pet.id) game.hostPetId = oldestConnectedPlayerId(game);
  if (!['waiting', 'game_over'].includes(game.phase) && connectedPlayers(game).length < LIAR_MIN_PLAYERS) returnToWaitingForTooFewPlayers(state, game, date);
  return { ok: true, message: '라이어게임에서 나갔습니다. 진행 중 이탈이면 판돈은 환불되지 않습니다.' };
}

export function liarToggleReady(state, pet, date = new Date()) {
  const game = state.liarGame = normalizeLiarGame(state.liarGame, state);
  if (game.phase !== 'waiting') return { ok: false, message: '대기실에서만 준비할 수 있습니다.' };
  const player = game.players[pet.id];
  if (!player?.connected) return { ok: false, message: '먼저 참가해주세요.' };
  player.ready = !player.ready;
  game.updatedAt = nowIso(date);
  return { ok: true, message: player.ready ? '준비했습니다.' : '준비를 취소했습니다.', ready: player.ready };
}

export function liarUpdateSettings(state, pet, input = {}, date = new Date()) {
  const game = state.liarGame = normalizeLiarGame(state.liarGame, state);
  if (game.hostPetId !== pet.id) return { ok: false, message: '방장만 설정을 변경할 수 있습니다.' };
  if (game.phase !== 'waiting') return { ok: false, message: '대기실에서만 설정을 변경할 수 있습니다.' };
  const discussionSeconds = Number(input.discussionSeconds);
  const betPoints = Number(input.betPoints);
  const maxPlayers = Number(input.maxPlayers);
  if (LIAR_DISCUSSION_OPTIONS.includes(discussionSeconds)) game.settings.discussionSeconds = discussionSeconds;
  if (LIAR_BET_OPTIONS.includes(betPoints)) game.settings.betPoints = betPoints;
  if (LIAR_PLAYER_OPTIONS.includes(maxPlayers)) {
    const joinedCount = connectedPlayers(game).length;
    if (maxPlayers < joinedCount) return { ok: false, message: `현재 ${joinedCount}명이 참가 중이라 최대 인원을 ${maxPlayers}명으로 줄일 수 없습니다.` };
    game.settings.maxPlayers = maxPlayers;
  }
  game.updatedAt = nowIso(date);
  return { ok: true, message: `토론 ${game.settings.discussionSeconds}초 · 판돈 ${game.settings.betPoints}P · 최대 ${game.settings.maxPlayers}명으로 설정했습니다.` };
}

function startRound(state, game, date = new Date()) {
  const players = connectedPlayers(game);
  if (players.length < LIAR_MIN_PLAYERS) {
    returnToWaitingForTooFewPlayers(state, game, date);
    return false;
  }
  game.roundNo += 1;
  resetRoundFields(game);
  game.roundPlayerIds = players.map((player) => player.petId);
  const categories = Object.keys(LIAR_WORD_BANK);
  game.category = randomItem(categories);
  game.word = randomItem(LIAR_WORD_BANK[game.category]);
  game.liarPetId = randomItem(game.roundPlayerIds);
  const bet = game.settings.betPoints;
  for (const player of players) {
    if (player.escrowRemaining < bet) {
      returnToWaitingForTooFewPlayers(state, game, date);
      return false;
    }
    player.escrowRemaining -= bet;
    player.currentRoundStake = bet;
  }
  game.phase = 'discussion';
  game.phaseEndsAt = new Date(date.getTime() + game.settings.discussionSeconds * 1000).toISOString();
  addSystem(game, `${game.roundNo}라운드가 시작됐습니다. 라운드 판돈 ${bet}P`, date);
  return true;
}

export function liarStart(state, pet, date = new Date()) {
  const game = state.liarGame = normalizeLiarGame(state.liarGame, state);
  if (game.hostPetId !== pet.id) return { ok: false, message: '방장만 게임을 시작할 수 있습니다.' };
  if (game.phase !== 'waiting') return { ok: false, message: '이미 게임이 진행 중입니다.' };
  const players = connectedPlayers(game);
  if (players.length < LIAR_MIN_PLAYERS) return { ok: false, message: `최소 ${LIAR_MIN_PLAYERS}명이 필요합니다.` };
  if (players.some((player) => !player.ready)) return { ok: false, message: '모든 참가자가 준비해야 시작할 수 있습니다.' };
  const reserve = game.settings.betPoints * LIAR_TOTAL_ROUNDS;
  for (const player of players) {
    const target = state.pets[player.petId];
    if (!target || target.stats.points < reserve) return { ok: false, message: `${player.displayName}에게 판돈 ${reserve}P가 없습니다.` };
  }
  const hungerCosts = {};
  for (const player of players) {
    const target = state.pets[player.petId];
    const hungerUse = consumeInteractionHunger(target, date);
    hungerCosts[player.petId] = hungerUse.cost;
    target.stats.points -= reserve;
    target.records.pointsSpent += reserve;
    player.escrowRemaining = reserve;
    player.currentRoundStake = 0;
    player.score = 0;
    player.forfeited = false;
  }
  game.roundNo = 0;
  game.publicEventPending = null;
  startRound(state, game, date);
  return { ok: true, message: `라이어게임을 시작했습니다. 각 참가자의 판돈 ${reserve}P를 보관했습니다.`, hungerCosts };
}

function beginVoting(game, date = new Date(), candidateIds = null) {
  game.phase = 'voting';
  game.votes = {};
  game.voteCandidateIds = candidateIds ? [...candidateIds] : [...game.roundPlayerIds];
  game.phaseEndsAt = new Date(date.getTime() + (game.voteRound === 2 ? LIAR_REVOTE_SECONDS : LIAR_VOTING_SECONDS) * 1000).toISOString();
  addSystem(game, game.voteRound === 2 ? '재투표를 시작합니다.' : '투표를 시작합니다.', date);
}

function eligibleVoterIds(game) {
  return connectedPlayers(game, { roundOnly: true }).map((player) => player.petId);
}

function eligibleCandidateIds(game) {
  const connected = new Set(eligibleVoterIds(game));
  const candidates = game.voteCandidateIds.length ? game.voteCandidateIds : game.roundPlayerIds;
  return candidates.filter((petId) => connected.has(petId));
}

export function liarVote(state, pet, targetPetId, date = new Date()) {
  const game = state.liarGame = normalizeLiarGame(state.liarGame, state);
  if (game.phase !== 'voting') return { ok: false, message: '현재 투표 시간이 아닙니다.' };
  if (!eligibleVoterIds(game).includes(pet.id)) return { ok: false, message: '투표할 수 없는 상태입니다.' };
  if (!eligibleCandidateIds(game).includes(targetPetId)) return { ok: false, message: '선택할 수 없는 참가자입니다.' };
  if (game.votes[pet.id]) return { ok: false, message: '이미 투표했습니다.' };
  game.votes[pet.id] = targetPetId;
  if (Object.keys(game.votes).length >= eligibleVoterIds(game).length) finishVoting(state, game, date);
  return { ok: true, message: '투표했습니다.' };
}

function settleRoundPot(state, game, liarWon) {
  const roundPlayers = game.roundPlayerIds.map((petId) => game.players[petId]).filter(Boolean);
  const pot = roundPlayers.reduce((sum, player) => sum + player.currentRoundStake, 0);
  const eligible = liarWon
    ? roundPlayers.filter((player) => player.petId === game.liarPetId && player.connected && !player.forfeited)
    : roundPlayers.filter((player) => player.petId !== game.liarPetId && player.connected && !player.forfeited);
  const each = eligible.length ? Math.floor(pot / eligible.length) : 0;
  for (const player of eligible) {
    const pet = state.pets[player.petId];
    if (!pet?.alive) continue;
    pet.stats.points += each;
    pet.records.pointsEarned += each;
    pet.records.liarPointsWon += each;
  }
  for (const player of roundPlayers) player.currentRoundStake = 0;
  return { pot, each, winnerPetIds: eligible.map((player) => player.petId), discarded: pot - each * eligible.length };
}

function finishRound(state, game, { liarWon, reason, voteCounts = {}, guess = null }, date = new Date()) {
  if (game.phase === 'result' && game.roundResult) return;
  const payout = settleRoundPot(state, game, liarWon);
  const liar = game.players[game.liarPetId];
  if (liarWon && liar) liar.score += 2;
  if (!liarWon) for (const player of Object.values(game.players)) if (game.roundPlayerIds.includes(player.petId) && player.petId !== game.liarPetId && !player.forfeited) player.score += 1;
  game.roundResult = {
    roundNo: game.roundNo, liarWon, reason, voteCounts, guess,
    liarPetId: game.liarPetId, liarDisplayName: liar?.displayName ?? '라이어',
    word: game.word, payout, createdAt: nowIso(date)
  };
  game.phase = 'result';
  game.phaseEndsAt = new Date(date.getTime() + LIAR_RESULT_SECONDS * 1000).toISOString();
  addSystem(game, `${reason} 총 ${payout.pot}P 정산`, date);
}

function finishVoting(state, game, date = new Date()) {
  const voters = new Set(eligibleVoterIds(game));
  const candidates = new Set(eligibleCandidateIds(game));
  const validTargets = Object.entries(game.votes).filter(([voterId, targetId]) => voters.has(voterId) && candidates.has(targetId)).map(([, targetId]) => targetId);
  if (!validTargets.length) return finishRound(state, game, { liarWon: true, reason: '유효한 투표가 없어 라이어가 살아남았습니다.' }, date);
  const counts = {};
  for (const targetId of validTargets) counts[targetId] = (counts[targetId] ?? 0) + 1;
  const highest = Math.max(...Object.values(counts));
  const top = Object.keys(counts).filter((petId) => counts[petId] === highest);
  if (top.length !== 1) {
    if (game.voteRound === 1) {
      game.voteRound = 2;
      beginVoting(game, date, top);
      return;
    }
    finishRound(state, game, { liarWon: true, reason: '재투표도 동률이라 라이어가 살아남았습니다.', voteCounts: counts }, date);
    return;
  }
  game.accusedPetId = top[0];
  const accused = game.players[game.accusedPetId];
  if (game.accusedPetId === game.liarPetId) {
    game.phase = 'liar_guess';
    game.phaseEndsAt = new Date(date.getTime() + LIAR_GUESS_SECONDS * 1000).toISOString();
    addSystem(game, `${accused?.displayName ?? '라이어'}이 라이어로 지목됐습니다. 제시어를 맞히세요.`, date);
  } else finishRound(state, game, { liarWon: true, reason: `${accused?.displayName ?? '지목된 참가자'}은 라이어가 아니었습니다.`, voteCounts: counts }, date);
}

export function liarGuess(state, pet, guessValue, date = new Date()) {
  const game = state.liarGame = normalizeLiarGame(state.liarGame, state);
  if (game.phase !== 'liar_guess') return { ok: false, message: '현재 제시어를 맞히는 단계가 아닙니다.' };
  if (game.liarPetId !== pet.id) return { ok: false, message: '라이어만 답을 제출할 수 있습니다.' };
  const guess = cleanText(guessValue, 40);
  if (!guess) return { ok: false, message: '답을 입력해주세요.' };
  const correct = guess.replace(/\s/gu, '').toLocaleLowerCase('ko-KR') === String(game.word ?? '').replace(/\s/gu, '').toLocaleLowerCase('ko-KR');
  finishRound(state, game, { liarWon: correct, reason: correct ? `라이어가 제시어 '${game.word}'를 맞혔습니다.` : `라이어의 답은 '${guess}'였습니다. 정답은 '${game.word}'입니다.`, guess }, date);
  return { ok: true, message: correct ? '정답입니다. 라이어 승리!' : '오답입니다.' };
}

function finishGame(state, game, date = new Date()) {
  refundAll(state, game, { includeCurrent: true });
  game.phase = 'game_over';
  game.phaseEndsAt = null;
  const ranking = Object.values(game.players).filter((player) => !player.forfeited).sort((a, b) => b.score - a.score || new Date(a.joinedAt) - new Date(b.joinedAt));
  const topScore = ranking[0]?.score ?? 0;
  const winners = ranking.filter((player) => player.score === topScore);
  const winnerIds = new Set(winners.map((player) => player.petId));
  for (const player of ranking) {
    const pet = state.pets[player.petId];
    if (!pet?.alive) continue;
    pet.records.liarGames += 1;
    completeDailyGoal(pet, 'liarPlay', date);
    if (winnerIds.has(player.petId)) pet.records.liarWins += 1;
  }
  if (winners.length) {
    const names = winners.map((player) => player.displayName).join(', ');
    addSystem(game, `게임 종료! 1위 ${names} · ${topScore}점`, date);
    game.publicEventPending = { text: `라이어게임 종료. 1위 ${names} · ${topScore}점`, petIds: winners.map((player) => player.petId), createdAt: nowIso(date) };
  }
}

function afterResult(state, game, date = new Date()) {
  if (game.roundNo >= game.settings.totalRounds) finishGame(state, game, date);
  else startRound(state, game, date);
}

export function advanceLiarGame(state, date = new Date()) {
  const game = state.liarGame = normalizeLiarGame(state.liarGame, state);
  let changed = false;
  for (let guard = 0; guard < 12; guard += 1) {
    const end = parseTime(game.phaseEndsAt);
    if (end == null || end > date.getTime()) break;
    changed = true;
    if (game.phase === 'discussion') beginVoting(game, date);
    else if (game.phase === 'voting') finishVoting(state, game, date);
    else if (game.phase === 'liar_guess') finishRound(state, game, { liarWon: false, reason: `라이어가 시간 안에 답하지 못했습니다. 정답은 '${game.word}'입니다.` }, date);
    else if (game.phase === 'result') afterResult(state, game, date);
    else { game.phaseEndsAt = null; break; }
  }
  return { changed, nextAlarmAt: game.phaseEndsAt };
}

export function liarReset(state, pet, date = new Date()) {
  const game = state.liarGame = normalizeLiarGame(state.liarGame, state);
  if (game.hostPetId !== pet.id) return { ok: false, message: '방장만 새 게임을 준비할 수 있습니다.' };
  if (game.phase !== 'game_over') return { ok: false, message: '게임 종료 후 사용할 수 있습니다.' };
  const settings = { ...game.settings };
  const connected = connectedPlayers(game);
  state.liarGame = initialLiarGame();
  state.liarGame.settings = settings;
  for (const player of connected) state.liarGame.players[player.petId] = { ...player, ready: false, score: 0, escrowRemaining: 0, currentRoundStake: 0, forfeited: false };
  state.liarGame.hostPetId = oldestConnectedPlayerId(state.liarGame);
  addSystem(state.liarGame, '새 라이어게임 대기실이 열렸습니다.', date);
  return { ok: true, message: '새 게임 대기실로 돌아왔습니다.' };
}

export function liarKick(state, actorPet, targetPetId, date = new Date()) {
  const game = state.liarGame = normalizeLiarGame(state.liarGame, state);
  if (game.hostPetId !== actorPet.id) return { ok: false, message: '방장만 참가자를 내보낼 수 있습니다.' };
  if (game.phase !== 'waiting') return { ok: false, message: '대기실에서만 참가자를 내보낼 수 있습니다.' };
  if (targetPetId === actorPet.id) return { ok: false, message: '자기 자신은 내보낼 수 없습니다.' };
  const target = game.players[targetPetId];
  if (!target) return { ok: false, message: '참가자를 찾을 수 없습니다.' };
  delete game.players[targetPetId];
  addSystem(game, `${target.displayName}이 방에서 나갔습니다.`, date);
  return { ok: true, message: `${target.displayName}을 내보냈습니다.` };
}

export function liarAddChat(state, pet, textValue, date = new Date()) {
  const game = state.liarGame = normalizeLiarGame(state.liarGame, state);
  const player = game.players[pet.id];
  if (!player?.connected) return { ok: false, message: '먼저 라이어게임에 참가해주세요.' };
  const text = cleanText(textValue, 200);
  if (!text) return { ok: false, message: '채팅 내용을 입력해주세요.' };
  const last = parseTime(player.lastChatAt) ?? 0;
  if (date.getTime() - last < 500) return { ok: false, message: '채팅을 너무 빠르게 보내고 있습니다.' };
  player.lastChatAt = nowIso(date);
  const message = { id: id('liarmsg'), type: 'chat', petId: pet.id, displayName: pet.displayName, text, createdAt: nowIso(date) };
  game.messages.push(message);
  game.messages = game.messages.slice(-LIAR_MAX_MESSAGES);
  game.updatedAt = nowIso(date);
  return { ok: true, message: '채팅을 보냈습니다.', chat: message };
}

export function deleteLiarChat(state, chatId) {
  const game = state.liarGame = normalizeLiarGame(state.liarGame, state);
  const before = game.messages.length;
  game.messages = game.messages.filter((message) => message.type !== 'chat' || message.id !== chatId);
  return game.messages.length === before ? { ok: false, message: '라이어게임 채팅을 찾을 수 없습니다.' } : { ok: true, message: '라이어게임 채팅을 삭제했습니다.' };
}

export function forceEndLiarGame(state, date = new Date()) {
  const game = state.liarGame = normalizeLiarGame(state.liarGame, state);
  const refunded = refundAll(state, game, { includeCurrent: true });
  const settings = { ...game.settings };
  const players = connectedPlayers(game);
  state.liarGame = initialLiarGame();
  state.liarGame.settings = settings;
  for (const player of players) state.liarGame.players[player.petId] = { ...player, ready: false, score: 0, escrowRemaining: 0, currentRoundStake: 0, forfeited: false };
  state.liarGame.hostPetId = oldestConnectedPlayerId(state.liarGame);
  addSystem(state.liarGame, `운영자가 진행 중인 라이어게임을 종료했습니다. ${refunded}P 환불`, date);
  return { ok: true, message: '라이어게임을 강제 종료하고 남은 판돈을 환불했습니다.' };
}

export function consumeLiarPublicEvent(state) {
  const game = state.liarGame = normalizeLiarGame(state.liarGame, state);
  const pending = game.publicEventPending;
  game.publicEventPending = null;
  return pending;
}

export function liarGameView(state, viewerPetId) {
  const game = state.liarGame = normalizeLiarGame(state.liarGame, state);
  const viewer = game.players[viewerPetId] ?? null;
  const spectator = game.spectators[viewerPetId] ?? null;
  const isSpectator = Boolean(spectator && !viewer);
  const playerReveal = Boolean(viewer) && ['result', 'game_over'].includes(game.phase);
  const publicReveal = game.phase === 'game_over';
  const reveal = playerReveal || publicReveal;
  const isLiar = Boolean(viewer && viewerPetId === game.liarPetId);
  const players = Object.values(game.players).sort((a, b) => b.score - a.score || new Date(a.joinedAt) - new Date(b.joinedAt)).map((player) => ({
    petId: player.petId, displayName: player.displayName, connected: player.connected, ready: player.ready,
    score: player.score, isHost: player.petId === game.hostPetId, forfeited: player.forfeited,
    escrowRemaining: player.petId === viewerPetId ? player.escrowRemaining : null
  }));
  const safeRoundResult = !game.roundResult ? null : reveal
    ? structuredClone(game.roundResult)
    : { roundNo: game.roundResult.roundNo, liarWon: null, reason: '게임 종료 후 결과가 공개됩니다.', createdAt: game.roundResult.createdAt };
  // 관전자/비참가자에게는 게임 종료 전 서버가 생성한 시스템 메시지를 보내지 않는다.
  // 제시어·라이어·정답이 시스템 메시지에 포함될 수 있기 때문이다.
  const messages = (isSpectator || !viewer) && !publicReveal
    ? game.messages.filter((message) => message.type === 'chat').slice(-LIAR_MAX_MESSAGES)
    : game.messages.slice(-LIAR_MAX_MESSAGES);
  return {
    phase: game.phase, hostPetId: game.hostPetId, players, spectatorCount: Object.values(game.spectators).filter((item) => item.connected).length,
    settings: { ...game.settings }, roundNo: game.roundNo, phaseEndsAt: game.phaseEndsAt,
    votesCast: Object.keys(game.votes).length, eligibleVoters: eligibleVoterIds(game).length,
    voteRound: game.voteRound,
    voteCandidateIds: viewer ? eligibleCandidateIds(game) : [],
    accusedPetId: reveal ? game.accusedPetId : null,
    roundResult: safeRoundResult,
    messages, joined: Boolean(viewer), spectating: isSpectator, viewerRole: viewer ? 'player' : (isSpectator ? 'spectator' : 'outsider'),
    isHost: Boolean(viewer && game.hostPetId === viewerPetId), ready: Boolean(viewer?.ready), connected: Boolean(viewer?.connected || spectator?.connected),
    isLiar, category: viewer && game.roundPlayerIds.includes(viewerPetId) ? game.category : (publicReveal ? game.category : null),
    word: publicReveal || (viewer && !isLiar && game.roundPlayerIds.includes(viewerPetId)) || playerReveal ? game.word : null,
    liarPetId: reveal ? game.liarPetId : null,
    hasVoted: Boolean(viewer && game.votes[viewerPetId]), myVote: viewer ? (game.votes[viewerPetId] ?? null) : null,
    isAccused: Boolean(viewer && game.accusedPetId === viewerPetId), serverTime: Date.now()
  };
}

export function liarNextAlarmAt(state) {
  return normalizeLiarGame(state.liarGame, state).phaseEndsAt;
}
