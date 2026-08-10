import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createPet, buyCosmetic, cosmeticView, COSMETIC_SHOP } from '../src/game/engine.js';
import { initialState } from '../src/durable-store.js';
import { initialTerritory, claimTerritory, territoryView } from '../src/game/territory.js';
import { levelUpperBound } from '../src/game/progression.js';

const BASE = new Date('2026-08-10T01:00:00.000Z');

function makeUser(id, nickname) {
  return { id, nickname, generation:1, currentPetId:null, sessionVersion:1, notifications:[], createdAt:BASE.toISOString(), lastSeenAt:BASE.toISOString() };
}

function addPet(state, id, nickname) {
  const user = makeUser(id, nickname);
  const pet = createPet(user, 1, BASE);
  user.currentPetId = pet.id;
  state.users[id] = user;
  state.pets[pet.id] = pet;
  return pet;
}

test('상점의 모든 판매 상품은 구매 후 서버 뷰에 실제 활성 상태를 만든다', () => {
  assert.ok(COSMETIC_SHOP.length >= 10);
  for (const item of COSMETIC_SHOP) {
    const user = makeUser(`shop-${item.id}`, item.id);
    const pet = createPet(user, 1, BASE);
    pet.stats.points = 100000;
    const result = buyCosmetic(pet, item.id, BASE);
    assert.equal(result.ok, true, item.id);
    const view = cosmeticView(pet, new Date(BASE.getTime() + 1000));
    if (item.kind === 'background') {
      assert.equal(view.background, item.background, `${item.id} background`);
      assert.ok(view.expiresAt.background, `${item.id} expiry`);
    } else {
      assert.equal(view[item.id], true, `${item.id} active`);
      assert.ok(view.expiresAt[item.id], `${item.id} expiry`);
    }
  }
});

test('프로필 팝업에서도 닉네임 효과와 카드/오라/배경 효과가 실제 DOM 클래스에 연결된다', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
  assert.match(app, /profile-title \$\{cosmeticNameClass\(profile\.cosmetics\)\}/);
  assert.match(app, /profile-detail \$\{cosmeticClasses\(profile\.cosmetics\)\}/);
  assert.match(app, /profile-status-detail \$\{cosmeticStatusClass\(profile\.cosmetics\)\}/);
  assert.match(css, /\.cos-name-sparkle\s*\{[\s\S]*?animation:\s*legoNameSparkle/);
  assert.match(css, /\.cos-status-glow\s*\{[\s\S]*?animation:\s*legoStatusGlow/);
  assert.match(css, /\.cos-royal::after/);
  assert.match(css, /\.profile-detail\.cos-aura/);
  assert.match(css, /\.profile-detail\[class\*="cos-bg-"\]/);
});

test('순위 닉네임은 PC와 모바일 모두 이전보다 큰 글씨를 강제한다', async () => {
  const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
  const final = css.slice(css.lastIndexOf('/* v6.5.2 최종'));
  assert.match(final, /\.ranking-section \.rank-row > button,[\s\S]*?font-size:\s*\.82rem/);
  assert.match(final, /@media \(max-width: 520px\)[\s\S]*?\.ranking-section \.rank-row > button,[\s\S]*?font-size:\s*\.74rem/);
  assert.match(final, /\.ranking-section \.couple-row > strong[\s\S]*?font-size:\s*\.80rem/);
});

test('하단 5개 메뉴는 pointerdown 즉시 전환하고 같은 탭 중복 렌더를 피한다', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /bottomNav\?\.addEventListener\('pointerdown'/);
  assert.match(app, /event\.preventDefault\(\);[\s\S]*?activateBottomNav\(button\)/);
  assert.match(app, /if \(!changed\) \{[\s\S]*?return;/);
  assert.match(app, /event\.detail === 0 \|\| !\('PointerEvent' in window\)/);
});

test('영토 한도에 꽉 차도 상대 땅 탈취는 20P 이동 방식으로 계속 가능하다', () => {
  const state = initialState();
  const attacker = addPet(state, 'attacker', '공격자');
  const victim = addPet(state, 'victim', '피해자');
  attacker.stats.legoPower = levelUpperBound(5) + 1; // Lv.6, 5칸
  victim.stats.legoPower = levelUpperBound(5) + 1;
  attacker.stats.points = 100;
  victim.stats.points = 100;
  state.territory = initialTerritory(BASE);

  assert.equal(claimTerritory(state, attacker, 2, 2, BASE).ok, true);
  assert.equal(claimTerritory(state, attacker, 2, 3, new Date(BASE.getTime()+1000)).ok, true);
  assert.equal(claimTerritory(state, attacker, 2, 4, new Date(BASE.getTime()+2000)).ok, true);
  assert.equal(claimTerritory(state, attacker, 3, 3, new Date(BASE.getTime()+3000)).ok, true);
  assert.equal(claimTerritory(state, attacker, 3, 4, new Date(BASE.getTime()+4000)).ok, true);
  assert.equal(territoryView(state, attacker.id).my.owned, 5);

  assert.equal(claimTerritory(state, victim, 0, 0, new Date(BASE.getTime()+5000)).ok, true);
  assert.equal(claimTerritory(state, victim, 1, 1, new Date(BASE.getTime()+6000)).ok, true);
  state.territory.battleUnlocked = true;

  const result = claimTerritory(state, attacker, 1, 1, new Date(BASE.getTime()+7000));
  assert.equal(result.ok, true);
  assert.equal(result.stolenFromPetId, victim.id);
  assert.ok(result.released);
  assert.equal(attacker.stats.points, 80);
  assert.equal(territoryView(state, attacker.id).my.owned, 5);
  assert.match(result.message, /20P/);
  assert.match(result.message, /이동/);
});

test('영토 한도에 찬 상태에서 빈 땅은 여전히 추가 확장되지 않는다', () => {
  const state = initialState();
  const pet = addPet(state, 'solo', '솔로');
  pet.stats.legoPower = levelUpperBound(2) + 1; // Lv.3, 3칸
  state.territory = initialTerritory(BASE);
  assert.equal(claimTerritory(state, pet, 2, 2, BASE).ok, true);
  assert.equal(claimTerritory(state, pet, 2, 3, new Date(BASE.getTime()+1000)).ok, true);
  assert.equal(claimTerritory(state, pet, 3, 3, new Date(BASE.getTime()+2000)).ok, true);
  const blocked = claimTerritory(state, pet, 3, 4, new Date(BASE.getTime()+3000));
  assert.equal(blocked.ok, false);
  assert.match(blocked.message, /빈 땅 추가 점령은 막히지만/);
  assert.equal(territoryView(state, pet.id).my.owned, 3);
});
