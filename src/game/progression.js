import { gameDayKey } from '../lib/time.js';

export const DAILY_LEGO_GOALS = [
  { key: 'life', label: '생활 행동 3회' },
  { key: 'mini', label: '개인게임 2회' },
  { key: 'fishing', label: '낚시 5회' },
  { key: 'liarPlay', label: '라이어게임 1판 완료' },
  { key: 'omokPlay', label: '오목게임 1판 완료' },
  { key: 'bungJoin', label: '벙 1회 정상 참가' },
  { key: 'bungHost', label: '직접 벙 개최 후 정상 종료' },
  { key: 'mating', label: '교미 성공 5회' },
  { key: 'poke', label: '찌르기 5회' },
  { key: 'levelUp', label: '레벨업 1회' }
];

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
    nextAt: levelUpperBound(level) + 1
  };
}

export function territoryLimitForLevel(level) {
  const safeLevel = Math.max(1, Math.floor(Number(level) || 1));
  return Math.min(4, safeLevel);
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
  for (const goal of DAILY_LEGO_GOALS) pet.daily.legoGoals[goal.key] = Boolean(pet.daily.legoGoals[goal.key]);
  return pet.daily;
}

export function resetDailyProgress(pet) {
  pet.daily.goalCounters = { life: 0, mini: 0, fishing: 0, mating: 0, poke: 0 };
  pet.daily.legoGoals = Object.fromEntries(DAILY_LEGO_GOALS.map((goal) => [goal.key, false]));
}

export function awardLegoPower(pet, amount = 1, reason = '', date = new Date()) {
  const safeAmount = Math.max(0, Math.floor(Number(amount) || 0));
  if (safeAmount <= 0) return { amount: 0, oldLevel: levelForPower(pet.stats?.legoPower), newLevel: levelForPower(pet.stats?.legoPower), leveledUp: false, reason };
  pet.stats ??= {};
  pet.records ??= {};
  const oldLevel = levelForPower(pet.stats.legoPower);
  pet.stats.legoPower = Math.max(1, Math.floor(Number(pet.stats.legoPower) || 1)) + safeAmount;
  const newLevel = levelForPower(pet.stats.legoPower);
  pet.records.legoPowerEarned = Math.max(0, Math.floor(Number(pet.records.legoPowerEarned) || 0)) + safeAmount;
  pet.records.maxLevel = Math.max(Math.floor(Number(pet.records.maxLevel) || 1), newLevel);
  if (newLevel > oldLevel) pet.levelReachedAt = date.toISOString();
  return { amount: safeAmount, oldLevel, newLevel, leveledUp: newLevel > oldLevel, reason };
}

export function completeDailyGoal(pet, key, date = new Date()) {
  ensureDailyProgress(pet, date);
  if (!DAILY_LEGO_GOALS.some((goal) => goal.key === key)) return { awarded: false, amount: 0 };
  if (pet.daily.legoGoals[key]) return { awarded: false, amount: 0 };
  pet.daily.legoGoals[key] = true;
  const award = awardLegoPower(pet, 1, key, date);
  let levelUpBonus = false;
  if (award.leveledUp && key !== 'levelUp' && !pet.daily.legoGoals.levelUp) {
    pet.daily.legoGoals.levelUp = true;
    awardLegoPower(pet, 1, 'levelUp', date);
    levelUpBonus = true;
  }
  return { awarded: true, ...award, levelUpBonus };
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
