import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  BLOCK_BATTLE_GRAVITY_MS,
  BLOCK_BATTLE_SERVER_FALLBACK_IDLE_MS,
  TETROMINO_SHAPES,
  createBlockBattleRoom,
  joinBlockBattleRoom,
  playBlockBattleActions,
  processBlockBattleTimers
} from '../src/game/block-battle.js';
import { authRequest, createRoom, register, responseJson, stateWithUsers } from './helpers.js';

const BASE = new Date('2026-08-13T09:00:00.000Z');

function pets(state) {
  return Object.values(state.users).map((user) => state.pets[user.currentPetId]);
}

async function bootstrap(room, token) {
  const { response, data } = await responseJson(await room.fetch(authRequest('/api/bootstrap', token)));
  return { response, data };
}

test('테트리스 정상 클라이언트 tick 사이에 서버 자동 중력이 끼어들지 않고 입력이 끊겼을 때만 fallback한다', () => {
  const state = stateWithUsers([['a', 'A'], ['b', 'B']], BASE);
  const [host, guest] = pets(state);
  host.stats.points = 10_000;
  guest.stats.points = 10_000;
  const created = createBlockBattleRoom(state, host, 100, BASE);
  assert.equal(created.ok, true);
  assert.equal(joinBlockBattleRoom(state, guest, created.roomId, BASE).ok, true);
  const room = state.blockBattle.rooms[created.roomId];
  const player = room.players[host.id];
  const startRow = player.active.row;

  const firstTickAt = new Date(BASE.getTime() + BLOCK_BATTLE_GRAVITY_MS);
  const first = playBlockBattleActions(state, host, room.id, {
    matchId: room.matchId,
    requestId: 'smooth-tick-0001',
    actions: ['tick']
  }, firstTickAt);
  assert.equal(first.ok, true);
  assert.equal(player.active.row, startRow + 1);

  // 다음 정상 tick 직전에 서버 타이머가 돌아도 한 칸을 선점해서는 안 된다.
  const beforeSecond = processBlockBattleTimers(state, new Date(BASE.getTime() + BLOCK_BATTLE_GRAVITY_MS * 2));
  assert.equal(beforeSecond.changed, false);
  assert.equal(player.active.row, startRow + 1);

  const second = playBlockBattleActions(state, host, room.id, {
    matchId: room.matchId,
    requestId: 'smooth-tick-0002',
    actions: ['tick']
  }, new Date(BASE.getTime() + BLOCK_BATTLE_GRAVITY_MS * 2));
  assert.equal(second.ok, true);
  assert.equal(player.active.row, startRow + 2);

  // 클라이언트 입력이 충분히 오래 끊겼을 때만 서버가 게임 정지를 막기 위해 따라잡는다.
  const fallbackAt = new Date(BASE.getTime() + BLOCK_BATTLE_GRAVITY_MS * 2 + BLOCK_BATTLE_SERVER_FALLBACK_IDLE_MS + BLOCK_BATTLE_GRAVITY_MS);
  const fallback = processBlockBattleTimers(state, fallbackAt, { roomId: room.id });
  assert.equal(fallback.changed, true);
  assert.ok(player.active.row > startRow + 2 || player.pieces > 0);
});

