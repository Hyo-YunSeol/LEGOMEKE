import { BODY_STAGES } from './constants.js';

function bodyStageForValue(body) {
  const value = Math.max(BODY_STAGES[0]?.min ?? 60, Number.isFinite(Number(body)) ? Number(body) : BODY_STAGES[0]?.min ?? 60);
  return BODY_STAGES.find((stage) => value >= stage.min && value <= stage.max) ?? BODY_STAGES.at(-1);
}

export function interactionHungerCostForBody(body) {
  const stage = bodyStageForValue(body);
  return Math.max(1, Math.floor(Number(stage?.activityHungerCost) || 1));
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
