import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initialState } from '../src/durable-store.js';
import { createPet, selectBlockGame, startMiniGame } from '../src/game/engine.js';
import {
  BLOCK_ALL_CLEAR_BONUS,
  BLOCK_BOARD_GENERATOR_VERSION,
  BLOCK_COLUMNS,
  BLOCK_ROWS,
  blockBoardStats,
  blockGroupAt,
  blockRewardForSize,
  collapseBlockBoard,
  createPlayableBlockBoard,
  normalizeBlockChallenge
} from '../src/game/block-game.js';
import {
  BODY_ADVANCEMENTS,
  SHOP_ITEMS,
  TERRITORY_SIZE
} from '../src/game/constants.js';
import { BLOCK_BATTLE_GRAVITY_MS } from '../src/game/block-battle.js';
import { SICHUAN_MATCH_SECONDS, SICHUAN_MAX_ROOMS } from '../src/game/sichuan.js';
import { LEGODOKU_MATCH_SECONDS, LEGODOKU_MAX_MISTAKES, LEGODOKU_MAX_ROOMS, LEGODOKU_SIZE } from '../src/game/legodoku.js';
import { territoryView } from '../src/game/territory.js';

const BASE = new Date('2026-09-02T12:00:00.000Z');

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => ((value = (value * 1664525 + 1013904223) >>> 0) / 0x1_0000_0000);
}

function removableGroups(board) {
  const seen = new Set();
  const groups = [];
  for (let row = 0; row < BLOCK_ROWS; row += 1) {
    for (let col = 0; col < BLOCK_COLUMNS; col += 1) {
      const key = row * BLOCK_COLUMNS + col;
      if (board[row][col] == null || seen.has(key)) continue;
      const group = blockGroupAt(board, row, col);
      for (const [groupRow, groupCol] of group) seen.add(groupRow * BLOCK_COLUMNS + groupCol);
      if (group.length >= 2) groups.push(group);
    }
  }
  return groups;
}

function addUser(state, id = 'v61024-user') {
  const user = { id, nickname: '회귀검증', generation: 1, currentPetId: null, sessionVersion: 1, notifications: [], createdAt: BASE.toISOString(), lastSeenAt: BASE.toISOString() };
  const pet = createPet(user, 1, BASE);
  user.currentPetId = pet.id;
  state.users[id] = user;
  state.pets[pet.id] = pet;
  return { user, pet };
}

test('블록게임 v3 생성기는 완주 보장 묶음을 제거하고 일반 12×10·5색 난수판을 만든다', () => {
  let deadEnds = 0;
  let allClears = 0;
  let totalFinalPoints = 0;
  for (let seed = 1; seed <= 600; seed += 1) {
    const random = seededRandom(seed);
    let board = createPlayableBlockBoard(random);
    assert.equal(board.length, 12);
    assert.equal(board.every((row) => row.length === 10), true);
    assert.equal(board.flat().every((value) => Number.isInteger(value) && value >= 0 && value < 5), true);
    let points = 0;
    let guard = 0;
    while (true) {
      const groups = removableGroups(board);
      if (!groups.length) break;
      const group = groups[Math.floor(random() * groups.length)];
      points += blockRewardForSize(group.length);
      for (const [row, col] of group) board[row][col] = null;
      board = collapseBlockBoard(board);
      guard += 1;
      assert.ok(guard <= 60, `seed ${seed}: 제거 루프가 비정상적으로 길어졌습니다.`);
    }
    const remaining = blockBoardStats(board).remainingBlocks;
    if (remaining === 0) { allClears += 1; points += BLOCK_ALL_CLEAR_BONUS; }
    else deadEnds += 1;
    totalFinalPoints += points;
  }
  assert.ok(deadEnds >= 570, `대부분의 판이 자연스럽게 미완주로 끝나야 합니다. deadEnds=${deadEnds}`);
  assert.ok(allClears <= 30, `ALL CLEAR가 흔하면 안 됩니다. allClears=${allClears}`);
  const average = totalFinalPoints / 600;
  assert.ok(average >= 240 && average <= 330, `평균 보상이 목표 범위를 크게 벗어났습니다. average=${average}`);
});

