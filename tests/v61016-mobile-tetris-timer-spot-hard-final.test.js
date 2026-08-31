import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stateWithUsers } from './helpers.js';
import {
  SPOT_DIFFERENCE_HITBOXES,
  createSpotDifferenceRoom,
  joinSpotDifferenceRoom
} from '../src/game/spot-difference.js';
import { SPOT_CLIENT_HITBOXES } from '../public/spot-difference-scene.js';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

function generatedRoom(seedOffset = 0) {
  const base = Date.parse('2026-08-31T09:00:00.000Z') + seedOffset * 1000;
  const state = stateWithUsers([[`hard-a-${seedOffset}`, 'A'], [`hard-b-${seedOffset}`, 'B']], new Date(base));
  const players = Object.values(state.pets);
  players.forEach((pet) => { pet.stats.points = 10_000; });
  const made = createSpotDifferenceRoom(state, players[0], 100, new Date(base));
  assert.equal(made.ok, true);
  const joined = joinSpotDifferenceRoom(state, players[1], made.roomId, new Date(base + 100));
  assert.equal(joined.ok, true);
  return state.spotDifference.rooms[made.roomId];
}

test('v6.10.16 타이머는 서버 재동기화 후에도 같은 deadline 숫자가 역행하지 않는다', async () => {
  const app = await read('public/app.js');
  assert.match(app, /function stableCountdownSeconds\(key, deadlineMs, nowMs\)/);
  assert.match(app, /const seconds = Math\.min\(previous\.seconds, raw\)/);
  assert.match(app, /app\.spotDifferenceServerSyncedAt = app\.bootstrapSyncedAt/);
  assert.match(app, /stableCountdownSeconds\(`omok:/);
  assert.match(app, /stableCountdownSeconds\(`davinci:/);
  assert.match(app, /stableCountdownSeconds\(`sichuan:/);
  assert.match(app, /stableCountdownSeconds\(`apple:/);
  assert.match(app, /stableCountdownSeconds\(`single-tetris:/);
  assert.match(app, /stableElapsedMilliseconds\(`minesweeper:/);
});

test('v6.10.16 틀린그림 시작 카운트다운은 100ms 갱신으로 3→2→1을 표시하고 경기 전에는 45초를 고정 표시한다', async () => {
  const app = await read('public/app.js');
  assert.match(app, /const startSeconds = Math\.min\(3, Math\.max\(1, stableCountdownSeconds\(startKey, revealAt, now\)\)\)/);
  assert.match(app, /: 45;/);
  assert.match(app, /app\.spotDifferenceClockTimer = setInterval\(\(\) => \{/);
  assert.match(app, /\}, 100\);/);
  assert.match(app, /button\.disabled = !ready/);
});

test('v6.10.16 모바일 1대1 테트리스는 주소창 높이 변화만으로 보드 폭을 다시 계산하지 않는다', async () => {
  const [app, css] = await Promise.all([read('public/app.js'), read('public/styles.css')]);
  assert.match(app, /matchMedia\?\.\('\(orientation: landscape\)'\)/);
  assert.match(app, /const widthBucket = Math\.round\(width \/ 24\)/);
  assert.match(app, /const layoutKey = `\$\{room\.id\}:\$\{room\.matchId \|\| 'match'\}:\$\{orientation\}:\$\{widthBucket\}`/);
  assert.match(app, /if \(!force && app\.blockBattleViewportLayoutKey === layoutKey\) return/);
  assert.doesNotMatch(app, /visualViewport\?\.addEventListener\('scroll', syncBlockBattleViewport\)/);
  assert.match(css, /--block-battle-main-width/);
  assert.match(css, /width:var\(--block-battle-main-width\) !important/);
  assert.match(css, /position:static !important/);
  assert.match(css, /\.spot-difference-wrap \{ display:none !important; \}/);
});

test('v6.10.16 틀린그림은 체형도감 캐릭터를 장면에 사용하고 1·4·2 난이도로 7개를 출제한다', async () => {
  const scene = await read('public/spot-difference-scene.js');
  assert.match(scene, /lego-myth-disaster/);
  assert.match(scene, /lego-leviathan/);
  assert.match(scene, /<image href="\/pets\/\$\{asset\}\.svg"/);
  assert.match(scene, /difficulty:'easy'/);
  assert.match(scene, /difficulty:'normal'/);
  assert.match(scene, /difficulty:'hard'/);
  assert.deepEqual(SPOT_CLIENT_HITBOXES, SPOT_DIFFERENCE_HITBOXES);

  for (let run = 0; run < 80; run += 1) {
    const room = generatedRoom(run);
    const selected = room.puzzle.differenceIds.map((id) => SPOT_DIFFERENCE_HITBOXES.find((item) => item.id === id));
    const counts = selected.reduce((acc, item) => {
      acc[item.difficulty] = (acc[item.difficulty] || 0) + 1;
      return acc;
    }, {});
    assert.deepEqual(counts, { easy: 1, normal: 4, hard: 2 });
    for (let i = 0; i < selected.length; i += 1) {
      for (let j = i + 1; j < selected.length; j += 1) {
        const a = selected[i], b = selected[j];
        assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > a.r + b.r + 0.018);
      }
    }
  }
});
