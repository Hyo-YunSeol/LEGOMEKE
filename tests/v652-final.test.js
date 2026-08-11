import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createPet } from '../src/game/engine.js';
import { initialState } from '../src/durable-store.js';
import { initialTerritory, claimTerritory, territoryView } from '../src/game/territory.js';
import { levelUpperBound } from '../src/game/progression.js';
const BASE=new Date('2026-08-10T01:00:00.000Z');
function addPet(state,id,nickname){const user={id,nickname,generation:1,currentPetId:null,sessionVersion:1,workoutBadge:false,notifications:[],createdAt:BASE.toISOString(),lastSeenAt:BASE.toISOString()};const pet=createPet(user,1,BASE);user.currentPetId=pet.id;state.users[id]=user;state.pets[pet.id]=pet;return pet;}

test('하단 5개 메뉴는 캐시된 탭 pane을 show/hide하고 전체 view를 매번 갈지 않는다',async()=>{const app=await readFile(new URL('../public/app.js',import.meta.url),'utf8');assert.match(app,/function ensureTabPanes/);assert.match(app,/function showTabPane/);assert.match(app,/function renderTab/);assert.match(app,/function warmInactiveTabs/);assert.match(app,/showTabPane\(tabName\)/);assert.doesNotMatch(app,/if \(app\.tab === 'home'\) view\.innerHTML/);assert.match(app,/bottomNav\?\.addEventListener\('pointerdown'/);});

test('영토 한도에 꽉 차도 기존 규칙대로 상대 땅 탈취는 가능하다',()=>{const state=initialState();const a=addPet(state,'a','공격자'),b=addPet(state,'b','피해자');a.stats.legoPower=levelUpperBound(5)+1;b.stats.legoPower=levelUpperBound(5)+1;a.stats.points=100;b.stats.points=100;state.territory=initialTerritory(BASE);for(const [i,[r,c]] of [[0,[2,2]],[1,[2,3]],[2,[2,4]],[3,[3,3]],[4,[3,4]]])claimTerritory(state,a,r,c,new Date(BASE.getTime()+i*1000));claimTerritory(state,b,0,0,new Date(BASE.getTime()+6000));claimTerritory(state,b,1,1,new Date(BASE.getTime()+7000));state.territory.battleUnlocked=true;const r=claimTerritory(state,a,1,1,new Date(BASE.getTime()+8000));assert.equal(r.ok,true);assert.equal(a.stats.points,80);assert.equal(territoryView(state,a.id).my.owned,5);});

test('서비스워커와 정적 자산 캐시버전은 654로 동기화된다',async()=>{const sw=await readFile(new URL('../public/sw.js',import.meta.url),'utf8');const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');const app=await readFile(new URL('../public/app.js',import.meta.url),'utf8');assert.match(sw,/lego-life-v654-final/);assert.match(sw,/styles\.css\?v=654/);assert.match(html,/app\.js\?v=654/);assert.match(app,/sw\.js\?v=654/);});
