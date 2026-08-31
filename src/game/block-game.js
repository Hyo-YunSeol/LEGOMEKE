export const BLOCK_ROWS = 12;
export const BLOCK_COLUMNS = 10;
export const BLOCK_COLOR_COUNT = 5;
export const BLOCK_ALL_CLEAR_BONUS = 100;
export const BLOCK_MIN_STARTING_GROUPS = 8;
export const BLOCK_MIN_STARTING_REMOVABLE_CELLS = 24;

const MAX_PROCESSED_REQUESTS = 240;
const int = (value, fallback = 0) => Math.floor(Number.isFinite(Number(value)) ? Number(value) : fallback);
const inBounds = (row, col) => Number.isInteger(row) && Number.isInteger(col)
  && row >= 0 && row < BLOCK_ROWS && col >= 0 && col < BLOCK_COLUMNS;

function randomColor(random) {
  const value = Number(random());
  const unit = Number.isFinite(value) ? Math.max(0, Math.min(0.999999999, value)) : 0;
  return Math.floor(unit * BLOCK_COLOR_COUNT);
}

export function createBlockBoard(random = Math.random) {
  return Array.from({ length: BLOCK_ROWS }, () => (
    Array.from({ length: BLOCK_COLUMNS }, () => randomColor(random))
  ));
}

function fallbackPlayableBoard() {
  // 비정상 RNG에서도 시작 가능한 판을 보장하는 단순한 2x2 색 묶음 패턴이다.
  return Array.from({ length: BLOCK_ROWS }, (_, row) => (
    Array.from({ length: BLOCK_COLUMNS }, (_, col) => (Math.floor(row / 2) + Math.floor(col / 2)) % BLOCK_COLOR_COUNT)
  ));
}

function boardShapeValid(raw) {
  return Array.isArray(raw) && raw.length === BLOCK_ROWS
    && raw.every((row) => Array.isArray(row) && row.length === BLOCK_COLUMNS);
}

export function normalizeBlockBoard(raw) {
  if (!boardShapeValid(raw)) return fallbackPlayableBoard();
  return raw.map((row) => row.map((value) => {
    if (value === null) return null;
    const color = int(value, -1);
    return color >= 0 && color < BLOCK_COLOR_COUNT ? color : null;
  }));
}

function cellKey(row, col) {
  return row * BLOCK_COLUMNS + col;
}

export function blockGroupAt(rawBoard, startRow, startCol) {
  const board = normalizeBlockBoard(rawBoard);
  if (!inBounds(startRow, startCol)) return [];
  const color = board[startRow][startCol];
  if (color === null) return [];
  const group = [];
  const seen = new Set([cellKey(startRow, startCol)]);
  const stack = [[startRow, startCol]];
  while (stack.length) {
    const [row, col] = stack.pop();
    group.push([row, col]);
    for (const [nextRow, nextCol] of [[row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1]]) {
      if (!inBounds(nextRow, nextCol) || board[nextRow][nextCol] !== color) continue;
      const key = cellKey(nextRow, nextCol);
      if (seen.has(key)) continue;
      seen.add(key);
      stack.push([nextRow, nextCol]);
    }
  }
  return group;
}

export function blockBoardStats(rawBoard) {
  const board = normalizeBlockBoard(rawBoard);
  const seen = new Set();
  let remainingBlocks = 0;
  let removableGroups = 0;
  let removableCells = 0;
  let largestGroup = 0;
  for (let row = 0; row < BLOCK_ROWS; row += 1) {
    for (let col = 0; col < BLOCK_COLUMNS; col += 1) {
      if (board[row][col] === null) continue;
      remainingBlocks += 1;
      const key = cellKey(row, col);
      if (seen.has(key)) continue;
      const group = blockGroupAt(board, row, col);
      for (const [groupRow, groupCol] of group) seen.add(cellKey(groupRow, groupCol));
      if (group.length < 2) continue;
      removableGroups += 1;
      removableCells += group.length;
      largestGroup = Math.max(largestGroup, group.length);
    }
  }
  return { remainingBlocks, removableGroups, removableCells, largestGroup };
}

export function createPlayableBlockBoard(random = Math.random) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const board = createBlockBoard(random);
    const stats = blockBoardStats(board);
    if (stats.removableGroups >= BLOCK_MIN_STARTING_GROUPS
      && stats.removableCells >= BLOCK_MIN_STARTING_REMOVABLE_CELLS) return board;
  }
  return fallbackPlayableBoard();
}

export function blockRewardForSize(sizeValue) {
  const size = int(sizeValue);
  if (size < 2) return 0;
  if (size === 2) return 5;
  if (size === 3) return 9;
  if (size === 4) return 13;
  if (size === 5) return 18;
  if (size === 6) return 23;
  if (size === 7) return 29;
  if (size === 8) return 35;
  if (size === 9) return 42;
  if (size <= 12) return 52;
  if (size <= 15) return 65;
  return 80;
}

export function collapseBlockBoard(rawBoard) {
  const board = normalizeBlockBoard(rawBoard);
  for (let col = 0; col < BLOCK_COLUMNS; col += 1) {
    const values = [];
    for (let row = 0; row < BLOCK_ROWS; row += 1) {
      if (board[row][col] !== null) values.push(board[row][col]);
    }
    const emptyRows = BLOCK_ROWS - values.length;
    for (let row = 0; row < BLOCK_ROWS; row += 1) board[row][col] = row < emptyRows ? null : values[row - emptyRows];
  }
  return board;
}

