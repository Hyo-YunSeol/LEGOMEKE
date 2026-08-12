import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FISHING_REWARDS,
  SHOP_ITEMS,
  TERRITORY_STEAL_COST,
  TERRITORY_WIN_POINTS,
  WORK_POINTS
} from '../src/game/constants.js';
import {
  BLOCK_ALL_CLEAR_BONUS,
  BLOCK_COLUMNS,
  BLOCK_MIN_STARTING_GROUPS,
  BLOCK_MIN_STARTING_REMOVABLE_CELLS,
  BLOCK_ROWS,
  blockBoardStats,
  blockGroupAt,
  blockRewardForSize,
  collapseBlockBoard,
  createPlayableBlockBoard
} from '../src/game/block-game.js';
import { GAME_RANKING_PRIZES } from '../src/game/ranking-season.js';
import { LIAR_BET_OPTIONS } from '../src/game/liar-game.js';
import { initialState } from '../src/durable-store.js';
import {
  applyDailyReset,
  createPet,
  finishMiniGame,
  purchaseShopItem,
  selectBlockGame,
  startMiniGame,
  stopMiniGame
} from '../src/game/engine.js';
import { authRequest, createRoom, register, responseJson } from './helpers.js';

const BASE = new Date('2026-08-11T03:00:00.000Z');

function stateWithPet(points = 0) {
  const state = initialState();
  const user = { id: 'v672-user', nickname: '밸런스', generation: 1, currentPetId: null, sessionVersion: 1, notifications: [], createdAt: BASE.toISOString(), lastSeenAt: BASE.toISOString() };
  const pet = createPet(user, 1, BASE);
  user.currentPetId = pet.id;
  pet.stats.points = points;
  state.users[user.id] = user;
  state.pets[pet.id] = pet;
  return { state, user, pet };
}

test('확정 경제 수치·낚시 목록·판돈·랭킹 보상이 서버 상수에 반영된다', () => {
  assert.equal(WORK_POINTS, 500);
  assert.equal(TERRITORY_STEAL_COST, 50);
  assert.equal(TERRITORY_WIN_POINTS, 500);
  assert.equal(SHOP_ITEMS.miniGame10.price, 2_000);
  assert.equal(SHOP_ITEMS.fishing5.price, 500);
  assert.equal(SHOP_ITEMS.staminaHour.price, 500);
  assert.equal(SHOP_ITEMS.hungerHour.price, 700);
  assert.deepEqual(LIAR_BET_OPTIONS, [100, 500, 1_000]);
  assert.deepEqual(GAME_RANKING_PRIZES, [1_000, 500, 300]);
  assert.deepEqual(FISHING_REWARDS.map(({ label, reward }) => [label, reward]), [
    ['꽁초', 0], ['비떱명함', 5], ['미역줄기', 10], ['스낵면', 20], ['잔치국수', 50],
    ['매운갈비찜', 100], ['치즈돈가스', 200], ['까르보치킨', 300], ['잔치집 생굴', 500]
  ]);
  assert.deepEqual(FISHING_REWARDS.map(({ weight }) => weight), [15, 10, 20, 20, 15, 10, 7, 2, 1], '기존 등장 확률은 유지한다');
});

test('미니게임·낚시 추가 이용권은 하루 1회 제한 없이 구매할 때마다 누적된다', () => {
  const { state, user, pet } = stateWithPet(10_000);
  const mini = purchaseShopItem(state, user, pet, 'miniGame10', {}, 'ticket-mini-0001', BASE);
  assert.equal(mini.ok, true);
  assert.equal(mini.price, 2_000);
  assert.equal(pet.daily.miniGameBonus, 10);
  const miniAgain = purchaseShopItem(state, user, pet, 'miniGame10', {}, 'ticket-mini-0002', BASE);
  assert.equal(miniAgain.ok, true);
  assert.equal(pet.daily.miniGameBonus, 20);

  const fishing = purchaseShopItem(state, user, pet, 'fishing5', {}, 'ticket-fish-0001', BASE);
  assert.equal(fishing.ok, true);
  assert.equal(pet.daily.fishingBonus, 5);
  const fishingAgain = purchaseShopItem(state, user, pet, 'fishing5', {}, 'ticket-fish-0002', BASE);
  assert.equal(fishingAgain.ok, true);
  assert.equal(pet.daily.fishingBonus, 10);
  assert.equal(pet.stats.points, 5_000);

  const duplicateRequest = purchaseShopItem(state, user, pet, 'fishing5', {}, 'ticket-fish-0002', BASE);
  assert.equal(duplicateRequest.ok, true);
  assert.equal(duplicateRequest.duplicate, true);
  assert.equal(pet.daily.fishingBonus, 10, '같은 구매 요청 재전송은 횟수를 두 번 늘리지 않는다');

  applyDailyReset(pet, new Date(BASE.getTime() + 6 * 60 * 60_000));
  assert.equal(pet.daily.miniGameBonus, 0);
  assert.equal(pet.daily.fishingBonus, 0);
});

