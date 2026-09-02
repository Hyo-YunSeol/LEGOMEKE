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

test('블록게임 v2 생성기는 1,200개 시드에서 임의 제거 순서로도 중간 막힘 없이 항상 ALL CLEAR 된다', () => {
  for (let seed = 1; seed <= 1_200; seed += 1) {
    const random = seededRandom(seed);
    let board = createPlayableBlockBoard(random);
    assert.equal(board.length, 12);
    assert.equal(board.every((row) => row.length === 10), true);
    let guard = 0;
    while (true) {
      const stats = blockBoardStats(board);
      if (stats.remainingBlocks === 0) break;
      const groups = removableGroups(board);
      assert.ok(groups.length > 0, `seed ${seed}: ${stats.remainingBlocks}개가 남았는데 제거 그룹이 없습니다.`);
      const group = groups[Math.floor(random() * groups.length)];
      for (const [row, col] of group) board[row][col] = null;
      board = collapseBlockBoard(board);
      guard += 1;
      assert.ok(guard <= 60, `seed ${seed}: 제거 루프가 비정상적으로 길어졌습니다.`);
    }
    assert.equal(blockBoardStats(board).remainingBlocks, 0, `seed ${seed}`);
  }
});

test('새 블록판만 generatorVersion=2를 쓰고 구버전 진행판은 version=1과 기존 판/포인트를 보존한다', () => {
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
  assert.equal(retry.ok, false);
  assert.equal(pet.stats.points, after);
});

test('v6.10.24 정적 버전·서비스워커 모듈 캐시 키가 모두 6101240으로 일치한다', async () => {
  const [pkgText, index, app, sw] = await Promise.all([
    readFile(new URL('../package.json', import.meta.url), 'utf8'),
    readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/sw.js', import.meta.url), 'utf8')
  ]);
  assert.equal(JSON.parse(pkgText).version, '6.10.24');
  assert.match(index, /styles\.css\?v=6101240/);
  assert.match(index, /app\.js\?v=6101240/);
  assert.match(app, /block-battle-visual-state\.js\?v=6101240/);
  assert.match(app, /sw\.js\?v=6101240/);
  assert.match(app, /\/pets\/\$\{esc\(stage\.assetKey \|\| stage\.key\)\}\.svg\?v=6101240/);
  assert.match(app, /\/flex\/\$\{esc\(flexItem\.assetKey\)\}\.svg\?v=6101240/);
  assert.match(app, /legodoku\/bi-tteop-head\.svg\?v=6101240/);
  assert.match(app, /v=6101240/);
  assert.match(sw, /const CACHE = 'lego-life-v6101240-safe-fixes-final'/);
  assert.match(sw, /const VERSION = '6101240'/);
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
