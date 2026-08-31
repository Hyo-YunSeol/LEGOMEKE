import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { DurableJsonStore, initialState } from '../src/durable-store.js';
import {
  createBung,
  finishBung,
  finishMiniGame,
  joinBung,
  leaveBung,
  privateDashboard,
  processBungTimers,
  socialAction,
  startBung,
  startFishing,
  startMiniGame,
  settleExpiredMiniGames
} from '../src/game/engine.js';
import { createOmokRoom, processOmokTimers } from '../src/game/omok.js';
import { createBlockBattleRoom, processBlockBattleTimers } from '../src/game/block-battle.js';
import { authRequest, createRoom, MemoryStorage, register, responseJson, stateWithUsers } from './helpers.js';

const BASE = new Date('2026-08-13T09:00:00.000Z');
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function pets(state) {
  return Object.values(state.users).map((user) => state.pets[user.currentPetId]);
}

async function api(room, token, path, body = {}, method = 'POST') {
  return responseJson(await room.fetch(authRequest(path, token, {
    method,
    body: method === 'GET' ? undefined : JSON.stringify(body)
  })));
}

test('v6.9.0 경고 시스템은 과거 저장 데이터·알림·감사로그까지 마이그레이션에서 제거된다', async () => {
  const legacy = stateWithUsers([['u1', '경고이전']], BASE);
  legacy.meta.version = 24;
  const pet = pets(legacy)[0];
  pet.warnings = 7;
  pet.records.warnings = 12;
  legacy.users.u1.notifications.push({ id: 'old-warning', type: 'warning', text: '경고 +1', read: false, createdAt: BASE.toISOString() });
  legacy.publicEvents.push({ id: 'old-event', type: 'info', text: '경고가 누적되었습니다.', createdAt: BASE.toISOString() });
  legacy.adminAuditLogs.push({ id: 'old-audit', action: 'warning_adjust', adminUserId: 'admin', detail: '경고 +1', createdAt: BASE.toISOString() });

  const shared = new Map();
  const storage = new MemoryStorage(shared);
  await storage.put('state-manifest', { chunks: 1, updatedAt: BASE.toISOString() });
  await storage.put('state-chunk-0', JSON.stringify(legacy));
  const loaded = await new DurableJsonStore(storage).load();
  const migratedPet = pets(loaded)[0];

  assert.equal(Object.hasOwn(migratedPet, 'warnings'), false);
  assert.equal(Object.hasOwn(migratedPet.records, 'warnings'), false);
  assert.equal(loaded.users.u1.notifications.some((item) => item.type === 'warning' || /경고/.test(item.text)), false);
  assert.equal(loaded.publicEvents.some((item) => /경고/.test(item.text)), false);
  assert.equal(loaded.adminAuditLogs.some((item) => /warning/i.test(item.action) || /경고/.test(item.detail ?? '')), false);
  assert.equal(loaded.meta.version, 28);
});

test('교미 거절은 경고 없이 단순 거절 처리되고 역방향 중복 신청도 막는다', () => {
  const state = stateWithUsers([['a', '신청자'], ['b', '상대']], BASE);
  const [actor, target] = pets(state);
  const requested = socialAction(state, actor, target, 'requestMating', {}, BASE);
  assert.equal(requested.ok, true);
  const request = Object.values(state.requests)[0];
  const reverse = socialAction(state, target, actor, 'requestMating', {}, new Date(BASE.getTime() + 1000));
  assert.equal(reverse.ok, false);
  assert.match(reverse.message, /이미/);

  const rejected = socialAction(state, target, actor, 'rejectMating', { requestId: request.id }, new Date(BASE.getTime() + 2000));
  assert.equal(rejected.ok, true);
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.message, '교미 신청을 거절했습니다.');
  assert.equal(Object.hasOwn(actor, 'warnings'), false);
  assert.equal(Object.hasOwn(target, 'warnings'), false);
  assert.equal(state.publicEvents.some((event) => /경고/.test(event.text)), false);
});

