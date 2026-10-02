import { GAME_DAY_HOURS } from '../game/constants.js';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const GAME_DAY_MS = GAME_DAY_HOURS * 60 * 60 * 1000;
const RANKING_SEASON_MS = 72 * 60 * 60 * 1000;
const GAME_DAYS_PER_CALENDAR_DAY = 24 / GAME_DAY_HOURS;
const GAME_DAY_KEY_PATTERN = /^(\d{4}-\d{2}-\d{2})(?:@(\d+))?$/u;

export function kstDateKey(date = new Date()) {
  const shifted = new Date(date.getTime() + KST_OFFSET_MS);
  return shifted.toISOString().slice(0, 10);
}

export function kstDateTime(date = new Date()) {
  const shifted = new Date(date.getTime() + KST_OFFSET_MS);
  return shifted.toISOString().replace('Z', '+09:00');
}

export function kstHour(date = new Date()) {
  return new Date(date.getTime() + KST_OFFSET_MS).getUTCHours();
}

export function kstDaypart(date = new Date()) {
  const hour = kstHour(date);
  if (hour < 11) return '아침';
  if (hour < 17) return '낮';
  if (hour < 22) return '저녁';
  return '밤';
}

export function gameDaySlot(date = new Date()) {
  return Math.floor(kstHour(date) / GAME_DAY_HOURS);
}

export function gameDayKey(date = new Date()) {
  return `${kstDateKey(date)}@${gameDaySlot(date)}`;
}


export function gameRankingSeasonWindow(date = new Date()) {
  const shiftedMs = date.getTime() + KST_OFFSET_MS;
  const ordinal = Math.floor(shiftedMs / RANKING_SEASON_MS);
  const startShiftedMs = ordinal * RANKING_SEASON_MS;
  const endShiftedMs = startShiftedMs + RANKING_SEASON_MS;
  return {
    key: `season-${ordinal}`,
    startsAt: new Date(startShiftedMs - KST_OFFSET_MS).toISOString(),
    endsAt: new Date(endShiftedMs - KST_OFFSET_MS).toISOString()
  };
}

export function gameRankingSeasonKey(date = new Date()) {
  return gameRankingSeasonWindow(date).key;
}

export function nextGameRankingSeasonAt(date = new Date()) {
  return gameRankingSeasonWindow(date).endsAt;
}

export function nextGameDayAt(date = new Date()) {
  const shiftedMs = date.getTime() + KST_OFFSET_MS;
  const nextShiftedBoundary = (Math.floor(shiftedMs / GAME_DAY_MS) + 1) * GAME_DAY_MS;
  return new Date(nextShiftedBoundary - KST_OFFSET_MS).toISOString();
}

export function gameDayWindow(date = new Date()) {
  const endsAt = nextGameDayAt(date);
  const endMs = new Date(endsAt).getTime();
  return {
    seasonId: gameDayKey(date),
    startsAt: new Date(endMs - GAME_DAY_MS).toISOString(),
    endsAt
  };
}

function gameDayOrdinal(key) {
  const match = String(key ?? '').match(GAME_DAY_KEY_PATTERN);
  if (!match || match[2] == null) return null;
  const slot = Number(match[2]);
  if (!Number.isInteger(slot) || slot < 0 || slot >= GAME_DAYS_PER_CALENDAR_DAY) return null;
  const midnight = Date.parse(`${match[1]}T00:00:00Z`);
  if (!Number.isFinite(midnight)) return null;
  return Math.floor(midnight / GAME_DAY_MS) + slot;
}

export function gameDaysBetweenKeys(fromKey, toKey) {
  if (fromKey === toKey) return 0;
  const fromOrdinal = gameDayOrdinal(fromKey);
  const toOrdinal = gameDayOrdinal(toKey);

  // 기존 배포판의 YYYY-MM-DD 형식은 첫 전환 때 한 게임 일만 지난 것으로 처리한다.
  if (fromOrdinal == null || toOrdinal == null) return 1;
  return Math.max(0, toOrdinal - fromOrdinal);
}

export function daysBetweenDateKeys(fromKey, toKey) {
  const from = new Date(`${fromKey}T00:00:00Z`);
  const to = new Date(`${toKey}T00:00:00Z`);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) return 0;
  return Math.max(0, Math.floor((to - from) / 86_400_000));
}

export function coupleDayCount(startedAt, date = new Date()) {
  if (startedAt === null || startedAt === undefined || startedAt === '') return null;
  const started = new Date(startedAt);
  if (!Number.isFinite(started.getTime()) || !Number.isFinite(date?.getTime?.())) return null;
  return daysBetweenDateKeys(kstDateKey(started), kstDateKey(date)) + 1;
}
