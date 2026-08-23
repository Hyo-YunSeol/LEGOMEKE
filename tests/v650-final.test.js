import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BODY_STAGES, TERRITORY_SIZE, TERRITORY_STEAL_COST } from '../src/game/constants.js';
import { territoryLimitForLevel, nextTerritoryUpgrade, levelUpperBound } from '../src/game/progression.js';
import { createPet, ensurePetSchema, createBung, joinBung, startBung, forceCancelBung } from '../src/game/engine.js';
import { initialState } from '../src/durable-store.js';
import { claimTerritory, territoryView, initialTerritory } from '../src/game/territory.js';
const BASE = new Date('2026-08-10T00:00:00.000Z');
function stateWithPet(userId,nickname){ const state=initialState(); const user={id:userId,nickname,generation:1,currentPetId:null,sessionVersion:1,notifications:[],createdAt:BASE.toISOString(),lastSeenAt:BASE.toISOString()}; const pet=createPet(user,1,BASE); user.currentPetId=pet.id; state.users[userId]=user; state.pets[pet.id]=pet; return {state,user,pet}; }

test('영토 최대 보유 수는 3레벨마다 1칸씩 증가하고 최대 10칸에서 멈춘다',()=>{
  assert.equal(TERRITORY_SIZE,5); assert.equal(TERRITORY_STEAL_COST,50);
  for(const [level,limit] of [[1,1],[3,1],[4,2],[6,2],[7,3],[10,4],[14,5],[20,7],[24,8],[27,9],[28,10],[999,10]]) assert.equal(territoryLimitForLevel(level),limit);
  assert.deepEqual(nextTerritoryUpgrade(5),{level:7,limit:3}); assert.deepEqual(nextTerritoryUpgrade(20),{level:22,limit:8}); assert.deepEqual(nextTerritoryUpgrade(27),{level:28,limit:10}); assert.equal(nextTerritoryUpgrade(28),null);
});

test('영토는 상대 땅 탈취 때 50P를 소모하고 기존 전쟁 룰을 유지한다',()=>{
  const {state,pet:a}=stateWithPet('a','공격자'); const ub={id:'b',nickname:'피해자',generation:1,currentPetId:null,sessionVersion:1,notifications:[],createdAt:BASE.toISOString(),lastSeenAt:BASE.toISOString()}; const b=createPet(ub,1,BASE); ub.currentPetId=b.id;state.users.b=ub;state.pets[b.id]=b;
  a.stats.legoPower=levelUpperBound(14)+1;b.stats.legoPower=levelUpperBound(14)+1;a.stats.points=100;b.stats.points=100;state.territory=initialTerritory(BASE);
  for(const [i,[r,c]] of [[0,[2,2]],[1,[2,3]],[2,[2,4]],[3,[3,3]],[4,[3,4]]]) assert.equal(claimTerritory(state,a,r,c,new Date(BASE.getTime()+i*1000)).ok,true);
  assert.equal(claimTerritory(state,b,0,0,new Date(BASE.getTime()+6000)).ok,true);assert.equal(claimTerritory(state,b,1,1,new Date(BASE.getTime()+7000)).ok,true);state.territory.battleUnlocked=true;
  const result=claimTerritory(state,a,1,1,new Date(BASE.getTime()+8000)); assert.equal(result.ok,true);assert.equal(result.stolenFromPetId,b.id);assert.equal(a.stats.points,50);assert.equal(territoryView(state,a.id).my.owned,5);
});

test('운영자 벙 강제취소는 환불·레고력 없이 벙을 제거한다',()=>{
  const {state,pet:host}=stateWithPet('host','방장'); const ug={id:'guest',nickname:'참가자',generation:1,currentPetId:null,sessionVersion:1,notifications:[],createdAt:BASE.toISOString(),lastSeenAt:BASE.toISOString()};const guest=createPet(ug,1,BASE);ug.currentPetId=guest.id;state.users.guest=ug;state.pets[guest.id]=guest;host.stats.points=5000;guest.stats.points=5000;const hp=host.stats.legoPower,gp=guest.stats.legoPower;
  const created=createBung(state,host,{title:'마감안한벙',stakePoints:500},BASE);joinBung(state,guest,created.bung,BASE);startBung(state,host,created.bung,BASE);const result=forceCancelBung(state,created.bung.id,new Date(BASE.getTime()+1000));assert.equal(result.ok,true);assert.equal(state.bungs[created.bung.id],undefined);assert.equal(host.stats.points,4500);assert.equal(host.stats.legoPower,hp);assert.equal(guest.stats.legoPower,gp);
});

test('도감 34단계 자산은 투명 배경 SVG로 연결된다',async()=>{
  assert.equal(BODY_STAGES.length,34); for(const [index,stage] of BODY_STAGES.entries()){const name=stage.assetKey||stage.key;const svg=await readFile(new URL(`../public/pets/${name}.svg`,import.meta.url),'utf8');assert.match(svg,/<svg/);assert.doesNotMatch(svg,/<rect\s+width="(?:220|240)"\s+height="(?:220|240)"/,`stage ${index+1}`);}
});

test('기존 저장 데이터의 파손/과거 꾸미기 상점 필드는 스키마 정리 때 제거된다',()=>{const {pet}=stateWithPet('legacy','레거시');pet.integrity={broken:true};pet.cosmetics={auroraUntil:BASE.toISOString()};pet.cosmeticExpiryNotices={aurora:'x'};ensurePetSchema(pet,BASE);assert.equal('integrity'in pet,false);assert.equal('cosmetics'in pet,false);assert.equal('cosmeticExpiryNotices'in pet,false);});
