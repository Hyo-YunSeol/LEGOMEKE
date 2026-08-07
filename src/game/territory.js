import { id } from '../lib/ids.js';
import { gameDayKey, nextGameDayAt } from '../lib/time.js';
import {
  TERRITORY_GOLDEN_REVEAL_HOURS_BEFORE_END,
  TERRITORY_SIZE,
  TERRITORY_WIN_POINTS
} from './constants.js';
import { consumeInteractionHunger } from './activity.js';
import { levelForPower, territoryLimitForLevel } from './progression.js';

const nowIso = (date = new Date()) => date.toISOString();
const cellKey = (row, col) => `${row}:${col}`;
const parseCellKey = (key) => {
  const [row, col] = String(key).split(':').map(Number);
  return { row, col };
};

function activePet(state, petId) {
  const pet = state?.pets?.[petId];
  return pet?.alive && !pet.integrity?.broken ? pet : null;
}

function addTerritoryNews(state, text, petIds = [], date = new Date()) {
  state.publicEvents ??= [];
  state.publicEvents.unshift({ id: id('event'), text, type: 'territory', petIds, createdAt: nowIso(date) });
  state.publicEvents = state.publicEvents.slice(0, 10);
}

function randomGoldenCell() {
  return {
    row: Math.floor(Math.random() * TERRITORY_SIZE),
    col: Math.floor(Math.random() * TERRITORY_SIZE)
  };
}

function revealAtForEndsAt(endsAt) {
  const endMs = new Date(endsAt).getTime();
  const revealMs = endMs - TERRITORY_GOLDEN_REVEAL_HOURS_BEFORE_END * 60 * 60 * 1000;
  return new Date(Number.isFinite(revealMs) ? revealMs : Date.now()).toISOString();
}

export function initialTerritory(date = new Date(), seasonNumber = 1) {
  const endsAt = nextGameDayAt(date);
  return {
    version: 4,
    size: TERRITORY_SIZE,
    seasonId: gameDayKey(date),
    seasonNumber: Math.max(1, Math.floor(Number(seasonNumber) || 1)),
    startedAt: date.toISOString(),
    endsAt,
    goldenRevealAt: revealAtForEndsAt(endsAt),
    goldenRevealed: false,
    goldenRevealedAt: null,
    goldenCell: randomGoldenCell(),
    cells: {},
    lastResult: null,
    settledSeasonIds: []
  };
}

function validCellCoordinate(row, col) {
  return Number.isInteger(row) && Number.isInteger(col) && row >= 0 && row < TERRITORY_SIZE && col >= 0 && col < TERRITORY_SIZE;
}

function normalizedClaimedAt(value, fallbackDate) {
  const time = new Date(value ?? 0).getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : nowIso(fallbackDate);
}

function ensureOneHomePerOwner(territory) {
  const byOwner = new Map();
  for (const [key, cell] of Object.entries(territory.cells)) {
    const list = byOwner.get(cell.ownerPetId) ?? [];
    list.push([key, cell]);
    byOwner.set(cell.ownerPetId, list);
  }
  for (const entries of byOwner.values()) {
    entries.sort(([, a], [, b]) => new Date(a.claimedAt).getTime() - new Date(b.claimedAt).getTime());
    const declaredHomes = entries.filter(([, cell]) => cell.home);
    const homeKey = declaredHomes[0]?.[0] ?? entries[0]?.[0] ?? null;
    for (const [key, cell] of entries) cell.home = key === homeKey;
  }
}