test('매칭·교미 신청은 하루 안에는 유지되고 저장 정리에서 7일 기준으로 관리된다', () => {
  const state = stateWithUsers([['a', 'A'], ['b', 'B']], BASE);
  const [actor, target] = pets(state);
  const match = socialAction(state, actor, target, 'requestMatch', {}, BASE);
  assert.equal(match.ok, true);
  const matchRequest = Object.values(state.requests)[0];
  assert.equal(Object.hasOwn(matchRequest, 'expiresAt'), false);

  // 하루 정도는 pending 상태를 유지하며 역방향 중복 신청은 계속 막는다.
  const reverse = socialAction(state, target, actor, 'requestMatch', {}, new Date(BASE.getTime() + DAY + 3000));
  assert.equal(reverse.ok, false);
  assert.equal(state.requests[matchRequest.id].status, 'pending');

  const rejected = socialAction(state, target, actor, 'rejectMatch', { requestId: matchRequest.id }, new Date(BASE.getTime() + DAY + 4000));
  assert.equal(rejected.ok, true);
  assert.equal(state.requests[matchRequest.id].status, 'rejected');
});

test('개인게임은 정상 시작 순간 1회를 사용하고 만료·포기로 일일 40회 제한을 우회할 수 없다', () => {
  const state = stateWithUsers([['u1', '게임']], BASE);
  const pet = pets(state)[0];
  pet.daily.miniGamesPlayed = 39;
  const started = startMiniGame(state, pet, 'apple', BASE);
  assert.equal(started.ok, true);
  assert.equal(pet.daily.miniGamesPlayed, 40);
  const challenge = state.miniGameChallenges[started.challenge.id];
  challenge.expiresAt = new Date(BASE.getTime() + 1000).toISOString();
  settleExpiredMiniGames(state, new Date(BASE.getTime() + 2000));
  assert.equal(pet.daily.miniGamesPlayed, 40, '만료 정산 때 두 번 차감하면 안 된다');
  const blocked = startMiniGame(state, pet, 'apple', new Date(BASE.getTime() + 3000));
  assert.equal(blocked.ok, false);
  assert.match(blocked.message, /40회/);
});

test('삭제된 번개반응은 클라이언트 조작 입력 여부와 관계없이 시작 자체를 거절한다', () => {
  const state = stateWithUsers([['u1', '번개']], BASE);
  const pet = pets(state)[0];
  const started = startMiniGame(state, pet, 'reaction', BASE);
  assert.equal(started.ok, false);
  assert.match(started.message, /선택할 수 없는 미니게임/);
  assert.equal(pet.daily.miniGamesPlayed, 0);
});

test('낚시 결과는 30초 전 클라이언트 응답과 dashboard에 resultId가 노출되지 않는다', () => {
  const state = stateWithUsers([['u1', '낚시']], BASE);
  const pet = pets(state)[0];
  const result = startFishing(pet, BASE);
  assert.equal(result.ok, true);
  assert.equal(Object.hasOwn(result.fishing, 'resultId'), false);
  assert.ok(pet.daily.fishing.resultId, '서버 내부에는 정산용 결과가 유지되어야 한다');
  const dashboard = privateDashboard(state, 'u1');
  assert.equal(Object.hasOwn(dashboard.pet.daily.fishing, 'resultId'), false);
});

test('오목·테트리스 대기방은 10분 방치 시 자동 정리되어 최대 3방을 영구 점유하지 않는다', () => {
  const state = stateWithUsers([['u1', '방장']], BASE);
  const pet = pets(state)[0];
  pet.stats.points = 10_000;
  const omok = createOmokRoom(state, pet, 100, BASE);
  const block = createBlockBattleRoom(state, pet, 100, BASE);
  assert.ok(state.omok.rooms[omok.roomId]);
  assert.ok(state.blockBattle.rooms[block.roomId]);
  processOmokTimers(state, new Date(BASE.getTime() + 10 * MINUTE + 1));
  processBlockBattleTimers(state, new Date(BASE.getTime() + 10 * MINUTE + 1));
  assert.equal(state.omok.rooms[omok.roomId], undefined);
  assert.equal(state.blockBattle.rooms[block.roomId], undefined);
});

