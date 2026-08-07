import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const appJs = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');

test('영토전 화면은 4×4를 행 4개·각 행 4칸으로 렌더링한다', () => {
  assert.match(appJs, /const mapSize = Math\.max\(1, Math\.floor\(Number\(territory\.size\) \|\| 4\)\)/);
  assert.match(appJs, /Array\.from\(\{ length: mapSize \}, \(_, row\) =>/);
  assert.match(appJs, /Array\.from\(\{ length: mapSize \}, \(_, col\) =>/);
  assert.match(css, /\.territory-row\s*\{[^}]*grid-template-columns:\s*repeat\(4,minmax\(0,1fr\)\)/s);
});

test('영토전은 별도 출발점 선택 없이 칸을 누르고 서버가 본진·주변 8칸·탈취 규칙을 판정한다', () => {
  assert.match(appJs, /data-action="claim-territory-direct"/);
  assert.match(appJs, /perform\('\/api\/territory\/claim', \{ row, col \}\)/);
  assert.doesNotMatch(appJs, /territoryMoveSource|selectedTerritory|sourceRow|sourceCol/);
  assert.match(appJs, /주변 8칸/);
  assert.match(appJs, /본진/);
});

test('공용맵은 회색 칸에 소유자 닉네임을 표시하고 사용자별 고정 색을 계산한다', () => {
  assert.match(appJs, /function territoryOwnerColor/);
  assert.match(appJs, /territory-owner/);
  assert.match(appJs, /ownerDisplayName/);
  assert.match(css, /\.territory-cell\.vacant[^}]*background:\s*#c9cdd5/s);
  assert.match(css, /\.territory-cell\.occupied[^}]*background:\s*#b8bdc7/s);
  assert.match(css, /\.territory-owner[^}]*color:\s*var\(--owner-color\)/s);
  assert.match(css, /\.territory-cell\.mine[^}]*border:\s*3px solid var\(--owner-color/s);
});


test('영토전 UI는 본진과 황금 공개 상태를 구분해 표시한다', () => {
  assert.match(appJs, /territory-home-icon/);
  assert.match(appJs, /황금 영토 공개까지/);
  assert.match(appJs, /황금 영토 공개됨/);
  assert.match(css, /\.territory-cell\.home/);
});
