import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { TERRITORY_WIN_POINTS } from '../src/game/constants.js';
import { territoryLimitForLevel, nextTerritoryUpgrade } from '../src/game/progression.js';

const [app, styles] = await Promise.all([
  readFile(new URL('../public/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/styles.css', import.meta.url), 'utf8')
]);

test('오목 준비 입력은 pointerdown에서 즉시 처리하고 뒤따르는 click을 억제한다', () => {
  assert.match(app, /\[data-action="omok-rps"\], \[data-action="omok-color"\]/);
  assert.match(app, /omokSetupPointerSuppressUntil = Date\.now\(\) \+ 1200/);
  assert.match(app, /action === 'omok-rps'[\s\S]*preserveControls: true/);
  assert.match(app, /action === 'omok-color'[\s\S]*preserveControls: true/);
});

test('사천성은 10열 8행 고정 그리드와 셀 높이 제한으로 판 틀을 유지한다', () => {
  assert.match(styles, /\.sichuan-board\{[^}]*grid-template-columns:repeat\(10,minmax\(0,1fr\)\)[^}]*grid-auto-rows:auto[^}]*align-content:start[^}]*height:auto[^}]*overflow:hidden/);
  assert.doesNotMatch(styles, /\.sichuan-board\{[^}]*aspect-ratio:11\/10/);
  assert.match(styles, /\.sichuan-cell\{[^}]*height:auto[^}]*aspect-ratio:1\/1[^}]*overflow:hidden/);
  assert.match(app, /previousSichuanRooms/);
  assert.match(app, /stateVersion \|\| 0\) < Number\(previous\.stateVersion \|\| 0\)/);
});

test('개인 미니게임 포기하기는 각 게임 내용의 최상단에 배치된다', () => {
  assert.match(app, /<div class="apple-game"><div class="mini-abandon-controls apple-abandon-controls">/);
  assert.match(app, /<div class="minesweeper-game[^`]*"><div class="mini-abandon-controls minesweeper-controls">/);
  assert.match(app, /<div class="block-game"><div class="mini-abandon-controls block-controls">/);
});

test('영토전은 남은 시간을 비공개로 고정하고 1위 5,000P·Lv20 7칸·최대 10칸을 사용한다', () => {
  assert.equal(TERRITORY_WIN_POINTS, 5_000);
  assert.equal(territoryLimitForLevel(20), 7);
  assert.equal(territoryLimitForLevel(28), 10);
  assert.equal(territoryLimitForLevel(999), 10);
  assert.deepEqual(nextTerritoryUpgrade(20), { level: 22, limit: 8 });
  assert.match(app, /compactMetric\('남은 시간', '비공개'\)/);
  assert.match(app, /종료 시각 비공개 · 각 6시간 구간 안에서 한 번 랜덤 종료됩니다\./);
  assert.match(app, /단독 1위는 5,000P를 받습니다/);
});
