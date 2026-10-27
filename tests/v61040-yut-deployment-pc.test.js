import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import workerEntry from '../src/worker.js';
import { createRoom, register, responseJson } from './helpers.js';

const root = new URL('../', import.meta.url);
const clientSource = await readFile(new URL('public/app.js', root), 'utf8');
const styles = await readFile(new URL('public/styles.css', root), 'utf8');
const html = await readFile(new URL('public/index.html', root), 'utf8');
const sw = await readFile(new URL('public/sw.js', root), 'utf8');
const wrangler = await readFile(new URL('wrangler.jsonc', root), 'utf8');

function routeRoom(room) {
  return { GAME_ROOM: { idFromName: () => 'global', get: () => ({ fetch: request => room.fetch(request) }) } };
}

test('전체 Worker 진단 응답은 윷 API 기능/배포 버전을 명시한다', async () => {
  const response = await workerEntry.fetch(new Request('https://game.test/healthz?feature=yut'), {});
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.version, '6.10.41-yutnori');
  assert.equal(data.features.yutnori, true);
  assert.equal(data.features.yutRooms, '/api/yut/rooms');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});

test('최상위 Worker -> 기존 Durable Object 경로에서 윷 방을 생성한다', async () => {
  const { room } = await createRoom();
  const token = await register(room, '윷실제경로');
  const env = routeRoom(room);
  const health = await workerEntry.fetch(new Request('https://game.test/api/health'), env);
  assert.equal((await health.json()).features.yutnori, true);
  const created = await workerEntry.fetch(new Request('https://game.test/api/yut/rooms', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'solo', seats: 2 })
  }), env);
  const data = await created.json();
  assert.equal(created.status, 201, JSON.stringify(data));
  assert.equal(data.ok, true);
  assert.ok(data.roomId);
  assert.ok((await room.store.load()).yut.rooms[data.roomId]);
});

test('윷 경로가 잘못됐을 때는 일반 404가 아닌 윷 전용 오류를 반환한다', async () => {
  const { room } = await createRoom();
  const token = await register(room, '윷경로확인');
  const response = await workerEntry.fetch(new Request('https://game.test/api/yut/missing', {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: '{}'
  }), routeRoom(room));
  assert.equal(response.status, 404);
  assert.match((await response.json()).message, /윷놀이 요청 경로/);
});

test('배포 서버가 구형이면 윷 방 생성 전 점검이 요청을 차단한다', async () => {
  const start = clientSource.indexOf('async function checkYutServerVersion()');
  const end = clientSource.indexOf('\nasync function yutHandleAction(', start);
  assert.ok(start > 0 && end > start);
  const program = `${clientSource.slice(start, end)}\ncheckYutServerVersion();`;
  const messages = [];
  let paths = [];
  const context = {
    CLIENT_VERSION: '6.10.41', YUT_SERVER_VERSION: '6.10.41-yutnori',
    AbortController, setTimeout, clearTimeout, encodeURIComponent,
    toast: (msg) => messages.push(msg),
    fetch: async (path, config) => {
      paths.push([path,config.method,config.cache]);
      return { ok: true, json: async () => ({ok:true,version:'6.10.39-yutnori',features:{yutnori:true}}) };
    }
  };
  assert.equal(await vm.runInNewContext(program, context), false);
  assert.equal(paths[0][1], 'GET');
  assert.equal(paths[0][2], 'no-store');
  assert.match(messages[0], /서버 업데이트가 적용되지 않았습니다/);
  paths=[];messages.length=0;
  context.fetch = async () => ({ ok: true, json: async () => ({ok:true,version:'6.10.41-yutnori',features:{yutnori:true}}) });
  assert.equal(await vm.runInNewContext(program, context), true);
  assert.equal(messages.length, 0);
});

test('PC 윷놀이 선택 버튼은 미지원 wood 이모지 대신 내장 SVG를 사용한다', () => {
  assert.match(clientSource, /const YUT_PICKER_ICON = `<svg class="yut-picker-icon"/);
  assert.match(clientSource, /\['yut',YUT_PICKER_ICON,'윷놀이'\]/);
  assert.match(styles, /\.multiplayer-pick \.yut-picker-icon\{display:block;width:34px;height:34px/);
  assert.ok(!clientSource.includes('🪵'));
  assert.match(html, /app\.js\?v=6101410/);
  assert.match(html, /styles\.css\?v=6101410/);
  assert.match(sw, /lego-life-v6101410-yutnori/);
  assert.match(wrangler, /"run_worker_first":\s*\[\s*"\/api\/\*"/);
});
