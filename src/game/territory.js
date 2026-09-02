import { id } from '../lib/ids.js';
import { gameDayKey, gameDayWindow } from '../lib/time.js';
import {
  TERRITORY_GOLDEN_REVEAL_HOURS_BEFORE_END,
  TERRITORY_SIZE,
  TERRITORY_WIN_POINTS,
  TERRITORY_STEAL_COST
} from './constants.js';
import { consumeInteractionHunger, hungerActionLock, hungerLockMessage } from './activity.js';
import { levelForPower, territoryLimitForLevel, TERRITORY_LIMIT_TIERS, nextTerritoryUpgrade } from './progression.js';

const nowIso = (date = new Date()) => date.toISOString();
const cellKey = (row, col) => `${row}:${col}`;
const TERRITORY_SEASON_ID_PATTERN = /^\d{4}-\d{2}-\d{2}@[0-3]$/u;
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

function randomEndInsideWindow(window, notBefore = null) {
  const startMs = new Date(window.startsAt).getTime();
  const endMs = new Date(window.endsAt).getTime();
  const requestedFloor = new Date(notBefore ?? window.startsAt).getTime();
  const floorMs = Math.max(startMs, Number.isFinite(requestedFloor) ? requestedFloor : startMs);
  // 사용자가 말한 "6시간 안의 아무 분" 그대로 분 단위로 한 번만 뽑는다.
  // 현재 시각과 똑같은 순간을 뽑아 생성 직후 즉시 종료되는 레이스를 막기 위해
  // 가장 이른 후보는 현재/시작 시각의 다음 분, 가장 늦은 후보는 구간 마지막 분이다.
  const earliestMinuteMs = Math.ceil((floorMs + 1) / 60_000) * 60_000;
  const latestMinuteMs = Math.floor((endMs - 1) / 60_000) * 60_000;
  if (earliestMinuteMs > latestMinuteMs) return new Date(Math.max(floorMs + 1_000, endMs - 1_000)).toISOString();
  const minuteCount = Math.floor((latestMinuteMs - earliestMinuteMs) / 60_000) + 1;
  const pickedMinute = Math.min(minuteCount - 1, Math.floor(Math.random() * minuteCount));
  return new Date(earliestMinuteMs + pickedMinute * 60_000).toISOString();
}

function nextWindowAfter(date = new Date()) {
  const current = gameDayWindow(date);
  return gameDayWindow(new Date(new Date(current.endsAt).getTime() + 1));
}

function revealAtForEndsAt(endsAt) {
  const endMs = new Date(endsAt).getTime();
  const revealMs = endMs - TERRITORY_GOLDEN_REVEAL_HOURS_BEFORE_END * 60 * 60 * 1000;
  return new Date(Number.isFinite(revealMs) ? revealMs : Date.now()).toISOString();
}

export function initialTerritory(date = new Date(), seasonNumber = 1, { targetWindow = null, startedAt = null } = {}) {
  const window = targetWindow ?? gameDayWindow(date);
  const actualStartedAt = startedAt ?? nowIso(date);
  const endsAt = randomEndInsideWindow(window, date);
  return {
    version: 9,
    size: TERRITORY_SIZE,
    seasonId: window.seasonId,
    seasonNumber: Math.max(1, Math.floor(Number(seasonNumber) || 1)),
    startedAt: actualStartedAt,
    endsAt,
    goldenRevealAt: revealAtForEndsAt(endsAt),
    goldenRevealed: false,
    goldenRevealedAt: null,
    goldenCell: randomGoldenCell(),
    cells: {},
    battleUnlocked: false,
    lastResult: null,
    history: [],
    settledSeasonIds: [],
    recoveryLog: []
  };
}

function validCellCoordinate(row, col) {
  return Number.isInteger(row) && Number.isInteger(col) && row >= 0 && row < TERRITORY_SIZE && col >= 0 && col < TERRITORY_SIZE;
}

