import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [server, app, css] = await Promise.all([
  readFile(new URL('../src/game/spot-difference.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/styles.css', import.meta.url), 'utf8')
]);

test('틀린그림찾기는 서버와 클라이언트 fallback 모두 정확히 3방만 운영한다', () => {
  assert.match(server, /SPOT_DIFFERENCE_MAX_ROOMS = 3/);
  assert.match(server, /틀린그림찾기 대전방 3개가 모두 사용 중입니다/);
  assert.doesNotMatch(server, /틀린그림찾기 대전방 5개가 모두 사용 중입니다/);
  assert.match(app, /Array\.from\(\{ length: game\?\.maxRooms \|\| 3 \}/);
  assert.match(app, /rooms\.length < \(game\?\.maxRooms \|\| 3\)/);
  assert.doesNotMatch(app, /game\?\.maxRooms \|\| 5/);
});

test('PC 1대1 게임 순위는 5개를 한 줄에 압축하지 않고 3열로 배치한다', () => {
  assert.match(css, /\.battle-game-rank-grid\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important\}/);
  assert.doesNotMatch(css, /\.battle-game-rank-grid\{grid-template-columns:repeat\(5,minmax\(0,1fr\)\)!important\}/);
  assert.match(css, /@media\(max-width:560px\)[\s\S]*?\.battle-game-rank-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
});
