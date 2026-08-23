import { gameRankingSeasonWindow } from '../lib/time.js';

export const MINESWEEPER_DIFFICULTIES = Object.freeze({
  normal: Object.freeze({
    id: 'normal', label: '보통', rows: 10, cols: 10, mines: 12,
    successReward: 100, failReward: 30, badgeKey: 'minesweeperNormal', badgeLabel: '💥 지뢰왕'
  }),
  hard: Object.freeze({
    id: 'hard', label: '어려움', rows: 16, cols: 16, mines: 40,
    successReward: 200, failReward: 50, badgeKey: 'minesweeperHard', badgeLabel: '💣 지뢰왕고수'
  })
});

const boolArray = (value, length) => Array.from({ length }, (_, index) => Boolean(Array.isArray(value) && value[index]));
const finiteIso = (value) => {
  const time = new Date(value ?? '').getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
};
const indexOf = (row, col, cols) => row * cols + col;
const rowOf = (index, cols) => Math.floor(index / cols);
const colOf = (index, cols) => index % cols;

export function minesweeperDifficulty(value) {
  return MINESWEEPER_DIFFICULTIES[String(value ?? '')] ?? MINESWEEPER_DIFFICULTIES.normal;
}

export function minesweeperChallengeFields(difficultyValue = 'normal') {
  const difficulty = minesweeperDifficulty(difficultyValue);
  const size = difficulty.rows * difficulty.cols;
  return {
    minesweeperDifficulty: difficulty.id,
    minesweeperRows: difficulty.rows,
    minesweeperCols: difficulty.cols,
    minesweeperMineCount: difficulty.mines,
    minesweeperBoard: null,
    minesweeperRevealed: Array(size).fill(false),
    minesweeperFlagged: Array(size).fill(false),
    minesweeperRevealedSafeCount: 0,
    minesweeperFlagCount: 0,
    minesweeperStartedAt: null,
    minesweeperElapsedMs: null,
    minesweeperExplodedIndex: null,
    minesweeperStatus: 'ready'
  };
}

export function normalizeMinesweeperChallenge(challenge) {
  if (!challenge || typeof challenge !== 'object') return challenge;
  const difficulty = minesweeperDifficulty(challenge.minesweeperDifficulty);
  const size = difficulty.rows * difficulty.cols;
  challenge.minesweeperDifficulty = difficulty.id;
  challenge.minesweeperRows = difficulty.rows;
  challenge.minesweeperCols = difficulty.cols;
  challenge.minesweeperMineCount = difficulty.mines;
  const board = Array.isArray(challenge.minesweeperBoard) && challenge.minesweeperBoard.length === size
    ? challenge.minesweeperBoard.map((value) => {
      const number = Number(value);
      return Number.isInteger(number) && number >= -1 && number <= 8 ? number : 0;
    })
    : null;
  challenge.minesweeperBoard = board;
  challenge.minesweeperRevealed = boolArray(challenge.minesweeperRevealed, size);
  challenge.minesweeperFlagged = boolArray(challenge.minesweeperFlagged, size);
  challenge.minesweeperStartedAt = board ? finiteIso(challenge.minesweeperStartedAt) : null;
  challenge.minesweeperRevealedSafeCount = challenge.minesweeperRevealed.reduce((count, revealed, index) => count + Number(revealed && board?.[index] !== -1), 0);
  challenge.minesweeperFlagCount = challenge.minesweeperFlagged.reduce((count, flagged, index) => count + Number(flagged && !challenge.minesweeperRevealed[index]), 0);
  challenge.minesweeperElapsedMs = Number.isFinite(Number(challenge.minesweeperElapsedMs)) ? Math.max(0, Math.round(Number(challenge.minesweeperElapsedMs))) : null;
  const explodedRaw = challenge.minesweeperExplodedIndex;
  const exploded = explodedRaw === null || explodedRaw === undefined || explodedRaw === '' ? NaN : Number(explodedRaw);
  challenge.minesweeperExplodedIndex = Number.isInteger(exploded) && exploded >= 0 && exploded < size ? exploded : null;
  challenge.minesweeperStatus = ['ready', 'playing', 'cleared', 'failed', 'abandoned'].includes(challenge.minesweeperStatus)
    ? challenge.minesweeperStatus
    : (board ? 'playing' : 'ready');
  return challenge;
}

function neighbors(index, rows, cols) {
  const row = rowOf(index, cols);
  const col = colOf(index, cols);
  const output = [];
  for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
    for (let colOffset = -1; colOffset <= 1; colOffset += 1) {
      if (rowOffset === 0 && colOffset === 0) continue;
      const nextRow = row + rowOffset;
      const nextCol = col + colOffset;
      if (nextRow < 0 || nextRow >= rows || nextCol < 0 || nextCol >= cols) continue;
      output.push(indexOf(nextRow, nextCol, cols));
    }
  }
  return output;
}