test('벙은 방장당 활성 1개·중복 개설 멱등성을 보장하고 2명 미만 종료는 보상 없이 끝난다', () => {
  const state = stateWithUsers([['a', '방장'], ['b', '참가자']], BASE);
  const [host, guest] = pets(state);
  host.stats.points = 5000;
  const first = createBung(state, host, { title: '첫벙', stakePoints: 500, requestId: 'bung-create-0001' }, BASE);
  assert.equal(first.ok, true);
  assert.equal(host.stats.points, 4500);
  const duplicate = createBung(state, host, { title: '첫벙', stakePoints: 500, requestId: 'bung-create-0001' }, BASE);
  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.duplicate, true);
  assert.equal(host.stats.points, 4500);
  const second = createBung(state, host, { title: '둘째벙', stakePoints: 500, requestId: 'bung-create-0002' }, BASE);
  assert.equal(second.ok, false);

  const bung = state.bungs[first.bung.id];
  joinBung(state, guest, bung, new Date(BASE.getTime() + 1000));
  assert.equal(startBung(state, host, bung, new Date(BASE.getTime() + 2000)).ok, true);
  const beforePower = host.stats.legoPower;
  const beforeStamina = host.stats.stamina;
  leaveBung(state, guest, bung, new Date(BASE.getTime() + 3000));
  const finished = finishBung(state, host, bung, new Date(BASE.getTime() + 4000));
  assert.equal(finished.ok, true);
  assert.equal(finished.rewarded, false);
  assert.equal(host.stats.legoPower, beforePower);
  assert.equal(host.stats.stamina, beforeStamina);
});

test('음식 구매는 동일 requestId 재시도에서 포인트·몸집을 두 번 변경하지 않는다', async () => {
  const { room } = await createRoom();
  const token = await register(room, '음식멱등');
  let state = await room.store.load();
  const user = Object.values(state.users).find((item) => item.nickname === '음식멱등');
  const pet = state.pets[user.currentPetId];
  pet.stats.points = 100;
  pet.stats.hunger = 50;
  pet.stats.body = 70;
  await room.store.save(state);

  const request = () => api(room, token, '/api/actions/eat', { foodId: 'triangle', requestId: 'food-eat-000001' });
  const [first, second] = await Promise.all([request(), request()]);
  assert.equal(first.response.status, 200);
  assert.equal(second.response.status, 200);
  state = await room.store.load();
  const saved = state.pets[user.currentPetId];
  assert.equal(saved.stats.points, 80);
  assert.equal(saved.stats.body, 72);
  assert.equal(Object.keys(state.foodOperations).length, 1);
});

test('정상 저장 백업이 있으면 현재 JSON 손상 시 빈 게임 초기화 대신 마지막 정상 상태로 복구한다', async () => {
  const shared = new Map();
  const storage = new MemoryStorage(shared);
  const store = new DurableJsonStore(storage);
  const state = await store.load();
  state.users.keep = { id: 'keep', nickname: '보존', generation: 1, currentPetId: null, sessionVersion: 1, notifications: [], createdAt: BASE.toISOString(), lastSeenAt: BASE.toISOString() };
  await store.save(state, { forceBackup: true });
  await storage.put('state-chunk-0', '{broken-current-json');

  const recovered = await new DurableJsonStore(storage).load();
  assert.ok(recovered.users.keep, '백업 상태의 계정이 유지되어야 한다');
  assert.equal(recovered.meta.version, 28);
  assert.ok([...shared.keys()].some((key) => key.startsWith('broken-state-manifest-')), '손상 원본도 별도 보존해야 한다');
});

test('정상 백업도 없는 저장 손상은 빈 상태로 덮어쓰지 않고 복구 오류를 명시한다', async () => {
  const shared = new Map([
    ['state-manifest', { chunks: 1, updatedAt: BASE.toISOString() }],
    ['state-chunk-0', '{definitely-broken']
  ]);
  const storage = new MemoryStorage(shared);
  await assert.rejects(() => new DurableJsonStore(storage).load(), /자동 초기화를 중단/);
  assert.equal(shared.get('state-chunk-0'), '{definitely-broken');
  assert.ok([...shared.keys()].some((key) => key.startsWith('broken-state-manifest-')));
});

