import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BODY_STAGES, TERRITORY_SIZE, TERRITORY_STEAL_COST } from '../src/game/constants.js';
import { territoryLimitForLevel, nextTerritoryUpgrade, levelUpperBound } from '../src/game/progression.js';
import { createPet, ensurePetSchema, createBung, joinBung, startBung, forceCancelBung, buyCosmetic, cosmeticView, COSMETIC_SHOP } from '../src/game/engine.js';
import { initialState } from '../src/durable-store.js';
import { claimTerritory, territoryView, initialTerritory } from '../src/game/territory.js';

const BASE = new Date('2026-08-10T00:00:00.000Z');

function stateWithPet(userId, nickname) {
  const state = initialState();
  const user = { id:userId, nickname, generation:1, currentPetId:null, sessionVersion:1, notifications:[], createdAt:BASE.toISOString(), lastSeenAt:BASE.toISOString() };
  const pet = createPet(user, 1, BASE);
  user.currentPetId = pet.id;
  state.users[userId] = user;
  state.pets[pet.id] = pet;
  return { state, user, pet };
}

test('영토 최대 보유 수는 확정 레벨 구간대로 증가하고 10칸에서 멈춘다', () => {
  assert.equal(TERRITORY_SIZE, 5);
  assert.equal(TERRITORY_STEAL_COST, 20);
  const cases = [[1,1],[2,2],[3,3],[4,4],[5,4],[6,5],[8,5],[9,6],[12,6],[13,7],[17,7],[18,8],[23,8],[24,9],[30,9],[31,10],[999,10]];
  for (const [level, limit] of cases) assert.equal(territoryLimitForLevel(level), limit, `Lv.${level}`);
  assert.deepEqual(nextTerritoryUpgrade(5), { level:6, limit:5 });
  assert.deepEqual(nextTerritoryUpgrade(30), { level:31, limit:10 });
  assert.equal(nextTerritoryUpgrade(31), null);
});



test('영토는 실제 레벨 한도를 적용하고 상대 땅 탈취 때만 정확히 20P를 소모한다', () => {
  const setupA=stateWithPet('a','공격자');
  const { state, pet:a }=setupA;
  const userB={ id:'b', nickname:'피해자', generation:1, currentPetId:null, sessionVersion:1, notifications:[], createdAt:BASE.toISOString(), lastSeenAt:BASE.toISOString() };
  const b=createPet(userB,1,BASE); userB.currentPetId=b.id; state.users.b=userB; state.pets[b.id]=b;
  a.stats.legoPower=levelUpperBound(5)+1; // Lv.6 -> 최대 5칸
  b.stats.legoPower=levelUpperBound(5)+1;
  a.stats.points=100; b.stats.points=100;
  state.territory=initialTerritory(BASE);

  const first=claimTerritory(state,a,2,2,BASE);
  assert.equal(first.ok,true); assert.equal(first.myLimit,5); assert.equal(a.stats.points,100,'빈 땅은 무료');
  assert.equal(claimTerritory(state,a,2,3,new Date(BASE.getTime()+1000)).ok,true);
  assert.equal(claimTerritory(state,a,2,4,new Date(BASE.getTime()+2000)).ok,true);
  assert.equal(claimTerritory(state,a,3,3,new Date(BASE.getTime()+3000)).ok,true);
  assert.equal(claimTerritory(state,a,3,4,new Date(BASE.getTime()+4000)).ok,true);
  assert.equal(territoryView(state,a.id).my.limit,5);
  assert.equal(territoryView(state,a.id).my.owned,5);

  const bFirst=claimTerritory(state,b,0,0,new Date(BASE.getTime()+5000));
  assert.equal(bFirst.ok,true);
  const bSecond=claimTerritory(state,b,1,1,new Date(BASE.getTime()+6000));
  assert.equal(bSecond.ok,true);
  state.territory.battleUnlocked=true; // 실제 전면전 상태에서 상대 본진 포함 탈취 가능
  const before=a.stats.points;
  const stealAtCap=claimTerritory(state,a,1,1,new Date(BASE.getTime()+7000));
  assert.equal(stealAtCap.ok,true,'보유 한도가 꽉 차도 상대 땅은 이동 방식으로 탈취할 수 있어야 한다');
  assert.equal(stealAtCap.stolenFromPetId,b.id);
  assert.ok(stealAtCap.released,'한도 유지용으로 기존 일반 영토 한 칸을 비워야 한다');
  assert.equal(a.stats.points,before-20);
  assert.equal(territoryView(state,a.id).my.owned,5,'탈취 뒤에도 최대 보유 수를 넘지 않는다');

  const emptyAtCap=claimTerritory(state,a,4,4,new Date(BASE.getTime()+7500));
  assert.equal(emptyAtCap.ok,false,'한도에 찬 상태의 빈 땅 추가 확장은 계속 막아야 한다');
  assert.equal(a.stats.points,before-20,'빈 땅 한도 차단에는 포인트를 쓰지 않는다');

  delete state.territory.cells['3:4']; // 내 땅을 하나 잃어 4/5가 된 상황
  const steal=claimTerritory(state,a,0,0,new Date(BASE.getTime()+8000));
  assert.equal(steal.ok,true);
  assert.equal(steal.stolenFromPetId,b.id);
  assert.equal(a.stats.points,before-40);
  assert.equal(territoryView(state,a.id).my.owned,5,'빈자리가 있을 때 탈취하면 다시 한도까지 보유할 수 있다');
});