function createBoard(difficulty, firstIndex, random = Math.random) {
  const size = difficulty.rows * difficulty.cols;
  const blocked = new Set([firstIndex, ...neighbors(firstIndex, difficulty.rows, difficulty.cols)]);
  const candidates = Array.from({ length: size }, (_, index) => index).filter((index) => !blocked.has(index));
  for (let index = candidates.length - 1; index > 0; index -= 1) {
    const unit = Math.max(0, Math.min(0.9999999999999999, Number(random()) || 0));
    const swapIndex = Math.floor(unit * (index + 1));
    [candidates[index], candidates[swapIndex]] = [candidates[swapIndex], candidates[index]];
  }
  const mines = new Set(candidates.slice(0, difficulty.mines));
  const board = Array(size).fill(0);
  for (const mineIndex of mines) board[mineIndex] = -1;
  for (let index = 0; index < size; index += 1) {
    if (board[index] === -1) continue;
    board[index] = neighbors(index, difficulty.rows, difficulty.cols).reduce((count, nearby) => count + Number(mines.has(nearby)), 0);
  }
  return board;
}

function revealSafeArea(challenge, startIndex) {
  const rows = challenge.minesweeperRows;
  const cols = challenge.minesweeperCols;
  const board = challenge.minesweeperBoard;
  const queue = [startIndex];
  const queued = new Set(queue);
  while (queue.length) {
    const index = queue.shift();
    if (challenge.minesweeperRevealed[index] || challenge.minesweeperFlagged[index] || board[index] === -1) continue;
    challenge.minesweeperRevealed[index] = true;
    challenge.minesweeperRevealedSafeCount += 1;
    if (board[index] !== 0) continue;
    for (const nearby of neighbors(index, rows, cols)) {
      if (queued.has(nearby) || challenge.minesweeperRevealed[nearby] || challenge.minesweeperFlagged[nearby] || board[nearby] === -1) continue;
      queued.add(nearby);
      queue.push(nearby);
    }
  }
}

export function minesweeperChallengeView(challenge, { revealMines = false } = {}) {
  normalizeMinesweeperChallenge(challenge);
  const rows = challenge.minesweeperRows;
  const cols = challenge.minesweeperCols;
  const board = challenge.minesweeperBoard;
  const cells = Array.from({ length: rows }, (_, row) => Array.from({ length: cols }, (_, col) => {
    const index = indexOf(row, col, cols);
    if (challenge.minesweeperRevealed[index]) return board?.[index] === -1 ? 'boom' : board?.[index] ?? 0;
    if (challenge.minesweeperFlagged[index]) return 'flag';
    if (revealMines && board?.[index] === -1) return index === challenge.minesweeperExplodedIndex ? 'boom' : 'mine';
    return null;
  }));
  const difficulty = minesweeperDifficulty(challenge.minesweeperDifficulty);
  return {
    id: challenge.id,
    petId: challenge.petId,
    gameId: 'minesweeper',
    createdAt: challenge.createdAt,
    expiresAt: challenge.expiresAt ?? null,
    completed: Boolean(challenge.completed),
    usageCounted: Boolean(challenge.usageCounted),
    difficulty: difficulty.id,
    difficultyLabel: difficulty.label,
    rows,
    cols,
    mines: difficulty.mines,
    successReward: difficulty.successReward,
    failReward: difficulty.failReward,
    startedAt: challenge.minesweeperStartedAt,
    elapsedMs: challenge.minesweeperElapsedMs,
    status: challenge.minesweeperStatus,
    flagCount: challenge.minesweeperFlagCount,
    revealedSafeCount: challenge.minesweeperRevealedSafeCount,
    safeCellCount: rows * cols - difficulty.mines,
    cells
  };
}

