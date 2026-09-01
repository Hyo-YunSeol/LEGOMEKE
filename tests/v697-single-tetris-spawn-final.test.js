import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const sw = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
const index = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');

test('싱글 테트리스 새 블록은 대전과 동일하게 0행에서 즉시 보인다', () => {
  assert.match(app, /state\.active = \{ type, rotation: 0, row: 0, col: 3 \};/);
  assert.doesNotMatch(app, /state\.active = \{ type, rotation: 0, row: -1, col: 3 \};/);
});

test('기존 음수행 저장 상태가 복원돼도 0행으로 보정하고 구 저장키를 재사용하지 않는다', () => {
  assert.match(app, /SINGLE_TETRIS_STORAGE_KEY = 'lego_single_tetris_state_v2'/);
  assert.match(app, /if \(raw\.active && Number\(raw\.active\.row\) < 0\) raw\.active\.row = 0;/);
});

test('v6.10.4 정적 자산과 서비스워커 캐시 버전이 일치한다', () => {
  assert.match(index, /styles\.css\?v=610121/);
  assert.match(index, /app\.js\?v=610121/);
  assert.match(app, /sw\.js\?v=610121/);
  assert.match(sw, /const CACHE = 'lego-life-v610121-advancement-shop-spotdiff-semantic-final'/);
  assert.match(sw, /const VERSION = '610121'/);
});
