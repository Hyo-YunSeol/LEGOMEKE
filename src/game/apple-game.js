export const APPLE_SIZE = 10;
export const APPLE_CELL_COUNT = APPLE_SIZE * APPLE_SIZE;
export const APPLE_MIN_NUMBER = 1;
export const APPLE_MAX_NUMBER = 9;
export const APPLE_DURATION_MS = 120_000;
export const APPLE_SUCCESS_POINTS = 5;
export const APPLE_MULTI_BONUS_POINTS = 1;
export const APPLE_SCORE_PER_REMOVED_CELL = 20;
export const APPLE_NEW_BOARD_OFFER_MAX_MOVES = 5;
export const APPLE_MOVE_COUNT_SENTINEL = APPLE_NEW_BOARD_OFFER_MAX_MOVES + 1;

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

function prefixTables(board) {
  const sums = Array.from({ length: APPLE_SIZE + 1 }, () => Array(APPLE_SIZE + 1).fill(0));
  const counts = Array.from({ length: APPLE_SIZE + 1 }, () => Array(APPLE_SIZE + 1).fill(0));
  for (let row = 0; row < APPLE_SIZE; row += 1) {
    for (let col = 0; col < APPLE_SIZE; col += 1) {
      const active = board[row][col] !== null;
      const value = active ? Number(board[row][col]) : 0;
      sums[row + 1][col + 1] = value + sums[row][col + 1] + sums[row + 1][col] - sums[row][col];
      counts[row + 1][col + 1] = Number(active) + counts[row][col + 1] + counts[row + 1][col] - counts[row][col];
    }
  }
  return { sums, counts };
}

function rectValue(prefix, r1, c1, r2, c2) {
  return prefix[r2 + 1][c2 + 1] - prefix[r1][c2 + 1] - prefix[r2 + 1][c1] + prefix[r1][c1];
}

function activeCellKey(board, r1, c1, r2, c2) {
  const cells = [];
  for (let row = r1; row <= r2; row += 1) {
    for (let col = c1; col <= c2; col += 1) {
      if (board[row][col] !== null) cells.push(`${row}:${col}`);
    }
  }
  return cells.join('|');
}

/**
 * 사람이 실제로 지우게 되는 "서로 다른 숫자 묶음"의 개수를 센다.
 * 이미 지워진 null 칸을 사각형 바깥으로 더 포함한 것만 다른 경우는 같은 수로 취급한다.
 * stopAfter를 넘는 즉시 중단하므로 UI 제안 여부(5개 이하) 판정은 가볍게 끝난다.
 */
export function countAppleMovesOnBoard(rawBoard, stopAfter = Number.MAX_SAFE_INTEGER) {
  const board = normalizeAppleBoard(rawBoard);
  const limit = Math.max(1, int(stopAfter, Number.MAX_SAFE_INTEGER));
  const { sums, counts } = prefixTables(board);
  const seen = new Set();
  for (let r1 = 0; r1 < APPLE_SIZE; r1 += 1) {
    for (let c1 = 0; c1 < APPLE_SIZE; c1 += 1) {
      for (let r2 = r1; r2 < APPLE_SIZE; r2 += 1) {
        for (let c2 = c1; c2 < APPLE_SIZE; c2 += 1) {
          if (rectValue(counts, r1, c1, r2, c2) <= 0) continue;
          if (rectValue(sums, r1, c1, r2, c2) !== 10) continue;
          const key = activeCellKey(board, r1, c1, r2, c2);
          if (!key || seen.has(key)) continue;
          seen.add(key);
          if (seen.size >= limit) return seen.size;
        }
      }
    }
  }
  return seen.size;
}

export function countAppleMoves(challenge, stopAfter = APPLE_MOVE_COUNT_SENTINEL) {
  normalizeAppleChallenge(challenge);
  return countAppleMovesOnBoard(challenge.appleBoard, stopAfter);
}

function createPlayableAppleBoard(random = Math.random) {
  // 대부분의 랜덤 판은 선택지가 충분하지만, 테스트용/비정상 RNG에서도 시작하자마자
  // 교체 제안이 뜨는 판을 피하려고 최대 20회 재생성한다.
  let board = createAppleBoard(random);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (countAppleMovesOnBoard(board, APPLE_MOVE_COUNT_SENTINEL) > APPLE_NEW_BOARD_OFFER_MAX_MOVES) return board;
    board = createAppleBoard(random);
  }
  return board;
}

