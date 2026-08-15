import { gameDayKey } from '../lib/time.js';

export const DAILY_LEGO_GOALS = [
  { key: 'life', label: '생활 행동 3회' },
  { key: 'mini', label: '개인게임 2회' },
  { key: 'fishing', label: '낚시 5회' },
  { key: 'blockBattlePlay', label: '테트리스대전 1판 완료' },
  { key: 'omokPlay', label: '오목게임 1판 완료' },
  { key: 'bungJoin', label: '벙 1회 정상 참가' },
  { key: 'bungHost', label: '직접 벙 개최 후 정상 종료' },
  { key: 'mating', label: '교미 성공 5회' },
  { key: 'poke', label: '찌르기 5회' },
  { key: 'levelUp', label: '레벨업 1회' }
];

export const LEVEL_BADGE_TIERS = Object.freeze([
  Object.freeze({ minLevel: 5, key: 'bronze', label: '브론즈', icon: '🥉' }),
  Object.freeze({ minLevel: 10, key: 'silver', label: '실버', icon: '🥈' }),
  Object.freeze({ minLevel: 15, key: 'gold', label: '골드', icon: '🥇' }),
  Object.freeze({ minLevel: 20, key: 'platinum', label: '플래티넘', icon: '💠' }),
  Object.freeze({ minLevel: 25, key: 'emerald', label: '에메랄드', icon: '◆' }),
  Object.freeze({ minLevel: 30, key: 'sapphire', label: '사파이어', icon: '◆' }),
  Object.freeze({ minLevel: 35, key: 'ruby', label: '루비', icon: '◆' }),
  Object.freeze({ minLevel: 40, key: 'diamond', label: '다이아', icon: '💎' }),
  Object.freeze({ minLevel: 45, key: 'master', label: '마스터', icon: '🏆' }),
  Object.freeze({ minLevel: 50, key: 'lego-king', label: '레고왕', icon: '👑' })
]);

export function levelBadgeForLevel(level) {
  const safeLevel = Math.max(1, Math.floor(Number(level) || 1));
  return [...LEVEL_BADGE_TIERS].reverse().find((tier) => safeLevel >= tier.minLevel) ?? null;
}

export function levelUpRewardPoints(level) {
  const safeLevel = Math.max(2, Math.floor(Number(level) || 2));
  if (safeLevel === 50) return 3000;
  if (safeLevel % 5 === 0) return 1000;
  return 500;
}

export function levelRequirement(level) {
  const safeLevel = Math.max(1, Math.floor(Number(level) || 1));
  return 8 + safeLevel * 2;
}

export function levelUpperBound(level) {
  const safeLevel = Math.max(1, Math.floor(Number(level) || 1));
  return safeLevel * safeLevel + 9 * safeLevel;
}

export function levelForPower(power) {
  const value = Math.max(1, Math.floor(Number(power) || 1));
  let level = Math.max(1, Math.floor((-9 + Math.sqrt(81 + 4 * value)) / 2));
  while (value > levelUpperBound(level)) level += 1;
  while (level > 1 && value <= levelUpperBound(level - 1)) level -= 1;
  return level;
}

export function levelProgress(power) {
  const value = Math.max(1, Math.floor(Number(power) || 1));
  const level = levelForPower(value);
  const previousUpper = level === 1 ? 0 : levelUpperBound(level - 1);
  return {
    level,
    totalPower: value,
    current: value - previousUpper,
    needed: levelRequirement(level),
    nextAt: levelUpperBound(level) + 1,
    nextRewardPoints: levelUpRewardPoints(level + 1),
    nextMilestone: (level + 1) % 5 === 0
  };
}

// 5×5 영토맵의 물리적 최대치(25칸)까지만, 레벨 1당 보유 한도 1칸씩 증가한다.
export const TERRITORY_LIMIT_TIERS = Object.freeze([
  ...Array.from({ length: 24 }, (_, index) => Object.freeze({ minLevel: index + 1, maxLevel: index + 1, limit: index + 1 })),
  Object.freeze({ minLevel: 25, maxLevel: null, limit: 25 })
]);

