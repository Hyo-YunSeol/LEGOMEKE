import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');

test('레고도쿠 판은 레고 이미지가 들어와도 64칸 절대좌표로 정사각형을 유지한다', () => {
  assert.match(css, /Legodoku final hard lock/);
  assert.match(css, /\.legodoku-board\{[\s\S]*position:relative;[\s\S]*aspect-ratio:1 \/ 1/);
  assert.match(css, /\.legodoku-cell\{[\s\S]*position:absolute;[\s\S]*width:12\.5%;[\s\S]*height:12\.5%;[\s\S]*contain:size layout paint/);
  assert.match(css, /\.legodoku-head\{[\s\S]*position:absolute;[\s\S]*inset:11%/);
  assert.match(app, /--legodoku-left:\$\{left\}%;--legodoku-top:\$\{top\}%/);
});

test('레고도쿠 조작법은 상단에서 누르면 레고, 드래그하면 X라고 바로 안내한다', () => {
  assert.match(app, /legodoku-input-guide/);
  assert.match(app, /누르면 레고<\/b>빈칸을 한 번 누르면 레고를 놓음/);
  assert.match(app, /드래그하면 X<\/b>빈칸에서 그대로 끌면 X 표시/);
  assert.match(app, /X 지우기<\/b>X에서 시작해 드래그하면 지움/);
  assert.ok(app.indexOf('${inputGuide}${stage}') > -1, '조작 안내는 경기 stage보다 먼저 렌더링되어야 한다');
});

test('레고도쿠 판은 흰 바탕과 진한 초록 경계로 대비를 높인다', () => {
  assert.match(css, /region-0,[\s\S]*region-6\{background:#fff\}/);
  assert.match(css, /region-1,[\s\S]*region-7\{background:#c4dfcc\}/);
  assert.match(css, /\.legodoku-cell\.edge-top\{border-top-color:#1f6f49\}/);
  assert.match(css, /\.legodoku-board\{[\s\S]*border-color:#195f3d/);
});


test('레고도쿠 관전은 비공개 문구 대신 두 플레이어 판을 동시에 표시하고 실시간 갱신한다', () => {
  assert.doesNotMatch(app, /경기 중 위치 비공개/);
  assert.match(app, /legodoku-spectator-boards/);
  assert.match(app, /playerPetId: room\.host\?\.petId/);
  assert.match(app, /playerPetId: room\.guest\?\.petId/);
  assert.match(app, /patchLegodokuSpectatorBoardsDom/);
  assert.match(css, /\.legodoku-spectator-boards\{[\s\S]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});
