import test from 'node:test';
import assert from 'node:assert/strict';
import { initialLiarGame, liarAddChat, liarGameView, liarJoin, liarSpectate, liarStart, liarToggleReady, liarVote } from '../src/game/liar-game.js';
import { stateWithUsers } from './helpers.js';

const BASE = new Date('2026-08-07T07:00:00.000Z');

test('라이어 관전자는 플레이어 수에 포함되지 않고 비밀정보를 받지 않는다', () => {
  const state = stateWithUsers([['u1','A'],['u2','B'],['u3','C'],['u4','관전자']], BASE);
  const pets = ['u1','u2','u3','u4'].map((u) => state.pets[state.users[u].currentPetId]);
  state.liarGame = initialLiarGame();
  for (const pet of pets) pet.stats.points = 100;
  for (const pet of pets.slice(0,3)) { liarJoin(state, pet, BASE); liarToggleReady(state, pet, BASE); }
  const original = Math.random;
  Math.random = () => 0;
  try { assert.equal(liarStart(state, pets[0], BASE).ok, true); } finally { Math.random = original; }
  const beforePlayers = Object.keys(state.liarGame.players).length;
  assert.equal(liarSpectate(state, pets[3], BASE).ok, true);
  assert.equal(Object.keys(state.liarGame.players).length, beforePlayers);
  const view = liarGameView(state, pets[3].id);
  assert.equal(view.spectating, true);
  assert.equal(view.joined, false);
  assert.equal(view.word, null);
  assert.equal(view.category, null);
  assert.equal(view.liarPetId, null);
  assert.equal(view.voteCandidateIds.length, 0);
  assert.equal(liarVote(state, pets[3], pets[0].id, BASE).ok, false);
  assert.equal(liarAddChat(state, pets[3], '관전자 채팅', BASE).ok, false);
});

test('관전자에게 게임 종료 전 서버 시스템 메시지의 제시어/라이어 정보가 전달되지 않는다', () => {
  const state = stateWithUsers([['u1','A'],['u2','B'],['u3','C'],['u4','관전자']], BASE);
  const pets = ['u1','u2','u3','u4'].map((u) => state.pets[state.users[u].currentPetId]);
  state.liarGame = initialLiarGame();
  for (const pet of pets) pet.stats.points = 100;
  for (const pet of pets.slice(0,3)) { liarJoin(state, pet, BASE); liarToggleReady(state, pet, BASE); }
  const original = Math.random;
  Math.random = () => 0;
  try { liarStart(state, pets[0], BASE); } finally { Math.random = original; }
  state.liarGame.messages.push({ id:'secret-system', type:'system', text:`제시어 ${state.liarGame.word} 라이어 ${state.liarGame.players[state.liarGame.liarPetId].displayName}`, createdAt:BASE.toISOString() });
  liarSpectate(state, pets[3], BASE);
  const view = liarGameView(state, pets[3].id);
  assert.equal(view.messages.some((message) => message.id === 'secret-system'), false);
  assert.equal(JSON.stringify(view).includes(state.liarGame.word), false);
});
