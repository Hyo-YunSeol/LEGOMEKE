import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import vm from 'node:vm';
import { SICHUAN_THEMES, SICHUAN_THEME_KEYS } from '../src/game/sichuan.js';

// Regression guard: PC must never need system emoji fonts to draw board tiles.
test('사천성 5개 테마 100개 타일은 폰트가 아닌 내장 이미지이며 모두 구분 가능한 파일이다', async () => {
  const tiles = SICHUAN_THEME_KEYS.flatMap((themeKey) => SICHUAN_THEMES[themeKey].tiles);
  assert.equal(tiles.length, 100);
  const images = new Set();
  for (const tile of tiles) {
    const name = new URL(`../public${tile.src}`, import.meta.url);
    const svg = await readFile(name, 'utf8');
    assert.match(svg, /<svg[^>]*viewBox="0 0 100 100"/);
    assert.match(svg, /<image\s[^>]*href="data:image\/png;base64,([A-Za-z0-9+/]+=*)"/);
    assert.doesNotMatch(svg, /<text\b|font-family=/);
    const image = svg.match(/data:image\/png;base64,([A-Za-z0-9+/]+=*)/)[1];
    assert.equal(Buffer.from(image, 'base64').subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    images.add(image);
  }
  // Space telescope appears in two different themes, so one cross-theme repeat is intentional.
  assert.ok(images.size >= 99);
});

test('서비스워커 사천성 캐시 경로 100개는 실제 5개 테마와 일치하고 캐시 대상 모두 존재한다', async () => {
  const source = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
  const sandbox = { self: { addEventListener() {} } };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  const cacheAssets = [...vm.runInContext('ASSETS', sandbox)];
  const sichuan = cacheAssets.filter((path) => path.startsWith('/sichuan/themes/'));
  assert.equal(sichuan.length, 100);
  for (const path of cacheAssets) {
    const assetPath = path.split('?')[0];
    await access(new URL(`../public${assetPath === '/' ? '/index.html' : assetPath}`, import.meta.url));
  }
  const expected = SICHUAN_THEME_KEYS.flatMap((themeKey) => SICHUAN_THEMES[themeKey].tiles.map((tile) => tile.src));
  assert.deepEqual(sichuan.map((url) => url.split('?')[0]).sort(), expected.sort());
});
