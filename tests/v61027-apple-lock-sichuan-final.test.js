import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stateWithUsers } from './helpers.js';
import { gameDayKey } from '../src/lib/time.js';
import {
  SICHUAN_THEME_KEYS, SICHUAN_THEMES, SICHUAN_STREAK_PENALTY_MS,
  createSichuanRoom, joinSichuanRoom, playSichuanPair, canConnectSichuan, sichuanRoomView
} from '../src/game/sichuan.js';

const BASE = new Date('2026-09-09T10:00:00.000Z');
const at = (seconds = 0) => new Date(BASE.getTime() + seconds * 1000);

function setupPenalty(streak = 3) {
  const state = stateWithUsers([['a','연승A'],['b','상대B']], BASE);
  const [host, guest] = Object.values(state.pets);
  host.stats.points = guest.stats.points = 10000;
  host.daily.sichuanStreakDayKey = gameDayKey(at(1));
  host.daily.sichuanWinStreak = streak;
  const made = createSichuanRoom(state, host, 100, at(0));
  assert.equal(made.ok, true);
  const joined = joinSichuanRoom(state, guest, made.roomId, at(1));
  assert.equal(joined.ok, true, joined.message);
  return { state, host, guest, room: state.sichuan.rooms[made.roomId] };
}

test('사천성은 5개 테마를 동일 20개 타일 ID로 제공한다', () => {
  assert.deepEqual(SICHUAN_THEME_KEYS, ['life','nature','fantasy','sea','tech']);
  assert.equal(Object.keys(SICHUAN_THEMES).length, 5);
  const ids = SICHUAN_THEMES.life.tiles.map((tile) => tile.id);
  for (const theme of Object.values(SICHUAN_THEMES)) assert.deepEqual(theme.tiles.map((tile) => tile.id), ids);
});

test('사천성 3연승 이상은 시작 10초간 본인 패 입력을 서버에서 거부하고 이후 허용한다', () => {
  const { state, host, room } = setupPenalty(3);
  const view = sichuanRoomView(state, room.id, host.id, at(2));
  assert.equal(view.startWinStreaks[host.id], 3);
  assert.equal(new Date(view.streakPenaltyUntil[host.id]).getTime(), at(1).getTime() + SICHUAN_STREAK_PENALTY_MS);

  let pair = null;
  for (let a = 0; a < 80 && !pair; a += 1) {
    for (let b = a + 1; b < 80; b += 1) if (canConnectSichuan(room.players[host.id].board, a, b)) { pair = [a,b]; break; }
  }
  assert.ok(pair);
  const blocked = playSichuanPair(state, host, room.id, { matchId: room.matchId, first: pair[0], second: pair[1], actionId: 'penalty-blocked' }, at(5));
  assert.equal(blocked.ok, false);
  assert.equal(blocked.penalty, true);
  assert.equal(room.players[host.id].removedCount, 0);

  const allowed = playSichuanPair(state, host, room.id, { matchId: room.matchId, first: pair[0], second: pair[1], actionId: 'penalty-allowed' }, at(12));
  assert.equal(allowed.ok, true);
  assert.equal(allowed.removed, true);
});

test('사천성 연승은 다음 6시간 gameDayKey로 넘어가면 패널티 없이 0으로 정규화된다', () => {
  const later = new Date(BASE.getTime() + 6 * 60 * 60 * 1000 + 1000);
  const state = stateWithUsers([['a','이전연승'],['b','새상대']], BASE);
  const [host, guest] = Object.values(state.pets);
  host.stats.points = guest.stats.points = 10000;
  host.daily.sichuanStreakDayKey = gameDayKey(BASE);
  host.daily.sichuanWinStreak = 8;
  const made = createSichuanRoom(state, host, 100, later);
  assert.equal(joinSichuanRoom(state, guest, made.roomId, later).ok, true);
  const room = state.sichuan.rooms[made.roomId];
  assert.equal(room.startWinStreaks[host.id], 0);
  assert.equal(room.streakPenaltyUntil[host.id], null);
});

test('사과게임은 진행 선택에 전역 perform/bootstrap self-refresh를 쓰지 않고 전용 입력 큐를 사용한다', async () => {
  const [app, worker] = await Promise.all([
    readFile(new URL('../public/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/worker.js', import.meta.url), 'utf8')
  ]);
  assert.match(app, /function drainAppleInputQueue\(\)/);
  assert.match(app, /applyAppleOptimisticSelection/);
  assert.match(app, /overlayApplePendingSelections/);
  assert.match(worker, /\/api\/minigames\/apple\/select[\s\S]{0,500}mutateForUserLight/);
  const selectRoute = worker.slice(worker.indexOf("pathname === '/api/minigames/apple/select'"), worker.indexOf("pathname === '/api/minigames/apple/new-board'"));
  assert.doesNotMatch(selectRoute, /broadcastRefresh\('apple'/);
});

test('1대1 테트리스는 hardDrop/rotate 중요 입력을 서버 최대 미확정 24개까지 보존한다', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /BLOCK_BATTLE_MAX_IMPORTANT_UNCONFIRMED_ACTIONS = 24/);
  assert.match(app, /importantAction = action === 'hardDrop' \|\| action === 'rotate'/);
});