test('운영자 벙 강제취소는 벙만 제거하고 포인트·레고력·오늘의 레고력을 돌려주거나 지급하지 않는다', () => {
  const hostSetup = stateWithPet('host','방장');
  const { state, pet:host } = hostSetup;
  const user2 = { id:'guest', nickname:'참가자', generation:1, currentPetId:null, sessionVersion:1, notifications:[], createdAt:BASE.toISOString(), lastSeenAt:BASE.toISOString() };
  const guest = createPet(user2, 1, BASE); user2.currentPetId=guest.id; state.users.guest=user2; state.pets[guest.id]=guest;
  host.stats.points=5000; guest.stats.points=5000;
  const beforePowerHost=host.stats.legoPower, beforePowerGuest=guest.stats.legoPower;
  const created=createBung(state,host,{title:'마감안한벙',stakePoints:500},BASE);
  assert.equal(created.ok,true);
  assert.equal(host.stats.points,4500);
  assert.equal(joinBung(state,guest,created.bung,BASE).ok,true);
  assert.equal(startBung(state,host,created.bung,BASE).ok,true);
  const result=forceCancelBung(state,created.bung.id,new Date(BASE.getTime()+1000));
  assert.equal(result.ok,true);
  assert.equal(state.bungs[created.bung.id],undefined);
  assert.equal(host.stats.points,4500,'개설비 반환 금지');
  assert.equal(host.stats.legoPower,beforePowerHost);
  assert.equal(guest.stats.legoPower,beforePowerGuest);
  assert.equal(host.daily.legoGoals.bungHost,false);
  assert.equal(host.daily.legoGoals.bungJoin,false);
  assert.equal(guest.daily.legoGoals.bungJoin,false);
});

test('꾸미기 상점 배경과 오라는 포인트를 소모하고 실제 뷰에 활성 상태를 준다', () => {
  const { pet } = stateWithPet('u','꾸미기');
  pet.stats.points=20000;
  const aura=buyCosmetic(pet,'aurora',BASE);
  assert.equal(aura.ok,true);
  assert.equal(cosmeticView(pet,BASE).aurora,true);
  const background=buyCosmetic(pet,'bg-space',BASE);
  assert.equal(background.ok,true);
  const view=cosmeticView(pet,BASE);
  assert.equal(view.background,'space');
  assert.ok(view.expiresAt.background);
  assert.ok(COSMETIC_SHOP.filter((item)=>item.kind==='background').length>=8);
});

