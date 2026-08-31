import { id } from '../lib/ids.js';
import { canStartBattleForPets, consumeBattleForPets } from './battle-limit.js';

export const SPOT_DIFFERENCE_MATCH_SECONDS = 45;
export const SPOT_DIFFERENCE_COUNT = 7;
export const SPOT_DIFFERENCE_MAX_ROOMS = 3;
export const SPOT_DIFFERENCE_START_COUNTDOWN_MS = 3_000;
export const SPOT_DIFFERENCE_WRONG_LOCK_MS = 1_000;
export const SPOT_DIFFERENCE_MAX_WRONG_CLICKS = 5;
export const SPOT_DIFFERENCE_WAITING_ROOM_TTL_MS = 10 * 60_000;
export const SPOT_DIFFERENCE_ENDED_ROOM_TTL_MS = 10 * 60_000;
export const SPOT_DIFFERENCE_STAKES = Object.freeze([100, 500, 1000, 2000, 3000]);
export const SPOT_DIFFERENCE_ACTION_HISTORY = 96;

// v6.10.18부터 신규 문제는 로컬 WebP 고밀도 장면 20세트를 "조합형"으로 사용한다.
// 장면마다 18개 후보 지점 중 7개를 매판 새로 선택하므로 기본 경우의 수는 20 × C(18,7) = 636,480개다.
// 좌우 반전과 세부 변화 모양은 경우의 수에 포함하지 않으며, 같은 장면+정답조합은 플레이어별 최근 200판 동안 재출제하지 않는다.
// assetVersion 2인 기존 진행방은 배포 중 대전을 깨지 않기 위해 기존 고정 changed WebP 판정으로 유지한다.
export const SPOT_DIFFERENCE_THEMES = Object.freeze([
  { id: 'body-guide', label: '전자부품 도감' },
  { id: 'lego-room', label: '식물 세밀화' },
  { id: 'convenience', label: '빈티지 지도' },
  { id: 'beach', label: '카메라 작업대' },
  { id: 'game-room', label: '카페 바' },
  { id: 'picnic', label: '캠핑 장비' },
  { id: 'camping', label: '서재' },
  { id: 'cafe', label: '실험실' },
  { id: 'festival', label: '야시장 진열대' },
  { id: 'space-lab', label: '우주 관측실' }
]);

export const SPOT_DIFFERENCE_ATLAS_VERSION = 3;
export const SPOT_DIFFERENCE_RECENT_HISTORY = 200;
export const SPOT_DIFFERENCE_ATLAS_PUZZLES = Object.freeze(
  SPOT_DIFFERENCE_THEMES.flatMap((theme) => [0, 1].map((variant) => Object.freeze({ themeId: theme.id, variant })))
);

// v2 호환용: 배포 전에 시작된 방의 실제 changed WebP 정답 7곳을 그대로 보존한다.
const LEGACY_ATLAS_V2_DIFFERENCES = Object.freeze([
  ['body-guide',0,['d1','d3','d5','d6','d7','d8','d11']], ['body-guide',1,['d0','d2','d3','d6','d7','d9','d17']],
  ['lego-room',0,['d0','d1','d2','d3','d6','d11','d14']], ['lego-room',1,['d3','d6','d7','d8','d12','d14','d17']],
  ['convenience',0,['d4','d7','d8','d9','d11','d15','d16']], ['convenience',1,['d0','d1','d4','d5','d11','d12','d15']],
  ['beach',0,['d0','d1','d2','d3','d8','d13','d14']], ['beach',1,['d1','d4','d5','d8','d10','d13','d17']],
  ['game-room',0,['d1','d2','d4','d6','d8','d10','d12']], ['game-room',1,['d1','d3','d4','d6','d11','d12','d17']],
  ['picnic',0,['d1','d2','d5','d7','d10','d11','d13']], ['picnic',1,['d0','d1','d8','d10','d11','d12','d14']],
  ['camping',0,['d1','d5','d7','d10','d11','d12','d14']], ['camping',1,['d3','d7','d11','d14','d15','d16','d17']],
  ['cafe',0,['d6','d7','d9','d10','d11','d12','d15']], ['cafe',1,['d0','d3','d4','d9','d12','d14','d16']],
  ['festival',0,['d3','d7','d8','d11','d12','d15','d17']], ['festival',1,['d2','d3','d6','d7','d9','d10','d15']],
  ['space-lab',0,['d0','d1','d5','d8','d9','d11','d12']], ['space-lab',1,['d3','d6','d7','d8','d9','d10','d12']]
]);
const LEGACY_ATLAS_V2_BY_KEY = new Map(LEGACY_ATLAS_V2_DIFFERENCES.map(([themeId, variant, differenceIds]) => [`${themeId}:${variant}`, differenceIds]));

// 모든 좌표는 그림 내부 비율(0~1)이다. 실제 표시 크기와 무관하게 같은 지점을 판정한다.
// 반지름은 손가락 터치를 고려해 실제 변화 요소보다 약간 넓게 잡았다.
export const SPOT_DIFFERENCE_HITBOXES = Object.freeze([
  { id: 'd0', x: 0.10, y: 0.15, r: 0.065 },
  { id: 'd1', x: 0.27, y: 0.14, r: 0.060 },
  { id: 'd2', x: 0.46, y: 0.15, r: 0.060 },
  { id: 'd3', x: 0.66, y: 0.14, r: 0.060 },
  { id: 'd4', x: 0.85, y: 0.16, r: 0.060 },
  { id: 'd5', x: 0.18, y: 0.34, r: 0.064 },
  { id: 'd6', x: 0.38, y: 0.34, r: 0.062 },
  { id: 'd7', x: 0.58, y: 0.35, r: 0.062 },
  { id: 'd8', x: 0.79, y: 0.34, r: 0.064 },
  { id: 'd9', x: 0.10, y: 0.55, r: 0.064 },
  { id: 'd10', x: 0.30, y: 0.54, r: 0.062 },
  { id: 'd11', x: 0.49, y: 0.55, r: 0.062 },
  { id: 'd12', x: 0.69, y: 0.54, r: 0.062 },
  { id: 'd13', x: 0.88, y: 0.55, r: 0.060 },
  { id: 'd14', x: 0.19, y: 0.75, r: 0.067 },
  { id: 'd15', x: 0.40, y: 0.74, r: 0.064 },
  { id: 'd16', x: 0.62, y: 0.75, r: 0.064 },
  { id: 'd17', x: 0.82, y: 0.74, r: 0.067 }
]);

