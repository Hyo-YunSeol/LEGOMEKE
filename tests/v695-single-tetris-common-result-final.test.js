import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MINI_GAMES, SINGLE_TETRIS_DURATION_MS } from '../src/game/constants.js';
import { startMiniGame, finishMiniGame, stopMiniGame, rankingsView } from '../src/game/engine.js';
import { stateWithUsers } from './helpers.js';

const BASE = new Date('2026-08-24T00:00:00.000Z');
const [app, styles] = await Promise.all([
  readFile(new URL('../public/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/styles.css', import.meta.url), 'utf8')
]);

test('싱글 테트리스는 개인게임 1회를 시작 즉시 쓰고 2분·고정 700ms 사양을 제공한다', () => {
  assert.equal(SINGLE_TETRIS_DURATION_MS, 120_000);
  assert.equal(MINI_GAMES.tetrisSingle?.id, 'tetrisSingle');
  const state = stateWithUsers([['u1', '레고']], BASE);
  const pet = state.pets[state.users.u1.currentPetId];
  const before = pet.daily.miniGamesPlayed;
  const started = startMiniGame(state, pet, 'tetrisSingle', BASE);
  assert.equal(started.ok, true);
  assert.equal(pet.daily.miniGamesPlayed, before + 1);
  assert.equal(new Date(started.challenge.expiresAt).getTime() - BASE.getTime(), 120_000);
  assert.equal(started.challenge.tetrisGravityMs, 700);
});

test('싱글 테트리스 점수는 1/3/5/8점이며 포인트 1:1·최고점 랭킹으로 정상 정산한다', () => {
  const state = stateWithUsers([['u1', '레고']], BASE);
  const pet = state.pets[state.users.u1.currentPetId];
  pet.stats.points = 1000;
  const started = startMiniGame(state, pet, 'tetrisSingle', BASE);
  const endedAt = new Date(BASE.getTime() + 60_000);
  const result = finishMiniGame(state, pet, started.challenge.id, null, endedAt, {
    endReason: 'gameover', lineClearCounts: { 1: 2, 2: 1, 3: 1, 4: 2 }
  });
  // 2*1 + 1*3 + 1*5 + 2*8 = 26점, 줄은 2 + 2 + 3 + 8 = 15줄
  assert.equal(result.ok, true);
  assert.equal(result.score, 26);
  assert.equal(result.lines, 15);
  assert.equal(result.reward, 26);
  assert.equal(pet.stats.points, 1026);
  assert.equal(pet.records.singleTetrisBestScore, 26);
  assert.equal(rankingsView(state, pet.id).singleTetris[0].score, 26);
  assert.equal(rankingsView(state, pet.id).myGameRanks.singleTetris.rank, 1);
  const duplicate = finishMiniGame(state, pet, started.challenge.id, null, new Date(endedAt.getTime() + 10), {
    endReason: 'gameover', lineClearCounts: { 4: 99 }
  });
  assert.equal(duplicate.ok, false);
  assert.equal(pet.stats.points, 1026, '중복 종료로 포인트를 두 번 지급하면 안 된다');
});

test('싱글 테트리스 포기는 사용 횟수를 돌려주지 않고 점수·랭킹·포인트를 남기지 않는다', () => {
  const state = stateWithUsers([['u1', '레고']], BASE);
  const pet = state.pets[state.users.u1.currentPetId];
  pet.stats.points = 1000;
  const started = startMiniGame(state, pet, 'tetrisSingle', BASE);
  const used = pet.daily.miniGamesPlayed;
  const stopped = stopMiniGame(state, pet, started.challenge.id, new Date(BASE.getTime() + 15_000));
  assert.equal(stopped.ok, true);
  assert.equal(stopped.reward, 0);
  assert.equal(stopped.abandoned, true);
  assert.equal(pet.daily.miniGamesPlayed, used);
  assert.equal(pet.stats.points, 1000);
  assert.equal(pet.records.singleTetrisBestScore, 0);
  assert.deepEqual(rankingsView(state, pet.id).singleTetris, []);
});

