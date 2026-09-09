import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ODD_EVEN_PAYOUT_PERCENT } from '../src/game/constants.js';
import { oddEvenPayout } from '../src/game/engine.js';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('홀짝은 1000P 기준 1연승 1500P, 2연승 3000P, 3연승 6000P를 정산한다', () => {
  assert.deepEqual({ ...ODD_EVEN_PAYOUT_PERCENT }, { 1:150, 2:300, 3:600 });
  assert.equal(oddEvenPayout(1000, 1), 1500);
  assert.equal(oddEvenPayout(1000, 2), 3000);
  assert.equal(oddEvenPayout(1000, 3), 6000);
});

test('홀짝 배팅 UI도 1.5배 3배 6배 안내와 같은 fallback 값을 사용한다', async () => {
  const app = await read('public/app.js');
  assert.match(app, /payoutPercent:\s*\{\s*1:\s*150,\s*2:\s*300,\s*3:\s*600\s*\}/);
  assert.match(app, /1연승은 1\.5배, 2연승은 3배, 3연승은 6배/);
});

test('사천성은 칸 크기를 건드리지 않고 그림만 데스크톱 94%, 모바일 96%로 확대한다', async () => {
  const css = await read('public/styles.css');
  assert.match(css, /\.sichuan-cell img\{[^}]*width:94%;height:94%;max-width:94%;max-height:94%/);
  assert.match(css, /\.sichuan-cell img \{ width:96%; height:96%; max-width:96%; max-height:96%; \}/);
  assert.match(css, /\.sichuan-cell\{[^}]*width:calc\(10% - var\(--sichuan-gap\)\);height:calc\(12\.5% - var\(--sichuan-gap\)\)/);
});

test('모바일 랭킹의 세 주요 그룹은 모두 3열이고 관계 순위만 2열을 유지한다', async () => {
  const css = await read('public/styles.css');
  assert.match(css, /\.ranking-section > \.rank-tabs-grid:not\(\.relation-rank-grid\),[\s\S]*?\.ranking-section \.battle-game-rank-grid \{ grid-template-columns:repeat\(3,minmax\(0,1fr\)\) !important; \}/);
  assert.match(css, /\.ranking-section \.relation-rank-grid \{ grid-template-columns:repeat\(2,minmax\(0,1fr\)\) !important; \}/);
});

test('삭제된 틀린그림 찾기 전용 spotWrong 애니메이션은 CSS에 남지 않는다', async () => {
  const css = await read('public/styles.css');
  assert.doesNotMatch(css, /spotWrong/);
});
