import { id } from '../lib/ids.js';
import { gameDayKey, nextGameDayAt } from '../lib/time.js';
import {
  TERRITORY_GOLDEN_REVEAL_HOURS_BEFORE_END,
  TERRITORY_SIZE,
  TERRITORY_WIN_POINTS,
  TERRITORY_STEAL_COST
} from './constants.js';
import { consumeInteractionHunger } from './activity.js';
import { levelForPower, territoryLimitForLevel, TERRITORY_LIMIT_TIERS, nextTerritoryUpgrade } from './progression.js';

const nowIso = (date = new Date()) => date.toISOString();
const cellKey = (row, col) => `${row}:${col}`;
const parseCellKey = (key) => {
  const [row, col] = String(key).split(':').map(Number);
  return { row, col };
};

function activePet(state, petId) {
  const pet = state?.pets?.[petId];
  return pet?.alive ? pet : null;
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
    version: 5,
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
    battleUnlocked: false,
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

  // 맵 크기가 달라진 기존 시즌은 좌표 충돌을 피하기 위해 새 5x5 시즌으로 안전하게 전환한다.
  if (source && legacySize !== TERRITORY_SIZE) {
    const migrated = initialTerritory(date, Math.max(1, Math.floor(Number(source.seasonNumber) || 1) + 1));
    migrated.lastResult = source.lastResult && typeof source.lastResult === 'object' && !Array.isArray(source.lastResult) ? source.lastResult : null;
    migrated.settledSeasonIds = Array.isArray(source.settledSeasonIds) ? [...new Set(source.settledSeasonIds.map(String))].slice(-24) : [];
    return migrated;
  }

  const territory = source ? { ...base, ...source } : base;
  territory.version = 5;
  territory.size = TERRITORY_SIZE;
  territory.seasonId = typeof territory.seasonId === 'string' && territory.seasonId ? territory.seasonId : gameDayKey(date);
  territory.seasonNumber = Math.max(1, Math.floor(Number(territory.seasonNumber) || 1));

  const startedAt = new Date(territory.startedAt ?? 0).getTime();
  territory.startedAt = Number.isFinite(startedAt) ? new Date(startedAt).toISOString() : date.toISOString();
  const endsAt = new Date(territory.endsAt ?? 0).getTime();
  territory.endsAt = Number.isFinite(endsAt) ? new Date(endsAt).toISOString() : nextGameDayAt(date);
  // v6.4.1부터 현재 시즌의 황금 영토는 종료 전에는 서버 응답으로도 공개하지 않는다.
  // v6.4.0에서 이미 공개된 진행 중 시즌 데이터가 남아 있어도 즉시 비공개 상태로 정상화한다.
  territory.goldenRevealAt = revealAtForEndsAt(territory.endsAt);
  territory.goldenRevealed = false;
  territory.goldenRevealedAt = null;

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
  // 5×5 맵이 한 번이라도 모두 찬 뒤에는 시즌이 끝날 때까지 전면전을 유지한다.
  // 기존 저장 데이터에 필드가 없어도 현재 25칸이 모두 차 있다면 자동으로 전면전 상태로 승격한다.
  territory.battleUnlocked = Boolean(territory.battleUnlocked) || Object.keys(territory.cells).length >= TERRITORY_SIZE * TERRITORY_SIZE;

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
  const goldenVisibleForRanking = settlement;
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
    return {
      winner: null,
      entries: entries.map(({ actuallyHasGolden, ...entry }) => ({ ...entry, hasGolden: settlement && actuallyHasGolden })),
      topCount
    };
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
  return {
    winner,
    entries: entries.map(({ actuallyHasGolden, ...entry }) => ({ ...entry, hasGolden: settlement && actuallyHasGolden })),
    topCount
  };
}

function settleCurrentSeason(state, date = new Date()) {
  state.territory = normalizeTerritory(state.territory, state, date);
  if (state.territory.settledSeasonIds.includes(state.territory.seasonId)) return { changed: false, result: state.territory.lastResult };
  const ranking = territoryRanking(state, { settlement: true });
  const territory = state.territory;
  const goldenOwnerPetId = goldenOwnerId(territory);
  const goldenOwner = goldenOwnerPetId ? activePet(state, goldenOwnerPetId) : null;
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
    goldenCell: { ...territory.goldenCell },
    goldenOwnerPetId: goldenOwner?.id ?? null,
    goldenOwnerDisplayName: goldenOwner?.displayName ?? null,
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
  const goldenPosition = `${territory.goldenCell.row + 1}행 ${territory.goldenCell.col + 1}열`;
  addTerritoryNews(
    state,
    `👑 제${territory.seasonNumber}회 황금 영토 공개: ${goldenPosition}${goldenOwner ? ` · ${goldenOwner.displayName} 소유` : ' · 종료 시점 빈 땅'}.`,
    goldenOwner ? [goldenOwner.id] : [],
    date
  );
  return { changed: true, result };
}

