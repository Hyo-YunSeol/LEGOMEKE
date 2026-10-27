import test from 'node:test';
import assert from 'node:assert/strict';
import {stateWithUsers} from './helpers.js';
import {createYutRoom, joinYutRoom, startYutRoom, actionYut, yutMoves, leaveYutRoom, setYutConnected, processYutTimers, yutRanking, yutNextAlarmAt} from '../src/game/yutnori.js';

const zero=new Date('2026-10-28T00:00:00.000Z');
function fixture(count=2,mode='solo'){
 const state=stateWithUsers(Array.from({length:count},(_,i)=>[`u${i}`,`윷${i}`]),zero);
 const pets=Object.values(state.pets);
 const created=createYutRoom(state,pets[0],{mode,seats:count},zero);
 assert.equal(created.ok,true);
 for(const p of pets.slice(1))assert.equal(joinYutRoom(state,p,created.roomId).ok,true);
 assert.equal(startYutRoom(state,pets[0],created.roomId,zero,()=>0).ok,true);
 return {state,pets,id:created.roomId,room:state.yut.rooms[created.roomId]};
}
function move(room,owner,other,step=1){
 const piece=room.pieces.find(p=>p.owner===owner.id);
 piece.position=step===1?'0':'0';piece.path=['start','0'];
 if(other){const target=room.pieces.find(p=>p.owner===other.id);target.position='1';target.path=['start','0','1'];}
 room.phase='move';room.pending=[{name:'도',steps:1}];
 return piece;
}

test('상대 말 잡기 후 추가 던지기, 잡힌 말은 출발점 복귀',()=>{
 const {state,pets,room,id}=fixture();const actor=pets[room.currentIndex],other=pets[1-room.currentIndex];
 move(room,actor,other);
 const selected=yutMoves(room).find(m=>m.to==='1');assert.ok(selected);
 const result=actionYut(state,actor,id,{type:'move',...selected},new Date(zero.getTime()+1000));
 assert.equal(result.ok,true);assert.match(result.message,/한 번 더/);
 assert.equal(room.phase,'throw');assert.equal(room.pending.length,0);
 assert.equal(room.pieces.find(p=>p.owner===other.id).position,'start');
});

test('개인전 동일 위치의 아군 말을 모두 함께 업어 이동',()=>{
 const {state,pets,room,id}=fixture();const actor=pets[room.currentIndex];
 const own=room.pieces.filter(p=>p.owner===actor.id);
 for(const piece of own.slice(0,2)){piece.position='0';piece.path=['start','0'];}
 room.phase='move';room.pending=[{name:'도',steps:1}];
 const selected=yutMoves(room).find(m=>m.pieceId===own[0].id);
 assert.equal(actionYut(state,actor,id,{type:'move',...selected},new Date(zero.getTime()+1000)).ok,true);
 assert.equal(own[0].position,'1');assert.equal(own[1].position,'1');
});

test('2:2 팀전 같은 팀 말 업기와 잡기 선택을 모두 지원',()=>{
 const {room,pets}=fixture(4,'team');const actor=pets[room.currentIndex];
 const myTeam=room.players.find(p=>p.petId===actor.id).team;
 const friend=pets.find(p=>p.id!==actor.id&&room.players.find(x=>x.petId===p.id).team===myTeam);
 const mine=room.pieces.find(p=>p.owner===actor.id);mine.position='0';mine.path=['start','0'];
 const theirs=room.pieces.find(p=>p.owner===friend.id);theirs.position='1';theirs.path=['start','0','1'];
 room.phase='move';room.pending=[{name:'도',steps:1}];
 const options=yutMoves(room).filter(m=>m.pieceId===mine.id&&m.to==='1');
 assert.ok(options.some(m=>m.friendlyCatch===true));assert.ok(options.some(m=>m.friendlyCatch===false));
});

test('팀원의 말 3개 골인 시 같은 팀 두 사람에게 각각 300P',()=>{
 const {state,room,pets,id}=fixture(4,'team');const actor=pets[room.currentIndex];
 const winTeam=room.players[room.currentIndex].team;
 const own=room.pieces.filter(p=>p.owner===actor.id);
 for(const piece of own.slice(1)){piece.position='home';piece.path=['start','home'];piece.finished=true;}
 const last=own[0];last.position='18';last.path=['start','18'];
 room.phase='move';room.pending=[{name:'도',steps:1}];
 const baseline=new Map(pets.map(p=>[p.id,p.stats.points]));
 const selected=yutMoves(room).find(m=>m.pieceId===last.id);
 assert.equal(actionYut(state,actor,id,{type:'move',...selected},new Date(zero.getTime()+1000)).ok,true);
 assert.equal(state.yut.rooms[id],undefined);
 for(const p of pets){const team=room.players.find(x=>x.petId===p.id).team;
   assert.equal(p.stats.points-baseline.get(p.id),team===winTeam?300:0);
 }
});

test('팀전 기권은 즉시 종료되고, 60초 연결 끊김을 복구하면 기권되지 않음',()=>{
 const f=fixture(4,'team');const actor=f.pets[0];
 assert.equal(setYutConnected(f.state,actor.id,false,new Date(zero.getTime()+1000)).changed,true);
 assert.ok(yutNextAlarmAt(f.state));
 assert.equal(setYutConnected(f.state,actor.id,true,new Date(zero.getTime()+5000)).changed,true);
 assert.equal(processYutTimers(f.state,new Date(zero.getTime()+14000),()=>.9).changed,false);
 assert.equal(f.room.status,'playing');
 assert.equal(leaveYutRoom(f.state,actor,f.id,new Date(zero.getTime()+15001)).ok,true);
 assert.equal(f.state.yut.rooms[f.id],undefined);
 assert.equal(f.state.yut.results[actor.id].entries.filter(x=>x.winner).length,2);
});

test('3개 방 상한, 유예 후 자동기권, 경기 상태 만료 시 정산',()=>{
 const f=fixture();const disconnected=f.pets[0];
 setYutConnected(f.state,disconnected.id,false,new Date(zero.getTime()+1000));
 const result=processYutTimers(f.state,new Date(zero.getTime()+61_100),()=>.9);
 assert.equal(result.changed,true);assert.equal(f.state.yut.rooms[f.id],undefined);
 const winner=f.pets[1];assert.equal(yutRanking(f.state,winner.id).top[0].wins,1);
});