test('도감 28단계 이름/구간과 1~6 하찮은 노랑, 7부터 정식 레고 자산이 연결된다', async () => {
  assert.equal(BODY_STAGES.length,28);
  assert.deepEqual(BODY_STAGES.slice(0,7).map((s)=>s.label), ['마름레고','보통레고','육덕레고','짭덥레고','멸떱레고','통통레고','비떱레고']);
  assert.equal(BODY_STAGES[27].label,'아르헨티노사우루스레고');
  const names = BODY_STAGES.map((stage)=>stage.assetKey || stage.key);
  for (const [index,name] of names.entries()) {
    const svg=await readFile(new URL(`../public/pets/${name}.svg`, import.meta.url),'utf8');
    assert.match(svg, /<svg/);
    assert.doesNotMatch(svg, /<rect\s+width="(?:220|240)"\s+height="(?:220|240)"/, `stage ${index+1} body art must stay transparent`);
    if (index < 6) assert.match(svg, /#ffd84d|#f7c928|#f2bd20/, `stage ${index+1} should use cheap yellow family`);
  }
  const distinct = {
    'hippo': /하마레고|wide|hippo/i,
    'wild-boar': /매태지레고/,
    'pig-ultra-daeruk': /초대룩레고/,
    'pig-emperor': /돼황레고/,
    'pig-monster': /괴수돼지레고/,
    'pig-bedbreaker': /침대파괴돼지레고/,
    'pig-disaster-text': /재난문자돼지레고/,
    'pig-national-emergency': /국가비상돼지레고/
  };
  for (const [name,pattern] of Object.entries(distinct)) {
    const svg=await readFile(new URL(`../public/pets/${name}.svg`, import.meta.url),'utf8');
    assert.match(svg,pattern);
  }
});

test('최종 CSS는 주민목록 PC/모바일 5열, 오늘의 레고력 5열, 순위 2/3/2열, 영토 5열을 강제한다', async () => {
  const css=await readFile(new URL('../public/styles.css',import.meta.url),'utf8');
  const final=css.slice(css.lastIndexOf('/* v6.5.0 최종'));
  assert.match(final,/\.resident-grid\s*\{\s*grid-template-columns:repeat\(5/);
  assert.match(final,/@media \(max-width:520px\)[\s\S]*?\.resident-grid\s*\{\s*grid-template-columns:repeat\(5/);
  assert.match(final,/\.daily-goals-compact \.goal-list\s*\{\s*grid-template-columns:repeat\(5/);
  assert.match(final,/\.ranking-section \.rank-tabs-grid\s*\{\s*grid-template-columns:repeat\(2/);
  assert.match(final,/\.ranking-section \.game-rank-grid\s*\{\s*grid-template-columns:repeat\(3/);
  assert.match(final,/\.territory-row\s*\{\s*grid-template-columns:repeat\(5/);
  assert.match(final,/\.cos-aura \.pet-visual::before/);
  assert.match(final,/\.cos-bg-space/);
});

test('하단 메뉴는 API 처리 중에도 눌릴 수 있고 직접 포인터/클릭 처리한다', async () => {
  const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
  const app=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
  assert.equal((html.match(/data-allow-busy="true"/g)||[]).length,5);
  assert.match(app,/bottomNav\?\.addEventListener\('click'/);
  assert.doesNotMatch(app,/lastTouchNavAt/);
  assert.doesNotMatch(app,/bottomNav\?\.addEventListener\('pointerup'/);
  assert.match(app,/if \(app\.modal\) closeModal\(\)/);
  const css=await readFile(new URL('../public/styles.css',import.meta.url),'utf8');
  const final=css.slice(css.lastIndexOf('/* v6.5.0 최종'));
  assert.match(final,/\.bottom-nav \{[\s\S]*?z-index:\s*140/,'하단 메뉴는 모달보다 위에 있어 즉시 탭 전환 가능해야 한다');
  assert.match(final,/\.modal-root \{[\s\S]*?inset:\s*0 0 calc\(72px/,'모달은 하단 메뉴 위에서 끝나야 한다');
});

test('관리자 화면과 API에는 벙 강제취소가 연결되어 있다', async () => {
  const app=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
  const worker=await readFile(new URL('../src/worker.js',import.meta.url),'utf8');
  assert.match(app,/data-action="admin-force-bung"/);
  assert.match(app,/포인트는 반환되지 않고 참가자·벙주 레고력/);
  assert.match(worker,/\/api\/admin\/bungs\/:bungId\/force-cancel/);
  assert.match(worker,/bung_force_cancel/);
});

test('파손 시스템은 사용자 API/화면에서 완전히 제거되어 있다', async () => {
  const app=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
  const worker=await readFile(new URL('../src/worker.js',import.meta.url),'utf8');
  assert.doesNotMatch(app,/파손 경고|부숴졌습니다/);
  assert.doesNotMatch(worker,/breakWarningMax|breakInactivityHours|restartBrokenPet|applyInactivityConsequence/);
});


test('기존 저장 데이터의 파손 필드는 마이그레이션 때 실제로 제거된다', () => {
  const { pet } = stateWithPet('legacy','레거시');
  pet.integrity = { broken:true, warnings:3, reason:'old-break-system' };
  ensurePetSchema(pet, BASE);
  assert.equal('integrity' in pet, false);
});

test('확정 알림 5종이 서버 코드에 모두 연결되어 있다', async () => {
  const worker=await readFile(new URL('../src/worker.js',import.meta.url),'utf8');
  const engine=await readFile(new URL('../src/game/engine.js',import.meta.url),'utf8');
  assert.match(worker,/territory-stolen/);
  assert.match(engine,/\'poke\'/);
  assert.match(worker,/omok-opponent/);
  assert.match(worker,/game-season/);
  assert.match(worker,/cosmetic-expiry/);
});