test('자동 낙하 tick은 네트워크 시각 오차가 있어도 로컬 미리보기와 같은 한 칸을 서버가 확정한다', () => {
  const state = stateWithUsers([['a', '지터A'], ['b', '지터B']], BASE);
  const [host, guest] = pets(state);
  host.stats.points = 10_000;
  guest.stats.points = 10_000;
  const created = createBlockBattleRoom(state, host, 100, BASE);
  joinBlockBattleRoom(state, guest, created.roomId, BASE);
  const room = state.blockBattle.rooms[created.roomId];
  const player = room.players[host.id];
  const startRow = player.active.row;

  // 브라우저/서버 벽시계가 크게 어긋나도 화면에 먼저 그린 tick을 무변경 ACK해서
  // 한 칸 위로 되감으면 안 된다.
  const earlyAt = new Date(BASE.getTime() + 120);
  const early = playBlockBattleActions(state, host, room.id, {
    matchId: room.matchId, requestId: 'jitter-early-0001', actions: ['tick']
  }, earlyAt);
  assert.equal(early.ok, true);
  assert.equal(early.changed, true);
  assert.equal(player.active.row, startRow + 1);
  assert.equal(new Date(player.lastGravityAt).getTime(), earlyAt.getTime(),
    '확정한 tick의 실제 서버 수신시각부터 다음 700ms 주기를 시작해야 한다');

  const nextAt = new Date(earlyAt.getTime() + BLOCK_BATTLE_GRAVITY_MS);
  const next = playBlockBattleActions(state, host, room.id, {
    matchId: room.matchId, requestId: 'jitter-next-0001', actions: ['tick']
  }, nextAt);
  assert.equal(next.ok, true);
  assert.equal(next.changed, true);
  assert.equal(player.active.row, startRow + 2);
});

test('지연된 HTTP 수동 입력이 도착해도 서버 fallback이 그 플레이어를 먼저 여러 칸 내리지 않는다', async () => {
  const { room } = await createRoom();
  const hostToken = await register(room, '지연입력방장');
  const guestToken = await register(room, '지연입력손님');
  let state = await room.store.load();
  for (const pet of Object.values(state.pets)) pet.stats.points = 10_000;
  await room.store.save(state);
  const created = await responseJson(await room.fetch(authRequest('/api/block-battle/rooms', hostToken, {
    method: 'POST', body: JSON.stringify({ stakePoints: 100 })
  })));
  await room.fetch(authRequest(`/api/block-battle/rooms/${created.data.roomId}/join`, guestToken, { method: 'POST', body: '{}' }));

  state = await room.store.load();
  const hostUser = Object.values(state.users).find((user) => user.nickname === '지연입력방장');
  const battle = state.blockBattle.rooms[created.data.roomId];
  const hostPlayer = battle.players[hostUser.currentPetId];
  const guestPlayer = battle.players[battle.guestPetId];
  const staleAt = new Date(Date.now() - 5_000).toISOString();
  hostPlayer.lastGravityAt = staleAt;
  hostPlayer.lastClientInputAt = staleAt;
  // 상대는 이 테스트에서 fallback 대상이 아니도록 최신 상태로 둔다.
  guestPlayer.lastGravityAt = new Date().toISOString();
  guestPlayer.lastClientInputAt = new Date().toISOString();
  const rowBefore = hostPlayer.active.row;
  await room.store.save(state);

  const moved = await responseJson(await room.fetch(authRequest(`/api/block-battle/rooms/${battle.id}/input`, hostToken, {
    method: 'POST',
    body: JSON.stringify({ matchId: battle.matchId, requestId: 'delayed-manual-0001', actions: ['left'] })
  })));
  assert.equal(moved.response.status, 200, JSON.stringify(moved.data));
  assert.equal(moved.data.ok, true);
  state = await room.store.load();
  const updated = state.blockBattle.rooms[battle.id].players[hostUser.currentPetId];
  assert.equal(updated.active.row, rowBefore, '지연 입력 직전에 서버가 과거 중력을 한꺼번에 따라잡으면 안 된다');
});


