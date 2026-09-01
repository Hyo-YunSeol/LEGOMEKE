import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');

test('레고도쿠 판은 레고 이미지가 들어와도 8x8 정사각형 그리드를 유지한다', () => {
  assert.match(css, /\.legodoku-board\{[\s\S]*grid-template-rows:repeat\(8,minmax\(0,1fr\)\)/);
  assert.match(css, /\.legodoku-cell\{[\s\S]*width:100%;[\s\S]*height:100%/);
  assert.match(css, /\.legodoku-head\{[\s\S]*max-width:78%;[\s\S]*max-height:78%/);
});

test('레고도쿠 조작법은 판 바로 위에서 탭과 꾹 누른 채 드래그를 명확히 안내한다', () => {
  assert.match(app, /legodoku-input-guide/);
  assert.match(app, /레고 놓기<\/b> 한 번 탭/);
  assert.match(app, /X 표시<\/b> 빈칸을 꾹 누른 채 드래그/);
  assert.match(app, /X 지우기<\/b> X에서 꾹 누른 채 드래그/);
});

test('레고도쿠 판은 흰 바탕과 진한 초록 경계로 대비를 높인다', () => {
  assert.match(css, /region-0,[\s\S]*region-6\{background:#fff\}/);
  assert.match(css, /region-1,[\s\S]*region-7\{background:#c4dfcc\}/);
  assert.match(css, /\.legodoku-cell\.edge-top\{border-top-color:#1f6f49\}/);
  assert.match(css, /\.legodoku-board\{[\s\S]*border-color:#195f3d/);
});