export function normalizeTerritory(raw, state, date = new Date()) {
  const base = initialTerritory(date, 1);
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null;
  const legacySize = Math.floor(Number(source?.size) || (Math.floor(Number(source?.version) || 0) < 2 ? 15 : TERRITORY_SIZE));

  // 15x15 시절 데이터는 좌표 충돌 위험이 있어 새 4x4 시즌으로 안전하게 전환한다.
  if (source && legacySize !== TERRITORY_SIZE) {
    const migrated = initialTerritory(date, Math.max(1, Math.floor(Number(source.seasonNumber) || 1) + 1));
    migrated.lastResult = source.lastResult && typeof source.lastResult === 'object' && !Array.isArray(source.lastResult) ? source.lastResult : null;
    migrated.settledSeasonIds = Array.isArray(source.settledSeasonIds) ? [...new Set(source.settledSeasonIds.map(String))].slice(-24) : [];
    return migrated;
  }

  const territory = source ? { ...base, ...source } : base;
  territory.version = 4;
  territory.size = TERRITORY_SIZE;
  territory.seasonId = typeof territory.seasonId === 'string' && territory.seasonId ? territory.seasonId : gameDayKey(date);
  territory.seasonNumber = Math.max(1, Math.floor(Number(territory.seasonNumber) || 1));

  const startedAt = new Date(territory.startedAt ?? 0).getTime();
  territory.startedAt = Number.isFinite(startedAt) ? new Date(startedAt).toISOString() : date.toISOString();
  const endsAt = new Date(territory.endsAt ?? 0).getTime();
  territory.endsAt = Number.isFinite(endsAt) ? new Date(endsAt).toISOString() : nextGameDayAt(date);
  const revealAt = new Date(territory.goldenRevealAt ?? 0).getTime();
  territory.goldenRevealAt = Number.isFinite(revealAt) ? new Date(revealAt).toISOString() : revealAtForEndsAt(territory.endsAt);
  territory.goldenRevealed = Boolean(territory.goldenRevealed);
  territory.goldenRevealedAt = Number.isFinite(new Date(territory.goldenRevealedAt ?? 0).getTime())
    ? new Date(territory.goldenRevealedAt).toISOString()
    : null;

  const goldenRow = Math.floor(Number(territory.goldenCell?.row));
  const goldenCol = Math.floor(Number(territory.goldenCell?.col));
  territory.goldenCell = validCellCoordinate(goldenRow, goldenCol) ? { row: goldenRow, col: goldenCol } : randomGoldenCell();

  const rawCells = territory.cells && typeof territory.cells === 'object' && !Array.isArray(territory.cells) ? territory.cells : {};
  territory.cells = {};
  for (const [key, cell] of Object.entries(rawCells)) {
    const { row, col } = parseCellKey(key);
    const ownerPet = activePet(state, cell?.ownerPetId);
    if (!validCellCoordinate(row, col) || !ownerPet) continue;
    territory.cells[key] = {
      ownerPetId: ownerPet.id,
      claimedAt: normalizedClaimedAt(cell?.claimedAt, date),
      home: Boolean(cell?.home)
    };
  }
  // v3까지는 본진 필드가 없었다. 각 소유자의 가장 오래된 칸을 본진으로 승격한다.
  ensureOneHomePerOwner(territory);

  territory.settledSeasonIds = Array.isArray(territory.settledSeasonIds)
    ? [...new Set(territory.settledSeasonIds.map(String))].slice(-24)
    : [];
  territory.lastResult = territory.lastResult && typeof territory.lastResult === 'object' && !Array.isArray(territory.lastResult)
    ? territory.lastResult
    : null;
  return territory;
}

export function territoryCounts(state) {
  const territory = state?.territory;
  const counts = {};
  if (!territory?.cells || typeof territory.cells !== 'object') return counts;
  for (const cell of Object.values(territory.cells)) {
    if (!cell?.ownerPetId) continue;
    counts[cell.ownerPetId] = (counts[cell.ownerPetId] ?? 0) + 1;
  }
  return counts;
}

function goldenOwnerId(territory) {
  return territory.cells[cellKey(territory.goldenCell.row, territory.goldenCell.col)]?.ownerPetId ?? null;
}

function playerRows(state, territory) {
  const counts = {};
  for (const cell of Object.values(territory.cells)) counts[cell.ownerPetId] = (counts[cell.ownerPetId] ?? 0) + 1;
  const goldenOwner = goldenOwnerId(territory);
  return Object.entries(counts)
    .filter(([petId]) => Boolean(activePet(state, petId)))
    .map(([petId, count]) => ({
      petId,
      displayName: state.pets[petId]?.displayName ?? '사라진 레고',
      count,
      hasGolden: territory.goldenRevealed && goldenOwner === petId,
      actuallyHasGolden: goldenOwner === petId,
      firstClaimAt: Object.values(territory.cells)
        .filter((cell) => cell.ownerPetId === petId)
        .map((cell) => new Date(cell.claimedAt).getTime())
        .filter(Number.isFinite)
        .sort((a, b) => a - b)[0] ?? Number.MAX_SAFE_INTEGER
    }))
    .sort((a, b) => b.count - a.count || a.firstClaimAt - b.firstClaimAt || a.displayName.localeCompare(b.displayName, 'ko'));
}

function denseRanks(players) {
  let rank = 0;
  let previousCount = null;
  return players.map((player) => {
    if (previousCount !== player.count) rank += 1;
    previousCount = player.count;
    return { ...player, rank };
  });
}

