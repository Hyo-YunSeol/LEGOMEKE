export const OMOK_SIZE = 15;
export const BLACK = 'black';
export const WHITE = 'white';

const DIRECTIONS = Object.freeze([
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1]
]);

const inBounds = (row, col) => Number.isInteger(row) && Number.isInteger(col) && row >= 0 && row < OMOK_SIZE && col >= 0 && col < OMOK_SIZE;

export function createOmokBoard() {
  return Array.from({ length: OMOK_SIZE }, () => Array(OMOK_SIZE).fill(null));
}

export function normalizeBoard(raw) {
  if (!Array.isArray(raw) || raw.length !== OMOK_SIZE) return createOmokBoard();
  return raw.map((line) => Array.isArray(line) && line.length === OMOK_SIZE
    ? line.map((cell) => cell === BLACK || cell === WHITE ? cell : null)
    : Array(OMOK_SIZE).fill(null));
}

function countOneSide(board, row, col, dr, dc, color) {
  let count = 0;
  let r = row + dr;
  let c = col + dc;
  while (inBounds(r, c) && board[r][c] === color) {
    count += 1;
    r += dr;
    c += dc;
  }
  return count;
}

export function contiguousLength(board, row, col, dr, dc, color = board?.[row]?.[col]) {
  if (!inBounds(row, col) || !color) return 0;
  return 1 + countOneSide(board, row, col, dr, dc, color) + countOneSide(board, row, col, -dr, -dc, color);
}

export function maxLineLength(board, row, col, color = board?.[row]?.[col]) {
  return Math.max(...DIRECTIONS.map(([dr, dc]) => contiguousLength(board, row, col, dr, dc, color)));
}

export function checkFive(board, row, col, color = board?.[row]?.[col], { exact = color === BLACK } = {}) {
  if (!inBounds(row, col) || !color) return false;
  return DIRECTIONS.some(([dr, dc]) => {
    const length = contiguousLength(board, row, col, dr, dc, color);
    return exact ? length === 5 : length >= 5;
  });
}

export function isOverline(board, row, col, color = BLACK) {
  if (!inBounds(row, col) || board?.[row]?.[col] !== color) return false;
  return DIRECTIONS.some(([dr, dc]) => contiguousLength(board, row, col, dr, dc, color) >= 6);
}

function lineCoordinates(row, col, dr, dc, radius = 5) {
  const cells = [];
  for (let offset = -radius; offset <= radius; offset += 1) {
    const r = row + dr * offset;
    const c = col + dc * offset;
    if (inBounds(r, c)) cells.push([r, c]);
  }
  return cells;
}

function winningPointsInDirection(board, originRow, originCol, dr, dc) {
  const points = [];
  for (const [row, col] of lineCoordinates(originRow, originCol, dr, dc, 5)) {
    if (board[row][col] !== null) continue;
    board[row][col] = BLACK;
    const wins = contiguousLength(board, row, col, dr, dc, BLACK) === 5 && !isOverline(board, row, col, BLACK);
    const includesOrigin = (() => {
      if (!wins) return false;
      let r = row;
      let c = col;
      while (inBounds(r - dr, c - dc) && board[r - dr][c - dc] === BLACK) { r -= dr; c -= dc; }
      for (let i = 0; i < 5; i += 1) {
        if (r === originRow && c === originCol) return true;
        r += dr;
        c += dc;
      }
      return false;
    })();
    board[row][col] = null;
    if (wins && includesOrigin) points.push([row, col]);
  }
  return points;
}

function fourDirections(board, row, col) {
  const result = [];
  for (const [dr, dc] of DIRECTIONS) {
    const winningPoints = winningPointsInDirection(board, row, col, dr, dc);
    if (winningPoints.length) result.push({ dr, dc, winningPoints });
  }
  return result;
}

export function isDoubleFour(board, row, col) {
  if (!inBounds(row, col) || board[row][col] !== BLACK) return false;
  return fourDirections(board, row, col).length >= 2;
}

function createsStraightFour(board, originRow, originCol, extensionRow, extensionCol, dr, dc) {
  if (board[extensionRow][extensionCol] !== null) return false;
  board[extensionRow][extensionCol] = BLACK;
  const overline = isOverline(board, extensionRow, extensionCol, BLACK);
  const immediateFive = checkFive(board, extensionRow, extensionCol, BLACK, { exact: true });
  const winningPoints = overline || immediateFive ? [] : winningPointsInDirection(board, originRow, originCol, dr, dc);
  board[extensionRow][extensionCol] = null;
  return winningPoints.length >= 2;
}

function openThreeDirections(board, row, col) {
  const result = [];
  for (const [dr, dc] of DIRECTIONS) {
    let found = false;
    for (const [r, c] of lineCoordinates(row, col, dr, dc, 4)) {
      if (board[r][c] !== null) continue;
      if (createsStraightFour(board, row, col, r, c, dr, dc)) {
        found = true;
        break;
      }
    }
    if (found) result.push({ dr, dc });
  }
  return result;
}

export function isDoubleThree(board, row, col) {
  if (!inBounds(row, col) || board[row][col] !== BLACK) return false;
  return openThreeDirections(board, row, col).length >= 2;
}

export function isForbiddenMove(board, row, col) {
  if (!inBounds(row, col)) return { forbidden: true, reason: 'board' };
  if (board[row][col] !== null) return { forbidden: true, reason: 'occupied' };
  board[row][col] = BLACK;
  try {
    if (isOverline(board, row, col, BLACK)) return { forbidden: true, reason: 'overline' };
    // RIF 정의와 사용자 요구에 맞춰 흑의 정확한 5목은 33/44보다 우선해 정상 승리 수로 본다.
    if (checkFive(board, row, col, BLACK, { exact: true })) return { forbidden: false, reason: null, exactFive: true };
    if (isDoubleFour(board, row, col)) return { forbidden: true, reason: 'double-four' };
    if (isDoubleThree(board, row, col)) return { forbidden: true, reason: 'double-three' };
    return { forbidden: false, reason: null, exactFive: false };
  } finally {
    board[row][col] = null;
  }
}

export function boardIsFull(board) {
  return board.every((row) => row.every((cell) => cell !== null));
}
