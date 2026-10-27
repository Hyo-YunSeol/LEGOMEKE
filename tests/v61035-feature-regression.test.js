import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { initialState } from '../src/durable-store.js';
import { createPet, ensurePetSchema, purchaseShopItem, selectBodyAdvancement, bodyAdvancementView, eatAction, workAction, startMiniGame } from '../src/game/engine.js';
import { BODY_ADVANCEMENTS, EVOLUTION_STAGE_NAMES, EVOLUTION_STAGE_EXP } from '../src/game/constants.js';
import { createSichuanRoom, joinSichuanRoom, useSichuanShuffle, sichuanRoomView, shuffleSichuanRemaining, hasSichuanMove, playSichuanPair } from '../src/game/sichuan.js';
const DATE = new Date('2026-10-13T00:00:00.000Z');
function userWithPet(state,id) {
 const user={id,nickname:id,generation:1,currentPetId:null,sessionVersion:1,notifications:[]};
 const pet=createPet(user,1,DATE);user.currentPetId=pet.id;state.users[id]=user;state.pets[pet.id]=pet;
 pet.stats.points=100000;return {user,pet};
}
test('구매 1/3/5개 가격, 재시도 중복 방지, 6시간 리셋에도 남는 보유권',()=>{
 const state=initialState(DATE),{user,pet}=userWithPet(state,'buy');
 for(const [id,qty,price] of [['sichuanShuffle1',1,800],['sichuanShuffle3',3,2100],['sichuanShuffle5',5,3000]]) {
   const key=`op-test-${id}`;
   const res=purchaseShopItem(state,user,pet,id,{},key,DATE);
   assert.equal(res.ok,true);assert.equal(res.price,price);
   assert.equal(purchaseShopItem(state,user,pet,id,{},key,DATE).duplicate,true);
 }
 assert.equal(pet.sichuanShuffleTickets,9);
 ensurePetSchema(pet,new Date(DATE.getTime()+1000*60*60*24));
 assert.equal(pet.sichuanShuffleTickets,9);
});
test('서로 다른 제거량에서 패 수와 빈칸은 유지하며 한 사람이 양쪽을 섞고 판당 한번 제한',()=>{
 const state=initialState(DATE),a=userWithPet(state,'a'),b=userWithPet(state,'b');
 const created=createSichuanRoom(state,a.pet,100,DATE);assert.equal(created.ok,true);
 const joined=joinSichuanRoom(state,b.pet,created.roomId,DATE);assert.equal(joined.ok,true);
 const room=state.sichuan.rooms[created.roomId];assert.equal(room.status,'playing');
 const host=room.players[a.pet.id], guest=room.players[b.pet.id];
 const removePair=(p,kind)=>{
  const indexes=p.board.map((v,i)=>v===kind?i:-1).filter(i=>i>=0).slice(0,2);
  assert.equal(indexes.length,2);indexes.forEach(i=>p.board[i]=null);p.removedCount+=2;
 };
 removePair(host,'cat');removePair(host,'soccer');removePair(guest,'cat');
 const oldHostVacant=host.board.map((v,i)=>v===null?i:-1).filter(i=>i>=0),oldGuestVacant=guest.board.map((v,i)=>v===null?i:-1).filter(i=>i>=0);
 const item=purchaseShopItem(state,a.user,a.pet,'sichuanShuffle1',{},'shuffle-test-001',DATE);assert.equal(item.ok,true);
 const used=useSichuanShuffle(state,a.pet,created.roomId,DATE);assert.equal(used.ok,true,used.message);
 assert.equal(a.pet.sichuanShuffleTickets,0);
 assert.equal(room.players[a.pet.id].removedCount,4);assert.equal(room.players[b.pet.id].removedCount,2);
 assert.deepEqual(room.players[a.pet.id].board.map((v,i)=>v===null?i:-1).filter(i=>i>=0),oldHostVacant);
 assert.deepEqual(room.players[b.pet.id].board.map((v,i)=>v===null?i:-1).filter(i=>i>=0),oldGuestVacant);
 assert.ok(hasSichuanMove(room.players[a.pet.id].board));assert.ok(hasSichuanMove(room.players[b.pet.id].board));
 assert.equal(sichuanRoomView(state,created.roomId,a.pet.id,DATE).shuffleVersion,1);
 assert.equal(useSichuanShuffle(state,a.pet,created.roomId,DATE).ok,false);
 assert.equal(playSichuanPair(state,a.pet,created.roomId,{matchId:room.matchId,shuffleVersion:0,first:0,second:1,actionId:'stale-sichuan-test'},DATE).stale,true);
});
test('기존 동물 11종에서 7종으로 전환, 8단계 이름과 56개 실제 SVG 이미지', async()=>{
 assert.equal(Object.keys(BODY_ADVANCEMENTS).length,7);
 assert.equal(EVOLUTION_STAGE_EXP.at(-1),2300);
 for(const item of Object.values(BODY_ADVANCEMENTS)) {
  assert.equal(EVOLUTION_STAGE_NAMES[item.key].length,8);
  for(let level=1;level<=8;level++) await access(new URL(`../public/pets/${item.assetKey}-evo-${level}.svg`,import.meta.url));
 }
});
test('동물을 바꿔도 종별 성장 EXP를 보관하고 복귀하면 이어서 성장한다',()=>{
 const state=initialState(DATE),{pet}=userWithPet(state,'grow');pet.stats.body=8750;
 assert.equal(selectBodyAdvancement(pet,'piglet',DATE).ok,true);
 pet.animalEvolution.exp=1650;
 pet.animalEvolution.speciesExp.piglet=1650;
 pet.animalEvolution.history.piglet=7;
 assert.equal(bodyAdvancementView(pet,DATE).evolution.level,7);
 assert.equal(selectBodyAdvancement(pet,'catBean',DATE).ok,true);
 assert.equal(bodyAdvancementView(pet,DATE).evolution.exp,0);
 assert.equal(bodyAdvancementView(pet,DATE).evolution.history.piglet,7);
 assert.equal(selectBodyAdvancement(pet,'piglet',DATE).ok,true);
 assert.equal(bodyAdvancementView(pet,DATE).evolution.exp,1650);
 assert.equal(bodyAdvancementView(pet,DATE).evolution.level,7);
 assert.equal(bodyAdvancementView(pet,DATE).evolution.history.piglet,7);
});
test('성장 EXP는 현실 한국날짜·활동별 하루 한도를 지키며 무료 최종 진화 식사는 1회',()=>{
 const state=initialState(DATE),{pet}=userWithPet(state,'meal');pet.stats.body=8750;
 selectBodyAdvancement(pet,'piglet',DATE);
 for(let i=0;i<10;i++){pet.stats.hunger=0; const r=eatAction(pet,'triangle',DATE);assert.equal(r.ok,true);}
 assert.equal(pet.animalEvolution.today.food,60);
 assert.equal(pet.animalEvolution.exp,60);
 for(let i=0;i<12;i++){
  pet.daily.actionsLeft=5;pet.daily.nextActionAt=null;pet.stats.stamina=100;pet.stats.hunger=100;
  const r=workAction(pet,DATE);assert.equal(r.ok,true,r.message);
 }
 assert.equal(pet.animalEvolution.today.life,30);
 for(let i=0;i<5;i++){
  const res=startMiniGame(state,pet,'tetrisSingle',DATE);assert.equal(res.ok,true,res.message);
  for(const challenge of Object.values(state.miniGameChallenges)) challenge.completed=true;
 }
 assert.equal(pet.animalEvolution.today.mini,10);
 assert.equal(pet.animalEvolution.exp,100);
 pet.animalEvolution.exp=2300;
 pet.animalEvolution.speciesExp.piglet=2300;
 pet.stats.hunger=0;
 const initialPts=pet.stats.points;
 const free=eatAction(pet,'triangle',DATE);
 assert.equal(free.ok,true);assert.equal(pet.stats.points,initialPts);
 assert.equal(bodyAdvancementView(pet,DATE).evolution.freeMealAvailable,false);
 pet.stats.hunger=0;
 assert.equal(eatAction(pet,'triangle',DATE).ok,true);
 assert.equal(pet.stats.points,initialPts-20);
});
test('교미 문구에 요청한 회원명·오타 포함, 모두 사용',async()=>{
 const engine=await readFile(new URL('../src/game/engine.js',import.meta.url),'utf8');
 for(const text of ['이언이 ${withJosa(first','밍이 문 앞에 놓인 신발','리즈가 흡연실 문을 열었다가 바로 닫았습니다','마리가 “요즘 모기는 닉네임도 있냐?”','연락하지 않기로 해노코']) assert.ok(engine.includes(text),text);
});

test('대전 시작도 24시간 진화 미니게임 경험치 10EXP 한도를 공유한다', async()=>{
 const {consumeBattleForPets}=await import('../src/game/battle-limit.js');
 const state=initialState(DATE),one=userWithPet(state,'pvp-one'),two=userWithPet(state,'pvp-two');
 for(const {pet} of [one,two]) {pet.stats.body=8750;selectBodyAdvancement(pet,'piglet',DATE);}
 for(let i=0;i<7;i++) assert.equal(consumeBattleForPets([one.pet,two.pet],DATE).ok,true);
 assert.equal(one.pet.animalEvolution.exp,10);
 assert.equal(two.pet.animalEvolution.exp,10);
});
test('셔플권 최대 보유 한도에서 추가 구매하면 포인트가 차감되지 않는다',()=>{
 const state=initialState(DATE),{user,pet}=userWithPet(state,'cap');
 pet.sichuanShuffleTickets=9998;
 const before=pet.stats.points;
 const response=purchaseShopItem(state,user,pet,'sichuanShuffle3',{},'purchase-cap-test',DATE);
 assert.equal(response.ok,false);
 assert.equal(pet.stats.points,before);
 assert.equal(pet.sichuanShuffleTickets,9998);
});