export function territoryRanking(state, { settlement = false } = {}) {
  const territory = state.territory = normalizeTerritory(state.territory, state);
  const players = playerRows(state, territory);
  if (!players.length) return { winner: null, entries: [], topCount: 0 };

  const topCount = players[0].count;
  const top = players.filter((player) => player.count === topCount);
  const goldenVisibleForRanking = territory.goldenRevealed || settlement;
  const winner = top.length === 1
    ? top[0]
    : goldenVisibleForRanking
      ? top.find((player) => player.actuallyHasGolden) ?? null
      : null;

  if (!goldenVisibleForRanking) {
    return {
      winner: top.length === 1 ? top[0] : null,
      entries: denseRanks(players).map(({ actuallyHasGolden, ...entry }) => entry),
      topCount
    };
  }

  if (!winner) {
    // 단독 1위가 결정되지 않은 결승 동률은 보상 대상이 없으므로 공동 2위로 표시한다.
    const topIds = new Set(top.map((player) => player.petId));
    const rest = players.filter((player) => !topIds.has(player.petId));
    const entries = top.map((player) => ({ ...player, rank: 2 }));
    let nextRank = 3;
    let previousCount = null;
    for (const player of rest) {
      if (previousCount !== player.count) {
        if (previousCount !== null) nextRank += 1;
        previousCount = player.count;
      }
      entries.push({ ...player, rank: nextRank });
    }
    return { winner: null, entries: entries.map(({ actuallyHasGolden, ...entry }) => entry), topCount };
  }

  const remaining = players.filter((player) => player.petId !== winner.petId);
  const entries = [{ ...winner, rank: 1 }];
  let nextRank = 2;
  let previousCount = null;
  for (const player of remaining) {
    if (previousCount !== player.count) {
      if (previousCount !== null) nextRank += 1;
      previousCount = player.count;
    }
    entries.push({ ...player, rank: nextRank });
  }
  return { winner, entries: entries.map(({ actuallyHasGolden, ...entry }) => entry), topCount };
}

function settleCurrentSeason(state, date = new Date()) {
  state.territory = normalizeTerritory(state.territory, state, date);
  if (state.territory.settledSeasonIds.includes(state.territory.seasonId)) return { changed: false, result: state.territory.lastResult };
  const ranking = territoryRanking(state, { settlement: true });
  const territory = state.territory;
  let reward = 0;
  if (ranking.winner) {
    const pet = activePet(state, ranking.winner.petId);
    if (pet) {
      pet.stats.points += TERRITORY_WIN_POINTS;
      pet.records.pointsEarned += TERRITORY_WIN_POINTS;
      pet.records.territoryWins += 1;
      pet.records.maxPoints = Math.max(Number(pet.records.maxPoints) || 0, pet.stats.points);
      reward = TERRITORY_WIN_POINTS;
    }
  }
  const result = {
    seasonId: territory.seasonId,
    seasonNumber: territory.seasonNumber,
    endedAt: nowIso(date),
    winnerPetId: ranking.winner?.petId ?? null,
    winnerDisplayName: ranking.winner?.displayName ?? null,
    winnerTerritory: ranking.winner?.count ?? 0,
    reward,
    ranking: ranking.entries.slice(0, 3).map((entry) => ({ rank: entry.rank, petId: entry.petId, displayName: entry.displayName, count: entry.count, hasGolden: entry.hasGolden }))
  };
  territory.lastResult = result;
  territory.settledSeasonIds.push(territory.seasonId);
  territory.settledSeasonIds = territory.settledSeasonIds.slice(-24);

  if (ranking.winner) {
    const seconds = ranking.entries.filter((entry) => entry.rank === 2).map((entry) => entry.displayName);
    const secondText = seconds.length ? ` 공동 2위 ${seconds.join(', ')}.` : '';
    addTerritoryNews(state, `제${territory.seasonNumber}회 레고 영토전 종료. 1위 ${ranking.winner.displayName} · 영토 ${ranking.winner.count}칸 · ${TERRITORY_WIN_POINTS}P 획득.${secondText}`, ranking.entries.slice(0, 3).map((entry) => entry.petId), date);
  } else if (ranking.topCount > 0) {
    const names = ranking.entries.filter((entry) => entry.rank === 2).map((entry) => entry.displayName);
    addTerritoryNews(state, `제${territory.seasonNumber}회 레고 영토전은 황금칸을 차지한 단독 1위가 없어 보상 없이 종료되었습니다. 공동 2위 ${names.join(', ')}.`, ranking.entries.filter((entry) => entry.rank === 2).map((entry) => entry.petId), date);
  }
  return { changed: true, result };
}

