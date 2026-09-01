import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { DurableJsonStore, initialState } from '../src/durable-store.js';
import { BODY_STAGES } from '../src/game/constants.js';
import { bodyStageRanking, createPet } from '../src/game/engine.js';
import {
  SICHUAN_THEME_KEYS, SICHUAN_THEMES, createSichuanRoom, joinSichuanRoom, requestSichuanRematch
} from '../src/game/sichuan.js';
import { MemoryStorage, stateWithUsers } from './helpers.js';

const BASE = new Date('2026-09-01T05:00:00.000Z');

function addLegacyUser(state, id, nickname) {
  const user = { id, nickname, generation:1, currentPetId:null, sessionVersion:1, notifications:[], createdAt:BASE.toISOString(), lastSeenAt:BASE.toISOString() };
  const pet = createPet(user, 1, BASE);
  user.currentPetId = pet.id;
  state.users[id] = user;
  state.pets[pet.id] = pet;
  return pet;
}

test('삭제 배포는 메인 다빈치와 별도 저장 틀린그림의 남은 판돈을 모두 1회 환불한 뒤 관련 영구 데이터를 지운다', async () => {
  const legacy = initialState();
  legacy.meta.version = 28;
  const a = addLegacyUser(legacy, 'cleanup-a', '정리A');
  const b = addLegacyUser(legacy, 'cleanup-b', '정리B');
  a.stats.points = 1_000; b.stats.points = 2_000;
  a.records.pointsSpent = 500; b.records.pointsSpent = 500;
  a.records.davinciWins = 9;
  a.records.spotDifferenceWins = 8;
  a.records.seasonSpotDifferenceWins = 7;
  a.seasonBadges.spotDifference = { rank:1, seasonKey:'old' };
  a.kingHistory.spotDifference = true;
  legacy.davinci = { rooms: { oldDavinci: { escrow: { [a.id]:100, [b.id]:100 } } } };
  legacy.spotDifference = { rooms: { staleMainSpot: { escrow: { [a.id]:999, [b.id]:999 } } } };
  legacy.publicEvents.push({ id:'retired-event', type:'spot-difference', text:'예전 게임 소식', createdAt:BASE.toISOString() });
  legacy.users['cleanup-a'].notifications.push({ id:'retired-note', type:'davinci', text:'예전 게임 알림', createdAt:BASE.toISOString() });
  legacy.adminAuditLogs.push({ id:'retired-audit', action:'davinci_clear_ended', detail:'예전 게임 정리', createdAt:BASE.toISOString() });

  const json = JSON.stringify(legacy);
  const shared = new Map([
    ['state-manifest', { chunks:1, characters:json.length, updatedAt:BASE.toISOString() }],
    ['state-chunk-0', json],
    ['spot-difference-state', {
      revision: 500,
      spotDifference: { rooms: { authoritativeSpot: { escrow: { [a.id]:200, [b.id]:200 } } } },
      updatedAt: BASE.toISOString()
    }]
  ]);

  const migrated = await new DurableJsonStore(new MemoryStorage(shared)).load();
  assert.equal(migrated.meta.version, 29);
  assert.equal(migrated.pets[a.id].stats.points, 1_300);
  assert.equal(migrated.pets[b.id].stats.points, 2_300);
  assert.equal(migrated.pets[a.id].records.pointsSpent, 200);
  assert.equal(migrated.pets[b.id].records.pointsSpent, 200);
  assert.equal('davinci' in migrated, false);
  assert.equal('spotDifference' in migrated, false);
  for (const key of ['davinciWins','spotDifferenceWins','seasonSpotDifferenceWins']) assert.equal(key in migrated.pets[a.id].records, false);
  assert.equal('spotDifference' in migrated.pets[a.id].seasonBadges, false);
  assert.equal('spotDifference' in migrated.pets[a.id].kingHistory, false);
  assert.equal(migrated.publicEvents.some((event) => /davinci|spot[-_]?difference/i.test(String(event.type ?? ''))), false);
  assert.equal(migrated.users['cleanup-a'].notifications.some((item) => /davinci|spot[-_]?difference/i.test(String(item.type ?? ''))), false);
  assert.equal(migrated.adminAuditLogs.some((item) => /davinci|spot[-_]?difference/i.test(String(item.action ?? ''))), false);
  assert.equal(shared.has('spot-difference-state'), false);

  const reloaded = await new DurableJsonStore(new MemoryStorage(shared)).load();
  assert.equal(reloaded.pets[a.id].stats.points, 1_300, '재로드에서 환불이 중복되면 안 된다');
  assert.equal(reloaded.pets[b.id].stats.points, 2_300, '재로드에서 환불이 중복되면 안 된다');
});

