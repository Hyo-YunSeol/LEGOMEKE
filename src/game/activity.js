import { BODY_STAGES } from './constants.js';

function bodyStageForValue(body) {
  const value = Math.max(BODY_STAGES[0]?.min ?? 60, Number.isFinite(Number(body)) ? Number(body) : BODY_STAGES[0]?.min ?? 60);
  return BODY_STAGES.find((stage) => value >= stage.min && value <= stage.max) ?? BODY_STAGES.at(-1);
}

export function interactionHungerCostForBody(body) {
  const stage = bodyStageForValue(body);
  return Math.max(1, Math.floor(Number(stage?.activityHungerCost) || 1));
}


const LIFE_HUNGER_COSTS = Object.freeze({
  1: Object.freeze({ work: 10, rest: 5, exercise: 15 }),
  2: Object.freeze({ work: 11, rest: 5, exercise: 16 }),
  3: Object.freeze({ work: 12, rest: 6, exercise: 17 }),
  4: Object.freeze({ work: 13, rest: 6, exercise: 18 }),
  5: Object.freeze({ work: 14, rest: 7, exercise: 19 }),
  6: Object.freeze({ work: 14, rest: 7, exercise: 20 })
});

export function lifeHungerCostsForBody(body) {
  const tier = interactionHungerCostForBody(body);
  return { ...(LIFE_HUNGER_COSTS[tier] ?? LIFE_HUNGER_COSTS[6]) };
}

export function consumeInteractionHunger(pet, date = new Date()) {
  if (!pet?.stats) return { cost: 0, deducted: 0, before: 0, after: 0 };
  const cost = interactionHungerCostForBody(pet.stats.body);
  const before = Math.max(0, Math.min(100, Math.round(Number(pet.stats.hunger) || 0)));
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
  return { cost, deducted: before - after, before, after };
}
