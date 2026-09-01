import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stateWithUsers } from './helpers.js';
import { createOmokRoom, joinOmokRoom, playOmokMove, omokView, requestOmokRematch, selectOmokColor, submitOmokRps } from '../src/game/omok.js';
import { processGameRankingSeason } from '../src/game/ranking-season.js';
import { seasonBadgeView, createPet } from '../src/game/engine.js';

const BASE = new Date('2026-08-10T00:00:00.000Z');

test('오목 마지막 착수 좌표를 서버가 저장하고 뷰로 전달하며 재대결 때 초기화한다', () => {
  const state = stateWithUsers([['u1','A'],['u2','B']], BASE);
  const a = state.pets[state.users.u1.currentPetId];
  const b = state.pets[state.users.u2.currentPetId];
  a.stats.points = 5000; b.stats.points = 5000;
  const created = createOmokRoom(state, a, 100, BASE);
  joinOmokRoom(state, b, created.roomId, BASE);
  assert.equal(submitOmokRps(state, a, created.roomId, 'rock', BASE).ok, true);
  assert.equal(submitOmokRps(state, b, created.roomId, 'scissors', new Date(BASE.getTime() + 1)).ok, true);
  assert.equal(selectOmokColor(state, a, created.roomId, 'black', new Date(BASE.getTime() + 2)).ok, true);
  const room = state.omok.rooms[created.roomId];
  const mover = state.pets[room.currentTurnPetId];
  const moved = playOmokMove(state, mover, room.id, 7, 7, 'last-move-1', new Date(BASE.getTime() + 1000));
  assert.equal(moved.ok, true);
  assert.deepEqual(room.lastMove && { row: room.lastMove.row, col: room.lastMove.col, color: room.lastMove.color, petId: room.lastMove.petId }, { row: 7, col: 7, color: room.blackPetId === mover.id ? 'black' : 'white', petId: mover.id });
  const view = omokView(state, a.id).rooms.find((item) => item.id === room.id);
  assert.equal(view.lastMove.row, 7);
  assert.equal(view.lastMove.col, 7);
});

test('시즌 1위는 다음 시즌 종료까지 왕 뱃지를 받는다', () => {
  const state = { pets: {}, gameRankingSeason: { key:'season-old', startsAt:'2026-08-04T15:00:00.000Z', endsAt:'2026-08-07T15:00:00.000Z', initializedAt:'2026-08-04T15:00:00.000Z', lastSettledAt:null } };
  const a = createPet({ id:'u1', nickname:'A' }, 1, BASE);
  const b = createPet({ id:'u2', nickname:'B' }, 1, BASE);
  a.records.appleBestScore = 3000; a.records.appleBestAt = '2026-08-08T00:00:00.000Z';
  b.records.appleBestScore = 2500; b.records.appleBestAt = '2026-08-08T00:00:01.000Z';
  a.records.omokWins = 3; a.records.omokLosses = 1;
  b.records.omokWins = 2; b.records.omokLosses = 0;
  a.records.blockBattleWins = 20; a.records.blockBattleLosses = 9;
  a.records.seasonBlockBattleWins = 4; a.records.seasonBlockBattleLosses = 1;
  state.pets[a.id] = a; state.pets[b.id] = b;
  const result = processGameRankingSeason(state, BASE);
  assert.equal(result.changed, true);
  const badges = seasonBadgeView(a, BASE).map((item) => item.label);
  assert.deepEqual(badges.sort(), ['⚫오목왕','🍎왕','🧱테트리스왕'].sort());
  assert.equal(a.records.seasonBlockBattleWins, 0);
  assert.equal(a.records.seasonBlockBattleLosses, 0);
  assert.equal(a.records.blockBattleWins, 20, '개인 누적 테트리스 승수는 시즌 초기화로 지우면 안 된다');
  assert.equal(a.records.blockBattleLosses, 9, '개인 누적 테트리스 패수는 시즌 초기화로 지우면 안 된다');
});

test('모바일 레이아웃과 5x5 영토 CSS 회귀', async () => {
  const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.territory-row\s*\{\s*grid-template-columns:\s*repeat\(5/);
  assert.match(css, /\.resident-grid\s*\{\s*grid-template-columns:\s*repeat\(5/);
  assert.match(css, /@media \(max-width:\s*520px\)[\s\S]*?\.resident-grid\s*\{\s*grid-template-columns:\s*repeat\(5/);
  assert.match(css, /\.ranking-section \.game-rank-grid\s*\{\s*grid-template-columns:repeat\(3/);
  assert.match(css, /\.ranking-section \.rank-tabs-grid\s*\{\s*grid-template-columns:repeat\(3/);
  assert.match(css, /\.daily-goals-compact \.goal-list\s*\{\s*grid-template-columns:\s*repeat\(5/);
});

test('프론트에는 마지막 수, 결과창, 1초 리액션, 터치 네비 보강 코드가 포함된다', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const worker = await readFile(new URL('../src/worker.js', import.meta.url), 'utf8');
  assert.match(app, /last-move-mark/);
  assert.match(app, /function openMiniResult/);
  assert.match(app, /function scheduleReactionReady/);
  assert.match(app, /bottomNav\?\.addEventListener\('click'/);
  assert.doesNotMatch(app, /lastTouchNavAt/);
  assert.doesNotMatch(app, /bottomNav\?\.addEventListener\('pointerup'/);
  assert.match(worker, /1초에 한 번/);
  assert.match(worker, /territory-stolen/);
  assert.match(worker, /omok-opponent/);
  assert.doesNotMatch(worker, /profile\/cosmetics\/buy|COSMETIC_SHOP/);
});
