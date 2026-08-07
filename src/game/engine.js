import { id, chance } from '../lib/ids.js';
import { gameDayKey, gameDaysBetweenKeys, nextGameDayAt, coupleDayCount } from '../lib/time.js';
import { withJosa } from '../lib/korean.js';
import {
  GAME_DAY_HOURS,
  ACTIONS_PER_DAY,
  ACTION_COOLDOWN_MINUTES,
  MINI_GAMES_PER_DAY,
  FISHING_PER_DAY,
  FISHING_WAIT_MS,
  STATUS_MESSAGE_MAX_LENGTH,
  STARTING_POINTS,
  STARTING_STAMINA,
  STARTING_HUNGER,
  STARTING_BODY,
  STARTING_LEGO_POWER,
  WORK_POINTS,
  HUNGER_PENALTY_POINTS_PER_HOUR,
  BREAK_WARNING_MAX,
  BREAK_PATTERN_DAYS,
  BREAK_RECOVERY_DAYS,
  BREAK_OVER_EAT_COUNT,
  BREAK_WORK_MIN_ACTIONS,
  BREAK_WORK_RATIO,
  BREAK_BUNG_COUNT,
  BREAK_BUNG_OTHER_MAX,
  BREAK_REPEAT_MIN_TOTAL,
  BREAK_REPEAT_RATIO,
  BREAK_INACTIVITY_HOURS,
  BUNG_MIN_STAKE,
  BUNG_MIN_PLAYERS,
  BUNG_MAX_PLAYERS,
  BODY_STAGES,
  FOODS,
  MINI_GAMES,
  ODD_EVEN_MIN_STAKE,
  ODD_EVEN_PAYOUT_PERCENT,
  ODD_EVEN_STAKE_STEP,
  FISHING_REWARDS
} from './constants.js';
import {
  DAILY_LEGO_GOALS,
  awardLegoPower,
  completeDailyGoal,
  dailyGoalView,
  ensureDailyProgress,
  incrementGoalCounter,
  levelForPower,
  levelProgress,
  resetDailyProgress
} from './progression.js';
import { clearPetTerritory } from './territory.js';
import { consumeInteractionHunger } from './activity.js';
import { appleBoardEmpty, appleChallengeFields, normalizeAppleChallenge, selectAppleRectangle } from './apple-game.js';
import { omokRanking, removePetFromOmok } from './omok.js';

const nowIso = (date = new Date()) => date.toISOString();
const clamp = (value, min = 0, max = 100) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.max(min, Math.min(max, Math.round(numeric)));
};
const nonNegativeInt = (value, fallback = 0) => Math.max(0, Math.floor(Number.isFinite(Number(value)) ? Number(value) : fallback));
const normalizeBody = (value, fallback = STARTING_BODY) => {
  const numeric = Number(value);
  return Math.max(60, Math.round(Number.isFinite(numeric) ? numeric : fallback));
};

function normalizedStatusText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function truncateCodePoints(value, maxLength) {
  return [...String(value ?? '')].slice(0, maxLength).join('');
}

export function getBodyStage(body) {
  const minimum = BODY_STAGES[0].min;
  const value = Math.max(minimum, Number.isFinite(Number(body)) ? Number(body) : minimum);
  return BODY_STAGES.find((stage) => value >= stage.min && value <= stage.max) ?? BODY_STAGES.at(-1);
}

export function petDisplayName(nickname, generation) {
  return generation <= 1 ? `${nickname}레고` : `${nickname}레고${generation}`;
}

function legacyPoints(stats) {
  if (Number.isFinite(Number(stats?.points))) return nonNegativeInt(stats.points);
  if (Number.isFinite(Number(stats?.money))) return Math.floor(Math.max(0, Number(stats.money)) / 100);
  return STARTING_POINTS;
}

function legacyHunger(stats) {
  if (Number(stats?.schemaHungerDirection) === 1) return clamp(stats.hunger, 0, 100);
  if (Number.isFinite(Number(stats?.hunger))) return clamp(100 - Number(stats.hunger), 0, 100);
  return STARTING_HUNGER;
}

export function ensurePetSchema(pet, date = new Date()) {
  if (!pet || typeof pet !== 'object' || Array.isArray(pet)) throw new TypeError('레고 데이터가 올바르지 않습니다.');
  const oldSchema = nonNegativeInt(pet.schemaVersion, 0);
  pet.schemaVersion = 10;
  pet.stats = pet.stats && typeof pet.stats === 'object' && !Array.isArray(pet.stats) ? pet.stats : {};
  const oldStats = { ...pet.stats };
  pet.stats.points = oldSchema >= 6 ? nonNegativeInt(pet.stats.points) : legacyPoints(oldStats);
  pet.stats.stamina = clamp(Number.isFinite(Number(oldStats.stamina)) ? oldStats.stamina : STARTING_STAMINA);
  pet.stats.hunger = oldSchema >= 6 ? clamp(oldStats.hunger, 0, 100) : legacyHunger(oldStats);
  pet.stats.body = normalizeBody(oldStats.body, STARTING_BODY);
  pet.stats.legoPower = Math.max(1, nonNegativeInt(oldStats.legoPower, nonNegativeInt(oldStats.charm, STARTING_LEGO_POWER)));
  pet.stats.schemaHungerDirection = 1;
  for (const key of ['money', 'debt', 'mood', 'charm', 'reputation', 'workTrust', 'stress', 'lifeCrisis']) delete pet.stats[key];
  delete pet.job;
  delete pet.inventory;
  delete pet.rumorListenCredits;
  delete pet.heardRumorIds;
  delete pet.hidden;
  pet.statusMessage = truncateCodePoints(normalizedStatusText(pet.statusMessage), STATUS_MESSAGE_MAX_LENGTH);

  pet.daily = pet.daily && typeof pet.daily === 'object' && !Array.isArray(pet.daily) ? pet.daily : {};
  pet.daily.date = typeof pet.daily.date === 'string' && pet.daily.date ? pet.daily.date : gameDayKey(date);
  pet.daily.actionsLeft = clamp(Number.isFinite(Number(pet.daily.actionsLeft)) ? pet.daily.actionsLeft : ACTIONS_PER_DAY, 0, ACTIONS_PER_DAY);
  pet.daily.nextActionAt = Number.isFinite(new Date(pet.daily.nextActionAt ?? '').getTime()) ? new Date(pet.daily.nextActionAt).toISOString() : null;
  pet.daily.miniGamesPlayed = clamp(pet.daily.miniGamesPlayed, 0, MINI_GAMES_PER_DAY);
  pet.daily.fishingPlayed = clamp(pet.daily.fishingPlayed, 0, FISHING_PER_DAY);
  pet.daily.interactionKeys = Array.isArray(pet.daily.interactionKeys)
    ? [...new Set(pet.daily.interactionKeys.filter((value) => typeof value === 'string'))].slice(-400)
    : [];
  const rawBalance = pet.daily.balanceCounts && typeof pet.daily.balanceCounts === 'object' && !Array.isArray(pet.daily.balanceCounts) ? pet.daily.balanceCounts : {};
  pet.daily.balanceCounts = Object.fromEntries(['work', 'rest', 'exercise', 'eat', 'bung', 'mini', 'fishing'].map((key) => [key, nonNegativeInt(rawBalance[key])]));
  ensureDailyProgress(pet, date);
  if (pet.daily.fishing && typeof pet.daily.fishing === 'object' && !Array.isArray(pet.daily.fishing)) {
    const startedAt = new Date(pet.daily.fishing.startedAt ?? '').getTime();
    const readyAt = new Date(pet.daily.fishing.readyAt ?? '').getTime();
    const reward = FISHING_REWARDS.find((item) => item.id === pet.daily.fishing.resultId);
    pet.daily.fishing = Number.isFinite(startedAt) && Number.isFinite(readyAt) && readyAt >= startedAt && reward
      ? {
        id: String(pet.daily.fishing.id || id('fish')),
        startedAt: new Date(startedAt).toISOString(),
        readyAt: new Date(readyAt).toISOString(),
        resultId: reward.id,
        counted: true
      }
      : null;
  } else pet.daily.fishing = null;
  if (pet.daily.lastFishingResult && typeof pet.daily.lastFishingResult === 'object' && !Array.isArray(pet.daily.lastFishingResult)) {
    const reward = FISHING_REWARDS.find((item) => item.id === pet.daily.lastFishingResult.resultId);
    const completedAt = new Date(pet.daily.lastFishingResult.completedAt ?? '').getTime();
    pet.daily.lastFishingResult = reward && Number.isFinite(completedAt)
      ? {
        fishingId: String(pet.daily.lastFishingResult.fishingId || ''),
        resultId: reward.id,
        label: reward.label,
        reward: reward.reward,
        completedAt: new Date(completedAt).toISOString(),
        announced: Boolean(pet.daily.lastFishingResult.announced)
      }
      : null;
  } else pet.daily.lastFishingResult = null;

  pet.survival = pet.survival && typeof pet.survival === 'object' && !Array.isArray(pet.survival) ? pet.survival : {};
  const zeroAt = new Date(pet.survival.hungerZeroAt ?? '').getTime();
  pet.survival.hungerZeroAt = pet.stats.hunger === 0 && Number.isFinite(zeroAt) ? new Date(zeroAt).toISOString() : null;
  pet.survival.hungerPenaltyHoursApplied = pet.stats.hunger === 0 ? nonNegativeInt(pet.survival.hungerPenaltyHoursApplied) : 0;

  pet.integrity = pet.integrity && typeof pet.integrity === 'object' && !Array.isArray(pet.integrity) ? pet.integrity : {};
  pet.integrity.breakWarnings = Math.min(BREAK_WARNING_MAX, nonNegativeInt(pet.integrity.breakWarnings));
  pet.integrity.broken = Boolean(pet.integrity.broken);
  pet.integrity.brokenAt = pet.integrity.broken && Number.isFinite(new Date(pet.integrity.brokenAt ?? '').getTime()) ? new Date(pet.integrity.brokenAt).toISOString() : null;
  pet.integrity.cause = typeof pet.integrity.cause === 'string' && pet.integrity.cause ? pet.integrity.cause.slice(0, 80) : null;
  pet.integrity.stageMessage = typeof pet.integrity.stageMessage === 'string' && pet.integrity.stageMessage ? pet.integrity.stageMessage.slice(0, 180) : null;
  const pattern = pet.integrity.patternStreaks && typeof pet.integrity.patternStreaks === 'object' && !Array.isArray(pet.integrity.patternStreaks) ? pet.integrity.patternStreaks : {};
  pet.integrity.patternStreaks = Object.fromEntries(['overeat', 'starve', 'work', 'bung', 'repeat'].map((key) => [key, nonNegativeInt(pattern[key])]));
  pet.integrity.lastRepeatAction = typeof pet.integrity.lastRepeatAction === 'string' ? pet.integrity.lastRepeatAction : null;
  pet.integrity.balancedStreak = nonNegativeInt(pet.integrity.balancedStreak);
  pet.integrity.inactivityWarned = Boolean(pet.integrity.inactivityWarned);
  const activeAt = new Date(pet.integrity.lastActiveAt ?? pet.createdAt ?? date).getTime();
  pet.integrity.lastActiveAt = Number.isFinite(activeAt) ? new Date(activeAt).toISOString() : nowIso(date);

  pet.records = pet.records && typeof pet.records === 'object' && !Array.isArray(pet.records) ? pet.records : {};
  const defaults = {
    days: 1,
    works: 0,
    rests: 0,
    workouts: 0,
    foods: 0,
    bungs: 0,
    relationships: 0,
    breakups: 0,
    warnings: 0,
    pointsEarned: nonNegativeInt(pet.records.earned),
    pointsSpent: nonNegativeInt(pet.records.spent),
    pointsLostToHunger: 0,
    maxPoints: legacyPoints(oldStats),
    maxBody: pet.stats.body,
    maxLevel: levelForPower(pet.stats.legoPower),
    legoPowerEarned: nonNegativeInt(pet.records.charmEarned),
    miniGames: 0,
    oddEvenBest: 0,
    bestReactionMs: 0,
    numberBestAttempts: 0,
    fishing: 0,
    fishingEarned: 0,
    pokesSent: 0,
    pokesReceived: 0,
    matches: 0,
    matingRequests: 0,
    liarGames: 0,
    liarWins: 0,
    liarPointsWon: 0,
    territoryClaims: 0,
    territorySteals: 0,
    territoryWins: 0,
    appleBestScore: 0,
    omokWins: 0,
    omokDraws: 0,
    omokLosses: 0
  };
  for (const [key, fallback] of Object.entries(defaults)) pet.records[key] = Math.max(key === 'days' ? 1 : 0, nonNegativeInt(pet.records[key], fallback));
  pet.records.oddEvenBestAt = Number.isFinite(new Date(pet.records.oddEvenBestAt ?? '').getTime()) ? new Date(pet.records.oddEvenBestAt).toISOString() : null;
  pet.records.appleBestAt = Number.isFinite(new Date(pet.records.appleBestAt ?? '').getTime()) ? new Date(pet.records.appleBestAt).toISOString() : null;
  for (const key of ['skips', 'soloBungs', 'bungImpressionsUp', 'bungImpressionsDown', 'bungImpressionsReceivedUp', 'bungImpressionsReceivedDown', 'rumorsSpread', 'rumorsHeard', 'rumorsCreated', 'villainActs', 'noShows', 'earned', 'spent', 'maxDebt', 'charmEarned', 'offspring', 'privateBungs', 'matings', 'dates']) delete pet.records[key];

  pet.warnings = nonNegativeInt(pet.warnings);
  pet.partnerPetId = pet.partnerPetId ? String(pet.partnerPetId) : null;
  const coupleStartedAt = new Date(pet.coupleStartedAt ?? '').getTime();
  pet.coupleStartedAt = pet.partnerPetId && Number.isFinite(coupleStartedAt) ? new Date(coupleStartedAt).toISOString() : null;
  pet.levelReachedAt = Number.isFinite(new Date(pet.levelReachedAt ?? '').getTime()) ? new Date(pet.levelReachedAt).toISOString() : pet.createdAt ?? nowIso(date);
  pet.flags = pet.flags && typeof pet.flags === 'object' && !Array.isArray(pet.flags) ? pet.flags : {};
  pet.flags.removedFromLiar = Boolean(pet.flags.removedFromLiar);
  normalizePet(pet);
  return pet;
}

