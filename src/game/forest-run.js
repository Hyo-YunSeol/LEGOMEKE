// Server-side deterministic replay of original FOREST RUN game rules.
// Generated from the supplied original game logic; never trusts browser score.
export const FOREST_TICK_RATE = 30;
export const FOREST_MAX_TICKS = 600 * FOREST_TICK_RATE;
export const FOREST_SESSION_MS = 15 * 60_000;
export const FOREST_REWARD_MAX = 500;
export const FOREST_SCORE_PER_POINT = 100;
export function forestPayout(score) { return Math.min(FOREST_REWARD_MAX, Math.floor(Math.max(0, score) / FOREST_SCORE_PER_POINT)); }
export function verifyForestReplay(seed, ticks, events) {
  if (!Number.isSafeInteger(seed) || seed < 1 || seed > 0xffffffff || !Number.isSafeInteger(ticks) || ticks < 0 || ticks > FOREST_MAX_TICKS || !Array.isArray(events) || events.length > 6000) throw new Error('잘못된 숲의 모험 기록입니다.');
  let rngSeed=seed >>> 0;
  const forestRandom=()=>{rngSeed=(Math.imul(1664525,rngSeed)+1013904223)>>>0;return rngSeed/4294967296;};
  let W=360,H=620,s,state='menu',keys={},best=0,sound=false;
  const $=()=>({style:{},textContent:'',onclick:null});
  const document={querySelectorAll:()=>[],querySelector:()=>({style:{}})};
  const localStorage={setItem:()=>{}};
  function hud(){} function show(){} function hide(){} function beep(){}
  function finish(){state='end';}
function fresh(){s={x:.5,hp:100,max:100,atk:12,cnt:1,rate:2,pet:0,t:0,stageT:0,round:1,score:0,kills:0,arrowType:null,swordAtk:10,petReload:3.5,petShot:0,petVolley:1,reloadStacks:0,pendingRewards:null,chests:[],gates:[],normalSpawns:0,gatesDue:0,distance:0,playerY:.84,side:1,wave:0,miniCount:0,boosts:0,shot:0,spawn:1.5,inv:0,enemies:[],arrows:[],bad:[],sparks:[],boss:null,bossShot:0,fxTime:0,shake:0,defeatTimer:0};buildCourse();hud()}
const upgrades=[['갈래 화살','한 번에 쏘는 화살 +1 (최대 7발)',()=>s.arrowType==='spread'&&s.cnt<7,()=>s.cnt++],['단단한 화살촉','화살 공격력 +1',()=>true,()=>s.atk+=1],['바람의 시위','초당 발사 횟수 +0.7',()=>s.rate<7,()=>s.rate=Math.min(7,s.rate+.7)],['떠다니는 검','적을 조준하는 동료 +1 (최대 3자루)',()=>s.pet<3,()=>s.pet++],['생명의 잎','최대 체력 +25, 체력 45 회복',()=>true,()=>{s.max+=25;s.hp=Math.min(s.max,s.hp+45)}]];
function reloadReward(){let pct=1+Math.floor(forestRandom()*10);return ['검 재장전','재장전 -'+pct+'%',()=>true,()=>{let factor=1-pct/100;s.petReload*=factor;s.petShot*=factor;s.reloadStacks++;}];}
function upgradePool(){if(s.arrowType==='spirit')return [['검 각성','검 공격력 +1',()=>true,()=>s.swordAtk+=1],reloadReward(),['유도검 장전','동시에 발사하는 유도검 +1발 (제한 없음)',()=>true,()=>{if(s.pet===0){s.pet=1;s.petVolley=1;}else s.petVolley++;}],['가벼운 화살촉','일반 활 공격력 +0.5 (기본 강화량의 50%)',()=>true,()=>s.atk+=.5],upgrades[4]];return [...upgrades.filter((u,i)=>i===0?s.arrowType==='spread':i!==3),['유도검 장전','동시에 발사하는 검 +1자루 (없으면 검 획득)',()=>true,()=>{if(s.pet===0){s.pet=1;s.petVolley=1;}else s.petVolley++;}],['검 각성','검 공격력 +1',()=>true,()=>s.swordAtk+=1]];}
function selectArrow(type){if(state!=='arrowChoice'||s.arrowType)return;s.arrowType=type;if(type==='spread'){s.cnt=Math.max(s.cnt,Math.min(7,s.cnt+2));}else if(type==='power'){s.atk=Math.ceil(s.atk*2.8);}else{s.pet=Math.max(1,s.pet);s.petVolley=Math.max(3,s.petVolley);s.swordAtk+=5;}for(let gate of s.gates)if(!gate.used)gate.options=gateOptions();for(let box of s.chests)box.reward=rollReward();s.arrows=[];s.shot=0;s.petShot=0;s.boosts++;keys={};hud();hide();state='play';s.rewardTime=3;$('#reward').textContent='✦ '+({spread:'갈래 화살',power:'강철 화살',spirit:'검령 화살'}[type])+' 선택 완료';$('#reward').style.opacity=1;beep(800);}
function arrowChoice(){state='arrowChoice';keys={};show('<small>FIRST BOSS REWARD</small><h2>나만의 화살을 고르세요</h2><p>첫 중간보스 통과 보상 · 하나를 선택하세요.<br>지금까지 얻은 모든 강화는 그대로 유지됩니다.<br>일반 몬스터는 보물상자 · 이후 중간보스는 보상 선택.</p><button class="choice" data-arrow="spread"><b>1. 갈래 화살 ↗ ↑ ↖</b><span>기존 강화 유지 · 화살 +2발 (최대 7발) · 넓게 발사</span></button><button class="choice" data-arrow="power"><b>2. 강철 화살 ↑</b><span>기존 화살 수·동료 유지 · 화살 공격력 2.8배 · 이후 공격력과 속도 강화</span></button><button class="choice" data-arrow="spirit"><b>3. 검령 화살 ✦</b><span>검 유도탄 3발 일제사격 · 장전 수 제한 없음 · 재장전 1~10% 무작위 단축 · 일반 활 강화 +0.5</span></button>');document.querySelectorAll('[data-arrow]').forEach(b=>b.onclick=()=>selectArrow(b.dataset.arrow));}
function bossUpgradePool(){return upgradePool().map(u=>{switch(u[0]){case '갈래 화살':return [u[0]+' · 특급','화살 +2발 (최대 7발)',u[2],()=>s.cnt=Math.min(7,s.cnt+2)];case '단단한 화살촉':return [u[0]+' · 특급','공격력 +3',u[2],()=>s.atk+=3];case '가벼운 화살촉':return [u[0]+' · 특급','일반 활 공격력 +1.5',u[2],()=>s.atk+=1.5];case '바람의 시위':return [u[0]+' · 특급','발사 속도 +1.05회/초',u[2],()=>s.rate=Math.min(7,s.rate+1.05)];case '떠다니는 검':return [u[0]+' · 특급','검 +2자루 (최대 3자루)',u[2],()=>s.pet=Math.min(3,s.pet+2)];case '검 각성':return [u[0]+' · 특급','검 공격력 +3',u[2],()=>s.swordAtk+=3];case '유도검 장전':return [u[0]+' · 특급','유도검 +2발',u[2],()=>{s.pet=Math.max(1,s.pet);s.petVolley+=2;}];case '검 재장전':{let pct=6+Math.floor(forestRandom()*10);return [u[0]+' · 특급','재장전 -'+pct+'% (특급 6~15%)',()=>true,()=>{s.petReload*=1-pct/100;s.petShot*=1-pct/100;s.reloadStacks++;}];}case '생명의 잎':return [u[0]+' · 특급','최대 체력 +40, 체력 70 회복',u[2],()=>{s.max+=40;s.hp=Math.min(s.max,s.hp+70);}];default:return u;}});}
function finalUpgradePool(){let opts=[['전설의 화살촉','공격력 +'+(s.arrowType==='spirit'?18:36),()=>true,()=>s.atk+=s.arrowType==='spirit'?18:36],['생명의 나무','최대 체력 +120 · 체력 전부 회복',()=>true,()=>{s.max+=120;s.hp=s.max;}],['영웅의 힘','모든 공격력 40% 증가',()=>true,()=>{s.atk=Math.ceil(s.atk*1.4);s.swordAtk=Math.ceil(s.swordAtk*1.4);}],['폭풍의 시위','발사 속도 +2.1회/초 (최대 7회)',()=>s.rate<7,()=>s.rate=Math.min(7,s.rate+2.1)]];if(s.arrowType==='spirit')opts.push(['검의 군세','일제사격 유도검 +6발',()=>true,()=>s.petVolley+=6],['푸른 검의 각성','검 공격력 +9',()=>true,()=>s.swordAtk+=9],['초고속 장전','현재 재장전 시간 30% 단축',()=>true,()=>{s.petReload*=.7;s.petShot*=.7;}]);if(s.arrowType==='spread')opts.push(['화살 폭풍','화살 +3발 (최대 7발) · 공격력 +12',()=>s.cnt<7,()=>{s.cnt=Math.min(7,s.cnt+3);s.atk+=12;}]);return opts.filter(u=>u[2]());}
function finalReward(){s.boss=null;s.enemies=[];s.bad=[];s.arrows=[];state='finalReward';keys={};let opts=finalUpgradePool();for(let i=opts.length-1;i>0;i--){let j=Math.floor(forestRandom()*(i+1));[opts[i],opts[j]]=[opts[j],opts[i]]}s.pendingRewards=opts.slice(0,3);show('<small>LEGENDARY REWARD · ROUND '+s.round+'</small><h2>최종보스 전설 보상</h2><p>중간보스보다 훨씬 강한 강화를 선택하세요.<br>선택 후 모든 강화를 유지하고 다음 라운드로 이동합니다.</p>'+s.pendingRewards.map((u,i)=>'<button class="choice" data-final="'+i+'"><b>★ '+u[0]+'</b><span>'+u[1]+'</span></button>').join(''));document.querySelectorAll('[data-final]').forEach(b=>b.onclick=()=>selectFinalReward(+b.dataset.final));}
function selectFinalReward(i){if(state!=='finalReward'||!s.pendingRewards||!s.pendingRewards[i])return;let u=s.pendingRewards[i];s.pendingRewards=null;u[3]();s.boosts++;hide();state='play';nextRound();s.rewardTime=4;$('#reward').textContent='★ '+u[0]+' 획득! · 라운드 '+s.round;beep(900);}
function bossReward(){state='bossReward';keys={};let opts=bossUpgradePool().filter(u=>u[2]());for(let i=opts.length-1;i>0;i--){let j=Math.floor(forestRandom()*(i+1));[opts[i],opts[j]]=[opts[j],opts[i]]}s.pendingRewards=opts.slice(0,3);show('<small>BOSS REWARD</small><h2>중간보스 보상</h2><p>일반 보상보다 강한 특급 강화 중 하나를 선택하세요.<br>선택하는 동안 게임은 멈춥니다.</p>'+s.pendingRewards.map((u,i)=>'<button class="choice" data-reward="'+i+'"><b>'+u[0]+'</b><span>'+u[1]+'</span></button>').join(''));document.querySelectorAll('[data-reward]').forEach(b=>b.onclick=()=>selectBossReward(+b.dataset.reward));}
function selectBossReward(i){if(state!=='bossReward'||!s.pendingRewards||!s.pendingRewards[i])return;let u=s.pendingRewards[i];s.pendingRewards=null;u[3]();s.boosts++;keys={};hud();hide();state='play';s.rewardTime=3;$('#reward').textContent='✦ '+u[0]+' 획득! · '+u[1];$('#reward').style.opacity=1;beep(800);}
function grantUpgrade(u){if(!u[2]())u=upgradePool().find(v=>v[2]());u[3]();s.boosts++;s.rewardTime=2.8;$('#reward').textContent='✦ '+u[0]+' 획득! · '+u[1];$('#reward').style.opacity=1;hud();beep(800)}
function rollReward(){let opts=upgradePool().filter(u=>u[2]());return opts[Math.floor(forestRandom()*opts.length)];}
function randomUpgrade(){grantUpgrade(rollReward());}
function shortOption(u){if(u[0]==='갈래 화살')return '화살 +1발';if(u[0]==='단단한 화살촉')return '공격력 +1';if(u[0]==='가벼운 화살촉')return '공격력 +0.5';if(u[0]==='바람의 시위')return '발사 +0.7회/초';if(u[0]==='떠다니는 검')return '검 +1';if(u[0]==='검 각성')return u[1];if(u[0]==='유도검 장전')return '유도검 +1발';if(u[0]==='생명의 잎')return '최대 체력 +25';return u[1];}
function gateOptions(){let opts=upgradePool().filter(u=>u[2]());for(let i=opts.length-1;i>0;i--){let j=Math.floor(forestRandom()*(i+1));[opts[i],opts[j]]=[opts[j],opts[i]]}return opts.slice(0,2);}
function buildCourse(){s.course=[];s.gates=[];let z=20;for(let n=1;n<=30;n++){s.course.push({z,mini:false});z+=H*.7875;if(n%3===0){s.course.push({z,mini:true});z+=H*.4875;}}let arrivalOffset=(H*.84+30)/1.25;for(let i=0;i<s.course.length;i++){let event=s.course[i];if(event.mini)continue;let next=s.course[i+1],nextZ=next?next.z:event.z+H*.7875;let gate={worldZ:(event.z+nextZ)/2+arrivalOffset,options:gateOptions(),used:false,active:false};event.gate=gate;s.gates.push(gate);}}

function projectGate(gate){return {y:H*.84-(gate.worldZ-s.distance)*1.25,scale:1};}

function spiritDock(i){let angle=i*2.399963+.35,radius=6+Math.min(27,Math.sqrt(i)*6);return {x:s.x*W+Math.cos(angle)*radius,y:H*s.playerY+48+Math.sin(angle)*radius*.7};}

function updatePickups(dt){if(!s.boss)s.distance+=108*dt*speedMultiplier();for(let gate of s.gates){if(gate.active&&!gate.used&&s.distance>=gate.worldZ){grantUpgrade(gate.options[s.x<.5?0:1]);gate.used=true;}}s.gates=s.gates.filter(gate=>!gate.active||s.distance-gate.worldZ<H*.28);let py=H*s.playerY,px=s.x*W;for(let box of s.chests){let old=box.y;box.y+=135*dt*speedMultiplier();if(Math.abs(box.x-px)<35&&old<=py+28&&box.y>=py-28){box.used=true;burst(box.x,box.y);grantUpgrade(box.reward);}}s.chests=s.chests.filter(b=>!b.used&&b.y<H+40);}

function speedMultiplier(){return Math.min(1.6,1+Math.max(0,s.round-1)*.08);}
function roundMultiplier(){return 1+(s.round-1)*.15;}
function nextRound(){s.round++;s.stageT=0;s.distance=0;s.wave=0;s.side=1;s.normalSpawns=0;s.enemies=[];s.arrows=[];s.bad=[];s.chests=[];s.sparks=[];s.boss=null;s.bossShot=0;s.shake=0;s.defeatTimer=0;s.shot=0;s.petShot=0;s.inv=1;buildCourse();best=Math.max(best,s.score);try{localStorage.setItem('legoForestBest',best)}catch{}$('#best').textContent=best+'점';s.rewardTime=4;$('#reward').textContent='↟ 라운드 '+s.round+' 시작 · 적 체력 '+Math.round(roundMultiplier()*100)+'%';$('#reward').style.opacity=1;hud();}
function hurt(n){if(s.inv>0||state!=='play')return;s.hp-=n;s.inv=.85;beep(100);if(s.hp<=0)finish(false)}
function resolveMini(e,passed){if(e.resolved)return;e.resolved=true;e.hp=0;s.bad=[];s.enemies=s.enemies.filter(v=>v!==e);if(passed){s.hp=Math.max(0,s.hp-20);beep(100);if(s.hp<=0){hud();finish(false);return;}}hud();if(!s.arrowType)arrowChoice();else bossReward();}
function burst(x,y){for(let i=0;i<7;i++)s.sparks.push({x,y,vx:(forestRandom()-.5)*140,vy:(forestRandom()-.5)*140,life:.4})}
function fireArrows(px,py){let y=py-24;if(s.arrowType==='spread'){let depth=Math.max(1,y+30),left=Math.atan2(W*.28-px,depth),right=Math.atan2(W*.72-px,depth),center=Math.max(left,Math.min(right,0)),half=10*Math.PI/180,lo=Math.max(left,center-half),hi=Math.min(right,center+half);for(let i=0;i<s.cnt;i++){let angle=s.cnt===1?center:lo+(hi-lo)*i/(s.cnt-1);s.arrows.push({x:px,y,vx:Math.sin(angle)*520,vy:-Math.cos(angle)*520,d:s.atk,heavy:false});}}else{for(let i=0;i<s.cnt;i++)s.arrows.push({x:px+(i-(s.cnt-1)/2)*13,y,vx:(i-(s.cnt-1)/2)*12,vy:-520,d:s.atk,heavy:s.arrowType==='power'});}}
function step(dt){s.fxTime+=dt;s.shake=Math.max(0,s.shake-dt*8);if(state==='bossDefeat'){s.defeatTimer-=dt;for(let p of s.sparks){p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;}s.sparks=s.sparks.filter(p=>p.life>0);if(s.defeatTimer<=0)finalReward();return;}if(state!=='play')return;if(s.boss&&s.boss.intro>0){s.boss.intro=Math.max(0,s.boss.intro-dt);let p=1-s.boss.intro/1.8;s.boss.y=-80+195*(1-Math.pow(1-p,3));if(s.boss.intro===0){s.boss.y=115;s.shake=4;}return;}s.t+=dt;if(!s.enemies.some(e=>e.mini))s.stageT+=dt;s.inv-=dt;s.x=Math.max(.08,Math.min(.92,s.x+((keys.ArrowRight||keys.d?1:0)-(keys.ArrowLeft||keys.a?1:0))*dt*.8));let px=s.x*W,py=H*.84;s.shot-=dt;s.petShot=Math.max(0,s.petShot-dt);if(s.enemies.length===0)s.spawn-=dt;if(s.rewardTime>0){s.rewardTime-=dt;if(s.rewardTime<=0)$('#reward').style.opacity=0;}
if(s.shot<=0){s.shot=1/s.rate;fireArrows(px,py);beep(550)}
if(s.pet>0&&s.petShot<=0){let target=s.boss||s.enemies.find(e=>e.hp>0);if(target){s.petShot=s.petReload;for(let i=0;i<s.pet*s.petVolley;i++){let dock=spiritDock(i),dx=target.x-dock.x,dy=target.y-dock.y,l=Math.hypot(dx,dy)||1;s.arrows.push({x:dock.x,y:dock.y,vx:dx/l*450,vy:dy/l*450,d:s.swordAtk,pet:true,life:4})}beep(750)}}
if(s.stageT<90&&s.course.length&&s.distance>=s.course[0].z){let event=s.course.shift(),dps=(s.atk*s.rate*Math.min(s.cnt,3)+s.pet*s.petVolley*s.swordAtk/s.petReload);if(event.mini){s.wave=0;s.miniCount++;let hp=Math.ceil(180*Math.pow(Math.max(1,dps/24),.5)*roundMultiplier()*1.15);s.enemies.push({x:W/2,y:-45,r:126,hp,max:hp,v:135/1.69,mini:true,skin:s.miniCount%2?'kraken':'leviathan',fire:1.8});s.rewardTime=2.8;$('#reward').textContent='⚔ 중간보스 · 숲의 파수꾼 등장!';$('#reward').style.opacity=1;}else{event.gate.active=true;let tank=forestRandom()<.25,hp=Math.ceil((40*Math.pow(Math.max(1,dps/24),.5)+s.wave*4)*(tank?1.35:1)*roundMultiplier()*1.15);s.enemies.push({x:W*(s.side===1?.72:.28),y:-30,r:tank?100:70,hp,max:hp,v:135/1.69,tank,skin:['stego','brachio','purple','whale','abyss'][(s.normalSpawns+s.round-1)%5]});s.side*=-1;s.wave++;s.normalSpawns++;}}

if(s.stageT>=90&&!s.boss&&!s.enemies.some(e=>e.mini)){s.enemies=[];s.bad=[];let dps=(s.atk*s.rate*Math.min(s.cnt,3)+s.pet*s.petVolley*s.swordAtk/s.petReload),hp=Math.ceil(1700*Math.pow(Math.max(1,dps/100),.5)*roundMultiplier()*1.15);s.boss={x:W/2,y:-80,r:52,hp,max:hp,intro:1.8};s.bossShot=1.1;s.shake=2;beep(130)}
if(s.boss&&s.boss.intro<=0){let b=s.boss;b.x=W/2+Math.sin(s.t)*W*.28;s.bossShot-=dt;if(s.bossShot<=0){s.bossShot=.75;for(let i=-2;i<=2;i++)s.bad.push({x:b.x,y:b.y+40,vx:i*55,vy:200,r:6})}}
for(let e of s.enemies){e.y+=e.v*dt*1.69*speedMultiplier();if(e.mini){if(e.y>py+e.r){resolveMini(e,true);return;}if(e.y>=H*.25){e.fire-=dt;if(e.fire<=0){e.fire=1.8;let dx=px-e.x,dy=py-e.y,l=Math.hypot(dx,dy)||1;s.bad.push({x:e.x,y:e.y+25,vx:dx/l*145,vy:dy/l*145,r:6});}}}else if(Math.hypot(e.x-px,e.y-py)<e.r+17){e.hp=0;hurt(e.tank?24:14)}else if(e.y>H+30){e.hp=0;hurt(8)}}

for(let a of s.arrows){if(a.pet){a.life=(a.life??4)-dt;let targets=[...s.enemies,...(s.boss?[s.boss]:[])].filter(e=>e.hp>0);let target=targets.reduce((best,e)=>!best||Math.hypot(e.x-a.x,e.y-a.y)<Math.hypot(best.x-a.x,best.y-a.y)?e:best,null);if(target){let dx=target.x-a.x,dy=target.y-a.y,l=Math.hypot(dx,dy)||1;a.vx=dx/l*450;a.vy=dy/l*450;}}a.x+=a.vx*dt;a.y+=a.vy*dt;for(let e of [...s.enemies,...(s.boss?[s.boss]:[])])if(e.hp>0&&Math.hypot(e.x-a.x,e.y-a.y)<e.r+5){e.hp-=a.d;a.y=-100;burst(e.x,e.y);if(e.hp<=0){s.kills++;s.score+=e===s.boss?5000:e.mini?500:e.tank?100:50;beep(300);if(e===s.boss){state='bossDefeat';s.defeatTimer=1.3;s.shake=5;s.bad=[];s.arrows=[];for(let i=0;i<8;i++)burst(e.x+(forestRandom()-.5)*85,e.y+(forestRandom()-.5)*65);return}if(e.mini){resolveMini(e,false);return}s.chests.push({x:e.x,y:e.y,used:false,reward:rollReward()});}break}}
for(let a of s.bad){a.x+=a.vx*dt;a.y+=a.vy*dt;if(Math.hypot(a.x-px,a.y-py)<a.r+14){hurt(18);a.y=H+50}}s.bad=s.bad.filter(a=>a.y<H+20);s.arrows=s.arrows.filter(a=>(!a.pet||a.life>0)&&a.y>-30&&a.y<H+30&&a.x>-30&&a.x<W+30);s.enemies=s.enemies.filter(e=>e.hp>0);for(let p of s.sparks){p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt}s.sparks=s.sparks.filter(p=>p.life>0);if(state==='play')updatePickups(dt);hud()}
  fresh();state='play';
  let pos=0, lastTick=-1;
  for (let tick=0;tick<=ticks;tick++) {
    while (pos<events.length && events[pos][0] === tick) {
      const [at,type,value]=events[pos++];
      if (!Number.isInteger(at)||at<lastTick||at<0||at>ticks) throw new Error('입력 순서가 잘못됐습니다.');
      lastTick=at;
      if (type==='x') {
        if (state!=='play'||!Number.isInteger(value)||value<80||value>920) throw new Error('이동 기록이 잘못됐습니다.');
        s.x=value/1000;
      } else if (type==='key') {
        if (state!=='play'||![-1,0,1].includes(value)) throw new Error('키 입력이 잘못됐습니다.');
        keys={ArrowRight:value===1,ArrowLeft:value===-1};
      } else if (type==='arrow') {
        if (state!=='arrowChoice'||s.arrowType||!['spread','power','spirit'].includes(value)) throw new Error('무기 선택이 잘못됐습니다.');
        selectArrow(value);
      } else if (type==='boss') {
        if (state!=='bossReward'||!Number.isInteger(value)||value<0||value>=s.pendingRewards.length) throw new Error('보상 선택이 잘못됐습니다.');
        selectBossReward(value);
      } else if (type==='final') {
        if (state!=='finalReward'||!Number.isInteger(value)||value<0||value>=s.pendingRewards.length) throw new Error('전설 선택이 잘못됐습니다.');
        selectFinalReward(value);
      } else throw new Error('지원하지 않는 입력입니다.');
    }
    if (tick===ticks) break;
    if (!['play','bossDefeat'].includes(state)) throw new Error('보상 선택 화면에서 전투시간이 진행됐습니다.');
    step(1/FOREST_TICK_RATE);
    if (state==='end' && tick+1<ticks) throw new Error('종료된 게임의 추가 입력입니다.');
  }
  if (pos!==events.length) throw new Error('범위를 벗어난 입력이 있습니다.');
  return {score:s.score,kills:s.kills,round:s.round,dead:state==='end',state,combatTicks:ticks};
}