function revealGoldenIfDue(state, date = new Date()) {
  const territory = state.territory;
  if (territory.goldenRevealed) return false;
  const revealMs = new Date(territory.goldenRevealAt).getTime();
  const endMs = new Date(territory.endsAt).getTime();
  if (!Number.isFinite(revealMs) || date.getTime() < revealMs || date.getTime() >= endMs) return false;
  territory.goldenRevealed = true;
  territory.goldenRevealedAt = nowIso(date);
  addTerritoryNews(state, `👑 제${territory.seasonNumber}회 영토전의 황금 영토가 공개되었습니다!`, [], date);
  return true;
}

export function processTerritorySeason(state, date = new Date()) {
  state.territory = normalizeTerritory(state.territory, state, date);
  const currentId = gameDayKey(date);
  const endMs = new Date(state.territory.endsAt).getTime();
  if (state.territory.seasonId === currentId && endMs > date.getTime()) {
    return { changed: revealGoldenIfDue(state, date), revealed: state.territory.goldenRevealed };
  }
  const settled = settleCurrentSeason(state, date);
  const next = initialTerritory(date, state.territory.seasonNumber + 1);
  next.lastResult = settled.result ?? state.territory.lastResult;
  next.settledSeasonIds = [...state.territory.settledSeasonIds];
  state.territory = next;
  addTerritoryNews(state, `제${next.seasonNumber}회 레고 영토전이 시작되었습니다.`, [], date);
  const revealed = revealGoldenIfDue(state, date);
  return { changed: true, settled: settled.result, revealed };
}

function ownedEntries(territory, petId) {
  return Object.entries(territory.cells).filter(([, cell]) => cell.ownerPetId === petId);
}

function oldestMovableOwnedCell(territory, petId, exceptKey = null) {
  return ownedEntries(territory, petId)
    .filter(([key, cell]) => key !== exceptKey && !cell.home)
    .sort(([, a], [, b]) => new Date(a.claimedAt).getTime() - new Date(b.claimedAt).getTime())[0]?.[0] ?? null;
}

function isAdjacent8(territory, petId, row, col) {
  return ownedEntries(territory, petId).some(([key]) => {
    const owned = parseCellKey(key);
    const rowDistance = Math.abs(owned.row - row);
    const colDistance = Math.abs(owned.col - col);
    return rowDistance <= 1 && colDistance <= 1 && (rowDistance + colDistance > 0);
  });
}

export function claimTerritory(state, pet, rowValue, colValue, date = new Date()) {
  processTerritorySeason(state, date);
  const territory = state.territory;
  const row = Math.floor(Number(rowValue));
  const col = Math.floor(Number(colValue));
  if (!pet?.alive || pet.integrity?.broken) return { ok: false, message: '파손된 레고는 영토전에 참가할 수 없습니다.' };
  if (!validCellCoordinate(row, col)) return { ok: false, message: '선택한 영토 칸이 올바르지 않습니다.' };

  // 유효한 영토 행동을 눌렀다면 성공/실패와 무관하게 체형에 따른 배고픔을 소비한다.
  const hungerUse = consumeInteractionHunger(pet, date);
  const key = cellKey(row, col);
  const existing = territory.cells[key] ?? null;
  if (existing?.ownerPetId === pet.id) return { ok: false, message: '이미 내 영토입니다.', hungerCost: hungerUse.cost };

  const level = levelForPower(pet.stats.legoPower);
  const limit = territoryLimitForLevel(level);
  const ownedBefore = ownedEntries(territory, pet.id).length;

  if (ownedBefore === 0) {
    if (existing) return { ok: false, message: '첫 영토는 빈 회색칸에서 시작해야 합니다.', hungerCost: hungerUse.cost };
    territory.cells[key] = { ownerPetId: pet.id, claimedAt: nowIso(date), home: true };
    pet.records.territoryClaims = Math.max(0, Number(pet.records.territoryClaims) || 0) + 1;
    return {
      ok: true,
      message: '첫 영토를 차지했습니다. 🏠 이 칸은 이번 시즌 본진이라 빼앗기지 않습니다.',
      row,
      col,
      home: true,
      hungerCost: hungerUse.cost,
      myOwned: 1,
      myLimit: limit,
      victimOwned: null
    };
  }

  if (!isAdjacent8(territory, pet.id, row, col)) {
    return { ok: false, message: '내 영토 주변 칸으로만 넓히거나 이동할 수 있습니다.', hungerCost: hungerUse.cost };
  }
  if (existing?.home) {
    return { ok: false, message: '상대의 본진은 빼앗을 수 없습니다.', hungerCost: hungerUse.cost };
  }

  const victimPetId = existing?.ownerPetId ?? null;
  let released = null;
  if (ownedBefore >= limit) {
    const releaseKey = oldestMovableOwnedCell(territory, pet.id, key);
    if (!releaseKey) {
      return { ok: false, message: '본진은 유지해야 해서 지금 레벨에서는 더 이동할 수 없습니다.', hungerCost: hungerUse.cost };
    }
    released = parseCellKey(releaseKey);
    delete territory.cells[releaseKey];
  }

  territory.cells[key] = { ownerPetId: pet.id, claimedAt: nowIso(date), home: false };
  if (victimPetId) pet.records.territorySteals = Math.max(0, Number(pet.records.territorySteals) || 0) + 1;
  else pet.records.territoryClaims = Math.max(0, Number(pet.records.territoryClaims) || 0) + 1;

  const afterCounts = territoryCounts(state);
  const stolenFrom = victimPetId ? state.pets[victimPetId]?.displayName ?? '상대 레고' : null;
  const actionText = victimPetId ? `${stolenFrom}의 땅을 빼앗았습니다.` : '빈 땅을 차지했습니다.';
  const moveText = released ? ` 내 가장 오래된 일반 영토 (${released.row + 1}, ${released.col + 1})은 자동으로 비워졌습니다.` : '';
  return {
    ok: true,
    message: `${actionText}${moveText}`,
    row,
    col,
    stolenFromPetId: victimPetId,
    released,
    hungerCost: hungerUse.cost,
    myOwned: afterCounts[pet.id] ?? 0,
    myLimit: limit,
    victimOwned: victimPetId ? (afterCounts[victimPetId] ?? 0) : null
  };
}

