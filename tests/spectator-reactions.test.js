import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, register, authRequest } from './helpers.js';
import { createOmokRoom, joinOmokRoom, spectateOmokRoom } from '../src/game/omok.js';

async function jsonFetch(room, request) {
  const response = await room.fetch(request);
  return { response, data: await response.json() };
}

test('오목 참가자와 관전자는 공통 7종 공감을 보낼 수 있고 영구 상태에는 남지 않는다', async () => {
  const { room } = await createRoom();
  const tokenA = await register(room, '가나');
  const tokenB = await register(room, '다라');
  const tokenS = await register(room, '관전자');
  const state = await room.store.load();
  const pets = ['가나','다라','관전자'].map((name) => Object.values(state.pets).find((pet) => pet.displayName === `${name}레고`));
  const [a,b,spectator] = pets;
  for (const pet of pets) pet.stats.points = 5000;

  const created = createOmokRoom(state, a, 100);
  assert.equal(created.ok, true);
  assert.equal(joinOmokRoom(state, b, created.roomId).ok, true);
  assert.equal(spectateOmokRoom(state, spectator, created.roomId).ok, true);
  await room.store.save(state);
  const newsBefore = JSON.stringify(state.publicEvents);

  let result = await jsonFetch(room, authRequest(`/api/omok/rooms/${created.roomId}/reaction`, tokenS, { method:'POST', body: JSON.stringify({ type:'cringe' }) }));
  assert.equal(result.response.status, 200);
  assert.equal(result.data.reaction.emoji, '😬');
  assert.equal(result.data.reaction.label, '짜쳐요');

  result = await jsonFetch(room, authRequest('/api/bootstrap', tokenB));
  const roomView = result.data.bootstrap.omok.rooms.find((item) => item.id === created.roomId);
  assert.equal(roomView.reactions.some((item) => item.displayName === '관전자레고' && item.label === '짜쳐요'), true);

  result = await jsonFetch(room, authRequest(`/api/omok/rooms/${created.roomId}/reaction`, tokenA, { method:'POST', body: JSON.stringify({ type:'funny' }) }));
  assert.equal(result.response.status, 200, '플레이어도 공감 전송 가능');
  assert.equal(result.data.reaction.label, 'ㅋㅋ');
  result = await jsonFetch(room, authRequest(`/api/omok/rooms/${created.roomId}/reaction`, tokenS, { method:'POST', body: JSON.stringify({ type:'funny' }) }));
  assert.equal(result.response.status, 429, '1초 이내 연속 리액션 차단');
  assert.equal(JSON.stringify(state.publicEvents), newsBefore, '리액션은 레고방 소식에 남지 않는다');
  assert.equal(JSON.stringify(state).includes('짜쳐요'), false, '리액션은 영구 상태에 저장하지 않는다');
});
