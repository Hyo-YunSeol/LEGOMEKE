import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SICHUAN_THEMES } from '../src/game/sichuan.js';

const expectedLabels = ['레고세상', '먹거리', '동물원', '일상잡화', '판타지'];

test('사천성 5테마는 서로 다른 콘셉트 이름과 테마 내부 20개 고유 그림명을 가진다', () => {
  assert.deepEqual(Object.values(SICHUAN_THEMES).map((theme) => theme.label), expectedLabels);
  for (const theme of Object.values(SICHUAN_THEMES)) {
    assert.equal(theme.tiles.length, 20);
    assert.equal(new Set(theme.tiles.map((tile) => tile.label)).size, 20, `${theme.label}에 중복 그림명이 있습니다.`);
  }
});

test('사천성 100개 SVG는 큰 100x100 규격이며 예전 비눗방울 배경을 포함하지 않는다', async () => {
  for (const [themeKey, theme] of Object.entries(SICHUAN_THEMES)) {
    for (const tile of theme.tiles) {
      const svg = await readFile(new URL(`../public${tile.src}`, import.meta.url), 'utf8');
      assert.match(svg, /<svg[^>]+viewBox="0 0 100 100"/);
      assert.doesNotMatch(svg, /<rect x="6" y="6" width="88" height="88" rx="22"/);
      assert.doesNotMatch(svg, /<circle cx="50" cy="50" r="34" fill="#ffffff" opacity="\.72"/);
      assert.match(svg, new RegExp(`aria-label="${tile.label}"`), `${themeKey}/${tile.id} label mismatch`);
    }
  }
});

test('연승 패널티는 보드 입력을 막지 않고 내 그림만 숨긴다', async () => {
  const [app, css, server] = await Promise.all([
    readFile(new URL('../public/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/styles.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/game/sichuan.js', import.meta.url), 'utf8')
  ]);
  assert.match(app, /const interactive = Boolean\(isPlayer && room\.status === 'playing' && self\);/);
  assert.match(app, /patchSichuanBoard\(self, \{ interactive: true, conceal: mineActive \}\)/);
  assert.match(app, /sichuanBoardHtml\(self, \{ interactive, conceal: sichuanPenaltyActive\(room, room\.selfPetId\) \}\)/);
  assert.doesNotMatch(app, /if \(sichuanPenaltyActive\(room, room\.selfPetId\)\) \{[^}]*return;/);
  assert.match(css, /\.sichuan-board\.sichuan-concealed \.sichuan-cell:not\(\.sichuan-empty-cell\) img\{visibility:hidden\}/);
  assert.doesNotMatch(css, /\.sichuan-streak-overlay\{/);
  const playStart = server.indexOf('export function playSichuanPair');
  const playEnd = server.indexOf('\nexport function', playStart + 10);
  const playSource = server.slice(playStart, playEnd > playStart ? playEnd : undefined);
  assert.doesNotMatch(playSource, /retryAfterMs|penalty:\s*true|streakPenaltyUntil/);
});

test('사천성 그림은 셀 영역 100%를 사용하고 전용 캐시 키로 교체 자산을 강제 갱신한다', async () => {
  const [app, css, sw] = await Promise.all([
    readFile(new URL('../public/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/styles.css', import.meta.url), 'utf8'),
    readFile(new URL('../public/sw.js', import.meta.url), 'utf8')
  ]);
  assert.match(css, /\.sichuan-cell img\{[^}]*width:100%;height:100%;max-width:100%;max-height:100%/);
  assert.match(app, /tile\.src[^\n]*v=6101270&s=6101271/);
  assert.match(sw, /versionedSichuan = \(path\) => `\$\{path\}\?v=\$\{VERSION\}&s=6101271`/);
});
