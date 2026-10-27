// LEGO LIFE - 2~4인 루미큐브. 서버만 패 소유권, 턴, 정산을 확정한다.
import { id } from '../lib/ids.js';
import { canStartBattleForPets, consumeBattleForPets } from './battle-limit.js';
import { consumeInteractionHunger, hungerActionLock } from './activity.js';

export const RUMMI_MAX_ROOMS = 3;
export const RUMMI_TURN_MS = 30_000;
export const RUMMI_MATCH_MS = 20 * 60_000;
export const RUMMI_STAKES = Object.freeze([100, 500, 1000, 2000, 3000]);
const WAIT_TTL = 10 * 60_000;
const RESULTS_TTL = 24 * 60 * 60_000;
const nni = (v) => Math.max(0, Math.floor(Number(v) || 0));
const iso = (date) => new Date(date).toISOString();
const asMs = (v) => new Date(v || 0).getTime();
const bad = (message) => ({ ok: false, message });

export function initialRummikub() { return { rooms: {}, results: {} }; }
export function normalizeRummikub(raw, state, date = new Date()) {
  const result = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : initialRummikub();
  if (!result.rooms || typeof result.rooms !== 'object' || Array.isArray(result.rooms)) result.rooms = {};
  if (!result.results || typeof result.results !== 'object' || Array.isArray(result.results)) result.results = {};
  for (const [key, value] of Object.entries(result.results)) if (!value || asMs(value.endedAt) + RESULTS_TTL < date.getTime()) delete result.results[key];
  for (const [key, room] of Object.entries(result.rooms)) {
    if (!room || !Array.isArray(room.players) || !room.players.length || !room.players.some((player)=>state?.pets?.[player.petId])) delete result.rooms[key];
  }
  return result;
}
export function rummikubDeck(random = Math.random) {
  const deck = [];
  for (let copy = 0; copy < 2; copy++) for (const color of ['red', 'blue', 'yellow', 'black']) {
    for (let num = 1; num <= 13; num++) deck.push({ id: `${color}-${num}-${copy}`, color, num });
  }
  deck.push({ id: 'joker-0', color: 'joker', num: 0 }, { id: 'joker-1', color: 'joker', num: 0 });
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.min(i, Math.floor(random() * (i + 1))); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  return deck;
}
const isJoker = (tile) => tile?.color === 'joker';
// 모든 실제 패가 같은 숫자이며 색이 중복되지 않으면 같은 숫자 그룹으로 인정한다.
function groupValue(tiles) {
  if (tiles.length < 3 || tiles.length > 4) return null;
  const real = tiles.filter((tile) => !isJoker(tile));
  if (!real.length || new Set(real.map((tile) => tile.num)).size !== 1 || new Set(real.map((tile) => tile.color)).size !== real.length) return null;
  return real[0].num * tiles.length;
}
// 연속 숫자는 조커가 양끝 또는 중간의 빈 숫자를 대신할 수 있다.
function runValue(tiles) {
  if (tiles.length < 3 || tiles.length > 13) return null;
  const real = tiles.filter((tile) => !isJoker(tile));
  if (!real.length || new Set(real.map((tile) => tile.color)).size !== 1 || new Set(real.map((tile) => tile.num)).size !== real.length) return null;
  for (let start = 1; start + tiles.length - 1 <= 13; start++) {
    if (real.every((tile) => tile.num >= start && tile.num < start + tiles.length)) {
      return (start + start + tiles.length - 1) * tiles.length / 2;
    }
  }
  return null;
}
export function rummikubGroupValue(tiles) {
  if (!Array.isArray(tiles)) return null;
  return groupValue(tiles) ?? runValue(tiles);
}
function nextRoomNumber(state) {
  const used = new Set(Object.values(state.rummikub.rooms).map((room) => room.number));
  for (let number = 1; number <= RUMMI_MAX_ROOMS; number++) if (!used.has(number)) return number;
  return null;
}
function playingRoom(state, petId) {
  return Object.values(state.rummikub.rooms).find((room) => room.players.some((p) => p.petId === petId)) || null;
}
export function createRummikubRoom(state, pet, stakeValue, date = new Date()) {
  state.rummikub = normalizeRummikub(state.rummikub, state, date);
  const stake = Number(stakeValue);
  if (!RUMMI_STAKES.includes(stake)) return bad('판돈은 100·500·1,000·2,000·3,000P 중 선택해야 합니다.');
  const number = nextRoomNumber(state.rummikub ? state : { rummikub: initialRummikub() });
  if (!number) return bad('루미큐브 대전방이 모두 사용 중입니다.');
  if (playingRoom(state, pet.id)) return bad('이미 참가 중인 루미큐브 방이 있습니다.');
  if (pet.stats.points < stake) return bad('판돈에 필요한 포인트가 부족합니다.');
  const room = { id: id('rummi'), number, hostPetId: pet.id, stake, status: 'waiting',
    createdAt: iso(date), startedAt: null, endsAt: null, turnDeadlineAt: null,
    players: [{ petId: pet.id, ready: true, forfeit: false, inactive: 0, registered: false, rack: [] }],
    spectators: [], deck: [], table: [], currentIndex: 0, turnSeq: 0, passCount: 0,
    revision: 0, actionIds: [] };
  state.rummikub.rooms[room.id] = room;
  return { ok: true, roomId: room.id, message: `${number}번 루미큐브 방을 만들었습니다.` };
}
export function joinRummikubRoom(state, pet, roomId, date = new Date()) {
  const room = state.rummikub?.rooms?.[roomId];
  if (!room || room.status !== 'waiting') return bad('참가할 수 없는 방입니다.');
  if (room.players.some((p) => p.petId === pet.id)) return { ok: true, roomId, message: '이미 참가했습니다.' };
  if (playingRoom(state, pet.id)) return bad('다른 루미큐브 방에 참가 중입니다.');
  if (room.players.length >= 4) return bad('정원이 가득 찼습니다.');
  if (pet.stats.points < room.stake) return bad('판돈에 필요한 포인트가 부족합니다.');
  room.players.push({ petId: pet.id, ready: true, forfeit: false, inactive: 0, registered: false, rack: [] });
  room.revision++;
  return { ok: true, roomId, message: '입장하고 준비를 완료했습니다.' };
}
export function spectateRummikubRoom(state, pet, roomId) {
  const room = state.rummikub?.rooms?.[roomId];
  if (!room || room.status !== 'playing') return bad('진행 중인 방만 관전할 수 있습니다.');
  if (room.players.some((p) => p.petId === pet.id)) return bad('참가자는 관전자로 전환할 수 없습니다.');
  if (!room.spectators.includes(pet.id)) room.spectators.push(pet.id);
  return { ok: true, message: '관전을 시작했습니다.' };
}
export function startRummikubRoom(state, pet, roomId, date = new Date(), random = Math.random) {
  const room = state.rummikub?.rooms?.[roomId];
  if (!room || room.status !== 'waiting' || room.hostPetId !== pet.id) return bad('방장만 게임을 시작할 수 있습니다.');
  if (room.players.length < 2 || room.players.length > 4 || room.players.some((p) => !p.ready)) return bad('2~4명의 참가자가 모두 준비해야 합니다.');
  const pets = room.players.map((p) => state.pets[p.petId]);
  if (pets.some((p) => !p?.alive || p.stats.points < room.stake || hungerActionLock(p, date).locked)) return bad('참가자 중 포인트가 부족하거나 포만감으로 행동이 제한된 사람이 있습니다.');
  const quota = canStartBattleForPets(pets, date);
  if (!quota.ok) return quota;
  consumeBattleForPets(pets, date);
  for (const p of pets) {
    p.stats.points -= room.stake; p.records.pointsSpent = nni(p.records.pointsSpent) + room.stake;
    consumeInteractionHunger(p, date, 2);
  }
  room.deck = rummikubDeck(random);
  for (const player of room.players) player.rack = room.deck.splice(0, 14);
  room.currentIndex = Math.floor(random() * room.players.length) % room.players.length;
  room.status = 'playing'; room.startedAt = iso(date); room.endsAt = iso(date.getTime() + RUMMI_MATCH_MS);
  room.turnDeadlineAt = iso(date.getTime() + RUMMI_TURN_MS);
  room.turnSeq++;room.revision++;
  return { ok: true, roomId, message: '루미큐브 대전이 시작됐습니다.' };
}
const scoreRack = (rack) => rack.reduce((sum, tile) => sum + (isJoker(tile) ? 30 : tile.num), 0);
function activePlayers(room) { return room.players.filter((p) => !p.forfeit); }
function advance(room, date = new Date(), { fromDeadline = false } = {}) {
  const start = room.currentIndex;
  for (let i = 1; i <= room.players.length; i++) {
    const next = (start + i) % room.players.length;
    if (!room.players[next].forfeit) { room.currentIndex = next; break; }
  }
  const base = fromDeadline ? asMs(room.turnDeadlineAt) : date.getTime();
  room.turnDeadlineAt = iso(base + RUMMI_TURN_MS);
  room.turnSeq++;room.revision++;
}
function settleRummikub(state, room, date = new Date(), reason = '모든 패를 먼저 내려놓았습니다.') {
  if (room.status !== 'playing') return null;
  const alive = activePlayers(room);
  if (!alive.length) return null;
  const ordered = [...alive].sort((a,b)=> scoreRack(a.rack)-scoreRack(b.rack) || a.rack.length-b.rack.length);
  const best = ordered[0];
  const winners = ordered.filter((p)=>scoreRack(p.rack) === scoreRack(best.rack) && p.rack.length === best.rack.length);
  const pot = room.stake * room.players.length;
  const perWinner = Math.floor(pot / winners.length);
  const residual = pot % winners.length;
  const winnerIds = new Set(winners.map((p)=>p.petId));
  const entries = room.players.map((player)=>{
    const pet = state.pets[player.petId];
    const winnerIndex = winners.findIndex((p)=>p.petId === player.petId);
    const payout = winnerIndex < 0 ? 0 : perWinner + (winnerIndex < residual ? 1 : 0);
    if (pet) {
      pet.records ??= {};
      pet.records.rummikubGames = nni(pet.records.rummikubGames)+1;
      if (winnerIds.has(player.petId)) {
        pet.records.rummikubWins = nni(pet.records.rummikubWins)+1;
        pet.records.seasonRummikubWins = nni(pet.records.seasonRummikubWins)+1;
      } else {
        pet.records.rummikubLosses = nni(pet.records.rummikubLosses)+1;
        pet.records.seasonRummikubLosses = nni(pet.records.seasonRummikubLosses)+1;
      }
      pet.stats.points += payout;pet.records.pointsEarned=nni(pet.records.pointsEarned)+payout;
      pet.records.maxPoints=Math.max(nni(pet.records.maxPoints),pet.stats.points);
    }
    return {petId:player.petId,displayName:pet?.displayName||'탈퇴한 레고',winner:winnerIds.has(player.petId),forfeit:player.forfeit,rank:player.forfeit ? room.players.length : 1+ordered.findIndex((p)=>scoreRack(p.rack)===scoreRack(player.rack)&&p.rack.length===player.rack.length),score:scoreRack(player.rack),count:player.rack.length,payout};
  });
  const result = {matchId:room.id,number:room.number,reason,entries,endedAt:iso(date),pot};
  for (const player of room.players) state.rummikub.results[player.petId] = result;
  for (const petId of room.spectators) state.rummikub.results[petId] = result;
  room.status = 'ended';delete state.rummikub.rooms[room.id];
  return result;
}
function forfeit(state,room,player,date,reason) {
  player.forfeit=true;player.inactive=3;room.revision++;
  if (activePlayers(room).length===1) return settleRummikub(state,room,date,reason);
  if (activePlayers(room).length===0) {room.status='ended';delete state.rummikub.rooms[room.id];return null;}
  if (room.players[room.currentIndex]===player) advance(room,date);
  return null;
}
function passTurn(state, room, player, date = new Date(), { timedOut = false } = {}) {
  if (room.deck.length) { player.rack.push(room.deck.pop());room.passCount=0; }
  else room.passCount++;
  if (timedOut) player.inactive++;
  else player.inactive=0;
  if (player.inactive>=3) return forfeit(state,room,player,date,'연속 3회 미활동으로 자동 기권했습니다.');
  if (room.passCount >= activePlayers(room).length) return settleRummikub(state,room,date,'덱이 소진되어 남은 패로 승부를 결정했습니다.');
  advance(room,date,{fromDeadline:timedOut});
  return null;
}
export function processRummikubTimers(state,date=new Date()) {
  const game=state.rummikub=normalizeRummikub(state.rummikub,state,date);
  let changed=false;
  for (const room of Object.values(game.rooms)) {
    if (room.status==='waiting' && asMs(room.createdAt)+WAIT_TTL <= date.getTime()) {delete game.rooms[room.id];changed=true;continue;}
    if (room.status!=='playing') continue;
    if (asMs(room.endsAt) <= date.getTime()) {settleRummikub(state,room,date,'20분 제한 시간 종료 · 남은 패 점수로 승부를 결정했습니다.');changed=true;continue;}
    for(let i=0;i<40 && room.status==='playing' && asMs(room.turnDeadlineAt)<=date.getTime();i++) {
      const player=room.players[room.currentIndex];passTurn(state,room,player,new Date(asMs(room.turnDeadlineAt)),{timedOut:true});changed=true;
    }
  }
  return {changed};
}
export function rummikubNextAlarmAt(state) {
  const dates=Object.values(state.rummikub?.rooms??{}).map(room=>room.status==='playing'?Math.min(asMs(room.endsAt),asMs(room.turnDeadlineAt)):asMs(room.createdAt)+WAIT_TTL).filter(Number.isFinite);
  return dates.length?new Date(Math.min(...dates)).toISOString():null;
}
export function leaveRummikubRoom(state,pet,roomId,date=new Date()) {
  const room=state.rummikub?.rooms?.[roomId];if(!room)return bad('이미 정리된 방입니다.');
  const idx=room.players.findIndex((p)=>p.petId===pet.id);
  if(idx===-1) {room.spectators=room.spectators.filter((pid)=>pid!==pet.id);return {ok:true,message:'관전을 종료했습니다.'};}
  if(room.status==='waiting') {
    room.players.splice(idx,1);
    if(!room.players.length)delete state.rummikub.rooms[roomId];
    else if(room.hostPetId===pet.id)room.hostPetId=room.players[0].petId;
  } else if(room.status==='playing')forfeit(state,room,room.players[idx],date,'참가자가 기권하여 게임이 종료됐습니다.');
  return {ok:true,message:'방에서 나갔습니다.'};
}
export function removePetFromRummikub(state,petId,date=new Date()) {
  for(const room of [...Object.values(state.rummikub?.rooms??{})])if(room.players.some((p)=>p.petId===petId)){
    leaveRummikubRoom(state,{id:petId},room.id,date);
  } else room.spectators=room.spectators.filter((pid)=>pid!==petId);
  delete state.rummikub?.results?.[petId];
}
function validateCommit(room,player,groups,rackIds) {
  if(!Array.isArray(groups) || groups.length>65 || !Array.isArray(rackIds)||rackIds.length>106)return bad('제출한 조합 데이터가 올바르지 않습니다.');
  const oldTable=room.table.flat();const full=new Map([...oldTable,...player.rack].map(tile=>[tile.id,tile]));
  const seen=new Set();const proposed=[];let firstValue=0;
  const originalGroups=room.table.map(g=>new Set(g.map(t=>t.id)));
  const oldTableIds=new Set(oldTable.map(t=>t.id));
  for(const candidate of groups){
    if(!Array.isArray(candidate)||candidate.length<3||candidate.length>13)return bad('각 조합은 3개 이상의 유효한 패로 구성해야 합니다.');
    const tiles=[];
    for(const key of candidate){
      if(typeof key!=='string'||seen.has(key)||!full.has(key))return bad('패가 중복되거나 다른 플레이어의 패가 포함됐습니다.');
      seen.add(key);tiles.push(full.get(key));
    }
    const value=rummikubGroupValue(tiles);
    if(value===null)return bad('같은 숫자(서로 다른 색) 또는 같은 색 연속 숫자로 조합해야 합니다.');
    if(!player.registered) {
      const original=originalGroups.some(group=>group.size===tiles.length&&tiles.every(t=>group.has(t.id)));
      if(!original){
        if(tiles.some(tile=>oldTableIds.has(tile.id)))return bad('첫 등록 전에는 기존 바닥 조합을 바꿀 수 없습니다.');
        firstValue+=value;
      }
    }
    proposed.push(tiles);
  }
  if(!player.registered && originalGroups.some(old=>!proposed.some(g=>g.length===old.size&&g.every(t=>old.has(t.id)))))return bad('첫 등록 시 다른 사람의 기존 조합은 변경할 수 없습니다.');
  const rack=[];
  for(const key of rackIds){
    if(typeof key!=='string'||seen.has(key)||!full.has(key)||!player.rack.some(t=>t.id===key))return bad('손패 구성이 올바르지 않습니다.');
    seen.add(key);rack.push(full.get(key));
  }
  if(seen.size!==full.size)return bad('모든 패를 손패 또는 바닥 조합에 빠짐없이 배치해야 합니다.');
  const used=player.rack.length-rack.length;
  if(used<1)return bad('자신의 패를 최소 1개 이상 내야 합니다.');
  if(!player.registered && firstValue<30)return bad(`첫 등록은 자신의 패 숫자 합계 30 이상이어야 합니다. 현재 ${firstValue}점입니다.`);
  return {ok:true,table:proposed,rack,used,firstValue};
}
export function rummikubAction(state,pet,roomId,input={},date=new Date()) {
  const room=state.rummikub?.rooms?.[roomId];
  if(!room || room.status!=='playing')return bad('진행 중인 방이 아닙니다.');
  const requestId=String(input.requestId||'').slice(0,100);
  const requestKey=requestId ? `${pet.id}:${requestId}` : '';
  if(requestKey && room.actionIds.includes(requestKey))return {ok:true,duplicate:true};
  const player=room.players[room.currentIndex];
  if(player.petId!==pet.id||player.forfeit)return bad('지금은 내 차례가 아닙니다.');
  const action=String(input.action||'');
  if(input.turnSeq!==room.turnSeq)return bad('이미 변경된 턴입니다. 화면을 새로고침해 주세요.');
  if(asMs(room.endsAt)<=date.getTime()||asMs(room.turnDeadlineAt)<=date.getTime())return bad('턴 또는 전체 게임 시간이 종료됐습니다.');
  let result=null;
  if(action==='commit') {
    const verified=validateCommit(room,player,input.groups,input.rack);
    if(!verified.ok)return verified;
    room.table=verified.table;player.rack=verified.rack;player.registered=true;player.inactive=0;room.passCount=0;
    if(player.rack.length===0)result=settleRummikub(state,room,date,'손패를 모두 내려놓았습니다.');
    else advance(room,date);
  } else if(action==='draw')result=passTurn(state,room,player,date);
  else return bad('지원하지 않는 행동입니다.');
  if(requestKey && room.status==='playing')room.actionIds=[...room.actionIds,requestKey].slice(-64);
  return {ok:true,finished:Boolean(result),result,message:action==='draw'?'패 1개를 뽑고 턴을 종료했습니다.':'조합을 확정했습니다.'};
}
export function rummikubRoomView(state,room,viewerId) {
  const role=room.players.some(p=>p.petId===viewerId)?'player':room.spectators.includes(viewerId)?'spectator':'none';
  return {id:room.id,number:room.number,hostPetId:room.hostPetId,stake:room.stake,status:room.status,
    role,startedAt:room.startedAt,endsAt:room.endsAt,turnDeadlineAt:room.turnDeadlineAt,turnSeq:room.turnSeq,revision:room.revision,
    currentPetId:room.players[room.currentIndex]?.petId,table:room.status==='playing'&&role!=='none'?room.table:[],deckCount:room.deck.length,
    spectatorCount:room.spectators.length,players:room.players.map((entry)=>{
      const pet=state.pets[entry.petId];const advancement=pet?.bodyAdvancement?.key||null;
      const stage=advancement?`form-${advancement}`:null;
      return {petId:entry.petId,displayName:pet?.displayName||'레고',ready:entry.ready,
        forfeit:entry.forfeit,inactive:entry.inactive,registered:entry.registered,count:entry.rack.length,
        rack:role==='player'&&entry.petId===viewerId?entry.rack:undefined,
        avatarKey:advancement?null:(pet?.stats?.body>=70?'normal':'skinny'),
        advancementKey:advancement,body:pet?.stats?.body||70,flexItem:pet?.flexItem||null};
    })};
}
export function rummikubView(state,viewerId,date=new Date()) {
  const game=state.rummikub=normalizeRummikub(state.rummikub,state,date);
  return {maxRooms:RUMMI_MAX_ROOMS,stakes:[...RUMMI_STAKES],serverTime:date.getTime(),
    rooms:Object.values(game.rooms).sort((a,b)=>a.number-b.number).map(room=>rummikubRoomView(state,room,viewerId)),
    latestResult:game.results[viewerId]||null};
}
export function rummikubRanking(state,viewerId=null) {
  const rows=Object.values(state.pets??{}).filter(p=>p?.alive).map(p=>({petId:p.id,displayName:p.displayName,wins:nni(p.records?.seasonRummikubWins),losses:nni(p.records?.seasonRummikubLosses)}))
    .filter(r=>r.wins||r.losses).sort((a,b)=>b.wins-a.wins||a.losses-b.losses||a.displayName.localeCompare(b.displayName,'ko'));
  return {top:rows.slice(0,5).map((r,i)=>({...r,rank:i+1})),mine:rows.find(r=>r.petId===viewerId)?{...rows.find(r=>r.petId===viewerId),rank:rows.findIndex(r=>r.petId===viewerId)+1}:null};
}
