import { gameDayKey } from '../lib/time.js';

export const BATTLE_PLAYS_PER_DAY = 30;
export const BATTLE_TICKET_BONUS = 20;

const nni = (value) => Math.max(0, Math.floor(Number.isFinite(Number(value)) ? Number(value) : 0));

export function normalizeBattleDaily(pet, date = new Date()) {
  pet.daily ??= {};
  const currentBattleDate = gameDayKey(date);
  // 대전 횟수는 실시간 입력/웹소켓 경로에서도 직접 검증한다.
  // 공통 daily reset이 늦거나 건너뛰어져도 00/06/12/18시 경계를 넘긴 첫 대전 접근에서 반드시 초기화된다.
  const storedBattleDate = typeof pet.daily.battleDate === 'string' && pet.daily.battleDate
    ? pet.daily.battleDate
    : (typeof pet.daily.date === 'string' && pet.daily.date ? pet.daily.date : currentBattleDate);
  if (storedBattleDate !== currentBattleDate) {
    pet.daily.battlePlayed = 0;
    pet.daily.battleBonus = 0;
  }
  pet.daily.battleDate = currentBattleDate;
  pet.daily.battlePlayed = nni(pet.daily.battlePlayed);
  pet.daily.battleBonus = Math.min(100000, nni(pet.daily.battleBonus));
  const limit = battleLimit(pet);
  if (pet.daily.battlePlayed > limit) pet.daily.battlePlayed = limit;
  return pet.daily;
}

export function battleLimit(pet) {
  return BATTLE_PLAYS_PER_DAY + Math.min(100000, nni(pet?.daily?.battleBonus));
}

export function battleRemaining(pet, date = new Date()) {
  normalizeBattleDaily(pet, date);
  return Math.max(0, battleLimit(pet) - pet.daily.battlePlayed);
}

export function canStartBattleForPets(pets, date = new Date()) {
  for (const pet of pets) {
    if (!pet?.alive) return { ok: false, message: '대전 참가자를 찾을 수 없습니다.' };
    normalizeBattleDaily(pet, date);
    if (battleRemaining(pet, date) <= 0) return { ok: false, message: `${pet.displayName}의 이번 게임 하루 1:1/대전 이용 횟수를 모두 사용했습니다. 상점에서 +20회권을 구매할 수 있습니다.` };
  }
  return { ok: true };
}

export function consumeBattleForPets(pets, date = new Date()) {
  const check = canStartBattleForPets(pets, date);
  if (!check.ok) return check;
  for (const pet of pets) pet.daily.battlePlayed += 1;
  return { ok: true };
}
