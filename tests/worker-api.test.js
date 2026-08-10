import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import { createRoom, responseJson, register, authRequest } from './helpers.js';

async function bootstrap(room, token) {
  const { response, data } = await responseJson(await room.fetch(authRequest('/api/bootstrap', token)));
  assert.equal(response.status, 200, JSON.stringify(data));
  return data.bootstrap;
}

async function api(room, token, path, body = {}, method = 'POST') {
  return responseJson(await room.fetch(authRequest(path, token, {
    method,
    body: method === 'GET' || method === 'DELETE' ? undefined : JSON.stringify(body)
  })));
}

async function setPoints(room, token, points) {
  const boot = await bootstrap(room, token);
  const state = await room.store.load();
  state.pets[boot.dashboard.pet.id].stats.points = points;
  await room.store.save(state);
  return boot.dashboard.pet.id;
}

test('외부 Worker 상태 확인과 정적 파일 보안 헤더가 v6.4.8으로 동작한다', async () => {
  let response = await worker.fetch(new Request('https://game.test/healthz'), {});
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, version: '6.4.8-final', platform: 'Cloudflare Workers' });

  response = await worker.fetch(new Request('https://game.test/'), {
    ASSETS: {
      async fetch() {
        return new Response('<!doctype html><title>lego</title>', { headers: { 'content-type': 'text/html; charset=utf-8' } });
      }
    }
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.equal(response.headers.get('cache-control'), 'no-cache');
  assert.match(response.headers.get('content-security-policy'), /style-src 'self' 'unsafe-inline'/);
});

test('가입·로그인·중복 닉네임·잘못된 PIN·인증 없는 API를 정확히 처리한다', async () => {
  const { room } = await createRoom();
  const token = await register(room, '윤설', '1234');
  assert.ok(token);

  let result = await responseJson(await room.fetch(new Request('https://game.test/api/auth/register', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nickname: '윤설', pin: '1234' })
  })));
  assert.equal(result.response.status, 409);

  result = await responseJson(await room.fetch(new Request('https://game.test/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nickname: '윤설', pin: '9999' })
  })));
  assert.equal(result.response.status, 401);

  result = await responseJson(await room.fetch(new Request('https://game.test/api/bootstrap')));
  assert.equal(result.response.status, 401);
});

