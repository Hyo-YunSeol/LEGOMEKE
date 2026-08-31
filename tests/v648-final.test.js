import test from 'node:test';
import assert from 'node:assert/strict';
import { BODY_STAGES, TERRITORY_SIZE, TERRITORY_STEAL_COST } from '../src/game/constants.js';
import { createPet, socialAction, rankingsView } from '../src/game/engine.js';
import { appleHasMove, refreshAppleBoardIfStuck } from '../src/game/apple-game.js';
import { interactionHungerCostForBody, lifeHungerCostsForBody } from '../src/game/activity.js';

test('확정 체형 46단계와 신화편 확장',()=>{
  assert.equal(BODY_STAGES.length,46);
  assert.deepEqual(BODY_STAGES.slice(33).map(x=>x.label), ['레비아탄레고','베헤모스레고','펜리르레고','히드라레고','오로치레고','가루다레고','니드호그레고','요르문간드레고','아펩레고','아틀라스레고','수르트레고','티폰레고','신화재앙레고']);
  assert.equal(interactionHungerCostForBody(4520),6);
  assert.equal(interactionHungerCostForBody(8750),7);
  assert.equal(interactionHungerCostForBody(30000),7);
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

test('삭제된 번개반응 랭킹은 노출되지 않고 현재 사과게임 랭킹은 유지된다',()=>{
  const state={pets:{},users:{},relationships:{},pokes:{}};
  const a=createPet({id:'a',nickname:'A'},1),b=createPet({id:'b',nickname:'B'},1);
  a.records.seasonBestReactionMs=180; b.records.seasonBestReactionMs=220;
  a.records.appleBestScore=1800; a.records.appleBestAt='2026-08-09T00:00:00Z';
  b.records.appleBestScore=1500; b.records.appleBestAt='2026-08-09T00:00:01Z';
  state.pets[a.id]=a; state.pets[b.id]=b;
  const r=rankingsView(state,a.id);
  assert.equal(r.reaction, undefined);
  assert.equal(r.apple[0].score,1800);
});
