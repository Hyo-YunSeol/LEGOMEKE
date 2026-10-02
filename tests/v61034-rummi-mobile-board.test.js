import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const src=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
const css=await readFile(new URL('../public/styles.css',import.meta.url),'utf8');
const cut=(from,to)=>src.slice(src.indexOf(from),src.indexOf(to,src.indexOf(from)));
const tile=(num,color,id)=>({num,color,id});

test('상대 턴에서도 정렬을 허용하고, 서버 손패를 바꾸지 않으며 새 패를 끝에 추가',async()=>{
 const original=[tile(11,'blue','b'),tile(3,'red','a'),tile(8,'yellow','c')];
 const room={id:'room-1',role:'player',status:'playing',currentPetId:'opponent',turnSeq:1,table:[],players:[{petId:'mine',rack:original,registered:false}]};
 const app={rummiRackOrder:null,rummiDraft:null,rummiSubmitting:false,rummiSuppressClickUntil:0,data:{dashboard:{pet:{id:'mine'}},rummikub:{rooms:[room]}}};
 let redraws=0;
 const ctx={app,room,currentRummiRoom:()=>room,rummiRedraw:()=>redraws++,monotonicNow:()=>100,document:{querySelector:()=>null},toast:()=>{},confirm:()=>true};
 vm.createContext(ctx);
 vm.runInContext([cut('function rummiOrderedRack(room,own){','// 서버와 동일한 조합 정의'),cut('async function rummiHandleAction(button) {','// PC 드래그·모바일 터치 이동')].join('\n'),ctx);
 await ctx.rummiHandleAction({dataset:{action:'rummi-sort',mode:'num'}});
 assert.deepEqual(Array.from(app.rummiRackOrder.ids),['a','c','b']);
 assert.deepEqual(original.map(t=>t.id),['b','a','c'],'클라이언트 정렬은 서버에 있던 손패 배열을 수정하지 않는다');
 assert.equal(redraws,1);
 const ordered=ctx.rummiOrderedRack(room,room.players[0]);
 assert.deepEqual(Array.from(ordered,t=>t.id),['a','c','b']);
 room.players[0].rack=[...original,tile(5,'black','new')];
 assert.deepEqual(Array.from(ctx.rummiOrderedRack(room,room.players[0]),t=>t.id),['a','c','b','new']);
 await ctx.rummiHandleAction({dataset:{action:'rummi-sort',mode:'color'}});
 assert.deepEqual(Array.from(app.rummiRackOrder.ids),['a','b','c','new']);
 assert.equal(app.rummiDraft,null,'상대 턴의 정렬은 턴 조작 초안을 만들지 않는다');
 room.currentPetId='mine';
 assert.deepEqual(Array.from(ctx.ensureRummiDraft(room).rack,t=>t.id),['a','b','c','new'],'내 차례가 오면 기존 정렬로 시작한다');
});

test('게임 시작 시 이전 결과와 규칙 표시를 제거하고 로비에서만 결과를 보여준다',()=>{
 const play=cut('function rummiSection() {','function rummiTimeLeft(');
 assert.match(play,/\$\{header\}\$\{players\}<div class="rummi-table"/);
 assert.doesNotMatch(play,/\$\{resultHtml\}\$\{header\}/);
 assert.match(play,/\$\{resultHtml\}\$\{rummiRulesHtml\(\)\}<div class="rummi-lobby"/);
 assert.match(play,/\$\{header\}\$\{players\}\$\{rummiRulesHtml\(\)\}<p class="helper">2명 이상/);
 assert.doesNotMatch(play,/결과 확인/);
});

test('게임판은 휴대폰에서 최소 270px을 확보하며 조작부가 게임판 위를 덮지 않는다',()=>{
 assert.match(css,/\.rummi-play-area\{position:relative;display:flex;flex-direction:column;[^}]*max-height:none;overflow:visible/);
 assert.match(css,/\.rummi-play-area \.rummi-table\{flex:0 0 auto;min-height:clamp\(300px,44dvh,510px\);max-height:68dvh/);
 assert.match(css,/@media\(max-width:650px\)\{\.rummi-play-area\{[^}]*max-height:none\}\.rummi-play-area \.rummi-table\{min-height:clamp\(270px,43dvh,460px\)/);
 assert.match(css.slice(css.indexOf('@media(max-height:680px)')), /^@media\(max-height:680px\)\{[^\n]*\.rummi-play-area \.rummi-table\{min-height:270px\}/);
 assert.match(css,/\.rummi-play-area \.rummi-actions\{position:relative/);
});
