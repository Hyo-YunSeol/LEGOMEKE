import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stateWithUsers } from './helpers.js';
import {
  SPOT_DIFFERENCE_ATLAS_PUZZLES, SPOT_DIFFERENCE_ATLAS_VERSION, SPOT_DIFFERENCE_HITBOXES,
  SPOT_DIFFERENCE_MATCH_SECONDS, SPOT_DIFFERENCE_MAX_ROOMS, SPOT_DIFFERENCE_MAX_WRONG_CLICKS,
  SPOT_DIFFERENCE_RECENT_HISTORY, createSpotDifferenceRoom, joinSpotDifferenceRoom, spotDifferenceHitboxesForPuzzle
} from '../src/game/spot-difference.js';
import { renderSpotDifferenceScene, spotDifferenceAssetUrls, spotClientHitboxesForPuzzle } from '../public/spot-difference-scene.js';

const THEMES = ['body-guide','lego-room','convenience','beach','game-room','picnic','camping','cafe','festival','space-lab'];

test('v6.10.20 신규 틀린그림은 의미 객체 장면 v5·30개 후보·7개 정답·200판 중복 방지 사양을 사용한다', () => {
  assert.equal(SPOT_DIFFERENCE_ATLAS_VERSION, 5);
  assert.equal(SPOT_DIFFERENCE_ATLAS_PUZZLES.length, 20);
  assert.equal(SPOT_DIFFERENCE_HITBOXES.length, 18); // v2/v3 진행방 호환 좌표
  assert.equal(SPOT_DIFFERENCE_RECENT_HISTORY, 200);
  assert.equal(SPOT_DIFFERENCE_MATCH_SECONDS, 45);
  assert.equal(SPOT_DIFFERENCE_MAX_WRONG_CLICKS, 5);
  assert.equal(SPOT_DIFFERENCE_MAX_ROOMS, 3);
  for (const puzzle of SPOT_DIFFERENCE_ATLAS_PUZZLES) {
    assert.ok(THEMES.includes(puzzle.themeId));
    assert.ok(puzzle.variant === 0 || puzzle.variant === 1);
  }
  for (const themeId of THEMES) for (const variant of [0,1]) for (const seed of [1,2,3,77,99991]) {
    const puzzle = { assetVersion:5, themeId, variant, seed };
    const server = spotDifferenceHitboxesForPuzzle(puzzle);
    const client = spotClientHitboxesForPuzzle(puzzle);
    assert.deepEqual(client, server, `${themeId}:${variant}:${seed} client/server hitbox mismatch`);
    assert.equal(server.length, 30);
    for (let i=0;i<server.length;i+=1) for (let j=i+1;j<server.length;j+=1) {
      const a=server[i], b=server[j];
      assert.ok(Math.hypot(a.x-b.x,a.y-b.y) > a.r+b.r, `${themeId}:${variant}:${seed} ${a.id}/${b.id} overlap`);
    }
  }
});

test('새 대전은 assetVersion 5에서 원본 한 장을 만든 뒤 변경 장면에만 의미 있는 객체 변화를 적용한다', () => {
  const state = stateWithUsers([['atlas-u1','성인A'],['atlas-u2','성인B']], new Date('2026-08-31T10:00:00Z'));
  const pets = Object.values(state.pets);
  pets.forEach((pet) => { pet.stats.points = 10_000; });
  const created = createSpotDifferenceRoom(state, pets[0], 500, new Date('2026-08-31T10:00:00Z'));
  const joined = joinSpotDifferenceRoom(state, pets[1], created.roomId, new Date('2026-08-31T10:00:01Z'));
  assert.equal(joined.ok, true);
  const room = state.spotDifference.rooms[created.roomId];
  assert.equal(room.puzzle.assetVersion, 5);
  assert.equal(room.puzzle.differenceIds.length, 7);
  assert.equal(new Set(room.puzzle.differenceIds).size, 7);
  assert.equal(spotDifferenceAssetUrls(room.puzzle), null); // v5는 픽셀 찌그러뜨리기 atlas를 사용하지 않는다.
  const original = renderSpotDifferenceScene(room.puzzle, { changed: false });
  const changed = renderSpotDifferenceScene(room.puzzle, { changed: true });
  assert.match(original, /class="spot-scene-svg"/);
  assert.match(changed, /class="spot-scene-svg"/);
  assert.doesNotMatch(original, /spot-atlas-image|spot-natural-edit|spot-dynamic-difference/);
  assert.doesNotMatch(changed, /spot-natural-edit|clipPath/);
  assert.notEqual(changed, original);
});

test('모바일 깜빡임 방지는 경기 SVG DOM을 고정하고 진행 정보·정답 마커만 부분 패치한다', async () => {
  const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const scene = await readFile(new URL('../public/spot-difference-scene.js', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /spot-picture-grid\.counting \.spot-scene-svg\{visibility:hidden\}/);
  assert.doesNotMatch(css, /spot-picture-blind[^}]*transition:/);
  assert.match(app, /room\.status === 'playing' && patchSpotDifferenceLiveRoom\(room\)/);
  assert.match(app, /patchSpotDifferenceAnswers\(room\)/);
  assert.match(app, /patchSpotDifferenceProgress\(/);
  assert.match(scene, /renderCandidate\(type, hitbox, index, changed, accent, puzzle/);
  assert.match(scene, /다른 물건으로 교체|개수 변화|문양 변화/);
});
