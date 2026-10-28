
const $=x=>document.querySelector(x),c=$('#c'),g=c.getContext('2d');let W=360,H=620,s,state='menu',last=0,keys={},drag=false,best=0,sound=false,audio;
let forestSeed=0, rngSeed=0, combatTicks=0, forestEvents=[], forestActive=false, forestSettling=false, forestSettled=false;
let forestStartMs=0, forestSessionCreatedAt=0, lastForestSend=0, frameRemainder=0, lastPositionTick=-100;
const forestRandom=()=>{rngSeed=(Math.imul(1664525,rngSeed)+1013904223)>>>0;return rngSeed/4294967296;};
const token=localStorage.getItem('lego_token');
const challengeId=new URLSearchParams(location.search).get('challenge');
async function forestApi(path,body){
  const res=await fetch(path,{method:'POST',headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'});
  const data=await res.json();if(!res.ok||!data.ok)throw Error(data.message||'정산 요청이 거부됐습니다.');return data;
}
function forestRecord(type,value){if(forestEvents.length>=6000){toastForestError('입력이 너무 많습니다.');return;}forestEvents.push([combatTicks,type,value]);}
function toastForestError(message){const el=document.querySelector('#forest-status');if(el)el.textContent=message;}
async function forestCheckpoint(force=false){
  if(!forestActive||forestSettled||forestSettling||(!force&&Date.now()-lastForestSend<18000))return;
  lastForestSend=Date.now();
  try{await forestApi('/api/minigames/forest/checkpoint',{challengeId,ticks:combatTicks,events:forestEvents});}catch(e){toastForestError('진행 기록 저장 실패 · '+e.message);}
}
async function forestSettle(reason){
  if(forestSettled||forestSettling)return;
  forestSettling=true;forestActive=false;keys={};
  toastForestError('서버에서 게임 기록을 검증하고 정산하는 중...');
  try {
    const result=await forestApi('/api/minigames/forest/finish',{challengeId,ticks:combatTicks,events:forestEvents,reason,clientScore:s?.score||0});
    forestSettled=true;
    show('<small>FOREST RUN · 정산 완료</small><h2>'+Number(result.verifiedScore).toLocaleString('ko-KR')+'점 · +'+result.reward+'P</h2><p>'+result.detail+'</p><p>서버 검증 점수만 포인트로 지급합니다.</p><button class="mainbtn" id="return">LEGO LIFE로 돌아가기</button>');
    document.querySelector('#return').onclick=()=>location.replace('/?tab=games');
  } catch(e){forestSettling=false;show('<h2>정산 확인 필요</h2><p>'+String(e.message).replace(/[<>]/g,'')+'</p><button class="mainbtn" id="retry-settle">다시 정산 요청</button><p>오류가 계속되면 사이트로 돌아가 재접속해 주세요.</p>');document.querySelector('#retry-settle').onclick=()=>forestSettle(reason);}
}

try{best=+localStorage.getItem('legoForestBest')||0}catch{}$('#best').textContent=best+'점';
function resize(){const d=Math.min(devicePixelRatio||1,2);c.width=Math.round(W*d);c.height=Math.round(H*d);g.setTransform(d,0,0,d,0,0)}resize();addEventListener('resize',resize);
function beep(f){if(!sound)return;try{audio||=new AudioContext();let o=audio.createOscillator(),v=audio.createGain();o.connect(v);v.connect(audio.destination);o.frequency.value=f;v.gain.setValueAtTime(.02,audio.currentTime);v.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.07);o.start();o.stop(audio.currentTime+.07)}catch{}}
function fresh(){s={x:.5,hp:100,max:100,atk:12,cnt:1,rate:2,pet:0,t:0,stageT:0,round:1,score:0,kills:0,arrowType:null,swordAtk:10,petReload:3.5,petShot:0,petVolley:1,reloadStacks:0,pendingRewards:null,chests:[],gates:[],normalSpawns:0,gatesDue:0,distance:0,playerY:.84,side:1,wave:0,miniCount:0,boosts:0,shot:0,spawn:1.5,inv:0,enemies:[],arrows:[],bad:[],sparks:[],boss:null,bossShot:0,fxTime:0,shake:0,defeatTimer:0};buildCourse();hud()}
function hud(){$('#atk').textContent=s.atk;$('#cnt').textContent=s.cnt+'발';$('#rate').textContent=s.rate.toFixed(1)+'회';$('#swordCount').textContent=(s.pet*s.petVolley)+'자루';$('#swordDamage').textContent=(s.swordAtk).toFixed(1)+' / 자루';$('#pet').textContent=(s.pet>0?'사용 중':'미획득')+(s.arrowType==='spirit'?' · 일제사격 '+s.petVolley+'발 · 재장전 단축 '+(100*(1-s.petReload/3.5)).toFixed(1)+'% · 대기 '+Math.max(0,s.petShot).toFixed(1)+'초 / '+s.petReload.toFixed(1)+'초':'');$('#score').textContent=s.score+'점';$('#bar').style.width=Math.max(0,s.hp/s.max*100)+'%';$('#hp').textContent='체력 '+Math.max(0,Math.ceil(s.hp))+' / '+s.max;$('#timer').textContent=s.enemies.some(e=>e.mini)?'중간보스 · 최종보스 타이머 정지':s.stageT<90?'보스까지 '+Math.ceil(90-s.stageT)+'초':'보스전';$('#stage').textContent=s.enemies.some(e=>e.mini)?'MID BOSS / 숲의 파수꾼':s.stageT<30?'01 / 이끼 숲':s.stageT<60?'02 / 깊은 숲':s.stageT<90?'03 / 고대 유적':'FINAL / 숲의 수호자';$('#stage').textContent='R'+s.round+' · ×'+speedMultiplier().toFixed(2)+' · '+$('#stage').textContent;}
function show(html){$('#overlay').hidden=false;$('#modal').innerHTML=html}function hide(){$('#overlay').hidden=true}function start(){if(forestActive||forestSettled||forestSettling)return;rngSeed=forestSeed;combatTicks=0;forestEvents=[];forestStartMs=forestSessionCreatedAt;forestActive=true;frameRemainder=0;lastRecordedKey=0;lastPositionTick=-100;fresh();state='play';keys={};$('#reward').style.opacity=0;hide();$('#pause').textContent='일시정지'}
function pause(){if(state==='play'){if(lastRecordedKey){forestRecord('key',0);lastRecordedKey=0;}state='paused';keys={};show('<small>TAKE A BREATH</small><h2>잠깐 쉬어가요.</h2><p>모험은 여기서 기다릴게요.</p><button class="mainbtn" id="resume">계속하기 →</button>');$('#resume').onclick=pause;$('#pause').textContent='계속하기'}else if(state==='paused'){state='play';hide();$('#pause').textContent='일시정지'}}$('#pause').onclick=pause;$('#sound').onclick=()=>{sound=!sound;$('#sound').textContent=sound?'소리 켜짐':'소리 꺼짐';beep(600)};
const upgrades=[['갈래 화살','한 번에 쏘는 화살 +1 (최대 7발)',()=>s.arrowType==='spread'&&s.cnt<7,()=>s.cnt++],['단단한 화살촉','화살 공격력 +1',()=>true,()=>s.atk+=1],['바람의 시위','초당 발사 횟수 +0.7',()=>s.rate<7,()=>s.rate=Math.min(7,s.rate+.7)],['떠다니는 검','적을 조준하는 동료 +1 (최대 3자루)',()=>s.pet<3,()=>s.pet++],['생명의 잎','최대 체력 +25, 체력 45 회복',()=>true,()=>{s.max+=25;s.hp=Math.min(s.max,s.hp+45)}]];
function reloadReward(){let pct=1+Math.floor(forestRandom()*10);return ['검 재장전','재장전 -'+pct+'%',()=>true,()=>{let factor=1-pct/100;s.petReload*=factor;s.petShot*=factor;s.reloadStacks++;}];}
function upgradePool(){if(s.arrowType==='spirit')return [['검 각성','검 공격력 +1',()=>true,()=>s.swordAtk+=1],reloadReward(),['유도검 장전','동시에 발사하는 유도검 +1발 (제한 없음)',()=>true,()=>{if(s.pet===0){s.pet=1;s.petVolley=1;}else s.petVolley++;}],['가벼운 화살촉','일반 활 공격력 +0.5 (기본 강화량의 50%)',()=>true,()=>s.atk+=.5],upgrades[4]];return [...upgrades.filter((u,i)=>i===0?s.arrowType==='spread':i!==3),['유도검 장전','동시에 발사하는 검 +1자루 (없으면 검 획득)',()=>true,()=>{if(s.pet===0){s.pet=1;s.petVolley=1;}else s.petVolley++;}],['검 각성','검 공격력 +1',()=>true,()=>s.swordAtk+=1]];}
function selectArrow(type){if(state!=='arrowChoice'||s.arrowType)return;forestRecord('arrow',type);s.arrowType=type;if(type==='spread'){s.cnt=Math.max(s.cnt,Math.min(7,s.cnt+2));}else if(type==='power'){s.atk=Math.ceil(s.atk*2.8);}else{s.pet=Math.max(1,s.pet);s.petVolley=Math.max(3,s.petVolley);s.swordAtk+=5;}for(let gate of s.gates)if(!gate.used)gate.options=gateOptions();for(let box of s.chests)box.reward=rollReward();s.arrows=[];s.shot=0;s.petShot=0;s.boosts++;keys={};lastRecordedKey=0;hud();hide();state='play';s.rewardTime=3;$('#reward').textContent='✦ '+({spread:'갈래 화살',power:'강철 화살',spirit:'검령 화살'}[type])+' 선택 완료';$('#reward').style.opacity=1;beep(800);}
function arrowChoice(){state='arrowChoice';keys={};lastRecordedKey=0;show('<small>FIRST BOSS REWARD</small><h2>나만의 화살을 고르세요</h2><p>첫 중간보스 통과 보상 · 하나를 선택하세요.<br>지금까지 얻은 모든 강화는 그대로 유지됩니다.<br>일반 몬스터는 보물상자 · 이후 중간보스는 보상 선택.</p><button class="choice" data-arrow="spread"><b>1. 갈래 화살 ↗ ↑ ↖</b><span>기존 강화 유지 · 화살 +2발 (최대 7발) · 넓게 발사</span></button><button class="choice" data-arrow="power"><b>2. 강철 화살 ↑</b><span>기존 화살 수·동료 유지 · 화살 공격력 2.8배 · 이후 공격력과 속도 강화</span></button><button class="choice" data-arrow="spirit"><b>3. 검령 화살 ✦</b><span>검 유도탄 3발 일제사격 · 장전 수 제한 없음 · 재장전 1~10% 무작위 단축 · 일반 활 강화 +0.5</span></button>');document.querySelectorAll('[data-arrow]').forEach(b=>b.onclick=()=>selectArrow(b.dataset.arrow));}
function bossUpgradePool(){return upgradePool().map(u=>{switch(u[0]){case '갈래 화살':return [u[0]+' · 특급','화살 +2발 (최대 7발)',u[2],()=>s.cnt=Math.min(7,s.cnt+2)];case '단단한 화살촉':return [u[0]+' · 특급','공격력 +3',u[2],()=>s.atk+=3];case '가벼운 화살촉':return [u[0]+' · 특급','일반 활 공격력 +1.5',u[2],()=>s.atk+=1.5];case '바람의 시위':return [u[0]+' · 특급','발사 속도 +1.05회/초',u[2],()=>s.rate=Math.min(7,s.rate+1.05)];case '떠다니는 검':return [u[0]+' · 특급','검 +2자루 (최대 3자루)',u[2],()=>s.pet=Math.min(3,s.pet+2)];case '검 각성':return [u[0]+' · 특급','검 공격력 +3',u[2],()=>s.swordAtk+=3];case '유도검 장전':return [u[0]+' · 특급','유도검 +2발',u[2],()=>{s.pet=Math.max(1,s.pet);s.petVolley+=2;}];case '검 재장전':{let pct=6+Math.floor(forestRandom()*10);return [u[0]+' · 특급','재장전 -'+pct+'% (특급 6~15%)',()=>true,()=>{s.petReload*=1-pct/100;s.petShot*=1-pct/100;s.reloadStacks++;}];}case '생명의 잎':return [u[0]+' · 특급','최대 체력 +40, 체력 70 회복',u[2],()=>{s.max+=40;s.hp=Math.min(s.max,s.hp+70);}];default:return u;}});}
function finalUpgradePool(){let opts=[['전설의 화살촉','공격력 +'+(s.arrowType==='spirit'?18:36),()=>true,()=>s.atk+=s.arrowType==='spirit'?18:36],['생명의 나무','최대 체력 +120 · 체력 전부 회복',()=>true,()=>{s.max+=120;s.hp=s.max;}],['영웅의 힘','모든 공격력 40% 증가',()=>true,()=>{s.atk=Math.ceil(s.atk*1.4);s.swordAtk=Math.ceil(s.swordAtk*1.4);}],['폭풍의 시위','발사 속도 +2.1회/초 (최대 7회)',()=>s.rate<7,()=>s.rate=Math.min(7,s.rate+2.1)]];if(s.arrowType==='spirit')opts.push(['검의 군세','일제사격 유도검 +6발',()=>true,()=>s.petVolley+=6],['푸른 검의 각성','검 공격력 +9',()=>true,()=>s.swordAtk+=9],['초고속 장전','현재 재장전 시간 30% 단축',()=>true,()=>{s.petReload*=.7;s.petShot*=.7;}]);if(s.arrowType==='spread')opts.push(['화살 폭풍','화살 +3발 (최대 7발) · 공격력 +12',()=>s.cnt<7,()=>{s.cnt=Math.min(7,s.cnt+3);s.atk+=12;}]);return opts.filter(u=>u[2]());}
function finalReward(){s.boss=null;s.enemies=[];s.bad=[];s.arrows=[];state='finalReward';keys={};lastRecordedKey=0;let opts=finalUpgradePool();for(let i=opts.length-1;i>0;i--){let j=Math.floor(forestRandom()*(i+1));[opts[i],opts[j]]=[opts[j],opts[i]]}s.pendingRewards=opts.slice(0,3);show('<small>LEGENDARY REWARD · ROUND '+s.round+'</small><h2>최종보스 전설 보상</h2><p>중간보스보다 훨씬 강한 강화를 선택하세요.<br>선택 후 모든 강화를 유지하고 다음 라운드로 이동합니다.</p>'+s.pendingRewards.map((u,i)=>'<button class="choice" data-final="'+i+'"><b>★ '+u[0]+'</b><span>'+u[1]+'</span></button>').join(''));document.querySelectorAll('[data-final]').forEach(b=>b.onclick=()=>selectFinalReward(+b.dataset.final));}
function selectFinalReward(i){if(state!=='finalReward'||!s.pendingRewards||!s.pendingRewards[i])return;forestRecord('final',i);let u=s.pendingRewards[i];s.pendingRewards=null;u[3]();s.boosts++;hide();state='play';nextRound();s.rewardTime=4;$('#reward').textContent='★ '+u[0]+' 획득! · 라운드 '+s.round;beep(900);}
function bossReward(){state='bossReward';keys={};lastRecordedKey=0;let opts=bossUpgradePool().filter(u=>u[2]());for(let i=opts.length-1;i>0;i--){let j=Math.floor(forestRandom()*(i+1));[opts[i],opts[j]]=[opts[j],opts[i]]}s.pendingRewards=opts.slice(0,3);show('<small>BOSS REWARD</small><h2>중간보스 보상</h2><p>일반 보상보다 강한 특급 강화 중 하나를 선택하세요.<br>선택하는 동안 게임은 멈춥니다.</p>'+s.pendingRewards.map((u,i)=>'<button class="choice" data-reward="'+i+'"><b>'+u[0]+'</b><span>'+u[1]+'</span></button>').join(''));document.querySelectorAll('[data-reward]').forEach(b=>b.onclick=()=>selectBossReward(+b.dataset.reward));}
function selectBossReward(i){if(state!=='bossReward'||!s.pendingRewards||!s.pendingRewards[i])return;forestRecord('boss',i);let u=s.pendingRewards[i];s.pendingRewards=null;u[3]();s.boosts++;keys={};lastRecordedKey=0;hud();hide();state='play';s.rewardTime=3;$('#reward').textContent='✦ '+u[0]+' 획득! · '+u[1];$('#reward').style.opacity=1;beep(800);}
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
function finish(win){state='end';best=Math.max(best,s.score);try{localStorage.setItem('legoForestBest',best)}catch{}$('#best').textContent=best+'점';show('<h2>모험 종료</h2><p>'+s.score+'점 · 서버 검증 중</p>');queueMicrotask(()=>forestSettle('death'));}
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
function circ(x,y,r,col){g.fillStyle=col;g.beginPath();g.arc(x,y,r,0,Math.PI*2);g.fill()}
function weaponPalette(){return s.arrowType==='power'?{main:'#ff6268',light:'#ffd1d3',guard:'#c93d50',grip:'#742239',glow:'#ff8a95'}:s.arrowType==='spread'?{main:'#bf83ff',light:'#e8d5ff',guard:'#8451ca',grip:'#493073',glow:'#cfabff'}:{main:'#54baff',light:'#b6e9ff',guard:'#2874c5',grip:'#163f79',glow:'#69c6ff'};}
function drawSword(x,y,angle=0){let palette=weaponPalette();g.save();g.translate(x,y);g.rotate(angle);g.fillStyle=palette.main;g.beginPath();g.moveTo(0,-13);g.lineTo(2,-7);g.lineTo(1.7,5);g.lineTo(-1.7,5);g.lineTo(-2,-7);g.closePath();g.fill();g.strokeStyle=palette.light;g.lineWidth=.7;g.beginPath();g.moveTo(0,-10);g.lineTo(0,5);g.stroke();g.fillStyle=palette.guard;g.fillRect(-5,5,10,2);g.fillStyle=palette.grip;g.fillRect(-1,7,2,6);g.fillStyle=palette.glow;g.fillRect(-2,12,4,2);g.restore();}

function hpText(hp){let n=Math.max(0,Math.ceil(hp));return n>=1000000?(n/1000000).toFixed(1).replace(/\.0$/,'')+'M':n>=10000?(n/1000).toFixed(1).replace(/\.0$/,'')+'k':String(n);}
function hpLabel(x,y,hp,big=false){g.save();let text=hpText(hp),size=big?24:20;g.font='700 '+size+'px system-ui,sans-serif';g.textAlign='center';g.textBaseline='middle';let w=g.measureText(text).width;x=Math.max(w/2+8,Math.min(W-w/2-8,x));g.lineJoin='round';g.lineWidth=4;g.strokeStyle='#152d24';g.strokeText(text,x,y+2);g.fillStyle='#f0f2cf';g.fillText(text,x,y);g.lineWidth=1;g.strokeStyle='#b9cf94';g.strokeText(text,x,y);g.restore();}


function drawMonster(x,y,r,kind,time=0){
 const palettes={stego:['#82a65c','#466348','#bed78a'],brachio:['#69a9b3','#3a626c','#acdce1'],purple:['#9381bc','#574775','#c3b4e1'],whale:['#629fc0','#355a7d','#b0dce7'],abyss:['#386877','#1c414d','#8bb6b5'],kraken:['#9660bd','#583576','#cba0e9'],leviathan:['#30687b','#163f52','#6fb7c0']};
 let p=palettes[kind]||palettes.stego,body=p[0],edge=p[1],light=p[2],bob=Math.sin(time*2.6+x*.01)*1.4;
 g.save();g.translate(x,y);g.scale(r/50,r/50);g.lineJoin='round';g.lineCap='round';
 function ellipse(x,y,rx,ry,c,outline=true){g.fillStyle=c;g.strokeStyle=edge;g.lineWidth=2.4;g.beginPath();g.ellipse(x,y,rx,ry,0,0,Math.PI*2);g.fill();if(outline)g.stroke();}
 function box(x,y,w,h,rad,c){g.fillStyle=c;g.strokeStyle=edge;g.lineWidth=2.5;g.beginPath();g.roundRect(x,y,w,h,rad);g.fill();g.stroke();}
 function shape(points,c){g.fillStyle=c;g.strokeStyle=edge;g.lineWidth=2.4;g.beginPath();g.moveTo(...points[0]);for(let i=1;i<points.length;i++)g.lineTo(...points[i]);g.closePath();g.fill();g.stroke();}
 ellipse(0,38,42,8,'#102b2440',false);g.translate(0,bob);
 if(kind==='kraken'){
  for(let i=0;i<6;i++){let xx=(i-2.5)*13;g.strokeStyle=edge;g.lineWidth=12;g.beginPath();g.moveTo(xx*.6,15);g.quadraticCurveTo(xx*1.6,27,xx*1.25+Math.sin(time*3+i)*3,39);g.stroke();g.strokeStyle=body;g.lineWidth=8;g.stroke();ellipse(xx*1.25,34,2,3,light,false);}
  ellipse(0,7,31,25,body);box(-20,-31,40,42,12,body);box(-11,-42,22,17,6,light);
 }else if(kind==='whale'){
  shape([[-31,3],[-54,-13],[-46,12],[-32,20]],body);shape([[31,3],[54,-13],[46,12],[32,20]],body);
  ellipse(0,10,41,26,body);ellipse(0,19,27,12,light,false);box(-16,-26,32,31,9,body);shape([[-9,-26],[0,-37],[9,-26]],light);
  box(-24,31,15,8,3,edge);box(9,31,15,8,3,edge);
 }else if(kind==='abyss'||kind==='leviathan'){
  shape([[-24,0],[-49,-20],[-43,4],[-53,13],[-36,28],[-26,23]],body);shape([[24,0],[49,-20],[43,4],[53,13],[36,28],[26,23]],body);
  ellipse(0,14,36,26,body);ellipse(0,23,24,10,light,false);box(-21,-27,42,35,9,body);
  shape([[-21,-20],[-30,-38],[-10,-28]],body);shape([[21,-20],[30,-38],[10,-28]],body);
  box(-24,33,16,8,3,edge);box(8,33,16,8,3,edge);
  if(kind==='leviathan'){shape([[-12,-26],[-7,-39],[0,-30],[7,-39],[12,-26]],'#b4cf83');for(let i=-1;i<=1;i++)ellipse(i*14,12,3,3,light,false);}
 }else{
  if(kind==='stego')for(let i=0;i<5;i++){let xx=-28+i*14;shape([[xx-7,0],[xx,-21-(2-Math.abs(i-2))*5],[xx+7,0]],i%2?'#dbba70':light);}
  else{g.strokeStyle=edge;g.lineWidth=15;g.beginPath();g.moveTo(24,10);g.quadraticCurveTo(39,-8,34,-34);g.stroke();g.strokeStyle=body;g.lineWidth=10;g.stroke();box(27,-44,18,12,5,light);}
  box(-36,-3,72,34,10,body);box(-43,-4,12,30,5,light);box(31,-4,12,30,5,light);
  box(-22,27,16,12,4,edge);box(6,27,16,12,4,edge);box(-18,-28,36,30,8,body);box(-8,-35,18,10,4,light);
  g.strokeStyle=light;g.lineWidth=3;g.beginPath();g.moveTo(-27,19);g.lineTo(25,19);g.stroke();
 }
 const eyeY=kind==='whale'?-12:kind==='kraken'?-13:-13;
 for(let side of [-1,1]){ellipse(side*9,eyeY,4,5,kind==='leviathan'?'#e5d17b':'#e3efd4',false);ellipse(side*9,eyeY+1,1.8,2.7,edge,false);ellipse(side*9-1,eyeY-1,1,1,'#ffffff',false);}
 g.strokeStyle=edge;g.lineWidth=2;g.beginPath();g.moveTo(-6,-2);g.quadraticCurveTo(0,2,6,-2);g.stroke();
 g.globalAlpha=.25;ellipse(-12,-21,5,2,'#ffffff',false);g.globalAlpha=1;g.restore();
}

function drawScene(){g.fillStyle='#2b4933';g.fillRect(0,0,W,H);g.fillStyle='#4d6343';g.beginPath();g.moveTo(W*.28,0);g.lineTo(W*.72,0);g.lineTo(W*.9,H);g.lineTo(W*.1,H);g.fill();let t=s.distance/80*1.25;g.strokeStyle='#a4b78520';for(let i=0;i<14;i++){let y=(i*70+t*80)%(H+70);g.beginPath();g.moveTo(W*.2,y);g.lineTo(W*.8,y);g.stroke()}for(let side of [0,1])for(let i=0;i<12;i++){let x=side?W-W*.04-(i%3)*W*.035:W*.04+(i%3)*W*.035,y=(i*90+t*80)%(H+100)-50;circ(x+4,y+12,26,'#172e2360');circ(x,y,22+i%3*4,i%2?'#193b2c':'#214832');circ(x-7,y-8,12,'#335c3d')}
for(let gate of s.gates.filter(v=>v.active).slice(0,2).reverse()){let p=projectGate(gate);if(p.y<-60||p.y>H+90)continue;let gap=10,left=12,width=(W-24-gap)/2;g.save();g.globalAlpha=gate.used?.35:1;for(let i=0;i<2;i++){let x=left+i*(width+gap),y=p.y;g.fillStyle=i?'#316b658f':'#6d69338f';g.fillRect(x,y-33,width,66);g.strokeStyle=i?'#8de5df':'#eaf399';g.lineWidth=3;g.strokeRect(x,y-33,width,66);g.fillStyle='#f6ffdf';g.textAlign='center';g.font='bold 13px system-ui';g.fillText(shortOption(gate.options[i]),x+width/2,y-13);g.font='10px system-ui';g.fillText(gate.options[i][1],x+width/2,y+5,width-12);g.fillText('원하는 쪽으로 이동해 통과',x+width/2,y+23);}g.textAlign='start';g.restore();}
for(let box of s.chests){let x=box.x,y=box.y;circ(x,y+12,21,'#1b2d2150');g.fillStyle='#a87038';g.fillRect(x-17,y-12,34,25);g.fillStyle='#edc56c';g.fillRect(x-18,y-15,36,9);g.fillRect(x-2,y-7,5,11);g.strokeStyle='#ffdf8b';g.lineWidth=2;g.strokeRect(x-17,y-13,34,26);g.fillStyle='#fff0ad';g.font='bold 11px system-ui';g.textAlign='center';g.fillText(shortOption(box.reward),x,y-23);g.textAlign='start';}
for(let e of s.enemies){drawMonster(e.x,e.y,e.r,e.skin||(e.mini?'kraken':'stego'),s.fxTime);hpLabel(e.x,e.y+e.r+18,e.hp,!!e.mini)}

if(s.boss){let b=s.boss;drawMonster(b.x,b.y,62,'leviathan',s.fxTime);g.fillStyle='#1b3426';g.fillRect(W*.2,52,W*.6,7);g.fillStyle='#f3aa7b';g.fillRect(W*.2,52,W*.6*Math.max(0,b.hp/b.max),7);hpLabel(b.x,b.y+66,b.hp,true)}
for(let a of s.arrows){if(a.pet){drawSword(a.x,a.y,Math.atan2(a.vx,-a.vy));continue;}g.strokeStyle=s.arrowType?weaponPalette().main:'#f4f7b0';g.lineWidth=a.heavy?7:3;g.beginPath();g.moveTo(a.x,a.y+12);g.lineTo(a.x,a.y-7);g.stroke();g.fillStyle=g.strokeStyle;g.beginPath();g.moveTo(a.x,a.y-12);g.lineTo(a.x-4,a.y-5);g.lineTo(a.x+4,a.y-5);g.fill()}for(let a of s.bad){circ(a.x,a.y,10,'#ef8c6350');circ(a.x,a.y,6,'#ff9d79')}
let x=s.x*W,y=H*s.playerY;g.globalAlpha=s.inv>0&&Math.floor(s.inv*16)%2?.3:1;circ(x,y+19,24,'#172c2260');g.fillStyle='#283c2c';g.fillRect(x-14,y+9,10,18);g.fillRect(x+4,y+9,10,18);g.fillStyle='#d9ed8b';g.fillRect(x-17,y-14,34,29);g.fillStyle='#edc599';g.fillRect(x-12,y-35,24,24);g.fillStyle='#557842';g.fillRect(x-16,y-41,32,13);circ(x-5,y-24,1.5,'#213629');circ(x+5,y-24,1.5,'#213629');g.strokeStyle='#d0a36b';g.lineWidth=4;g.beginPath();g.arc(x+21,y-8,16,-1.5,1.5);g.stroke();g.globalAlpha=1;if(s.pet>0){let dock={x:s.x*W,y:H*s.playerY+48},charge=Math.max(0,Math.min(1,1-s.petShot/s.petReload));circ(dock.x,dock.y,17,weaponPalette().main+'20');g.globalAlpha=.25+charge*.75;drawSword(dock.x,dock.y);g.globalAlpha=1;g.strokeStyle=weaponPalette().light;g.lineWidth=2;g.beginPath();g.arc(dock.x,dock.y,21,-Math.PI/2,-Math.PI/2+Math.PI*2*charge);g.stroke();g.fillStyle=weaponPalette().light;g.textAlign='center';g.font='10px system-ui';g.fillText(s.petShot>0?'장전 '+Math.round(charge*100)+'%':'일제사격 준비',dock.x,dock.y+44);g.font='bold 15px system-ui';g.fillText('×'+(s.pet*s.petVolley),dock.x+32,dock.y+5);g.textAlign='start';}for(let p of s.sparks){g.globalAlpha=p.life*2;circ(p.x,p.y,3,'#edf6a4')}g.globalAlpha=1}
function forestKey(e,down){
  if(['ArrowLeft','ArrowRight',' ','a','d','A','D'].includes(e.key))e.preventDefault();
  if(e.code==='Space'){if(down&&!e.repeat)pause();return;}
  const key=e.key.length===1?e.key.toLowerCase():e.key;
  keys[key]=down;
  if(state==='play'&&forestActive){
    const dir=(keys.ArrowRight||keys.d?1:0)-(keys.ArrowLeft||keys.a?1:0);
    if(dir!==lastRecordedKey){lastRecordedKey=dir;forestRecord('key',dir);}
  }
}
addEventListener('keydown',e=>forestKey(e,true));addEventListener('keyup',e=>forestKey(e,false));
function pauseWithKeyReset(){if(forestActive&&!forestSettled)void forestCheckpoint(true);keys={};if(lastRecordedKey){lastRecordedKey=0;if(forestActive&&state==='play')forestRecord('key',0)}if(state==='play')pause();}
addEventListener('blur',pauseWithKeyReset);
document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseWithKeyReset();});
function move(e){if(state==='play'&&forestActive&&combatTicks-lastPositionTick>=4&&forestEvents.length<5990){let r=c.getBoundingClientRect();let x=Math.max(.08,Math.min(.92,(e.clientX-r.left)/r.width));lastPositionTick=combatTicks;forestRecord('x',Math.round(x*1000));s.x=Math.round(x*1000)/1000;}}
c.onpointerdown=e=>{drag=true;c.setPointerCapture(e.pointerId);move(e)};
c.onpointermove=e=>{if(drag)move(e)};c.onpointerup=c.onpointercancel=()=>drag=false;