test('사천성은 세 테마 모두 같은 20개 논리 타일을 쓰고 모든 전용 SVG의 카드 캔버스가 100×100으로 동일하다', async () => {
  assert.deepEqual(SICHUAN_THEME_KEYS, ['life', 'nature', 'fantasy']);
  const stableIds = SICHUAN_THEMES.life.tiles.map((tile) => tile.id);
  assert.equal(stableIds.length, 20);
  for (const [themeKey, theme] of Object.entries(SICHUAN_THEMES)) {
    assert.equal(theme.tiles.length, 20);
    assert.deepEqual(theme.tiles.map((tile) => tile.id), stableIds);
    assert.equal(new Set(theme.tiles.map((tile) => tile.src)).size, 20);
    for (const tile of theme.tiles) {
      const path = new URL(`../public${tile.src}`, import.meta.url);
      await access(path);
      const svg = await readFile(path, 'utf8');
      assert.match(svg, /<svg[^>]+viewBox="0 0 100 100"/);
      assert.match(svg, /<svg[^>]+width="100" height="100"/);
    }
  }
});

test('사천성 재대결은 직전 테마를 바로 반복하지 않고 양쪽 플레이어에게 같은 themeKey를 제공한다', () => {
  const state = stateWithUsers([['theme-a','테마A'],['theme-b','테마B']], BASE);
  const [a,b] = Object.values(state.pets);
  a.stats.points = b.stats.points = 10_000;
  const made = createSichuanRoom(state, a, 100, BASE);
  assert.equal(made.ok, true);
  assert.equal(joinSichuanRoom(state, b, made.roomId, new Date(BASE.getTime()+1_000)).ok, true);
  const room = state.sichuan.rooms[made.roomId];
  const firstTheme = room.themeKey;
  assert.ok(SICHUAN_THEME_KEYS.includes(firstTheme));
  room.status = 'ended';
  room.settled = true;
  room.escrow = { [a.id]:0, [b.id]:0 };
  assert.equal(requestSichuanRematch(state, a, room.id, new Date(BASE.getTime()+2_000)).pending, true);
  const rematch = requestSichuanRematch(state, b, room.id, new Date(BASE.getTime()+3_000));
  assert.equal(rematch.started, true);
  assert.ok(SICHUAN_THEME_KEYS.includes(room.themeKey));
  assert.notEqual(room.themeKey, firstTheme);
});

test('레고방 체형도감 TOP 5는 체형 단계 우선, 같은 단계에서는 실제 몸집이 큰 순서로 계산된다', () => {
  const state = stateWithUsers([
    ['body-a','체형A'],['body-b','체형B'],['body-c','체형C'],['body-d','체형D'],['body-e','체형E'],['body-f','체형F']
  ], BASE);
  const pets = Object.values(state.pets);
  pets[0].stats.body = BODY_STAGES[5].min;
  pets[1].stats.body = BODY_STAGES[10].min;
  pets[2].stats.body = BODY_STAGES[10].min + 1;
  pets[3].stats.body = BODY_STAGES[20].min;
  pets[4].stats.body = BODY_STAGES[33].min;
  pets[5].stats.body = BODY_STAGES[2].min;
  const ranking = bodyStageRanking(state, 5);
  assert.equal(ranking.length, 5);
  assert.deepEqual(ranking.map((row) => row.petId), [pets[4].id, pets[3].id, pets[2].id, pets[1].id, pets[0].id]);
  assert.equal(ranking[0].stageLevel, 34);
  assert.equal(ranking[2].stageLevel, ranking[3].stageLevel);
  assert.ok(ranking[2].body > ranking[3].body);
});

test('배포 UI에는 체형도감 순위가 포인트·레벨 바로 뒤에 있고 제거한 두 게임의 화면·API 코드는 남지 않는다', async () => {
  const [app, worker] = await Promise.all([
    readFile(new URL('../public/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/worker.js', import.meta.url), 'utf8')
  ]);
  const pointsAt = app.indexOf('포인트 TOP 5');
  const levelAt = app.indexOf('레벨 TOP 5');
  const bodyAt = app.indexOf('체형도감 TOP 5');
  assert.ok(pointsAt >= 0 && pointsAt < levelAt && levelAt < bodyAt);
  for (const source of [app, worker]) assert.doesNotMatch(source, /davinci|spotDifference|spot-difference|spotdiff|다빈치|틀린그림/i);
});
