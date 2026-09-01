import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const sw = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');

test('1대1 테트리스는 싱글과 동일하게 board와 active를 하나의 10x20 composite 화면으로 그린다', () => {
  assert.match(app, /function blockBattleCompositeBoard\(player\)/);
  assert.match(app, /board\[row\]\[col\] = active\.type/);
  assert.doesNotMatch(app, /function blockBattleActiveLayerHtml\(player\)/);
  assert.doesNotMatch(app, /data-block-active-cell=/);
  assert.doesNotMatch(app, /\$\{blockBattleActiveLayerHtml\(player\)\}/);
});

test('1대1 테트리스 낙하는 200셀 DOM을 교체하지 않고 실제 변경 class만 갱신한다', () => {
  assert.match(app, /const visual = blockBattleCompositeBoard\(player\);/);
  assert.match(app, /__blockBattlePaintCache/);
  assert.match(app, /if \(cache\[index\] !== className\) \{/);
  assert.match(app, /cells\[index\]\.className = className;/);
  assert.doesNotMatch(app, /paintBlockBattleActiveLayer\(/);
});

test('진행 중 active가 순간 누락된 서버 snapshot은 직전 유효 active를 보존한다', () => {
  assert.match(app, /function preserveBlockBattleActiveContinuity\(previous, room\)/);
  assert.match(app, /incomingPlayer\.active = \{ \.\.\.previousPlayer\.active \}/);
  assert.match(app, /preserveBlockBattleActiveContinuity\(previous, room\)/);
});

test('새 테트리스 렌더러는 새 정적 캐시 버전으로 강제 갱신된다', () => {
  assert.match(sw, /const CACHE = 'lego-life-v610120-advancement-shop-spotdiff-semantic-final'/);
  assert.match(sw, /const VERSION = '610120'/);
});
