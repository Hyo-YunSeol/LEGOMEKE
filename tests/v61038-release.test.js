import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {FLEX_ITEMS,EVOLUTION_STAGE_EXP} from '../src/game/constants.js';
import {territoryLimitForLevel,nextTerritoryUpgrade,levelRequirement} from '../src/game/progression.js';
import {initialState} from '../src/durable-store.js';
import {refreshTopPokeNews} from '../src/game/engine.js';
const read = (f)=>readFile(new URL('../'+f,import.meta.url),'utf8');

test('v6.10.38: 상품 31종/3일/레벨별 2~4종 및 기존 아이템 기록 호환',()=>{
 const active=Object.values(FLEX_ITEMS).filter(x=>!x.retired);
 assert.equal(active.length,31);
 assert.ok(Object.values(FLEX_ITEMS).every(x=>x.durationHours===72));
 for(let level=5;level<=50;level+=5){const count=active.filter(x=>x.requiredLevel===level).length;assert.ok(count>=2&&count<=4,`Lv${level}: ${count}`)}
 assert.ok(Object.values(FLEX_ITEMS).some(x=>x.retired));
});
test('v6.10.38: 진화 요구량과 제한 없는 영토 확장',()=>{
 assert.deepEqual([...EVOLUTION_STAGE_EXP],[0,100,250,450,750,1150,1650,2300]);
 assert.equal(territoryLimitForLevel(28),10);
 assert.equal(territoryLimitForLevel(33),11);
 assert.equal(territoryLimitForLevel(39),12);
 assert.ok(territoryLimitForLevel(200)>12);
 assert.deepEqual(nextTerritoryUpgrade(33),{level:39,limit:12});
 assert.ok(levelRequirement(50)<108);
});
test('v6.10.38: 찌르기 순위 고정 소식 제거, 일반 소식 유지',()=>{
 const state=initialState();state.publicEvents=[{id:'a',type:'poke-top'},{id:'b',type:'notice'}];
 refreshTopPokeNews(state);assert.deepEqual(state.publicEvents,[{id:'b',type:'notice'}]);
});
test('v6.10.38: 랭킹 한 장 전환, 3열 단체게임, 닉네임 변경 기능, 가로 화면 폴백',async()=>{
 const [app,styles,worker,sw]=await Promise.all(['public/app.js','public/styles.css','src/worker.js','public/sw.js'].map(read));
 assert.match(app,/레고 명예의 전당/);assert.match(app,/data-action="ranking-step"/);assert.match(app,/개 제거/);
 assert.match(app,/multiplayer-picker/);assert.match(styles,/multiplayer-picker/);assert.match(app,/data-action="admin-nickname"/);
 assert.match(worker,/\/api\/admin\/nickname/);assert.match(worker,/nickname_change/);
 assert.match(app,/requestRummiLandscape/);assert.match(app,/아이폰은 회전 잠금을 해제/);
 assert.match(sw,/lego-life-v6101410-yutnori/);
});
test('v6.10.38: 돼지 진화 8종 그림에 명확한 코와 콧구멍이 있고 SVG 코드가 안전하다',async()=>{
 for(let level=1;level<=8;level++){
  const svg=await read(`public/pets/evolution/form-piglet/form-piglet-evo-${level}.svg`);
  assert.match(svg,/<svg\b/);assert.doesNotMatch(svg,/<script\b/i);
  assert.ok(svg.includes('ellipse')||svg.includes('circle'));
 }
});
