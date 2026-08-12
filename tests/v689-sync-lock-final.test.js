import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  createBlockBattleRoom,
  joinBlockBattleRoom,
  playBlockBattleActions,
  processBlockBattleTimers
} from '../src/game/block-battle.js';
import { authRequest, createRoom, register, responseJson, stateWithUsers } from './helpers.js';

const BASE = new Date('2026-08-12T10:00:00.000Z');
const appSource = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const cssSource = fs.readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
const workerSource = fs.readFileSync(new URL('../src/worker.js', import.meta.url), 'utf8');

function localBattle() {
  const state = stateWithUsers([['host-sync', '동기화방장'], ['guest-sync', '동기화손님']], BASE);
  const host = state.pets[state.users['host-sync'].currentPetId];
  const guest = state.pets[state.users['guest-sync'].currentPetId];
  host.stats.points = 1_000;
  guest.stats.points = 1_000;
  const created = createBlockBattleRoom(state, host, 100, BASE);
  assert.equal(joinBlockBattleRoom(state, guest, created.roomId, BASE).ok, true);
  return { state, host, room: state.blockBattle.rooms[created.roomId] };
}

test('정상 클라이언트 tick 직후 서버 fallback 중력은 같은 블록을 중복 하강시키지 않는다', () => {
  const { state, host, room } = localBattle();
  const player = room.players[host.id];
  const first = playBlockBattleActions(state, host, room.id, {
    matchId: room.matchId,
    requestId: 'client-gravity-0001',
    actions: ['tick']
  }, new Date(BASE.getTime() + 700));
  assert.equal(first.ok, true);
  assert.equal(first.changed, true);
  const rowAfterClientTick = player.active.row;

  processBlockBattleTimers(state, new Date(BASE.getTime() + 1_700));
  assert.equal(player.active.row, rowAfterClientTick, '정상 client tick이 살아있는 동안 서버 중력이 같은 플레이어와 경쟁하면 안 된다');

  const fallback = processBlockBattleTimers(state, new Date(BASE.getTime() + 2_800));
  assert.equal(fallback.changed, true, 'client tick이 충분히 끊기면 서버가 마지막 확정 시각부터 따라잡아야 한다');
  assert.ok(player.active.row > rowAfterClientTick || player.pieces > 0);
});

test('실시간 테트리스 입력 경로는 현재 요청 직전에 서버 자동 중력을 별도로 적용하지 않는다', () => {
  assert.match(workerSource, /processBlockBattleTimers\(state, date, \{ gravity: false \}\)/);
  assert.match(workerSource, /const connection = blockBattleSetConnected\(state, pet\.id, true, date\);[\s\S]*?processBlockBattleTimers\(state, date, \{ gravity: false \}\);[\s\S]*?playBlockBattleActions/);
});

test('클라이언트는 결정 가능한 바닥 고정과 다음 블록 생성을 ACK 전에 예측한다', () => {
  assert.match(appSource, /function previewBlockBattleLockAndSpawn\(player\)/);
  assert.match(appSource, /player\.active = nextActive;/);
  assert.match(appSource, /player\.next = player\.next\.slice\(1\);/);
  assert.match(appSource, /action === 'softDrop' \|\| action === 'tick'/);
  assert.match(appSource, /paintBlockBattleBoard\(player, document, \{ activeOnly: !boardChanged \}\)/);
});

