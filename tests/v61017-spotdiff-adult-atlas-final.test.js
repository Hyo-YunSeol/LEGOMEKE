import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { stateWithUsers } from './helpers.js';
import {
  SPOT_DIFFERENCE_ATLAS_PUZZLES, SPOT_DIFFERENCE_ATLAS_VERSION,
  SPOT_DIFFERENCE_MATCH_SECONDS, SPOT_DIFFERENCE_MAX_ROOMS, SPOT_DIFFERENCE_MAX_WRONG_CLICKS,
  createSpotDifferenceRoom, joinSpotDifferenceRoom
} from '../src/game/spot-difference.js';
import { renderSpotDifferenceScene, spotDifferenceAssetUrls } from '../public/spot-difference-scene.js';

const ROOT = new URL('../', import.meta.url);
const THEMES = ['body-guide','lego-room','convenience','beach','game-room','picnic','camping','cafe','festival','space-lab'];

test('신규 틀린그림 문제는 성인용 로컬 WebP 20세트와 정확히 일치하는 7개 정답을 사용한다', async () => {
  assert.equal(SPOT_DIFFERENCE_ATLAS_VERSION, 2);
  assert.equal(SPOT_DIFFERENCE_ATLAS_PUZZLES.length, 20);
  assert.equal(SPOT_DIFFERENCE_MATCH_SECONDS, 45);
  assert.equal(SPOT_DIFFERENCE_MAX_WRONG_CLICKS, 5);
  assert.equal(SPOT_DIFFERENCE_MAX_ROOMS, 3);

  for (const puzzle of SPOT_DIFFERENCE_ATLAS_PUZZLES) {
    assert.ok(THEMES.includes(puzzle.themeId));
    assert.ok(puzzle.variant === 0 || puzzle.variant === 1);
    assert.equal(new Set(puzzle.differenceIds).size, 7);
    for (const side of ['base','changed']) {
      const path = new URL(`../public/spot-atlas/${puzzle.themeId}-${puzzle.variant}-${side}.webp`, import.meta.url);
      const info = await stat(path);
      assert.ok(info.size > 8_000, `${path.pathname} 이미지가 지나치게 작거나 누락되었습니다.`);
    }
  }
});

test('실제 새 대전은 assetVersion 2 문제를 만들고 클라이언트는 SVG 아이콘 대신 로컬 atlas 이미지를 그린다', () => {
  const state = stateWithUsers([['atlas-u1','성인A'],['atlas-u2','성인B']], new Date('2026-08-31T10:00:00Z'));
  const pets = Object.values(state.pets);
  pets.forEach((pet) => { pet.stats.points = 10_000; });
  const created = createSpotDifferenceRoom(state, pets[0], 500, new Date('2026-08-31T10:00:00Z'));
  const joined = joinSpotDifferenceRoom(state, pets[1], created.roomId, new Date('2026-08-31T10:00:01Z'));
  assert.equal(joined.ok, true);
  const room = state.spotDifference.rooms[created.roomId];
  assert.equal(room.puzzle.assetVersion, 2);
  assert.equal(room.puzzle.differenceIds.length, 7);
  const configured = SPOT_DIFFERENCE_ATLAS_PUZZLES.find((item) => item.themeId === room.puzzle.themeId && item.variant === room.puzzle.variant);
  assert.ok(configured);
  assert.deepEqual([...room.puzzle.differenceIds].sort(), [...configured.differenceIds].sort());
  const urls = spotDifferenceAssetUrls(room.puzzle);
  assert.match(urls.original, /\/spot-atlas\/.+-base\.webp\?v=610117$/);
  assert.match(urls.changed, /\/spot-atlas\/.+-changed\.webp\?v=610117$/);
  const original = renderSpotDifferenceScene(room.puzzle, { changed: false });
  const changed = renderSpotDifferenceScene(room.puzzle, { changed: true });
  assert.match(original, /class="spot-atlas-image"/);
  assert.match(original, /-base\.webp\?v=610117/);
  assert.match(changed, /-changed\.webp\?v=610117/);
  assert.doesNotMatch(original, /filter="url\(#spotHue\)"/);
});

test('모바일 깜빡임 방지는 카운트다운 동안 이미지를 숨기지 않고 로컬 atlas를 선로딩·서비스워커 캐시한다', async () => {
  const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const scene = await readFile(new URL('../public/spot-difference-scene.js', import.meta.url), 'utf8');
  const sw = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /spot-picture-grid\.counting \.spot-scene-svg\{visibility:hidden\}/);
  assert.doesNotMatch(css, /spot-picture-blind[^}]*transition:/);
  assert.match(app, /preloadSpotDifferenceSceneAssets\(room\?\.puzzle\)/);
  assert.match(scene, /const atlasPreload = new Map\(\)/);
  assert.match(sw, /\/spot-atlas\/\$\{themeId\}-\$\{variant\}-base\.webp/);
  assert.match(sw, /\/spot-atlas\/\$\{themeId\}-\$\{variant\}-changed\.webp/);
  assert.match(sw, /lego-life-v610117-spotdiff-adult-atlas-final/);
});