test('부트스트랩은 최종 포인트·레고력·생활·랭킹·영토·카탈로그만 제공한다', async () => {
  const { room } = await createRoom();
  const token = await register(room, '윤설');
  const boot = await bootstrap(room, token);
  const pet = boot.dashboard.pet;
  assert.ok(Number.isInteger(boot.revision));
  assert.ok(boot.revision > 0);
  assert.equal(pet.stats.points, 0);
  assert.equal(pet.stats.legoPower, 1);
  assert.equal(pet.stats.level, 1);
  assert.equal(pet.stats.stamina, 100);
  assert.equal(pet.stats.hunger, 100);
  assert.equal(pet.daily.actionsLeft, 5);
  assert.equal(boot.catalog.gameDayHours, 6);
  assert.equal(boot.catalog.fishingPerDay, 20);
  assert.equal(boot.catalog.miniGamesPerDay, 40);
  assert.equal(boot.catalog.bungMinStake, 500);
  assert.equal(boot.catalog.statusMessageMaxLength, 20);
  assert.equal(boot.catalog.breakWarningMax, 3);
  assert.equal(boot.catalog.breakInactivityHours, 24 * 7);
  assert.equal('lifeCrisis' in pet.stats, false);
  assert.equal(pet.integrity.broken, false);
  assert.equal(pet.statusMessage, '');
  assert.deepEqual(boot.catalog.oddEven, { minStake: 10, stakeStep: 10, payoutPercent: { 1: 130, 2: 160, 3: 200 } });
  assert.deepEqual(boot.catalog.liarBetOptions, [10, 100, 500]);
  assert.deepEqual(boot.catalog.liarPlayerOptions, [3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.deepEqual(boot.catalog.miniGames.map((game) => game.id), ['oddEven', 'reaction', 'number', 'apple']);
  assert.equal(boot.omok.maxRooms, 3);
  assert.equal(boot.catalog.miniGames.find((game) => game.id === 'number').maxAttempts, 5);
  assert.deepEqual(boot.catalog.fishingRewards.map((item) => item.reward), [0, 5, 10, 20, 50, 100, 200, 300, 500]);
  assert.equal(boot.territory.size, 4);
  assert.ok(Array.isArray(boot.rankings.points));
  assert.ok(Array.isArray(boot.rankings.levels));
  assert.ok(Array.isArray(boot.rankings.couples));
  assert.ok(Array.isArray(boot.rankings.pokes));
  for (const deleted of ['money', 'debt', 'mood', 'charm', 'affinity', 'gifts', 'rumors', 'offspring']) {
    assert.equal(deleted in pet.stats, false, `${deleted} 삭제 데이터가 노출되면 안 된다`);
    assert.equal(deleted in boot, false, `${deleted} 상위 응답이 없어야 한다`);
  }
});

test('상태메시지는 20자 이내로 저장되고 온라인 레고·공개 프로필에 표시되며 초과 입력은 거부한다', async () => {
  const shared = new Map();
  const { room } = await createRoom(shared);
  const tokenA = await register(room, '윤설');
  const tokenB = await register(room, '민균');
  const petA = (await bootstrap(room, tokenA)).dashboard.pet.id;

  let result = await api(room, tokenA, '/api/profile/status-message', { statusMessage: '  오늘도   레고 키우는 중  ' });
  assert.equal(result.response.status, 200);
  assert.equal(result.data.bootstrap.dashboard.pet.statusMessage, '오늘도 레고 키우는 중');

  let bootB = await bootstrap(room, tokenB);
  const onlineA = bootB.online.find((item) => item.id === petA);
  assert.equal(onlineA?.statusMessage, '오늘도 레고 키우는 중');

  result = await api(room, tokenB, `/api/profiles/${petA}`, {}, 'GET');
  assert.equal(result.response.status, 200);
  assert.equal(result.data.profile.statusMessage, '오늘도 레고 키우는 중');

  result = await api(room, tokenA, '/api/profile/status-message', { statusMessage: '123456789012345678901' });
  assert.equal(result.response.status, 400);
  assert.match(result.data.message, /20자/);
  assert.equal((await bootstrap(room, tokenA)).dashboard.pet.statusMessage, '오늘도 레고 키우는 중');

  result = await api(room, tokenA, '/api/profile/status-message', { statusMessage: '' });
  assert.equal(result.response.status, 200);
  assert.equal(result.data.bootstrap.dashboard.pet.statusMessage, '');

  const reconnected = await createRoom(shared);
  assert.equal((await bootstrap(reconnected.room, tokenA)).dashboard.pet.statusMessage, '');
});

test('저장소 재접속 후 생활 행동 결과가 유지되고 30분 쿨타임이 서버에서 막힌다', async () => {
  const shared = new Map();
  const first = await createRoom(shared);
  const token = await register(first.room, '윤설');
  let result = await api(first.room, token, '/api/actions/work');
  assert.equal(result.response.status, 200);
  assert.equal(result.data.bootstrap.dashboard.pet.stats.points, 500);
  assert.equal(result.data.bootstrap.dashboard.pet.daily.actionsLeft, 4);

  result = await api(first.room, token, '/api/actions/work');
  assert.equal(result.response.status, 400);
  const second = await createRoom(shared);
  const boot = await bootstrap(second.room, token);
  assert.equal(boot.dashboard.pet.stats.points, 500);
  assert.equal(boot.dashboard.pet.daily.actionsLeft, 4);
});

test('홀짝 API는 사용자가 건 포인트를 차감하고 배팅액 비율로 정산하며 중복 정산을 차단한다', async () => {
  const { room } = await createRoom();
  const token = await register(room, '윤설');
  await setPoints(room, token, 100);
  let result = await api(room, token, '/api/minigames/start', { gameId: 'oddEven', stakePoints: 20 });
  assert.equal(result.response.status, 200);
  const challengeId = result.data.challenge.id;
  assert.equal(result.data.challenge.stake, 20);
  assert.equal(result.data.bootstrap.dashboard.pet.stats.points, 80);

  const original = Math.random;
  try {
    Math.random = () => 0;
    result = await api(room, token, '/api/minigames/finish', { challengeId, value: 'odd' });
  } finally {
    Math.random = original;
  }
  assert.equal(result.data.finished, false);
  assert.equal(result.data.streak, 1);
  assert.equal(result.data.pendingPayout, 26);
  result = await api(room, token, '/api/minigames/stop', { challengeId });
  assert.equal(result.response.status, 200);
  assert.equal(result.data.reward, 26);
  assert.equal(result.data.netProfit, 6);
  assert.equal(result.data.bootstrap.dashboard.pet.stats.points, 106);
  result = await api(room, token, '/api/minigames/stop', { challengeId });
  assert.equal(result.response.status, 400);
});

test('홀짝 API는 최대 배팅 상한 없이 보유 포인트까지 허용하고 잘못된 입력·보유액 초과는 거부한다', async () => {
  const { room } = await createRoom();
  const token = await register(room, '배팅검증');
  await setPoints(room, token, 5000);
  let result = await api(room, token, '/api/minigames/start', { gameId: 'oddEven', stakePoints: 5000 });
  assert.equal(result.response.status, 200);
  assert.equal(result.data.challenge.stake, 5000);
  result = await api(room, token, '/api/minigames/finish', { challengeId: result.data.challenge.id, value: 'even' });
  assert.equal(result.response.status, 200);
  await setPoints(room, token, 100);
  for (const stakePoints of [0, -1, 1.5, 9, 15, 110]) {
    const invalid = await api(room, token, '/api/minigames/start', { gameId: 'oddEven', stakePoints });
    assert.equal(invalid.response.status, 400);
    assert.equal(invalid.data.bootstrap.dashboard.pet.stats.points, 100);
  }
});

test('이전 버전에서 진행 중이던 홀짝은 업데이트 시 판돈을 한 번 환불하고 종료한다', async () => {
  const shared = new Map();
  const first = await createRoom(shared);
  const token = await register(first.room, '구버전홀짝');
  await setPoints(first.room, token, 100);
  const started = await api(first.room, token, '/api/minigames/start', { gameId: 'oddEven', stakePoints: 20 });
  assert.equal(started.response.status, 200);
  assert.equal(started.data.bootstrap.dashboard.pet.stats.points, 80);

  const legacyState = await first.room.store.load();
  legacyState.meta.version = 10;
  await first.room.store.save(legacyState);

  const second = await createRoom(shared);
  const boot = await bootstrap(second.room, token);
  assert.equal(boot.dashboard.pet.stats.points, 100);
  assert.equal(boot.dashboard.pet.records.pointsSpent, 0);
  assert.equal(boot.activeMiniChallenge, null);

  const bootAgain = await bootstrap(second.room, token);
  assert.equal(bootAgain.dashboard.pet.stats.points, 100, '재접속해도 환불이 중복되면 안 된다');
  const persistedManifest = shared.get('state-manifest');
  const persistedJson = Array.from({ length: persistedManifest.chunks }, (_, index) => shared.get(`state-chunk-${index}`) ?? '').join('');
  const persistedState = JSON.parse(persistedJson);
  assert.equal(persistedState.meta.version, 17, '마이그레이션 결과를 Durable Object 저장소에 즉시 저장해야 한다');
  assert.equal(Object.values(persistedState.miniGameChallenges).some((item) => item?.gameId === 'oddEven' && !item.completed), false);
});

test('숫자 맞히기 API는 목표 숫자를 응답에 숨기고 빈 기본값·중복 완료를 차단한다', async () => {
  const { room } = await createRoom();
  const token = await register(room, '윤설');
  const original = Math.random;
  let result;
  try {
    Math.random = () => 0.49; // 목표 50
    result = await api(room, token, '/api/minigames/start', { gameId: 'number' });
  } finally {
    Math.random = original;
  }
  const challengeId = result.data.challenge.id;
  assert.equal('target' in result.data.challenge, false);
  result = await api(room, token, '/api/minigames/finish', { challengeId, value: '' });
  assert.equal(result.response.status, 400);
  result = await api(room, token, '/api/minigames/finish', { challengeId, value: 50 });
  assert.equal(result.response.status, 200);
  assert.equal(result.data.reward, 100);
  result = await api(room, token, '/api/minigames/finish', { challengeId, value: 50 });
  assert.equal(result.response.status, 400);
});

test('낚시는 30초 전 정산을 막고 시간이 지나면 재접속 부트스트랩에서 자동으로 한 번만 지급한다', async () => {
  const { room } = await createRoom();
  const token = await register(room, '윤설');
  const original = Math.random;
  let result;
  try {
    Math.random = () => 0.999; // 잔치집 삼합 500P
    result = await api(room, token, '/api/fishing/start');
  } finally {
    Math.random = original;
  }
  assert.equal(result.response.status, 200);
  assert.equal(new Date(result.data.fishing.readyAt).getTime() - new Date(result.data.fishing.startedAt).getTime(), 30_000);
  result = await api(room, token, '/api/fishing/claim');
  assert.equal(result.response.status, 400);

  const state = await room.store.load();
  const pet = state.pets[(await bootstrap(room, token)).dashboard.pet.id];
  pet.daily.fishing.startedAt = new Date(Date.now() - 31_000).toISOString();
  pet.daily.fishing.readyAt = new Date(Date.now() - 1_000).toISOString();
  await room.store.save(state);
  const boot = await bootstrap(room, token);
  assert.equal(boot.dashboard.pet.stats.points, 500);
  assert.equal(boot.dashboard.pet.daily.fishing, null);
  const bootAgain = await bootstrap(room, token);
  assert.equal(bootAgain.dashboard.pet.stats.points, 500, '자동 정산은 한 번만 지급한다');
});

test('벙 API는 최소 500P를 차감하고 2명 정상 종료 시 체력 -20과 레고력 보상을 지급한다', async () => {
  const { room } = await createRoom();
  const hostToken = await register(room, '방장');
  const guestToken = await register(room, '참가자');
  await setPoints(room, hostToken, 1_000);

  let result = await api(room, hostToken, '/api/bungs', { title: '테스트벙', stakePoints: 499 });
  assert.equal(result.response.status, 400);
  result = await api(room, hostToken, '/api/bungs', { title: '테스트벙', stakePoints: 500 });
  assert.equal(result.response.status, 201);
  const bungId = result.data.bung.id;
  assert.equal(result.data.bootstrap.dashboard.pet.stats.points, 500);
  assert.equal((await api(room, hostToken, `/api/bungs/${bungId}/start`)).response.status, 400, '1명 시작 차단');
  assert.equal((await api(room, guestToken, `/api/bungs/${bungId}/join`)).response.status, 200);
  assert.equal((await api(room, hostToken, `/api/bungs/${bungId}/start`)).response.status, 200);
  result = await api(room, hostToken, `/api/bungs/${bungId}/end`);
  assert.equal(result.response.status, 200);
  assert.equal(result.data.rewards.length, 2);
  const hostBoot = await bootstrap(room, hostToken);
  const guestBoot = await bootstrap(room, guestToken);
  assert.equal(hostBoot.dashboard.pet.stats.stamina, 80);
  assert.equal(guestBoot.dashboard.pet.stats.stamina, 80);
  assert.equal(hostBoot.dashboard.pet.stats.legoPower, 4, '반복 +1, 벙 참가 목표 +1, 벙 개최 목표 +1');
  assert.equal(guestBoot.dashboard.pet.stats.legoPower, 3);
});

test('매칭 수락·이별과 교미 신청 수락/거절 흐름이 API에 연결된다', async () => {
  const { room } = await createRoom();
  const tokenA = await register(room, '윤설');
  const tokenB = await register(room, '민균');
  const bootA = await bootstrap(room, tokenA);
  const bootB = await bootstrap(room, tokenB);
  const petA = bootA.dashboard.pet.id;
  const petB = bootB.dashboard.pet.id;

  assert.equal((await api(room, tokenA, '/api/social/action', { targetPetId: petB, action: 'requestMatch' })).response.status, 200);
  const matchRequest = (await bootstrap(room, tokenB)).requests.find((item) => item.type === 'match');
  let result = await api(room, tokenB, '/api/social/action', { targetPetId: petA, action: 'acceptMatch', requestId: matchRequest.id });
  assert.equal(result.response.status, 200);
  assert.equal(result.data.bootstrap.dashboard.pet.partnerPetId, petA);
  assert.equal(result.data.bootstrap.dashboard.pet.coupleDay, 1);
  assert.equal((await api(room, tokenA, '/api/social/action', { targetPetId: petB, action: 'breakup' })).response.status, 200);

  result = await api(room, tokenA, '/api/social/action', { targetPetId: petB, action: 'requestMating' });
  assert.equal(result.response.status, 200);
  const matingRequest = (await bootstrap(room, tokenB)).requests.find((item) => item.type === 'mating');
  assert.ok(matingRequest);
  const original = Math.random;
  try {
    Math.random = () => 0.87;
    result = await api(room, tokenB, '/api/social/action', { targetPetId: petA, action: 'acceptMating', requestId: matingRequest.id });
  } finally { Math.random = original; }
  assert.equal(result.response.status, 200);
  assert.equal(result.data.accepted, true);
  assert.equal(result.data.compatibility, 87);
  assert.match(result.data.message, /궁합도 87%/);
  assert.match(result.data.bootstrap.publicEvents[0].text, /궁합도는 87%/);

  await api(room, tokenA, '/api/social/action', { targetPetId: petB, action: 'requestMating' });
  const rejectRequest = (await bootstrap(room, tokenB)).requests.find((item) => item.type === 'mating');
  try {
    Math.random = () => 0;
    result = await api(room, tokenB, '/api/social/action', { targetPetId: petA, action: 'rejectMating', requestId: rejectRequest.id });
  } finally { Math.random = original; }
  assert.equal(result.response.status, 200);
  assert.equal(result.data.warned, true);
  const after = await bootstrap(room, tokenA);
  assert.equal(after.dashboard.pet.warnings, 1);
  assert.equal(after.dashboard.pet.integrity.warnings, 0);
  assert.equal(after.notifications.some((item) => item.type === 'warning' && item.payload?.popup), true);
  assert.match(after.publicEvents[0].text, /경고 1회/);
});

test('찌르기는 되찌르기 전 중복을 차단하고 순위에 상호 누적 횟수를 반영한다', async () => {
  const { room } = await createRoom();
  const tokenA = await register(room, '윤설');
  const tokenB = await register(room, '민균');
  const petA = (await bootstrap(room, tokenA)).dashboard.pet.id;
  const petB = (await bootstrap(room, tokenB)).dashboard.pet.id;
  assert.equal((await api(room, tokenA, '/api/social/poke', { targetPetId: petB })).response.status, 200);
  assert.equal((await api(room, tokenA, '/api/social/poke', { targetPetId: petB })).response.status, 400);
  assert.equal((await api(room, tokenB, '/api/social/poke', { targetPetId: petA })).response.status, 200);
  const rankings = (await bootstrap(room, tokenA)).rankings;
  assert.equal(rankings.pokes[0].total, 2);
});

test('영토전 API는 첫 빈칸을 본진으로 점령하고 영토 수·순위를 즉시 반영한다', async () => {
  const { room } = await createRoom();
  const token = await register(room, '윤설');
  let result = await api(room, token, '/api/territory/claim', { row: 2, col: 2 });
  assert.equal(result.response.status, 200);
  assert.equal(result.data.myOwned, 1);
  let boot = result.data.bootstrap;
  assert.equal(boot.territory.my.owned, 1);
  assert.equal(boot.territory.my.limit, 1);
  assert.equal(boot.territory.my.rank, 1);
  const home = boot.territory.cells.find((cell) => cell.row === 2 && cell.col === 2);
  assert.equal(home.mine, true);
  assert.equal(home.home, true);

  result = await api(room, token, '/api/territory/claim', { row: 2, col: 3 });
  assert.equal(result.response.status, 400, 'Lv.1은 보호 본진 한 칸만 가져서 추가 이동/확장을 할 수 없다');
  boot = result.data.bootstrap;
  assert.equal(boot.territory.my.owned, 1);
  assert.equal(boot.territory.cells.find((cell) => cell.row === 2 && cell.col === 2).mine, true);
});

test('영토전 API는 주변 8칸의 일반 영토를 탈취하되 상대 본진은 보호한다', async () => {
  const { room } = await createRoom();
  const tokenA = await register(room, '탈취자');
  const tokenB = await register(room, '피해자');
  const bootA0 = await bootstrap(room, tokenA);
  const bootB0 = await bootstrap(room, tokenB);
  const state = await room.store.load();
  state.pets[bootA0.dashboard.pet.id].stats.legoPower = 11; // Lv.2, 최대 2칸
  state.pets[bootB0.dashboard.pet.id].stats.legoPower = 11;
  await room.store.save(state);

  assert.equal((await api(room, tokenB, '/api/territory/claim', { row: 2, col: 2 })).response.status, 200); // 피해자 본진
  assert.equal((await api(room, tokenB, '/api/territory/claim', { row: 2, col: 3 })).response.status, 200); // 피해자 일반땅
  assert.equal((await api(room, tokenA, '/api/territory/claim', { row: 1, col: 2 })).response.status, 200); // 공격자 본진

  let stolen = await api(room, tokenA, '/api/territory/claim', { row: 2, col: 2 });
  assert.equal(stolen.response.status, 400, '상대 본진은 빼앗을 수 없다');

  stolen = await api(room, tokenA, '/api/territory/claim', { row: 2, col: 3 });
  assert.equal(stolen.response.status, 200);
  assert.equal(stolen.data.victimOwned, 1);
  const bootA = stolen.data.bootstrap;
  const bootB = await bootstrap(room, tokenB);
  assert.equal(bootA.territory.my.owned, 2);
  assert.equal(bootB.territory.my.owned, 1);
  assert.equal(bootA.territory.cells.find((cell) => cell.row === 2 && cell.col === 3).mine, true);
  assert.equal(bootB.territory.cells.find((cell) => cell.row === 2 && cell.col === 2).home, true);
  assert.equal(bootA.territory.my.rank, 1);
});

test('파손된 레고는 일반 게임 API가 막히고 /api/life/restart를 눌렀을 때만 다음 세대로 초기화된다', async () => {
  const { room } = await createRoom();
  const token = await register(room, '파손테스트');
  const boot = await bootstrap(room, token);
  const state = await room.store.load();
  const pet = state.pets[boot.dashboard.pet.id];
  pet.integrity.breakWarnings = 3;
  pet.integrity.broken = true;
  pet.integrity.brokenAt = new Date().toISOString();
  pet.integrity.cause = 'work';
  pet.integrity.stageMessage = '💥 레고가 부숴졌습니다.';
  await room.store.save(state);

  let result = await api(room, token, '/api/actions/work');
  assert.equal(result.response.status, 400);
  assert.equal(result.data.bootstrap.dashboard.pet.integrity.broken, true);
  const oldId = result.data.bootstrap.dashboard.pet.id;
  result = await api(room, token, '/api/life/restart');
  assert.equal(result.response.status, 200);
  assert.equal(result.data.bootstrap.dashboard.pet.generation, 2);
  assert.notEqual(result.data.bootstrap.dashboard.pet.id, oldId);
  assert.equal(result.data.bootstrap.dashboard.pet.stats.points, 0);
  assert.equal(result.data.bootstrap.dashboard.pet.integrity.warnings, 0);
  assert.equal(result.data.bootstrap.history[0].endReason, '파손');
});

test('일반 사용자는 운영자 API를 호출할 수 없고 ADMIN_USER_IDS로 지정한 계정만 경고·초기화·포인트 조정을 할 수 있다', async () => {
  const shared = new Map();
  const first = await createRoom(shared);
  const adminToken = await register(first.room, '관리자');
  const targetToken = await register(first.room, '대상');
  const adminBoot = await bootstrap(first.room, adminToken);
  const targetPetId = (await bootstrap(first.room, targetToken)).dashboard.pet.id;

  let result = await api(first.room, adminToken, '/api/admin/warnings', { targetPetId, delta: 1 });
  assert.equal(result.response.status, 403);
  result = await api(first.room, adminToken, '/api/admin/points', { targetPetId, delta: 500, requestId: 'non-admin-points-0001' });
  assert.equal(result.response.status, 403);
  assert.equal((await bootstrap(first.room, targetToken)).dashboard.pet.stats.points, 0);

  const second = await createRoom(shared, { ADMIN_USER_IDS: adminBoot.admin.userId });
  result = await api(second.room, adminToken, '/api/admin/warnings', { targetPetId, delta: 1 });
  assert.equal(result.response.status, 200);
  assert.equal((await bootstrap(second.room, targetToken)).dashboard.pet.warnings, 1);
  result = await api(second.room, adminToken, '/api/admin/reset-user', { targetPetId });
  assert.equal(result.response.status, 200);

  const requestId = 'admin-points-test-0001';
  result = await api(second.room, adminToken, '/api/admin/points', { targetPetId, delta: 500, requestId });
  assert.equal(result.response.status, 200);
  assert.equal((await bootstrap(second.room, targetToken)).dashboard.pet.stats.points, 500);

  result = await api(second.room, adminToken, '/api/admin/points', { targetPetId, delta: 500, requestId });
  assert.equal(result.response.status, 200);
  assert.equal(result.data.duplicate, true);
  assert.equal((await bootstrap(second.room, targetToken)).dashboard.pet.stats.points, 500, '같은 요청 ID는 중복 지급되지 않는다');

  result = await api(second.room, adminToken, '/api/admin/points', { targetPetId, delta: -200, requestId: 'admin-points-test-0002' });
  assert.equal(result.response.status, 200);
  assert.equal((await bootstrap(second.room, targetToken)).dashboard.pet.stats.points, 300);

  result = await api(second.room, adminToken, '/api/admin/points', { targetPetId, delta: -400, requestId: 'admin-points-test-0003' });
  assert.equal(result.response.status, 400);
  assert.equal((await bootstrap(second.room, targetToken)).dashboard.pet.stats.points, 300);

  const adminAfter = await bootstrap(second.room, adminToken);
  const pointLogs = adminAfter.admin.auditLogs.filter((entry) => entry.action === 'point_adjust' && entry.targetPetId === targetPetId);
  assert.equal(pointLogs.length, 2, '중복 요청과 실패 요청은 운영 로그를 중복 생성하면 안 된다');
  assert.equal(pointLogs[0].delta, -200);
  assert.equal(pointLogs[0].before, 500);
  assert.equal(pointLogs[0].after, 300);
  assert.equal(pointLogs[1].delta, 500);
});


test('관리자는 다른 회원 계정을 완전히 삭제할 수 있고 본인 삭제·일반 사용자 삭제는 차단된다', async () => {
  const shared = new Map();
  const first = await createRoom(shared);
  const adminToken = await register(first.room, '삭제관리자');
  const targetToken = await register(first.room, '삭제대상');
  const outsiderToken = await register(first.room, '일반회원');
  const adminBoot = await bootstrap(first.room, adminToken);
  const targetBoot = await bootstrap(first.room, targetToken);
  const targetUserId = targetBoot.dashboard.user.id;
  const targetPetId = targetBoot.dashboard.pet.id;

  let result = await api(first.room, outsiderToken, `/api/admin/users/${encodeURIComponent(targetUserId)}`, {}, 'DELETE');
  assert.equal(result.response.status, 403);
  assert.ok((await bootstrap(first.room, targetToken)).dashboard.pet.id === targetPetId);

  const second = await createRoom(shared, { ADMIN_USER_IDS: adminBoot.admin.userId });
  result = await api(second.room, adminToken, `/api/admin/users/${encodeURIComponent(adminBoot.admin.userId)}`, {}, 'DELETE');
  assert.equal(result.response.status, 400);
  assert.match(result.data.message, /본인/);

  result = await api(second.room, adminToken, '/api/admin/kick', { targetPetId });
  assert.equal(result.response.status, 200, '강퇴로 과거 세대가 생긴 뒤에도 계정 삭제가 가능해야 한다');
  const currentAfterKick = (await bootstrap(second.room, targetToken)).dashboard.pet.id;
  assert.notEqual(currentAfterKick, targetPetId);

  result = await api(second.room, adminToken, `/api/admin/users/${encodeURIComponent(targetUserId)}`, {}, 'DELETE');
  assert.equal(result.response.status, 200);
  assert.equal(result.data.ok, true);
  assert.equal(result.data.removedPetCount, 2);
  assert.equal(result.data.bootstrap.admin.members.some((member) => member.userId === targetUserId), false);
  const deleteLog = result.data.bootstrap.admin.auditLogs.find((entry) => entry.action === 'account_delete' && entry.targetUserId === targetUserId);
  assert.ok(deleteLog, '계정 삭제 성공은 운영 로그에 남아야 한다');
  assert.match(deleteLog.targetDisplayName, /삭제대상/);

  const state = await second.room.store.load();
  assert.equal(state.users[targetUserId], undefined);
  assert.equal(state.pets[targetPetId], undefined);
  assert.equal(Object.values(state.pets).some((pet) => pet?.userId === targetUserId), false);
  assert.equal(Object.values(state.relationships).some((relation) => relation?.petIds?.includes(targetPetId)), false);
  assert.equal(Object.values(state.pokes).some((pair) => pair?.petIds?.includes(targetPetId)), false);
  assert.equal(Object.values(state.requests).some((request) => request?.fromPetId === targetPetId || request?.toPetId === targetPetId), false);
  assert.equal(Object.values(state.miniGameChallenges).some((challenge) => challenge?.petId === targetPetId), false);

  result = await responseJson(await second.room.fetch(authRequest('/api/bootstrap', targetToken)));
  assert.equal(result.response.status, 401, '삭제된 계정의 기존 토큰은 즉시 무효여야 한다');

  result = await responseJson(await second.room.fetch(new Request('https://game.test/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nickname: '삭제대상', pin: '1234' })
  })));
  assert.equal(result.response.status, 401, '삭제된 계정으로 다시 로그인할 수 없어야 한다');

  const reRegistered = await register(second.room, '삭제대상', '4321');
  assert.ok(reRegistered, '삭제 후 같은 닉네임으로 새 계정 가입은 가능해야 한다');
  const reRegisteredBoot = await bootstrap(second.room, reRegistered);
  assert.notEqual(reRegisteredBoot.dashboard.user.id, targetUserId, '재가입은 삭제된 옛 userId를 재사용하지 않아야 한다');
  const adminAfterReregister = await bootstrap(second.room, adminToken);
  const reRegisteredMember = adminAfterReregister.admin.members.find((member) => member.userId === reRegisteredBoot.dashboard.user.id);
  assert.ok(reRegisteredMember, '삭제된 닉네임으로 새 계정을 만들면 관리자 회원 목록에 즉시 다시 보여야 한다');
  assert.equal(reRegisteredMember.displayName, '삭제대상레고');
  assert.equal(reRegisteredMember.hasActivePet, true);
});


test('오목 진행 중 회원 계정을 삭제해도 상대 판돈과 승패는 한 번만 안전하게 정산된다', async () => {
  const shared = new Map();
  const first = await createRoom(shared);
  const adminToken = await register(first.room, '오목삭제관리자');
  const targetToken = await register(first.room, '오목삭제대상');
  const opponentToken = await register(first.room, '오목상대');
  const adminBoot = await bootstrap(first.room, adminToken);
  const targetBoot = await bootstrap(first.room, targetToken);
  const targetUserId = targetBoot.dashboard.user.id;

  const second = await createRoom(shared, { ADMIN_USER_IDS: adminBoot.admin.userId });
  await setPoints(second.room, targetToken, 500);
  await setPoints(second.room, opponentToken, 500);

  let result = await api(second.room, targetToken, '/api/omok/rooms', { stakePoints: 100 });
  assert.equal(result.response.status, 201);
  const roomId = result.data.roomId;
  result = await api(second.room, opponentToken, `/api/omok/rooms/${encodeURIComponent(roomId)}/join`);
  assert.equal(result.response.status, 200);
  assert.equal((await bootstrap(second.room, opponentToken)).dashboard.pet.stats.points, 400);

  result = await api(second.room, adminToken, `/api/admin/users/${encodeURIComponent(targetUserId)}`, {}, 'DELETE');
  assert.equal(result.response.status, 200);

  const opponentBoot = await bootstrap(second.room, opponentToken);
  assert.equal(opponentBoot.dashboard.pet.stats.points, 600, '삭제된 플레이어는 기권 처리되어 상대가 총 판돈을 받아야 한다');
  assert.equal(opponentBoot.dashboard.pet.records.omokWins, 1);
  const state = await second.room.store.load();
  assert.equal(state.users[targetUserId], undefined);
  assert.equal(Object.values(state.omok.rooms).some((room) => room.hostPetId === targetBoot.dashboard.pet.id || room.guestPetId === targetBoot.dashboard.pet.id), false);
});


test('라이어게임 진행 중 회원 계정을 삭제하면 게임을 안전 종료하고 남은 플레이어 판돈을 환불한다', async () => {
  const shared = new Map();
  const first = await createRoom(shared);
  const adminToken = await register(first.room, '라이어삭제관리자');
  const targetToken = await register(first.room, '라이어삭제대상');
  const tokenB = await register(first.room, '라이어B');
  const tokenC = await register(first.room, '라이어C');
  const adminBoot = await bootstrap(first.room, adminToken);
  const targetBoot = await bootstrap(first.room, targetToken);
  const targetUserId = targetBoot.dashboard.user.id;
  const players = [targetToken, tokenB, tokenC];

  const second = await createRoom(shared, { ADMIN_USER_IDS: adminBoot.admin.userId });
  for (const token of players) await setPoints(second.room, token, 100);
  for (const token of players) {
    assert.equal((await api(second.room, token, '/api/liar/join')).response.status, 200);
    assert.equal((await api(second.room, token, '/api/liar/ready')).response.status, 200);
  }
  assert.equal((await api(second.room, targetToken, '/api/liar/start')).response.status, 200);
  assert.equal((await bootstrap(second.room, tokenB)).dashboard.pet.stats.points, 90);

  const result = await api(second.room, adminToken, `/api/admin/users/${encodeURIComponent(targetUserId)}`, {}, 'DELETE');
  assert.equal(result.response.status, 200);
  const bootB = await bootstrap(second.room, tokenB);
  const bootC = await bootstrap(second.room, tokenC);
  assert.equal(bootB.dashboard.pet.stats.points, 100);
  assert.equal(bootC.dashboard.pet.stats.points, 100);
  assert.equal(bootB.liarGame.phase, 'waiting');
  assert.equal(bootB.liarGame.players.some((player) => player.displayName.includes('라이어삭제대상')), false);
});

test('알림 모두 읽음은 전체 읽음 처리 후 미확인 개수를 0으로 만든다', async () => {
  const { room } = await createRoom();
  const tokenA = await register(room, '윤설');
  const tokenB = await register(room, '민균');
  const petB = (await bootstrap(room, tokenB)).dashboard.pet.id;
  await api(room, tokenA, '/api/social/action', { targetPetId: petB, action: 'requestMating' });
  let boot = await bootstrap(room, tokenB);
  assert.equal(boot.notifications.some((item) => !item.read), true);
  const result = await api(room, tokenB, '/api/notifications/read', {});
  assert.equal(result.response.status, 200);
  boot = result.data.bootstrap;
  assert.equal(boot.notifications.filter((item) => !item.read).length, 0);
});

test('과거 제거된 게임 API는 인증 후에도 404이며 서버 상태를 변경하지 않는다', async () => {
  const { room } = await createRoom();
  const token = await register(room, '윤설');
  const deletedRoutes = [
    '/api/actions/find-job', '/api/actions/solo-bung', '/api/finance/borrow', '/api/finance/repay',
    '/api/shop/buy-gift', '/api/rumors/listen', '/api/bungs/fake/chat', '/api/bungs/fake/interact'
  ];
  for (const path of deletedRoutes) {
    const result = await api(room, token, path, {});
    assert.equal(result.response.status, 404, path);
  }
});

test('Durable Object 알람은 라이어 단계가 없어도 0 이하를 예약하지 않고 미래 시즌 시각을 사용한다', async () => {
  const { room, ctx } = await createRoom();
  await register(room, '윤설');
  assert.ok(Number.isFinite(ctx.storage.alarm));
  assert.ok(ctx.storage.alarm > Date.now());
  const state = await room.store.load();
  state.liarGame.phaseEndsAt = 0;
  await room.scheduleNextAlarm(state);
  assert.ok(ctx.storage.alarm > Date.now());
});

test('라이어게임 관전 API는 진행 중 게임에 읽기 전용으로 들어가며 비밀정보와 입력 권한을 주지 않는다', async () => {
  const { room } = await createRoom();
  const tokenA = await register(room, '관전A');
  const tokenB = await register(room, '관전B');
  const tokenC = await register(room, '관전C');
  const tokenS = await register(room, '관전자');
  const players = [tokenA, tokenB, tokenC];

  for (const token of players) await setPoints(room, token, 100);
  for (const token of players) {
    assert.equal((await api(room, token, '/api/liar/join')).response.status, 200);
    assert.equal((await api(room, token, '/api/liar/ready')).response.status, 200);
  }
  assert.equal((await api(room, tokenA, '/api/liar/start')).response.status, 200);

  const watched = await api(room, tokenS, '/api/liar/spectate');
  assert.equal(watched.response.status, 200);
  const view = watched.data.bootstrap.liarGame;
  assert.equal(view.spectating, true);
  assert.equal(view.joined, false);
  assert.equal(view.players.length, 3);
  assert.equal(view.word, null);
  assert.equal(view.liarPetId, null);
  assert.equal(view.category, null);
  assert.equal(view.voteCandidateIds.length, 0);
  assert.equal(view.messages.some((message) => message.type === 'system'), false);

  const chat = await api(room, tokenS, '/api/liar/chat', { text: '관전자가 보내면 안 됨' });
  assert.equal(chat.response.status, 400);
  assert.match(chat.data.message, /참가/);
  const start = await api(room, tokenS, '/api/liar/start');
  assert.equal(start.response.status, 400);
});

test('외부 Worker는 Durable Object 바인딩이 없거나 진입부 오류가 나도 API에 JSON 오류를 반환한다', async () => {
  const response = await worker.fetch(new Request('https://game.test/api/bootstrap'), {});
  assert.equal(response.status, 503);
  assert.match(response.headers.get('content-type') || '', /application\/json/);
  const data = await response.json();
  assert.equal(data.ok, false);
  assert.match(data.message, /Durable Object|서버 저장소 연결 설정/);
});