test('숫자맞히기는 성공 시도 횟수별 150/150/120/80/50P를 지급한다', () => {
  for (const [attempt, expected] of [[1, 150], [2, 150], [3, 120], [4, 80], [5, 50]]) {
    const { state, pet } = stateWithPet();
    const started = startMiniGame(state, pet, 'number', BASE);
    const challenge = state.miniGameChallenges[started.challenge.id];
    challenge.target = 100;
    for (let index = 1; index < attempt; index += 1) {
      const miss = finishMiniGame(state, pet, challenge.id, index, new Date(BASE.getTime() + index * 100));
      assert.equal(miss.finished, false);
    }
    const result = finishMiniGame(state, pet, challenge.id, 100, new Date(BASE.getTime() + attempt * 100));
    assert.equal(result.finished, true);
    assert.equal(result.reward, expected);
    assert.equal(pet.stats.points, expected);
  }
});

test('블록게임은 열 위치를 고정하고 각 열의 블록만 아래로 내린다', () => {
  const board = Array.from({ length: BLOCK_ROWS }, () => Array(BLOCK_COLUMNS).fill(null));
  board[10][0] = 0;
  board[11][0] = 0;
  board[11][1] = 1;
  board[10][2] = 1;
  assert.equal(blockGroupAt(board, 10, 0).length, 2);
  assert.equal(blockGroupAt(board, 11, 1).length, 1, '대각선 연결은 인정하지 않는다');

  board[10][0] = null;
  board[11][0] = null;
  const collapsed = collapseBlockBoard(board);
  assert.equal(collapsed[11][0], null, '빈 열을 없애거나 왼쪽으로 당기지 않는다');
  assert.equal(collapsed[11][1], 1, '기존 2번 열은 그 자리를 유지한다');
  assert.equal(collapsed[11][2], 1, '위에 있던 블록은 같은 열 아래로 내려온다');
  assert.equal(collapsed[10][2], null);
});

test('블록 보상표와 ALL CLEAR 보너스가 최종 밸런스 값으로 계산된다', () => {
  assert.deepEqual([2,3,4,5,6,7,8,9,10,12,13,15,16,30].map(blockRewardForSize), [5,9,13,18,23,29,35,42,52,52,65,65,80,80]);
  assert.equal(BLOCK_ALL_CLEAR_BONUS, 100);
});

test('블록판은 시작부터 충분한 제거 그룹을 가진 상태로 생성된다', () => {
  for (let seed = 1; seed <= 50; seed += 1) {
    let value = seed >>> 0;
    const random = () => ((value = (value * 1664525 + 1013904223) >>> 0) / 0x1_0000_0000);
    const board = createPlayableBlockBoard(random);
    assert.equal(board.length, BLOCK_ROWS);
    assert.equal(board.every((row) => row.length === BLOCK_COLUMNS), true);
    const stats = blockBoardStats(board);
    assert.ok(stats.removableGroups >= BLOCK_MIN_STARTING_GROUPS);
    assert.ok(stats.removableCells >= BLOCK_MIN_STARTING_REMOVABLE_CELLS);
  }
});

test('블록게임 최종 보상은 10x12·5색 시뮬레이션에서 판당 약 300P 범위다', () => {
  const groupsOn = (board) => {
    const seen = new Set();
    const groups = [];
    for (let row = 0; row < BLOCK_ROWS; row += 1) {
      for (let col = 0; col < BLOCK_COLUMNS; col += 1) {
        const key = row * BLOCK_COLUMNS + col;
        if (board[row][col] === null || seen.has(key)) continue;
        const group = blockGroupAt(board, row, col);
        for (const [groupRow, groupCol] of group) seen.add(groupRow * BLOCK_COLUMNS + groupCol);
        if (group.length >= 2) groups.push(group);
      }
    }
    return groups;
  };
  let total = 0;
  const samples = 150;
  for (let seed = 1; seed <= samples; seed += 1) {
    let value = seed >>> 0;
    const random = () => ((value = (value * 1664525 + 1013904223) >>> 0) / 0x1_0000_0000);
    let board = createPlayableBlockBoard(random);
    let points = 0;
    while (true) {
      const groups = groupsOn(board).sort((a, b) => b.length - a.length);
      if (!groups.length) break;
      const group = groups[0];
      for (const [row, col] of group) board[row][col] = null;
      points += blockRewardForSize(group.length);
      board = collapseBlockBoard(board);
    }
    if (blockBoardStats(board).remainingBlocks === 0) points += BLOCK_ALL_CLEAR_BONUS;
    total += points;
  }
  const average = total / samples;
  assert.ok(average >= 285 && average <= 335, `평균 ${average}P`);
});