export function applyMinesweeperAction(challenge, input = {}, date = new Date(), random = Math.random) {
  normalizeMinesweeperChallenge(challenge);
  if (challenge.completed || ['cleared', 'failed', 'abandoned'].includes(challenge.minesweeperStatus)) return { ok: false, message: '이미 끝난 지뢰찾기입니다.' };
  const action = String(input.action ?? 'reveal');
  if (!['reveal', 'flag'].includes(action)) return { ok: false, message: '지원하지 않는 지뢰찾기 조작입니다.' };
  const row = Math.floor(Number(input.row));
  const col = Math.floor(Number(input.col));
  const rows = challenge.minesweeperRows;
  const cols = challenge.minesweeperCols;
  if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row >= rows || col < 0 || col >= cols) return { ok: false, message: '선택한 칸이 올바르지 않습니다.' };
  const index = indexOf(row, col, cols);
  const difficulty = minesweeperDifficulty(challenge.minesweeperDifficulty);

  if (action === 'flag') {
    if (!challenge.minesweeperStartedAt || !challenge.minesweeperBoard) return { ok: false, message: '먼저 안전한 첫 칸을 열어주세요.' };
    if (challenge.minesweeperRevealed[index]) return { ok: true, changed: false, message: '이미 열린 칸입니다.' };
    if (!challenge.minesweeperFlagged[index] && challenge.minesweeperFlagCount >= difficulty.mines) return { ok: true, changed: false, message: `깃발 ${difficulty.mines}개를 모두 사용했습니다.` };
    challenge.minesweeperFlagged[index] = !challenge.minesweeperFlagged[index];
    challenge.minesweeperFlagCount += challenge.minesweeperFlagged[index] ? 1 : -1;
    return { ok: true, changed: true, action, message: challenge.minesweeperFlagged[index] ? '깃발을 표시했습니다.' : '깃발을 해제했습니다.' };
  }

  const firstReveal = !challenge.minesweeperStartedAt || !challenge.minesweeperBoard;
  if (firstReveal) {
    challenge.minesweeperBoard = createBoard(difficulty, index, random);
    challenge.minesweeperStartedAt = date.toISOString();
    challenge.minesweeperStatus = 'playing';
  }
  if (challenge.minesweeperFlagged[index]) return { ok: true, changed: false, firstReveal, message: '깃발이 표시된 칸입니다.' };
  if (challenge.minesweeperRevealed[index]) return { ok: true, changed: false, firstReveal, message: '이미 열린 칸입니다.' };

  if (challenge.minesweeperBoard[index] === -1) {
    challenge.minesweeperRevealed[index] = true;
    challenge.minesweeperExplodedIndex = index;
    challenge.minesweeperStatus = 'failed';
    challenge.minesweeperElapsedMs = Math.max(1, date.getTime() - new Date(challenge.minesweeperStartedAt).getTime());
    return { ok: true, changed: true, firstReveal, finished: true, cleared: false, failed: true, elapsedMs: challenge.minesweeperElapsedMs };
  }

  revealSafeArea(challenge, index);
  const safeCellCount = rows * cols - difficulty.mines;
  if (challenge.minesweeperRevealedSafeCount >= safeCellCount) {
    challenge.minesweeperStatus = 'cleared';
    challenge.minesweeperElapsedMs = Math.max(1, date.getTime() - new Date(challenge.minesweeperStartedAt).getTime());
    return { ok: true, changed: true, firstReveal, finished: true, cleared: true, failed: false, elapsedMs: challenge.minesweeperElapsedMs };
  }
  return { ok: true, changed: true, firstReveal, finished: false, cleared: false, failed: false };
}

function rankingRows(state, difficultyId) {
  const msKey = difficultyId === 'hard' ? 'minesweeperHardBestMs' : 'minesweeperNormalBestMs';
  const atKey = difficultyId === 'hard' ? 'minesweeperHardBestAt' : 'minesweeperNormalBestAt';
  return Object.values(state.pets ?? {})
    .filter((pet) => pet?.alive)
    .map((pet) => ({
      pet,
      ms: Math.max(0, Math.floor(Number(pet.records?.[msKey]) || 0)),
      achievedAt: finiteIso(pet.records?.[atKey])
    }))
    .filter((row) => row.ms > 0)
    .sort((a, b) => a.ms - b.ms || new Date(a.achievedAt ?? 8640000000000000) - new Date(b.achievedAt ?? 8640000000000000) || a.pet.displayName.localeCompare(b.pet.displayName, 'ko'));
}

function publicRows(rows, limit = 5) {
  return rows.slice(0, limit).map((row, index) => ({ rank: index + 1, petId: row.pet.id, displayName: row.pet.displayName, ms: row.ms, achievedAt: row.achievedAt }));
}

function rankingSeasonOrdinal(key) {
  const match = String(key ?? '').match(/^season-(\d+)$/u);
  return match ? Number(match[1]) : null;
}

