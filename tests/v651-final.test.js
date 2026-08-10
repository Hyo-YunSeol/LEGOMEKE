import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createPet, buyCosmetic, cosmeticView, COSMETIC_SHOP } from '../src/game/engine.js';

const BASE = new Date('2026-08-10T00:00:00.000Z');

test('영구 칭호는 상점에서 완전히 제거되고 무지개 닉네임/상메가 판매된다', () => {
  assert.equal(COSMETIC_SHOP.some((item) => item.kind === 'title' || item.title), false);
  const name = COSMETIC_SHOP.find((item) => item.id === 'nameRainbow');
  const status = COSMETIC_SHOP.find((item) => item.id === 'statusRainbow');
  assert.ok(name && name.hours === 72 && name.price === 2000);
  assert.ok(status && status.hours === 72 && status.price === 1200);
});

test('같은 글자 부위의 효과는 새 효과 구매 시 교체되고 무지개가 뷰에 노출된다', () => {
  const pet = createPet({ id:'u-rainbow', nickname:'무지개' }, 1, BASE);
  pet.stats.points = 10000;
  assert.equal(buyCosmetic(pet, 'nameSparkle', BASE).ok, true);
  assert.ok(pet.cosmetics.nameSparkleUntil);
  assert.equal(buyCosmetic(pet, 'nameRainbow', new Date(BASE.getTime()+1000)).ok, true);
  assert.equal(pet.cosmetics.nameSparkleUntil, null);
  assert.ok(pet.cosmetics.nameRainbowUntil);
  const view = cosmeticView(pet, new Date(BASE.getTime()+2000));
  assert.equal(view.nameRainbow, true);
  assert.equal(view.nameSparkle, false);

  assert.equal(buyCosmetic(pet, 'statusGlow', BASE).ok, true);
  assert.equal(buyCosmetic(pet, 'statusRainbow', new Date(BASE.getTime()+1000)).ok, true);
  assert.equal(pet.cosmetics.statusGlowUntil, null);
  assert.equal(cosmeticView(pet, new Date(BASE.getTime()+2000)).statusRainbow, true);
});

test('모바일 교미 버튼은 하단 메뉴와 겹치지 않게 모달 영역이 분리되고 버튼 터치 높이가 확보된다', async () => {
  const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
  const final = css.slice(css.lastIndexOf('/* v6.5.1 최종'));
  assert.match(final, /\.modal-root\s*\{[\s\S]*?inset:\s*0 0 calc\(72px \+ env\(safe-area-inset-bottom\)\) 0/);
  assert.match(final, /\.profile-actions > button\s*\{[\s\S]*?min-height:\s*48px/);
  assert.match(final, /@media \(max-width: 520px\)[\s\S]*?\.profile-actions\s*\{\s*grid-template-columns:\s*1fr/);
});

test('하단 메뉴는 PC/모바일 공통 click 단일 경로만 사용하고 구형 pointerup/650ms 차단을 쓰지 않는다', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /bottomNav\?\.addEventListener\('click'/);
  assert.doesNotMatch(app, /lastTouchNavAt/);
  assert.doesNotMatch(app, /bottomNav\?\.addEventListener\('pointerup'/);
  assert.match(app, /switchMainTab\(button\.dataset\.tab, \{ smooth: false \}\)/);
});

test('모바일 순위 닉네임은 2\/3\/2열을 유지하면서 기존보다 읽을 수 있게 커졌다', async () => {
  const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
  const final = css.slice(css.lastIndexOf('/* v6.5.1 최종'));
  assert.match(final, /\.ranking-section \.rank-row > button\s*\{[\s\S]*?font-size:\s*\.68rem/);
  assert.match(css, /\.ranking-section \.game-rank-grid \{ grid-template-columns:repeat\(3/);
  assert.match(css, /\.ranking-section \.rank-tabs-grid \{ grid-template-columns:repeat\(2/);
});

test('상점 영구 칭호 UI 문구가 사라지고 무지개 CSS가 실제 화면 클래스에 연결된다', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /\['title', '영구 칭호'/);
  assert.match(app, /function cosmeticNameClass/);
  assert.match(app, /function cosmeticStatusClass/);
  assert.match(css, /\.cos-name-rainbow/);
  assert.match(css, /\.cos-status-rainbow/);
});