export function territoryLimitForLevel(level) {
  const safeLevel = Math.max(1, Math.floor(Number(level) || 1));
  return Math.min(25, safeLevel);
}

export function nextTerritoryUpgrade(level) {
  const safeLevel = Math.max(1, Math.floor(Number(level) || 1));
  if (safeLevel >= 25) return null;
  return { level: safeLevel + 1, limit: safeLevel + 1 };
}

export function ensureDailyProgress(pet, date = new Date()) {
  pet.daily ??= {};
  pet.daily.date = typeof pet.daily.date === 'string' && pet.daily.date ? pet.daily.date : gameDayKey(date);
  pet.daily.goalCounters = pet.daily.goalCounters && typeof pet.daily.goalCounters === 'object' && !Array.isArray(pet.daily.goalCounters)
    ? pet.daily.goalCounters
    : {};
  pet.daily.goalCounters.life = Math.max(0, Math.floor(Number(pet.daily.goalCounters.life) || 0));
  pet.daily.goalCounters.mini = Math.max(0, Math.floor(Number(pet.daily.goalCounters.mini) || 0));
  pet.daily.goalCounters.fishing = Math.max(0, Math.floor(Number(pet.daily.goalCounters.fishing) || 0));
  pet.daily.goalCounters.mating = Math.max(0, Math.floor(Number(pet.daily.goalCounters.mating) || 0));
  pet.daily.goalCounters.poke = Math.max(0, Math.floor(Number(pet.daily.goalCounters.poke) || 0));
  pet.daily.legoGoals = pet.daily.legoGoals && typeof pet.daily.legoGoals === 'object' && !Array.isArray(pet.daily.legoGoals)
    ? pet.daily.legoGoals
    : {};
  if (pet.daily.legoGoals.liarPlay && pet.daily.legoGoals.blockBattlePlay == null) pet.daily.legoGoals.blockBattlePlay = true;
  delete pet.daily.legoGoals.liarPlay;
  const allowedGoalKeys = new Set(DAILY_LEGO_GOALS.map((goal) => goal.key));
  for (const key of Object.keys(pet.daily.legoGoals)) if (!allowedGoalKeys.has(key)) delete pet.daily.legoGoals[key];
  for (const goal of DAILY_LEGO_GOALS) pet.daily.legoGoals[goal.key] = Boolean(pet.daily.legoGoals[goal.key]);
  return pet.daily;
}

export function resetDailyProgress(pet) {
  pet.daily.goalCounters = { life: 0, mini: 0, fishing: 0, mating: 0, poke: 0 };
  pet.daily.legoGoals = Object.fromEntries(DAILY_LEGO_GOALS.map((goal) => [goal.key, false]));
}

function applyLevelRewards(pet, oldLevel, newLevel) {
  if (newLevel <= oldLevel) return { points: 0, rewards: [] };
  pet.stats ??= {};
  pet.records ??= {};
  const rewards = [];
  let totalPoints = 0;
  for (let level = oldLevel + 1; level <= newLevel; level += 1) {
    const points = levelUpRewardPoints(level);
    totalPoints += points;
    rewards.push({
      level,
      points,
      milestone: level % 5 === 0,
      flexUnlockLevel: level % 5 === 0 && level <= 50 ? level : null,
      badge: levelBadgeForLevel(level)
    });
  }
  pet.stats.points = Math.max(0, Math.floor(Number(pet.stats.points) || 0)) + totalPoints;
  pet.stats.stamina = 100;
  pet.stats.hunger = 100;
  pet.survival ??= {};
  pet.survival.hungerZeroAt = null;
  pet.survival.hungerPenaltyHoursApplied = 0;
  pet.records.pointsEarned = Math.max(0, Math.floor(Number(pet.records.pointsEarned) || 0)) + totalPoints;
  pet.records.maxPoints = Math.max(Math.max(0, Math.floor(Number(pet.records.maxPoints) || 0)), pet.stats.points);
  return { points: totalPoints, rewards };
}