export function normalizePet(pet) {
  pet.stats.points = nonNegativeInt(pet.stats.points);
  pet.stats.stamina = clamp(pet.stats.stamina);
  pet.stats.hunger = clamp(pet.stats.hunger);
  pet.stats.body = normalizeBody(pet.stats.body, STARTING_BODY);
  pet.stats.legoPower = Math.max(1, nonNegativeInt(pet.stats.legoPower, 1));
  pet.records.maxPoints = Math.max(nonNegativeInt(pet.records.maxPoints), pet.stats.points);
  pet.records.maxBody = Math.max(nonNegativeInt(pet.records.maxBody), pet.stats.body);
  pet.records.maxLevel = Math.max(nonNegativeInt(pet.records.maxLevel, 1), levelForPower(pet.stats.legoPower));
  if (pet.stats.hunger > 0) {
    pet.survival.hungerZeroAt = null;
    pet.survival.hungerPenaltyHoursApplied = 0;
  }
  return pet;
}

export function createPet(user, generation = 1, date = new Date()) {
  const pet = {
    id: id('pet'),
    userId: user.id,
    generation,
    displayName: petDisplayName(user.nickname, generation),
    createdAt: date.toISOString(),
    endedAt: null,
    endReason: null,
    endDetail: null,
    alive: true,
    schemaVersion: 10,
    statusMessage: '',
    stats: {
      points: STARTING_POINTS,
      stamina: STARTING_STAMINA,
      hunger: STARTING_HUNGER,
      body: STARTING_BODY,
      legoPower: STARTING_LEGO_POWER,
      schemaHungerDirection: 1
    },
    daily: {
      date: gameDayKey(date),
      actionsLeft: ACTIONS_PER_DAY,
      nextActionAt: null,
      miniGamesPlayed: 0,
      fishingPlayed: 0,
      fishing: null,
      lastFishingResult: null,
      interactionKeys: [],
      balanceCounts: { work: 0, rest: 0, exercise: 0, eat: 0, bung: 0, mini: 0, fishing: 0 },
      goalCounters: { life: 0, mini: 0, fishing: 0 },
      legoGoals: Object.fromEntries(DAILY_LEGO_GOALS.map((goal) => [goal.key, false]))
    },
    survival: { hungerZeroAt: null, hungerPenaltyHoursApplied: 0 },
    integrity: {
      breakWarnings: 0,
      broken: false,
      brokenAt: null,
      cause: null,
      stageMessage: null,
      patternStreaks: { overeat: 0, starve: 0, work: 0, bung: 0, repeat: 0 },
      lastRepeatAction: null,
      balancedStreak: 0,
      inactivityWarned: false,
      lastActiveAt: date.toISOString()
    },
    records: {
      days: 1, works: 0, rests: 0, workouts: 0, foods: 0, bungs: 0,
      relationships: 0, breakups: 0, warnings: 0,
      pointsEarned: 0, pointsSpent: 0, pointsLostToHunger: 0, maxPoints: 0,
      maxBody: STARTING_BODY, maxLevel: 1, legoPowerEarned: 0,
      miniGames: 0, oddEvenBest: 0, oddEvenBestAt: null, bestReactionMs: 0, numberBestAttempts: 0,
      fishing: 0, fishingEarned: 0, pokesSent: 0, pokesReceived: 0,
      matches: 0, matingRequests: 0, liarGames: 0, liarWins: 0, liarPointsWon: 0,
      territoryClaims: 0, territorySteals: 0, territoryWins: 0,
      appleBestScore: 0, appleBestAt: null, omokWins: 0, omokDraws: 0, omokLosses: 0
    },
    warnings: 0,
    partnerPetId: null,
    coupleStartedAt: null,
    levelReachedAt: date.toISOString(),
    flags: { removedFromLiar: false }
  };
  return ensurePetSchema(pet, date);
}

export function addPublicEvent(state, text, type = 'info', petIds = [], date = new Date()) {
  state.publicEvents ??= [];
  const event = { id: id('event'), text: String(text).slice(0, 300), type, petIds, createdAt: nowIso(date) };
  state.publicEvents.unshift(event);
  state.publicEvents = state.publicEvents.slice(0, 10);
  return event;
}

export function addNotification(state, userId, text, type = 'info', payload = {}, date = new Date()) {
  const user = state.users[userId];
  if (!user) return null;
  user.notifications ??= [];
  const notification = { id: id('noti'), text: String(text).slice(0, 300), type, payload, read: false, createdAt: nowIso(date) };
  user.notifications.unshift(notification);
  user.notifications = user.notifications.slice(0, 100);
  return notification;
}

export function relationKey(a, b) {
  return [String(a), String(b)].sort().join('__');
}

export function ensureRelationship(state, petA, petB) {
  state.relationships ??= {};
  const key = relationKey(petA, petB);
  const current = state.relationships[key];
  const relation = current && typeof current === 'object' && !Array.isArray(current) ? current : {};
  relation.id = key;
  relation.petIds = [String(petA), String(petB)].sort();
  relation.matchedAt = Number.isFinite(new Date(relation.matchedAt ?? '').getTime()) ? new Date(relation.matchedAt).toISOString() : null;
  relation.lastBreakupAt = Number.isFinite(new Date(relation.lastBreakupAt ?? '').getTime()) ? new Date(relation.lastBreakupAt).toISOString() : null;
  relation.createdAt = Number.isFinite(new Date(relation.createdAt ?? '').getTime()) ? new Date(relation.createdAt).toISOString() : nowIso();
  relation.updatedAt = Number.isFinite(new Date(relation.updatedAt ?? '').getTime()) ? new Date(relation.updatedAt).toISOString() : relation.createdAt;
  state.relationships[key] = relation;
  return relation;
}

function ensurePokePair(state, petA, petB) {
  state.pokes ??= {};
  const petIds = [String(petA), String(petB)].sort();
  const key = relationKey(...petIds);
  const current = state.pokes[key];
  const pair = current && typeof current === 'object' && !Array.isArray(current) ? current : {};
  pair.id = key;
  pair.petIds = petIds;
  pair.counts = pair.counts && typeof pair.counts === 'object' && !Array.isArray(pair.counts) ? pair.counts : {};
  for (const petId of petIds) pair.counts[petId] = nonNegativeInt(pair.counts[petId]);
  pair.total = pair.counts[petIds[0]] + pair.counts[petIds[1]];
  pair.lastActorPetId = petIds.includes(pair.lastActorPetId) ? pair.lastActorPetId : null;
  pair.createdAt = Number.isFinite(new Date(pair.createdAt ?? '').getTime()) ? new Date(pair.createdAt).toISOString() : nowIso();
  pair.updatedAt = Number.isFinite(new Date(pair.updatedAt ?? '').getTime()) ? new Date(pair.updatedAt).toISOString() : pair.createdAt;
  state.pokes[key] = pair;
  return pair;
}

export function pokeStatus(state, viewerPetId, targetPetId) {
  if (!viewerPetId || !targetPetId || viewerPetId === targetPetId) return null;
  const pair = state.pokes?.[relationKey(viewerPetId, targetPetId)] ?? null;
  const sentByViewer = nonNegativeInt(pair?.counts?.[viewerPetId]);
  const sentByTarget = nonNegativeInt(pair?.counts?.[targetPetId]);
  return {
    sentByViewer,
    sentByTarget,
    total: sentByViewer + sentByTarget,
    canPoke: pair?.lastActorPetId !== viewerPetId,
    waitingForTarget: pair?.lastActorPetId === viewerPetId,
    isReturnPoke: pair?.lastActorPetId === targetPetId
  };
}

export function pokePet(state, actorPet, targetPet, date = new Date()) {
  if (!actorPet?.alive || actorPet.integrity?.broken || !targetPet?.alive || targetPet.integrity?.broken || actorPet.id === targetPet.id) return { ok: false, message: '상대 레고를 찾을 수 없습니다.' };
  const pair = ensurePokePair(state, actorPet.id, targetPet.id);
  if (pair.lastActorPetId === actorPet.id) return { ok: false, message: '상대가 되찌르기 전에는 다시 찌를 수 없습니다.' };
  pair.counts[actorPet.id] += 1;
  pair.total = pair.counts[pair.petIds[0]] + pair.counts[pair.petIds[1]];
  pair.lastActorPetId = actorPet.id;
  pair.updatedAt = nowIso(date);
  actorPet.records.pokesSent += 1;
  targetPet.records.pokesReceived += 1;
  addNotification(state, targetPet.userId, `${withJosa(actorPet.displayName, '이/가')} 찔렀습니다. 서로 총 ${pair.total}회`, 'poke', { petId: actorPet.id, pairId: pair.id }, date);
  refreshTopPokeNews(state, date);
  return { ok: true, message: `${targetPet.displayName}을 찔렀습니다. 서로 총 ${pair.total}회`, poke: pokeStatus(state, actorPet.id, targetPet.id) };
}

