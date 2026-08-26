import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { canConnectSichuan as serverCanConnect } from '../src/game/sichuan.js';

const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
const index = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const sw = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} function missing`);
  const brace = source.indexOf('{', start);
  let depth = 0;
  let quote = null;
  let escaped = false;
  let templateExprDepth = 0;
  for (let i = brace; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (quote === '`' && ch === '$' && source[i + 1] === '{') { templateExprDepth += 1; i += 1; depth += 1; continue; }
      if (ch === quote && templateExprDepth === 0) quote = null;
      else if (quote === '`' && ch === '}' && templateExprDepth > 0) { templateExprDepth -= 1; depth -= 1; }
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  assert.fail(`${name} closing brace missing`);
}

test('사천성 클라이언트 선검증은 서버 연결 규칙과 동일하다', () => {
  const source = extractFunction(app, 'canConnectSichuanClient');
  const context = {};
  vm.runInNewContext(`${source}; globalThis.clientCanConnect = canConnectSichuanClient;`, context);
  const clientCanConnect = context.clientCanConnect;
  const tiles = ['a','b','c','d','e'];
  let seed = 0x610110;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0x100000000; };
  for (let sample = 0; sample < 120; sample += 1) {
    const board = Array(80).fill(null);
    for (let i = 0; i < 80; i += 1) if (random() < 0.58) board[i] = tiles[Math.floor(random() * tiles.length)];
    for (let pair = 0; pair < 40; pair += 1) {
      const a = Math.floor(random() * 80), b = Math.floor(random() * 80);
      assert.equal(clientCanConnect(board, a, b), serverCanConnect(board, a, b), `sample=${sample} pair=${a},${b}`);
    }
  }
});

test('사천성은 네트워크 왕복 동안 판을 잠그지 않고 낙관적 제거를 순차 전송한다', () => {
  assert.match(app, /sichuanPairQueue:\s*\[\]/);
  assert.match(app, /sichuanPendingPairs:\s*\[\]/);
  assert.match(app, /function enqueueSichuanPair\(room, first, second\)/);
  assert.match(app, /app\.sichuanPendingPairs\.push\(item\);[\s\S]*app\.sichuanPairQueue\.push\(item\);[\s\S]*patchSichuanLiveRoom\(room\);/);
  assert.match(app, /async function drainSichuanPairQueue\(\)/);
  assert.match(app, /if \(app\.sichuanPairSending\) return;/);
  assert.match(app, /queueMicrotask\(drainSichuanPairQueue\)/);
  assert.match(app, /const interactive = Boolean\(isPlayer && room\.status === 'playing' && self\);/);
  assert.match(app, /if \(!patchSichuanBoard\(self, \{ interactive: true \}\)\) return false;/);
  const tileHandler = app.slice(app.indexOf("if (action === 'sichuan-tile')"), app.indexOf("if (action === 'davinci-create')"));
  assert.doesNotMatch(tileHandler, /sichuanActionInFlight/);
  assert.match(tileHandler, /const effectiveBoard = sichuanEffectiveBoard\(self, room\);/);
  assert.match(tileHandler, /canConnectSichuanClient\(effectiveBoard, first, index\)/);
  assert.match(app, /const sichuanTileButton = event\.target\.closest\?\.\('\[data-action=\"sichuan-tile\"\]'\)/);
  assert.match(app, /event\.pointerType === 'mouse'[\s\S]*sichuanPointerSuppressUntil[\s\S]*handleAction\(sichuanTileButton, event\)/);
});

test('사천성 서버 최신 상태 위에도 미확정 제거쌍을 유지해 패가 순간적으로 되살아나지 않는다', () => {
  assert.match(app, /function sichuanEffectiveBoard\(player, room = currentSichuanRoom\(\)\)/);
  assert.match(app, /for \(const pending of sichuanPendingPairsFor\(room\)\)/);
  assert.match(app, /board\[pending\.first\] = null/);
  assert.match(app, /board\[pending\.second\] = null/);
  assert.match(app, /const board = sichuanEffectiveBoard\(player\);/);
  assert.match(app, /const removed = sichuanEffectiveRemovedCount\(player\);/);
});

test('사과는 전용 가변 stage, 블록·지뢰찾기는 flex 잔여 높이를 기준으로 판을 축소한다', () => {
  const appleSource = extractFunction(app, 'syncAppleGameLayout');
  assert.match(appleSource, /#apple-board-stage/);
  assert.match(appleSource, /stage\.clientHeight - verticalPadding/);
  assert.match(appleSource, /stage\.clientWidth - horizontalPadding/);
  assert.match(app, /new ResizeObserver\(\(\) => syncAppleGameLayout\(\)\)/);
  for (const name of ['syncBlockGameLayout', 'syncMinesweeperGameLayout']) {
    const source = extractFunction(app, name);
    assert.match(source, /game\.clientHeight - fixedHeight - boardMargins - 4/);
    assert.match(source, /getComputedStyle\(board\)/);
    assert.match(source, /marginTop/);
    assert.match(source, /marginBottom/);
  }
  assert.match(app, /requestAnimationFrame\(syncAppleGameLayout\)/);
  assert.match(app, /requestAnimationFrame\(syncBlockGameLayout\)/);
  assert.match(app, /requestAnimationFrame\(syncMinesweeperGameLayout\)/);
  assert.match(app, /window\.addEventListener\('orientationchange', syncGameViewportLayout\)/);
});

test('모바일 전체화면 미니게임 모달은 최후 세로 스크롤을 허용하고 3개 HUD를 한 줄로 유지한다', () => {
  assert.match(css, /\.modal-root\.apple-modal-root \.modal \{[^}]*height:\s*100%;[^}]*min-height:0;[^}]*overflow-y:auto;[^}]*box-sizing:border-box;/s);
  assert.match(css, /\.apple-game \{[^}]*flex:\s*1 1 0;[^}]*box-sizing:border-box;/s);
  assert.match(css, /\.block-game \{[^}]*flex:\s*1 1 0;[^}]*box-sizing:border-box;/s);
  assert.match(css, /\.minesweeper-game \{[^}]*flex:1 1 0;[^}]*box-sizing:border-box;/s);
  assert.match(css, /\.apple-hud \{[^}]*grid-template-columns:\s*repeat\(3,minmax\(0,1fr\)\)/s);
  assert.match(css, /\.block-hud \{[^}]*grid-template-columns:\s*repeat\(3,minmax\(0,1fr\)\)/s);
  assert.match(css, /@media \(max-height: 700px\)[\s\S]*\.apple-refresh-offer \.button-row > button \{ min-height:36px/);
});

test('v6.10.4 정적 자산 캐시 버전이 모두 일치한다', () => {
  assert.equal(pkg.version, '6.10.10');
  assert.match(index, /styles\.css\?v=610110/);
  assert.match(index, /app\.js\?v=610110/);
  assert.match(app, /sw\.js\?v=610110/);
  assert.match(sw, /const VERSION = '610110'/);
});