test('모바일 테트리스는 고정 높이 추정식 대신 실측 가용높이로 내 보드 크기를 정하고 조작부가 판을 덮지 않는다', () => {
  assert.match(appSource, /const usableBoardHeight = viewportBottom - stageRect\.top - controlsRect\.height - panelChrome - stagePadding - 14;/);
  assert.match(appSource, /--block-battle-board-size/);
  assert.doesNotMatch(cssSource, /block-battle-viewport-height[^\n]*- 250px/);
  assert.doesNotMatch(cssSource, /block-battle-viewport-height[^\n]*- 230px/);
  assert.match(cssSource, /body\.block-battle-playing \.block-battle-controls\s*\{[\s\S]*?position:relative;[\s\S]*?bottom:auto;/);
});

test('운영자는 회원 계정을 잠그고 해제할 수 있으며 기존 세션은 즉시 폐기된다', async () => {
  const { room, ctx } = await createRoom();
  const adminToken = await register(room, '잠금운영자');
  const targetToken = await register(room, '잠금대상');
  let state = await room.store.load();
  const adminUser = Object.values(state.users).find((user) => user.nickname === '잠금운영자');
  const targetUser = Object.values(state.users).find((user) => user.nickname === '잠금대상');
  room.env.ADMIN_USER_IDS = adminUser.id;
  const beforeSessionVersion = targetUser.sessionVersion;
  let closeInfo = null;
  ctx.sockets.push({
    deserializeAttachment: () => ({ userId: targetUser.id }),
    send: () => {},
    close: (code, reason) => { closeInfo = { code, reason }; }
  });

  const locked = await responseJson(await room.fetch(authRequest(`/api/admin/users/${targetUser.id}/lock`, adminToken, {
    method: 'POST', body: JSON.stringify({ locked: true })
  })));
  assert.equal(locked.response.status, 200);
  assert.equal(locked.data.ok, true);
  assert.equal(locked.data.locked, true);
  state = await room.store.load();
  assert.equal(state.users[targetUser.id].accountLocked, true);
  assert.equal(state.users[targetUser.id].sessionVersion, beforeSessionVersion + 1);
  assert.equal(closeInfo?.code, 4003);

  const oldSession = await room.fetch(authRequest('/api/bootstrap', targetToken));
  assert.equal(oldSession.status, 401);
  const lockedLogin = await responseJson(await room.fetch(new Request('https://game.test/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nickname: '잠금대상', pin: '1234' })
  })));
  assert.equal(lockedLogin.response.status, 423);
  assert.match(lockedLogin.data.message, /잠긴 계정/);

  const unlocked = await responseJson(await room.fetch(authRequest(`/api/admin/users/${targetUser.id}/lock`, adminToken, {
    method: 'POST', body: JSON.stringify({ locked: false })
  })));
  assert.equal(unlocked.response.status, 200);
  assert.equal(unlocked.data.locked, false);
  state = await room.store.load();
  assert.equal(state.users[targetUser.id].accountLocked, false);
  assert.equal(state.users[targetUser.id].sessionVersion, beforeSessionVersion + 2);

  const freshLogin = await responseJson(await room.fetch(new Request('https://game.test/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nickname: '잠금대상', pin: '1234' })
  })));
  assert.equal(freshLogin.response.status, 200);
  assert.equal(freshLogin.data.ok, true);
  assert.ok(freshLogin.data.token);

  const selfLock = await responseJson(await room.fetch(authRequest(`/api/admin/users/${adminUser.id}/lock`, adminToken, {
    method: 'POST', body: JSON.stringify({ locked: true })
  })));
  assert.equal(selfLock.response.status, 400);
  assert.match(selfLock.data.message, /본인 계정/);
});

test('운영자 화면에 계정 잠금 상태·버튼·감사 로그 표시가 연결되어 있다', () => {
  assert.match(appSource, /data-action="admin-account-lock"/);
  assert.match(appSource, /admin-account-lock-label/);
  assert.match(appSource, /entry\.action === 'account_lock'/);
  assert.match(appSource, /entry\.action === 'account_unlock'/);
  assert.match(workerSource, /action: locked \? 'account_lock' : 'account_unlock'/);
  assert.match(workerSource, /user\.accountLocked/);
  assert.match(workerSource, /const omokConnection = omokSetConnected[\s\S]*?const blockBattleConnection = blockBattleSetConnected/);
});

test('하드드롭 연타와 모바일 재진입에서도 미확정 입력·보드 크기 상태가 누적되지 않는다', () => {
  assert.match(appSource, /if \(action === 'hardDrop' && awaitingHardDrop\) return false;/);
  assert.match(appSource, /region\.style\.removeProperty\('--block-battle-board-size'\);\s*delete region\.dataset\.boardSize;/);
});