function draw(){g.save();if(s.shake>0)g.translate(Math.sin(s.fxTime*45)*s.shake,Math.cos(s.fxTime*39)*s.shake*.6);drawScene();g.restore();if(s.boss){let b=s.boss;g.save();if(state==='bossDefeat'){let p=1-s.defeatTimer/1.3;g.strokeStyle='#e7f5af';g.globalAlpha=1-p;g.lineWidth=4;g.beginPath();g.arc(b.x,b.y,40+p*180,0,Math.PI*2);g.stroke();g.fillStyle='#eaf6c0';g.fillRect(0,0,W,H);g.globalAlpha=1;g.fillStyle='#edf8c8';g.font='800 25px system-ui';g.textAlign='center';g.fillText('수호자 격파',W/2,H*.42);}else if(b.intro>0){g.fillStyle='#081b1799';g.fillRect(0,H*.35,W,H*.18);g.fillStyle='#eef3d4';g.textAlign='center';g.font='800 27px system-ui';g.fillText('숲의 수호자',W/2,H*.43);g.font='12px system-ui';g.fillStyle='#d7b783';g.fillText('ROUND '+s.round+' · BOSS APPROACHING',W/2,H*.48);}else if(s.bossShot<.32){g.strokeStyle='#edb57f';g.globalAlpha=.35+.3*Math.sin(s.fxTime*20);g.lineWidth=2;for(let i=-2;i<=2;i++){g.beginPath();g.moveTo(b.x,b.y+40);g.lineTo(b.x+i*55*3,H);g.stroke();}g.globalAlpha=1;g.strokeStyle='#e3ba7c';g.beginPath();g.arc(b.x,b.y,65+Math.sin(s.fxTime*12)*5,0,Math.PI*2);g.stroke();}g.restore();}}
function frame(now){
  const delta=last?Math.max(0,Math.min((now-last)/1000,.10)):0;last=now;
  if(forestActive&&!forestSettling&&!forestSettled){
    const elapsed=Date.now()-forestStartMs;
    if(elapsed>=15*60_000||combatTicks>=18000){forestSettle(elapsed>=15*60_000?'session-timeout':'combat-timeout');}
    else if(state==='play'||state==='bossDefeat'){
      frameRemainder+=delta;let loops=0;
      while(frameRemainder>=1/30 && loops<4 && forestActive && (state==='play'||state==='bossDefeat')){
        frameRemainder-=1/30;combatTicks++;step(1/30);loops++;
        if(combatTicks>=18000){forestSettle('combat-timeout');break;}
      }
      if(loops===4)frameRemainder=Math.min(frameRemainder,1/30);
    }else frameRemainder=0;
    void forestCheckpoint();
    const label=document.querySelector('#forest-time');if(label)label.textContent='전투 '+Math.floor(combatTicks/30)+'초 / 600초 · 전체 '+Math.floor(elapsed/1000)+'초 / 900초';
  }
  draw();requestAnimationFrame(frame);
}
async function forestInit(){
  if(!token||!challengeId){location.replace('/?tab=games');return;}
  try {
    const res=await fetch('/api/bootstrap',{headers:{Authorization:'Bearer '+token},cache:'no-store'});
    const data=await res.json(),challenge=data.bootstrap?.activeMiniChallenge;
    if(!res.ok||!data.ok||challenge?.id!==challengeId||challenge?.gameId!=='forestRun'){throw new Error('진행 중인 모험이 없습니다.');}
    forestSeed=challenge.forestSeed;
    const startedAt=new Date(challenge.createdAt).getTime();
    forestSessionCreatedAt=startedAt;
    if(Date.now()-startedAt>=15*60_000)throw new Error('게임 세션이 이미 만료됐습니다.');
    // 새로고침 후에는 기존 게임을 새 세션으로 속여 시작하지 않는다.
    // 서버에 저장된 검증 기록을 정산하는 복구 UI를 제공한다.
    if(sessionStorage.getItem('forest-started-'+challengeId)){
      show('<h2>모험 기록 복구</h2><p>게임 페이지가 새로고침됐습니다. 마지막으로 서버에 저장된 진행 기록을 정산합니다.</p><button class="mainbtn" id="forest-recover">검증된 기록 정산</button>');
      document.querySelector('#forest-recover').onclick=()=>forestSettle('recover');
    }else {
      show('<small>FOREST RUN</small><h2>숲이 당신을 기다려요.</h2><p>10분 전투 · 15분 세션 · 100점당 1P (최대 500P)</p><p>시작하면 게임 이용 횟수 1회가 사용된 상태입니다.</p><button class="mainbtn" id="start">모험 시작 →</button>');
      document.querySelector('#start').onclick=()=>{sessionStorage.setItem('forest-started-'+challengeId,'1');start();};
    }
  } catch(e) {show('<h2>모험을 불러오지 못했습니다.</h2><p>'+String(e.message).replace(/[<>]/g,'')+'</p><a class="mainbtn" href="/?tab=games">게임으로 돌아가기</a>');}
}
$('#exit').onclick=()=>{if(forestSettled){location.replace('/?tab=games');return;}if(confirm('현재까지 서버에서 검증할 수 있는 점수를 정산하고 종료할까요?'))forestSettle('exit');};
let lastRecordedKey=0;
fresh();requestAnimationFrame(frame);forestInit();