test('새 블록판만 generatorVersion=3을 쓰고 구버전 진행판은 version=1과 기존 판/포인트를 보존한다', () => {
  const state = initialState(BASE);
  const { pet } = addUser(state);
  const started = startMiniGame(state, pet, 'block', BASE);
  assert.equal(started.ok, true);
  const fresh = state.miniGameChallenges[started.challenge.id];
  assert.equal(fresh.blockBoardGeneratorVersion, BLOCK_BOARD_GENERATOR_VERSION);

  const oldBoard = Array.from({ length: 12 }, (_, row) => Array.from({ length: 10 }, (_, col) => (row + col) % 5));
  const legacy = {
    gameId: 'block', completed: false, blockBoard: oldBoard.map((row) => [...row]),
    blockPendingPoints: 77, blockRemovedCount: 11, blockMoveCount: 3, blockBoardVersion: 9
  };
  normalizeBlockChallenge(legacy);
  assert.equal(legacy.blockBoardGeneratorVersion, 1);
  assert.deepEqual(legacy.blockBoard, oldBoard);
  assert.equal(legacy.blockPendingPoints, 77);
  assert.equal(legacy.blockBoardVersion, 9);
});

test('블록게임 ALL CLEAR 보너스는 서버가 정확히 한 번만 지급하고 같은 완료 요청 재전송으로 포인트가 늘지 않는다', () => {
  const state = initialState(BASE);
  const { pet } = addUser(state, 'allclear-user');
  const started = startMiniGame(state, pet, 'block', BASE);
  const challenge = state.miniGameChallenges[started.challenge.id];
  challenge.blockBoard = Array.from({ length: 12 }, () => Array(10).fill(null));
  challenge.blockBoard[10][0] = 2;
  challenge.blockBoard[11][0] = 2;
  challenge.blockPendingPoints = 0;
  challenge.blockRemovedCount = 0;
  challenge.blockMoveCount = 0;
  challenge.blockBoardVersion = 1;
  normalizeBlockChallenge(challenge);
  const result = selectBlockGame(state, pet, challenge.id, { row: 11, col: 0, boardVersion: 1 }, 'allclear-request-0001', BASE);
  assert.equal(result.ok, true);
  assert.equal(result.finished, true);
  assert.equal(result.allClear, true);
  assert.equal(result.reward, blockRewardForSize(2) + BLOCK_ALL_CLEAR_BONUS);
  const after = pet.stats.points;
  const retry = selectBlockGame(state, pet, challenge.id, { row: 11, col: 0, boardVersion: 1 }, 'allclear-request-0001', BASE);
  assert.equal(retry.ok, true);
  assert.equal(retry.finished, true);
  assert.equal(retry.replayed, true);
  assert.equal(retry.reward, result.reward);
  assert.equal(pet.stats.points, after);
});

test('블록게임은 제거 가능 그룹 0개 판을 클릭 없이 종료 정산할 수 있고 재전송해도 중복 지급하지 않는다', () => {
  const state = initialState(BASE);
  const { pet } = addUser(state, 'dead-end-user');
  const started = startMiniGame(state, pet, 'block', BASE);
  const challenge = state.miniGameChallenges[started.challenge.id];
  // 서로 붙지 않은 두 블록만 남겨 확실한 dead-end를 만든다.
  challenge.blockBoard = Array.from({ length: BLOCK_ROWS }, () => Array(BLOCK_COLUMNS).fill(null));
  challenge.blockBoard[11][0] = 0;
  challenge.blockBoard[11][2] = 1;
  challenge.blockPendingPoints = 287;
  challenge.blockRemovedCount = 118;
  challenge.blockMoveCount = 31;
  challenge.blockBoardVersion = 32;
  normalizeBlockChallenge(challenge);
  assert.equal(challenge.blockAvailableGroups, 0);
  assert.equal(challenge.blockAllClear, false);

  const before = pet.stats.points;
  const result = selectBlockGame(state, pet, challenge.id, { row: -1, col: -1, boardVersion: 32 }, 'dead-end-finish-0001', BASE);
  assert.equal(result.ok, true);
  assert.equal(result.finished, true);
  assert.equal(result.allClear, false);
  assert.equal(result.reward, 287);
  assert.equal(pet.stats.points, before + 287);

  const retry = selectBlockGame(state, pet, challenge.id, { row: -1, col: -1, boardVersion: 32 }, 'dead-end-finish-0001', BASE);
  assert.equal(retry.ok, true);
  assert.equal(retry.finished, true);
  assert.equal(retry.replayed, true);
  assert.equal(retry.reward, 287);
  assert.equal(pet.stats.points, before + 287);
});

