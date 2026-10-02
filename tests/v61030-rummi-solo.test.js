import test from 'node:test';
import assert from 'node:assert/strict';
import { stateWithUsers } from './helpers.js';
import { createRummikubRoom, joinRummikubRoom, startRummikubRoom, rummikubAction, rummikubDeck, rummikubGroupValue, rummikubRoomView, spectateRummikubRoom, processRummikubTimers, leaveRummikubRoom, rummikubRanking } from '../src/game/rummikub.js';
import { startMiniGame, playSoloLegodoku, settleExpiredMiniGames, miniChallengeView } from '../src/game/engine.js';
import { RUMMI_MATCH_MS, RUMMI_TURN_MS } from '../src/game/rummikub.js';
const date=new Date('2026-10-02T03:00:00.000Z');
const at=ms=>new Date(date.getTime()+ms);
function setup(n=4){
 const state=stateWithUsers(Array.from({length:n+1},(_,i)=>[`member${i}`,`레고${i}`]),date);
 const all=Object.values(state.pets);for(const p of all){p.stats.points=10000;p.stats.hunger=100;}
 const ps=all.slice(0,n);const watcher=all[n];
 const created=createRummikubRoom(state,ps[0],100,date);assert.equal(created.ok,true,created.message);
 for(const p of ps.slice(1))assert.equal(joinRummikubRoom(state,p,created.roomId,date).ok,true);
 assert.equal(startRummikubRoom(state,ps[0],created.roomId,date,()=>.4).ok,true);
 return {state,ps,watcher,room:state.rummikub.rooms[created.roomId],roomId:created.roomId};
}
test('루미큐브 덱은 106개 고유 패, 조합은 숫자/색 연속, 첫 등록과 각 인원 비공개',()=>{
 const deck=rummikubDeck(()=>.3);assert.equal(deck.length,106);assert.equal(new Set(deck.map(t=>t.id)).size,106);
 assert.equal(rummikubGroupValue(deck.filter(t=>t.color==='red'&&[10,11,12].includes(t.num)).slice(0,3)),33);
 assert.equal(rummikubGroupValue(deck.filter(t=>t.num===4).slice(0,4)),null); // 중복 색 두 세트는 유효하지 않음
 const {state,ps,watcher,room,roomId}=setup();
 assert.equal(room.players.length,4);assert.equal(room.deck.length,50);
 assert.equal(ps.every(p=>p.stats.hunger===90),true);
 assert.equal(spectateRummikubRoom(state,watcher,roomId).ok,true);
 const spectator=rummikubRoomView(state,room,watcher.id);assert.equal(spectator.role,'spectator');assert.equal(spectator.players.every(p=>p.rack===undefined),true);
 const me=rummikubRoomView(state,room,ps[0].id);assert.equal(me.players.filter(p=>Array.isArray(p.rack)).length,1);
});
test('루미큐브 첫 등록은 남의 기존 조합을 보존하고 본인 30점 이상만 등록한다',()=>{
 const {state,ps,room,roomId}=setup(2);
 const current=room.players[room.currentIndex];const pet=ps.find(p=>p.id===current.petId);
 const extract=(color,num)=>{
  for(const source of [room.deck,...room.players.map(p=>p.rack)]){const idx=source.findIndex(t=>t.color===color&&t.num===num);if(idx>=0)return source.splice(idx,1)[0];}
  throw Error('대상 패를 찾을 수 없습니다');
 };
 const existing=[1,2,3].map(n=>extract('blue',n));room.table=[existing];
 const fresh=[10,11,12].map(n=>extract('red',n));current.rack.push(...fresh);
 const rack=current.rack.filter(t=>!fresh.includes(t)).map(t=>t.id);
 const invalid=rummikubAction(state,pet,roomId,{action:'commit',turnSeq:room.turnSeq,groups:[fresh.map(t=>t.id)],rack,requestId:'invalid'},at(1000));
 assert.equal(invalid.ok,false);assert.match(invalid.message,/바닥|패|기존 조합/);
 const valid=rummikubAction(state,pet,roomId,{action:'commit',turnSeq:room.turnSeq,groups:[existing.map(t=>t.id),fresh.map(t=>t.id)],rack,requestId:'valid'},at(1000));
 assert.equal(valid.ok,true,valid.message);assert.equal(current.registered,true);assert.equal(room.table.length,2);
 const repeat=rummikubAction(state,pet,roomId,{action:'commit',turnSeq:room.turnSeq-1,groups:[],rack:[],requestId:'valid'},at(1100));
 assert.equal(repeat.ok,true);assert.equal(repeat.duplicate,true);
});
test('루미큐브 턴 시간과 3회 미활동 기권은 다른 참가자의 경기와 정산을 보존',()=>{
 const {state,ps,room,roomId}=setup(2);
 const before=ps.map(p=>p.stats.points);assert.deepEqual(before,[9900,9900]);
 for(let i=0;i<4&&state.rummikub.rooms[roomId];i++)processRummikubTimers(state,at(RUMMI_TURN_MS*(i+1)+10));
 assert.equal(Boolean(state.rummikub.rooms[roomId]),true);
 for(let i=4;i<10&&state.rummikub.rooms[roomId];i++)processRummikubTimers(state,at(RUMMI_TURN_MS*(i+1)+10));
 assert.equal(Boolean(state.rummikub.rooms[roomId]),false);
 assert.equal(ps.reduce((s,p)=>s+p.stats.points,0),20000);
 assert.equal(ps.reduce((s,p)=>s+p.records.rummikubGames,0),2);
 assert.equal(rummikubRanking(state).top.length,2);
 const results=state.rummikub.results[ps[0].id];assert.equal(results.entries.length,2);
 processRummikubTimers(state,at(RUMMI_MATCH_MS+200));assert.equal(ps.reduce((s,p)=>s+p.stats.points,0),20000);
});
test('루미큐브 20분 제한은 원점 상태 복구 없이 남은 패와 동점 개수로 순위 정산',()=>{
 const {state,ps,room,roomId}=setup(3);
 for(const player of room.players)player.rack=[{id:`${player.petId}-tile`,num:player===room.players[0]?1:12,color:'red'}];
 const result=processRummikubTimers(state,at(RUMMI_MATCH_MS+1));assert.equal(result.changed,true);
 assert.equal(state.rummikub.rooms[roomId],undefined);
 assert.deepEqual(ps.map(p=>p.records.rummikubWins),[1,0,0]);assert.equal(ps[0].stats.points,10200);
});
test('싱글 레고도쿠는 정답/오답 검증, 문제 반복, 비공개 정답, 5실수/2분 자동 정산',()=>{
 const state=stateWithUsers([['solo','싱글']],date);const p=Object.values(state.pets)[0];p.stats.points=10000;
 const started=startMiniGame(state,p,'legodokuSingle',date);assert.equal(started.ok,true,started.message);
 const challenge=state.miniGameChallenges[started.challenge.id];
 assert.equal(miniChallengeView(challenge).soloSolution,undefined);
 const solution=[...challenge.soloSolution];
 for(let i=0;i<8;i++){
   const result=playSoloLegodoku(state,p,challenge.id,{generation:challenge.soloGeneration,index:solution[i],requestId:`correct-${i}`},at(5000+i*1000));
   assert.equal(result.ok,true,result.message);
 }
 assert.equal(challenge.soloCleared,1);assert.equal(challenge.soloGeneration,1);
 let req=0;while(challenge.soloMistakes<5){
   const idx=Array.from({length:64},(_,i)=>i).find(i=>!challenge.soloSolution.includes(i)&&!challenge.soloConfirmed.includes(i));
   const r=playSoloLegodoku(state,p,challenge.id,{generation:challenge.soloGeneration,index:idx,requestId:`wrong-${req++}`},at(14000+req*1000));assert.equal(r.ok,true,r.message);
 }
 assert.equal(challenge.completed,true);assert.equal(challenge.reward,60);assert.equal(p.records.legodokuSingleBest,1);
 const again=playSoloLegodoku(state,p,challenge.id,{generation:challenge.soloGeneration,index:0},at(21000));assert.equal(again.ok,false);
});