export function appleChallengeFields(date = new Date(), random = Math.random) {
  const appleBoard = createPlayableAppleBoard(random);
  const appleAvailableMoves = countAppleMovesOnBoard(appleBoard, APPLE_MOVE_COUNT_SENTINEL);
  return {
    expiresAt: new Date(date.getTime() + APPLE_DURATION_MS).toISOString(),
    appleBoard,
    applePendingPoints: 0,
    appleScore: 0,
    appleRemovedCount: 0,
    appleSuccesses: 0,
    appleBoardsGenerated: 1,
    appleAvailableMoves,
    appleNewBoardAvailable: appleAvailableMoves <= APPLE_NEW_BOARD_OFFER_MAX_MOVES,
    appleProcessedRequestIds: [],
    appleRefreshRequestIds: []
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
  challenge.appleRefreshRequestIds = Array.isArray(challenge.appleRefreshRequestIds)
    ? [...new Set(challenge.appleRefreshRequestIds.map(String))].slice(-100)
    : [];
  const available = Number(challenge.appleAvailableMoves);
  challenge.appleAvailableMoves = Number.isInteger(available) && available >= 0
    ? Math.min(APPLE_MOVE_COUNT_SENTINEL, available)
    : countAppleMovesOnBoard(challenge.appleBoard, APPLE_MOVE_COUNT_SENTINEL);
  challenge.appleNewBoardAvailable = challenge.appleAvailableMoves <= APPLE_NEW_BOARD_OFFER_MAX_MOVES;
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
      availableMoves: challenge.appleAvailableMoves,
      newBoardAvailable: challenge.appleNewBoardAvailable,
      board: challenge.appleBoard.map((row) => [...row])
    };
  }
  const requestedGeneration = Number(input.boardGeneration);
  if (Number.isInteger(requestedGeneration) && requestedGeneration !== challenge.appleBoardsGenerated) {
    challenge.appleProcessedRequestIds.push(requestId);
    challenge.appleProcessedRequestIds = challenge.appleProcessedRequestIds.slice(-300);
    return {
      ok: true,
      stale: true,
      removed: false,
      pendingPoints: challenge.applePendingPoints,
      score: challenge.appleScore,
      removedCount: challenge.appleRemovedCount,
      availableMoves: challenge.appleAvailableMoves,
      newBoardAvailable: challenge.appleNewBoardAvailable,
      board: challenge.appleBoard.map((row) => [...row]),
      boardsGenerated: challenge.appleBoardsGenerated,
      message: '다른 기기에서 사과판이 변경되어 현재 판을 다시 불러왔습니다.'
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
      availableMoves: challenge.appleAvailableMoves,
      newBoardAvailable: challenge.appleNewBoardAvailable,
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
  challenge.appleAvailableMoves = countAppleMovesOnBoard(challenge.appleBoard, APPLE_MOVE_COUNT_SENTINEL);
  challenge.appleNewBoardAvailable = challenge.appleAvailableMoves <= APPLE_NEW_BOARD_OFFER_MAX_MOVES;
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
    availableMoves: challenge.appleAvailableMoves,
    newBoardAvailable: challenge.appleNewBoardAvailable,
    board: challenge.appleBoard.map((row) => [...row]),
    message: `${activeCells.length}개 제거 · +${gainedPoints}P 예정`
  };
}

export function appleHasMove(challenge) {
  return countAppleMoves(challenge, 1) > 0;
}

export function refreshAppleBoard(challenge, random = Math.random) {
  normalizeAppleChallenge(challenge);
  challenge.appleBoard = createPlayableAppleBoard(random);
  challenge.appleBoardsGenerated = Math.max(1, int(challenge.appleBoardsGenerated, 1)) + 1;
  challenge.appleAvailableMoves = countAppleMovesOnBoard(challenge.appleBoard, APPLE_MOVE_COUNT_SENTINEL);
  challenge.appleNewBoardAvailable = challenge.appleAvailableMoves <= APPLE_NEW_BOARD_OFFER_MAX_MOVES;
  return challenge.appleBoard;
}

export function refreshAppleBoardIfStuck(challenge, random = Math.random) {
  normalizeAppleChallenge(challenge);
  if (countAppleMoves(challenge, 1) > 0) return false;
  refreshAppleBoard(challenge, random);
  return true;
}

export function requestAppleNewBoard(challenge, requestIdValue = '', date = new Date(), random = Math.random) {
  normalizeAppleChallenge(challenge);
  if (challenge.completed) return { ok: false, message: '이미 종료된 사과게임입니다.' };
  if (new Date(challenge.expiresAt).getTime() <= date.getTime()) return { ok: false, expired: true, message: '사과게임 2분이 종료되었습니다.' };
  const requestId = String(requestIdValue ?? '').trim().slice(0, 120);
  if (!requestId) return { ok: false, message: '새 판 요청 ID가 필요합니다.' };
  if (challenge.appleRefreshRequestIds.includes(requestId)) {
    return {
      ok: true,
      duplicate: true,
      boardRefreshed: false,
      board: challenge.appleBoard.map((row) => [...row]),
      boardsGenerated: challenge.appleBoardsGenerated,
      availableMoves: challenge.appleAvailableMoves,
      newBoardAvailable: challenge.appleNewBoardAvailable,
      message: '이미 처리된 새 판 요청입니다.'
    };
  }
  const availableMoves = countAppleMoves(challenge, APPLE_MOVE_COUNT_SENTINEL);
  challenge.appleAvailableMoves = availableMoves;
  challenge.appleNewBoardAvailable = availableMoves <= APPLE_NEW_BOARD_OFFER_MAX_MOVES;
  if (!challenge.appleNewBoardAvailable) {
    return { ok: false, message: `아직 가능한 합10 영역이 충분합니다. 5개 이하가 되면 새 판을 받을 수 있습니다.`, availableMoves };
  }
  challenge.appleRefreshRequestIds.push(requestId);
  challenge.appleRefreshRequestIds = challenge.appleRefreshRequestIds.slice(-100);
  refreshAppleBoard(challenge, random);
  return {
    ok: true,
    boardRefreshed: true,
    board: challenge.appleBoard.map((row) => [...row]),
    boardsGenerated: challenge.appleBoardsGenerated,
    availableMoves: challenge.appleAvailableMoves,
    newBoardAvailable: challenge.appleNewBoardAvailable,
    pendingPoints: challenge.applePendingPoints,
    score: challenge.appleScore,
    removedCount: challenge.appleRemovedCount,
    message: `새 10×10 판으로 변경했습니다. 남은 시간과 점수는 그대로 이어집니다.`
  };
}

export function appleBoardEmpty(challenge) {
  normalizeAppleChallenge(challenge);
  return challenge.appleBoard.every((row) => row.every((value) => value === null));
}
