import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, register, authRequest } from './helpers.js';
import { initialLiarGame, liarJoin, liarSpectate, liarStart, liarToggleReady } from '../src/game/liar-game.js';
import { createOmokRoom, joinOmokRoom, spectateOmokRoom } from '../src/game/omok.js';

async function jsonFetch(room, request) {
  const response = await room.fetch(request);
  return { response, data: await response.json() };
}

test('관전자만 5종 리액션을 보낼 수 있고 플레이어도 즉시 보지만 소식/저장 상태에는 남지 않는다', async () => {
  const { room } = await createRoom();
  const tokenA = await register(room, '가나');
  const tokenB = await register(room, '다라');
  const tokenC = await register(room, '마바');
  const tokenS = await register(room, '관전자');
  const state = await room.store.load();
  const pets = ['가나','다라','마바','관전자'].map((name) => Object.values(state.pets).find((pet) => pet.displayName === `${name}레고`));
  const [a,b,c,spectator] = pets;
  for (const pet of pets) pet.stats.points = 5000;

  state.liarGame = initialLiarGame();
  for (const pet of [a,b,c]) { liarJoin(state, pet); liarToggleReady(state, pet); }
  const oldRandom = Math.random;
  try { Math.random = () => 0; liarStart(state, a); } finally { Math.random = oldRandom; }
  liarSpectate(state, spectator);
  await room.store.save(state);

  const newsBefore = JSON.stringify(state.publicEvents);
  let result = await jsonFetch(room, authRequest('/api/liar/reaction', tokenS, { method:'POST', body: JSON.stringify({ type:'cringe' }) }));
  assert.equal(result.response.status, 200);
  assert.equal(result.data.reaction.emoji, '🥵');
  assert.equal(result.data.reaction.label, '짜쳐요');
  assert.equal(result.data.bootstrap.liarGame.reactions.some((item) => item.label === '짜쳐요'), true);

  result = await jsonFetch(room, authRequest('/api/bootstrap', tokenA));
  assert.equal(result.data.bootstrap.liarGame.reactions.some((item) => item.displayName === '관전자레고' && item.label === '짜쳐요'), true, '플레이어도 관전자 리액션을 본다');

  result = await jsonFetch(room, authRequest('/api/liar/reaction', tokenA, { method:'POST', body: JSON.stringify({ type:'funny' }) }));
  assert.equal(result.response.status, 403, '플레이어는 리액션 전송 불가');
  result = await jsonFetch(room, authRequest('/api/liar/reaction', tokenS, { method:'POST', body: JSON.stringify({ type:'funny' }) }));
  assert.equal(result.response.status, 429, '1초 이내 연속 리액션 차단');
  assert.equal(JSON.stringify(state.publicEvents), newsBefore, '리액션은 레고방 소식에 남지 않는다');
  assert.equal(JSON.stringify(state).includes('짜쳐요'), false, '리액션은 영구 상태에 저장하지 않는다');

  const created = createOmokRoom(state, a, 100);
  assert.equal(created.ok, true);
  assert.equal(joinOmokRoom(state, b, created.roomId).ok, true);
  assert.equal(spectateOmokRoom(state, spectator, created.roomId).ok, true);
  await room.store.save(state);

  result = await jsonFetch(room, authRequest(`/api/omok/rooms/${created.roomId}/reaction`, tokenS, { method:'POST', body: JSON.stringify({ type:'funny' }) }));
  assert.equal(result.response.status, 200);
  assert.equal(result.data.reaction.emoji, '😂');
  result = await jsonFetch(room, authRequest('/api/bootstrap', tokenB));
  const roomView = result.data.bootstrap.omok.rooms.find((item) => item.id === created.roomId);
  assert.equal(roomView.reactions.some((item) => item.displayName === '관전자레고' && item.label === '웃겨요'), true);
});