export function awardLegoPower(pet, amount = 1, reason = '', date = new Date()) {
  const safeAmount = Math.max(0, Math.floor(Number(amount) || 0));
  const currentLevel = levelForPower(pet.stats?.legoPower);
  if (safeAmount <= 0) return { amount: 0, oldLevel: currentLevel, newLevel: currentLevel, leveledUp: false, reason, levelRewardPoints: 0, levelRewards: [] };
  pet.stats ??= {};
  pet.records ??= {};
  const oldLevel = currentLevel;
  pet.stats.legoPower = Math.max(1, Math.floor(Number(pet.stats.legoPower) || 1)) + safeAmount;
  const newLevel = levelForPower(pet.stats.legoPower);
  pet.records.legoPowerEarned = Math.max(0, Math.floor(Number(pet.records.legoPowerEarned) || 0)) + safeAmount;
  pet.records.maxLevel = Math.max(Math.floor(Number(pet.records.maxLevel) || 1), newLevel);
  const levelReward = applyLevelRewards(pet, oldLevel, newLevel);
  if (newLevel > oldLevel) pet.levelReachedAt = date.toISOString();
  return {
    amount: safeAmount,
    oldLevel,
    newLevel,
    leveledUp: newLevel > oldLevel,
    reason,
    levelRewardPoints: levelReward.points,
    levelRewards: levelReward.rewards
  };
}

export function completeDailyGoal(pet, key, date = new Date()) {
  ensureDailyProgress(pet, date);
  if (!DAILY_LEGO_GOALS.some((goal) => goal.key === key)) return { awarded: false, amount: 0 };
  if (pet.daily.legoGoals[key]) return { awarded: false, amount: 0 };
  pet.daily.legoGoals[key] = true;
  const award = awardLegoPower(pet, 1, key, date);
  let levelUpBonus = false;
  let levelUpBonusAward = null;
  if (award.leveledUp && key !== 'levelUp' && !pet.daily.legoGoals.levelUp) {
    pet.daily.legoGoals.levelUp = true;
    levelUpBonusAward = awardLegoPower(pet, 1, 'levelUp', date);
    levelUpBonus = true;
  }
  return {
    awarded: true,
    ...award,
    levelUpBonus,
    levelUpBonusAward,
    levelRewardPoints: award.levelRewardPoints + (levelUpBonusAward?.levelRewardPoints ?? 0),
    levelRewards: [...(award.levelRewards ?? []), ...(levelUpBonusAward?.levelRewards ?? [])]
  };
}

export function incrementGoalCounter(pet, key, amount = 1, date = new Date()) {
  ensureDailyProgress(pet, date);
  const safeAmount = Math.max(0, Math.floor(Number(amount) || 0));
  if (!['life', 'mini', 'fishing', 'mating', 'poke'].includes(key) || safeAmount <= 0) return { awarded: false, amount: 0 };
  pet.daily.goalCounters[key] += safeAmount;
  const target = key === 'life' ? 3 : key === 'mini' ? 2 : 5;
  if (pet.daily.goalCounters[key] >= target) return completeDailyGoal(pet, key, date);
  return { awarded: false, amount: 0 };
}

export function dailyGoalView(pet) {
  ensureDailyProgress(pet);
  const thresholds = { life: 3, mini: 2, fishing: 5, mating: 5, poke: 5 };
  const items = DAILY_LEGO_GOALS.map((goal) => ({
    ...goal,
    completed: Boolean(pet.daily.legoGoals[goal.key]),
    current: thresholds[goal.key] ? Math.min(thresholds[goal.key], pet.daily.goalCounters[goal.key] ?? 0) : null,
    target: thresholds[goal.key] ?? null
  }));
  return { completed: items.filter((item) => item.completed).length, total: items.length, items };
}