export function processTerritorySeason(state, date = new Date()) {
  state.territory = normalizeTerritory(state.territory, state, date);
  const currentId = gameDayKey(date);
  const endMs = new Date(state.territory.endsAt).getTime();
  if (state.territory.seasonId === currentId && endMs > date.getTime()) {
    return { changed: false, revealed: false };
  }
  const settled = settleCurrentSeason(state, date);
  const next = initialTerritory(date, state.territory.seasonNumber + 1);
  next.lastResult = settled.result ?? state.territory.lastResult;
  next.settledSeasonIds = [...state.territory.settledSeasonIds];
  state.territory = next;
  addTerritoryNews(state, `제${next.seasonNumber}회 레고 영토전이 시작되었습니다.`, [], date);
  return { changed: true, settled: settled.result, revealed: false };
}

function ownedEntries(territory, petId) {
  return Object.entries(territory.cells).filter(([, cell]) => cell.ownerPetId === petId);
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
  if (!pet?.alive) return { ok: false, message: '영토전에 참가할 레고를 찾을 수 없습니다.' };
  if (!validCellCoordinate(row, col)) return { ok: false, message: '선택한 영토 칸이 올바르지 않습니다.' };

  // 유효한 영토 행동을 눌렀다면 성공/실패와 무관하게 체형에 따른 배고픔을 소비한다.
  const hungerUse = consumeInteractionHunger(pet, date);
  const key = cellKey(row, col);
  const existing = territory.cells[key] ?? null;
  if (existing?.ownerPetId === pet.id) return { ok: false, message: '이미 내 영토입니다.', hungerCost: hungerUse.cost };

  const level = levelForPower(pet.stats.legoPower);
  const limit = territoryLimitForLevel(level);
  const ownedBefore = ownedEntries(territory, pet.id).length;
  const capacity = TERRITORY_SIZE * TERRITORY_SIZE;
  if (!territory.battleUnlocked && Object.keys(territory.cells).length >= capacity) territory.battleUnlocked = true;
  const battleUnlocked = Boolean(territory.battleUnlocked);

  // 전면전 전에는 첫 영토를 빈칸에서 시작한다. 전면전 이후 0칸이 된 사람은
  // 빈칸이든 상대 칸이든 다시 하나를 차지해 게임에 복귀할 수 있다.
  if (ownedBefore === 0) {
    if (existing && !battleUnlocked) return { ok: false, message: '첫 영토는 빈 회색칸에서 시작해야 합니다.', hungerCost: hungerUse.cost };
    const victimPetId = existing?.ownerPetId ?? null;
    if (victimPetId) {
      const points = Math.max(0, Math.floor(Number(pet.stats?.points) || 0));
      if (points < TERRITORY_STEAL_COST) return { ok: false, message: `상대 영토 탈취에는 ${TERRITORY_STEAL_COST}P가 필요합니다.`, hungerCost: hungerUse.cost };
      pet.stats.points = points - TERRITORY_STEAL_COST;
      pet.records.pointsSpent = Math.max(0, Math.floor(Number(pet.records?.pointsSpent) || 0)) + TERRITORY_STEAL_COST;
    }
    territory.cells[key] = { ownerPetId: pet.id, claimedAt: nowIso(date), home: true };
    if (victimPetId) pet.records.territorySteals = Math.max(0, Number(pet.records.territorySteals) || 0) + 1;
    else pet.records.territoryClaims = Math.max(0, Number(pet.records.territoryClaims) || 0) + 1;
    if (victimPetId && existing?.home) ensureOneHomePerOwner(territory);
    if (!territory.battleUnlocked && Object.keys(territory.cells).length >= capacity) territory.battleUnlocked = true;
    const afterCounts = territoryCounts(state);
    const victimName = victimPetId ? state.pets[victimPetId]?.displayName ?? '상대 레고' : null;
    return {
      ok: true,
      message: victimPetId
        ? `${victimName}의 땅을 빼앗아 전면전에 다시 참가했습니다. 🏠 새 본진으로 지정됩니다.`
        : territory.battleUnlocked
          ? '첫 영토를 차지했습니다. 맵이 모두 차서 ⚔️ 전면전이 시작되었습니다.'
          : '첫 영토를 차지했습니다. 🏠 이 칸은 맵이 모두 차기 전까지 본진으로 보호됩니다.',
      row,
      col,
      home: true,
      battleUnlocked: Boolean(territory.battleUnlocked),
      stolenFromPetId: victimPetId,
      hungerCost: hungerUse.cost,
      myOwned: afterCounts[pet.id] ?? 0,
      myLimit: limit,
      victimOwned: victimPetId ? (afterCounts[victimPetId] ?? 0) : null
    };
  }

  if (!isAdjacent8(territory, pet.id, row, col)) {
    return { ok: false, message: '내 영토 주변 칸으로만 넓히거나 이동할 수 있습니다.', hungerCost: hungerUse.cost };
  }
  if (existing?.home && !battleUnlocked) {
    return { ok: false, message: '상대의 본진은 맵 25칸이 모두 차기 전에는 빼앗을 수 없습니다.', hungerCost: hungerUse.cost };
  }

  const victimPetId = existing?.ownerPetId ?? null;
  if (ownedBefore >= limit) {
    const next = nextTerritoryUpgrade(level);
    const nextText = next ? ` Lv.${next.level}부터 최대 ${next.limit}칸을 보유할 수 있습니다.` : ' 현재 최대 보유 한도에 도달했습니다.';
    return {
      ok: false,
      message: `현재 Lv.${level}에서는 영토를 최대 ${limit}칸까지 보유할 수 있습니다.${nextText} 기존 영토를 빼앗긴 뒤 빈 자리가 생기면 다시 점령하거나 탈취할 수 있습니다.`,
      hungerCost: hungerUse.cost,
      myOwned: ownedBefore,
      myLimit: limit
    };
  }
  if (victimPetId && Math.max(0, Math.floor(Number(pet.stats?.points) || 0)) < TERRITORY_STEAL_COST) return { ok: false, message: `상대 영토 탈취에는 ${TERRITORY_STEAL_COST}P가 필요합니다.`, hungerCost: hungerUse.cost };

  if (victimPetId) {
    const points = Math.max(0, Math.floor(Number(pet.stats?.points) || 0));
    if (points < TERRITORY_STEAL_COST) return { ok: false, message: `상대 영토 탈취에는 ${TERRITORY_STEAL_COST}P가 필요합니다.`, hungerCost: hungerUse.cost };
    pet.stats.points = points - TERRITORY_STEAL_COST;
    pet.records.pointsSpent = Math.max(0, Math.floor(Number(pet.records?.pointsSpent) || 0)) + TERRITORY_STEAL_COST;
  }
  territory.cells[key] = { ownerPetId: pet.id, claimedAt: nowIso(date), home: false };
  if (victimPetId) pet.records.territorySteals = Math.max(0, Number(pet.records.territorySteals) || 0) + 1;
  else pet.records.territoryClaims = Math.max(0, Number(pet.records.territoryClaims) || 0) + 1;
  if (!territory.battleUnlocked && Object.keys(territory.cells).length >= capacity) territory.battleUnlocked = true;

  // 본진이 탈취된 피해자에게 다른 영토가 남아 있다면 가장 오래된 남은 칸을 즉시 새 본진으로 승격한다.
  if (victimPetId && existing?.home) ensureOneHomePerOwner(territory);

  const afterCounts = territoryCounts(state);
  const stolenFrom = victimPetId ? state.pets[victimPetId]?.displayName ?? '상대 레고' : null;
  const actionText = victimPetId ? `${stolenFrom}의 땅을 빼앗았습니다. -${TERRITORY_STEAL_COST}P` : '빈 땅을 차지했습니다.';
  const battleText = territory.battleUnlocked && !battleUnlocked ? ' 맵 25칸이 모두 차서 ⚔️ 전면전이 시작되었습니다.' : '';
  return {
    ok: true,
    message: `${actionText}${battleText}`,
    row,
    col,
    stolenFromPetId: victimPetId,
    battleUnlocked: Boolean(territory.battleUnlocked),
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
        golden: false
      });
    }
  }
  return {
    size: TERRITORY_SIZE,
    seasonId: territory.seasonId,
    seasonNumber: territory.seasonNumber,
    startedAt: territory.startedAt,
    endsAt: territory.endsAt,
    goldenRevealed: false,
    goldenRevealAt: territory.goldenRevealAt,
    goldenCell: null,
    battleUnlocked: Boolean(territory.battleUnlocked),
    cells,
    my: { owned: counts[viewerPetId] ?? 0, limit, rank: currentRank, level, nextUpgrade: nextTerritoryUpgrade(level) },
    limitTiers: TERRITORY_LIMIT_TIERS.map((tier) => ({ ...tier })),
    ranking: ranking.entries.slice(0, 3),
    lastResult: territory.lastResult ? structuredClone(territory.lastResult) : null
  };
}

export function territoryNextAlarmAt(state) {
  const territory = normalizeTerritory(state.territory, state);
  return territory.endsAt;
}
