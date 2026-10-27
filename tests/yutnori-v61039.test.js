import test from 'node:test';
import assert from 'node:assert/strict';
import { stateWithUsers } from './helpers.js';
import { readFile, readdir, access } from 'node:fs/promises';
import * as y from '../src/game/yutnori.js';
const at=new Date('2026-10-28T00:00:00.000Z');
function fixture(count=2, mode='solo'){
  const state=stateWithUsers(Array.from({length:count},(_,i)=>[`u${i}`,`레고${i}`]),at);
  const pets=Object.values(state.pets);
  const result=y.createYutRoom(state,pets[0],{mode,seats:count},at);
  assert.equal(result.ok,true,result.message);
  for(const p of pets.slice(1))assert.equal(y.joinYutRoom(state,p,result.roomId).ok,true);
  assert.equal(y.startYutRoom(state,pets[0],result.roomId,at,()=>0).ok,true);
  return {state,pets,id:result.roomId,room:state.yut.rooms[result.roomId]};
}
const sequence=(...list)=>{let i=0;return ()=>list[i++]??0.9;};
test('파워 낙·특수 빽도·추가던지기를 서버에서 판정',()=>{
  assert.equal(y.rollYut(0,()=>0).name,'낙');
  assert.equal(y.rollYut(50,sequence(.9,.1,.9,.9,.9)).name,'빽도');
  assert.equal(y.rollYut(50,sequence(.9,.9,.9,.9,.9)).name,'모');
  assert.equal(y.rollYut(50,sequence(.9,.1,.1,.1,.1)).name,'윷');
});
test('2~4인 개인전 및 2:2 팀전 · 방 한도와 참여 보호',()=>{
  for(const n of [2,3,4]){
    const f=fixture(n);assert.equal(f.room.pieces.length,n*4);
    assert.equal(f.pets.every(p=>p.daily.battlePlayed===1),true);
  }
  const f=fixture(4,'team');assert.equal(f.room.pieces.length,12);
  assert.deepEqual(f.room.players.map(p=>p.team),[0,1,0,1]);
  assert.equal(y.createYutRoom(f.state,f.pets[0],{},at).ok,false);
  assert.equal(y.yutView(f.state,f.pets[3].id).rooms[0].role,'player');
});
test('윷·모는 연속 던지고 선택한 말을 서버에서 이동하며 재전송 시 이중 처리하지 않는다',()=>{
  const f=fixture();const current=f.pets[f.room.currentIndex];
  const first=y.actionYut(f.state,current,f.id,{type:'throw',power:50},new Date(at.getTime()+1000),sequence(.9,.1,.1,.1,.1));
  assert.equal(first.ok,true);assert.equal(first.roll.name,'윷');assert.equal(f.room.phase,'throw');
  const second=y.actionYut(f.state,current,f.id,{type:'throw',power:50},new Date(at.getTime()+2000),sequence(.9,.9,.1,.9,.9));
  assert.equal(second.roll.name,'도');assert.equal(f.room.phase,'move');assert.equal(f.room.pending.length,2);
  const m=y.yutMoves(f.room).find(m=>m.steps===1);
  assert.ok(m);
  assert.equal(y.actionYut(f.state,current,f.id,{type:'move',...m},new Date(at.getTime()+3000)).ok,true);
  assert.equal(f.room.pieces.find(p=>p.id===m.pieceId).position,'0');
  assert.equal(f.room.pending.length,1);
  assert.equal(y.actionYut(f.state,current,f.id,{type:'move',...m},new Date(at.getTime()+3500)).ok,false);
});
test('빽도 역주행·양쪽 지름길·경로 히스토리',()=>{
  const piece={id:'x',owner:'x',position:'4',route:'outer',path:['start','0','1','2','3','4'],finished:false};
  const forward=y.calculateYutMove(piece,3,true);
  assert.equal(forward.position,'center');assert.equal(forward.route,'a');
  assert.equal(y.calculateYutMove(forward,-1).position,'a2');
  const fromSecond={...piece,position:'9',path:[...piece.path,'5','6','7','8','9']};
  assert.equal(y.calculateYutMove(fromSecond,3,true).position,'center');
  assert.equal(y.calculateYutMove({ ...piece,position:'start',path:['start']},-1),null);
});
test('말 골인 · 자동 정산은 오직 1회 · 승자만 300P',()=>{
  const f=fixture();const actor=f.pets[f.room.currentIndex];
  const others=f.room.pieces.filter(p=>p.owner===actor.id);
  for(const p of others.slice(1)){p.position='home';p.finished=true;p.path=['start','home'];}
  const last=others[0];last.position='18';last.path=['start','18'];
  f.room.phase='move';f.room.pending=[{name:'도',steps:1}];f.room.turn=6;
  const before=actor.stats.points;
  const move=y.yutMoves(f.room).find(x=>x.pieceId===last.id);
  assert.equal(move.to,'home');
  assert.equal(y.actionYut(f.state,actor,f.id,{type:'move',...move},new Date(at.getTime()+5000)).ok,true);
  assert.equal(f.state.yut.rooms[f.id],undefined);
  assert.equal(actor.stats.points,before+300);
  assert.equal(y.actionYut(f.state,actor,f.id,{type:'move',...move},new Date(at.getTime()+5001)).ok,false);
  assert.equal(actor.stats.points,before+300);
  assert.equal(y.yutRanking(f.state,actor.id).top[0].wins,1);
});
test('낙은 남은 이동을 소멸시키고 넘기며, 제한시간 자동진행',()=>{
 const f=fixture();const actor=f.pets[f.room.currentIndex];
 f.room.pending=[{name:'도',steps:1}];f.room.phase='throw';
 const result=y.actionYut(f.state,actor,f.id,{type:'throw',power:0},new Date(at.getTime()+1000),()=>0);
 assert.equal(result.roll.nak,true);assert.equal(f.room.pending.length,0);assert.notEqual(f.room.currentIndex,f.room.players.findIndex(p=>p.petId===actor.id));
 const deadline=new Date(f.room.deadlineAt).getTime();
 assert.equal(y.processYutTimers(f.state,new Date(deadline+1),()=>.9).changed,true);
});
test('펫 이미지 113개는 체형·전직·진화·돼지·레전드 폴더로 구분하며 중복 없이 유지',async()=>{
 const base=new URL('../public/pets/',import.meta.url);
 const types=['body','forms','pig','legend','evolution'];
 let count=0;
 for(const type of types){const path=new URL(`${type}/`,base);if(type==='evolution'){
   for(const species of await readdir(path,{withFileTypes:true}))if(species.isDirectory())count+=(await readdir(new URL(`${type}/${species.name}/`,base))).length;
 }else count+=(await readdir(path)).filter(n=>n.endsWith('.svg')).length;}
 assert.equal(count,113);
 const client=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(client,/petAssetPath/);assert.match(client,/랭킹/);assert.match(client,/toggle-other-relationships/);
 await access(new URL('evolution/form-piglet/form-piglet-evo-8.svg',base));
});
