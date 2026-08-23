import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  FLEX_ITEMS,
  SHOP_ITEMS,
  STATUS_MESSAGE_MAX_LENGTH,
  STATUS_MESSAGE_ADMIN_MAX_LENGTH,
  LOUDSPEAKER_MAX_LENGTH,
  LOUDSPEAKER_DURATION_SECONDS
} from '../src/game/constants.js';
import { loudspeakerView, purchaseShopItem } from '../src/game/engine.js';
import { authRequest, createRoom, register, responseJson, stateWithUsers } from './helpers.js';

test('신규 플렉스 상품 가격·24시간·천사날개 최상위 등급이 정확하다', () => {
  const expected = {
    sunglasses: 500,
    headset: 500,
    champagne: 500,
    pig: 700,
    dog: 700,
    cat: 700,
    trophy: 500,
    angelWings: 1500
  };
  for (const [id, price] of Object.entries(expected)) {
    assert.equal(FLEX_ITEMS[id]?.price, price, id);
    assert.equal(FLEX_ITEMS[id]?.durationHours, 24, id);
  }
  assert.equal(FLEX_ITEMS.angelWings.requiredLevel, 40);
  assert.equal(FLEX_ITEMS.angelWings.nameplateKey, 'angel');
  assert.equal(FLEX_ITEMS.angelWings.assetKey, 'angel-wings');
});

test('확성기는 300P·10초·30자이며 동시 사용과 중복 결제를 서버에서 막는다', () => {
  assert.equal(SHOP_ITEMS.loudspeaker.price, 300);
  assert.equal(SHOP_ITEMS.loudspeaker.maxLength, LOUDSPEAKER_MAX_LENGTH);
  assert.equal(SHOP_ITEMS.loudspeaker.durationSeconds, LOUDSPEAKER_DURATION_SECONDS);
  assert.equal(LOUDSPEAKER_MAX_LENGTH, 30);
  assert.equal(LOUDSPEAKER_DURATION_SECONDS, 10);

  const now = new Date('2026-08-13T03:00:00.000Z');
  const state = stateWithUsers([['speaker-a', '가'], ['speaker-b', '나']], now);
  const userA = state.users['speaker-a'];
  const userB = state.users['speaker-b'];
  const petA = state.pets[userA.currentPetId];
  const petB = state.pets[userB.currentPetId];
  petA.stats.points = 1000;
  petB.stats.points = 1000;

  const first = purchaseShopItem(state, userA, petA, 'loudspeaker', { message: '오늘 저녁 벙 올 사람!' }, 'speaker-buy-0001', now);
  assert.equal(first.ok, true);
  assert.equal(first.price, 300);
  assert.equal(petA.stats.points, 700);
  assert.equal(first.loudspeaker.message, '오늘 저녁 벙 올 사람!');
  assert.equal(new Date(first.loudspeaker.expiresAt).getTime() - now.getTime(), 10_000);
  assert.equal(loudspeakerView(state, new Date(now.getTime() + 9000))?.petId, petA.id);

  const duplicate = purchaseShopItem(state, userA, petA, 'loudspeaker', { message: '다른 문구' }, 'speaker-buy-0001', new Date(now.getTime() + 1000));
  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.duplicate, true);
  assert.equal(petA.stats.points, 700);

  const blocked = purchaseShopItem(state, userB, petB, 'loudspeaker', { message: '겹치면 안 됨' }, 'speaker-buy-0002', new Date(now.getTime() + 5000));
  assert.equal(blocked.ok, false);
  assert.match(blocked.message, /표시 중/);
  assert.equal(petB.stats.points, 1000);

  const tooLong = purchaseShopItem(state, userB, petB, 'loudspeaker', { message: '가'.repeat(31) }, 'speaker-buy-0003', new Date(now.getTime() + 11_000));
  assert.equal(tooLong.ok, false);
  assert.match(tooLong.message, /30자/);
  assert.equal(petB.stats.points, 1000);

  const second = purchaseShopItem(state, userB, petB, 'loudspeaker', { message: '이제 사용 가능' }, 'speaker-buy-0004', new Date(now.getTime() + 11_000));
  assert.equal(second.ok, true);
  assert.equal(petB.stats.points, 700);
});