import { createRoom, register, authRequest, responseJson } from './helpers.js';
async function post(room,token,path,body={}){return responseJson(await room.fetch(authRequest(path,token,{method:'POST',body:JSON.stringify(body)})));}
async function boot(room,token){const r=await responseJson(await room.fetch(authRequest('/api/bootstrap',token)));assert.equal(r.response.status,200);return r.data.bootstrap;}
test('Worker 실제 API: 3인 입장, 관전자 패 비공개, 유효하지 않은 턴 차단, 중복 뽑기 방지',async()=>{
 const {room}=await createRoom();const tokens=[];
 for(const name of ['루미A','루미B','루미C','루미관전'])tokens.push(await register(room,name));
 const state=await room.store.load();for(const p of Object.values(state.pets))p.stats.points=10000;await room.store.save(state);
 const created=await post(room,tokens[0],'/api/rummikub/rooms',{stake:500});assert.equal(created.data.ok,true,JSON.stringify(created.data));const rid=created.data.roomId;
 for(let i=1;i<3;i++){const joined=await post(room,tokens[i],`/api/rummikub/rooms/${rid}/join`);assert.equal(joined.data.ok,true);}
 const started=await post(room,tokens[0],`/api/rummikub/rooms/${rid}/start`);assert.equal(started.data.ok,true,JSON.stringify(started.data));
 const watcher=await post(room,tokens[3],`/api/rummikub/rooms/${rid}/spectate`);assert.equal(watcher.data.ok,true);
 const spectate=await boot(room,tokens[3]);const view=spectate.rummikub.rooms.find(r=>r.id===rid);assert.equal(view.players.length,3);assert.ok(view.players.every(p=>p.rack===undefined));
 const states=await Promise.all(tokens.slice(0,3).map(t=>boot(room,t)));assert.ok(states.every(b=>b.rummikub.rooms.find(r=>r.id===rid).players.filter(p=>p.rack).length===1));
 const currentId=view.currentPetId;const index=states.findIndex(b=>b.dashboard.pet.id===currentId);
 const notCurrent=(index+1)%3;const rejected=await post(room,tokens[notCurrent],`/api/rummikub/rooms/${rid}/move`,{action:'draw',turnSeq:view.turnSeq,requestId:'not-current'});assert.equal(rejected.data.ok,false);
 const action={action:'draw',turnSeq:view.turnSeq,requestId:'one-draw-only'};
 const [first,repeat]=await Promise.all([post(room,tokens[index],`/api/rummikub/rooms/${rid}/move`,action),post(room,tokens[index],`/api/rummikub/rooms/${rid}/move`,action)]);
 assert.equal(first.data.ok,true);assert.equal(repeat.data.ok,true);assert.equal(repeat.data.duplicate,true);
 const after=(await boot(room,tokens[0])).rummikub.rooms.find(r=>r.id===rid);assert.equal(after.turnSeq,view.turnSeq+1);
});
test('Worker 실제 API: 싱글 레고도쿠 진입 시 비공개 정답이 외부로 나가지 않는다',async()=>{
 const {room}=await createRoom();const token=await register(room,'싱글검증');
 const started=await post(room,token,'/api/minigames/start',{gameId:'legodokuSingle'});assert.equal(started.data.ok,true,JSON.stringify(started.data));
 const challenge=started.data.bootstrap.activeMiniChallenge;assert.equal(challenge.gameId,'legodokuSingle');assert.equal(challenge.soloSolution,undefined);assert.equal(challenge.soloRegions.length,64);
 const played=await post(room,token,'/api/minigames/legodoku-single/cell',{challengeId:challenge.id,index:0,generation:challenge.soloGeneration,requestId:'req-1'});assert.equal(played.data.ok,true);
 const restarted=(await boot(room,token)).activeMiniChallenge;assert.equal(restarted.id,challenge.id);assert.equal(restarted.soloSolution,undefined);
});