test('블록 선택은 판 버전·요청 ID를 검사하고 ALL CLEAR를 한 번만 정산한다', () => {
  const { state, pet } = stateWithPet();
  const started = startMiniGame(state, pet, 'block', BASE);
  assert.equal(started.ok, true);
  const challenge = state.miniGameChallenges[started.challenge.id];
  challenge.blockBoard = Array.from({ length: BLOCK_ROWS }, () => Array(BLOCK_COLUMNS).fill(null));
  challenge.blockBoard[11][0] = 2;
  challenge.blockBoard[11][1] = 2;
  challenge.blockBoardVersion = 1;

  const stale = selectBlockGame(state, pet, challenge.id, { row: 11, col: 0, boardVersion: 0 }, 'block-stale-0001', BASE);
  assert.equal(stale.ok, true);
  assert.equal(stale.stale, true);
  assert.equal(pet.stats.points, 0);

  const cleared = selectBlockGame(state, pet, challenge.id, { row: 11, col: 0, boardVersion: 1 }, 'block-clear-0001', BASE);
  assert.equal(cleared.finished, true);
  assert.equal(cleared.allClear, true);
  assert.equal(cleared.reward, 5 + BLOCK_ALL_CLEAR_BONUS);
  assert.equal(pet.stats.points, 105);
  assert.equal(pet.daily.miniGamesPlayed, 1);
  const duplicate = selectBlockGame(state, pet, challenge.id, { row: 11, col: 0, boardVersion: 1 }, 'block-clear-0001', BASE);
  assert.equal(duplicate.ok, false);
  assert.equal(pet.stats.points, 105);
  assert.equal(pet.daily.miniGamesPlayed, 1);
});

test('블록게임 그만하기는 현재 누적 포인트만 한 번 확정 지급한다', () => {
  const { state, pet } = stateWithPet();
  const started = startMiniGame(state, pet, 'block', BASE);
  const challenge = state.miniGameChallenges[started.challenge.id];
  challenge.blockBoard = Array.from({ length: BLOCK_ROWS }, () => Array(BLOCK_COLUMNS).fill(null));
  challenge.blockBoard[11][0] = 0;
  challenge.blockBoard[11][1] = 0;
  challenge.blockBoard[11][5] = 1;
  challenge.blockBoard[11][6] = 1;
  challenge.blockBoardVersion = 1;

  const moved = selectBlockGame(state, pet, challenge.id, { row: 11, col: 0, boardVersion: 1 }, 'block-stop-move-0001', BASE);
  assert.equal(moved.finished, false);
  assert.equal(challenge.blockPendingPoints, 5);
  const stopped = stopMiniGame(state, pet, challenge.id, BASE);
  assert.equal(stopped.ok, true);
  assert.equal(stopped.finished, true);
  assert.equal(stopped.stopped, true);
  assert.equal(stopped.reward, 5);
  assert.equal(pet.stats.points, 5);
  assert.equal(pet.daily.miniGamesPlayed, 1);

  const duplicate = stopMiniGame(state, pet, challenge.id, BASE);
  assert.equal(duplicate.ok, false);
  assert.equal(pet.stats.points, 5);
  assert.equal(pet.daily.miniGamesPlayed, 1);
});

test('블록게임 API는 서버 판의 실제 그룹만 제거한다', async () => {
  const { room } = await createRoom();
  const token = await register(room, '블록API');
  const started = await responseJson(await room.fetch(authRequest('/api/minigames/start', token, {
    method: 'POST', body: JSON.stringify({ gameId: 'block' })
  })));
  assert.equal(started.response.status, 200);
  const challenge = started.data.bootstrap.activeMiniChallenge;
  let selected = null;
  for (let row = 0; row < BLOCK_ROWS && !selected; row += 1) {
    for (let col = 0; col < BLOCK_COLUMNS; col += 1) {
      if (blockGroupAt(challenge.blockBoard, row, col).length >= 2) { selected = { row, col }; break; }
    }
  }
  assert.ok(selected);
  const moved = await responseJson(await room.fetch(authRequest('/api/minigames/block/select', token, {
    method: 'POST',
    body: JSON.stringify({
      challengeId: challenge.id,
      ...selected,
      boardVersion: challenge.blockBoardVersion,
      requestId: 'block-api-move-0001'
    })
  })));
  assert.equal(moved.response.status, 200);
  assert.equal(moved.data.removed, true);
  assert.ok(moved.data.gainedPoints >= 5);
});