test('v6.10.25 정적 버전·서비스워커 모듈 캐시 키가 모두 6101260으로 일치한다', async () => {
  const [pkgText, index, app, sw] = await Promise.all([
    readFile(new URL('../package.json', import.meta.url), 'utf8'),
    readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/sw.js', import.meta.url), 'utf8')
  ]);
  assert.equal(JSON.parse(pkgText).version, '6.10.26');
  assert.match(index, /styles\.css\?v=6101260/);
  assert.match(index, /app\.js\?v=6101260/);
  assert.match(app, /block-battle-visual-state\.js\?v=6101260/);
  assert.match(app, /sw\.js\?v=6101260/);
  assert.match(app, /\/pets\/\$\{esc\(stage\.assetKey \|\| stage\.key\)\}\.svg\?v=6101260/);
  assert.match(app, /\/flex\/\$\{esc\(flexItem\.assetKey\)\}\.svg\?v=6101260/);
  assert.match(app, /legodoku\/bi-tteop-head\.svg\?v=6101260/);
  assert.match(app, /v=6101260/);
  assert.match(sw, /const CACHE = 'lego-life-v6101260-stability-final'/);
  assert.match(sw, /const VERSION = '6101260'/);
  assert.match(sw, /versioned\('\/block-battle-visual-state\.js'\)/);
  assert.match(sw, /keys\.filter\(\(key\) => key !== CACHE\).*caches\.delete/);
});

test('전직 상세 프로필·헤어지기 위험영역·블록 낙관 큐·지뢰 즉시 포인터 경로가 소스에 연결된다', async () => {
  const [app, css] = await Promise.all([
    readFile(new URL('../public/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/styles.css', import.meta.url), 'utf8')
  ]);
  const profileStart = app.indexOf('async function openProfile');
  const profileEnd = app.indexOf('function openOddEvenBet', profileStart);
  const profile = app.slice(profileStart, profileEnd);
  assert.match(profile, /const stage = visualStageForProfile\(profile\)/);
  assert.match(profile, /mutualCouple/);
  assert.match(profile, /profile-danger-zone/);
  assert.match(profile, /profile-breakup-button/);
  assert.doesNotMatch(profile, /profile-actions[\s\S]*data-action="breakup"[\s\S]*data-action="request-mating"/);
  assert.match(css, /\.profile-danger-zone/);
  assert.match(css, /\.profile-breakup-button/);
  assert.match(app, /blockGameInputQueue: \[\]/);
  assert.match(app, /function queueBlockGameSelection/);
  assert.match(app, /boardVersion: preview\.boardVersion/);
  assert.match(app, /async function drainBlockGameInputQueue/);
  assert.match(app, /if \(result\?\.stale \|\| !result\?\.ok\)/);
  assert.match(app, /blockGameHasPendingInputs\(\)/);
  assert.match(app, /function queueBlockGameSettlementIfNeeded/);
  assert.match(app, /function recoverBlockGameAfterAmbiguousFailure/);
  assert.match(app, /requestBlockGameInput/);
  assert.match(app, /event\.pointerType === 'mouse'[\s\S]*submitMinesweeperAction\('reveal'/);
});

test('전직 11종 자산과 기존 핵심 게임 규칙 및 추가 구매 가격을 보존한다', () => {
  assert.equal(Object.keys(BODY_ADVANCEMENTS).length, 11);
  assert.equal(TERRITORY_SIZE, 6);
  assert.equal(SHOP_ITEMS.battle20.price, 4_000);
  assert.equal(BLOCK_BATTLE_GRAVITY_MS, 700);
  assert.equal(SICHUAN_MATCH_SECONDS, 150);
  assert.equal(SICHUAN_MAX_ROOMS, 5);
  assert.equal(LEGODOKU_SIZE, 8);
  assert.equal(LEGODOKU_MATCH_SECONDS, 180);
  assert.equal(LEGODOKU_MAX_MISTAKES, 5);
  assert.equal(LEGODOKU_MAX_ROOMS, 3);
});

test('기존 5×5 영토 좌표는 6×6 확장 때 초기화되지 않고 그대로 남는다', () => {
  const state = initialState(BASE);
  const { pet } = addUser(state, 'territory-user');
  state.territory = {
    ...state.territory,
    size: 5,
    version: 8,
    cells: {
      '0:0': { ownerPetId: pet.id, claimedAt: BASE.toISOString(), home: true },
      '4:4': { ownerPetId: pet.id, claimedAt: BASE.toISOString(), home: false }
    }
  };
  const view = territoryView(state, pet.id);
  assert.equal(view.size, 6);
  assert.equal(view.cells.find((cell) => cell.row === 0 && cell.col === 0)?.ownerPetId, pet.id);
  assert.equal(view.cells.find((cell) => cell.row === 4 && cell.col === 4)?.ownerPetId, pet.id);
  assert.equal(state.territory.size, 6);
});