function validSeasonId(value) {
  if (!TERRITORY_SEASON_ID_PATTERN.test(String(value ?? ''))) return false;
  const [dateKey] = String(value).split('@');
  const time = Date.parse(`${dateKey}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === dateKey;
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

  const sourceCells = source?.cells && typeof source.cells === 'object' && !Array.isArray(source.cells) ? source.cells : {};
  const sourceCellsFitCurrentMap = Object.keys(sourceCells).every((key) => {
    const { row, col } = parseCellKey(key);
    return validCellCoordinate(row, col);
  });
  // 실제 구형 대형 맵만 새 시즌으로 전환한다. size 필드만 깨졌거나 누락됐지만
  // 현재 맵 좌표가 정상인 저장 데이터는 영토를 지우지 않고 그대로 복구한다.
  if (source && legacySize !== TERRITORY_SIZE && !sourceCellsFitCurrentMap) {
    const migrated = initialTerritory(date, Math.max(1, Math.floor(Number(source.seasonNumber) || 1) + 1));
    migrated.lastResult = source.lastResult && typeof source.lastResult === 'object' && !Array.isArray(source.lastResult) ? source.lastResult : null;
    migrated.history = Array.isArray(source.history) ? source.history.filter((item) => item && typeof item === 'object' && !Array.isArray(item)).slice(0, 4) : (migrated.lastResult ? [migrated.lastResult] : []);
    migrated.settledSeasonIds = Array.isArray(source.settledSeasonIds) ? [...new Set(source.settledSeasonIds.map(String))].slice(-24) : [];
    return migrated;
  }

  const territory = source ? { ...base, ...source } : base;
  const sourceVersion = Math.floor(Number(source?.version) || 0);
  territory.version = 9;
  territory.size = TERRITORY_SIZE;
  territory.seasonNumber = Math.max(1, Math.floor(Number(territory.seasonNumber) || 1));

  const window = gameDayWindow(date);
  const recoveryReasons = [];
  const rawStartedMs = new Date(territory.startedAt ?? 0).getTime();
  territory.startedAt = Number.isFinite(rawStartedMs) ? new Date(rawStartedMs).toISOString() : nowIso(date);
  let parsedEndMs = new Date(territory.endsAt ?? 0).getTime();
  const storedSeasonId = source?.seasonId;

  // v7부터 한 현실 하루의 각 6시간 구간마다 종료가 정확히 한 번 발생한다.
  // 구버전의 정각 종료 시즌은 현재 구간의 남은 시간 안에서 랜덤 종료로 한 번만 마이그레이션한다.
  if (sourceVersion < 7) {
    territory.seasonId = window.seasonId;
    territory.endsAt = randomEndInsideWindow(window, date);
    parsedEndMs = new Date(territory.endsAt).getTime();
    recoveryReasons.push('migrated-random-window-end');
  } else {
    const storedSeasonIdValid = validSeasonId(storedSeasonId);
    const expectedStoredSeasonId = Number.isFinite(parsedEndMs) ? gameDayKey(new Date(parsedEndMs - 1)) : null;
    const inconsistentSeason = !storedSeasonIdValid || storedSeasonId !== expectedStoredSeasonId;
    if (!Number.isFinite(parsedEndMs) || inconsistentSeason) {
      territory.seasonId = window.seasonId;
      territory.endsAt = randomEndInsideWindow(window, date);
      parsedEndMs = new Date(territory.endsAt).getTime();
      if (!Number.isFinite(new Date(source?.endsAt ?? 0).getTime())) recoveryReasons.push('invalid-endsAt');
      if (!storedSeasonIdValid) recoveryReasons.push('invalid-seasonId');
      else if (inconsistentSeason) recoveryReasons.push('seasonId-endsAt-inconsistent');
    } else {
      territory.seasonId = storedSeasonId;
      territory.endsAt = new Date(parsedEndMs).toISOString();
    }
  }
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
  // 현재 맵이 한 번이라도 모두 찬 뒤에는 시즌이 끝날 때까지 전면전을 유지한다.
  // 5×5에서 6×6으로 확장해도 기존 cells와 battleUnlocked는 그대로 보존한다.
  territory.battleUnlocked = Boolean(territory.battleUnlocked) || Object.keys(territory.cells).length >= TERRITORY_SIZE * TERRITORY_SIZE;

  territory.settledSeasonIds = Array.isArray(territory.settledSeasonIds)
    ? [...new Set(territory.settledSeasonIds.map(String))].slice(-24)
    : [];
  territory.recoveryLog = Array.isArray(territory.recoveryLog) ? territory.recoveryLog.filter(Boolean).slice(-24) : [];
  if (recoveryReasons.length) {
    const entry = {
      reasons: recoveryReasons,
      recoveredAt: nowIso(date),
      seasonId: territory.seasonId,
        preservedCells: Object.keys(territory.cells).length
    };
    territory.recoveryLog.push(entry);
    console.warn('territory-state-recovered', JSON.stringify(entry));
  }
  territory.lastResult = territory.lastResult && typeof territory.lastResult === 'object' && !Array.isArray(territory.lastResult)
    ? territory.lastResult
    : null;
  const rawHistory = Array.isArray(territory.history)
    ? territory.history.filter((item) => item && typeof item === 'object' && !Array.isArray(item) && Number.isFinite(new Date(item.endedAt ?? 0).getTime()))
    : [];
  if (territory.lastResult && Number.isFinite(new Date(territory.lastResult.endedAt ?? 0).getTime())
      && !rawHistory.some((item) => String(item.seasonId || '') === String(territory.lastResult.seasonId || ''))) {
    rawHistory.unshift(territory.lastResult);
  }
  territory.history = rawHistory.slice(0, 4);
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
  territory.history = [result, ...(territory.history ?? []).filter((item) => String(item?.seasonId || '') !== String(result.seasonId || ''))].slice(0, 4);
  territory.settledSeasonIds.push(territory.seasonId);
  territory.settledSeasonIds = territory.settledSeasonIds.slice(-24);

  if (ranking.winner) {
    const seconds = ranking.entries.filter((entry) => entry.rank === 2).map((entry) => entry.displayName);
    const secondText = seconds.length ? ` 공동 2위 ${seconds.join(', ')}.` : '';
    addTerritoryNews(state, `제${territory.seasonNumber}회 레고 영토전 종료. 1위 ${ranking.winner.displayName} · 영토 ${ranking.winner.count}칸 · ${TERRITORY_WIN_POINTS.toLocaleString('ko-KR')}P 획득.${secondText}`, ranking.entries.slice(0, 3).map((entry) => entry.petId), date);
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
  const beforeNormalization = JSON.stringify(state.territory ?? null);
  state.territory = normalizeTerritory(state.territory, state, date);
  const normalizedChanged = beforeNormalization !== JSON.stringify(state.territory);
  const endMs = new Date(state.territory.endsAt).getTime();
  // 저장된 랜덤 종료시각 전에는 절대로 정산하거나 맵을 교체하지 않는다.
  if (Number.isFinite(endMs) && endMs > date.getTime()) {
    return { changed: normalizedChanged, recovered: normalizedChanged, reset: false, revealed: false };
  }
  if (!Number.isFinite(endMs)) return { changed: normalizedChanged, recovered: normalizedChanged, reset: false, revealed: false };

  const previous = state.territory;
  const scheduledEnd = new Date(endMs);
  const beforeCells = Object.keys(previous.cells).length;
  const previousSeasonId = previous.seasonId;
  const previousSeasonNumber = previous.seasonNumber;
  const settled = settleCurrentSeason(state, scheduledEnd);

  // 같은 6시간 구간에서는 두 번 종료하지 않는다. 다음 종료는 반드시 다음 6시간 구간 안에서 한 번만 뽑는다.
  // Worker가 오래 쉬었다가 다시 깨어난 경우 이미 완전히 지나간 구간은 빈 시즌으로 재정산하지 않고
  // 회차 번호만 건너뛴 뒤 현재/다음 유효 구간에 종료시각을 한 번 뽑는다. 이렇게 해야 과거 종료시각으로
  // 알람이 반복 예약되거나 한 요청에서 여러 번 보상되는 문제가 생기지 않는다.
  let targetWindow = nextWindowAfter(scheduledEnd);
  let nextSeasonNumber = previousSeasonNumber + 1;
  let skippedWindows = 0;
  while (new Date(targetWindow.endsAt).getTime() <= date.getTime()) {
    skippedWindows += 1;
    nextSeasonNumber += 1;
    targetWindow = nextWindowAfter(new Date(new Date(targetWindow.endsAt).getTime() - 1));
  }
  const nextStartedAt = skippedWindows > 0 ? targetWindow.startsAt : scheduledEnd.toISOString();
  const next = initialTerritory(date, nextSeasonNumber, {
    targetWindow,
    startedAt: nextStartedAt
  });
  next.lastResult = settled.result ?? state.territory.lastResult;
  next.history = [...(state.territory.history ?? [])].slice(0, 4);
  next.settledSeasonIds = [...state.territory.settledSeasonIds];
  next.recoveryLog = [...(state.territory.recoveryLog ?? [])].slice(-24);
  state.territory = next;

  addTerritoryNews(state, `제${next.seasonNumber}회 레고 영토전이 시작되었습니다.`, [], date);
  addTerritoryNews(state, '이전 영토전이 랜덤 종료되어 영토가 초기화되고 새 회차가 시작되었습니다.', [], date);
  const resetLog = {
    reason: 'random-window-end-expired',
    processedAt: nowIso(date),
    scheduledEndsAt: scheduledEnd.toISOString(),
    previousSeasonId,
    nextSeasonId: next.seasonId,
    occupiedCellsBeforeReset: beforeCells,
    previousSeasonNumber,
    nextSeasonNumber: next.seasonNumber,
    skippedWindows
  };
  console.info('territory-season-reset', JSON.stringify(resetLog));
  return { changed: true, reset: true, settled: settled.result, revealed: false };
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
  if (!pet?.alive) return { ok: false, message: '영토전에 참가할 레고를 찾을 수 없습니다.' };
  if (!validCellCoordinate(row, col)) return { ok: false, message: '선택한 영토 칸이 올바르지 않습니다.' };
  if (hungerActionLock(pet, date).locked) return { ok: false, message: hungerLockMessage('영토전'), resourceLock: 'hunger' };

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

  // 첫 참가자는 빈칸에서 시작한다. 전면전 이후 영토가 0칸이 된 사람은
  // 빈칸 또는 상대의 일반 영토를 차지해 복귀할 수 있지만 본진은 항상 보호한다.
  if (ownedBefore === 0) {
    if (existing?.home) return { ok: false, message: '본진은 전면전 여부와 관계없이 보호되어 빼앗을 수 없습니다.', hungerCost: hungerUse.cost };
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
    if (!territory.battleUnlocked && Object.keys(territory.cells).length >= capacity) territory.battleUnlocked = true;
    const afterCounts = territoryCounts(state);
    const victimName = victimPetId ? state.pets[victimPetId]?.displayName ?? '상대 레고' : null;
    return {
      ok: true,
      message: victimPetId
        ? `${victimName}의 땅을 빼앗아 전면전에 다시 참가했습니다. 🏠 새 본진으로 지정됩니다.`
        : territory.battleUnlocked
          ? '첫 영토를 차지했습니다. 맵이 모두 차서 ⚔️ 전면전이 시작되었습니다.'
          : '첫 영토를 차지했습니다. 🏠 이 칸은 본진으로 지정되어 항상 보호됩니다.',
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
  if (existing?.home) {
    return { ok: false, message: '본진은 전면전 여부와 관계없이 보호되어 빼앗을 수 없습니다.', hungerCost: hungerUse.cost };
  }

  const victimPetId = existing?.ownerPetId ?? null;

  // 한도는 '동시에 보유할 수 있는 칸 수'다.
  // 빈 땅으로 한도를 넘겨 확장하는 것은 막지만, 상대 땅 탈취는 전쟁 재미를 살리기 위해
  // 한도에 꽉 차 있어도 가장 오래된 일반 영토 한 칸을 비우고 새 탈취칸으로 이동할 수 있다.
  // 본진은 어떤 경우에도 이동하지 않고, 한도 조정에는 일반 영토만 사용한다.
  let released = null;
  if (ownedBefore >= limit) {
    if (!victimPetId) {
      const next = nextTerritoryUpgrade(level);
      const nextText = next ? ` Lv.${next.level}부터 최대 ${next.limit}칸을 보유할 수 있습니다.` : ' 현재 최대 보유 한도에 도달했습니다.';
      return {
        ok: false,
        message: `현재 Lv.${level}에서는 영토를 최대 ${limit}칸까지 보유할 수 있습니다.${nextText} 빈 땅 추가 점령은 막히지만, 상대 땅은 ${TERRITORY_STEAL_COST}P를 내고 기존 영토 한 칸을 옮기는 방식으로 탈취할 수 있습니다.`,
        hungerCost: hungerUse.cost,
        myOwned: ownedBefore,
        myLimit: limit
      };
    }

    const releaseKey = oldestMovableOwnedCell(territory, pet.id, key);
    if (!releaseKey) {
      return {
        ok: false,
        message: '지금은 옮길 수 있는 일반 영토가 없습니다. 본진은 항상 보호되므로 이동하거나 포기할 수 없습니다.',
        hungerCost: hungerUse.cost,
        myOwned: ownedBefore,
        myLimit: limit
      };
    }
    released = parseCellKey(releaseKey);
  }

  if (victimPetId) {
    const points = Math.max(0, Math.floor(Number(pet.stats?.points) || 0));
    if (points < TERRITORY_STEAL_COST) return { ok: false, message: `상대 영토 탈취에는 ${TERRITORY_STEAL_COST}P가 필요합니다.`, hungerCost: hungerUse.cost };
    pet.stats.points = points - TERRITORY_STEAL_COST;
    pet.records.pointsSpent = Math.max(0, Math.floor(Number(pet.records?.pointsSpent) || 0)) + TERRITORY_STEAL_COST;
  }

  if (released) delete territory.cells[cellKey(released.row, released.col)];
  territory.cells[key] = { ownerPetId: pet.id, claimedAt: nowIso(date), home: false };
  if (victimPetId) pet.records.territorySteals = Math.max(0, Number(pet.records.territorySteals) || 0) + 1;
  else pet.records.territoryClaims = Math.max(0, Number(pet.records.territoryClaims) || 0) + 1;
  if (!territory.battleUnlocked && Object.keys(territory.cells).length >= capacity) territory.battleUnlocked = true;

  const afterCounts = territoryCounts(state);
  const stolenFrom = victimPetId ? state.pets[victimPetId]?.displayName ?? '상대 레고' : null;
  const actionText = victimPetId ? `${stolenFrom}의 땅을 빼앗았습니다. -${TERRITORY_STEAL_COST}P` : '빈 땅을 차지했습니다.';
  const moveText = released
    ? ` 보유 한도 ${limit}칸을 유지하기 위해 가장 오래된 일반 영토 (${released.row + 1}, ${released.col + 1})을 비우고 이동했습니다.`
    : '';
  const battleText = territory.battleUnlocked && !battleUnlocked ? ` 맵 ${capacity}칸이 모두 차서 ⚔️ 전면전이 시작되었습니다.` : '';
  return {
    ok: true,
    message: `${actionText}${moveText}${battleText}`,
    row,
    col,
    stolenFromPetId: victimPetId,
    released,
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
    serverTime: Date.now(),
    size: TERRITORY_SIZE,
    seasonId: territory.seasonId,
    seasonNumber: territory.seasonNumber,
    startedAt: territory.startedAt,
    goldenRevealed: false,
    goldenCell: null,
    battleUnlocked: Boolean(territory.battleUnlocked),
    cells,
    my: { owned: counts[viewerPetId] ?? 0, limit, rank: currentRank, level, nextUpgrade: nextTerritoryUpgrade(level) },
    limitTiers: TERRITORY_LIMIT_TIERS.map((tier) => ({ ...tier })),
    ranking: ranking.entries.slice(0, 3),
    lastResult: territory.lastResult ? structuredClone(territory.lastResult) : null,
    history: territory.history.map((item) => structuredClone(item))
  };
}

export function territoryNextAlarmAt(state) {
  const territory = normalizeTerritory(state.territory, state);
  return territory.endsAt;
}
