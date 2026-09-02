import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const index = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const sw = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
const worker = await readFile(new URL('../src/worker.js', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

test('사천성 플레이 중 상태 갱신은 전체 innerHTML 재생성보다 부분 패치를 우선한다', () => {
  assert.match(app, /function patchSichuanLiveRoom\(room\)/);
  assert.match(app, /if \(!patchSichuanLiveRoom\(room\)\) renderSichuanRegion\(\)/);
  assert.match(app, /const sichuanLivePatched = Boolean\(liveSichuanRoom\?\.status === 'playing' && patchSichuanLiveRoom\(liveSichuanRoom\)\)/);
  assert.match(app, /if \(pane\.dataset\.rendered === 'true'[\s\S]*patchSichuanLiveRoom\(liveSichuanRoom\)\)[\s\S]*return;/);
});

test('사천성 80개 셀은 매치 동안 유지하고 바뀐 타일만 DOM을 교체한다', () => {
  assert.match(app, /data-sichuan-slot="\$\{index\}"/);
  assert.match(app, /const cells = boardNode\.querySelectorAll\('\.sichuan-cell\[data-index\]'\);/);
  assert.match(app, /if \(cells\.length !== 80\) return false;/);
  assert.match(app, /if \(currentTileId !== tileId \|\| !cell\.querySelector\('img'\)\)/);
  assert.match(app, /if \(cell\.childNodes\.length\) cell\.replaceChildren\(\);/);
});

test('사천성 타이머는 전체 렌더 시 2:30으로 초기화하지 않고 즉시 서버 마감시간을 사용한다', () => {
  assert.match(app, /const timer = room\.status === 'playing' \? '<b id="sichuan-countdown">--:--<\/b>'/);
  assert.doesNotMatch(app, /id="sichuan-countdown">2:30<\/b>/);
  assert.match(app, /if \(room\?\.status === 'playing'\) updateSichuanCountdown\(room\);/);
});

test('사천성 SVG는 미리 로드하고 폴링 폴백에서도 live patch 모드를 사용한다', () => {
  assert.match(app, /function preloadSichuanTiles\(\)/);
  assert.match(app, /const image = new Image\(\);/);
  assert.match(app, /loadBootstrap\(\{ silent: true, renderMode: room\?\.status === 'playing' \? 'games-live' : 'full' \}\)/);
});

test('v6.10.24 캐시·HTML·Worker 버전이 모두 일치한다', () => {
  assert.equal(pkg.version, '6.10.24');
  assert.match(index, /styles\.css\?v=6101240/);
  assert.match(index, /app\.js\?v=6101240/);
  assert.match(app, /sw\.js\?v=6101240/);
  assert.match(sw, /lego-life-v6101240-safe-fixes-final/);
  assert.match(sw, /const VERSION = '6101240'/);
  assert.match(worker, /APP_VERSION = '6\.10\.24-safe-fixes-final'/);
});
