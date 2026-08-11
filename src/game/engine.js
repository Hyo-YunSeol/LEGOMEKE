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
  BUNG_MIN_STAKE,
  BUNG_MIN_PLAYERS,
  BUNG_MAX_PLAYERS,
  BODY_STAGES,
  FOODS,
  MINI_GAMES,
  ODD_EVEN_MIN_STAKE,
  ODD_EVEN_PAYOUT_PERCENT,
  ODD_EVEN_STAKE_STEP,
  FISHING_REWARDS,
  SHOP_ITEMS,
  FLEX_ITEMS,
  LOTTERY_REWARDS,
  REACTION_MIN_VALID_MS,
  REACTION_CLOCK_TOLERANCE_MS,
  REACTION_MAX_NETWORK_GAP_MS
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
import {
  applyTimedEffects,
  consumeHunger,
  consumeInteractionHunger,
  consumeStamina,
  lifeHungerCostsForBody,
  restoreStamina,
  timedEffectActive
} from './activity.js';
import { appleBoardEmpty, refreshAppleBoard, appleChallengeFields, normalizeAppleChallenge, requestAppleNewBoard, selectAppleRectangle } from './apple-game.js';
import { blockChallengeFields, normalizeBlockChallenge, selectBlockGroup } from './block-game.js';
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

export function dailyMiniGameLimit(pet) {
  return MINI_GAMES_PER_DAY + Math.min(10_000, nonNegativeInt(pet?.daily?.miniGameBonus));
}

export function dailyFishingLimit(pet) {
  return FISHING_PER_DAY + Math.min(10_000, nonNegativeInt(pet?.daily?.fishingBonus));
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
  pet.schemaVersion = 14;
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
  pet.daily.miniGameBonus = Math.min(10_000, nonNegativeInt(pet.daily.miniGameBonus));
  pet.daily.fishingBonus = Math.min(10_000, nonNegativeInt(pet.daily.fishingBonus));
  delete pet.daily.miniGameTicketBought;
  delete pet.daily.fishingTicketBought;
  pet.daily.lotteryPlays = clamp(pet.daily.lotteryPlays, 0, SHOP_ITEMS.lottery.maxPlays);
  pet.daily.lastLotteryResult = pet.daily.lastLotteryResult && typeof pet.daily.lastLotteryResult === 'object' && !Array.isArray(pet.daily.lastLotteryResult)
    ? {
      prize: nonNegativeInt(pet.daily.lastLotteryResult.prize),
      cost: nonNegativeInt(pet.daily.lastLotteryResult.cost),
      playedAt: Number.isFinite(new Date(pet.daily.lastLotteryResult.playedAt ?? '').getTime()) ? new Date(pet.daily.lastLotteryResult.playedAt).toISOString() : date.toISOString()
    }
    : null;
  pet.daily.miniGamesPlayed = clamp(pet.daily.miniGamesPlayed, 0, dailyMiniGameLimit(pet));
  pet.daily.fishingPlayed = clamp(pet.daily.fishingPlayed, 0, dailyFishingLimit(pet));
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
  applyTimedEffects(pet, date);

  // 제거된 과거 파손 시스템 필드는 로드 시 즉시 폐기한다.
  delete pet.integrity;

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
    seasonBestReactionMs: 0,
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
    omokLosses: 0,
    shopPurchases: 0,
    lotteryPlays: 0,
    lotteryEarned: 0
  };
  for (const [key, fallback] of Object.entries(defaults)) pet.records[key] = Math.max(key === 'days' ? 1 : 0, nonNegativeInt(pet.records[key], fallback));
  pet.records.oddEvenBestAt = Number.isFinite(new Date(pet.records.oddEvenBestAt ?? '').getTime()) ? new Date(pet.records.oddEvenBestAt).toISOString() : null;
  pet.records.seasonBestReactionAt = Number.isFinite(new Date(pet.records.seasonBestReactionAt ?? '').getTime()) ? new Date(pet.records.seasonBestReactionAt).toISOString() : null;
  pet.records.appleBestAt = Number.isFinite(new Date(pet.records.appleBestAt ?? '').getTime()) ? new Date(pet.records.appleBestAt).toISOString() : null;
  for (const key of ['skips', 'soloBungs', 'bungImpressionsUp', 'bungImpressionsDown', 'bungImpressionsReceivedUp', 'bungImpressionsReceivedDown', 'rumorsSpread', 'rumorsHeard', 'rumorsCreated', 'villainActs', 'noShows', 'earned', 'spent', 'maxDebt', 'charmEarned', 'offspring', 'privateBungs', 'matings', 'dates']) delete pet.records[key];

  pet.warnings = nonNegativeInt(pet.warnings);
  pet.partnerPetId = pet.partnerPetId ? String(pet.partnerPetId) : null;
  const coupleStartedAt = new Date(pet.coupleStartedAt ?? '').getTime();
  pet.coupleStartedAt = pet.partnerPetId && Number.isFinite(coupleStartedAt) ? new Date(coupleStartedAt).toISOString() : null;
  pet.levelReachedAt = Number.isFinite(new Date(pet.levelReachedAt ?? '').getTime()) ? new Date(pet.levelReachedAt).toISOString() : pet.createdAt ?? nowIso(date);
  pet.flags = pet.flags && typeof pet.flags === 'object' && !Array.isArray(pet.flags) ? pet.flags : {};
  pet.flags.removedFromLiar = Boolean(pet.flags.removedFromLiar);
  // v6.5.3 이전의 꾸미기 상점 데이터는 폐기하고, v6.7.0 플렉스 아이템만 별도로 정규화한다.
  delete pet.cosmetics;
  delete pet.cosmeticExpiryNotices;
  const rawFlexItem = pet.flexItem && typeof pet.flexItem === 'object' && !Array.isArray(pet.flexItem) ? pet.flexItem : null;
  const flexDefinition = FLEX_ITEMS[String(rawFlexItem?.itemId ?? '')];
  const flexPurchasedAt = new Date(rawFlexItem?.purchasedAt ?? '').getTime();
  const flexExpiresAt = new Date(rawFlexItem?.expiresAt ?? '').getTime();
  pet.flexItem = flexDefinition && Number.isFinite(flexPurchasedAt) && Number.isFinite(flexExpiresAt) && flexExpiresAt > date.getTime()
    ? {
      itemId: flexDefinition.id,
      purchasedAt: new Date(flexPurchasedAt).toISOString(),
      expiresAt: new Date(flexExpiresAt).toISOString()
    }
    : null;
  pet.seasonBadges = pet.seasonBadges && typeof pet.seasonBadges === 'object' && !Array.isArray(pet.seasonBadges) ? pet.seasonBadges : {};
  for (const key of ['reaction','apple','omok']) { const t = new Date(pet.seasonBadges[key] ?? '').getTime(); pet.seasonBadges[key] = Number.isFinite(t) ? new Date(t).toISOString() : null; }
  normalizePet(pet, date);
  return pet;
}