test('일반 생활 행동은 전역 processTimeState를 요청당 한 번만 실행한다', async () => {
  const { room } = await createRoom();
  const token = await register(room, '시간처리');
  const original = room.processTimeState.bind(room);
  let calls = 0;
  room.processTimeState = async (...args) => { calls += 1; return original(...args); };
  const result = await api(room, token, '/api/actions/work', {});
  assert.equal(result.response.status, 200);
  assert.equal(calls, 1);
});

test('운영자 강퇴는 경고와 무관하게 동작하고 감사로그에 남으며 경고 API는 제거됐다', async () => {
  const created = await createRoom();
  const adminToken = await register(created.room, '운영자');
  await register(created.room, '대상');
  let state = await created.room.store.load();
  const admin = Object.values(state.users).find((user) => user.nickname === '운영자');
  const target = Object.values(state.users).find((user) => user.nickname === '대상');
  created.room.env.ADMIN_USER_IDS = admin.id;
  const oldPetId = target.currentPetId;

  const kicked = await api(created.room, adminToken, '/api/admin/kick', { targetPetId: oldPetId });
  assert.equal(kicked.response.status, 200);
  state = await created.room.store.load();
  assert.notEqual(state.users[target.id].currentPetId, oldPetId);
  assert.equal(state.adminAuditLogs.some((entry) => entry.action === 'kick' && entry.targetUserId === target.id), true);

  const removedWarningApi = await api(created.room, adminToken, '/api/admin/warnings', { targetPetId: state.users[target.id].currentPetId, delta: 1 });
  assert.equal(removedWarningApi.response.status, 404);
});


test('24시간 방치된 모집·진행 벙은 자동 취소되어 활성 벙 슬롯을 영구 점유하지 않는다', () => {
  const state = stateWithUsers([['a', '방장'], ['b', '참가자']], BASE);
  const [host, guest] = pets(state);
  host.stats.points = 5000;
  const created = createBung(state, host, { title: '방치벙', stakePoints: 500, requestId: 'bung-timeout-0001' }, BASE);
  assert.equal(created.ok, true);
  processBungTimers(state, new Date(BASE.getTime() + DAY + 1));
  assert.equal(state.bungs[created.bung.id].status, 'cancelled');
  assert.equal(state.bungs[created.bung.id].autoCancelled, true);

  const created2 = createBung(state, host, { title: '진행방치벙', stakePoints: 500, requestId: 'bung-timeout-0002' }, new Date(BASE.getTime() + DAY + 2));
  assert.equal(created2.ok, true);
  const bung2 = state.bungs[created2.bung.id];
  joinBung(state, guest, bung2, new Date(BASE.getTime() + DAY + 3000));
  startBung(state, host, bung2, new Date(BASE.getTime() + DAY + 4000));
  processBungTimers(state, new Date(BASE.getTime() + 2 * DAY + 4001));
  assert.equal(bung2.status, 'cancelled');
  assert.equal(bung2.autoCancelled, true);
});

test('플렉스 구매 버튼은 실제 buyFlexItem 핸들러와 연결되어 ReferenceError 회귀를 막는다', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /async function buyFlexItem\(itemId\)/);
  assert.match(app, /if \(action === 'buy-flex'\) return buyFlexItem\(idValue\);/);
  assert.match(app, /return buyShopItem\(itemId\);/);
});

test('경고 게임 규칙은 프론트 UI·관리자 조작·프로필 지표에서 완전히 제거된다', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /data-action="admin-warning"/);
  assert.doesNotMatch(app, /\/api\/admin\/warnings/);
  assert.doesNotMatch(app, /compactMetric\('경고'/);
  assert.doesNotMatch(app, /일반 경고|누적 경고|경고 누적/);
});

test('PWA 홈 화면 아이콘 192·512·maskable 자산과 manifest 연결이 모두 존재한다', async () => {
  const manifest = JSON.parse(await readFile(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'));
  const srcs = new Set((manifest.icons ?? []).map((item) => item.src));
  for (const src of ['/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon-maskable-512.png']) assert.equal(srcs.has(src), true);
  for (const name of ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png']) {
    const info = await stat(new URL(`../public/icons/${name}`, import.meta.url));
    assert.equal(info.isFile(), true);
    assert.ok(info.size > 1000);
  }
  assert.equal((manifest.icons ?? []).some((item) => String(item.purpose ?? '').includes('maskable')), true);
});