const HITBOX_BY_ID = new Map(SPOT_DIFFERENCE_HITBOXES.map((item) => [item.id, item]));
const THEME_IDS = new Set(SPOT_DIFFERENCE_THEMES.map((item) => item.id));
const HITBOX_IDS = new Set(SPOT_DIFFERENCE_HITBOXES.map((item) => item.id));
const nowIso = (date = new Date()) => date.toISOString();
const int = (value, fallback = 0) => Number.isFinite(Number(value)) ? Math.floor(Number(value)) : fallback;
const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

export function validSpotDifferenceStake(value) {
  const stake = Number(value);
  return Number.isSafeInteger(stake) && (stake === 100 || stake === 500 || (stake >= 1000 && stake % 1000 === 0));
}

function bumpRoomVersion(room, date = new Date()) {
  room.stateVersion = Math.max(0, int(room.stateVersion)) + 1;
  room.updatedAt = nowIso(date);
}

function seededRandom(seedValue) {
  let seed = (Number(seedValue) >>> 0) || 0x6d2b79f5;
  return () => {
    seed += 0x6d2b79f5;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleWithRandom(values, random) {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

function sceneKey(puzzle) {
  return `${puzzle?.themeId || ''}:${Math.max(0, Math.min(1, int(puzzle?.variant, 0)))}`;
}

function puzzleKey(puzzle) {
  const assetVersion = Math.max(0, int(puzzle?.assetVersion));
  const ordered = [...new Set(Array.isArray(puzzle?.differenceIds) ? puzzle.differenceIds.map(String) : [])].sort((a, b) => int(a.slice(1)) - int(b.slice(1)));
  if (assetVersion >= SPOT_DIFFERENCE_ATLAS_VERSION) {
    // mirrored/seed는 키에서 제외한다. 같은 장면+정답 위치는 시각 효과가 달라도 같은 문제로 취급한다.
    return `v${assetVersion}:${sceneKey(puzzle)}:${ordered.join(',')}`;
  }
  if (assetVersion === 2) return `v2:${sceneKey(puzzle)}:${puzzle?.mirrored ? 1 : 0}:${ordered.join(',')}`;
  return `${assetVersion ? `v${assetVersion}:` : ''}${puzzle.themeId}:${puzzle.variant}:${puzzle.seed}:${puzzle.mirrored ? 1 : 0}:${ordered.join(',')}`;
}

function playerPuzzleHistory(game, petId) {
  return Array.isArray(game?.playerPuzzleHistory?.[petId]) ? game.playerPuzzleHistory[petId] : [];
}

function generatePuzzle(room = {}, game = null) {
  const participantIds = [room.hostPetId, room.guestPetId].filter(Boolean);
  const history = new Set([
    ...(Array.isArray(room.puzzleHistory) ? room.puzzleHistory : []),
    ...(Array.isArray(game?.recentPuzzleKeys) ? game.recentPuzzleKeys : []),
    ...participantIds.flatMap((petId) => playerPuzzleHistory(game, petId))
  ].map(String));
  const blockedScenes = new Set([String(room.lastSceneKey || '')]);
  const blockedThemes = new Set([String(room.lastThemeId || '')]);
  for (const petId of participantIds) {
    const last = String(game?.playerLastSceneKey?.[petId] || '');
    if (last) {
      blockedScenes.add(last);
      blockedThemes.add(last.split(':')[0]);
    }
  }
  const eligible = SPOT_DIFFERENCE_ATLAS_PUZZLES.filter((item) => !blockedScenes.has(`${item.themeId}:${item.variant}`) && !blockedThemes.has(item.themeId));
  const pool = eligible.length ? eligible : SPOT_DIFFERENCE_ATLAS_PUZZLES;
  let fallback = null;
  for (let attempt = 0; attempt < 600; attempt += 1) {
    const seed = Math.floor(Math.random() * 0x7fffffff) + 1;
    const random = seededRandom(seed);
    const selected = pool[Math.floor(random() * pool.length)] || SPOT_DIFFERENCE_ATLAS_PUZZLES[0];
    const differenceIds = shuffleWithRandom(SPOT_DIFFERENCE_HITBOXES.map((item) => item.id), random)
      .slice(0, SPOT_DIFFERENCE_COUNT)
      .sort((a, b) => int(a.slice(1)) - int(b.slice(1)));
    const candidate = {
      assetVersion: SPOT_DIFFERENCE_ATLAS_VERSION,
      themeId: selected.themeId,
      seed,
      variant: selected.variant,
      mirrored: random() >= 0.5,
      differenceIds
    };
    candidate.key = puzzleKey(candidate);
    fallback = candidate;
    if (!history.has(candidate.key)) return candidate;
  }
  return fallback;
}

function normalizePuzzle(raw, room, game = null) {
  if (!raw || typeof raw !== 'object' || !THEME_IDS.has(raw.themeId)) return generatePuzzle(room, game);
  const differenceIds = [...new Set(Array.isArray(raw.differenceIds) ? raw.differenceIds.map(String).filter((item) => HITBOX_IDS.has(item)) : [])]
    .slice(0, SPOT_DIFFERENCE_COUNT)
    .sort((a, b) => int(a.slice(1)) - int(b.slice(1)));
  if (differenceIds.length !== SPOT_DIFFERENCE_COUNT) return generatePuzzle(room, game);

  const assetVersion = Math.max(0, int(raw.assetVersion));
  if (assetVersion === SPOT_DIFFERENCE_ATLAS_VERSION) {
    const variant = Math.max(0, Math.min(1, int(raw.variant, 0)));
    const puzzle = {
      assetVersion: SPOT_DIFFERENCE_ATLAS_VERSION,
      themeId: raw.themeId,
      seed: Math.max(1, int(raw.seed, 1)),
      variant,
      mirrored: Boolean(raw.mirrored),
      differenceIds
    };
    puzzle.key = puzzleKey(puzzle);
    return puzzle;
  }

  if (assetVersion === 2) {
    const variant = Math.max(0, Math.min(1, int(raw.variant, 0)));
    const expected = LEGACY_ATLAS_V2_BY_KEY.get(`${raw.themeId}:${variant}`);
    if (!expected) return generatePuzzle(room, game);
    const actualKey = differenceIds.join(',');
    const expectedKey = [...expected].sort((a, b) => int(a.slice(1)) - int(b.slice(1))).join(',');
    if (actualKey !== expectedKey) return generatePuzzle(room, game);
    const puzzle = { assetVersion: 2, themeId: raw.themeId, seed: Math.max(1, int(raw.seed, 1)), variant, mirrored: Boolean(raw.mirrored), differenceIds };
    puzzle.key = puzzleKey(puzzle);
    return puzzle;
  }

  // Legacy room compatibility: keep old SVG puzzle intact until that match ends.
  const puzzle = {
    themeId: raw.themeId,
    seed: Math.max(1, int(raw.seed, 1)),
    variant: Math.max(0, Math.min(7, int(raw.variant, 0))),
    mirrored: Boolean(raw.mirrored),
    differenceIds
  };
  puzzle.key = String(raw.key || puzzleKey(puzzle));
  return puzzle;
}

function normalizePlayer(raw, pet) {
  const foundIds = [...new Set(Array.isArray(raw?.foundIds) ? raw.foundIds.map(String).filter((item) => HITBOX_IDS.has(item)) : [])].slice(0, SPOT_DIFFERENCE_COUNT);
  const lockedUntilMs = new Date(raw?.lockedUntil ?? '').getTime();
  const lastCorrectAtMs = new Date(raw?.lastCorrectAt ?? '').getTime();
  return {
    petId: pet.id,
    userId: pet.userId,
    displayName: pet.displayName,
    foundIds,
    foundCount: foundIds.length,
    wrongClicks: Math.max(0, int(raw?.wrongClicks)),
    lockedUntil: Number.isFinite(lockedUntilMs) ? new Date(lockedUntilMs).toISOString() : null,
    lastCorrectAt: Number.isFinite(lastCorrectAtMs) ? new Date(lastCorrectAtMs).toISOString() : null
  };
}

export function initialSpotDifference() {
  return { version: 3, rooms: {}, recentPuzzleKeys: [], playerPuzzleHistory: {}, playerLastSceneKey: {} };
}

export function normalizeSpotDifference(raw, state, date = new Date()) {
  const game = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : initialSpotDifference();
  game.version = 3;
  game.rooms = game.rooms && typeof game.rooms === 'object' && !Array.isArray(game.rooms) ? game.rooms : {};
  game.recentPuzzleKeys = Array.isArray(game.recentPuzzleKeys) ? [...new Set(game.recentPuzzleKeys.map(String))].slice(-SPOT_DIFFERENCE_RECENT_HISTORY) : [];
  game.playerPuzzleHistory = game.playerPuzzleHistory && typeof game.playerPuzzleHistory === 'object' && !Array.isArray(game.playerPuzzleHistory) ? game.playerPuzzleHistory : {};
  game.playerLastSceneKey = game.playerLastSceneKey && typeof game.playerLastSceneKey === 'object' && !Array.isArray(game.playerLastSceneKey) ? game.playerLastSceneKey : {};
  for (const petId of Object.keys(game.playerPuzzleHistory)) {
    if (!state?.pets?.[petId]?.alive) { delete game.playerPuzzleHistory[petId]; delete game.playerLastSceneKey[petId]; continue; }
    game.playerPuzzleHistory[petId] = [...new Set((Array.isArray(game.playerPuzzleHistory[petId]) ? game.playerPuzzleHistory[petId] : []).map(String))].slice(-SPOT_DIFFERENCE_RECENT_HISTORY);
    game.playerLastSceneKey[petId] = String(game.playerLastSceneKey[petId] || '');
  }
  for (const [roomId, rawRoom] of Object.entries(game.rooms)) {
    const host = state?.pets?.[rawRoom?.hostPetId];
    const guest = state?.pets?.[rawRoom?.guestPetId];
    const status = ['waiting', 'playing', 'ended'].includes(rawRoom?.status) ? rawRoom.status : 'waiting';
    if (!host?.alive || !validSpotDifferenceStake(rawRoom?.stakePoints) || (status !== 'waiting' && !guest?.alive)) {
      delete game.rooms[roomId];
      continue;
    }
    const room = rawRoom;
    room.id = String(room.id || roomId);
    room.roomNumber = Math.max(1, Math.min(SPOT_DIFFERENCE_MAX_ROOMS, int(room.roomNumber, 1)));
    room.status = status;
    room.hostPetId = host.id;
    room.guestPetId = guest?.id ?? null;
    room.stakePoints = Number(room.stakePoints);
    room.matchId = String(room.matchId || id('spotmatch'));
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
    room.processedActionIds = Array.isArray(room.processedActionIds) ? [...new Set(room.processedActionIds.map(String))].slice(-SPOT_DIFFERENCE_ACTION_HISTORY) : [];
    room.stateVersion = Math.max(0, int(room.stateVersion));
    room.rematchRequests = Array.isArray(room.rematchRequests) ? [...new Set(room.rematchRequests.map(String).filter((petId) => [host.id, guest?.id].includes(petId)))] : [];
    room.departedPetIds = Array.isArray(room.departedPetIds) ? [...new Set(room.departedPetIds.map(String).filter((petId) => [host.id, guest?.id].includes(petId)))] : [];
    room.puzzleHistory = Array.isArray(room.puzzleHistory) ? [...new Set(room.puzzleHistory.map(String))].slice(-SPOT_DIFFERENCE_RECENT_HISTORY) : [];
    room.lastThemeId = THEME_IDS.has(room.lastThemeId) ? room.lastThemeId : null;
    room.lastSceneKey = String(room.lastSceneKey || '');
    room.puzzle = status === 'waiting' ? null : normalizePuzzle(room.puzzle, room, game);
    room.settled = Boolean(room.settled);
    room.winnerPetId = state?.pets?.[room.winnerPetId]?.alive ? room.winnerPetId : null;
    room.loserPetId = state?.pets?.[room.loserPetId]?.alive ? room.loserPetId : null;
    room.result = ['win', 'draw'].includes(room.result) ? room.result : null;
    room.resultReason = room.resultReason ? String(room.resultReason).slice(0, 180) : null;
    room.createdAt = room.createdAt || nowIso(date);
    room.startedAt = room.startedAt || null;
    room.revealAt = room.revealAt || null;
    room.deadlineAt = room.deadlineAt || null;
    room.endedAt = room.endedAt || null;
    room.updatedAt = room.updatedAt || room.createdAt;
    game.rooms[roomId] = room;
  }
  return game;
}

function occupiedNumbers(game) {
  return new Set(Object.values(game.rooms).filter((room) => room.status !== 'ended').map((room) => room.roomNumber));
}

function nextRoomNumber(game) {
  const occupied = occupiedNumbers(game);
  for (let room = 1; room <= SPOT_DIFFERENCE_MAX_ROOMS; room += 1) if (!occupied.has(room)) return room;
  return null;
}

function activePlayerRoom(game, petId, except = null) {
  return Object.values(game.rooms).find((room) => room.id !== except && room.status !== 'ended' && [room.hostPetId, room.guestPetId].includes(petId)) ?? null;
}

function opponentId(room, petId) {
  return room.hostPetId === petId ? room.guestPetId : room.hostPetId;
}

function awardResultRecords(pet, { win = false, loss = false, draw = false } = {}) {
  if (!pet?.alive) return;
  pet.records ??= {};
  pet.records.spotDifferenceGames = int(pet.records.spotDifferenceGames) + 1;
  if (win) {
    pet.records.spotDifferenceWins = int(pet.records.spotDifferenceWins) + 1;
    pet.records.seasonSpotDifferenceWins = int(pet.records.seasonSpotDifferenceWins) + 1;
  }
  if (loss) {
    pet.records.spotDifferenceLosses = int(pet.records.spotDifferenceLosses) + 1;
    pet.records.seasonSpotDifferenceLosses = int(pet.records.seasonSpotDifferenceLosses) + 1;
  }
  if (draw) {
    pet.records.spotDifferenceDraws = int(pet.records.spotDifferenceDraws) + 1;
    pet.records.seasonSpotDifferenceDraws = int(pet.records.seasonSpotDifferenceDraws) + 1;
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
  room.resultReason = String(reason || '틀린그림찾기 대전이 종료되었습니다.').slice(0, 180);
  room.endedAt = nowIso(date);
  room.deadlineAt = null;
  room.settled = true;
  room.settlementId ||= id('spotsettle');
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
  room.settlementId ||= id('spotsettle');
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

function rememberPuzzleForPlayers(game, room, puzzle) {
  if (!game || !puzzle?.key) return;
  game.recentPuzzleKeys = [...new Set([...(game.recentPuzzleKeys ?? []), puzzle.key])].slice(-SPOT_DIFFERENCE_RECENT_HISTORY);
  game.playerPuzzleHistory ??= {};
  game.playerLastSceneKey ??= {};
  const currentSceneKey = sceneKey(puzzle);
  for (const petId of [room.hostPetId, room.guestPetId].filter(Boolean)) {
    game.playerPuzzleHistory[petId] = [...new Set([...(game.playerPuzzleHistory[petId] ?? []), puzzle.key])].slice(-SPOT_DIFFERENCE_RECENT_HISTORY);
    game.playerLastSceneKey[petId] = currentSceneKey;
  }
}

function startMatch(state, room, date = new Date()) {
  const host = state.pets[room.hostPetId];
  const guest = state.pets[room.guestPetId];
  if (!host?.alive || !guest?.alive) return { ok: false, message: '두 플레이어를 모두 찾을 수 없습니다.' };
  const battleCheck = canStartBattleForPets([host, guest], date);
  if (!battleCheck.ok) return battleCheck;
  if (host.stats.points < room.stakePoints || guest.stats.points < room.stakePoints) return { ok: false, message: '두 플레이어 모두 판돈을 보유해야 시작할 수 있습니다.' };

  host.stats.points -= room.stakePoints;
  host.records.pointsSpent += room.stakePoints;
  guest.stats.points -= room.stakePoints;
  guest.records.pointsSpent += room.stakePoints;
  const consumed = consumeBattleForPets([host, guest], date);
  if (!consumed.ok) {
    host.stats.points += room.stakePoints;
    host.records.pointsSpent = Math.max(0, int(host.records.pointsSpent) - room.stakePoints);
    guest.stats.points += room.stakePoints;
    guest.records.pointsSpent = Math.max(0, int(guest.records.pointsSpent) - room.stakePoints);
    return consumed;
  }

  const game = state.spotDifference;
  const puzzle = generatePuzzle(room, game);
  room.escrow = { [host.id]: room.stakePoints, [guest.id]: room.stakePoints };
  room.players = {
    [host.id]: { petId: host.id, userId: host.userId, displayName: host.displayName, foundIds: [], foundCount: 0, wrongClicks: 0, lockedUntil: null, lastCorrectAt: null },
    [guest.id]: { petId: guest.id, userId: guest.userId, displayName: guest.displayName, foundIds: [], foundCount: 0, wrongClicks: 0, lockedUntil: null, lastCorrectAt: null }
  };
  room.status = 'playing';
  room.matchId = id('spotmatch');
  room.processedActionIds = [];
  room.rematchRequests = [];
  room.departedPetIds = [];
  room.settled = false;
  room.settlementId = null;
  room.winnerPetId = null;
  room.loserPetId = null;
  room.result = null;
  room.resultReason = null;
  room.puzzle = puzzle;
  room.lastThemeId = puzzle.themeId;
  room.lastSceneKey = sceneKey(puzzle);
  room.puzzleHistory = [...new Set([...(room.puzzleHistory ?? []), puzzle.key])].slice(-SPOT_DIFFERENCE_RECENT_HISTORY);
  rememberPuzzleForPlayers(game, room, puzzle);
  room.startedAt = nowIso(date);
  room.revealAt = new Date(date.getTime() + SPOT_DIFFERENCE_START_COUNTDOWN_MS).toISOString();
  room.deadlineAt = new Date(date.getTime() + SPOT_DIFFERENCE_START_COUNTDOWN_MS + SPOT_DIFFERENCE_MATCH_SECONDS * 1000).toISOString();
  room.endedAt = null;
  bumpRoomVersion(room, date);
  return { ok: true };
}

export function createSpotDifferenceRoom(state, pet, stakeValue, date = new Date()) {
  const game = state.spotDifference = normalizeSpotDifference(state.spotDifference, state, date);
  const battleCheck = canStartBattleForPets([pet], date);
  if (!battleCheck.ok) return battleCheck;
  if (!validSpotDifferenceStake(stakeValue)) return { ok: false, message: '판돈은 100P, 500P, 또는 1,000P 이상 1,000P 단위로 설정해주세요.' };
  const existing = activePlayerRoom(game, pet.id);
  if (existing) return { ok: true, roomId: existing.id, message: '이미 참가 중인 틀린그림찾기 대전방을 열었습니다.' };
  if (Object.values(game.rooms).filter((room) => room.status !== 'ended').length >= SPOT_DIFFERENCE_MAX_ROOMS) return { ok: false, message: '동시에 운영할 수 있는 틀린그림찾기 대전방 3개가 모두 사용 중입니다.' };
  if (pet.stats.points < Number(stakeValue)) return { ok: false, message: `판돈 ${stakeValue}P가 필요합니다.` };
  const roomNumber = nextRoomNumber(game);
  const room = {
    id: id('spotroom'), roomNumber, status: 'waiting', hostPetId: pet.id, guestPetId: null,
    stakePoints: Number(stakeValue), matchId: id('spotmatch'), players: {}, spectators: {}, escrow: {},
    processedActionIds: [], stateVersion: 0, rematchRequests: [], departedPetIds: [], settled: false, settlementId: null,
    winnerPetId: null, loserPetId: null, result: null, resultReason: null,
    puzzle: null, lastThemeId: null, lastSceneKey: String(game.playerLastSceneKey?.[pet.id] || ''), puzzleHistory: [...playerPuzzleHistory(game, pet.id)],
    createdAt: nowIso(date), startedAt: null, revealAt: null, deadlineAt: null, endedAt: null, updatedAt: nowIso(date)
  };
  game.rooms[room.id] = room;
  return { ok: true, roomId: room.id, message: `${roomNumber}번 틀린그림찾기 대전방을 만들었습니다.` };
}

export function joinSpotDifferenceRoom(state, pet, roomId, date = new Date()) {
  const game = state.spotDifference = normalizeSpotDifference(state.spotDifference, state, date);
  const battleCheck = canStartBattleForPets([pet], date);
  if (!battleCheck.ok) return battleCheck;
  const room = game.rooms[roomId];
  if (!room) return { ok: false, message: '틀린그림찾기 대전방을 찾을 수 없습니다.' };
  if ([room.hostPetId, room.guestPetId].includes(pet.id)) return { ok: true, roomId, message: '이미 이 방의 플레이어입니다.' };
  if (room.status !== 'waiting' || room.guestPetId) return { ok: false, message: '현재 플레이어로 참가할 수 없는 방입니다.' };
  if (activePlayerRoom(game, pet.id)) return { ok: false, message: '한 사용자는 동시에 여러 틀린그림찾기 대전방의 선수가 될 수 없습니다.' };
  if (pet.stats.points < room.stakePoints || state.pets[room.hostPetId].stats.points < room.stakePoints) return { ok: false, message: '둘 중 한 명의 포인트가 부족해 시작할 수 없습니다.' };
  room.guestPetId = pet.id;
  delete room.spectators[pet.id];
  const started = startMatch(state, room, date);
  if (!started.ok) { room.guestPetId = null; return started; }
  return { ok: true, roomId, started: true, message: '상대 참가가 확정되어 틀린그림찾기 대전을 시작했습니다.' };
}

export function spectateSpotDifferenceRoom(state, pet, roomId, date = new Date()) {
  const game = state.spotDifference = normalizeSpotDifference(state.spotDifference, state, date);
  const room = game.rooms[roomId];
  if (!room || room.status !== 'playing') return { ok: false, message: '진행 중인 틀린그림찾기 대전만 관전할 수 있습니다.' };
  if ([room.hostPetId, room.guestPetId].includes(pet.id)) return { ok: false, message: '플레이어는 관전자로 들어갈 수 없습니다.' };
  room.spectators[pet.id] = { petId: pet.id, userId: pet.userId, displayName: pet.displayName, joinedAt: room.spectators[pet.id]?.joinedAt || nowIso(date) };
  bumpRoomVersion(room, date);
  return { ok: true, roomId, message: '틀린그림찾기 대전 관전을 시작했습니다.' };
}

export function leaveSpotDifferenceSpectator(state, pet, roomId, date = new Date()) {
  const game = state.spotDifference = normalizeSpotDifference(state.spotDifference, state, date);
  const room = game.rooms[roomId];
  if (!room) return { ok: true, deleted: true, message: '이미 정리된 틀린그림찾기 대전방입니다.' };
  if (!room.spectators?.[pet.id]) return { ok: true, message: '이미 관전을 종료했습니다.' };
  delete room.spectators[pet.id];
  bumpRoomVersion(room, date);
  return { ok: true, message: '관전을 종료했습니다.' };
}

export function leaveSpotDifferenceRoom(state, pet, roomId, date = new Date()) {
  const game = state.spotDifference = normalizeSpotDifference(state.spotDifference, state, date);
  const room = game.rooms[roomId];
  if (!room) return { ok: true, deleted: true, message: '이미 정리된 틀린그림찾기 대전방입니다.' };
  if (![room.hostPetId, room.guestPetId].includes(pet.id)) return leaveSpotDifferenceSpectator(state, pet, roomId, date);
  if (room.status === 'waiting') { delete game.rooms[roomId]; return { ok: true, message: '대기방을 닫았습니다.' }; }
  if (room.status === 'playing') {
    finishWin(state, room, opponentId(room, pet.id), pet.id, `${pet.displayName}이 나가 기권패했습니다.`, date);
    if (!room.departedPetIds.includes(pet.id)) room.departedPetIds.push(pet.id);
    room.rematchRequests = room.rematchRequests.filter((item) => item !== pet.id);
    bumpRoomVersion(room, date);
    return { ok: true, forfeited: true, message: '기권패 처리되었습니다.' };
  }
  if (!room.departedPetIds.includes(pet.id)) room.departedPetIds.push(pet.id);
  room.rematchRequests = room.rematchRequests.filter((item) => item !== pet.id);
  if ([room.hostPetId, room.guestPetId].filter(Boolean).every((item) => room.departedPetIds.includes(item))) delete game.rooms[roomId];
  else bumpRoomVersion(room, date);
  return { ok: true, message: '틀린그림찾기 대전방에서 나갔습니다.' };
}

function effectiveHitbox(hitbox, mirrored) {
  return { ...hitbox, x: mirrored ? 1 - hitbox.x : hitbox.x };
}

function hitTest(puzzle, xValue, yValue) {
  const x = clamp01(xValue);
  const y = clamp01(yValue);
  let best = null;
  for (const differenceId of puzzle.differenceIds) {
    const base = HITBOX_BY_ID.get(differenceId);
    if (!base) continue;
    const hitbox = effectiveHitbox(base, puzzle.mirrored);
    const dx = x - hitbox.x;
    const dy = y - hitbox.y;
    const distance = Math.hypot(dx, dy);
    if (distance > hitbox.r) continue;
    if (!best || distance < best.distance) best = { id: differenceId, distance };
  }
  return best?.id ?? null;
}

export function playSpotDifferenceClick(state, pet, roomId, input = {}, date = new Date()) {
  const game = state.spotDifference = normalizeSpotDifference(state.spotDifference, state, date);
  const room = game.rooms[roomId];
  if (!room) return { ok: false, terminal: true, stale: true, message: '틀린그림찾기 대전방이 이미 정리되었습니다.' };
  processSpotDifferenceTimers(state, date, { roomId });
  if (room.status !== 'playing' || room.settled) return { ok: false, terminal: true, message: '이미 종료된 틀린그림찾기 대전입니다.' };
  if (![room.hostPetId, room.guestPetId].includes(pet.id)) return { ok: false, message: '관전자는 그림을 선택할 수 없습니다.' };
  if (String(input.matchId || '') !== room.matchId) return { ok: false, stale: true, message: '이전 대전의 입력이라 무시했습니다.' };

  const actionId = String(input.actionId || '').trim().slice(0, 100);
  if (!actionId) return { ok: false, message: '입력 요청 ID가 필요합니다.' };
  if (room.processedActionIds.includes(actionId)) return { ok: true, duplicate: true, actionId, stateVersion: room.stateVersion, message: '이미 처리된 선택입니다.' };

  const revealAt = new Date(room.revealAt ?? '').getTime();
  if (Number.isFinite(revealAt) && date.getTime() < revealAt) return { ok: true, countdown: true, message: '3초 카운트다운이 끝난 뒤 시작됩니다.' };

  const player = room.players[pet.id];
  if (!player) return { ok: false, message: '플레이어 상태를 찾을 수 없습니다.' };
  const lockedUntil = new Date(player.lockedUntil ?? '').getTime();
  if (Number.isFinite(lockedUntil) && lockedUntil > date.getTime()) {
    return { ok: true, locked: true, lockedUntil: player.lockedUntil, message: '오답 페널티 중입니다.' };
  }

  const x = Number(input.x);
  const y = Number(input.y);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) return { ok: false, message: '터치 위치가 올바르지 않습니다.' };

  room.processedActionIds.push(actionId);
  room.processedActionIds = room.processedActionIds.slice(-SPOT_DIFFERENCE_ACTION_HISTORY);
  const differenceId = hitTest(room.puzzle, x, y);

  if (differenceId && player.foundIds.includes(differenceId)) {
    return { ok: true, alreadyFound: true, actionId, stateVersion: room.stateVersion, message: '이미 찾은 곳입니다.' };
  }

  if (!differenceId) {
    player.wrongClicks = int(player.wrongClicks) + 1;
    if (player.wrongClicks >= SPOT_DIFFERENCE_MAX_WRONG_CLICKS) {
      player.lockedUntil = null;
      const otherId = opponentId(room, pet.id);
      finishWin(state, room, otherId, pet.id, `${pet.displayName}이 오답 ${SPOT_DIFFERENCE_MAX_WRONG_CLICKS}회로 패배했습니다.`, date);
      return {
        ok: true, correct: false, finished: true, wrongClicks: player.wrongClicks,
        actionId, stateVersion: room.stateVersion,
        message: `오답 ${SPOT_DIFFERENCE_MAX_WRONG_CLICKS}회로 패배했습니다.`
      };
    }
    player.lockedUntil = new Date(date.getTime() + SPOT_DIFFERENCE_WRONG_LOCK_MS).toISOString();
    bumpRoomVersion(room, date);
    return {
      ok: true, correct: false, wrongClicks: player.wrongClicks,
      actionId, lockedUntil: player.lockedUntil, stateVersion: room.stateVersion,
      message: `틀렸습니다. 실수 ${player.wrongClicks}/${SPOT_DIFFERENCE_MAX_WRONG_CLICKS} · 1초 동안 다시 누를 수 없습니다.`
    };
  }

  player.foundIds.push(differenceId);
  player.foundIds = [...new Set(player.foundIds)].slice(0, SPOT_DIFFERENCE_COUNT);
  player.foundCount = player.foundIds.length;
  player.lastCorrectAt = nowIso(date);
  player.lockedUntil = null;
  bumpRoomVersion(room, date);

  if (player.foundCount >= SPOT_DIFFERENCE_COUNT) {
    finishWin(state, room, pet.id, opponentId(room, pet.id), `${pet.displayName}이 틀린 곳 ${SPOT_DIFFERENCE_COUNT}개를 먼저 모두 찾았습니다.`, date);
    return { ok: true, correct: true, differenceId, finished: true, actionId, stateVersion: room.stateVersion, message: '7개를 모두 찾아 승리했습니다!' };
  }

  return { ok: true, correct: true, differenceId, actionId, stateVersion: room.stateVersion, message: `정답! ${player.foundCount}/${SPOT_DIFFERENCE_COUNT}` };
}

export function requestSpotDifferenceRematch(state, pet, roomId, date = new Date()) {
  const game = state.spotDifference = normalizeSpotDifference(state.spotDifference, state, date);
  const room = game.rooms[roomId];
  if (!room || room.status !== 'ended') return { ok: false, message: '종료된 방에서만 재대결할 수 있습니다.' };
  if (![room.hostPetId, room.guestPetId].includes(pet.id) || room.departedPetIds.includes(pet.id)) return { ok: false, message: '방을 나간 플레이어 또는 관전자는 재대결을 요청할 수 없습니다.' };
  if (room.departedPetIds.length) return { ok: false, message: '상대가 방을 나가 재대결할 수 없습니다.' };
  if (!room.rematchRequests.includes(pet.id)) room.rematchRequests.push(pet.id);
  const otherId = opponentId(room, pet.id);
  if (!room.rematchRequests.includes(otherId)) return { ok: true, pending: true, message: '상대의 재대결 수락을 기다립니다.' };
  if (activePlayerRoom(game, pet.id, room.id) || activePlayerRoom(game, otherId, room.id)) {
    room.rematchRequests = [];
    return { ok: false, message: '둘 중 한 명이 다른 틀린그림찾기 대전방에서 플레이 중입니다.' };
  }
  const started = startMatch(state, room, date);
  if (!started.ok) room.rematchRequests = [];
  return started.ok ? { ok: true, started: true, message: '새로운 그림으로 재대결을 시작했습니다.' } : started;
}

export function processSpotDifferenceTimers(state, date = new Date(), { roomId: targetRoomId = null } = {}) {
  const game = state.spotDifference = normalizeSpotDifference(state.spotDifference, state, date);
  let changed = false;
  let settled = false;
  const entries = targetRoomId ? (game.rooms[targetRoomId] ? [[targetRoomId, game.rooms[targetRoomId]]] : []) : Object.entries(game.rooms);
  for (const [roomId, room] of entries) {
    if (room.status === 'waiting') {
      const base = new Date(room.updatedAt ?? room.createdAt ?? '').getTime();
      if (Number.isFinite(base) && base + SPOT_DIFFERENCE_WAITING_ROOM_TTL_MS <= date.getTime()) { delete game.rooms[roomId]; changed = true; }
      continue;
    }
    if (room.status === 'ended' && room.settled) {
      const base = new Date(room.endedAt ?? room.updatedAt ?? room.createdAt ?? '').getTime();
      if (Number.isFinite(base) && base + SPOT_DIFFERENCE_ENDED_ROOM_TTL_MS <= date.getTime()) { delete game.rooms[roomId]; changed = true; }
      continue;
    }
    if (room.status !== 'playing') continue;
    const deadline = new Date(room.deadlineAt ?? '').getTime();
    if (!Number.isFinite(deadline) || deadline > date.getTime()) continue;

    const host = room.players[room.hostPetId];
    const guest = room.players[room.guestPetId];
    const hostCount = int(host?.foundCount);
    const guestCount = int(guest?.foundCount);
    if (hostCount !== guestCount) {
      const winnerPetId = hostCount > guestCount ? room.hostPetId : room.guestPetId;
      const loserPetId = winnerPetId === room.hostPetId ? room.guestPetId : room.hostPetId;
      finishWin(state, room, winnerPetId, loserPetId, `45초 종료 · ${Math.max(hostCount, guestCount)}개 대 ${Math.min(hostCount, guestCount)}개로 더 많이 찾았습니다.`, date);
    } else if (hostCount > 0) {
      const hostAt = new Date(host?.lastCorrectAt ?? '').getTime();
      const guestAt = new Date(guest?.lastCorrectAt ?? '').getTime();
      if (Number.isFinite(hostAt) && Number.isFinite(guestAt) && hostAt !== guestAt) {
        const winnerPetId = hostAt < guestAt ? room.hostPetId : room.guestPetId;
        const loserPetId = winnerPetId === room.hostPetId ? room.guestPetId : room.hostPetId;
        finishWin(state, room, winnerPetId, loserPetId, `45초 종료 · 둘 다 ${hostCount}개를 찾았고 같은 개수에 먼저 도달한 플레이어가 승리했습니다.`, date);
      } else finishDraw(state, room, `45초 종료 · 양쪽 모두 ${hostCount}개로 완전 동점입니다.`, date);
    } else finishDraw(state, room, '45초 종료 · 양쪽 모두 정답을 찾지 못해 무승부입니다.', date);
    changed = true;
    settled = true;
  }
  return { changed, settled };
}

export function spotDifferenceNextAlarmAt(state, date = new Date()) {
  const game = normalizeSpotDifference(state.spotDifference, state, date);
  const now = date.getTime();
  const candidates = [];
  for (const room of Object.values(game.rooms)) {
    if (room.status === 'waiting') candidates.push(new Date(room.updatedAt ?? room.createdAt ?? '').getTime() + SPOT_DIFFERENCE_WAITING_ROOM_TTL_MS);
    else if (room.status === 'playing') candidates.push(new Date(room.deadlineAt ?? '').getTime());
    else if (room.status === 'ended' && room.settled) candidates.push(new Date(room.endedAt ?? room.updatedAt ?? '').getTime() + SPOT_DIFFERENCE_ENDED_ROOM_TTL_MS);
  }
  const valid = candidates.filter((value) => Number.isFinite(value) && value > now);
  return valid.length ? new Date(Math.min(...valid)).toISOString() : null;
}

function playerPublic(player, { includeFound = false } = {}) {
  return {
    petId: player.petId,
    displayName: player.displayName,
    foundCount: int(player.foundCount),
    foundIds: includeFound ? [...player.foundIds] : [],
    wrongClicks: int(player.wrongClicks),
    lockedUntil: includeFound ? player.lockedUntil : null,
    lastCorrectAt: null
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
    players[room.hostPetId] = playerPublic(room.players[room.hostPetId], { includeFound: isPlayer && viewerPetId === room.hostPetId });
    players[room.guestPetId] = playerPublic(room.players[room.guestPetId], { includeFound: isPlayer && viewerPetId === room.guestPetId });
  }
  const canSeePuzzle = room.status !== 'waiting' && (viewerRole !== 'none' || room.status === 'ended');
  return {
    id: room.id, roomNumber: room.roomNumber, status: room.status, stakePoints: room.stakePoints,
    matchId: isPlayer ? room.matchId : null,
    host: host ? { petId: host.id, displayName: host.displayName } : null,
    guest: guest ? { petId: guest.id, displayName: guest.displayName } : null,
    viewerRole, selfPetId: isPlayer ? viewerPetId : null, opponentPetId: isPlayer ? opponentId(room, viewerPetId) : null,
    spectatorCount: Object.keys(room.spectators ?? {}).length,
    players,
    puzzle: canSeePuzzle && room.puzzle ? { ...room.puzzle, differenceIds: [...room.puzzle.differenceIds] } : null,
    differenceCount: SPOT_DIFFERENCE_COUNT,
    wrongLockMs: SPOT_DIFFERENCE_WRONG_LOCK_MS,
    maxWrongClicks: SPOT_DIFFERENCE_MAX_WRONG_CLICKS,
    startCountdownMs: SPOT_DIFFERENCE_START_COUNTDOWN_MS,
    stateVersion: room.stateVersion,
    winnerPetId: room.winnerPetId, loserPetId: room.loserPetId, result: room.result, resultReason: room.resultReason,
    rematchRequestedByMe: room.rematchRequests.includes(viewerPetId),
    startedAt: room.startedAt, revealAt: room.revealAt, deadlineAt: room.deadlineAt, endedAt: room.endedAt, updatedAt: room.updatedAt,
    serverTime: date.getTime()
  };
}

export function spotDifferenceRoomView(state, roomId, viewerPetId, date = new Date()) {
  const game = state.spotDifference = normalizeSpotDifference(state.spotDifference, state, date);
  const room = game.rooms[roomId];
  return room ? publicRoomView(state, room, viewerPetId, date) : null;
}

export function spotDifferenceView(state, viewerPetId, date = new Date()) {
  const game = state.spotDifference = normalizeSpotDifference(state.spotDifference, state, date);
  return {
    maxRooms: SPOT_DIFFERENCE_MAX_ROOMS,
    stakes: [...SPOT_DIFFERENCE_STAKES],
    matchSeconds: SPOT_DIFFERENCE_MATCH_SECONDS,
    differenceCount: SPOT_DIFFERENCE_COUNT,
    maxWrongClicks: SPOT_DIFFERENCE_MAX_WRONG_CLICKS,
    themes: SPOT_DIFFERENCE_THEMES.map((theme) => ({ ...theme })),
    serverTime: date.getTime(),
    rooms: Object.values(game.rooms).sort((a, b) => a.roomNumber - b.roomNumber).map((room) => publicRoomView(state, room, viewerPetId, date))
  };
}

export function clearEndedSpotDifferenceRooms(state, date = new Date()) {
  const game = state.spotDifference = normalizeSpotDifference(state.spotDifference, state, date);
  const ids = Object.values(game.rooms).filter((room) => room.status === 'ended' && room.settled).map((room) => room.id);
  for (const roomId of ids) delete game.rooms[roomId];
  return { ok: true, cleared: ids.length, message: ids.length ? `종료된 틀린그림찾기 대전방 ${ids.length}개를 비웠습니다.` : '비울 종료 틀린그림찾기 대전방이 없습니다.' };
}

export function spotDifferenceRanking(state, viewerPetId = null) {
  const entries = Object.values(state.pets ?? {}).filter((pet) => pet?.alive).map((pet) => ({
    petId: pet.id,
    displayName: pet.displayName,
    wins: int(pet.records?.seasonSpotDifferenceWins),
    draws: int(pet.records?.seasonSpotDifferenceDraws),
    losses: int(pet.records?.seasonSpotDifferenceLosses)
  })).filter((entry) => entry.wins || entry.draws || entry.losses)
    .sort((a, b) => b.wins - a.wins || a.losses - b.losses || b.draws - a.draws || a.displayName.localeCompare(b.displayName, 'ko'));
  const myIndex = viewerPetId ? entries.findIndex((entry) => entry.petId === viewerPetId) : -1;
  return {
    top: entries.slice(0, 5).map((entry, index) => ({ ...entry, rank: index + 1 })),
    mine: myIndex >= 0 ? { ...entries[myIndex], rank: myIndex + 1 } : null
  };
}

export function removePetFromSpotDifference(state, petId, date = new Date()) {
  const game = state.spotDifference = normalizeSpotDifference(state.spotDifference, state, date);
  for (const room of Object.values(game.rooms)) {
    delete room.spectators?.[petId];
    if (room.status === 'waiting' && room.hostPetId === petId) delete game.rooms[room.id];
    else if (room.status === 'playing' && [room.hostPetId, room.guestPetId].includes(petId)) finishWin(state, room, opponentId(room, petId), petId, '플레이어 상태가 종료되어 기권패 처리되었습니다.', date);
    else if (room.status === 'ended' && [room.hostPetId, room.guestPetId].includes(petId)) delete game.rooms[room.id];
  }
}
