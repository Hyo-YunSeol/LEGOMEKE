import test from 'node:test';
import assert from 'node:assert/strict';
import { stateWithUsers, createRoom, register, authRequest, responseJson } from './helpers.js';
import { calculateYutMove, createYutRoom, joinYutRoom, leaveYutRoom, startYutRoom, actionYut, yutMoves } from '../src/game/yutnori.js';
import { startMiniGame, checkpointForestRun, finishForestRun, settleExpiredMiniGames } from '../src/game/engine.js';
import { verifyForestReplay, forestPayout, FOREST_MAX_TICKS, FOREST_SESSION_MS } from '../src/game/forest-run.js';

const start = new Date('2026-10-29T00:00:00.000Z');
const later = milliseconds => new Date(start.getTime() + milliseconds);
const yutPiece = (position, route='outer', path=['start',position]) => ({id:'unit:0',owner:'unit',position,route,path,finished:false});
const setup = (count=2, mode='solo') => {
  const state=stateWithUsers(Array.from({length:count},(_,i)=>['user'+i,'플레이어'+i]),start),pets=Object.values(state.pets);
  const create=createYutRoom(state,pets[0],{mode,seats:count},start);
  assert.equal(create.ok,true);
  for(const pet of pets.slice(1))assert.equal(joinYutRoom(state,pet,create.roomId).ok,true);
  assert.equal(startYutRoom(state,pets[0],create.roomId,start,()=>0).ok,true);
  return {state,pets,room:state.yut.rooms[create.roomId]};
};

test('윷놀이 분기점은 반드시 지름길, 순서 차이, 골인 칸 뒤 한 번 더 이동',()=>{
  assert.equal(calculateYutMove(yutPiece('4'),1).position,'a1');
  assert.equal(calculateYutMove(yutPiece('9'),1).position,'b1');
  assert.equal(calculateYutMove(yutPiece('center','a'),1).position,'a4');
  assert.equal(calculateYutMove(yutPiece('center','b'),1).position,'b4');
  const piece = yutPiece('start','outer',['start']);
  const moThenDo=calculateYutMove(calculateYutMove(piece,5),1);
  const doThenMo=calculateYutMove(calculateYutMove(piece,1),5);
  assert.equal(moThenDo.position,'a1');assert.equal(doThenMo.position,'5');
  const before=calculateYutMove(yutPiece('18'),1);
  assert.equal(before.position,'19');assert.equal(before.finished,false);
  const after=calculateYutMove(before,1);
  assert.equal(after.position,'home');assert.equal(after.finished,true);
  assert.equal(calculateYutMove(yutPiece('0'),-1).position,'19');
});

test('윷놀이 0번 칸의 빽도는 19번 칸의 적을 잡고 추가 던지기',()=>{
  const {state,pets,room}=setup();const actor=pets[room.currentIndex];
  const own=room.pieces.find(p=>p.owner===actor.id);
  const enemy=room.pieces.find(p=>p.owner!==actor.id);
  own.position='0';own.path=['start','0'];enemy.position='19';enemy.path=['start','18','19'];
  room.phase='move';room.pending=[{name:'빽도',steps:-1}];
  const allowed=yutMoves(room).find(m=>m.pieceId===own.id);
  assert.equal(allowed.to,'19');
  const result=actionYut(state,actor,room.id,{type:'move',...allowed},later(1000));
  assert.equal(result.ok,true);assert.equal(own.position,'19');assert.equal(enemy.position,'start');assert.equal(room.phase,'throw');
});

test('윷놀이 2:2 팀은 대기실 퇴장과 재참여 후에도 2:2 균형',()=>{
  const state=stateWithUsers(Array.from({length:5},(_,i)=>['user'+i,'참가'+i]),start),pets=Object.values(state.pets);
  const {roomId}=createYutRoom(state,pets[0],{mode:'team'},start);
  for(const p of pets.slice(1,3))assert.equal(joinYutRoom(state,p,roomId).ok,true);
  assert.equal(leaveYutRoom(state,pets[0],roomId,start).ok,true);
  for(const p of pets.slice(3))assert.equal(joinYutRoom(state,p,roomId).ok,true);
  assert.deepEqual(state.yut.rooms[roomId].players.map(x=>x.team),[0,1,0,1]);
});

test('윷놀이 던지기 요청도 같은 판 revision/ID 재전송을 거부',()=>{
  const {state,pets,room}=setup(),actor=pets[room.currentIndex];
  const input={type:'throw',expectedRevision:room.revision,requestId:'roll-1'};
  assert.equal(actionYut(state,actor,room.id,input,later(1000),()=>.9).ok,true);
  const original=room.pending.map(x=>x.name);
  assert.equal(actionYut(state,actor,room.id,input,later(1001),()=>.9).ok,false);
  assert.deepEqual(room.pending.map(x=>x.name),original);
});