export function normalizePet(pet, date = new Date()) {
  applyTimedEffects(pet, date);
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
    schemaVersion: 14,
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
      miniGameBonus: 0,
      fishingBonus: 0,
      lotteryPlays: 0,
      lastLotteryResult: null,
      fishing: null,
      lastFishingResult: null,
      interactionKeys: [],
      balanceCounts: { work: 0, rest: 0, exercise: 0, eat: 0, bung: 0, mini: 0, fishing: 0 },
      goalCounters: { life: 0, mini: 0, fishing: 0, mating: 0, poke: 0 },
      legoGoals: Object.fromEntries(DAILY_LEGO_GOALS.map((goal) => [goal.key, false]))
    },
    survival: { hungerZeroAt: null, hungerPenaltyHoursApplied: 0 },
    effects: { staminaFullUntil: null, hungerFullUntil: null },
    flexItem: null,
    records: {
      days: 1, works: 0, rests: 0, workouts: 0, foods: 0, bungs: 0,
      relationships: 0, breakups: 0, warnings: 0,
      pointsEarned: 0, pointsSpent: 0, pointsLostToHunger: 0, maxPoints: 0,
      maxBody: STARTING_BODY, maxLevel: 1, legoPowerEarned: 0,
      miniGames: 0, oddEvenBest: 0, oddEvenBestAt: null, bestReactionMs: 0,
    seasonBestReactionMs: 0, seasonBestReactionAt: null, numberBestAttempts: 0,
      fishing: 0, fishingEarned: 0, pokesSent: 0, pokesReceived: 0,
      matches: 0, matingRequests: 0, liarGames: 0, liarWins: 0, liarPointsWon: 0,
      territoryClaims: 0, territorySteals: 0, territoryWins: 0,
      appleBestScore: 0, appleBestAt: null, omokWins: 0, omokDraws: 0, omokLosses: 0,
      shopPurchases: 0, lotteryPlays: 0, lotteryEarned: 0
    },
    warnings: 0,
    partnerPetId: null,
    coupleStartedAt: null,
    levelReachedAt: date.toISOString(),
    seasonBadges: { reaction:null, apple:null, omok:null },
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
  if (!actorPet?.alive || !targetPet?.alive || actorPet.id === targetPet.id) return { ok: false, message: '상대 레고를 찾을 수 없습니다.' };
  const pair = ensurePokePair(state, actorPet.id, targetPet.id);
  if (pair.lastActorPetId === actorPet.id) return { ok: false, message: '상대가 되찌르기 전에는 다시 찌를 수 없습니다.' };
  pair.counts[actorPet.id] += 1;
  pair.total = pair.counts[pair.petIds[0]] + pair.counts[pair.petIds[1]];
  pair.lastActorPetId = actorPet.id;
  pair.updatedAt = nowIso(date);
  actorPet.records.pokesSent += 1;
  targetPet.records.pokesReceived += 1;
  const pokeGoal = incrementGoalCounter(actorPet, 'poke', 1, date);
  addNotification(state, targetPet.userId, `${withJosa(actorPet.displayName, '이/가')} 찔렀습니다. 서로 총 ${pair.total}회`, 'poke', { petId: actorPet.id, pairId: pair.id }, date);
  refreshTopPokeNews(state, date);
  return { ok: true, message: `${targetPet.displayName}을 찔렀습니다. 서로 총 ${pair.total}회${pokeGoal.awarded ? ' · 찌르기 목표 달성, 레고력 +1' : ''}`, goalAwarded: pokeGoal.awarded, poke: pokeStatus(state, actorPet.id, targetPet.id) };
}

