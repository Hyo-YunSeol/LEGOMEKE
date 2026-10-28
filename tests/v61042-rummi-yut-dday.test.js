import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stateWithUsers} from './helpers.js';
import * as r from '../src/game/rummikub.js';
import * as y from '../src/game/yutnori.js';

const now = new Date('2026-10-28T00:00:00.000Z');
const datePlus = (ms) => new Date(now.getTime() + ms);
function rummiFixture(){
 const state=stateWithUsers([['u1','플레이어가'],['u2','플레이어나'],['u3','관전자']],now);
 const pets=Object.values(state.pets);
 for(const pet of pets) pet.stats.points=5000;
 const made=r.createRummikubRoom(state,pets[0],100,now);
 assert.equal(made.ok,true,made.message);
 assert.equal(r.joinRummikubRoom(state,pets[1],made.roomId,now).ok,true);
 assert.equal(r.startRummikubRoom(state,pets[0],made.roomId,now,()=>0.3).ok,true);
 assert.equal(r.spectateRummikubRoom(state,pets[2],made.roomId).ok,true);
 return {state,pets,room:state.rummikub.rooms[made.roomId]};
}
test('루미큐브 60초: 놓은 패와 취소가 관전/상대방에게 공유되나 비공개 손패는 전달하지 않는다',()=>{
 const {state,pets,room}=rummiFixture();
 assert.equal(r.RUMMI_TURN_MS,60000);
 const actor=room.players[room.currentIndex],piece=actor.rack[0];
 assert.equal(r.publishRummikubDraft(state,state.pets[actor.petId],room.id,{turnSeq:room.turnSeq,version:1,groups:[[piece.id]],loose:[]},datePlus(100)).ok,true);
 let view=r.rummikubRoomView(state,room,pets[2].id);
 assert.equal(view.liveDraft.groups[0][0].id,piece.id);
 assert.equal(view.players.every(player=>player.rack===undefined),true);
 assert.equal(room.table.length,0,'임시 공개는 실제 게임판을 변경하지 않는다');
 assert.equal(r.publishRummikubDraft(state,state.pets[actor.petId],room.id,{turnSeq:room.turnSeq,version:2,groups:[],loose:[]},datePlus(200)).ok,true);
 view=r.rummikubRoomView(state,room,pets[1].id);
 assert.equal(view.liveDraft.groups.length,0,'패 회수·전체 취소 시 상대 화면에서도 사라짐');
 assert.equal(r.publishRummikubDraft(state,state.pets[actor.petId],room.id,{turnSeq:room.turnSeq,version:1,groups:[[piece.id]],loose:[]},datePlus(250)).stale,true);
});
test('루미큐브 60초가 지나면 임시 배치 취소 + 패 하나 자동 뽑기 + 다음 턴',()=>{
 const {state,room}=rummiFixture();
 const turn=room.turnSeq,actor=room.players[room.currentIndex],before=actor.rack.length;
 const first=actor.rack[0];
 const response=r.publishRummikubDraft(state,state.pets[actor.petId],room.id,{turnSeq:turn,version:1,groups:[[first.id]],loose:[]},datePlus(100));
 assert.equal(response.ok,true);
 assert.equal(r.processRummikubTimers(state,datePlus(60001)).changed,true);
 assert.equal(actor.rack.length,before+1);
 assert.ok(actor.lastDrawnId);
 assert.equal(room.liveDraft,null);
 assert.equal(room.turnSeq,turn+1);
});
test('윷 고정 낙 1%: 입력 파워 0/50/100 모두 동일 판정',()=>{
 for(const p of [0,50,100]){
  assert.equal(y.rollYut(p,()=>0.005).name,'낙');
  assert.notEqual(y.rollYut(p,()=>0.015).name,'낙');
 }
 assert.equal(y.YUT_MOVE_MS,30000);
 assert.equal(y.YUT_THROW_MS,15000);
 assert.equal(y.YUT_MATCH_MS,25*60_000);
});
test('윷 자동 이동 우선순위: 잡기보다 골인 먼저 선택',()=>{
 const state=stateWithUsers([['u1','자동참가'],['u2','수동참가']],now),pets=Object.values(state.pets);
 const {roomId}=y.createYutRoom(state,pets[0],{mode:'solo',seats:2},now);
 y.joinYutRoom(state,pets[1],roomId);y.startYutRoom(state,pets[0],roomId,now,()=>0);
 const room=state.yut.rooms[roomId],owner=room.players[room.currentIndex].petId;
 const [first,second]=room.pieces.filter(piece=>piece.owner===owner);
 const foe=room.pieces.find(piece=>piece.owner!==owner);
 first.position='19';first.path=['start','18','19'];
 second.position='start';second.path=['start'];
 foe.position='0';foe.path=['start','0'];
 room.phase='move';room.pending=[{name:'도',steps:1}];
 assert.equal(y.chooseAutoYutMove(room).pieceId,first.id);
 assert.equal(y.chooseAutoYutMove(room).to,'home');
});
test('서버 결과확인: 루미큐브·윷놀이 모두 경기별 확인 후 중복 표시 방지',()=>{
 const state=stateWithUsers([['u1','확인유저']],now),pet=Object.values(state.pets)[0];
 state.rummikub.results[pet.id]={matchId:'r1'};
 state.yut.results[pet.id]={matchId:'y1'};
 assert.equal(r.acknowledgeRummikubResult(state,pet,'wrong').acknowledged,false);
 assert.equal(y.acknowledgeYutResult(state,pet,'wrong').acknowledged,false);
 assert.equal(r.acknowledgeRummikubResult(state,pet,'r1').acknowledged,true);
 assert.equal(y.acknowledgeYutResult(state,pet,'y1').acknowledged,true);
 assert.equal(state.rummikub.results[pet.id],undefined);
 assert.equal(state.yut.results[pet.id],undefined);
});
test('커플 D-day는 순위 3개 아래로 분리하고, 이름/D+일수를 서로 다른 줄로 표시',async()=>{
 const app=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
 const css=await readFile(new URL('../public/styles.css',import.meta.url),'utf8');
 const source=app.slice(app.indexOf('function rankingsSection()'),app.indexOf('function newsList()'));
 assert.match(source,/RANKING_GROUPS\.map\(\(_,i\)=>rankGroupHtml\(r,i\)\)/);
 assert.match(source,/\<\/div>\$\{relations}/);
 assert.match(source,/relation-couple-item/);
 assert.match(css,/\.relation-couple-item\{display:flex;flex-direction:column/);
});

test('실제 Worker API: 루미큐브 임시 배치/취소를 상대와 관전자가 확인하고 손패는 비공개',async()=>{
 const {createRoom,register,authRequest,responseJson}=await import('./helpers.js');
 const {room}=await createRoom(),tokens=[];
 for(const nickname of ['실시간A','실시간B','실시간관객'])tokens.push(await register(room,nickname));
 const saved=await room.store.load();
 for(const pet of Object.values(saved.pets))pet.stats.points=5000;
 await room.store.save(saved);
 const post=async(token,path,body={})=>responseJson(await room.fetch(authRequest(path,token,{method:'POST',body:JSON.stringify(body)})));
 const boot=async(token)=>(await responseJson(await room.fetch(authRequest('/api/bootstrap',token)))).data.bootstrap;
 const created=await post(tokens[0],'/api/rummikub/rooms',{stake:100});
 assert.equal(created.data.ok,true);
 const roomId=created.data.roomId;
 assert.equal((await post(tokens[1],`/api/rummikub/rooms/${roomId}/join`)).data.ok,true);
 assert.equal((await post(tokens[0],`/api/rummikub/rooms/${roomId}/start`)).data.ok,true);
 assert.equal((await post(tokens[2],`/api/rummikub/rooms/${roomId}/spectate`)).data.ok,true);
 const views=await Promise.all(tokens.map(boot));
 const turn=views[0].rummikub.rooms.find(x=>x.id===roomId);
 const currentId=turn.currentPetId;
 const ownerIndex=views.findIndex(v=>v.dashboard.pet.id===currentId);
 assert.ok(ownerIndex===0||ownerIndex===1);
 const tile=turn.players.find(p=>p.petId===currentId).rack?.[0] || views[ownerIndex].rummikub.rooms.find(x=>x.id===roomId).players.find(p=>p.petId===currentId).rack[0];
 const draft={turnSeq:turn.turnSeq,version:1,groups:[[tile.id]],loose:[]};
 const published=await post(tokens[ownerIndex],`/api/rummikub/rooms/${roomId}/draft`,draft);
 assert.equal(published.data.ok,true,published.data.message);
 const opposite=await boot(tokens[1-ownerIndex]);
 const watching=await boot(tokens[2]);
 const rv=opposite.rummikub.rooms.find(x=>x.id===roomId);
 assert.equal(rv.liveDraft.groups[0][0].id,tile.id);
 assert.equal(watching.rummikub.rooms.find(x=>x.id===roomId).liveDraft.groups[0][0].id,tile.id);
 assert.equal(rv.players.every(p=>p.rack===undefined||p.petId===opposite.dashboard.pet.id),true);
 const cancelled=await post(tokens[ownerIndex],`/api/rummikub/rooms/${roomId}/draft`,{turnSeq:turn.turnSeq,version:2,groups:[],loose:[]});
 assert.equal(cancelled.data.ok,true);
 assert.equal((await boot(tokens[2])).rummikub.rooms.find(x=>x.id===roomId).liveDraft.groups.length,0);
});
