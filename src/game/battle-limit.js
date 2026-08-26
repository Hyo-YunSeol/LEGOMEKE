export const BATTLE_PLAYS_PER_DAY = 30;
export const BATTLE_TICKET_BONUS = 20;

const nni = (value) => Math.max(0, Math.floor(Number.isFinite(Number(value)) ? Number(value) : 0));

export function normalizeBattleDaily(pet) {
  pet.daily ??= {};
  pet.daily.battlePlayed = nni(pet.daily.battlePlayed);
  pet.daily.battleBonus = Math.min(100000, nni(pet.daily.battleBonus));
  const limit = battleLimit(pet);
  if (pet.daily.battlePlayed > limit) pet.daily.battlePlayed = limit;
  return pet.daily;
}

export function battleLimit(pet) {
  return BATTLE_PLAYS_PER_DAY + Math.min(100000, nni(pet?.daily?.battleBonus));
}

export function battleRemaining(pet) {
  normalizeBattleDaily(pet);
  return Math.max(0, battleLimit(pet) - pet.daily.battlePlayed);
}

export function canStartBattleForPets(pets) {
  for (const pet of pets) {
    if (!pet?.alive) return { ok: false, message: '대전 참가자를 찾을 수 없습니다.' };
    normalizeBattleDaily(pet);
    if (battleRemaining(pet) <= 0) return { ok: false, message: `${pet.displayName}의 이번 게임 하루 1:1/대전 이용 횟수를 모두 사용했습니다. 상점에서 +20회권을 구매할 수 있습니다.` };
  }
  return { ok: true };
}

export function consumeBattleForPets(pets) {
  const check = canStartBattleForPets(pets);
  if (!check.ok) return check;
  for (const pet of pets) pet.daily.battlePlayed += 1;
  return { ok: true };
}
