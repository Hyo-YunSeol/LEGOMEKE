import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const styles = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
const index = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const sw = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

test('사천성 빈 슬롯은 전역 empty 메시지 클래스를 절대 사용하지 않는다', () => {
  // .empty intentionally spans every grid column for generic empty-state messages.
  // Reusing it for a removed Sichuan tile makes each removed pair create full-width rows.
  assert.match(styles, /\.empty\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/);
  assert.doesNotMatch(app, /class="sichuan-cell\s+empty"/);
  assert.match(app, /class="sichuan-cell sichuan-empty-cell"/);
  const emptyRule = styles.match(/\.sichuan-empty-cell\{([^}]*)\}/)?.[1] || '';
  assert.match(emptyRule, /grid-column:auto/);
  assert.match(emptyRule, /grid-row:auto/);
  assert.match(emptyRule, /visibility:hidden/);
  assert.match(emptyRule, /pointer-events:none/);
});

test('사천성 80개 슬롯은 인덱스 기반 8x10 고정 좌표를 사용해 제거 후에도 재배치되지 않는다', () => {
  assert.match(app, /const row = Math\.floor\(index \/ 10\) \+ 1;/);
  assert.match(app, /const column = \(index % 10\) \+ 1;/);
  assert.match(app, /const position = `grid-row:\$\{row\};grid-column:\$\{column\}`;/);
  assert.match(app, /data-index="\$\{index\}"[^>]*aria-rowindex="\$\{row\}"[^>]*aria-colindex="\$\{column\}"[^>]*style="\$\{position\}"/);
  assert.match(app, /aria-rowcount="8" aria-colcount="10"/);
  const boardRule = styles.match(/\.sichuan-board\{([^}]*)\}/)?.[1] || '';
  const cellRule = styles.match(/\.sichuan-cell\{([^}]*)\}/)?.[1] || '';
  assert.match(boardRule, /grid-template-columns:repeat\(10,minmax\(0,1fr\)\)/);
  assert.match(cellRule, /aspect-ratio:1\/1/);
});

test('v6.9.6 캐시 버전은 HTML·앱·서비스워커에 일치한다', () => {
  assert.equal(pkg.version, '6.9.8');
  assert.match(index, /\/styles\.css\?v=69801/);
  assert.match(index, /\/app\.js\?v=69801/);
  assert.match(app, /\/sw\.js\?v=69801/);
  assert.match(app, /tile\.src[^\n]*v=69801/);
  assert.match(sw, /const CACHE = 'lego-life-v69801-single-tetris-2min-final'/);
  assert.match(sw, /const VERSION = '69801'/);
});