test('타임아웃은 2분 전에 제출할 수 없고 2분 후 정상 정산한다', () => {
  const state = stateWithUsers([['u1', '레고']], BASE);
  const pet = state.pets[state.users.u1.currentPetId];
  const first = startMiniGame(state, pet, 'tetrisSingle', BASE);
  const early = finishMiniGame(state, pet, first.challenge.id, null, new Date(BASE.getTime() + 110_000), {
    endReason: 'timeout', lineClearCounts: { 4: 1 }
  });
  assert.equal(early.ok, false);
  assert.equal(state.miniGameChallenges[first.challenge.id].completed, false);
  const normal = finishMiniGame(state, pet, first.challenge.id, null, new Date(BASE.getTime() + 120_100), {
    endReason: 'timeout', lineClearCounts: { 4: 1 }
  });
  assert.equal(normal.ok, true);
  assert.equal(normal.score, 8);
  assert.equal(normal.reward, 8);
});

test('싱글 테트리스 클라이언트는 기존 7종·10x20·NEXT·고정 속도·무일시정지·결과 오버레이를 구현한다', () => {
  assert.match(app, /const SINGLE_TETRIS_WIDTH = 10/);
  assert.match(app, /const SINGLE_TETRIS_HEIGHT = 20/);
  assert.match(app, /const SINGLE_TETRIS_GRAVITY_MS = BLOCK_BATTLE_GRAVITY_MS/);
  assert.match(app, /SINGLE_TETRIS_SCORE = Object\.freeze\(\{ 1: 1, 2: 3, 3: 5, 4: 8 \}\)/);
  assert.match(app, /singleTetrisNextHtml/);
  assert.match(app, /data-action="single-tetris-control"/);
  assert.match(app, /2분 · 속도 고정[^`]*일시정지 없음/);
  assert.match(app, /data-action="single-tetris-abandon"/);
  assert.match(app, /single-tetris-result-overlay/);
  assert.match(app, /최종 점수/);
  assert.match(app, /제거한 줄/);
  assert.match(app, /획득 포인트/);
  assert.match(app, /최고 기록/);
  assert.match(app, /data-action="single-tetris-restart"/);
  assert.match(app, /data-action="single-tetris-exit"/);
  assert.match(styles, /\.single-tetris-board\{[^}]*aspect-ratio:1\/2/);
});

test('공통 결과창은 오목·테트리스대전·사천성·다빈치에 재사용되고 게임판 제거 전 확인을 기다린다', () => {
  assert.match(app, /function commonBattleResultOverlay\(/);
  for (const game of ['omok', 'blockBattle', 'sichuan', 'davinci']) {
    assert.match(app, new RegExp(`commonBattleResultOverlay\\('${game}'`));
  }
  assert.match(app, /data-action="battle-result-confirm"/);
  assert.match(app, /common-game-result-overlay/);
  assert.match(styles, /\.common-game-result-overlay,\.single-tetris-result-overlay\{position:fixed/);
  assert.match(styles, /body\.game-result-open\{position:fixed/);
  assert.match(app, /document\.querySelector\('\.common-game-result-overlay'\)/);
  assert.match(app, /app\.dismissedGameResults\.add\(key\)/);
});

test('사천성 레이아웃은 CSS Grid 행 계산을 완전히 제거하고 80개 절대좌표 슬롯을 쓴다', () => {
  const boardRule = styles.match(/\.sichuan-board\{([^}]*)\}/)?.[1] || '';
  const cellRule = styles.match(/\.sichuan-cell\{([^}]*)\}/)?.[1] || '';
  assert.match(boardRule, /position:relative/);
  assert.match(boardRule, /display:block/);
  assert.match(boardRule, /aspect-ratio:10\/8/);
  assert.doesNotMatch(boardRule, /grid-template|grid-auto|align-content/);
  assert.match(cellRule, /position:absolute/);
  assert.match(cellRule, /left:calc\(var\(--sichuan-left\)/);
  assert.match(cellRule, /top:calc\(var\(--sichuan-top\)/);
  assert.match(cellRule, /width:calc\(10% - var\(--sichuan-gap\)\)/);
  assert.match(cellRule, /height:calc\(12\.5% - var\(--sichuan-gap\)\)/);
  assert.match(app, /tile\.src[^\n]*v=610101/);
});
