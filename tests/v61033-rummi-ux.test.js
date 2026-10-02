import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createRoom,register,authRequest,responseJson} from './helpers.js';

const appSource=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
const css=await readFile(new URL('../public/styles.css',import.meta.url),'utf8');
const cut=(from,to)=>appSource.slice(appSource.indexOf(from),appSource.indexOf(to,appSource.indexOf(from)));
const tile=(color,num,id)=>({color,num,id});

// Client timer must be monotonic within a turn even if the server snapshot arrives late.
test('루미큐브 턴 타이머는 같은 턴의 늦은 서버 스냅샷에서도 올라가지 않고 새 턴만 30초로 초기화',()=>{
 const state={rummiClock:null,data:{rummikub:{serverTime:1_000}}};let now=1_000;
 const room={id:'r1',startedAt:'2026-10-02T00:00:00Z',turnSeq:1,turnDeadlineAt:new Date(31_000).toISOString(),endsAt:new Date(1_201_000).toISOString()};
 const sandbox={app:state,serverAlignedNow:()=>now};vm.createContext(sandbox);
 vm.runInContext(cut('function rummiTimeLeft(room,kind){','function rummiRedraw(){'),sandbox);
 const clock=()=>vm.runInContext('rummiTimeLeft(room,\'turn\')',sandbox);
 sandbox.room=room;assert.equal(clock(),30);now=2_500;assert.equal(clock(),29);
 // A stale clock sample must not bounce back to 30.
 now=1_050;assert.equal(clock(),29);
 const game1=vm.runInContext('rummiTimeLeft(room,\'game\')',sandbox);
 now=32_000;room.turnSeq=2;room.turnDeadlineAt=new Date(61_000).toISOString();
 assert.equal(clock(),29,'새 턴은 새로운 마감시간으로 재설정');
 const game2=vm.runInContext('rummiTimeLeft(room,\'game\')',sandbox);
 assert.ok(game2<=game1,'전체 경기 시간은 턴 전환 때도 증가하지 않는다');
});

test('정렬된 유효 조합은 조커를 빈 숫자 자리에 표시하며 잘못된 조합은 건드리지 않음',()=>{
 const context={};vm.createContext(context);
 vm.runInContext(cut('function rummiValidGroup(tiles){','function rummiDraftCheck(draft,room){'),context);
 const arrange=context.rummiArrangeGroup;
 const group=[tile('red',13,'13'),tile('joker',0,'j'),tile('red',10,'10'),tile('red',12,'12'),tile('red',9,'9')];
 assert.equal(context.rummiValidGroup(group),true);
 arrange(group);
 assert.deepEqual(group.map(t=>t.num),[9,10,0,12,13]);
 const bad=[tile('red',10,'a'),tile('blue',12,'b')];arrange(bad);
 assert.deepEqual(bad.map(t=>t.id),['a','b']);
});

test('루미큐브 독립 화면·전체 취소·임시 분리·공감 컨트롤과 반응형 게임판 존재',()=>{
 assert.match(appSource,/rummi-screen/);
 assert.match(css,/body\.rummi-room-open \.topbar,body\.rummi-room-open \.support-banner,body\.rummi-room-open \.bottom-nav\{display:none!important\}/);
 assert.match(appSource,/data-action="rummi-reset">전체 취소/);
 assert.doesNotMatch(appSource,/data-action="rummi-undo"/);
 assert.match(appSource,/draft\.loose\.push\(\.\.\.draft\.groups\.splice\(idx,1\)\[0\]\)/);
 assert.match(appSource,/spectatorReactionBar\('rummi'/);
 assert.match(css,/@media\(min-width:651px\)\{\.rummi-play-area \.rummi-rack-tiles\{grid-template-columns:repeat\(14,minmax\(0,1fr\)\)/);
});

async function post(room,token,path,body={}){
 return responseJson(await room.fetch(authRequest(path,token,{method:'POST',body:JSON.stringify(body)})));
}
async function boot(room,token){return (await responseJson(await room.fetch(authRequest('/api/bootstrap',token)))).data.bootstrap;}

test('실제 API: 2인+관전자 루미큐브 리액션, 비인가 전송, 연속 전송 차단, 손패 비공개',async()=>{
 const {room}=await createRoom();const tokens=[];
 for(const name of ['루미게임A','루미게임B','루미관객','루미외부'])tokens.push(await register(room,name));
 const state=await room.store.load();for(const pet of Object.values(state.pets))pet.stats.points=5_000;
 await room.store.save(state);
 const made=await post(room,tokens[0],'/api/rummikub/rooms',{stake:100});assert.equal(made.data.ok,true);
 const rid=made.data.roomId;
 assert.equal((await post(room,tokens[1],`/api/rummikub/rooms/${rid}/join`)).data.ok,true);
 assert.equal((await post(room,tokens[0],`/api/rummikub/rooms/${rid}/start`)).data.ok,true);
 assert.equal((await post(room,tokens[2],`/api/rummikub/rooms/${rid}/spectate`)).data.ok,true);
 const spectator=await boot(room,tokens[2]);const view=spectator.rummikub.rooms.find(r=>r.id===rid);
 assert.equal(view.role,'spectator');assert.ok(view.table);assert.ok(view.players.every(p=>p.rack===undefined));
 const rejected=await post(room,tokens[3],`/api/rummikub/rooms/${rid}/reaction`,{type:'funny'});
 assert.equal(rejected.response.status,403);
 const reaction=await post(room,tokens[2],`/api/rummikub/rooms/${rid}/reaction`,{type:'like'});
 assert.equal(reaction.response.status,200);assert.equal(reaction.data.reaction.emoji,'👍');
 const updated=await boot(room,tokens[1]);assert.equal(updated.rummikub.rooms.find(r=>r.id===rid).reactions.some(r=>r.petId===updated.rummikub.rooms.find(r=>r.id===rid).players[0].petId),false);
 assert.equal(updated.rummikub.rooms.find(r=>r.id===rid).reactions.some(r=>r.type==='like'),true);
 const throttled=await post(room,tokens[2],`/api/rummikub/rooms/${rid}/reaction`,{type:'funny'});
 assert.equal(throttled.response.status,429);
 const persisted=await room.store.load();assert.equal(JSON.stringify(persisted).includes('\"emoji\":\"👍\"'),false,'공감은 저장되지 않는다');
});
