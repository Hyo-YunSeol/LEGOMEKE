import { BODY_STAGES } from './constants.js';

function bodyStageForValue(body) {
  const value = Math.max(BODY_STAGES[0]?.min ?? 60, Number.isFinite(Number(body)) ? Number(body) : BODY_STAGES[0]?.min ?? 60);
  return BODY_STAGES.find((stage) => value >= stage.min && value <= stage.max) ?? BODY_STAGES.at(-1);
}

export function interactionHungerCostForBody(body) {
  const stage = bodyStageForValue(body);
  return Math.max(1, Math.floor(Number(stage?.activityHungerCost) || 1));
}

export const RESOURCE_ZERO_LOCK_MS = 10 * 60_000;

function validZeroAt(value) {
  const timestamp = new Date(value ?? '').getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function staminaActionLock(pet, date = new Date()) {
  if (!pet?.stats || Number(pet.stats.stamina) > 0) return { locked: false, remainingMs: 0 };
  pet.survival ??= {};
  let zeroAt = validZeroAt(pet.survival.staminaZeroAt);
  if (zeroAt == null) {
    pet.survival.staminaZeroAt = date.toISOString();
    zeroAt = date.getTime();
  }
  const elapsed = Math.max(0, date.getTime() - zeroAt);
  return { locked: elapsed >= RESOURCE_ZERO_LOCK_MS, remainingMs: Math.max(0, RESOURCE_ZERO_LOCK_MS - elapsed), zeroAt: new Date(zeroAt).toISOString() };
}

export function hungerActionLock(pet, date = new Date()) {
  if (!pet?.stats || Number(pet.stats.hunger) > 0) return { locked: false, remainingMs: 0 };
  pet.survival ??= {};
  let zeroAt = validZeroAt(pet.survival.hungerZeroAt);
  if (zeroAt == null) {
    pet.survival.hungerZeroAt = date.toISOString();
    pet.survival.hungerPenaltyHoursApplied = 0;
    zeroAt = date.getTime();
  }
  const elapsed = Math.max(0, date.getTime() - zeroAt);
  return { locked: elapsed >= RESOURCE_ZERO_LOCK_MS, remainingMs: Math.max(0, RESOURCE_ZERO_LOCK_MS - elapsed), zeroAt: new Date(zeroAt).toISOString() };
}

export function staminaLockMessage(activity = '이 활동') {
  return `체력이 0인 상태가 10분 이상 지속되어 지금은 ${activity} 이용이 제한됩니다. 쉬거나 에너지드링크로 체력을 회복해주세요.`;
}

export function hungerLockMessage(activity = '이 활동') {
  return `배고파서 지금은 ${activity} 이용이 제한됩니다. 음식을 먹어 포만감을 회복해주세요.`;
}


const LIFE_HUNGER_COSTS = Object.freeze({
  1: Object.freeze({ work: 10, rest: 5, exercise: 15 }),
  2: Object.freeze({ work: 11, rest: 5, exercise: 16 }),
  3: Object.freeze({ work: 12, rest: 6, exercise: 17 }),
  4: Object.freeze({ work: 13, rest: 6, exercise: 18 }),
  5: Object.freeze({ work: 14, rest: 7, exercise: 19 }),
  6: Object.freeze({ work: 15, rest: 7, exercise: 20 }),
  7: Object.freeze({ work: 16, rest: 8, exercise: 22 }),
  8: Object.freeze({ work: 17, rest: 8, exercise: 23 }),
  9: Object.freeze({ work: 18, rest: 9, exercise: 24 }),
  10: Object.freeze({ work: 18, rest: 9, exercise: 25 })
});

export function lifeHungerCostsForBody(body) {
  const tier = interactionHungerCostForBody(body);
  return { ...(LIFE_HUNGER_COSTS[tier] ?? LIFE_HUNGER_COSTS[10]) };
}

function activeUntil(value, date = new Date()) {
  const timestamp = new Date(value ?? '').getTime();
  return Number.isFinite(timestamp) && timestamp > date.getTime() ? timestamp : null;
}

export function timedEffectActive(pet, effect, date = new Date()) {
  return Boolean(activeUntil(pet?.effects?.[effect], date));
}

export function applyTimedEffects(pet, date = new Date()) {
  if (!pet?.stats) return { changed: false, staminaActive: false, hungerActive: false };
  pet.effects = pet.effects && typeof pet.effects === 'object' && !Array.isArray(pet.effects) ? pet.effects : {};
  let changed = false;
  const staminaUntil = activeUntil(pet.effects.staminaFullUntil, date);
  const hungerUntil = activeUntil(pet.effects.hungerFullUntil, date);

  const normalizedStaminaUntil = staminaUntil ? new Date(staminaUntil).toISOString() : null;
  const normalizedHungerUntil = hungerUntil ? new Date(hungerUntil).toISOString() : null;
  if (pet.effects.staminaFullUntil !== normalizedStaminaUntil) changed = true;
  if (pet.effects.hungerFullUntil !== normalizedHungerUntil) changed = true;
  pet.effects.staminaFullUntil = normalizedStaminaUntil;
  pet.effects.hungerFullUntil = normalizedHungerUntil;

  if (staminaUntil && Number(pet.stats.stamina) !== 100) {
    pet.stats.stamina = 100;
    changed = true;
  }
  if (hungerUntil && Number(pet.stats.hunger) !== 100) {
    pet.stats.hunger = 100;
    changed = true;
  }
  if (!staminaUntil && pet.stats.stamina > 0 && pet.survival) {
    if (pet.survival.staminaZeroAt) changed = true;
    pet.survival.staminaZeroAt = null;
  }
  if (!hungerUntil && pet.stats.hunger > 0 && pet.survival) {
    if (pet.survival.hungerZeroAt || pet.survival.hungerPenaltyHoursApplied) changed = true;
    pet.survival.hungerZeroAt = null;
    pet.survival.hungerPenaltyHoursApplied = 0;
  }
  return { changed, staminaActive: Boolean(staminaUntil), hungerActive: Boolean(hungerUntil) };
}

export function consumeStamina(pet, costValue, date = new Date()) {
  if (!pet?.stats) return { cost: 0, deducted: 0, before: 0, after: 0, maintained: false };
  const cost = Math.max(0, Math.round(Number(costValue) || 0));
  const effects = applyTimedEffects(pet, date);
  const before = Math.max(0, Math.min(100, Math.round(Number(pet.stats.stamina) || 0)));
  if (effects.staminaActive) return { cost, deducted: 0, before: 100, after: 100, maintained: true };
  const after = Math.max(0, before - cost);
  pet.stats.stamina = after;
  pet.survival ??= {};
  if (after === 0) {
    const zeroAt = validZeroAt(pet.survival.staminaZeroAt);
    if (before > 0 || zeroAt == null) pet.survival.staminaZeroAt = date.toISOString();
  } else pet.survival.staminaZeroAt = null;
  return { cost, deducted: before - after, before, after, maintained: false };
}

export function restoreStamina(pet, amountValue, date = new Date()) {
  if (!pet?.stats) return { amount: 0, restored: 0, before: 0, after: 0, maintained: false };
  const amount = Math.max(0, Math.round(Number(amountValue) || 0));
  const effects = applyTimedEffects(pet, date);
  const before = Math.max(0, Math.min(100, Math.round(Number(pet.stats.stamina) || 0)));
  if (effects.staminaActive) return { amount, restored: 0, before: 100, after: 100, maintained: true };
  const after = Math.min(100, before + amount);
  pet.stats.stamina = after;
  pet.survival ??= {};
  if (after > 0) pet.survival.staminaZeroAt = null;
  return { amount, restored: after - before, before, after, maintained: false };
}

export function consumeHunger(pet, costValue, date = new Date()) {
  if (!pet?.stats) return { cost: 0, deducted: 0, before: 0, after: 0, maintained: false };
  const cost = Math.max(0, Math.round(Number(costValue) || 0));
  const effects = applyTimedEffects(pet, date);
  const before = Math.max(0, Math.min(100, Math.round(Number(pet.stats.hunger) || 0)));
  if (effects.hungerActive) return { cost, deducted: 0, before: 100, after: 100, maintained: true };
  const after = Math.max(0, before - cost);
  pet.stats.hunger = after;
  pet.survival ??= {};
  if (after === 0) {
    const zeroAt = new Date(pet.survival.hungerZeroAt ?? '').getTime();
    if (before > 0 || !Number.isFinite(zeroAt)) {
      pet.survival.hungerZeroAt = date.toISOString();
      pet.survival.hungerPenaltyHoursApplied = 0;
    }
  }
  return { cost, deducted: before - after, before, after, maintained: false };
}

export function consumeInteractionHunger(pet, date = new Date()) {
  const cost = interactionHungerCostForBody(pet.stats.body);
  return consumeHunger(pet, cost, date);
}