export function normalizeMinesweeperSeason(raw, date = new Date()) {
  const current = gameRankingSeasonWindow(date);
  const key = String(raw?.key ?? raw?.seasonId ?? '');
  const ordinal = rankingSeasonOrdinal(key);
  // v6.9.1의 기존 6시간 지뢰찾기 시즌 키(YYYY-MM-DD@slot)는 배포 순간
  // 현재 공통 3일 시즌으로 흡수한다. 배포 때문에 기록/진행판이 즉시 초기화되지 않게 하기 위함이다.
  if (ordinal == null) {
    return {
      ...current,
      initializedAt: finiteIso(raw?.initializedAt) ?? date.toISOString(),
      lastSettledAt: finiteIso(raw?.lastSettledAt)
    };
  }
  return {
    key,
    startsAt: finiteIso(raw?.startsAt) ?? current.startsAt,
    endsAt: finiteIso(raw?.endsAt) ?? current.endsAt,
    initializedAt: finiteIso(raw?.initializedAt) ?? date.toISOString(),
    lastSettledAt: finiteIso(raw?.lastSettledAt)
  };
}

export function processMinesweeperSeason(state, date = new Date()) {
  const current = gameRankingSeasonWindow(date);
  state.minesweeperSeason = normalizeMinesweeperSeason(state.minesweeperSeason, date);
  if (state.minesweeperSeason.key === current.key) {
    state.minesweeperSeason.startsAt = current.startsAt;
    state.minesweeperSeason.endsAt = current.endsAt;
    return { changed: false, champions: [] };
  }

  const previousOrdinal = rankingSeasonOrdinal(state.minesweeperSeason.key);
  const currentOrdinal = rankingSeasonOrdinal(current.key);
  const elapsedSeasons = previousOrdinal == null || currentOrdinal == null ? 1 : Math.max(0, currentOrdinal - previousOrdinal);
  const normalWinner = rankingRows(state, 'normal')[0] ?? null;
  const hardWinner = rankingRows(state, 'hard')[0] ?? null;
  const champions = [];
  // 정확히 직전 3일 시즌을 정산할 때만 다음 3일 시즌 동안 칭호를 부여한다.
  // 여러 시즌을 건너뛴 경우 오래된 1위 칭호가 현재 시즌에 뒤늦게 되살아나는 것을 막는다.
  if (elapsedSeasons === 1) {
    for (const [difficultyId, winner] of [['normal', normalWinner], ['hard', hardWinner]]) {
      if (!winner?.pet?.alive) continue;
      const difficulty = minesweeperDifficulty(difficultyId);
      winner.pet.seasonBadges ??= {};
      winner.pet.seasonBadges[difficulty.badgeKey] = current.endsAt;
      champions.push({ difficulty: difficultyId, label: difficulty.label, badgeLabel: difficulty.badgeLabel, petId: winner.pet.id, userId: winner.pet.userId, displayName: winner.pet.displayName, ms: winner.ms });
    }
  }

  for (const pet of Object.values(state.pets ?? {})) {
    if (!pet?.alive) continue;
    pet.records ??= {};
    pet.records.minesweeperNormalBestMs = 0;
    pet.records.minesweeperNormalBestAt = null;
    pet.records.minesweeperHardBestMs = 0;
    pet.records.minesweeperHardBestAt = null;
  }
  // 공통 3일 시즌 경계에서 이전 시즌에 시작한 진행판은 새 시즌 기록으로 넘어가지 않게 0P 포기 종료한다.
  for (const challenge of Object.values(state.miniGameChallenges ?? {})) {
    if (!challenge || challenge.gameId !== 'minesweeper' || challenge.completed) continue;
    normalizeMinesweeperChallenge(challenge);
    challenge.completed = true;
    challenge.completedAt = date.toISOString();
    challenge.reward = 0;
    challenge.minesweeperStatus = 'abandoned';
    if (challenge.minesweeperStartedAt) challenge.minesweeperElapsedMs = Math.max(1, date.getTime() - new Date(challenge.minesweeperStartedAt).getTime());
  }
  state.minesweeperSeason = { ...current, initializedAt: state.minesweeperSeason.initializedAt, lastSettledAt: date.toISOString() };
  return { changed: true, champions };
}

export function minesweeperRankingsView(state, viewerPetId = null, date = new Date()) {
  state.minesweeperSeason = normalizeMinesweeperSeason(state.minesweeperSeason, date);
  const normalAll = publicRows(rankingRows(state, 'normal'), Number.MAX_SAFE_INTEGER);
  const hardAll = publicRows(rankingRows(state, 'hard'), Number.MAX_SAFE_INTEGER);
  const mine = (items) => viewerPetId ? items.find((item) => item.petId === viewerPetId) ?? null : null;
  return {
    normal: normalAll.slice(0, 5),
    hard: hardAll.slice(0, 5),
    mine: { normal: mine(normalAll), hard: mine(hardAll) },
    season: { ...state.minesweeperSeason }
  };
}
