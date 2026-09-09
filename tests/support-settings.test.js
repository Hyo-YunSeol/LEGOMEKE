import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { authRequest, createRoom, register, responseJson } from './helpers.js';

async function bootstrap(room, token) {
  const { response, data } = await responseJson(await room.fetch(authRequest('/api/bootstrap', token)));
  assert.equal(response.status, 200, JSON.stringify(data));
  return data.bootstrap;
}

test('후원 배너 기본 문구와 카카오페이 링크가 클라이언트에 연결된다', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
  assert.match(html, /id="support-banner"/u);
  assert.match(app, /https:\/\/link\.kakaopay\.com\/__\/4oKU3W1/u);
  assert.match(app, /투잡하는 레고에게 작은 힘을 주세요/u);
  assert.match(app, /function syncSupportBanner/u);
  assert.match(app, /if \(!app\.data \|\| app\.modal\) return true/u);
  assert.match(css, /\.support-banner\s*\{[\s\S]*?position:\s*sticky/u);
});

test('운영자는 후원 문구와 배너 표시 여부를 저장하고 모든 사용자 bootstrap에 반영할 수 있다', async () => {
  const shared = new Map();
  const first = await createRoom(shared);
  const adminToken = await register(first.room, '후원관리자');
  const userToken = await register(first.room, '후원사용자');
  const adminId = (await bootstrap(first.room, adminToken)).admin.userId;

  const roomWithAdmin = await createRoom(shared, { ADMIN_USER_IDS: adminId });
  const initial = await bootstrap(roomWithAdmin.room, userToken);
  assert.equal(initial.support.enabled, true);
  assert.match(initial.support.message, /투잡하는 레고/u);

  const changedText = '🥹 투잡하는 레고가 게임을 계속 만들 수 있게 작은 힘을 주세요 💛';
  const { response, data } = await responseJson(await roomWithAdmin.room.fetch(authRequest('/api/admin/support-settings', adminToken, {
    method: 'POST',
    body: JSON.stringify({ message: changedText, enabled: false })
  })));
  assert.equal(response.status, 200, JSON.stringify(data));
  assert.equal(data.support.message, changedText);
  assert.equal(data.support.enabled, false);

  const updated = await bootstrap(roomWithAdmin.room, userToken);
  assert.equal(updated.support.message, changedText);
  assert.equal(updated.support.enabled, false);
});

test('일반 사용자는 후원 설정을 바꿀 수 없다', async () => {
  const shared = new Map();
  const first = await createRoom(shared);
  const adminToken = await register(first.room, '권한관리자');
  const userToken = await register(first.room, '일반회원');
  const adminId = (await bootstrap(first.room, adminToken)).admin.userId;
  const roomWithAdmin = await createRoom(shared, { ADMIN_USER_IDS: adminId });

  const { response, data } = await responseJson(await roomWithAdmin.room.fetch(authRequest('/api/admin/support-settings', userToken, {
    method: 'POST',
    body: JSON.stringify({ message: '바꾸기', enabled: true })
  })));
  assert.equal(response.status, 403);
  assert.match(data.message, /운영자 권한/u);
});