test('천장 근처 고스택에서도 tick lock·줄삭제·새 블록 생성 후 보드와 active 블록이 깨지지 않는다', () => {
  const state = stateWithUsers([['a', '고스택A'], ['b', '고스택B']], BASE);
  const [host, guest] = pets(state);
  host.stats.points = 10_000;
  guest.stats.points = 10_000;
  const created = createBlockBattleRoom(state, host, 100, BASE);
  joinBlockBattleRoom(state, guest, created.roomId, BASE);
  const room = state.blockBattle.rooms[created.roomId];
  const player = room.players[host.id];

  player.board = Array.from({ length: 20 }, () => Array(10).fill(null));
  // active 블록 바로 아래까지 높게 쌓되 한 줄 삭제가 실제로 일어나도록 구성한다.
  player.board[3] = Array(10).fill('G');
  player.active = { type: 'O', rotation: 0, row: 0, col: 3 };
  player.lastGravityAt = BASE.toISOString();

  const first = playBlockBattleActions(state, host, room.id, {
    matchId: room.matchId, requestId: 'high-stack-tick-0001', actions: ['tick']
  }, new Date(BASE.getTime() + 50));
  assert.equal(first.ok, true);
  assert.equal(first.changed, true);
  assert.equal(player.active.row, 1);

  const second = playBlockBattleActions(state, host, room.id, {
    matchId: room.matchId, requestId: 'high-stack-tick-0002', actions: ['tick']
  }, new Date(BASE.getTime() + 100));
  assert.equal(second.ok, true);
  assert.equal(second.locked, true, '충돌 tick은 이전 블록을 정확히 한 번 고정해야 한다');
  assert.equal(room.status, 'playing');
  assert.equal(player.board.length, 20);
  assert.equal(player.board.every((row) => Array.isArray(row) && row.length === 10), true);
  assert.ok(player.active, 'lock 뒤에는 다음 active 블록이 하나 존재해야 한다');
  assert.equal(TETROMINO_SHAPES[player.active.type][player.active.rotation].every(([x, y]) => {
    const row = player.active.row + y;
    const col = player.active.col + x;
    return col >= 0 && col < 10 && row < 20 && (row < 0 || !player.board[row][col]);
  }), true, '새 active 블록이 고정 보드와 겹쳐 깨지면 안 된다');
});

test('운영자 계정 잠금은 기존 토큰과 재로그인을 차단하고 잠금 해제 뒤 새 로그인만 허용한다', async () => {
  const shared = new Map();
  const first = await createRoom(shared);
  const adminToken = await register(first.room, '잠금관리자');
  const targetToken = await register(first.room, '잠금대상');
  const state = await first.room.store.load();
  const adminUser = Object.values(state.users).find((user) => user.nickname === '잠금관리자');
  const targetUser = Object.values(state.users).find((user) => user.nickname === '잠금대상');
  assert.ok(adminUser && targetUser);

  const second = await createRoom(shared, { ADMIN_USER_IDS: adminUser.id });
  const locked = await responseJson(await second.room.fetch(authRequest('/api/admin/account-lock', adminToken, {
    method: 'POST',
    body: JSON.stringify({ targetUserId: targetUser.id, enabled: true })
  })));
  assert.equal(locked.response.status, 200, JSON.stringify(locked.data));

  const oldTokenBoot = await bootstrap(second.room, targetToken);
  assert.equal(oldTokenBoot.response.status, 401);

  const blockedLogin = await responseJson(await second.room.fetch(new Request('https://game.test/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nickname: '잠금대상', pin: '1234' })
  })));
  assert.equal(blockedLogin.response.status, 403);
  assert.match(blockedLogin.data.message, /잠긴 계정/);

  const unlocked = await responseJson(await second.room.fetch(authRequest('/api/admin/account-lock', adminToken, {
    method: 'POST',
    body: JSON.stringify({ targetUserId: targetUser.id, enabled: false })
  })));
  assert.equal(unlocked.response.status, 200, JSON.stringify(unlocked.data));

  const relogin = await responseJson(await second.room.fetch(new Request('https://game.test/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nickname: '잠금대상', pin: '1234' })
  })));
  assert.equal(relogin.response.status, 200, JSON.stringify(relogin.data));
  assert.ok(relogin.data.token);
});