test('FOREST RUN 100점 1P, 최대 500P, 잘못된 입력·전투시간 차단',()=>{
  assert.equal(forestPayout(99),0);assert.equal(forestPayout(100),1);
  assert.equal(forestPayout(999),9);assert.equal(forestPayout(50000),500);assert.equal(forestPayout(1000000),500);
  assert.equal(FOREST_MAX_TICKS,18000);assert.equal(FOREST_SESSION_MS,900000);
  assert.deepEqual(verifyForestReplay(123456789,567,[]),{score:200,kills:2,round:1,dead:false,state:'arrowChoice',combatTicks:567});
  assert.throws(()=>verifyForestReplay(123456789,18001,[]));
  assert.throws(()=>verifyForestReplay(123456789,80,[[40,'x',99999]]));
  assert.throws(()=>verifyForestReplay(123456789,120,[[30,'bogus',1]]));
});

test('FOREST RUN 종료는 서버 재계산 점수만 인정, 1회 정산 및 1회 이용 차감',()=>{
  const state=stateWithUsers([['u1','숲테스터']],start),pet=Object.values(state.pets)[0];
  const before=pet.stats.points,usage=pet.daily.miniGamesPlayed;
  const result=startMiniGame(state,pet,'forestRun',start);
  assert.equal(result.ok,true,result.message);assert.equal(pet.daily.miniGamesPlayed,usage+1);
  const c=state.miniGameChallenges[result.challenge.id];c.forestSeed=123456789;
  assert.equal(finishForestRun(state,pet,c.id,{ticks:567,events:[],reason:'exit',clientScore:99999999},later(5000)).ok,false,'5초 안에 19초 분량의 기록을 제출할 수 없음');
  assert.equal(pet.stats.points,before);
  assert.equal(finishForestRun(state,pet,c.id,{ticks:567,events:[],reason:'death'},later(25000)).ok,false,'살아있는 기록을 사망했다고 신고할 수 없음');
  const finished=finishForestRun(state,pet,c.id,{ticks:567,events:[],reason:'exit',clientScore:99999999},later(25000));
  assert.equal(finished.ok,true,finished.message);assert.equal(finished.reward,2);assert.equal(finished.verifiedScore,200);assert.equal(pet.stats.points,before+2);
  const repeat=finishForestRun(state,pet,c.id,{ticks:567,events:[],reason:'exit'},later(26000));
  assert.equal(repeat.ok,true);assert.equal(repeat.duplicate,true);assert.equal(pet.stats.points,before+2);
});

test('FOREST RUN 서버 저장 기록으로 접속 끊김 정산, 세션 만료도 자동 정산',()=>{
  const state=stateWithUsers([['u1','복구테스터']],start),pet=Object.values(state.pets)[0];
  const first=startMiniGame(state,pet,'forestRun',start),c=state.miniGameChallenges[first.challenge.id];
  c.forestSeed=123456789;
  const saved=checkpointForestRun(state,pet,c.id,{ticks:500,events:[]},later(20000));
  assert.equal(saved.ok,true,saved.message);
  const reward=finishForestRun(state,pet,c.id,{reason:'recover',ticks:0,events:[],clientScore:99999999},later(21000));
  assert.equal(reward.ok,true,reward.message);assert.equal(reward.verifiedScore,verifyForestReplay(123456789,500,[]).score);
  const next=startMiniGame(state,pet,'forestRun',later(30000)),c2=state.miniGameChallenges[next.challenge.id];
  c2.forestSeed=123456789;
  assert.equal(checkpointForestRun(state,pet,c2.id,{ticks:500,events:[]},later(50000)).ok,true);
  assert.equal(settleExpiredMiniGames(state,later(FOREST_SESSION_MS+31000)).changed,true);
  assert.equal(c2.completed,true);assert.equal(c2.reward,forestPayout(verifyForestReplay(123456789,500,[]).score));
});

test('실제 Worker: FOREST RUN 시작·인증 점수 무시·중복 정산 보호',async()=>{
  const {room}=await createRoom(),token=await register(room,'숲게임API');
  const post=async(path,body)=>responseJson(await room.fetch(authRequest(path,token,{method:'POST',body:JSON.stringify(body)})));
  const {data:started}=await post('/api/minigames/start',{gameId:'forestRun'});
  assert.equal(started.ok,true,started.message);assert.equal(started.challenge.gameId,'forestRun');
  const proof={challengeId:started.challenge.id,ticks:0,events:[],reason:'exit',clientScore:99999999};
  const {data:finished}=await post('/api/minigames/forest/finish',proof);
  assert.equal(finished.ok,true,finished.message);assert.equal(finished.reward,0);assert.equal(finished.verifiedScore,0);
  const {data:again}=await post('/api/minigames/forest/finish',proof);
  assert.equal(again.ok,true);assert.equal(again.duplicate,true);assert.equal(again.reward,0);
  const {data:after}=await post('/api/minigames/start',{gameId:'forestRun'});
  assert.equal(after.ok,true,after.message);
});