export function pokeRanking(state, limit = 5) {
  return Object.values(state.pokes ?? {})
    .filter((pair) => pair && Array.isArray(pair.petIds) && pair.petIds.length === 2)
    .map((pair) => {
      const [a, b] = pair.petIds;
      const first = state.pets[a];
      const second = state.pets[b];
      const total = nonNegativeInt(pair.counts?.[a]) + nonNegativeInt(pair.counts?.[b]);
      return first?.alive && second?.alive && nonNegativeInt(pair.counts?.[a]) > 0 && nonNegativeInt(pair.counts?.[b]) > 0
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

// 레고 파손 시스템은 v6.5.0에서 완전히 제거되었습니다. 기존 저장 필드는 마이그레이션 호환용으로만 정규화합니다.

export function applyDailyReset(pet, date = new Date(), state = null) {
  ensurePetSchema(pet, date);
  const fishingResult = settleReadyFishing(pet, date);
  const current = gameDayKey(date);
  if (pet.daily.date === current) return { changed: Boolean(fishingResult), days: 0, fishingResult };
  const diff = Math.max(1, gameDaysBetweenKeys(pet.daily.date, current));
  const balance = { changed: false };
  pet.daily.date = current;
  pet.daily.actionsLeft = ACTIONS_PER_DAY;
  pet.daily.nextActionAt = null;
  pet.daily.miniGamesPlayed = 0;
  pet.daily.fishingPlayed = 0;
  pet.daily.miniGameBonus = 0;
  pet.daily.fishingBonus = 0;
  pet.daily.lotteryPlays = 0;
  pet.daily.lastLotteryResult = null;
  pet.daily.interactionKeys = [];
  pet.daily.balanceCounts = { work: 0, rest: 0, exercise: 0, eat: 0, bung: 0, mini: 0, fishing: 0 };
  resetDailyProgress(pet);
  pet.records.days += diff;
  normalizePet(pet, date);
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
  normalizePet(pet, date);
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
  normalizePet(pet, date);
  return { ok: true, message: `${message}${goal.awarded ? ' · 오늘의 생활 목표 달성, 레고력 +1' : ''}`, legoAward: goal };
}

export function workAction(pet, date = new Date()) {
  applyDailyReset(pet, date);
  applyHungerPenalty(pet, date);
  if (pet.stats.stamina < 15) return { ok: false, message: '체력이 부족합니다. 먼저 쉬어주세요.' };
  const action = consumeAction(pet, date);
  if (!action.ok) return action;
  pet.stats.points += WORK_POINTS;
  const staminaUse = consumeStamina(pet, 15, date);
  const hungerCosts = lifeHungerCostsForBody(pet.stats.body);
  const hungerUse = consumeHunger(pet, hungerCosts.work, date);
  pet.records.works += 1;
  pet.daily.balanceCounts.work += 1;
  pet.records.pointsEarned += WORK_POINTS;
  const staminaText = staminaUse.maintained ? '체력 100 유지' : `체력 -${staminaUse.deducted}`;
  const hungerText = hungerUse.maintained ? '배고픔 100 유지' : `배고픔 -${hungerUse.deducted}`;
  return lifeActionResult(pet, `일을 해서 ${WORK_POINTS}P를 벌었습니다. ${staminaText} · ${hungerText}`, date);
}

export function restAction(pet, date = new Date()) {
  applyDailyReset(pet, date);
  applyHungerPenalty(pet, date);
  if (pet.stats.stamina >= 90) return { ok: false, message: '체력이 충분해서 지금은 쉴 필요가 없습니다.' };
  const action = consumeAction(pet, date);
  if (!action.ok) return action;
  const staminaRestore = restoreStamina(pet, 40, date);
  const hungerCosts = lifeHungerCostsForBody(pet.stats.body);
  const hungerUse = consumeHunger(pet, hungerCosts.rest, date);
  pet.records.rests += 1;
  pet.daily.balanceCounts.rest += 1;
  const staminaText = staminaRestore.maintained ? '체력 100 유지' : `체력 +${staminaRestore.restored}`;
  const hungerText = hungerUse.maintained ? '배고픔 100 유지' : `배고픔 -${hungerUse.deducted}`;
  return lifeActionResult(pet, `쉬어서 ${staminaText} · ${hungerText}가 적용되었습니다.`, date);
}

export function exerciseAction(pet, date = new Date()) {
  applyDailyReset(pet, date);
  applyHungerPenalty(pet, date);
  if (pet.stats.stamina < 20) return { ok: false, message: '체력이 부족해 헬스할 수 없습니다. 먼저 쉬어주세요.' };
  const action = consumeAction(pet, date);
  if (!action.ok) return action;
  const staminaUse = consumeStamina(pet, 20, date);
  const hungerCosts = lifeHungerCostsForBody(pet.stats.body);
  const hungerUse = consumeHunger(pet, hungerCosts.exercise, date);
  const beforeBody = pet.stats.body;
  pet.stats.body = normalizeBody(pet.stats.body - 2, STARTING_BODY);
  const bodyDelta = pet.stats.body - beforeBody;
  pet.records.workouts += 1;
  pet.daily.balanceCounts.exercise += 1;
  const staminaText = staminaUse.maintained ? '체력 100 유지' : `체력 -${staminaUse.deducted}`;
  const hungerText = hungerUse.maintained ? '배고픔 100 유지' : `배고픔 -${hungerUse.deducted}`;
  const bodyText = bodyDelta < 0 ? `몸집 ${bodyDelta}` : '몸집 변화 없음';
  return lifeActionResult(pet, `헬스를 마쳤습니다. ${bodyText} · ${staminaText} · ${hungerText}`, date);
}

export function eatAction(pet, foodId, date = new Date()) {
  applyDailyReset(pet, date);
  applyHungerPenalty(pet, date);
  const food = FOODS[foodId];
  if (!food) return { ok: false, message: '선택할 수 없는 음식입니다.' };
  const currentLevel = levelForPower(pet.stats.legoPower);
  if (currentLevel < food.minLevel) return { ok: false, message: `Lv.${food.minLevel}부터 먹을 수 있는 음식입니다.` };
  if (pet.stats.hunger >= 100) return { ok: false, message: '배고픔이 이미 가득 찼습니다.' };
  if (pet.stats.points < food.price) return { ok: false, message: '포인트가 부족합니다.' };
  pet.stats.points -= food.price;
  pet.records.pointsSpent += food.price;
  const beforeHunger = pet.stats.hunger;
  const beforeBody = pet.stats.body;
  pet.stats.hunger += food.hunger;
  pet.stats.body += food.body;
  pet.records.foods += 1;
  pet.daily.balanceCounts.eat += 1;
  normalizePet(pet, date);
  const actualRecovery = pet.stats.hunger - beforeHunger;
  const bodyDelta = pet.stats.body - beforeBody;
  const bodyText = bodyDelta > 0 ? `몸집 +${bodyDelta}` : bodyDelta < 0 ? `몸집 ${bodyDelta}` : '몸집 변화 없음';
  return {
    ok: true,
    foodId: food.id,
    hungerRecovery: actualRecovery,
    bodyDelta,
    bodyStage: getBodyStage(pet.stats.body),
    message: `${withJosa(food.name, '을/를')} 먹었습니다. ${food.price}P 사용 · 배고픔 +${actualRecovery} · ${bodyText}`
  };
}

function normalizedTemporaryNickname(value) {
  return String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function temporaryNicknameError(value) {
  const nickname = normalizedTemporaryNickname(value);
  const length = [...nickname].length;
  if (length < 2 || length > 12) return '임시 닉네임은 2~12자로 입력해주세요.';
  if (!/^[가-힣a-zA-Z0-9 _-]+$/.test(nickname)) return '임시 닉네임에는 한글, 영문, 숫자, 공백, _, -만 사용할 수 있습니다.';
  return null;
}

function updateConnectedDisplayNames(state, pet) {
  const liarPlayer = state.liarGame?.players?.[pet.id];
  if (liarPlayer) liarPlayer.displayName = pet.displayName;
  const liarSpectator = state.liarGame?.spectators?.[pet.id];
  if (liarSpectator) liarSpectator.displayName = pet.displayName;
  for (const room of Object.values(state.omok?.rooms ?? {})) {
    if (room?.spectators?.[pet.id]) room.spectators[pet.id].displayName = pet.displayName;
  }
}

export function syncTemporaryNickname(state, user, date = new Date()) {
  if (!user || !state?.pets) return { changed: false, active: false };
  const pet = state.pets[user.currentPetId];
  if (!pet?.alive) return { changed: false, active: false };
  const temporary = user.temporaryNickname && typeof user.temporaryNickname === 'object' && !Array.isArray(user.temporaryNickname)
    ? user.temporaryNickname
    : null;
  const expiresAt = new Date(temporary?.expiresAt ?? '').getTime();
  const nickname = normalizedTemporaryNickname(temporary?.nickname);
  const active = !temporaryNicknameError(nickname) && Number.isFinite(expiresAt) && expiresAt > date.getTime();
  const beforeTemporary = user.temporaryNickname;
  if (active) {
    user.temporaryNickname = { nickname, expiresAt: new Date(expiresAt).toISOString() };
  } else {
    user.temporaryNickname = null;
  }
  const nextDisplayName = petDisplayName(active ? nickname : user.nickname, pet.generation);
  const changed = pet.displayName !== nextDisplayName || Boolean(beforeTemporary) !== Boolean(user.temporaryNickname)
    || (active && (beforeTemporary?.nickname !== nickname || beforeTemporary?.expiresAt !== user.temporaryNickname.expiresAt));
  pet.displayName = nextDisplayName;
  if (changed) updateConnectedDisplayNames(state, pet);
  return {
    changed,
    active,
    nickname: active ? nickname : null,
    expiresAt: active ? user.temporaryNickname.expiresAt : null
  };
}

function nicknameTaken(state, userId, nickname, date = new Date()) {
  const lowered = nickname.toLocaleLowerCase('ko');
  return Object.values(state.users ?? {}).some((candidate) => {
    if (!candidate || candidate.id === userId) return false;
    if (String(candidate.nickname ?? '').toLocaleLowerCase('ko') === lowered) return true;
    const expiresAt = new Date(candidate.temporaryNickname?.expiresAt ?? '').getTime();
    return Number.isFinite(expiresAt) && expiresAt > date.getTime()
      && normalizedTemporaryNickname(candidate.temporaryNickname?.nickname).toLocaleLowerCase('ko') === lowered;
  });
}

function secureRandomUnit() {
  if (globalThis.crypto?.getRandomValues) {
    const value = new Uint32Array(1);
    globalThis.crypto.getRandomValues(value);
    return value[0] / 0x1_0000_0000;
  }
  return Math.random();
}

export function pickLotteryPrize(random = secureRandomUnit) {
  const totalWeight = LOTTERY_REWARDS.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.max(0, Math.min(0.999999999, Number(random()) || 0)) * totalWeight;
  for (const item of LOTTERY_REWARDS) {
    roll -= item.weight;
    if (roll < 0) return item.points;
  }
  return 0;
}

export function shopStateView(user, pet, date = new Date()) {
  ensurePetSchema(pet, date);
  const temporary = syncTemporaryNickname({ users: { [user.id]: user }, pets: { [pet.id]: pet }, liarGame: null, omok: null }, user, date);
  const staminaActive = timedEffectActive(pet, 'staminaFullUntil', date);
  const hungerActive = timedEffectActive(pet, 'hungerFullUntil', date);
  return {
    miniGameBonus: nonNegativeInt(pet.daily.miniGameBonus),
    fishingBonus: nonNegativeInt(pet.daily.fishingBonus),
    miniGamesLimit: dailyMiniGameLimit(pet),
    fishingLimit: dailyFishingLimit(pet),
    lotteryPlays: clamp(pet.daily.lotteryPlays, 0, SHOP_ITEMS.lottery.maxPlays),
    lotteryMaxPlays: SHOP_ITEMS.lottery.maxPlays,
    lotteryNextPrice: pet.daily.lotteryPlays < SHOP_ITEMS.lottery.maxPlays
      ? (pet.daily.lotteryPlays === 0 ? SHOP_ITEMS.lottery.price : SHOP_ITEMS.lottery.retryPrice)
      : null,
    lastLotteryResult: pet.daily.lastLotteryResult ? { ...pet.daily.lastLotteryResult } : null,
    temporaryNickname: temporary.active ? { nickname: temporary.nickname, expiresAt: temporary.expiresAt, originalNickname: user.nickname } : null,
    flexItem: flexItemView(pet, date),
    effects: {
      staminaFullUntil: staminaActive ? pet.effects.staminaFullUntil : null,
      hungerFullUntil: hungerActive ? pet.effects.hungerFullUntil : null
    }
  };
}

function rememberShopOperation(state, requestId, user, pet, itemId, result, date) {
  state.shopOperations ??= {};
  state.shopOperations[requestId] = {
    id: requestId,
    userId: user.id,
    petId: pet.id,
    itemId,
    result: structuredClone(result),
    createdAt: date.toISOString()
  };
}

export function purchaseShopItem(state, user, pet, itemIdValue, input = {}, requestIdValue = '', date = new Date(), random = secureRandomUnit) {
  applyDailyReset(pet, date);
  applyHungerPenalty(pet, date);
  syncTemporaryNickname(state, user, date);
  const itemId = String(itemIdValue ?? '').trim();
  const item = SHOP_ITEMS[itemId] ?? FLEX_ITEMS[itemId];
  if (!item) return { ok: false, message: '선택할 수 없는 상점 상품입니다.' };
  const requestId = String(requestIdValue ?? '').trim();
  if (!/^[A-Za-z0-9._:-]{8,120}$/.test(requestId)) return { ok: false, message: '유효한 구매 요청 ID가 필요합니다.' };

  state.shopOperations ??= {};
  const previous = state.shopOperations[requestId];
  if (previous) {
    if (previous.userId !== user.id || previous.itemId !== itemId) return { ok: false, message: '이미 다른 구매에 사용된 요청 ID입니다.' };
    return { ...structuredClone(previous.result), duplicate: true, globalRefresh: false };
  }

  let price = item.price;
  let nickname = null;
  if (itemId === 'lottery') {
    if (pet.daily.lotteryPlays >= item.maxPlays) return { ok: false, message: `하루 복권은 이번 게임 하루에 최대 ${item.maxPlays}회만 구매할 수 있습니다.` };
    price = pet.daily.lotteryPlays === 0 ? item.price : item.retryPrice;
  }
  if (itemId === 'nickname24h') {
    if (user.temporaryNickname) return { ok: false, message: '이미 24시간 임시 닉네임을 사용 중입니다.' };
    nickname = normalizedTemporaryNickname(input.nickname);
    const error = temporaryNicknameError(nickname);
    if (error) return { ok: false, message: error };
    if (nickname.toLocaleLowerCase('ko') === String(user.nickname).toLocaleLowerCase('ko')) return { ok: false, message: '기존 닉네임과 다른 닉네임을 입력해주세요.' };
    if (nicknameTaken(state, user.id, nickname, date)) return { ok: false, message: '이미 사용 중인 닉네임입니다.' };
  }
  if (itemId === 'staminaHour' && timedEffectActive(pet, 'staminaFullUntil', date)) return { ok: false, message: '이미 체력 100% 유지권을 사용 중입니다.' };
  if (itemId === 'hungerHour' && timedEffectActive(pet, 'hungerFullUntil', date)) return { ok: false, message: '이미 배고픔 100% 유지권을 사용 중입니다.' };
  if (pet.stats.points < price) return { ok: false, message: `포인트가 부족합니다. ${price}P가 필요합니다.` };

  pet.stats.points -= price;
  pet.records.pointsSpent += price;
  pet.records.shopPurchases += 1;
  let message = `${item.name} 구매 완료 · ${price}P 사용`;
  let prize = null;
  let globalRefresh = false;

  if (itemId === 'miniGame10') {
    pet.daily.miniGameBonus = Math.min(10_000, pet.daily.miniGameBonus + 10);
    message = `미니게임 이용 가능 횟수가 이번 게임 하루에 +10회 늘었습니다. 현재 한도 ${dailyMiniGameLimit(pet)}회`;
  } else if (itemId === 'fishing5') {
    pet.daily.fishingBonus = Math.min(10_000, pet.daily.fishingBonus + 5);
    message = `낚시 이용 가능 횟수가 이번 게임 하루에 +5회 늘었습니다. 현재 한도 ${dailyFishingLimit(pet)}회`;
  } else if (itemId === 'nickname24h') {
    user.temporaryNickname = { nickname, expiresAt: new Date(date.getTime() + 24 * 60 * 60_000).toISOString() };
    syncTemporaryNickname(state, user, date);
    message = `${nickname} 닉네임을 24시간 동안 사용합니다. 만료 후 ${user.nickname}(으)로 자동 복귀합니다.`;
    globalRefresh = true;
  } else if (itemId === 'lottery') {
    prize = pickLotteryPrize(random);
    pet.daily.lotteryPlays += 1;
    pet.daily.lastLotteryResult = { prize, cost: price, playedAt: date.toISOString() };
    pet.records.lotteryPlays += 1;
    if (prize > 0) {
      pet.stats.points += prize;
      pet.records.pointsEarned += prize;
      pet.records.lotteryEarned += prize;
      message = `복권 당첨! ${prize.toLocaleString('ko-KR')}P를 받았습니다.`;
      if (prize >= 1000) {
        addPublicEvent(state, `${pet.displayName}이 하루 복권에서 ${prize.toLocaleString('ko-KR')}P에 당첨됐습니다.`, 'lottery', [pet.id], date);
        globalRefresh = true;
      }
    } else message = '복권 결과는 꽝입니다. 다음 기회를 노려보세요.';
  } else if (itemId === 'staminaHour') {
    pet.effects.staminaFullUntil = new Date(date.getTime() + 60 * 60_000).toISOString();
    pet.stats.stamina = 100;
    message = '체력이 100%가 되었고 1시간 동안 100%로 유지됩니다.';
  } else if (itemId === 'hungerHour') {
    pet.effects.hungerFullUntil = new Date(date.getTime() + 60 * 60_000).toISOString();
    pet.stats.hunger = 100;
    pet.survival.hungerZeroAt = null;
    pet.survival.hungerPenaltyHoursApplied = 0;
    message = '배고픔이 100%가 되었고 1시간 동안 100%로 유지됩니다.';
  } else if (FLEX_ITEMS[itemId]) {
    const expiresAt = new Date(date.getTime() + 24 * 60 * 60_000).toISOString();
    pet.flexItem = { itemId, purchasedAt: date.toISOString(), expiresAt };
    message = `${item.name}을 24시간 동안 장착합니다.`;
    globalRefresh = true;
    if (item.tier >= 3) addPublicEvent(state, `${pet.displayName}이 ${item.name}을 장착했습니다.`, 'flex-item', [pet.id], date);
  }

  normalizePet(pet, date);
  const result = { ok: true, itemId, price, prize, message, globalRefresh, shop: shopStateView(user, pet, date) };
  rememberShopOperation(state, requestId, user, pet, itemId, result, date);
  return result;
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
  const groups = compatibility <= 10 ? [
    `${first}와 ${second}는 내용이 있었는데 없었습니다.`,
    `어라..? ${second}가 눈을 뜨니 ${first}는 이미 퇴실했습니다.`,
    'M텔비를 누가 더 손해 봤는지 계산 중입니다.',
    `${first}와 ${second}가 M텔에 들어갔지만 대실 시간이 6시간 47분 남았습니다.`,
    `${second}가 끝난 줄 모르고 ${first}에게 “이제 시작하는 거야?”라고 물었습니다.`
  ] : compatibility <= 20 ? [
    `${first}만 체력을 모두 소진했습니다. ${second}는 아직 시작도 안 했는데..`,
    `${first}가 끝나고 ${second}에게 “괜찮았지?”만 세 번 물었습니다.`,
    `${second}가 집에 도착하자마자 ${first}에게 정산을 요청했습니다.`,
    `${first}와 ${second} 사이에 갑자기 존댓말이 생겼습니다.`,
    `${first}가 다음 날 “어제 좋았어”라고 보냈는데 카톡에는 👍의 흔적만 남았습니다.`
  ] : compatibility <= 30 ? [
    `${second}가 만족했냐는 ${first}의 질문에 “그래도 침대는 편하더라”라고 대답했습니다.`,
    `${first}가 “한 번 더 할까?”라고 물었는데 ${second}가 갑자기 코를 골기 시작했습니다.`,
    `${first}가 “다음에는 진짜 잘할 수 있어”라고 했는데 ${second}가 “다음이 왜 있어?”라고 물었습니다.`,
    `${first}가 “어땠어?”라고 묻자 ${second}가 천장을 보며 “여기 와이파이 비밀번호 뭐야?”라고 물었습니다.`,
    `${first}가 “우리 오늘 있었던 일은 비밀이지?”라고 묻자 ${second}가 “말할 만한 일이 있었어?”라고 되물었습니다.`
  ] : compatibility <= 40 ? [
    `${second}가 “원래 이렇게 빨리 끝나?”라고 묻자 ${first}가 술 때문이라고 해명했습니다.`,
    `${first}와 ${second}가 한 번 더 도전할지 그냥 술을 마실지 회의 중입니다.`,
    `${second}가 “다시는 술 먹고 판단 안 한다”는 의미심장한 말을 남겼습니다.`,
    '둘이 침대에 누운 지 10분 만에 배달의민족을 켰습니다. ㅋ',
    '둘이 다음 벙에서 마주치면 인사까지는 하기로 합의했습니다.'
  ] : compatibility <= 50 ? [
    '킄킄이 뭔가를 알고 있는 표정으로 앞머리 뒤에서 계속 웃고 있습니다.',
    '둘이 30분 만에 돌아오자 레고가 “대실도 아니고 분실 아니냐?”며 걱정했습니다.',
    '둘이 동시에 사라지자 킄킄이 “찾지 마. 나도 20년 전엔 그랬다”며 수색을 중단시켰습니다.',
    `${first}가 “오늘은 술을 너무 많이 마셔서 그래”라고 하자 ${second}가 남은 술을 전부 싱크대에 버렸습니다.`
  ] : compatibility <= 60 ? [
    'CF에서 알 수 없는 규칙적인 소리가 났습니다.',
    `콩이가 엘리베이터에서 ${first}와 ${second}를 마주쳤습니다! 둘은 아무 일 없었다는 듯 서로 다른 층 버튼을 눌렀습니다.`,
    `${first}와 ${second}가 CF 엘리베이터에서 시작하려던 순간 킄킄을 마주쳤습니다..`,
    `${second}가 ${first}에게 “아까 그 얘기 절대 하지 마”라고 보내려다 레고방 공챗에 보냈습니다.`,
    '보이스룸에서 이상한 소리가 들리자 69명의 청취자까지 야릇해졌습니다.'
  ] : compatibility <= 70 ? [
    '둘이 동시에 자리를 비웠다가 둘 다 옷매무새를 고치며 돌아왔습니다.',
    `${first}와 ${second}가 실수로 보이스룸을 켜두었던 것을 한 시간 뒤에 확인했습니다.`,
    `네네가 문을 잘못 열었다가 그대로 굳었고 ${first}가 안에서 “문 좀 닫아줘”라고 부탁했습니다.`,
    `${first}와 ${second}가 사라진 뒤 둘을 찾으러 간 레고까지 한동안 돌아오지 않았습니다.`,
    '킄킄이 흡연실 문을 열었다가 바로 닫고 나와 “금연 성공할 것 같다”고 말했습니다.'
  ] : compatibility <= 80 ? [
    '잔치집 흡연실에서 알 수 없는 규칙적인 소리가..',
    `둘이 아무 일 없었다고 주장했지만 ${second}가 ${first} 옷을 입고 있었습니다.`,
    `둘이 나왔는데 ${first}는 지퍼를 잠그고 ${second}는 머리를 묶고 있었습니다.`,
    `${second} 목의 흔적을 본 킄킄이 “모기 크기가 ${first}만 하냐?”고 물었습니다.`,
    `${first}와 ${second}가 비상계단에서 황급히 떨어졌는데 ${first}의 빅사이즈 팬티는 3층에 남아있었습니다.`
  ] : compatibility <= 90 ? [
    `잔치집 흡연실에서 ${first}와 ${second}가 관계에 집중한 나머지 문 잠그는 걸 잊었습니다.`,
    '문을 연 레고가 3초간 상황을 파악한 뒤 “죄송합니다. 아니, 두 분이 죄송해야 하나?” 하고 닫았습니다.',
    '예솔이 비상계단 문을 열었다가 장면을 목격하고 “아 샤갈 나도 관계할래”를 외치며 내려갔습니다.',
    '둘이 비상계단에서 관계 중이었는데 취한 레고가 옆에 쭈그려 앉아 “신경 쓰지 말고 하던 거 계속해”라며 담배를 피웠습니다.',
    `문을 열어버린 킄킄이 ${first}와 ${second}를 번갈아 보더니 “오 이 조합은 예상 못 했는데”라며 다시 문을 닫았습니다.`
  ] : [
    `${first}와 ${second}를 발견한 상어가 “하던 거 마저하세요”라고 말하며 자기 휴대폰만 챙겨서 나갔습니다.`,
    '둘이 다음 날 한국밥에서 해장하다 킄킄을 마주쳤는데 킄킄이 말없이 수저 두 개를 가져다줬습니다.',
    '호야 비상계단에서 예솔이 장면을 목격했고 부러움을 호소했습니다.',
    '다음 날 둘이 아무 일 없었다고 주장했는데 레고방에서는 이미 ‘호야계단남녀’로 부르고 있습니다.',
    `킄킄이 현장을 목격한 뒤 공챗에 설명 없이 “${first}❤️${second} 축하드립니다”만 올렸고, 둘의 관계가 강제로 공식화됐습니다.`
  ];
  return groups[Math.floor(Math.random() * groups.length)];
}

export function socialAction(state, actorPet, targetPet, action, extra = {}, date = new Date()) {
  if (!actorPet?.alive || !targetPet?.alive || actorPet.id === targetPet.id) return { ok: false, message: '상대 레고를 찾을 수 없습니다.' };
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
      const compatibility = 1 + Math.floor(Math.random() * 100);
      const resultText = matingResultText(targetPet.displayName, actorPet.displayName, compatibility);
      const news = `💕 ${targetPet.displayName}와 ${actorPet.displayName}의 궁합도는 ${compatibility}%! ${resultText}`;
      addPublicEvent(state, news, 'mating', [targetPet.id, actorPet.id], date);
      const requesterGoal = incrementGoalCounter(targetPet, 'mating', 1, date);
      const accepterGoal = incrementGoalCounter(actorPet, 'mating', 1, date);
      addNotification(state, targetPet.userId, `${actorPet.displayName}이 교미 신청을 수락했습니다. 궁합도 ${compatibility}%`, 'mating', { compatibility }, date);
      return { ok: true, accepted: true, compatibility, resultText, goalAwarded: requesterGoal.awarded || accepterGoal.awarded, message: `교미 신청을 수락했습니다. 궁합도 ${compatibility}% · ${resultText}` };
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
    const staminaUse = consumeStamina(pet, 20, date);
    const hungerUse = consumeInteractionHunger(pet, date);
    const repeatAward = awardLegoPower(pet, 1, 'bung-complete', date);
    const levelGoal = repeatAward.leveledUp ? completeDailyGoal(pet, 'levelUp', date) : { awarded: false };
    const dailyAward = completeDailyGoal(pet, 'bungJoin', date);
    const hostAward = pet.id === bung.hostPetId ? completeDailyGoal(pet, 'bungHost', date) : { awarded: false };
    pet.records.bungs += 1;
    pet.daily.balanceCounts.bung += 1;
    entry.rewarded = true;
    entry.status = 'completed';
    normalizePet(pet, date);
    rewards.push({ petId: pet.id, displayName: pet.displayName, legoPower: repeatAward.amount + (levelGoal.awarded ? 1 : 0) + (dailyAward.awarded ? 1 : 0) + (hostAward.awarded ? 1 : 0), stamina: -staminaUse.deducted, hungerCost: hungerUse.deducted });
  }
  addPublicEvent(state, `${bung.title} 벙이 ${rewards.length}명 참가로 끝났습니다.`, 'bung', rewards.map((item) => item.petId), date);

  // 종료 기록은 실제로 정상 종료된 최신 10개만 보관한다. 열려 있거나 진행 중인 벙은 건드리지 않는다.
  const endedIds = Object.values(state.bungs ?? {})
    .filter((item) => item?.status === 'ended' && Number.isFinite(new Date(item.endedAt ?? '').getTime()))
    .sort((a, b) => new Date(b.endedAt) - new Date(a.endedAt))
    .map((item) => item.id);
  for (const oldId of endedIds.slice(10)) delete state.bungs[oldId];

  return { ok: true, message: `벙을 끝냈습니다. 참가자 체력 -20, 레고력 +1${rewards.some((item) => item.legoPower > 1) ? ' (오늘의 레고력 보너스 포함)' : ''}`, rewards };
}

export function forceCancelBung(state, bungId, date = new Date()) {
  state.bungs ??= {};
  const bung = state.bungs[String(bungId ?? '')];
  if (!bung || !['open', 'live'].includes(bung.status)) return { ok: false, message: '강제취소할 진행 중 벙을 찾을 수 없습니다.' };
  const attendeeCount = Object.values(bung.attendees ?? {}).filter((entry) => entry?.status !== 'left').length;
  const summary = {
    id: bung.id,
    title: bung.title,
    hostPetId: bung.hostPetId,
    hostDisplayName: state.pets?.[bung.hostPetId]?.displayName ?? '사라진 레고',
    stakePoints: Math.max(0, Math.floor(Number(bung.stakePoints) || 0)),
    attendeeCount,
    previousStatus: bung.status,
    cancelledAt: nowIso(date)
  };
  // 운영자 강제취소는 '정상 종료'가 아니다. 개설 포인트 반환, 참가자 보상,
  // 오늘의 레고력, 정상 종료 기록을 어떤 것도 지급/기록하지 않고 열린 벙 데이터만 제거한다.
  delete state.bungs[bung.id];
  return { ok: true, message: `'${summary.title}' 벙을 강제취소했습니다. 포인트 반환·레고력 지급은 없습니다.`, bung: summary };
}

function miniChallengeView(challenge) {
  if (!challenge) return null;
  const view = { ...challenge };
  delete view.target;
  delete view.appleProcessedRequestIds;
  delete view.appleRefreshRequestIds;
  delete view.blockProcessedRequestIds;
  if (Array.isArray(view.appleBoard)) view.appleBoard = view.appleBoard.map((row) => [...row]);
  if (Array.isArray(view.blockBoard)) view.blockBoard = view.blockBoard.map((row) => [...row]);
  return view;
}

function miniChallengeIsActive(challenge, date = new Date()) {
  if (!challenge || challenge.completed) return false;
  if (challenge.gameId === 'block') return true;
  return new Date(challenge.expiresAt).getTime() > date.getTime();
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
  const miniLimit = dailyMiniGameLimit(pet);
  if (pet.daily.miniGamesPlayed >= miniLimit) return { ok: false, message: `이번 게임 하루의 미니게임 ${miniLimit}회를 모두 사용했습니다.` };
  const active = Object.values(state.miniGameChallenges ?? {}).find((challenge) => challenge.petId === pet.id && miniChallengeIsActive(challenge, date));
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
    expiresAt: gameId === 'block' ? null : gameId === 'apple' ? new Date(date.getTime() + 120_000).toISOString() : new Date(date.getTime() + 10 * 60_000).toISOString(), completed: false,
    streak: 0, pendingPayout: 0, stake,
    readyAt: gameId === 'reaction' ? date.getTime() + 1_500 + Math.floor(Math.random() * 3_500) : null,
    reactionNonce: gameId === 'reaction' ? id('reaction-proof') : null,
    target: gameId === 'number' ? 1 + Math.floor(Math.random() * 100) : null,
    attempts: 0, maxAttempts: gameId === 'number' ? MINI_GAMES.number.maxAttempts : null, guesses: []
  };
  if (gameId === 'apple') Object.assign(challenge, appleChallengeFields(date));
  if (gameId === 'block') Object.assign(challenge, blockChallengeFields());
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
  normalizePet(pet, date);
  return { ok: true, finished: true, reward, detail, goalAwarded: goal.awarded, message: `${detail}${reward > 0 ? ` · ${reward}P 획득` : ''}${goal.awarded ? ' · 개인게임 목표 달성, 레고력 +1' : ''}` };
}

export function finishMiniGame(state, pet, challengeId, value, date = new Date(), input = {}) {
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
  if (challenge.gameId === 'block') return { ok: false, message: '블록게임은 더 이상 제거할 그룹이 없을 때 자동으로 종료됩니다.' };
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
    const serverObservedMs = date.getTime() - Number(challenge.readyAt || 0);
    const clientReactionMs = Number(input?.clientReactionMs);
    const clientClickedAt = Number(input?.clientClickedAt);
    const hasClientMeasurement = Number.isFinite(clientReactionMs) && Number.isFinite(clientClickedAt);
    if (serverObservedMs < 0 || (hasClientMeasurement && clientReactionMs < 0)) {
      return { ...completeChallenge(pet, challenge, 0, '신호보다 먼저 눌렀습니다.', date), reactionMs: 0, early: true };
    }

    let reactionMs = Math.round(serverObservedMs);
    if (hasClientMeasurement) {
      const roundedClientMs = Math.round(clientReactionMs);
      const expectedClickedAt = Number(challenge.readyAt || 0) + roundedClientMs;
      const clockMismatch = Math.abs(clientClickedAt - expectedClickedAt);
      const networkGap = serverObservedMs - roundedClientMs;
      const invalid = roundedClientMs < REACTION_MIN_VALID_MS
        || roundedClientMs > 10_000
        || clockMismatch > REACTION_CLOCK_TOLERANCE_MS
        || networkGap < -REACTION_CLOCK_TOLERANCE_MS
        || networkGap > REACTION_MAX_NETWORK_GAP_MS;
      if (invalid) {
        return {
          ...completeChallenge(pet, challenge, 0, '비정상적인 반응 기록이 감지되어 기록과 보상이 반영되지 않았습니다.', date),
          reactionMs: 0,
          invalidReaction: true
        };
      }
      reactionMs = roundedClientMs;
    }
    if (reactionMs < REACTION_MIN_VALID_MS) {
      return {
        ...completeChallenge(pet, challenge, 0, '비정상적으로 빠른 반응 기록이라 반영되지 않았습니다.', date),
        reactionMs: 0,
        invalidReaction: true
      };
    }
    const reward = reactionMs <= 200 ? 100 : reactionMs <= 300 ? 70 : reactionMs <= 450 ? 40 : reactionMs <= 600 ? 20 : 5;
    if (pet.records.bestReactionMs === 0 || reactionMs < pet.records.bestReactionMs) pet.records.bestReactionMs = reactionMs;
    if (pet.records.seasonBestReactionMs === 0 || reactionMs < pet.records.seasonBestReactionMs) { pet.records.seasonBestReactionMs = reactionMs; pet.records.seasonBestReactionAt = date.toISOString(); }
    return { ...completeChallenge(pet, challenge, reward, `반응 속도 ${reactionMs}ms`, date), reactionMs, verified: hasClientMeasurement };
  }
  if (challenge.gameId === 'number') {
    if (value === null || value === undefined || String(value).trim() === '') return { ok: false, message: '숫자를 입력해주세요.' };
    const guess = Math.round(Number(value));
    if (!Number.isInteger(guess) || guess < 1 || guess > 100) return { ok: false, message: '1부터 100 사이 숫자를 입력해주세요.' };
    challenge.attempts += 1;
    challenge.guesses.push(guess);
    if (guess === challenge.target) {
      const reward = challenge.attempts <= 2 ? 150 : challenge.attempts === 3 ? 120 : challenge.attempts === 4 ? 80 : 50;
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
  if (result.ok && result.removed && Number(result.availableMoves) === 0) {
    refreshAppleBoard(challenge);
    return {
      ...result,
      board: challenge.appleBoard.map((row) => [...row]),
      boardRefreshed: true,
      boardsGenerated: challenge.appleBoardsGenerated,
      availableMoves: challenge.appleAvailableMoves,
      newBoardAvailable: challenge.appleNewBoardAvailable,
      message: `${result.message} · 가능한 합10 영역이 없어 새 판이 자동 생성되었습니다.`
    };
  }
  return result;
}

export function requestAppleNewBoardGame(state, pet, challengeId, requestId = '', date = new Date()) {
  applyDailyReset(pet, date);
  applyHungerPenalty(pet, date);
  const challenge = state.miniGameChallenges?.[challengeId];
  if (!challenge || challenge.petId !== pet.id || challenge.completed || challenge.gameId !== 'apple') return { ok: false, message: '유효한 사과게임이 없습니다.' };
  const result = requestAppleNewBoard(challenge, requestId, date);
  if (result.expired) return { ...completeChallenge(pet, challenge, challenge.applePendingPoints, `사과게임 종료 · ${challenge.appleScore}점 · 숫자 ${challenge.appleRemovedCount}개 제거`, date), expired: true };
  return result;
}

export function selectBlockGame(state, pet, challengeId, input = {}, requestId = '', date = new Date()) {
  applyDailyReset(pet, date);
  applyHungerPenalty(pet, date);
  const challenge = state.miniGameChallenges?.[challengeId];
  if (!challenge || challenge.petId !== pet.id || challenge.completed || challenge.gameId !== 'block') return { ok: false, message: '유효한 블록게임이 없습니다.' };
  normalizeBlockChallenge(challenge);
  const result = selectBlockGroup(challenge, input, requestId);
  if (!result.ok || !result.finished) return result;
  const reward = Math.max(0, nonNegativeInt(result.finalPoints));
  const detail = result.allClear
    ? `블록게임 ALL CLEAR · 블록 ${challenge.blockRemovedCount}개 제거 · ${challenge.blockMoveCount}번 선택`
    : `블록게임 종료 · 블록 ${challenge.blockRemovedCount}개 제거 · ${challenge.blockRemainingCount}개 남음`;
  return {
    ...result,
    ...completeChallenge(pet, challenge, reward, detail, date),
    allClear: result.allClear,
    removedCount: challenge.blockRemovedCount,
    remainingCount: challenge.blockRemainingCount,
    moveCount: challenge.blockMoveCount
  };
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
  if (!challenge || challenge.petId !== pet.id || challenge.completed) return { ok: false, message: '그만할 수 있는 진행 중 게임이 없습니다.' };
  if (challenge.gameId === 'block') {
    applyDailyReset(pet, date);
    applyHungerPenalty(pet, date);
    normalizeBlockChallenge(challenge);
    const reward = Math.max(0, nonNegativeInt(challenge.blockPendingPoints));
    const detail = `블록게임 그만하기 · 블록 ${challenge.blockRemovedCount}개 제거 · ${challenge.blockRemainingCount}개 남음`;
    return {
      ...completeChallenge(pet, challenge, reward, detail, date),
      stopped: true,
      allClear: false,
      removedCount: challenge.blockRemovedCount,
      remainingCount: challenge.blockRemainingCount,
      moveCount: challenge.blockMoveCount
    };
  }
  if (challenge.gameId !== 'oddEven') return { ok: false, message: '이 게임은 중간에 그만할 수 없습니다.' };
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
  normalizePet(pet, date);
  return { ok: true, autoCompleted: true, result: completed, goalAwarded: goal.awarded, message: reward.reward > 0 ? `${reward.label}을 낚아 ${reward.reward}P 획득${goal.awarded ? ' · 낚시 목표 달성, 레고력 +1' : ''}` : `${reward.label}을 낚았습니다. 꽝${goal.awarded ? ' · 낚시 목표 달성, 레고력 +1' : ''}` };
}

export function settleFishing(pet, date = new Date()) {
  return settleReadyFishing(pet, date);
}

export function startFishing(pet, date = new Date()) {
  applyDailyReset(pet, date);
  applyHungerPenalty(pet, date);
  if (pet.daily.fishing) return { ok: false, message: '이미 낚시 중입니다.' };
  const fishingLimit = dailyFishingLimit(pet);
  if (pet.daily.fishingPlayed >= fishingLimit) return { ok: false, message: `이번 게임 하루의 낚시 ${fishingLimit}회를 모두 사용했습니다.` };
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
  if (timedEffectActive(pet, 'staminaFullUntil') || timedEffectActive(pet, 'hungerFullUntil')) return '상점 유지권 효과가 적용 중입니다.';
  if (pet.stats.hunger === 0) return `배고픔 0 · 1시간마다 ${HUNGER_PENALTY_POINTS_PER_HOUR}P 감소`;
  if (pet.stats.stamina <= 20) return '체력이 부족합니다. 쉬기가 필요합니다.';
  return '생활 상태가 안정적입니다.';
}

export function seasonBadgeView(pet, date = new Date()) {
  ensurePetSchema(pet, date);
  const now = date.getTime();
  const defs = { reaction: '⚡왕', apple: '🍎왕', omok: '⚫오목왕' };
  return Object.entries(defs).flatMap(([key, label]) => {
    const expiresAt = new Date(pet.seasonBadges?.[key] ?? '').getTime();
    return Number.isFinite(expiresAt) && expiresAt > now ? [{ key, label, expiresAt: new Date(expiresAt).toISOString() }] : [];
  });
}

export function flexItemView(pet, date = new Date()) {
  ensurePetSchema(pet, date);
  const active = pet.flexItem;
  const item = active ? FLEX_ITEMS[active.itemId] : null;
  if (!item) return null;
  return {
    id: item.id,
    name: item.name,
    price: item.price,
    tier: item.tier,
    assetKey: item.assetKey,
    purchasedAt: active.purchasedAt,
    expiresAt: active.expiresAt
  };
}

export function publicProfile(state, targetPetId, viewerPetId, isOnline = false) {
  const pet = state.pets[targetPetId];
  if (!pet?.alive) return null;
  ensurePetSchema(pet);
  const progress = levelProgress(pet.stats.legoPower);
  const partner = pet.partnerPetId ? state.pets?.[pet.partnerPetId] : null;
  const validPartner = partner?.alive && partner.partnerPetId === pet.id ? partner : null;
  const coupleDay = validPartner ? coupleDayCount(pet.coupleStartedAt) : null;
  return {
    id: pet.id, displayName: pet.displayName, generation: pet.generation, createdAt: pet.createdAt,
    statusMessage: pet.statusMessage, seasonBadges: seasonBadgeView(pet), flexItem: flexItemView(pet),
    workoutBadge: Boolean(state.users?.[pet.userId]?.workoutBadge),
    online: Boolean(isOnline), bodyStage: getBodyStage(pet.stats.body),
    stats: { points: pet.stats.points, stamina: pet.stats.stamina, hunger: pet.stats.hunger, body: pet.stats.body, legoPower: pet.stats.legoPower, level: progress.level },
    warnings: pet.warnings,
    partnerPetId: validPartner?.id ?? null,
    partnerDisplayName: validPartner?.displayName ?? null,
    coupleStartedAt: validPartner ? pet.coupleStartedAt : null,
    coupleDay,
    coupleLabel: validPartner ? `${validPartner.displayName}와 커플 D+${coupleDay}` : '솔로',
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
      if (!other?.alive) return null;
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
    .filter((pet) => pet?.alive)
    .map((pet) => { ensurePetSchema(pet); return pet; })
    .sort((a, b) => b.stats.points - a.stats.points || new Date(a.createdAt) - new Date(b.createdAt))
    .slice(0, limit)
    .map((pet, index) => ({ rank: index + 1, petId: pet.id, displayName: pet.displayName, points: pet.stats.points }));
}

export function levelRanking(state, limit = 5) {
  return Object.values(state.pets ?? {})
    .filter((pet) => pet?.alive)
    .map((pet) => { ensurePetSchema(pet); return pet; })
    .sort((a, b) => levelForPower(b.stats.legoPower) - levelForPower(a.stats.legoPower) || b.stats.legoPower - a.stats.legoPower || new Date(a.levelReachedAt) - new Date(b.levelReachedAt))
    .slice(0, limit)
    .map((pet, index) => ({ rank: index + 1, petId: pet.id, displayName: pet.displayName, level: levelForPower(pet.stats.legoPower), legoPower: pet.stats.legoPower }));
}

export function coupleRanking(state) {
  const seen = new Set();
  const couples = [];
  for (const pet of Object.values(state.pets ?? {})) {
    if (!pet?.alive || !pet.partnerPetId) continue;
    const key = relationKey(pet.id, pet.partnerPetId);
    if (seen.has(key)) continue;
    seen.add(key);
    const partner = state.pets[pet.partnerPetId];
    if (!partner?.alive || partner.partnerPetId !== pet.id) continue;
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

function reactionRanking(state, limit = 5) {
  return Object.values(state.pets ?? {}).filter((pet) => pet?.alive).map((pet) => {
    ensurePetSchema(pet);
    return { petId: pet.id, displayName: pet.displayName, ms: pet.records.seasonBestReactionMs, achievedAt: pet.records.seasonBestReactionAt };
  }).filter((item) => item.ms > 0)
    .sort((a, b) => a.ms - b.ms || new Date(a.achievedAt ?? 8640000000000000) - new Date(b.achievedAt ?? 8640000000000000) || a.displayName.localeCompare(b.displayName, 'ko'))
    .slice(0, limit).map((item, index) => ({ ...item, rank: index + 1 }));
}

export function rankingsView(state, viewerPetId = null) {
  const reactionAll = reactionRanking(state, Number.MAX_SAFE_INTEGER);
  const appleAll = appleRanking(state, Number.MAX_SAFE_INTEGER);
  const omokAll = omokRanking(state, Number.MAX_SAFE_INTEGER);
  const mine = (items) => viewerPetId ? items.find((item) => item.petId === viewerPetId) ?? null : null;
  return {
    points: pointRanking(state, 5),
    levels: levelRanking(state, 5),
    couples: coupleRanking(state),
    pokes: pokeRanking(state, 5),
    reaction: reactionAll.slice(0, 5),
    apple: appleAll.slice(0, 5),
    omok: omokAll.slice(0, 5),
    myGameRanks: { reaction: mine(reactionAll), apple: mine(appleAll), omok: mine(omokAll) },
    gameSeason: state.gameRankingSeason ? { ...state.gameRankingSeason } : null
  };
}

export function privateDashboard(state, userId) {
  const user = state.users[userId];
  const pet = user ? state.pets[user.currentPetId] : null;
  if (!user || !pet) return null;
  ensurePetSchema(pet);
  const progress = levelProgress(pet.stats.legoPower);
  const shop = shopStateView(user, pet);
  const partner = pet.partnerPetId ? state.pets?.[pet.partnerPetId] : null;
  const validPartner = partner?.alive && partner.partnerPetId === pet.id ? partner : null;
  const coupleDay = validPartner ? coupleDayCount(pet.coupleStartedAt) : null;
  return {
    user: { id: user.id, nickname: user.nickname, generation: user.generation, temporaryNickname: shop.temporaryNickname },
    shop,
    pet: {
      id: pet.id, displayName: pet.displayName, generation: pet.generation, createdAt: pet.createdAt,
      statusMessage: pet.statusMessage,
      workoutBadge: Boolean(user.workoutBadge),
      seasonBadges: seasonBadgeView(pet),
      flexItem: flexItemView(pet),
      stats: { ...pet.stats, level: progress.level },
      levelProgress: progress,
      bodyStage: getBodyStage(pet.stats.body),
      warnings: pet.warnings,
      partnerPetId: validPartner?.id ?? null,
      partnerDisplayName: validPartner?.displayName ?? null,
      coupleStartedAt: validPartner ? pet.coupleStartedAt : null,
      coupleDay,
      coupleLabel: validPartner ? `${validPartner.displayName}와 커플 D+${coupleDay}` : '솔로',
      daily: {
        ...pet.daily,
        miniGamesLimit: dailyMiniGameLimit(pet),
        fishingLimit: dailyFishingLimit(pet),
        nextGameDayAt: nextGameDayAt(),
        goals: dailyGoalView(pet)
      },
      effects: { ...pet.effects },
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
  addPublicEvent(state, `${oldPet.displayName}이 ${reason} 처리되었습니다. 모든 것을 잃고 ${newPet.displayName}으로 다시 시작합니다.`, 'restart', [oldPet.id, newPet.id], date);
  return { oldPetId: oldPet.id, newPetId: newPet.id, reason, generation };
}

export function applyAutomaticConsequences(state, userId, date = new Date()) {
  const pet = currentPetForUser(state, userId);
  if (!pet?.alive) return { restarted: false };
  ensurePetSchema(pet, date);
  applyHungerPenalty(pet, date);
  return { restarted: false };
}

export function currentPetForUser(state, userId) {
  const user = state.users[userId];
  return user ? state.pets[user.currentPetId] : null;
}