test('일반 상태메시지는 20자, 운영자는 서버와 bootstrap 모두 50자를 허용한다', async () => {
  assert.equal(STATUS_MESSAGE_MAX_LENGTH, 20);
  assert.equal(STATUS_MESSAGE_ADMIN_MAX_LENGTH, 50);
  const { room } = await createRoom();
  const adminToken = await register(room, '운영자');
  const normalToken = await register(room, '일반회원');

  const stored = await room.store.load();
  const adminUser = Object.values(stored.users).find((user) => user.nickname === '운영자');
  room.env.ADMIN_USER_IDS = adminUser.id;

  const adminBootstrap = await responseJson(await room.fetch(authRequest('/api/bootstrap', adminToken)));
  const normalBootstrap = await responseJson(await room.fetch(authRequest('/api/bootstrap', normalToken)));
  assert.equal(adminBootstrap.data.bootstrap.catalog.statusMessageMaxLength, 50);
  assert.equal(normalBootstrap.data.bootstrap.catalog.statusMessageMaxLength, 20);

  const adminStatus = '운영자전용상태메시지'.repeat(3); // 20자를 넘지만 50자 이하
  assert.ok([...adminStatus].length > 20 && [...adminStatus].length <= 50);
  const adminSave = await responseJson(await room.fetch(authRequest('/api/profile/status-message', adminToken, {
    method: 'POST',
    body: JSON.stringify({ statusMessage: adminStatus })
  })));
  assert.equal(adminSave.response.status, 200, JSON.stringify(adminSave.data));
  assert.equal(adminSave.data.ok, true);

  const normalSave = await responseJson(await room.fetch(authRequest('/api/profile/status-message', normalToken, {
    method: 'POST',
    body: JSON.stringify({ statusMessage: '가'.repeat(21) })
  })));
  assert.equal(normalSave.response.status, 400);
  assert.equal(normalSave.data.ok, false);
  assert.match(normalSave.data.message, /20자/);
});

test('확성기 UI와 신규 SVG는 정적 자산으로 포함되고 천사 날개 이름표가 적용된다', async () => {
  const [html, app, css, sw] = await Promise.all([
    readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/styles.css', import.meta.url), 'utf8'),
    readFile(new URL('../public/sw.js', import.meta.url), 'utf8')
  ]);
  assert.match(html, /id="loudspeaker-root"/);
  assert.match(app, /payload\.type === 'loudspeaker'/);
  assert.match(app, /buyLoudspeaker/);
  assert.match(css, /\.loudspeaker-banner/);
  assert.match(css, /\.nameplate-angel \.flex-display-name/);
  assert.match(css, /\.pet-visual\.flex-angelWings \.flex-item-image \{ z-index: 0;/);
  for (const key of ['sunglasses','headset','champagne','pig','dog','cat','trophy','angel-wings']) {
    const svg = await readFile(new URL(`../public/flex/${key}.svg`, import.meta.url), 'utf8');
    assert.match(svg, /<svg\b/);
    assert.doesNotMatch(svg, /<script\b/i);
    assert.match(sw, new RegExp(`['\"]${key}['\"]`));
  }
});

test('확성기 구매는 접속 중인 모든 소켓에 한 번만 방송되고 같은 요청 재시도는 재방송하지 않는다', async () => {
  const { room, ctx } = await createRoom();
  const speakerToken = await register(room, '방송자');
  await register(room, '청취자');

  const state = await room.store.load();
  const speakerUser = Object.values(state.users).find((user) => user.nickname === '방송자');
  const listenerUser = Object.values(state.users).find((user) => user.nickname === '청취자');
  state.pets[speakerUser.currentPetId].stats.points = 1000;
  await room.store.save(state);

  const speakerMessages = [];
  const listenerMessages = [];
  const socketFor = (userId, bucket) => ({
    deserializeAttachment: () => ({ userId }),
    send(payload) { bucket.push(JSON.parse(payload)); }
  });
  ctx.sockets.push(
    socketFor(speakerUser.id, speakerMessages),
    socketFor(listenerUser.id, listenerMessages)
  );

  const body = { itemId: 'loudspeaker', message: '전원에게 보이는 확성기', requestId: 'speaker-route-0001' };
  const first = await responseJson(await room.fetch(authRequest('/api/shop/purchase', speakerToken, {
    method: 'POST',
    body: JSON.stringify(body)
  })));
  assert.equal(first.response.status, 200, JSON.stringify(first.data));
  assert.equal(first.data.ok, true);
  assert.equal(speakerMessages.filter((message) => message.type === 'loudspeaker').length, 1);
  assert.equal(listenerMessages.filter((message) => message.type === 'loudspeaker').length, 1);
  assert.equal(listenerMessages.find((message) => message.type === 'loudspeaker')?.loudspeaker?.message, '전원에게 보이는 확성기');

  const retry = await responseJson(await room.fetch(authRequest('/api/shop/purchase', speakerToken, {
    method: 'POST',
    body: JSON.stringify(body)
  })));
  assert.equal(retry.response.status, 200, JSON.stringify(retry.data));
  assert.equal(retry.data.duplicate, true);
  assert.equal(speakerMessages.filter((message) => message.type === 'loudspeaker').length, 1);
  assert.equal(listenerMessages.filter((message) => message.type === 'loudspeaker').length, 1);

  const saved = await room.store.load();
  assert.equal(saved.pets[speakerUser.currentPetId].stats.points, 700);
});