test('보낸 신청·24시간 자동 만료 UI는 제거되고 PC·모바일 확성기 입력 보호 코드가 배포 소스에 포함된다', async () => {
  const [app, engine, worker, store, css] = await Promise.all([
    readFile(new URL('../public/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/game/engine.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/worker.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/durable-store.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/styles.css', import.meta.url), 'utf8')
  ]);
  assert.doesNotMatch(app, /보낸 신청|cancel-social-request|sentRequests/);
  assert.doesNotMatch(engine, /SOCIAL_REQUEST_TTL_MS|expireSocialRequests|sentRequestsFor|cancelRequest/);
  assert.doesNotMatch(worker, /sentRequestsFor|socialRequestNextAlarmAt|expireSocialRequests/);
  assert.doesNotMatch(store, /SOCIAL_REQUEST_TTL_MS/);

  assert.match(app, /loudspeakerDraft/);
  assert.match(app, /loudspeakerComposing/);
  assert.match(app, /loudspeakerEditing/);
  assert.match(app, /compositionstart/);
  assert.match(app, /focusin/);
  assert.match(app, /if \(input\) \{[\s\S]*?app\.loudspeakerDraft = input\.value;[\s\S]*?return updateLoudspeakerShopState\(\)/);
  assert.match(app, /existingLoudspeakerInput/);
  assert.match(app, /app\.loudspeakerDraft = existingLoudspeakerInput\.value/);
  assert.match(app, /event\.code === 4001 && app\.token/);
  assert.match(css, /\.loudspeaker-compose input[\s\S]*touch-action:\s*manipulation/);
  assert.match(css, /font-size:\s*16px/);
});

test('테트리스 클라이언트는 격리 visual state와 단일 700ms timer를 쓰고 서버 fallback은 입력 뒤에만 처리한다', async () => {
  const [appSource, workerSource] = await Promise.all([
    readFile(new URL('../public/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/worker.js', import.meta.url), 'utf8')
  ]);
  assert.match(appSource, /blockBattleVisualSelf: null/);
  assert.match(appSource, /function blockBattleVisualSelf\(/);
  assert.match(appSource, /const key = active \? `\$\{room\.id\}:\$\{room\.matchId\}` : null/);
  assert.match(appSource, /setTimeout\(run, BLOCK_BATTLE_GRAVITY_MS\)/);
  assert.match(appSource, /function blockBattleHasUnconfirmedVerticalInput\(\)/);
  assert.match(appSource, /const changed = previewBlockBattleInput\(action\)/);
  const replayStart = appSource.indexOf('function replayBlockBattlePendingInputs');
  const replayEnd = appSource.indexOf('function syncBlockBattleGravity', replayStart);
  const replaySource = appSource.slice(replayStart, replayEnd);
  assert.doesNotMatch(replaySource, /previewBlockBattleInput/);
  assert.match(appSource, /lock\/줄삭제\/다음 블록 생성은 서버 ACK에서만 확정한다/);
  assert.match(appSource, /loadBootstrap\(\{ silent: true \}\)\.finally\(syncBlockBattleGravity\)/);
  const httpInputStart = workerSource.indexOf("if (request.method === 'POST' && blockInput)");
  const httpInputEnd = workerSource.indexOf("if (request.method === 'POST' && (blockJoin", httpInputStart);
  const httpInputSource = workerSource.slice(httpInputStart, httpInputEnd);
  assert.ok(httpInputSource.indexOf('playBlockBattleActions(') < httpInputSource.indexOf('processBlockBattleTimers('), 'HTTP 입력은 서버 fallback 중력보다 먼저 확정해야 한다');
  const wsInputStart = workerSource.indexOf('async handleWebSocketMessage');
  const wsInputEnd = workerSource.indexOf('async webSocketMessage', wsInputStart);
  const wsInputSource = workerSource.slice(wsInputStart, wsInputEnd);
  assert.ok(wsInputSource.indexOf('playBlockBattleActions(') < wsInputSource.indexOf('processBlockBattleTimers('), 'WebSocket 입력은 서버 fallback 중력보다 먼저 확정해야 한다');
});
