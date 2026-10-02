import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {stateWithUsers} from './helpers.js';
import {claimTerritory} from '../src/game/territory.js';
import {lifeHungerCostsForBody} from '../src/game/activity.js';
const text=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
const css=await readFile(new URL('../public/styles.css',import.meta.url),'utf8');
const cut=(from,to)=>text.slice(text.indexOf(from),text.indexOf(to,text.indexOf(from)));
const room={id:'r1',status:'playing',role:'player',turnSeq:1,currentPetId:'p1',players:[{petId:'p1',registered:false,rack:[]}],table:[]};
const app={rummiRoomId:'r1',rummiDraft:null,rummiSubmitting:false,data:{dashboard:{pet:{id:'p1'}},rummikub:{rooms:[room]}}};
let redraws=0;
const context={app,document:{querySelector:()=>null,querySelectorAll:()=>[]},rummiRedraw:()=>redraws++,toast:()=>{},console};
vm.createContext(context);
vm.runInContext([
 cut('function currentRummiRoom() {','function rummiRulesHtml(){'),
 cut('function rummiTakeSelected(draft) {','async function rummiServerAction('),
 cut('function rummiDropTile(tileId,target){',"document.addEventListener('click',event=>{")
].join('\n'),context);
const get=fn=>vm.runInContext(fn,context);
const red=(num,id)=>({color:'red',num,id});
const blue=(num,id)=>({color:'blue',num,id});
const rackTarget={closest:name=>name==='.rummi-rack'?{}:null};
const boardTarget={closest:name=>name==='.rummi-table'?{}:null};
Object.assign(context,{room,rackTarget,boardTarget});
test('루미큐브의 그룹/연속/조커와 미완성 조합 검증',()=>{
 const valid=get('rummiValidGroup');
 assert.equal(valid([red(10,'a'),red(11,'b'),red(12,'c')]),true);
 assert.equal(valid([red(10,'a'),blue(10,'b'),{color:'joker',num:0,id:'j'}]),true);
 assert.equal(valid([red(10,'a'),red(10,'b'),red(12,'c')]),false);
 assert.equal(valid([red(10,'a'),red(11,'b')]),false);
 assert.equal(valid([red(12,'a'),red(13,'b'),red(1,'c')]),false);
});
test('손패 한 장을 게임판에 놓으면 임시 영역에 보이고 전체 취소 시 중복 없이 회복',()=>{
 room.table=[];room.turnSeq=21;room.players[0].rack=[red(10,'a'),red(11,'b'),red(12,'c')];app.rummiDraft=null;
 const draft=get('ensureRummiDraft(room)');context.draft=draft;draft.selected.add('a');
 assert.equal(get('rummiDropTile(\'a\',boardTarget)'),true);
 assert.equal(draft.groups.length,0);assert.equal(draft.loose.length,1);
 assert.equal(draft.rack.length,2);assert.equal(get('rummiDraftCheck(draft,room)').ok,false);
 assert.equal(get('rummiUndoStep(draft)'),true);
 assert.equal(draft.groups.length,0);assert.equal(draft.rack.length,3);
 assert.equal(new Set([...draft.rack,...draft.groups.flat(),...draft.loose].map(x=>x.id)).size,3);
 assert.equal(redraws>0,true);
});
test('선택한 패 3개로 첫 등록 30점 이상일 때만 확정 허용',()=>{
 room.turnSeq=22;room.table=[];room.players[0].rack=[red(9,'x'),red(10,'y'),red(11,'z'),blue(2,'w')];app.rummiDraft=null;
 const draft=get('ensureRummiDraft(room)');context.draft=draft;
 draft.selected=new Set(['x','y','z']);get('rummiDropTile(\'x\',boardTarget)');
 assert.equal(get('rummiDraftCheck(draft,room)').ok,true);
 draft.groups[0][0].num=8;
 assert.equal(get('rummiDraftCheck(draft,room)').ok,false);
});
test('첫 등록 전 공개 조합 조작/손패 반환 차단',()=>{
 const original=[blue(4,'old1'),blue(5,'old2'),blue(6,'old3')];
 room.turnSeq=23;room.table=[original];room.players[0].rack=[red(10,'a')];app.rummiDraft=null;
 const draft=get('ensureRummiDraft(room)');context.draft=draft;
 assert.equal(get('rummiCanSelect(draft,\'old1\',room)'),false);
 assert.equal(get('rummiDropTile(\'old1\',rackTarget)'),false);
 assert.equal(draft.groups[0].length,3);
});
test('영토 성공 비용 2, 실패한 재점령은 비용 0',()=>{
 const date=new Date('2026-10-02T07:00:00.000Z');
 const state=stateWithUsers([['territory-tester','테스트']],date);
 const pet=Object.values(state.pets)[0];pet.stats.hunger=100;
 const first=claimTerritory(state,pet,2,2,date);
 assert.equal(first.ok,true,first.message);assert.equal(pet.stats.hunger,98);
 const second=claimTerritory(state,pet,2,2,date);
 assert.equal(second.ok,false);assert.equal(pet.stats.hunger,98);assert.equal(second.hungerCost,0);
});
test('생활 차감액은 저단계 3/1/4, 고단계 4/2/5',()=>{
 assert.equal(JSON.stringify(lifeHungerCostsForBody(8750)),JSON.stringify({work:4,rest:2,exercise:5}));
 assert.equal(JSON.stringify(lifeHungerCostsForBody(1)),JSON.stringify({work:3,rest:1,exercise:4}));
});
test('루미큐브 7열 다중 손패, 게임판 임시 조합, 싱글 레고도쿠 공통 판/X 지우기가 연결됨',()=>{
 assert.match(css,/\.rummi-play-area \.rummi-rack-tiles\{display:grid;grid-template-columns:repeat\(7,minmax\(0,1fr\)\)/);
 assert.match(text,/draft\.loose\.push\(\.\.\.moved\)/);
 assert.match(text,/touch\.mode==='erase'\)marks\.delete\(index\)/);
 assert.match(text,/class="legodoku-board solo-doku-board"/);
 assert.match(text,/rummiSubmitting=true/);
});