export function clearPetTerritory(state, petId) {
  state.territory = normalizeTerritory(state.territory, state);
  let removed = 0;
  for (const [key, cell] of Object.entries(state.territory.cells)) {
    if (cell.ownerPetId === petId) {
      delete state.territory.cells[key];
      removed += 1;
    }
  }
  return removed;
}

export function territoryView(state, viewerPetId) {
  const territory = state.territory = normalizeTerritory(state.territory, state);
  const counts = territoryCounts(state);
  const pet = state.pets[viewerPetId];
  const level = pet ? levelForPower(pet.stats.legoPower) : 1;
  const limit = territoryLimitForLevel(level);
  const ranking = territoryRanking(state);
  const currentRank = ranking.entries.find((entry) => entry.petId === viewerPetId)?.rank ?? null;
  const cells = [];
  for (let row = 0; row < TERRITORY_SIZE; row += 1) {
    for (let col = 0; col < TERRITORY_SIZE; col += 1) {
      const cell = territory.cells[cellKey(row, col)] ?? null;
      const owner = cell ? state.pets[cell.ownerPetId] : null;
      cells.push({
        row,
        col,
        ownerPetId: owner?.id ?? null,
        ownerDisplayName: owner?.displayName ?? null,
        claimedAt: cell?.claimedAt ?? null,
        home: Boolean(cell?.home),
        mine: owner?.id === viewerPetId,
        golden: territory.goldenRevealed && territory.goldenCell.row === row && territory.goldenCell.col === col
      });
    }
  }
  return {
    size: TERRITORY_SIZE,
    seasonId: territory.seasonId,
    seasonNumber: territory.seasonNumber,
    startedAt: territory.startedAt,
    endsAt: territory.endsAt,
    goldenRevealed: territory.goldenRevealed,
    goldenRevealAt: territory.goldenRevealAt,
    goldenCell: territory.goldenRevealed ? { ...territory.goldenCell } : null,
    cells,
    my: { owned: counts[viewerPetId] ?? 0, limit, rank: currentRank, level },
    ranking: ranking.entries.slice(0, 3),
    lastResult: territory.lastResult ? structuredClone(territory.lastResult) : null
  };
}

export function territoryNextAlarmAt(state) {
  const territory = normalizeTerritory(state.territory, state);
  if (!territory.goldenRevealed) {
    const revealMs = new Date(territory.goldenRevealAt).getTime();
    const endMs = new Date(territory.endsAt).getTime();
    if (Number.isFinite(revealMs) && Number.isFinite(endMs) && revealMs < endMs) return territory.goldenRevealAt;
  }
  return territory.endsAt;
}
