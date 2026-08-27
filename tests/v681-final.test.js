import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  blockBattleView, createBlockBattleRoom, joinBlockBattleRoom, playBlockBattleActions
} from '../src/game/block-battle.js';
import { stateWithUsers } from './helpers.js';

const NOW = new Date('2026-08-11T14:00:00.000Z');

function battleState() {
  const state = stateWithUsers([['host-user', '테트리스방장'], ['guest-user', '테트리스손님']], NOW);
  const host = state.pets[state.users['host-user'].currentPetId];
  const guest = state.pets[state.users['guest-user'].currentPetId];
  host.stats.points = 1_000;
  guest.stats.points = 1_000;
  const created = createBlockBattleRoom(state, host, 100, NOW);
  joinBlockBattleRoom(state, guest, created.roomId, NOW);
  return { state, host, guest, room: state.blockBattle.rooms[created.roomId] };
}

test('테트리스대전 입력 상태 버전과 마지막 요청 확인값은 서버에서 단조 증가한다', () => {
  const { state, host, guest, room } = battleState();
  const initialVersion = room.stateVersion;
  const first = playBlockBattleActions(state, host, room.id, {
    matchId: room.matchId, requestId: 'host-left-0001', actions: ['left']
  }, new Date(NOW.getTime() + 100));
  assert.equal(first.ok, true);
  assert.ok(room.stateVersion > initialVersion);
  assert.equal(room.lastProcessedBatchByPet[host.id], 'host-left-0001');
  const hostView = blockBattleView(state, host.id, NOW).rooms[0];
  const guestView = blockBattleView(state, guest.id, NOW).rooms[0];
  assert.equal(hostView.lastProcessedRequestId, 'host-left-0001');
  assert.equal(guestView.lastProcessedRequestId, null, '상대의 요청 ID는 공개하면 안 된다');

  const versionAfterFirst = room.stateVersion;
  const duplicate = playBlockBattleActions(state, host, room.id, {
    matchId: room.matchId, requestId: 'host-left-0001', actions: ['left']
  }, new Date(NOW.getTime() + 200));
  assert.equal(duplicate.duplicate, true);
  assert.equal(room.stateVersion, versionAfterFirst, '같은 요청 재전송은 상태 버전을 다시 올리면 안 된다');
});

test('사용자 화면 명칭은 테트리스대전으로 통일하고 내부 저장 키는 호환성을 유지한다', async () => {
  const [app, worker, battle, progression, manifest] = await Promise.all([
    readFile(new URL('../public/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/worker.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/game/block-battle.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/game/progression.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8')
  ]);
  const visibleSources = `${app}\n${worker}\n${battle}\n${progression}\n${manifest}`;
  assert.doesNotMatch(visibleSources, /블럭대전|블록대전/);
  assert.match(visibleSources, /테트리스대전/);
  assert.match(app, /blockBattle/);
  assert.match(battle, /state\.blockBattle/);
});

test('블록게임 클릭은 판 전체를 재생성하거나 반투명 처리하지 않고 부분 갱신한다', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /renderMode: 'block', preserveControls: true, toastResult: false/);
  assert.match(app, /function refreshBlockMiniOnly/);
  assert.match(app, /current\?\.replaceWith\(template\.content\.firstElementChild\)/);
});
