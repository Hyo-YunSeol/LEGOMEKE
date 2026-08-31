import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const styles = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
const index = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const sw = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');

test('싱글 테트리스 플레이 중 하단 메뉴를 완전히 숨기고 종료 때 전용 모드를 해제한다', () => {
  assert.match(app, /function setSingleTetrisModalMode\(active\)/);
  assert.match(app, /document\.body\.classList\.toggle\('single-tetris-playing', app\.singleTetrisModalActive\)/);
  assert.match(app, /setSingleTetrisModalMode\(singleTetrisMode\)/);
  assert.match(app, /setSingleTetrisModalMode\(false\)/);
  assert.match(styles, /body\.single-tetris-playing \.bottom-nav \{ display:none !important; \}/);
  assert.match(app, /if \(!button \|\| app\.singleTetrisModalActive\) return;/);
});

test('싱글 테트리스는 280px·48dvh 고정 제한 대신 실제 남은 화면으로 10x20 최대 크기를 계산한다', () => {
  assert.doesNotMatch(styles, /single-tetris-board[^}]*280px/);
  assert.doesNotMatch(styles, /single-tetris-board[^}]*48dvh/);
  assert.match(app, /function syncSingleTetrisLayout\(\)/);
  assert.match(app, /const desktopSplit = Boolean\(window\.matchMedia/);
  assert.match(app, /game\.clientHeight - gamePadding - fixedHeight - 8/);
  assert.match(app, /stage\.clientHeight \|\| game\.clientHeight - gamePadding/);
  assert.match(app, /Math\.min\(cap, availableWidth, availableHeight \/ 2\)/);
  assert.match(app, /board\.style\.height = `\$\{boardWidth \* 2\}px`/);
  assert.match(app, /syncSingleTetrisLayout\(\); startSingleTetrisTimers\(\)/);
  assert.match(app, /syncMinesweeperGameLayout\(\);\s*syncSingleTetrisLayout\(\);/);
  assert.match(styles, /@media \(min-width:760px\) and \(min-height:720px\)[\s\S]*grid-template-columns:minmax\(360px,1fr\) minmax\(280px,320px\)/);
});

test('싱글 테트리스 전용 모달은 visual viewport 전체 높이를 쓰고 시작 토스트가 조작부를 가리지 않는다', () => {
  assert.match(styles, /\.modal-root\.single-tetris-modal-root\s*\{[^}]*height:var\(--visual-viewport-height,100dvh\)/s);
  assert.match(styles, /\.modal-root\.single-tetris-modal-root \.modal\s*\{[^}]*height:100%;[^}]*max-height:100%;/s);
  assert.match(styles, /body\.single-tetris-playing > \.toast\.game-start \{ display:none !important; \}/);
  assert.match(app, /idValue === 'tetrisSingle'\s*\? \{ toastResult: false \}/);
  assert.match(app, /gameId:'tetrisSingle'\},null,'POST',\{toastResult:false\}/);
});

test('v6.10.4 정적 자산과 서비스워커 캐시 버전이 일치한다', () => {
  assert.match(index, /styles\.css\?v=610115/);
  assert.match(index, /app\.js\?v=610115/);
  assert.match(app, /sw\.js\?v=610115/);
  assert.match(sw, /const CACHE = 'lego-life-v61015-spot-touch-3room-45sec-final'/);
  assert.match(sw, /const VERSION = '610115'/);
});
