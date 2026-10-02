import test from 'node:test';
import assert from 'node:assert/strict';
import { stateWithUsers } from './helpers.js';
import { recordBlockKingScore, blockKingRows } from '../src/game/block-ranking.js';
import { processGameRankingSeason } from '../src/game/ranking-season.js';
const date=new Date('2026-10-02T04:00:00.000Z');

test('블럭왕은 단판 최고 점수, 제거한 수, 선택 횟수, 최초 기록 순으로 정렬합니다',()=>{
 const state=stateWithUsers([['aa','가'],['bb','나'],['cc','다']],date);
 const [a,b,c]=Object.values(state.pets);
 assert.equal(recordBlockKingScore(a,280,65,30,date),true);
 assert.equal(recordBlockKingScore(a,100,99,1,date),false);
 assert.equal(recordBlockKingScore(b,280,66,40,date),true);
 assert.equal(recordBlockKingScore(c,280,66,35,date),true);
 assert.deepEqual(blockKingRows(state).map(x=>x.pet.id),[c.id,b.id,a.id]);
 assert.equal(recordBlockKingScore(a,300,50,70,date),true);
 assert.equal(blockKingRows(state)[0].pet.id,a.id);
});

test('블럭왕은 3일 시즌 정산 시 TOP 3에 한 번만 보상하고 기록은 초기화합니다',()=>{
 const state=stateWithUsers([['aa','가'],['bb','나'],['cc','다']],date);
 const [a,b,c]=Object.values(state.pets);
 for(const p of [a,b,c])p.stats.points=0;
 recordBlockKingScore(a,300,65,40,date);
 recordBlockKingScore(b,250,50,35,date);
 recordBlockKingScore(c,200,40,32,date);
 state.gameRankingSeason={key:'season-1',startsAt:'1970-01-04T15:00:00.000Z',endsAt:'1970-01-07T15:00:00.000Z',initializedAt:'1970-01-04T15:00:00.000Z',lastSettledAt:null};
 const done=processGameRankingSeason(state,date);
 assert.equal(done.changed,true);
 assert.deepEqual([a,b,c].map(p=>p.stats.points),[1000,500,300]);
 assert.deepEqual(done.awards.blockKing.map(x=>x.petId),[a.id,b.id,c.id]);
 assert.equal(a.kingHistory.blockKing,true);
 assert.equal(a.records.seasonBlockKingBestScore,0);
 assert.equal(processGameRankingSeason(state,date).changed,false);
 assert.deepEqual([a,b,c].map(p=>p.stats.points),[1000,500,300]);
});

test('실제 블럭게임 정상 종료만 블럭왕에 등록되며 재전송은 기록을 늘리지 않습니다',async()=>{
 const {startMiniGame,selectBlockGame,stopMiniGame}=await import('../src/game/engine.js');
 const state=stateWithUsers([['player','도전자']],date);
 const pet=Object.values(state.pets)[0];pet.stats.hunger=100;
 const started=startMiniGame(state,pet,'block',date);assert.equal(started.ok,true);
 const challenge=state.miniGameChallenges[started.challenge.id];
 challenge.blockBoard=Array.from({length:12},()=>Array(10).fill(null));
 challenge.blockBoard[11][0]=1;challenge.blockBoard[11][1]=1;
 const finished=selectBlockGame(state,pet,challenge.id,{row:11,col:0,boardVersion:challenge.blockBoardVersion},'block-king-normal-001',date);
 assert.equal(finished.ok,true);assert.equal(finished.finished,true);
 assert.equal(pet.records.seasonBlockKingBestScore,finished.reward);
 assert.equal(pet.records.seasonBlockKingBestRemoved,2);
 const replay=selectBlockGame(state,pet,challenge.id,{row:11,col:0,boardVersion:1},'block-king-normal-001',date);
 assert.equal(replay.replayed,true);assert.equal(pet.records.seasonBlockKingBestScore,finished.reward);
 const second=startMiniGame(state,pet,'block',new Date(date.getTime()+1000));assert.equal(second.ok,true);
 const abandoned=stopMiniGame(state,pet,second.challenge.id,new Date(date.getTime()+2000));
 assert.equal(abandoned.ok,true);assert.equal(pet.records.seasonBlockKingBestScore,finished.reward);
});
