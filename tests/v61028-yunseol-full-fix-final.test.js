import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { initialState } from '../src/durable-store.js';
import { createPet } from '../src/game/engine.js';
import { consumeInteractionHunger, lifeHungerCostsForBody } from '../src/game/activity.js';
import { withJosa } from '../src/lib/korean.js';
import { createBlockBattleRoom, joinBlockBattleRoom, playBlockBattleActions } from '../src/game/block-battle.js';
import { SICHUAN_THEME_KEYS, SICHUAN_THEMES } from '../src/game/sichuan.js';

const BASE = new Date('2026-09-24T01:00:00.000Z');
function addUser(state, id, nickname) {
  const user = { id, nickname, generation: 1, currentPetId: null, sessionVersion: 1, notifications: [], createdAt: BASE.toISOString(), lastSeenAt: BASE.toISOString() };
  const pet = createPet(user, 1, BASE);
  user.currentPetId = pet.id; state.users[id] = user; state.pets[pet.id] = pet; pet.stats.points = 100000;
  return { user, pet };
}

test('반복 콘텐츠 포만감은 몸집과 무관하게 1만 소모하고 생활행동 비용은 대폭 완화된다', () => {
  const state = initialState(BASE); const { pet } = addUser(state, 'food', '포만');
  pet.stats.body = 8750; pet.stats.hunger = 100;
  const result = consumeInteractionHunger(pet, BASE);
  assert.equal(result.cost, 1); assert.equal(pet.stats.hunger, 99);
  assert.deepEqual(lifeHungerCostsForBody(8750), { work: 7, rest: 4, exercise: 9 });
});

test('1대1 테트리스는 이전 piece의 늦은 hardDrop을 다음 블럭에 적용하지 않는다', () => {
  const state = initialState(BASE); const a = addUser(state, 'a', '테트A'); const b = addUser(state, 'b', '테트B');
  const made = createBlockBattleRoom(state, a.pet, 100, BASE); assert.equal(made.ok, true);
  assert.equal(joinBlockBattleRoom(state, b.pet, made.roomId, BASE).ok, true);
  const room = state.blockBattle.rooms[made.roomId]; const player = room.players[a.pet.id]; const oldPiece = player.pieces;
  const first = playBlockBattleActions(state, a.pet, room.id, { matchId: room.matchId, requestId: 'piece-1', actions: [{ action: 'hardDrop', piece: oldPiece, seq: 1 }] }, new Date(BASE.getTime()+100));
  assert.equal(first.ok, true); assert.equal(player.pieces, oldPiece + 1);
  const nextPieceCount = player.pieces;
  const stale = playBlockBattleActions(state, a.pet, room.id, { matchId: room.matchId, requestId: 'piece-stale', actions: [{ action: 'hardDrop', piece: oldPiece, seq: 2 }] }, new Date(BASE.getTime()+200));
  assert.equal(stale.ok, true); assert.equal(stale.discardedPieceActions, 1); assert.equal(player.pieces, nextPieceCount);
});

test('레고 표시명 조사는 받침에 맞춰 자연스럽게 붙는다', () => {
  assert.equal(withJosa('윤설레고', '이/가'), '윤설레고가');
  assert.equal(withJosa('윤설레고', '을/를'), '윤설레고를');
  assert.equal(withJosa('윤설레고', '과/와'), '윤설레고와');
  assert.equal(withJosa('윤설레고3', '이/가'), '윤설레고3이');
});

test('관계·벙 프로필 닫기 후 늦은 응답과 고스트 클릭이 프로필을 재오픈하지 못하도록 방어한다', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /app\.modalEpoch \+= 1;[\s\S]*app\.profileClickSuppressUntil = Date\.now\(\) \+ 750/);
  assert.match(app, /const modalEpochAtRequest = app\.modalEpoch;/);
  assert.match(app, /app\.modal && app\.modalEpoch === modalEpochAtRequest/);
  assert.match(app, /if \(action === 'profile'\) \{ if \(Date\.now\(\) < app\.profileClickSuppressUntil\) return;/);
});

test('블럭게임은 낮은 boardVersion이 최신 로컬 판을 덮어쓰지 못한다', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /blockGameAcceptedVersions: new Map\(\)/);
  assert.match(app, /incomingVersion < acceptedVersion/);
  assert.match(app, /const acceptedVersion = Math\.max\(previousVersion,[\s\S]*if \(incomingVersion < acceptedVersion\) app\.data\.activeMiniChallenge = previousBlockChallenge/);
});

test('사천성은 새 5테마와 새 SVG 100개만 사용한다', async () => {
  assert.deepEqual(SICHUAN_THEME_KEYS, ['neon','ocean','camp','music','space']);
  assert.deepEqual(Object.values(SICHUAN_THEMES).map((x)=>x.label), ['네온시티','바다탐험','캠핑데이','음악축제','우주연구소']);
  for (const key of SICHUAN_THEME_KEYS) {
    assert.equal(SICHUAN_THEMES[key].tiles.length, 20);
    const files = await readdir(new URL(`../public/sichuan/themes/${key}/`, import.meta.url));
    assert.equal(files.filter((x)=>x.endsWith('.svg')).length, 20);
  }
});