export function blockChallengeFields(random = Math.random) {
  const blockBoard = createPlayableBlockBoard(random);
  const stats = blockBoardStats(blockBoard);
  return {
    expiresAt: null,
    blockBoard,
    blockPendingPoints: 0,
    blockRemovedCount: 0,
    blockMoveCount: 0,
    blockBoardVersion: 1,
    blockAvailableGroups: stats.removableGroups,
    blockRemainingCount: stats.remainingBlocks,
    blockAllClear: false,
    blockProcessedRequestIds: []
  };
}

export function normalizeBlockChallenge(challenge) {
  challenge.blockBoard = normalizeBlockBoard(challenge.blockBoard);
  challenge.expiresAt = null;
  challenge.blockPendingPoints = Math.max(0, int(challenge.blockPendingPoints));
  challenge.blockRemovedCount = Math.max(0, Math.min(BLOCK_ROWS * BLOCK_COLUMNS, int(challenge.blockRemovedCount)));
  challenge.blockMoveCount = Math.max(0, int(challenge.blockMoveCount));
  challenge.blockBoardVersion = Math.max(1, int(challenge.blockBoardVersion, 1));
  challenge.blockProcessedRequestIds = Array.isArray(challenge.blockProcessedRequestIds)
    ? [...new Set(challenge.blockProcessedRequestIds.map(String))].slice(-MAX_PROCESSED_REQUESTS)
    : [];
  const stats = blockBoardStats(challenge.blockBoard);
  challenge.blockAvailableGroups = stats.removableGroups;
  challenge.blockRemainingCount = stats.remainingBlocks;
  challenge.blockAllClear = stats.remainingBlocks === 0;
  return challenge;
}

function blockResultView(challenge, extra = {}) {
  return {
    pendingPoints: challenge.blockPendingPoints,
    removedCount: challenge.blockRemovedCount,
    moveCount: challenge.blockMoveCount,
    boardVersion: challenge.blockBoardVersion,
    availableGroups: challenge.blockAvailableGroups,
    remainingCount: challenge.blockRemainingCount,
    allClear: challenge.blockAllClear,
    board: challenge.blockBoard.map((row) => [...row]),
    ...extra
  };
}

function rememberRequest(challenge, requestId) {
  challenge.blockProcessedRequestIds.push(requestId);
  challenge.blockProcessedRequestIds = challenge.blockProcessedRequestIds.slice(-MAX_PROCESSED_REQUESTS);
}

export function selectBlockGroup(challenge, input = {}, requestIdValue = '') {
  normalizeBlockChallenge(challenge);
  if (challenge.completed) return { ok: false, message: '이미 종료된 블록게임입니다.' };
  const requestId = String(requestIdValue ?? '').trim();
  if (!/^[A-Za-z0-9._:-]{8,120}$/.test(requestId)) return { ok: false, message: '유효한 블록 선택 요청 ID가 필요합니다.' };
  if (challenge.blockProcessedRequestIds.includes(requestId)) {
    return { ok: true, duplicate: true, removed: false, finished: false, ...blockResultView(challenge), message: '이미 처리된 블록 선택입니다.' };
  }

  if (challenge.blockAvailableGroups === 0) {
    return {
      ok: true,
      removed: false,
      finished: true,
      finalPoints: challenge.blockPendingPoints + (challenge.blockAllClear ? BLOCK_ALL_CLEAR_BONUS : 0),
      ...blockResultView(challenge),
      message: challenge.blockAllClear ? 'ALL CLEAR!' : '더 이상 제거할 블록이 없어 게임이 종료되었습니다.'
    };
  }

  const requestedVersion = Number(input.boardVersion);
  if (!Number.isInteger(requestedVersion) || requestedVersion !== challenge.blockBoardVersion) {
    rememberRequest(challenge, requestId);
    return {
      ok: true,
      stale: true,
      removed: false,
      finished: false,
      ...blockResultView(challenge),
      message: '다른 기기에서 블록판이 변경되어 현재 판을 다시 불러왔습니다.'
    };
  }

  const row = Number(input.row);
  const col = Number(input.col);
  if (!inBounds(row, col)) return { ok: false, message: '선택한 블록 위치가 올바르지 않습니다.' };
  const group = blockGroupAt(challenge.blockBoard, row, col);
  rememberRequest(challenge, requestId);
  if (group.length < 2) {
    return { ok: true, removed: false, finished: false, ...blockResultView(challenge), message: '상하좌우로 연결된 같은 색 블록이 2개 이상이어야 합니다.' };
  }

  for (const [groupRow, groupCol] of group) challenge.blockBoard[groupRow][groupCol] = null;
  challenge.blockBoard = collapseBlockBoard(challenge.blockBoard);
  const gainedPoints = blockRewardForSize(group.length);
  challenge.blockPendingPoints += gainedPoints;
  challenge.blockRemovedCount += group.length;
  challenge.blockMoveCount += 1;
  challenge.blockBoardVersion += 1;
  const stats = blockBoardStats(challenge.blockBoard);
  challenge.blockAvailableGroups = stats.removableGroups;
  challenge.blockRemainingCount = stats.remainingBlocks;
  challenge.blockAllClear = stats.remainingBlocks === 0;
  const finished = challenge.blockAllClear || stats.removableGroups === 0;
  const finalPoints = challenge.blockPendingPoints + (challenge.blockAllClear ? BLOCK_ALL_CLEAR_BONUS : 0);
  return {
    ok: true,
    removed: true,
    selectedCount: group.length,
    gainedPoints,
    finished,
    finalPoints,
    ...blockResultView(challenge),
    message: finished
      ? challenge.blockAllClear
        ? `${group.length}개 제거 · +${gainedPoints}P · ALL CLEAR 보너스 +${BLOCK_ALL_CLEAR_BONUS}P`
        : `${group.length}개 제거 · +${gainedPoints}P · 더 이상 제거할 그룹이 없습니다.`
      : `${group.length}개 제거 · +${gainedPoints}P 예정`
  };
}