export function pokeRanking(state, limit = 5) {
  return Object.values(state.pokes ?? {})
    .filter((pair) => pair && Array.isArray(pair.petIds) && pair.petIds.length === 2)
    .map((pair) => {
      const [a, b] = pair.petIds;
      const first = state.pets[a];
      const second = state.pets[b];
      const total = nonNegativeInt(pair.counts?.[a]) + nonNegativeInt(pair.counts?.[b]);
      return first?.alive && !first.integrity?.broken && second?.alive && !second.integrity?.broken && nonNegativeInt(pair.counts?.[a]) > 0 && nonNegativeInt(pair.counts?.[b]) > 0
        ? { pairId: pair.id, total, updatedAt: pair.updatedAt, members: [
          { petId: a, displayName: first.displayName, count: nonNegativeInt(pair.counts?.[a]) },
          { petId: b, displayName: second.displayName, count: nonNegativeInt(pair.counts?.[b]) }
        ] }
        : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.total - a.total || new Date(b.updatedAt ?? 0) - new Date(a.updatedAt ?? 0))
    .slice(0, limit)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

export function refreshTopPokeNews(state, date = new Date()) {
  state.publicEvents ??= [];
  const top = pokeRanking(state, 1)[0] ?? null;
  const index = state.publicEvents.findIndex((event) => event.type === 'poke-top');
  if (!top) {
    if (index >= 0) state.publicEvents.splice(index, 1);
    return null;
  }
  const text = `${top.members[0].displayName}와 ${top.members[1].displayName}가 서로 ${top.total}회 찌르고 있습니다.`;
  if (index >= 0) {
    state.publicEvents[index] = { ...state.publicEvents[index], text, petIds: top.members.map((member) => member.petId), updatedAt: nowIso(date) };
  } else addPublicEvent(state, text, 'poke-top', top.members.map((member) => member.petId), date);
  state.publicEvents = state.publicEvents.slice(0, 10);
  return top;
}

const BREAK_LABELS = Object.freeze({
  overeat: '과식', starve: '굶주림', work: '과로', bung: '벙 과다', repeat: '행동 반복', inactivity: '장기 미접속'
});

function breakStageMessage(cause, warnings) {
  const stage = Math.max(1, Math.min(BREAK_WARNING_MAX, Number(warnings) || 1));
  const lines = {
    overeat: ['🍔 레고가 배부른 것 같습니다.', '⚠️ 너무 먹였습니다. 몸통이 빵빵합니다.', '🚨 레고의 결합부가 벌어지고 있습니다.'],
    starve: ['🍽️ 레고가 너무 오래 굶었습니다.', '⚠️ 배고픈 레고의 결합부가 메말라가고 있습니다.', '🚨 굶주림으로 레고의 결합부가 벌어지고 있습니다.'],
    work: ['💼 레고가 일밖에 모릅니다.', '⚠️ 너무 오래 일해 관절이 삐걱거립니다.', '🚨 과로로 레고의 결합부가 벌어지고 있습니다.'],
    bung: ['🎉 레고가 아직도 벙을 다니고 있습니다.', '⚠️ 벙만 다녀 결합부가 헐거워지고 있습니다.', '🚨 레고의 결합부가 벙을 버티지 못하고 있습니다.'],
    repeat: ['🔁 같은 행동을 너무 반복하고 있습니다.', '⚠️ 반복 행동으로 관절이 한쪽만 닳고 있습니다.', '🚨 반복된 행동으로 레고의 결합부가 벌어지고 있습니다.'],
    inactivity: ['💤 레고가 너무 오래 잠들어 있었습니다.', '⚠️ 오래 움직이지 않아 결합부가 굳고 있습니다.', '🚨 장기 방치로 레고의 결합부가 벌어지고 있습니다.']
  };
  return (lines[cause] ?? lines.repeat)[stage - 1];
}

function resetBreakPatternStreaks(pet) {
  for (const key of Object.keys(pet.integrity.patternStreaks)) pet.integrity.patternStreaks[key] = 0;
  pet.integrity.lastRepeatAction = null;
}

export function breakWarningView(pet) {
  ensurePetSchema(pet);
  return {
    warnings: pet.integrity.breakWarnings,
    maxWarnings: BREAK_WARNING_MAX,
    broken: pet.integrity.broken,
    brokenAt: pet.integrity.brokenAt,
    cause: pet.integrity.cause,
    causeLabel: pet.integrity.cause ? (BREAK_LABELS[pet.integrity.cause] ?? pet.integrity.cause) : null,
    stageMessage: pet.integrity.stageMessage
  };
}

export function markPetBroken(state, pet, cause = 'repeat', date = new Date()) {
  ensurePetSchema(pet, date);
  if (pet.integrity.broken) return { broken: true, newlyBroken: false, cause: pet.integrity.cause };
  pet.integrity.broken = true;
  pet.integrity.brokenAt = nowIso(date);
  pet.integrity.cause = cause;
  pet.integrity.stageMessage = '💥 레고가 부숴졌습니다.';
  pet.daily.nextActionAt = null;
  pet.daily.fishing = null;
  if (pet.partnerPetId) {
    const partner = state?.pets?.[pet.partnerPetId];
    if (partner?.alive && partner.partnerPetId === pet.id) {
      partner.partnerPetId = null;
      partner.coupleStartedAt = null;
      addNotification(state, partner.userId, `${pet.displayName}이 부숴져 커플 관계가 종료되었습니다.`, 'relationship', { petId: pet.id }, date);
    }
    pet.partnerPetId = null;
    pet.coupleStartedAt = null;
  }
  if (state) {
    removePetFromSocialState(state, pet);
    addNotification(state, pet.userId, `💥 ${pet.displayName}이 부숴졌습니다. 다음 세대 레고로 다시 시작할 수 있습니다.`, 'break', { popup: true, broken: true }, date);
    addPublicEvent(state, `💥 ${pet.displayName}이 ${BREAK_LABELS[cause] ?? cause} 때문에 부숴졌습니다.`, 'break', [pet.id], date);
    refreshTopPokeNews(state, date);
  }
  return { broken: true, newlyBroken: true, cause };
}

function addBreakWarning(state, pet, cause, date = new Date()) {
  ensurePetSchema(pet, date);
  if (pet.integrity.broken) return { changed: false, broken: true };
  if (pet.integrity.breakWarnings >= BREAK_WARNING_MAX) return { changed: true, ...markPetBroken(state, pet, cause, date) };
  pet.integrity.breakWarnings += 1;
  pet.integrity.cause = cause;
  pet.integrity.stageMessage = breakStageMessage(cause, pet.integrity.breakWarnings);
  pet.integrity.balancedStreak = 0;
  resetBreakPatternStreaks(pet);
  if (state) addNotification(state, pet.userId, `${pet.integrity.stageMessage} · 파손 경고 ${pet.integrity.breakWarnings}/${BREAK_WARNING_MAX}`, 'break-warning', { popup: true, breakWarnings: pet.integrity.breakWarnings }, date);
  return { changed: true, broken: false, warningAdded: true, warnings: pet.integrity.breakWarnings, cause, message: pet.integrity.stageMessage };
}

function evaluateDailyBalance(state, pet, date = new Date()) {
  ensurePetSchema(pet, date);
  if (pet.integrity.broken) return { changed: false, broken: true };
  const c = pet.daily.balanceCounts;
  const lifeTotal = c.work + c.rest + c.exercise;
  const total = lifeTotal + c.eat + c.bung + c.mini + c.fishing;
  const hadActivity = total > 0;
  const flags = {
    overeat: c.eat >= BREAK_OVER_EAT_COUNT,
    starve: hadActivity && pet.stats.hunger === 0,
    work: lifeTotal >= BREAK_WORK_MIN_ACTIONS && c.work / lifeTotal >= BREAK_WORK_RATIO,
    bung: c.bung >= BREAK_BUNG_COUNT && (c.work + c.rest + c.exercise + c.eat + c.mini + c.fishing) <= BREAK_BUNG_OTHER_MAX,
    repeat: false
  };
  const genericEntries = [['rest', c.rest], ['exercise', c.exercise], ['mini', c.mini], ['fishing', c.fishing]];
  const dominant = genericEntries.sort((a, b) => b[1] - a[1])[0];
  if (total >= BREAK_REPEAT_MIN_TOTAL && dominant?.[1] > 0 && dominant[1] / total >= BREAK_REPEAT_RATIO) flags.repeat = true;

  for (const key of ['overeat', 'starve', 'work', 'bung']) {
    pet.integrity.patternStreaks[key] = flags[key] ? pet.integrity.patternStreaks[key] + 1 : 0;
  }
  if (flags.repeat) {
    pet.integrity.patternStreaks.repeat = pet.integrity.lastRepeatAction === dominant[0] ? pet.integrity.patternStreaks.repeat + 1 : 1;
    pet.integrity.lastRepeatAction = dominant[0];
  } else {
    pet.integrity.patternStreaks.repeat = 0;
    pet.integrity.lastRepeatAction = null;
  }

  const priority = ['overeat', 'starve', 'work', 'bung', 'repeat'];
  const cause = priority.find((key) => pet.integrity.patternStreaks[key] >= BREAK_PATTERN_DAYS) ?? null;
  if (cause) return addBreakWarning(state, pet, cause, date);

  const anyImbalance = Object.values(flags).some(Boolean);
  if (hadActivity && !anyImbalance && pet.stats.hunger > 0 && total >= 3) {
    pet.integrity.balancedStreak += 1;
    if (pet.integrity.balancedStreak >= BREAK_RECOVERY_DAYS && pet.integrity.breakWarnings > 0) {
      pet.integrity.breakWarnings -= 1;
      pet.integrity.balancedStreak = 0;
      pet.integrity.cause = null;
      pet.integrity.stageMessage = pet.integrity.breakWarnings > 0 ? `🧱 균형을 되찾아 파손 경고가 ${pet.integrity.breakWarnings}회로 줄었습니다.` : null;
      if (state) addNotification(state, pet.userId, `🧱 균형 있게 지내 파손 경고가 ${pet.integrity.breakWarnings}회로 줄었습니다.`, 'break-recovery', { popup: true }, date);
      return { changed: true, recovered: true, warnings: pet.integrity.breakWarnings };
    }
  } else pet.integrity.balancedStreak = 0;
  return { changed: false, flags, total };
}

export function applyInactivityConsequence(state, pet, date = new Date()) {
  ensurePetSchema(pet, date);
  if (pet.integrity.broken || pet.integrity.inactivityWarned) return { changed: false };
  const last = new Date(pet.integrity.lastActiveAt ?? pet.createdAt).getTime();
  if (!Number.isFinite(last) || date.getTime() - last < BREAK_INACTIVITY_HOURS * 3_600_000) return { changed: false };
  pet.integrity.inactivityWarned = true;
  const result = addBreakWarning(state, pet, 'inactivity', date);
  return { ...result, inactivity: true };
}

export function markPetActive(pet, date = new Date()) {
  ensurePetSchema(pet, date);
  const changed = pet.integrity.lastActiveAt !== date.toISOString() || pet.integrity.inactivityWarned;
  pet.integrity.lastActiveAt = date.toISOString();
  pet.integrity.inactivityWarned = false;
  return { changed };
}

export function nextInactivityCheckAt(pet) {
  ensurePetSchema(pet);
  if (pet.integrity.broken || pet.integrity.inactivityWarned) return null;
  const last = new Date(pet.integrity.lastActiveAt ?? '').getTime();
  if (!Number.isFinite(last)) return null;
  return new Date(last + BREAK_INACTIVITY_HOURS * 3_600_000).toISOString();
}

export function applyDailyReset(pet, date = new Date(), state = null) {
  ensurePetSchema(pet, date);
  const fishingResult = settleReadyFishing(pet, date);
  const current = gameDayKey(date);
  if (pet.daily.date === current) return { changed: Boolean(fishingResult), days: 0, fishingResult };
  const diff = Math.max(1, gameDaysBetweenKeys(pet.daily.date, current));
  const balance = evaluateDailyBalance(state, pet, date);
  pet.daily.date = current;
  pet.daily.actionsLeft = ACTIONS_PER_DAY;
  pet.daily.nextActionAt = null;
  pet.daily.miniGamesPlayed = 0;
  pet.daily.fishingPlayed = 0;
  pet.daily.interactionKeys = [];
  pet.daily.balanceCounts = { work: 0, rest: 0, exercise: 0, eat: 0, bung: 0, mini: 0, fishing: 0 };
  resetDailyProgress(pet);
  pet.records.days += diff;
  normalizePet(pet);
  return { changed: true, days: diff, fishingResult, balance };
}

export function applyHungerPenalty(pet, date = new Date()) {
  ensurePetSchema(pet, date);
  if (pet.stats.hunger > 0) {
    const changed = Boolean(pet.survival.hungerZeroAt || pet.survival.hungerPenaltyHoursApplied);
    pet.survival.hungerZeroAt = null;
    pet.survival.hungerPenaltyHoursApplied = 0;
    return { changed, hours: 0, pointsLost: 0 };
  }
  if (!pet.survival.hungerZeroAt) {
    pet.survival.hungerZeroAt = date.toISOString();
    pet.survival.hungerPenaltyHoursApplied = 0;
    return { changed: true, hours: 0, pointsLost: 0 };
  }
  const zeroAt = new Date(pet.survival.hungerZeroAt).getTime();
  if (!Number.isFinite(zeroAt)) {
    pet.survival.hungerZeroAt = date.toISOString();
    pet.survival.hungerPenaltyHoursApplied = 0;
    return { changed: true, hours: 0, pointsLost: 0 };
  }
  const totalHours = Math.max(0, Math.floor((date.getTime() - zeroAt) / 3_600_000));
  const pendingHours = Math.max(0, totalHours - nonNegativeInt(pet.survival.hungerPenaltyHoursApplied));
  if (!pendingHours) return { changed: false, hours: 0, pointsLost: 0 };
  const requestedLoss = pendingHours * HUNGER_PENALTY_POINTS_PER_HOUR;
  const actualLoss = Math.min(pet.stats.points, requestedLoss);
  pet.stats.points -= actualLoss;
  pet.records.pointsLostToHunger += actualLoss;
  pet.survival.hungerPenaltyHoursApplied = totalHours;
  normalizePet(pet);
  return { changed: true, hours: pendingHours, pointsLost: actualLoss };
}

export function nextHungerPenaltyAt(pet) {
  ensurePetSchema(pet);
  if (pet.stats.hunger !== 0 || !pet.survival.hungerZeroAt) return null;
  const zeroAt = new Date(pet.survival.hungerZeroAt).getTime();
  if (!Number.isFinite(zeroAt)) return null;
  return new Date(zeroAt + (pet.survival.hungerPenaltyHoursApplied + 1) * 3_600_000).toISOString();
}

export function actionAvailability(pet, date = new Date()) {
  applyDailyReset(pet, date);
  if (pet.daily.actionsLeft <= 0) return { ok: false, message: '이번 게임 하루의 생활 행동 5회를 모두 사용했습니다.', remainingMs: 0 };
  const nextAt = new Date(pet.daily.nextActionAt ?? 0).getTime();
  const remainingMs = Number.isFinite(nextAt) ? Math.max(0, nextAt - date.getTime()) : 0;
  if (remainingMs > 0) return { ok: false, message: `다음 생활 행동까지 ${Math.ceil(remainingMs / 60_000)}분 남았습니다.`, remainingMs };
  return { ok: true, remainingMs: 0 };
}

function consumeAction(pet, date = new Date()) {
  const available = actionAvailability(pet, date);
  if (!available.ok) return available;
  pet.daily.actionsLeft -= 1;
  pet.daily.nextActionAt = pet.daily.actionsLeft > 0 ? new Date(date.getTime() + ACTION_COOLDOWN_MINUTES * 60_000).toISOString() : null;
  return { ok: true };
}

function lifeActionResult(pet, message, date = new Date()) {
  const goal = incrementGoalCounter(pet, 'life', 1, date);
  normalizePet(pet);
  return { ok: true, message: `${message}${goal.awarded ? ' · 오늘의 생활 목표 달성, 레고력 +1' : ''}`, legoAward: goal };
}

export function workAction(pet, date = new Date()) {
  applyDailyReset(pet, date);
  applyHungerPenalty(pet, date);
  if (pet.stats.stamina < 15) return { ok: false, message: '체력이 부족합니다. 먼저 쉬어주세요.' };
  const action = consumeAction(pet, date);
  if (!action.ok) return action;
  pet.stats.points += WORK_POINTS;
  pet.stats.stamina -= 15;
  pet.stats.hunger -= 10;
  pet.records.works += 1;
  pet.daily.balanceCounts.work += 1;
  pet.records.pointsEarned += WORK_POINTS;
  if (pet.stats.hunger <= 0 && !pet.survival.hungerZeroAt) pet.survival.hungerZeroAt = date.toISOString();
  return lifeActionResult(pet, `일을 해서 ${WORK_POINTS}P를 벌었습니다.`, date);
}

export function restAction(pet, date = new Date()) {
  applyDailyReset(pet, date);
  applyHungerPenalty(pet, date);
  if (pet.stats.stamina >= 90) return { ok: false, message: '체력이 충분해서 지금은 쉴 필요가 없습니다.' };
  const action = consumeAction(pet, date);
  if (!action.ok) return action;
  pet.stats.stamina += 40;
  pet.stats.hunger -= 5;
  pet.records.rests += 1;
  pet.daily.balanceCounts.rest += 1;
  if (pet.stats.hunger <= 0 && !pet.survival.hungerZeroAt) pet.survival.hungerZeroAt = date.toISOString();
  return lifeActionResult(pet, '쉬어서 체력 +40, 배고픔 -5가 적용되었습니다.', date);
}

export function exerciseAction(pet, date = new Date()) {
  applyDailyReset(pet, date);
  applyHungerPenalty(pet, date);
  if (pet.stats.stamina < 20) return { ok: false, message: '체력이 부족해 헬스할 수 없습니다. 먼저 쉬어주세요.' };
  const action = consumeAction(pet, date);
  if (!action.ok) return action;
  pet.stats.stamina -= 20;
  pet.stats.hunger -= 15;
  pet.stats.body -= 2;
  pet.records.workouts += 1;
  pet.daily.balanceCounts.exercise += 1;
  if (pet.stats.hunger <= 0 && !pet.survival.hungerZeroAt) pet.survival.hungerZeroAt = date.toISOString();
  return lifeActionResult(pet, '헬스를 마쳤습니다. 몸집 -2, 체력 -20, 배고픔 -15가 적용되었습니다.', date);
}

export function eatAction(pet, foodId, date = new Date()) {
  applyDailyReset(pet, date);
  applyHungerPenalty(pet, date);
  const food = FOODS[foodId];
  if (!food) return { ok: false, message: '선택할 수 없는 음식입니다.' };
  if (pet.stats.hunger >= 100) return { ok: false, message: '배고픔이 이미 가득 찼습니다.' };
  if (pet.stats.points < food.price) return { ok: false, message: '포인트가 부족합니다.' };
  pet.stats.points -= food.price;
  pet.records.pointsSpent += food.price;
  const beforeHunger = pet.stats.hunger;
  pet.stats.hunger += food.hunger;
  pet.stats.body += food.body;
  const actualRecovery = Math.max(0, Math.min(food.hunger, 100 - beforeHunger));
  pet.records.foods += 1;
  pet.daily.balanceCounts.eat += 1;
  normalizePet(pet);
  return { ok: true, message: `${food.name}을 먹었습니다. ${food.price}P 사용 · 배고픔 +${actualRecovery} · 몸집 +${food.body}` };
}

function removePetFromSocialState(state, pet) {
  for (const [requestId, request] of Object.entries(state.requests ?? {})) {
    if (request.fromPetId === pet.id || request.toPetId === pet.id) delete state.requests[requestId];
  }
  for (const [pairId, pair] of Object.entries(state.pokes ?? {})) {
    if (pair.petIds?.includes(pet.id)) delete state.pokes[pairId];
  }
  for (const challenge of Object.values(state.miniGameChallenges ?? {})) {
    if (challenge.petId === pet.id) challenge.completed = true;
  }
  for (const bung of Object.values(state.bungs ?? {})) {
    if (bung.attendees?.[pet.id]) bung.attendees[pet.id].status = 'left';
    if (bung.hostPetId === pet.id && ['open', 'live'].includes(bung.status)) {
      bung.status = 'cancelled';
      bung.endedAt = nowIso();
    }
  }
  if (state.liarGame?.players?.[pet.id]) {
    state.liarGame.players[pet.id].connected = false;
    state.liarGame.players[pet.id].forfeited = true;
  }
  clearPetTerritory(state, pet.id);
}

export function breakup(state, actorPet, targetPet, date = new Date()) {
  if (!actorPet?.alive || !targetPet?.alive || actorPet.partnerPetId !== targetPet.id || targetPet.partnerPetId !== actorPet.id) {
    return { ok: false, message: '현재 커플 관계가 아닙니다.' };
  }
  actorPet.partnerPetId = null;
  targetPet.partnerPetId = null;
  actorPet.coupleStartedAt = null;
  targetPet.coupleStartedAt = null;
  actorPet.records.breakups += 1;
  targetPet.records.breakups += 1;
  const relation = ensureRelationship(state, actorPet.id, targetPet.id);
  relation.matchedAt = null;
  relation.lastBreakupAt = nowIso(date);
  relation.updatedAt = nowIso(date);
  addNotification(state, targetPet.userId, `${actorPet.displayName}과의 커플 관계가 종료되었습니다.`, 'relationship', { petId: actorPet.id }, date);
  addPublicEvent(state, `${actorPet.displayName}와 ${targetPet.displayName}가 헤어졌습니다.`, 'relationship', [actorPet.id, targetPet.id], date);
  return { ok: true, message: `${targetPet.displayName}와 헤어졌습니다.` };
}

function matingResultText(first, second, compatibility) {
  const groups = compatibility <= 20
    ? [`${first}와 ${second}의 뜨거운 밤이 아무 성과 없이 끝났습니다.`, '둘이 가까워졌지만 레고 결합부가 서로 맞지 않았습니다.', '분위기는 뜨거웠지만 조립 설명서가 달랐습니다.']
    : compatibility <= 50
      ? [`${first}가 체력을 모두 소진했습니다.`, `${first}와 ${second}가 어색한 침묵과 함께 돌아왔습니다.`, '결과는 평범했지만 둘 다 만족한 척하고 있습니다.']
      : compatibility <= 80
        ? [`${first}와 ${second}의 호흡이 제법 잘 맞았습니다.`, '주변 레고들이 두 사람을 수상하게 쳐다봅니다.', '둘의 결합력이 예상보다 강력했습니다.']
        : [`${first}와 ${second}의 궁합이 미쳤습니다.`, '두 레고의 결합력이 설명서 허용 범위를 초과했습니다.', '주변 레고들이 충격에 빠졌습니다.'];
  return groups[Math.floor(Math.random() * groups.length)];
}

export function socialAction(state, actorPet, targetPet, action, extra = {}, date = new Date()) {
  if (!actorPet?.alive || actorPet.integrity?.broken || !targetPet?.alive || targetPet.integrity?.broken || actorPet.id === targetPet.id) return { ok: false, message: '상대 레고를 찾을 수 없습니다.' };
  state.requests ??= {};
  if (action === 'requestMatch') {
    if (actorPet.partnerPetId || targetPet.partnerPetId) return { ok: false, message: '둘 중 한 명이 이미 커플입니다.' };
    const relation = ensureRelationship(state, actorPet.id, targetPet.id);
    const breakupAt = new Date(relation.lastBreakupAt ?? 0).getTime();
    if (Number.isFinite(breakupAt) && date.getTime() - breakupAt < 24 * 60 * 60_000) return { ok: false, message: '같은 상대와는 이별 후 24시간이 지나야 다시 매칭할 수 있습니다.' };
    const duplicate = Object.values(state.requests).some((request) => request.type === 'match' && request.status === 'pending' && new Set([request.fromPetId, request.toPetId]).has(actorPet.id) && new Set([request.fromPetId, request.toPetId]).has(targetPet.id));
    if (duplicate) return { ok: false, message: '이미 두 레고 사이에 처리 중인 매칭 신청이 있습니다.' };
    const request = { id: id('req'), type: 'match', fromPetId: actorPet.id, toPetId: targetPet.id, status: 'pending', createdAt: nowIso(date) };
    state.requests[request.id] = request;
    addNotification(state, targetPet.userId, `${withJosa(actorPet.displayName, '이/가')} 매칭을 신청했습니다.`, 'match', { requestId: request.id, petId: actorPet.id }, date);
    return { ok: true, message: `${targetPet.displayName}에게 매칭을 신청했습니다.` };
  }
  if (action === 'acceptMatch' || action === 'rejectMatch') {
    const request = state.requests[String(extra.requestId ?? '')];
    if (!request || request.type !== 'match' || request.status !== 'pending' || request.toPetId !== actorPet.id || request.fromPetId !== targetPet.id) return { ok: false, message: '유효한 매칭 신청이 아닙니다.' };
    if (action === 'rejectMatch') {
      request.status = 'rejected'; request.respondedAt = nowIso(date);
      addNotification(state, targetPet.userId, `${actorPet.displayName}이 매칭 신청을 거절했습니다.`, 'match', { petId: actorPet.id }, date);
      return { ok: true, message: '매칭 신청을 거절했습니다.' };
    }
    if (actorPet.partnerPetId || targetPet.partnerPetId) return { ok: false, message: '둘 중 한 명이 이미 커플입니다.' };
    request.status = 'accepted'; request.respondedAt = nowIso(date);
    const startedAt = nowIso(date);
    actorPet.partnerPetId = targetPet.id; targetPet.partnerPetId = actorPet.id;
    actorPet.coupleStartedAt = startedAt; targetPet.coupleStartedAt = startedAt;
    actorPet.records.matches += 1; targetPet.records.matches += 1;
    actorPet.records.relationships += 1; targetPet.records.relationships += 1;
    const relation = ensureRelationship(state, actorPet.id, targetPet.id);
    relation.matchedAt = startedAt; relation.updatedAt = startedAt;
    addNotification(state, targetPet.userId, `${actorPet.displayName}이 매칭을 수락했습니다. 커플이 되었습니다.`, 'match', { petId: actorPet.id }, date);
    addPublicEvent(state, `${actorPet.displayName}와 ${targetPet.displayName}가 커플이 되었습니다.`, 'relationship', [actorPet.id, targetPet.id], date);
    return { ok: true, message: `${targetPet.displayName}와 커플이 되었습니다.` };
  }
  if (action === 'breakup') return breakup(state, actorPet, targetPet, date);
  if (action === 'requestMating') {
    const duplicate = Object.values(state.requests).some((request) => request.type === 'mating' && request.status === 'pending' && request.fromPetId === actorPet.id && request.toPetId === targetPet.id);
    if (duplicate) return { ok: false, message: '이미 이 상대에게 처리 중인 교미 신청이 있습니다.' };
    const hungerUse = consumeInteractionHunger(actorPet, date);
    actorPet.records.matingRequests += 1;
    const request = { id: id('req'), type: 'mating', fromPetId: actorPet.id, toPetId: targetPet.id, status: 'pending', createdAt: nowIso(date) };
    state.requests[request.id] = request;
    addNotification(state, targetPet.userId, `${actorPet.displayName}이 교미 신청을 걸었습니다.`, 'mating', { requestId: request.id, petId: actorPet.id }, date);
    return { ok: true, hungerCost: hungerUse.cost, message: `${targetPet.displayName}에게 교미 신청을 보냈습니다. 상대가 수락하거나 거절할 수 있습니다.` };
  }
  if (action === 'acceptMating' || action === 'rejectMating') {
    const request = state.requests[String(extra.requestId ?? '')];
    if (!request || request.type !== 'mating' || request.status !== 'pending' || request.toPetId !== actorPet.id || request.fromPetId !== targetPet.id) return { ok: false, message: '유효한 교미 신청이 아닙니다.' };
    request.status = action === 'acceptMating' ? 'accepted' : 'rejected';
    request.respondedAt = nowIso(date);
    if (action === 'acceptMating') {
      const compatibility = Math.floor(Math.random() * 101);
      const resultText = matingResultText(targetPet.displayName, actorPet.displayName, compatibility);
      const news = `💕 ${targetPet.displayName}와 ${actorPet.displayName}의 궁합도는 ${compatibility}%! ${resultText}`;
      addPublicEvent(state, news, 'mating', [targetPet.id, actorPet.id], date);
      addNotification(state, targetPet.userId, `${actorPet.displayName}이 교미 신청을 수락했습니다. 궁합도 ${compatibility}%`, 'mating', { compatibility }, date);
      return { ok: true, accepted: true, compatibility, resultText, message: `교미 신청을 수락했습니다. 궁합도 ${compatibility}% · ${resultText}` };
    }
    const warned = chance(0.5);
    addNotification(state, targetPet.userId, `${actorPet.displayName}이 교미 신청을 거절했습니다.`, 'mating', { petId: actorPet.id }, date);
    if (warned) {
      targetPet.warnings += 1;
      targetPet.records.warnings += 1;
      addNotification(state, targetPet.userId, `🚨 교미 신청 거절로 경고 1회가 누적되었습니다. 현재 경고 ${targetPet.warnings}회`, 'warning', { popup: true, warnings: targetPet.warnings }, date);
      addPublicEvent(state, `🚨 ${targetPet.displayName}이 ${actorPet.displayName}에게 교미 신청을 거절당해 경고 1회를 받았습니다.`, 'mating', [targetPet.id, actorPet.id], date);
    }
    return { ok: true, accepted: false, warned, message: warned ? `교미 신청을 거절했습니다. 신청자 ${targetPet.displayName}에게 경고 1회가 누적되었습니다.` : '교미 신청을 거절했습니다. 이번에는 신청자에게 경고가 발생하지 않았습니다.' };
  }
  return { ok: false, message: '지원하지 않는 관계 행동입니다.' };
}

export function createBung(state, hostPet, input = {}, date = new Date()) {
  ensurePetSchema(hostPet, date);
  const title = String(input.title ?? '').replace(/\s+/gu, ' ').trim().slice(0, 40);
  const stakePoints = Math.floor(Number(input.stakePoints));
  if (!title) return { ok: false, message: '벙 제목을 입력해주세요.' };
  if (!Number.isInteger(stakePoints) || stakePoints < BUNG_MIN_STAKE) return { ok: false, message: `벙은 최소 ${BUNG_MIN_STAKE}P 이상 걸고 열어야 합니다.` };
  if (hostPet.stats.points < stakePoints) return { ok: false, message: '벙을 열 포인트가 부족합니다.' };
  hostPet.stats.points -= stakePoints;
  hostPet.records.pointsSpent += stakePoints;
  const bung = {
    id: id('bung'), title, hostPetId: hostPet.id, stakePoints,
    status: 'open', createdAt: nowIso(date), startedAt: null, endedAt: null,
    attendees: { [hostPet.id]: { petId: hostPet.id, status: 'joined', joinedAt: nowIso(date), rewarded: false } }
  };
  state.bungs ??= {};
  state.bungs[bung.id] = bung;
  addPublicEvent(state, `${withJosa(hostPet.displayName, '이/가')} '${title}' 벙을 열었습니다.`, 'bung', [hostPet.id], date);
  return { ok: true, message: `${stakePoints}P를 사용해 벙을 열었습니다.`, bung };
}

export function bungSummary(state, bung, viewerPetId) {
  const attendees = Object.values(bung.attendees ?? {})
    .filter((entry) => entry.status !== 'left')
    .map((entry) => ({ petId: entry.petId, displayName: state.pets[entry.petId]?.displayName ?? '사라진 레고', status: entry.status }));
  return {
    id: bung.id, title: bung.title, hostPetId: bung.hostPetId,
    hostDisplayName: state.pets[bung.hostPetId]?.displayName ?? '사라진 레고',
    stakePoints: bung.stakePoints, status: bung.status, createdAt: bung.createdAt,
    startedAt: bung.startedAt, endedAt: bung.endedAt,
    attendees, joined: Boolean(bung.attendees?.[viewerPetId] && bung.attendees[viewerPetId].status !== 'left'),
    isHost: bung.hostPetId === viewerPetId
  };
}

export function visibleBungs(state, viewerPetId) {
  return Object.values(state.bungs ?? {})
    .filter((bung) => bung && ['open', 'live'].includes(bung.status))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map((bung) => bungSummary(state, bung, viewerPetId));
}

export function recentEndedBungs(state, limit = 10) {
  const safeLimit = Math.max(1, Math.min(10, Math.floor(Number(limit) || 10)));
  return Object.values(state.bungs ?? {})
    .filter((bung) => bung?.status === 'ended' && Number.isFinite(new Date(bung.endedAt ?? '').getTime()))
    .sort((a, b) => new Date(b.endedAt) - new Date(a.endedAt))
    .slice(0, safeLimit)
    .map((bung) => ({
      id: bung.id,
      title: bung.title,
      hostDisplayName: state.pets[bung.hostPetId]?.displayName ?? '사라진 레고',
      endedAt: bung.endedAt,
      attendees: Object.values(bung.attendees ?? {})
        .filter((entry) => entry.status === 'completed')
        .sort((a, b) => new Date(a.joinedAt ?? 0) - new Date(b.joinedAt ?? 0))
        .map((entry) => ({ petId: entry.petId, displayName: state.pets[entry.petId]?.displayName ?? '사라진 레고' }))
    }));
}

export function joinBung(state, pet, bung, date = new Date()) {
  if (!bung || bung.status !== 'open') return { ok: false, message: '참가할 수 있는 벙이 아닙니다.' };
  const joinedCount = Object.values(bung.attendees ?? {}).filter((entry) => entry.status !== 'left').length;
  if (joinedCount >= BUNG_MAX_PLAYERS && !bung.attendees?.[pet.id]) return { ok: false, message: '벙 참가 인원이 30명으로 가득 찼습니다.' };
  bung.attendees ??= {};
  bung.attendees[pet.id] = { petId: pet.id, status: 'joined', joinedAt: nowIso(date), rewarded: false };
  return { ok: true, message: `${bung.title}에 참가했습니다.` };
}

export function leaveBung(state, pet, bung, date = new Date()) {
  if (!bung || !bung.attendees?.[pet.id] || bung.attendees[pet.id].status === 'left') return { ok: false, message: '참가 중인 벙이 아닙니다.' };
  if (bung.hostPetId === pet.id && bung.status === 'open') {
    bung.status = 'cancelled';
    bung.endedAt = nowIso(date);
    return { ok: true, message: '벙을 취소했습니다. 개설 포인트는 반환되지 않습니다.' };
  }
  bung.attendees[pet.id].status = 'left';
  bung.attendees[pet.id].leftAt = nowIso(date);
  return { ok: true, message: '벙에서 나갔습니다.' };
}

export function startBung(state, hostPet, bung, date = new Date()) {
  if (!bung || bung.hostPetId !== hostPet.id) return { ok: false, message: '방장만 벙을 시작할 수 있습니다.' };
  if (bung.status !== 'open') return { ok: false, message: '시작할 수 있는 벙이 아닙니다.' };
  const active = Object.values(bung.attendees ?? {}).filter((entry) => entry.status === 'joined');
  if (active.length < BUNG_MIN_PLAYERS || active.length > BUNG_MAX_PLAYERS) return { ok: false, message: '벙은 2명 이상 30명 이하일 때 시작할 수 있습니다.' };
  bung.status = 'live';
  bung.startedAt = nowIso(date);
  for (const entry of active) entry.status = 'live';
  return { ok: true, message: `${bung.title} 벙을 시작했습니다.` };
}

export function finishBung(state, hostPet, bung, date = new Date()) {
  if (!bung || bung.hostPetId !== hostPet.id) return { ok: false, message: '방장만 벙을 끝낼 수 있습니다.' };
  if (bung.status !== 'live') return { ok: false, message: '진행 중인 벙이 아닙니다.' };
  const participants = Object.values(bung.attendees ?? {}).filter((entry) => entry.status === 'live');
  if (participants.length < BUNG_MIN_PLAYERS) return { ok: false, message: '정상 종료 보상은 2명 이상이 끝까지 참가해야 받을 수 있습니다.' };
  bung.status = 'ended';
  bung.endedAt = nowIso(date);
  const rewards = [];
  for (const entry of participants) {
    if (entry.rewarded) continue;
    const pet = state.pets[entry.petId];
    if (!pet?.alive) continue;
    ensurePetSchema(pet, date);
    pet.stats.stamina -= 20;
    const hungerUse = consumeInteractionHunger(pet, date);
    const repeatAward = awardLegoPower(pet, 1, 'bung-complete', date);
    const dailyAward = completeDailyGoal(pet, 'bung', date);
    pet.records.bungs += 1;
    pet.daily.balanceCounts.bung += 1;
    entry.rewarded = true;
    entry.status = 'completed';
    normalizePet(pet);
    rewards.push({ petId: pet.id, displayName: pet.displayName, legoPower: repeatAward.amount + (dailyAward.awarded ? 1 : 0), stamina: -20, hungerCost: hungerUse.cost });
  }
  addPublicEvent(state, `${bung.title} 벙이 ${rewards.length}명 참가로 끝났습니다.`, 'bung', rewards.map((item) => item.petId), date);

  // 종료 기록은 실제로 정상 종료된 최신 10개만 보관한다. 열려 있거나 진행 중인 벙은 건드리지 않는다.
  const endedIds = Object.values(state.bungs ?? {})
    .filter((item) => item?.status === 'ended' && Number.isFinite(new Date(item.endedAt ?? '').getTime()))
    .sort((a, b) => new Date(b.endedAt) - new Date(a.endedAt))
    .map((item) => item.id);
  for (const oldId of endedIds.slice(10)) delete state.bungs[oldId];

  return { ok: true, message: `벙을 끝냈습니다. 참가자 체력 -20, 레고력 +1${rewards.some((item) => item.legoPower > 1) ? ' (첫 오늘 목표 보너스 포함)' : ''}`, rewards };
}

function miniChallengeView(challenge) {
  if (!challenge) return null;
  const view = { ...challenge };
  delete view.target;
  delete view.appleProcessedRequestIds;
  if (Array.isArray(view.appleBoard)) view.appleBoard = view.appleBoard.map((row) => [...row]);
  return view;
}

export function oddEvenPayout(stakeValue, streakValue) {
  const stake = Math.floor(Number(stakeValue));
  const streak = Math.floor(Number(streakValue));
  const percent = ODD_EVEN_PAYOUT_PERCENT[streak];
  if (!Number.isSafeInteger(stake) || stake < ODD_EVEN_MIN_STAKE || stake % ODD_EVEN_STAKE_STEP !== 0 || !percent) return 0;
  return Math.floor((stake * percent) / 100);
}

export function startMiniGame(state, pet, gameId = 'oddEven', date = new Date(), input = {}) {
  applyDailyReset(pet, date);
  applyHungerPenalty(pet, date);
  const game = MINI_GAMES[gameId];
  if (!game) return { ok: false, message: '선택할 수 없는 미니게임입니다.' };
  if (pet.daily.miniGamesPlayed >= MINI_GAMES_PER_DAY) return { ok: false, message: '이번 게임 하루의 미니게임 횟수를 모두 사용했습니다.' };
  const active = Object.values(state.miniGameChallenges ?? {}).find((challenge) => challenge.petId === pet.id && !challenge.completed && new Date(challenge.expiresAt).getTime() > date.getTime());
  if (active) return { ok: false, message: '이미 진행 중인 미니게임이 있습니다.', challenge: miniChallengeView(active) };

  let stake = 0;
  if (gameId === 'oddEven') {
    const requestedStake = input?.stakePoints ?? ODD_EVEN_MIN_STAKE;
    const numericStake = Number(requestedStake);
    if (!Number.isSafeInteger(numericStake) || numericStake < ODD_EVEN_MIN_STAKE || numericStake % ODD_EVEN_STAKE_STEP !== 0) {
      return { ok: false, message: `배팅 포인트는 ${ODD_EVEN_MIN_STAKE}P 이상을 ${ODD_EVEN_STAKE_STEP}P 단위로 입력해주세요.` };
    }
    if (numericStake > pet.stats.points) return { ok: false, message: `보유 포인트가 부족합니다. 현재 ${pet.stats.points}P를 가지고 있습니다.` };
    stake = numericStake;
  }

  const hungerUse = consumeInteractionHunger(pet, date);
  if (gameId === 'oddEven') {
    pet.stats.points -= stake;
    pet.records.pointsSpent += stake;
  }

  const challenge = {
    id: id('mini'), petId: pet.id, gameId, createdAt: nowIso(date),
    expiresAt: gameId === 'apple' ? new Date(date.getTime() + 120_000).toISOString() : new Date(date.getTime() + 10 * 60_000).toISOString(), completed: false,
    streak: 0, pendingPayout: 0, stake,
    readyAt: gameId === 'reaction' ? date.getTime() + 1_500 + Math.floor(Math.random() * 3_500) : null,
    target: gameId === 'number' ? 1 + Math.floor(Math.random() * 100) : null,
    attempts: 0, maxAttempts: gameId === 'number' ? MINI_GAMES.number.maxAttempts : null, guesses: []
  };
  if (gameId === 'apple') Object.assign(challenge, appleChallengeFields(date));
  state.miniGameChallenges ??= {};
  state.miniGameChallenges[challenge.id] = challenge;
  return { ok: true, hungerCost: hungerUse.cost, message: gameId === 'oddEven' ? `${stake}P를 걸고 홀짝을 시작했습니다.` : `${game.name} 시작!`, challenge: miniChallengeView(challenge) };
}

function completeChallenge(pet, challenge, reward, detail, date = new Date()) {
  if (challenge.completed) return { ok: false, message: '이미 정산된 게임입니다.' };
  challenge.completed = true;
  challenge.completedAt = nowIso(date);
  challenge.reward = nonNegativeInt(reward);
  if (reward > 0) {
    pet.stats.points += reward;
    pet.records.pointsEarned += reward;
  }
  pet.daily.miniGamesPlayed += 1;
  pet.daily.balanceCounts.mini += 1;
  pet.records.miniGames += 1;
  if (challenge.gameId === 'apple') {
    normalizeAppleChallenge(challenge);
    if (challenge.appleScore > pet.records.appleBestScore) {
      pet.records.appleBestScore = challenge.appleScore;
      pet.records.appleBestAt = nowIso(date);
    }
  }
  const goal = incrementGoalCounter(pet, 'mini', 1, date);
  normalizePet(pet);
  return { ok: true, finished: true, reward, detail, goalAwarded: goal.awarded, message: `${detail}${reward > 0 ? ` · ${reward}P 획득` : ''}${goal.awarded ? ' · 개인게임 목표 달성, 레고력 +1' : ''}` };
}

export function finishMiniGame(state, pet, challengeId, value, date = new Date()) {
  applyDailyReset(pet, date);
  applyHungerPenalty(pet, date);
  const challenge = state.miniGameChallenges?.[challengeId];
  if (!challenge || challenge.petId !== pet.id || challenge.completed) return { ok: false, message: '유효하지 않은 미니게임입니다.' };
  if (challenge.gameId === 'apple') {
    normalizeAppleChallenge(challenge);
    const expired = new Date(challenge.expiresAt).getTime() <= date.getTime();
    if (!expired && !appleBoardEmpty(challenge)) return { ok: false, message: '사과게임은 2분이 끝나면 자동 정산됩니다.' };
    return completeChallenge(pet, challenge, challenge.applePendingPoints, `사과게임 종료 · ${challenge.appleScore}점 · 숫자 ${challenge.appleRemovedCount}개 제거`, date);
  }
  if (new Date(challenge.expiresAt).getTime() < date.getTime()) {
    challenge.completed = true;
    return { ok: false, message: '미니게임 제한 시간이 지났습니다.' };
  }
  if (challenge.gameId === 'oddEven') {
    const guess = value === 'odd' || value === 'even' ? value : null;
    if (!guess) return { ok: false, message: '홀 또는 짝을 선택해주세요.' };
    const stake = Math.max(ODD_EVEN_MIN_STAKE, Math.floor(Number(challenge.stake) || ODD_EVEN_MIN_STAKE));
    const number = 1 + Math.floor(Math.random() * 10);
    const answer = number % 2 ? 'odd' : 'even';
    if (guess !== answer) {
      const result = completeChallenge(pet, challenge, 0, `숫자 ${number}, 틀렸습니다. 건 ${stake}P를 모두 잃었습니다.`, date);
      return { ...result, correct: false, number, streak: challenge.streak, stake };
    }
    challenge.streak += 1;
    challenge.pendingPayout = oddEvenPayout(stake, challenge.streak);
    if (challenge.streak > pet.records.oddEvenBest) {
      pet.records.oddEvenBest = challenge.streak;
      pet.records.oddEvenBestAt = nowIso(date);
    }
    if (challenge.streak >= 3) {
      const payout = oddEvenPayout(stake, 3);
      const netProfit = payout - stake;
      const result = completeChallenge(pet, challenge, payout, `숫자 ${number}, 3연승 성공. 총 ${payout}P 정산 · 순이익 +${netProfit}P`, date);
      addPublicEvent(state, `${pet.displayName}이 홀짝 3연승으로 순이익 ${netProfit}P를 얻었습니다.`, 'game', [pet.id], date);
      return { ...result, correct: true, number, streak: 3, stake, pendingPayout: payout, netProfit };
    }
    return { ok: true, correct: true, finished: false, number, streak: challenge.streak, stake, pendingPayout: challenge.pendingPayout, message: `맞았습니다. 지금 그만하면 ${challenge.pendingPayout}P를 받습니다.` };
  }
  if (challenge.gameId === 'reaction') {
    const clickedAt = date.getTime();
    if (clickedAt < challenge.readyAt) return completeChallenge(pet, challenge, 0, '신호보다 먼저 눌렀습니다.', date);
    const reactionMs = clickedAt - challenge.readyAt;
    const reward = reactionMs <= 200 ? 100 : reactionMs <= 300 ? 70 : reactionMs <= 450 ? 40 : reactionMs <= 600 ? 20 : 5;
    if (pet.records.bestReactionMs === 0 || reactionMs < pet.records.bestReactionMs) pet.records.bestReactionMs = reactionMs;
    return { ...completeChallenge(pet, challenge, reward, `반응 속도 ${reactionMs}ms`, date), reactionMs };
  }
  if (challenge.gameId === 'number') {
    if (value === null || value === undefined || String(value).trim() === '') return { ok: false, message: '숫자를 입력해주세요.' };
    const guess = Math.round(Number(value));
    if (!Number.isInteger(guess) || guess < 1 || guess > 100) return { ok: false, message: '1부터 100 사이 숫자를 입력해주세요.' };
    challenge.attempts += 1;
    challenge.guesses.push(guess);
    if (guess === challenge.target) {
      const reward = challenge.attempts <= 3 ? 100 : challenge.attempts === 4 ? 70 : 50;
      if (pet.records.numberBestAttempts === 0 || challenge.attempts < pet.records.numberBestAttempts) pet.records.numberBestAttempts = challenge.attempts;
      return { ...completeChallenge(pet, challenge, reward, `${challenge.attempts}번 만에 정답 ${challenge.target}`, date), correct: true, target: challenge.target, attempts: challenge.attempts };
    }
    const hint = guess < challenge.target ? 'UP' : 'DOWN';
    if (challenge.attempts >= challenge.maxAttempts) return { ...completeChallenge(pet, challenge, 0, `기회 소진. 정답은 ${challenge.target}`, date), correct: false, target: challenge.target, hint, attempts: challenge.attempts };
    return { ok: true, finished: false, correct: false, hint, attempts: challenge.attempts, maxAttempts: challenge.maxAttempts, guesses: [...challenge.guesses], message: `${guess}보다 ${hint === 'UP' ? '큽니다' : '작습니다'}. 남은 기회 ${challenge.maxAttempts - challenge.attempts}번` };
  }
  return { ok: false, message: '지원하지 않는 미니게임입니다.' };
}

export function selectAppleGame(state, pet, challengeId, input = {}, requestId = '', date = new Date()) {
  applyDailyReset(pet, date);
  applyHungerPenalty(pet, date);
  const challenge = state.miniGameChallenges?.[challengeId];
  if (!challenge || challenge.petId !== pet.id || challenge.completed || challenge.gameId !== 'apple') return { ok: false, message: '유효한 사과게임이 없습니다.' };
  const result = selectAppleRectangle(challenge, input, requestId, date);
  if (result.expired) return { ...completeChallenge(pet, challenge, challenge.applePendingPoints, `사과게임 종료 · ${challenge.appleScore}점 · 숫자 ${challenge.appleRemovedCount}개 제거`, date), expired: true };
  if (result.ok && appleBoardEmpty(challenge)) return { ...result, ...completeChallenge(pet, challenge, challenge.applePendingPoints, `사과게임 올클리어 · ${challenge.appleScore}점 · 숫자 ${challenge.appleRemovedCount}개 제거`, date), cleared: true };
  return result;
}

export function settleExpiredMiniGames(state, date = new Date()) {
  let changed = false;
  for (const challenge of Object.values(state.miniGameChallenges ?? {})) {
    if (!challenge || challenge.completed || challenge.gameId !== 'apple') continue;
    const expiresAt = new Date(challenge.expiresAt ?? '').getTime();
    if (!Number.isFinite(expiresAt) || expiresAt > date.getTime()) continue;
    const pet = state.pets?.[challenge.petId];
    if (!pet?.alive) { challenge.completed = true; changed = true; continue; }
    ensurePetSchema(pet, date);
    normalizeAppleChallenge(challenge);
    completeChallenge(pet, challenge, challenge.applePendingPoints, `사과게임 종료 · ${challenge.appleScore}점 · 숫자 ${challenge.appleRemovedCount}개 제거`, date);
    changed = true;
  }
  return { changed };
}

export function stopMiniGame(state, pet, challengeId, date = new Date()) {
  const challenge = state.miniGameChallenges?.[challengeId];
  if (!challenge || challenge.petId !== pet.id || challenge.completed || challenge.gameId !== 'oddEven') return { ok: false, message: '그만할 수 있는 홀짝 게임이 없습니다.' };
  if (![1, 2].includes(challenge.streak)) return { ok: false, message: '1연승 또는 2연승 상태에서만 그만할 수 있습니다.' };
  const stake = Math.max(ODD_EVEN_MIN_STAKE, Math.floor(Number(challenge.stake) || ODD_EVEN_MIN_STAKE));
  const payout = oddEvenPayout(stake, challenge.streak);
  const netProfit = payout - stake;
  const detail = `${challenge.streak}연승에서 그만하기. 총 ${payout}P 정산 · 순이익 +${netProfit}P`;
  return { ...completeChallenge(pet, challenge, payout, detail, date), streak: challenge.streak, stake, netProfit };
}

function pickFishingReward() {
  let roll = Math.random() * 100;
  for (const item of FISHING_REWARDS) {
    roll -= item.weight;
    if (roll < 0) return item;
  }
  return FISHING_REWARDS[0];
}

function settleReadyFishing(pet, date = new Date()) {
  ensurePetSchema(pet, date);
  const fishing = pet.daily.fishing;
  if (!fishing) return null;
  const readyAt = new Date(fishing.readyAt).getTime();
  if (!Number.isFinite(readyAt) || readyAt > date.getTime()) return null;
  const reward = FISHING_REWARDS.find((item) => item.id === fishing.resultId) ?? FISHING_REWARDS[0];
  const completed = { fishingId: fishing.id, resultId: reward.id, label: reward.label, reward: reward.reward, completedAt: nowIso(date), announced: false };
  pet.daily.fishing = null;
  pet.daily.lastFishingResult = completed;
  pet.stats.points += reward.reward;
  pet.records.fishing += 1;
  pet.daily.balanceCounts.fishing += 1;
  pet.records.fishingEarned += reward.reward;
  pet.records.pointsEarned += reward.reward;
  const goal = incrementGoalCounter(pet, 'fishing', 1, date);
  normalizePet(pet);
  return { ok: true, autoCompleted: true, result: completed, goalAwarded: goal.awarded, message: reward.reward > 0 ? `${reward.label}을 낚아 ${reward.reward}P 획득${goal.awarded ? ' · 낚시 목표 달성, 레고력 +1' : ''}` : `${reward.label}을 낚았습니다. 꽝${goal.awarded ? ' · 낚시 목표 달성, 레고력 +1' : ''}` };
}

export function settleFishing(pet, date = new Date()) {
  return settleReadyFishing(pet, date);
}

export function startFishing(pet, date = new Date()) {
  applyDailyReset(pet, date);
  applyHungerPenalty(pet, date);
  if (pet.daily.fishing) return { ok: false, message: '이미 낚시 중입니다.' };
  if (pet.daily.fishingPlayed >= FISHING_PER_DAY) return { ok: false, message: `이번 게임 하루의 낚시 ${FISHING_PER_DAY}회를 모두 사용했습니다.` };
  const hungerUse = consumeInteractionHunger(pet, date);
  const reward = pickFishingReward();
  pet.daily.fishingPlayed += 1;
  pet.daily.fishing = {
    id: id('fish'), startedAt: nowIso(date), readyAt: new Date(date.getTime() + FISHING_WAIT_MS).toISOString(), resultId: reward.id, counted: true
  };
  return { ok: true, hungerCost: hungerUse.cost, fishing: structuredClone(pet.daily.fishing), message: '낚시를 시작했습니다. 30초 뒤 자동으로 결과가 나옵니다.' };
}

export function claimFishing(pet, date = new Date()) {
  ensurePetSchema(pet, date);
  if (!pet.daily.fishing) return { ok: false, message: '진행 중인 낚시가 없습니다.' };
  const remaining = new Date(pet.daily.fishing.readyAt).getTime() - date.getTime();
  if (remaining > 0) return { ok: false, message: `아직 낚시 중입니다. ${Math.ceil(remaining / 1000)}초 남았습니다.` };
  return settleReadyFishing(pet, date) ?? { ok: false, message: '낚시 결과를 처리하지 못했습니다.' };
}

export function publishFishingNews(state, pet, date = new Date()) {
  ensurePetSchema(pet, date);
  const result = pet.daily.lastFishingResult;
  if (!result || result.announced) return null;
  result.announced = true;
  if (result.reward < 200) return null;
  return addPublicEvent(state, `${pet.displayName}이 낚시에서 ${result.label}을 낚아 ${result.reward}P를 얻었습니다.`, 'fishing', [pet.id], date);
}

export function updateStatusMessage(pet, value) {
  ensurePetSchema(pet);
  const normalized = normalizedStatusText(value);
  if ([...normalized].length > STATUS_MESSAGE_MAX_LENGTH) {
    return { ok: false, message: `상태메시지는 ${STATUS_MESSAGE_MAX_LENGTH}자 이내로 입력해주세요.` };
  }
  pet.statusMessage = normalized;
  return { ok: true, message: normalized ? '상태메시지를 저장했습니다.' : '상태메시지를 지웠습니다.', statusMessage: normalized };
}

export function statusSentence(pet) {
  ensurePetSchema(pet);
  if (pet.integrity.broken) return '💥 레고가 부숴졌습니다. 다음 세대 레고로 다시 시작해주세요.';
  if (pet.integrity.breakWarnings > 0) return pet.integrity.stageMessage || `파손 경고 ${pet.integrity.breakWarnings}/${BREAK_WARNING_MAX}`;
  if (pet.stats.hunger === 0) return `배고픔 0 · 1시간마다 ${HUNGER_PENALTY_POINTS_PER_HOUR}P 감소`;
  if (pet.stats.stamina <= 20) return '체력이 부족합니다. 쉬기가 필요합니다.';
  return '생활 상태가 안정적입니다.';
}

export function publicProfile(state, targetPetId, viewerPetId, isOnline = false) {
  const pet = state.pets[targetPetId];
  if (!pet?.alive) return null;
  ensurePetSchema(pet);
  const progress = levelProgress(pet.stats.legoPower);
  return {
    id: pet.id, displayName: pet.displayName, generation: pet.generation, createdAt: pet.createdAt,
    statusMessage: pet.statusMessage,
    online: Boolean(isOnline), bodyStage: getBodyStage(pet.stats.body),
    stats: { points: pet.stats.points, stamina: pet.stats.stamina, hunger: pet.stats.hunger, body: pet.stats.body, legoPower: pet.stats.legoPower, level: progress.level },
    warnings: pet.warnings,
    integrity: breakWarningView(pet),
    partnerPetId: pet.partnerPetId,
    coupleStartedAt: pet.coupleStartedAt,
    coupleDay: pet.partnerPetId ? coupleDayCount(pet.coupleStartedAt) : null,
    relationshipLabel: viewerPetId ? relationshipLabel(state, viewerPetId, targetPetId) : null,
    poke: viewerPetId ? pokeStatus(state, viewerPetId, targetPetId) : null
  };
}

export function relationshipLabel(state, viewerPetId, targetPetId) {
  const viewer = state.pets[viewerPetId];
  const target = state.pets[targetPetId];
  if (!viewer || !target) return '알 수 없음';
  if (viewer.partnerPetId === target.id && target.partnerPetId === viewer.id) return '커플';
  const relation = state.relationships?.[relationKey(viewer.id, target.id)];
  return relation?.matchedAt ? '매칭 기록 있음' : '솔로';
}

export function listRelationships(state, petId) {
  const pet = state.pets[petId];
  if (!pet) return [];
  const ids = new Set();
  for (const relation of Object.values(state.relationships ?? {})) if (relation.petIds?.includes(petId)) relation.petIds.forEach((idValue) => { if (idValue !== petId) ids.add(idValue); });
  if (pet.partnerPetId) ids.add(pet.partnerPetId);
  return [...ids]
    .map((otherId) => {
      const other = state.pets[otherId];
      if (!other?.alive || other.integrity?.broken) return null;
      const relation = state.relationships?.[relationKey(petId, otherId)];
      return {
        petId: other.id, displayName: other.displayName, alive: true,
        label: relationshipLabel(state, petId, other.id),
        partner: pet.partnerPetId === other.id,
        coupleDay: pet.partnerPetId === other.id ? coupleDayCount(pet.coupleStartedAt) : null,
        matched: Boolean(relation?.matchedAt)
      };
    })
    .filter(Boolean)
    .sort((a, b) => Number(b.partner) - Number(a.partner) || a.displayName.localeCompare(b.displayName, 'ko'));
}

export function pendingRequestsFor(state, petId) {
  return Object.values(state.requests ?? {})
    .filter((request) => ['match', 'mating'].includes(request.type) && request.toPetId === petId && request.status === 'pending')
    .map((request) => ({ ...request, fromDisplayName: state.pets[request.fromPetId]?.displayName ?? '알 수 없는 레고' }));
}

export function pointRanking(state, limit = 5) {
  return Object.values(state.pets ?? {})
    .filter((pet) => pet?.alive && !pet.integrity?.broken)
    .map((pet) => { ensurePetSchema(pet); return pet; })
    .sort((a, b) => b.stats.points - a.stats.points || new Date(a.createdAt) - new Date(b.createdAt))
    .slice(0, limit)
    .map((pet, index) => ({ rank: index + 1, petId: pet.id, displayName: pet.displayName, points: pet.stats.points }));
}

export function levelRanking(state, limit = 5) {
  return Object.values(state.pets ?? {})
    .filter((pet) => pet?.alive && !pet.integrity?.broken)
    .map((pet) => { ensurePetSchema(pet); return pet; })
    .sort((a, b) => levelForPower(b.stats.legoPower) - levelForPower(a.stats.legoPower) || b.stats.legoPower - a.stats.legoPower || new Date(a.levelReachedAt) - new Date(b.levelReachedAt))
    .slice(0, limit)
    .map((pet, index) => ({ rank: index + 1, petId: pet.id, displayName: pet.displayName, level: levelForPower(pet.stats.legoPower), legoPower: pet.stats.legoPower }));
}

export function coupleRanking(state) {
  const seen = new Set();
  const couples = [];
  for (const pet of Object.values(state.pets ?? {})) {
    if (!pet?.alive || pet.integrity?.broken || !pet.partnerPetId) continue;
    const key = relationKey(pet.id, pet.partnerPetId);
    if (seen.has(key)) continue;
    seen.add(key);
    const partner = state.pets[pet.partnerPetId];
    if (!partner?.alive || partner.integrity?.broken || partner.partnerPetId !== pet.id) continue;
    couples.push({ petIds: [pet.id, partner.id], names: [pet.displayName, partner.displayName], coupleStartedAt: pet.coupleStartedAt, day: coupleDayCount(pet.coupleStartedAt) ?? 1 });
  }
  return couples.sort((a, b) => b.day - a.day || new Date(a.coupleStartedAt) - new Date(b.coupleStartedAt));
}

function appleRanking(state, limit = 5) {
  return Object.values(state.pets ?? {}).filter((pet) => pet?.alive).map((pet) => {
    ensurePetSchema(pet);
    return { petId: pet.id, displayName: pet.displayName, score: pet.records.appleBestScore, achievedAt: pet.records.appleBestAt };
  }).filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || new Date(a.achievedAt ?? 8640000000000000) - new Date(b.achievedAt ?? 8640000000000000) || a.displayName.localeCompare(b.displayName, 'ko'))
    .slice(0, limit).map((item, index) => ({ ...item, rank: index + 1 }));
}

function oddEvenRanking(state, limit = 5) {
  return Object.values(state.pets ?? {}).filter((pet) => pet?.alive).map((pet) => {
    ensurePetSchema(pet);
    return { petId: pet.id, displayName: pet.displayName, streak: pet.records.oddEvenBest, achievedAt: pet.records.oddEvenBestAt };
  }).filter((item) => item.streak > 0)
    .sort((a, b) => b.streak - a.streak || new Date(a.achievedAt ?? 8640000000000000) - new Date(b.achievedAt ?? 8640000000000000) || a.displayName.localeCompare(b.displayName, 'ko'))
    .slice(0, limit).map((item, index) => ({ ...item, rank: index + 1 }));
}

export function rankingsView(state, viewerPetId = null) {
  const oddEvenAll = oddEvenRanking(state, Number.MAX_SAFE_INTEGER);
  const appleAll = appleRanking(state, Number.MAX_SAFE_INTEGER);
  const omokAll = omokRanking(state, Number.MAX_SAFE_INTEGER);
  const mine = (items) => viewerPetId ? items.find((item) => item.petId === viewerPetId) ?? null : null;
  return {
    points: pointRanking(state, 5),
    levels: levelRanking(state, 5),
    couples: coupleRanking(state),
    pokes: pokeRanking(state, 5),
    oddEven: oddEvenAll.slice(0, 5),
    apple: appleAll.slice(0, 5),
    omok: omokAll.slice(0, 5),
    myGameRanks: { oddEven: mine(oddEvenAll), apple: mine(appleAll), omok: mine(omokAll) }
  };
}

export function privateDashboard(state, userId) {
  const user = state.users[userId];
  const pet = user ? state.pets[user.currentPetId] : null;
  if (!user || !pet) return null;
  ensurePetSchema(pet);
  const progress = levelProgress(pet.stats.legoPower);
  return {
    user: { id: user.id, nickname: user.nickname, generation: user.generation },
    pet: {
      id: pet.id, displayName: pet.displayName, generation: pet.generation, createdAt: pet.createdAt,
      statusMessage: pet.statusMessage,
      stats: { ...pet.stats, level: progress.level },
      levelProgress: progress,
      bodyStage: getBodyStage(pet.stats.body),
      warnings: pet.warnings,
      integrity: breakWarningView(pet),
      partnerPetId: pet.partnerPetId,
      coupleStartedAt: pet.coupleStartedAt,
      coupleDay: pet.partnerPetId ? coupleDayCount(pet.coupleStartedAt) : null,
      daily: { ...pet.daily, nextGameDayAt: nextGameDayAt(), goals: dailyGoalView(pet) },
      records: { ...pet.records },
      status: statusSentence(pet)
    }
  };
}

function removePetFromLiar(state, petId) {
  const game = state.liarGame;
  if (!game) return;
  if (game.spectators?.[petId]) delete game.spectators[petId];
  if (!game.players?.[petId]) return;
  game.players[petId].connected = false;
  game.players[petId].forfeited = true;
  game.roundPlayerIds = Array.isArray(game.roundPlayerIds) ? game.roundPlayerIds.filter((idValue) => idValue !== petId) : [];
  game.voteCandidateIds = Array.isArray(game.voteCandidateIds) ? game.voteCandidateIds.filter((idValue) => idValue !== petId) : [];
  delete game.votes?.[petId];
}

export function endLifeAndRestart(state, userId, reason, detail = '', date = new Date()) {
  const user = state.users[userId];
  const oldPet = user ? state.pets[user.currentPetId] : null;
  if (!user || !oldPet) return null;
  ensurePetSchema(oldPet, date);
  if (oldPet.partnerPetId) {
    const partner = state.pets[oldPet.partnerPetId];
    if (partner?.alive && partner.partnerPetId === oldPet.id) {
      partner.partnerPetId = null;
      partner.coupleStartedAt = null;
      addNotification(state, partner.userId, `${oldPet.displayName}의 레고 인생이 끝나 커플 관계도 종료되었습니다.`, 'relationship', { petId: oldPet.id }, date);
    }
  }
  removePetFromSocialState(state, oldPet);
  removePetFromLiar(state, oldPet.id);
  removePetFromOmok(state, oldPet.id, date);
  oldPet.alive = false;
  oldPet.endedAt = nowIso(date);
  oldPet.endReason = reason;
  oldPet.endDetail = detail;
  const generation = Math.max(1, nonNegativeInt(user.generation, 1)) + 1;
  user.generation = generation;
  user.notifications = [];
  const newPet = createPet(user, generation, date);
  user.currentPetId = newPet.id;
  state.pets[newPet.id] = newPet;
  refreshTopPokeNews(state, date);
  addPublicEvent(state, reason === '파손' ? `${oldPet.displayName}이 부숴졌습니다. ${newPet.displayName}으로 다시 시작합니다.` : `${oldPet.displayName}이 ${reason} 처리되었습니다. 모든 것을 잃고 ${newPet.displayName}으로 다시 시작합니다.`, 'restart', [oldPet.id, newPet.id], date);
  return { oldPetId: oldPet.id, newPetId: newPet.id, reason, generation };
}

export function restartBrokenPet(state, userId, date = new Date()) {
  const pet = currentPetForUser(state, userId);
  if (!pet?.alive || !pet.integrity?.broken) return { ok: false, message: '현재 레고는 파손 상태가 아닙니다.' };
  const cause = pet.integrity.cause ? (BREAK_LABELS[pet.integrity.cause] ?? pet.integrity.cause) : '반복된 무리한 생활';
  const result = endLifeAndRestart(state, userId, '파손', `파손 원인: ${cause}`, date);
  return { ok: true, message: `${result.generation}세대 레고로 다시 시작했습니다.`, result };
}

export function applyAutomaticConsequences(state, userId, date = new Date()) {
  const pet = currentPetForUser(state, userId);
  if (!pet?.alive) return { restarted: false };
  ensurePetSchema(pet, date);
  applyHungerPenalty(pet, date);
  return { restarted: false, broken: pet.integrity.broken };
}

export function currentPetForUser(state, userId) {
  const user = state.users[userId];
  return user ? state.pets[user.currentPetId] : null;
}
