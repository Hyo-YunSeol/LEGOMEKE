export const APPLE_SIZE = 10;
export const APPLE_CELL_COUNT = APPLE_SIZE * APPLE_SIZE;
export const APPLE_MIN_NUMBER = 1;
export const APPLE_MAX_NUMBER = 9;
export const APPLE_DURATION_MS = 120_000;
export const APPLE_SUCCESS_POINTS = 5;
export const APPLE_MULTI_BONUS_POINTS = 1;
export const APPLE_SCORE_PER_REMOVED_CELL = 20;

const int = (value, fallback = 0) => Math.floor(Number.isFinite(Number(value)) ? Number(value) : fallback);
const inBounds = (value) => Number.isInteger(value) && value >= 0 && value < APPLE_SIZE;

export function createAppleBoard(random = Math.random) {
  return Array.from({ length: APPLE_SIZE }, () => Array.from({ length: APPLE_SIZE }, () => APPLE_MIN_NUMBER + Math.floor(random() * (APPLE_MAX_NUMBER - APPLE_MIN_NUMBER + 1))));
}

export function normalizeAppleBoard(raw) {
  if (!Array.isArray(raw) || raw.length !== APPLE_SIZE) return createAppleBoard();
  return raw.map((row) => Array.isArray(row) && row.length === APPLE_SIZE
    ? row.map((value) => value === null ? null : Math.max(APPLE_MIN_NUMBER, Math.min(APPLE_MAX_NUMBER, int(value, APPLE_MIN_NUMBER))))
    : Array(APPLE_SIZE).fill(null));
}

export function appleChallengeFields(date = new Date()) {
  return {
    expiresAt: new Date(date.getTime() + APPLE_DURATION_MS).toISOString(),
    appleBoard: createAppleBoard(),
    applePendingPoints: 0,
    appleScore: 0,
    appleRemovedCount: 0,
    appleSuccesses: 0,
    appleBoardsGenerated: 1,
    appleProcessedRequestIds: []
  };
}

export function normalizeAppleChallenge(challenge) {
  challenge.appleBoard = normalizeAppleBoard(challenge.appleBoard);
  challenge.applePendingPoints = Math.max(0, int(challenge.applePendingPoints));
  challenge.appleScore = Math.max(0, int(challenge.appleScore));
  challenge.appleRemovedCount = Math.max(0, int(challenge.appleRemovedCount));
  challenge.appleSuccesses = Math.max(0, int(challenge.appleSuccesses));
  challenge.appleBoardsGenerated = Math.max(1, int(challenge.appleBoardsGenerated, 1));
  challenge.appleProcessedRequestIds = Array.isArray(challenge.appleProcessedRequestIds)
    ? [...new Set(challenge.appleProcessedRequestIds.map(String))].slice(-300)
    : [];
  return challenge;
}

function normalizeRect(input = {}) {
  const startRow = Number(input.startRow);
  const startCol = Number(input.startCol);
  const endRow = Number(input.endRow);
  const endCol = Number(input.endCol);
  if (![startRow, startCol, endRow, endCol].every(Number.isInteger)) return null;
  if (![startRow, startCol, endRow, endCol].every(inBounds)) return null;
  return {
    minRow: Math.min(startRow, endRow),
    maxRow: Math.max(startRow, endRow),
    minCol: Math.min(startCol, endCol),
    maxCol: Math.max(startCol, endCol)
  };
}

export function selectAppleRectangle(challenge, input = {}, requestIdValue = '', date = new Date()) {
  normalizeAppleChallenge(challenge);
  if (challenge.completed) return { ok: false, message: '이미 종료된 사과게임입니다.' };
  if (new Date(challenge.expiresAt).getTime() <= date.getTime()) return { ok: false, expired: true, message: '사과게임 2분이 종료되었습니다.' };
  const requestId = String(requestIdValue ?? '').trim().slice(0, 120);
  if (!requestId) return { ok: false, message: '선택 요청 ID가 필요합니다.' };
  if (challenge.appleProcessedRequestIds.includes(requestId)) {
    return {
      ok: true,
      duplicate: true,
      removed: false,
      pendingPoints: challenge.applePendingPoints,
      score: challenge.appleScore,
      removedCount: challenge.appleRemovedCount,
      board: challenge.appleBoard.map((row) => [...row])
    };
  }
  const rect = normalizeRect(input);
  if (!rect) return { ok: false, message: '선택 영역이 올바르지 않습니다.' };
  let sum = 0;
  const activeCells = [];
  for (let row = rect.minRow; row <= rect.maxRow; row += 1) {
    for (let col = rect.minCol; col <= rect.maxCol; col += 1) {
      const value = challenge.appleBoard[row][col];
      if (value === null) continue;
      sum += value;
      activeCells.push([row, col, value]);
    }
  }
  challenge.appleProcessedRequestIds.push(requestId);
  challenge.appleProcessedRequestIds = challenge.appleProcessedRequestIds.slice(-300);
  if (!activeCells.length || sum !== 10) {
    return {
      ok: true,
      removed: false,
      sum,
      selectedCount: activeCells.length,
      message: sum === 10 ? '선택 영역에 남아 있는 숫자가 없습니다.' : `합이 ${sum}이라 제거되지 않았습니다.`,
      pendingPoints: challenge.applePendingPoints,
      score: challenge.appleScore,
      removedCount: challenge.appleRemovedCount,
      board: challenge.appleBoard.map((row) => [...row])
    };
  }
  for (const [row, col] of activeCells) challenge.appleBoard[row][col] = null;
  const gainedPoints = APPLE_SUCCESS_POINTS + (activeCells.length >= 3 ? APPLE_MULTI_BONUS_POINTS : 0);
  const gainedScore = activeCells.length * APPLE_SCORE_PER_REMOVED_CELL;
  challenge.applePendingPoints += gainedPoints;
  challenge.appleScore += gainedScore;
  challenge.appleRemovedCount += activeCells.length;
  challenge.appleSuccesses += 1;
  return {
    ok: true,
    removed: true,
    sum,
    selectedCount: activeCells.length,
    gainedPoints,
    gainedScore,
    pendingPoints: challenge.applePendingPoints,
    score: challenge.appleScore,
    removedCount: challenge.appleRemovedCount,
    board: challenge.appleBoard.map((row) => [...row]),
    message: `${activeCells.length}개 제거 · +${gainedPoints}P 예정`
  };
}


export function appleHasMove(challenge) {
  normalizeAppleChallenge(challenge);
  const board = challenge.appleBoard;
  for (let r1 = 0; r1 < APPLE_SIZE; r1 += 1) for (let c1 = 0; c1 < APPLE_SIZE; c1 += 1) {
    for (let r2 = r1; r2 < APPLE_SIZE; r2 += 1) for (let c2 = c1; c2 < APPLE_SIZE; c2 += 1) {
      let sum = 0; let count = 0;
      for (let r = r1; r <= r2; r += 1) for (let c = c1; c <= c2; c += 1) {
        const value = board[r][c]; if (value !== null) { sum += value; count += 1; }
      }
      if (count > 0 && sum === 10) return true;
    }
  }
  return false;
}

export function refreshAppleBoardIfStuck(challenge, random = Math.random) {
  normalizeAppleChallenge(challenge);
  if (appleHasMove(challenge)) return false;
  challenge.appleBoard = createAppleBoard(random);
  challenge.appleBoardsGenerated = Math.max(1, int(challenge.appleBoardsGenerated, 1)) + 1;
  return true;
}

export function appleBoardEmpty(challenge) {
  normalizeAppleChallenge(challenge);
  return challenge.appleBoard.every((row) => row.every((value) => value === null));
}
