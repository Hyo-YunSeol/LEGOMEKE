import { gameRankingSeasonWindow } from '../lib/time.js';

export const GAME_RANKING_PRIZES = Object.freeze([500, 300, 100]);

function int(value) { return Math.max(0, Math.floor(Number(value) || 0)); }
function asTime(value) { const t = new Date(value ?? '').getTime(); return Number.isFinite(t) ? t : Number.MAX_SAFE_INTEGER; }
function alivePets(state) { return Object.values(state.pets ?? {}).filter((pet) => pet?.alive); }

function reactionRows(state) {
  return alivePets(state).map((pet) => ({ pet, value: int(pet.records?.seasonBestReactionMs), achievedAt: pet.records?.seasonBestReactionAt }))
    .filter((row) => row.value > 0)
    .sort((a, b) => a.value - b.value || asTime(a.achievedAt) - asTime(b.achievedAt) || a.pet.displayName.localeCompare(b.pet.displayName, 'ko'));
}

function appleRows(state) {
  return alivePets(state).map((pet) => ({ pet, value: int(pet.records?.appleBestScore), achievedAt: pet.records?.appleBestAt }))
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value || asTime(a.achievedAt) - asTime(b.achievedAt) || a.pet.displayName.localeCompare(b.pet.displayName, 'ko'));
}

function omokRows(state) {
  return alivePets(state).map((pet) => ({
    pet, wins: int(pet.records?.omokWins), draws: int(pet.records?.omokDraws), losses: int(pet.records?.omokLosses)
  })).filter((row) => row.wins || row.draws || row.losses)
    .sort((a, b) => b.wins - a.wins || a.losses - b.losses || b.draws - a.draws || a.pet.displayName.localeCompare(b.pet.displayName, 'ko'));
}

function awardRows(rows) {
  const awarded = [];
  for (let index = 0; index < Math.min(3, rows.length); index += 1) {
    const row = rows[index];
    const prize = GAME_RANKING_PRIZES[index];
    row.pet.stats ??= {};
    row.pet.records ??= {};
    row.pet.stats.points = int(row.pet.stats.points) + prize;
    row.pet.records.pointsEarned = int(row.pet.records.pointsEarned) + prize;
    row.pet.records.maxPoints = Math.max(int(row.pet.records.maxPoints), row.pet.stats.points);
    awarded.push({ rank: index + 1, petId: row.pet.id, displayName: row.pet.displayName, prize });
  }
  return awarded;
}

function newsLine(icon, label, awarded) {
  if (!awarded.length) return `${icon} ${label} 시즌 종료! 참가 기록 없음`;
  return `${icon} ${label} 시즌 종료! ${awarded.map((item) => `${item.rank}위 ${item.displayName} ${item.prize}P`).join(' · ')}`;
}

function resetSeasonRecords(state) {
  for (const pet of Object.values(state.pets ?? {})) {
    if (!pet?.alive) continue;
    pet.records ??= {};
    pet.records.seasonBestReactionMs = 0;
    pet.records.seasonBestReactionAt = null;
    pet.records.appleBestScore = 0;
    pet.records.appleBestAt = null;
    pet.records.omokWins = 0;
    pet.records.omokDraws = 0;
    pet.records.omokLosses = 0;
  }
}

export function normalizeGameRankingSeason(raw, date = new Date()) {
  const current = gameRankingSeasonWindow(date);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !String(raw.key ?? '').startsWith('season-')) {
    return { ...current, initializedAt: date.toISOString(), lastSettledAt: null };
  }
  const startsAt = new Date(raw.startsAt ?? '').getTime();
  const endsAt = new Date(raw.endsAt ?? '').getTime();
  return {
    key: String(raw.key),
    startsAt: Number.isFinite(startsAt) ? new Date(startsAt).toISOString() : current.startsAt,
    endsAt: Number.isFinite(endsAt) ? new Date(endsAt).toISOString() : current.endsAt,
    initializedAt: Number.isFinite(new Date(raw.initializedAt ?? '').getTime()) ? new Date(raw.initializedAt).toISOString() : date.toISOString(),
    lastSettledAt: Number.isFinite(new Date(raw.lastSettledAt ?? '').getTime()) ? new Date(raw.lastSettledAt).toISOString() : null
  };
}

export function processGameRankingSeason(state, date = new Date()) {
  const current = gameRankingSeasonWindow(date);
  state.gameRankingSeason = normalizeGameRankingSeason(state.gameRankingSeason, date);
  if (state.gameRankingSeason.key === current.key) {
    state.gameRankingSeason.startsAt = current.startsAt;
    state.gameRankingSeason.endsAt = current.endsAt;
    return { changed: false, events: [], awards: {} };
  }

  const reaction = awardRows(reactionRows(state));
  const apple = awardRows(appleRows(state));
  const omok = awardRows(omokRows(state));
  const champions = [
    ['reaction', reaction[0]], ['apple', apple[0]], ['omok', omok[0]]
  ];
  for (const [key, winner] of champions) {
    if (!winner?.petId || !state.pets?.[winner.petId]) continue;
    state.pets[winner.petId].seasonBadges ??= {};
    state.pets[winner.petId].seasonBadges[key] = current.endsAt;
  }
  const events = [
    { text: newsLine('⚡', '번개반응', reaction), type: 'game-season', petIds: reaction.map((item) => item.petId) },
    { text: newsLine('🍎', '사과게임', apple), type: 'game-season', petIds: apple.map((item) => item.petId) },
    { text: newsLine('⚫', '오목', omok), type: 'game-season', petIds: omok.map((item) => item.petId) }
  ];
  resetSeasonRecords(state);
  state.gameRankingSeason = { ...current, initializedAt: state.gameRankingSeason.initializedAt, lastSettledAt: date.toISOString() };
  return { changed: true, events, awards: { reaction, apple, omok } };
}
