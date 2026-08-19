import test from 'node:test';
import assert from 'node:assert/strict';
import { BODY_STAGES, TERRITORY_SIZE, TERRITORY_STEAL_COST } from '../src/game/constants.js';
import { createPet, socialAction, rankingsView } from '../src/game/engine.js';
import { appleHasMove, refreshAppleBoardIfStuck } from '../src/game/apple-game.js';
import { interactionHungerCostForBody, lifeHungerCostsForBody } from '../src/game/activity.js';

test('확정 체형 34단계와 해양 초거대 생물 확장',()=>{
  assert.equal(BODY_STAGES.length,34);
  assert.deepEqual(BODY_STAGES.slice(-7).map(x=>x.label), ['아르헨티노사우루스레고','대왕고래레고','초거대고래레고','심해괴수레고','크라켄레고','심해재난레고','레비아탄레고']);
  assert.equal(interactionHungerCostForBody(4520),6);
  assert.equal(interactionHungerCostForBody(8750),7);
  assert.deepEqual(lifeHungerCostsForBody(4520),{work:15,rest:7,exercise:20});
  assert.deepEqual(lifeHungerCostsForBody(8750),{work:16,rest:8,exercise:22});
});

test('파손 시스템 제거와 영토 5x5/탈취비',()=>{ assert.equal(TERRITORY_SIZE,5); assert.equal(TERRITORY_STEAL_COST,50); });

test('사과 막힘 감지 후 새 판 생성',()=>{
  const c={appleBoard:Array.from({length:10},()=>Array(10).fill(null)),applePendingPoints:0,appleScore:0,appleRemovedCount:0,appleSuccesses:0,appleProcessedRequestIds:[]};
  assert.equal(appleHasMove(c),false);
  assert.equal(refreshAppleBoardIfStuck(c,()=>0),true);
  assert.equal(c.appleBoardsGenerated,2);
  assert.equal(c.appleBoard[0][0],1);
});

test('교미 궁합은 1~100',()=>{
  const state={pets:{},requests:{},relationships:{},publicEvents:[],users:{}};
  const a=createPet({id:'a',nickname:'A'},1),b=createPet({id:'b',nickname:'B'},1); state.pets[a.id]=a;state.pets[b.id]=b;
  socialAction(state,a,b,'requestMating',{},new Date()); const request=Object.values(state.requests)[0];
  const old=Math.random; Math.random=()=>0; try { const r=socialAction(state,b,a,'acceptMating',{requestId:request.id},new Date()); assert.equal(r.compatibility,1); } finally {Math.random=old;}
});

test('번개반응 시즌 랭킹은 낮은 초수가 우선',()=>{
  const state={pets:{},users:{},relationships:{},pokes:{}};
  const a=createPet({id:'a',nickname:'A'},1),b=createPet({id:'b',nickname:'B'},1);
  a.records.seasonBestReactionMs=180;a.records.seasonBestReactionAt='2026-08-09T00:00:00Z';b.records.seasonBestReactionMs=220;b.records.seasonBestReactionAt='2026-08-09T00:00:01Z';state.pets[a.id]=a;state.pets[b.id]=b;
  const r=rankingsView(state,a.id); assert.equal(r.reaction[0].ms,180);
});
