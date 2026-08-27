import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
const sw = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');

test('1대1 테트리스 낙하 블록은 고정 board 셀과 분리된 4칸 active 레이어로 그린다', () => {
  assert.match(app, /function blockBattleActiveRenderCells\(player\)/);
  assert.match(app, /function blockBattleActiveLayerHtml\(player\)/);
  assert.match(app, /class="block-battle-active-layer"/);
  assert.match(app, /data-block-active-cell="\$\{index\}"/);
  assert.match(app, /\$\{blockBattleActiveLayerHtml\(player\)\}<\/div>`/);
  assert.doesNotMatch(app, /board\[row\]\[col\] = player\.active\.type/);
});

test('일반 낙하에서는 200칸을 다시 칠하지 않고 active 레이어 transform만 바꾼다', () => {
  assert.match(app, /function paintBlockBattleActiveLayer\(player, board,/);
  assert.match(app, /translate3d\(\$\{cell\.col \* 100\}%,\$\{cell\.row \* 100\}%,0\)/);
  assert.match(app, /if \(!activeOnly\) \{[\s\S]*for \(let index = 0; index < 200; index \+= 1\)/);
  assert.match(app, /activeOnly: true, preserveActiveOnMissing: true/);
});

test('진행 중 내 active가 순간 누락된 snapshot이어도 화면에서 즉시 지우지 않는다', () => {
  assert.match(app, /if \(preserveOnMissing && layer\.dataset\.activeReady === '1'\) return true/);
  assert.match(app, /function preserveBlockBattleActiveContinuity\(previous, room\)/);
  assert.match(app, /incomingPlayer\.active = \{ \.\.\.previousPlayer\.active \}/);
  assert.match(app, /preserveBlockBattleActiveContinuity\(previous, room\)/);
});

test('모바일 합성 안정화를 위해 active 레이어는 absolute GPU layer이며 새 캐시 버전을 사용한다', () => {
  assert.match(css, /\.block-battle-board \{ position:relative;/);
  assert.match(css, /\.block-battle-active-layer \{[^}]*position:absolute;[^}]*transform:translateZ\(0\);[^}]*backface-visibility:hidden/s);
  assert.match(css, /\.block-battle-active-cell \{[^}]*width:10%;[^}]*height:5%;[^}]*will-change:transform/s);
  assert.match(sw, /const CACHE = 'lego-life-v610106-tetris-instant-spawn-final'/);
  assert.match(sw, /const VERSION = '610106'/);
});
