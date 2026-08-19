import test from 'node:test';
import assert from 'node:assert/strict';
import { stateWithUsers } from './helpers.js';
import {
  createDavinciRoom, joinDavinciRoom, setDavinciReady, kickDavinciPlayer, startDavinciRoom, placeDavinciJoker,
  submitDavinciRps, selectDavinciOrder, guessDavinciTile, decideDavinciTurn,
  chooseDavinciPenaltyTile, leaveDavinciRoom, requestDavinciRematch, processDavinciTimers,
  davinciRoomView, davinciRanking, validDavinciStake
} from '../src/game/davinci.js';

const at = (sec=0) => new Date(Date.parse('2026-08-19T10:00:00.000Z') + sec*1000);
const pets = (state) => Object.values(state.pets);

function setupPlayers(count=2, stake=500) {
  const names = Array.from({length:count}, (_,i)=>[`u${i+1}`, `레고${i+1}`]);
  const state = stateWithUsers(names, at());
  for (const pet of pets(state)) pet.stats.points = 10000;
  const ps = pets(state);
  const made = createDavinciRoom(state, ps[0], stake, at());
  assert.equal(made.ok, true);
  for (let i=1;i<count;i++) assert.equal(joinDavinciRoom(state, ps[i], made.roomId, at()).ok, true);
  for (let i=1;i<count;i++) assert.equal(setDavinciReady(state, ps[i], made.roomId, true, at()).ok, true);
  return {state, ps, roomId:made.roomId};
}

function finishInitialJokers(state, ps, roomId) {
  let guard=0;
  while (state.davinci.rooms[roomId].phase === 'jokerSetup' && guard++ < 10) {
    const room = state.davinci.rooms[roomId];
    const player = ps.find(p => room.players.find(x=>x.petId===p.id)?.pendingInitialJokers?.length);
    assert.ok(player, 'pending joker owner expected');
    assert.equal(placeDavinciJoker(state, player, roomId, 0, at(guard)).ok, true);
  }
  assert.equal(state.davinci.rooms[roomId].phase, 'rps');
}

function startToTurn(state, ps, roomId) {
  const started = startDavinciRoom(state, ps[0], roomId, at());
  assert.equal(started.ok, true, started.message);
  finishInitialJokers(state, ps, roomId);
  // 2인 기준 p1 rock > p2 scissors
  assert.equal(submitDavinciRps(state, ps[0], roomId, 'rock', at(2)).ok, true);
  assert.equal(submitDavinciRps(state, ps[1], roomId, 'scissors', at(2)).ok, true);
  assert.equal(state.davinci.rooms[roomId].phase, 'orderChoice');
  assert.equal(selectDavinciOrder(state, ps[0], roomId, 'first', at(3)).ok, true);
  assert.equal(state.davinci.rooms[roomId].phase, 'turn');
  assert.equal(state.davinci.rooms[roomId].currentTurnPetId, ps[0].id);
}

test('다빈치 판돈 규칙과 방 최대 2개를 지킨다', () => {
  assert.equal(validDavinciStake(100), true);
  assert.equal(validDavinciStake(500), true);
  assert.equal(validDavinciStake(1000), true);
  assert.equal(validDavinciStake(2000), true);
  assert.equal(validDavinciStake(1500), false);
  const state = stateWithUsers([['u1','A'],['u2','B'],['u3','C']], at());
  const ps = pets(state);
  assert.equal(createDavinciRoom(state, ps[0], 100, at()).ok, true);
  assert.equal(createDavinciRoom(state, ps[1], 500, at()).ok, true);
  const third = createDavinciRoom(state, ps[2], 1000, at());
  assert.equal(third.ok, false);
  assert.match(third.message, /최대 2개/);
});

test('2~4인 준비 후 시작 시 전원 판돈을 한 번씩 확보한다', () => {
  const {state, ps, roomId} = setupPlayers(4, 500);
  const result = startDavinciRoom(state, ps[0], roomId, at());
  assert.equal(result.ok, true);
  for (const pet of ps) assert.equal(pet.stats.points, 9500);
  const room = state.davinci.rooms[roomId];
  assert.equal(Object.values(room.escrow).reduce((a,b)=>a+b,0), 2000);
  assert.equal(room.players.length, 4);
  assert.equal(room.players.every(p=>p.hand.length + p.pendingInitialJokers.length === 3), true);
});

test('숨은 숫자와 조커는 상대/관전자 view에 절대 노출하지 않는다', () => {
  const {state, ps, roomId} = setupPlayers(2);
  startDavinciRoom(state, ps[0], roomId, at());
  const room = state.davinci.rooms[roomId];
  const owner = room.players[0];
  // pending joker가 있으면 owner view에서 색만 보이고 상대에는 보이지 않는다.
  const ownerView = davinciRoomView(state, roomId, ps[0].id, at());
  const otherView = davinciRoomView(state, roomId, ps[1].id, at());
  const own = ownerView.players.find(p=>p.petId===ps[0].id);
  const seenByOther = otherView.players.find(p=>p.petId===ps[0].id);
  for (let i=0;i<owner.hand.length;i++) {
    assert.equal(own.hand[i].hidden, false);
    if (!owner.hand[i].revealed) {
      assert.equal(seenByOther.hand[i].hidden, true);
      assert.equal(seenByOther.hand[i].value, null);
      assert.equal(seenByOther.hand[i].joker, false);
    }
  }
  assert.equal(Array.isArray(own.pendingJokers), true);
  assert.equal(seenByOther.pendingJokers.length, 0);
});

test('가위바위보 선택은 결과 확정 전 상대에게 공개되지 않는다', () => {
  const {state, ps, roomId} = setupPlayers(2);
  assert.equal(startDavinciRoom(state, ps[0], roomId, at()).ok, true);
  finishInitialJokers(state, ps, roomId);
  assert.equal(submitDavinciRps(state, ps[0], roomId, 'rock', at(2)).ok, true);
  const view = davinciRoomView(state, roomId, ps[1].id, at(2));
  assert.equal(view.rpsChoices[ps[0].id], undefined);
  assert.equal(view.rpsChoices[ps[1].id], undefined);
  submitDavinciRps(state, ps[1], roomId, 'scissors', at(3));
  const after = davinciRoomView(state, roomId, ps[1].id, at(3));
  assert.equal(after.lastRpsResult.choices[ps[0].id], 'rock');
  assert.equal(after.lastRpsResult.choices[ps[1].id], 'scissors');
});

test('정답은 공개·정답 기록 +1, 최근 추리는 위치 없이 6개까지만 유지한다', () => {
  const {state, ps, roomId} = setupPlayers(2);
  startToTurn(state, ps, roomId);
  const room = state.davinci.rooms[roomId];
  const target = room.players[1];
  const tile = target.hand.find(t=>!t.revealed);
  assert.ok(tile);
  const guess = tile.joker ? 'joker' : String(tile.value);
  const result = guessDavinciTile(state, ps[0], roomId, ps[1].id, tile.id, guess, 'action-0001', at(4));
  assert.equal(result.ok, true);
  assert.equal(result.correct, true);
  assert.equal(state.davinci.rooms[roomId].players[1].hand.find(t=>t.id===tile.id)?.revealed, true);
  assert.equal(ps[0].records.davinciCorrect, 1);
  assert.equal(ps[0].records.davinciTotalCorrect, 1);
  assert.equal(room.guessLog.length, 1);
  assert.equal('tileId' in room.guessLog[0], false);
  assert.equal(room.awaitingDecision, true);
  assert.equal(decideDavinciTurn(state, ps[0], roomId, 'continue', at(5)).ok, true);
});

test('덱이 없을 때 오답이면 자기 비공개 타일을 선택해 공개한다', () => {
  const {state, ps, roomId} = setupPlayers(2);
  startToTurn(state, ps, roomId);
  const room = state.davinci.rooms[roomId];
  room.deck = [];
  room.players[0].drawnTile = null;
  const targetTile = room.players[1].hand.find(t=>!t.revealed && !t.joker) || room.players[1].hand.find(t=>!t.revealed);
  const wrong = targetTile.joker ? '0' : String((targetTile.value + 1) % 12);
  const result = guessDavinciTile(state, ps[0], roomId, ps[1].id, targetTile.id, wrong, 'action-0002', at(4));
  assert.equal(result.correct, false);
  assert.equal(room.phase, 'deckPenalty');
  const ownHidden = room.players[0].hand.find(t=>!t.revealed);
  assert.ok(ownHidden);
  assert.equal(chooseDavinciPenaltyTile(state, ps[0], roomId, ownHidden.id, at(5)).ok, true);
  assert.equal(state.davinci.rooms[roomId].players[0].hand.find(t=>t.id===ownHidden.id)?.revealed, true);
});

test('두 번 연속 자기 턴 시간초과 시 자동 포기되고 상대가 판돈을 받는다', () => {
  const {state, ps, roomId} = setupPlayers(2, 500);
  startToTurn(state, ps, roomId);
  const room = state.davinci.rooms[roomId];
  // p1 첫 timeout -> p2, p2는 정상 포기 처리로 턴을 다시 p1에 넘기기 위해 직접 오답 처리 대신 p2 턴 시간을 넘긴 후 streak를 리셋해 둔다.
  processDavinciTimers(state, at(34));
  assert.equal(room.players[0].consecutiveTimeouts, 1);
  // p2 timeout
  processDavinciTimers(state, at(65));
  room.players[1].consecutiveTimeouts = 0;
  // p1 second timeout
  processDavinciTimers(state, at(96));
  assert.equal(room.players[0].forfeited, true);
  assert.equal(room.status, 'ended');
  assert.equal(room.winnerPetId, ps[1].id);
  assert.equal(ps[1].stats.points, 10500);
  assert.equal(ps[1].records.davinciWins, 1);
});

test('대기방 방장이 나가면 다음 참가자에게 방장이 넘어간다', () => {
  const {state, ps, roomId} = setupPlayers(3);
  assert.equal(leaveDavinciRoom(state, ps[0], roomId, at(1)).ok, true);
  assert.equal(state.davinci.rooms[roomId].hostPetId, ps[1].id);
});

test('승수 우선, 동률이면 정답 수가 높은 순으로 랭킹한다', () => {
  const state = stateWithUsers([['u1','A'],['u2','B'],['u3','C']], at());
  const ps = pets(state);
  ps[0].records.davinciWins=3; ps[0].records.davinciCorrect=10;
  ps[1].records.davinciWins=3; ps[1].records.davinciCorrect=15;
  ps[2].records.davinciWins=2; ps[2].records.davinciCorrect=99;
  const ranking = davinciRanking(state, ps[0].id);
  assert.equal(ranking.top[0].petId, ps[1].id);
  assert.equal(ranking.top[1].petId, ps[0].id);
  assert.equal(ranking.top[2].petId, ps[2].id);
});

test('정상 종료 후 전원 재대결 동의 시 같은 판돈으로 새 매치를 시작한다', () => {
  const {state, ps, roomId} = setupPlayers(2, 100);
  startToTurn(state, ps, roomId);
  const room = state.davinci.rooms[roomId];
  const target = room.players[1];
  const hidden = target.hand.filter((tile) => !tile.revealed);
  assert.ok(hidden.length >= 1);
  for (const tile of hidden.slice(0, -1)) tile.revealed = true;
  const last = hidden.at(-1);
  const guess = last.joker ? 'joker' : String(last.value);
  const win = guessDavinciTile(state, ps[0], roomId, ps[1].id, last.id, guess, 'rematch-win', at(4));
  assert.equal(win.finished, true);
  assert.equal(room.status, 'ended');
  assert.equal(requestDavinciRematch(state, ps[0], roomId, at(5)).pending, true);
  const result = requestDavinciRematch(state, ps[1], roomId, at(6));
  assert.equal(result.ok, true, result.message);
  assert.equal(room.status, 'playing');
  assert.equal(Object.values(room.escrow).reduce((a,b)=>a+b,0), 200);
});

test('게임 중 포기하고 나간 참가자는 유령 재대결 인원으로 남지 않는다', () => {
  const {state, ps, roomId} = setupPlayers(2, 100);
  startToTurn(state, ps, roomId);
  const room = state.davinci.rooms[roomId];
  const left = leaveDavinciRoom(state, ps[0], roomId, at(4));
  assert.equal(left.ok, true);
  assert.equal(room.status, 'ended');
  assert.equal(room.players.find((player) => player.petId === ps[0].id)?.leftRoom, true);
  assert.equal(davinciRoomView(state, roomId, ps[0].id, at(4)).viewerRole, 'none');
  const denied = requestDavinciRematch(state, ps[0], roomId, at(5));
  assert.equal(denied.ok, false);
  const winnerRequest = requestDavinciRematch(state, ps[1], roomId, at(6));
  assert.equal(winnerRequest.ok, true);
  assert.equal(winnerRequest.waiting, true);
  assert.equal(room.status, 'waiting');
  assert.equal(room.players.length, 1);
  assert.equal(room.hostPetId, ps[1].id);
});


test('대기방 인원이 바뀌면 준비가 초기화되고 방장은 참가자를 강퇴할 수 있다', () => {
  const state = stateWithUsers([['u1','방장'],['u2','참가A'],['u3','참가B']], at());
  const ps = pets(state);
  for (const pet of ps) pet.stats.points = 10000;
  const made = createDavinciRoom(state, ps[0], 500, at());
  assert.equal(joinDavinciRoom(state, ps[1], made.roomId, at()).ok, true);
  assert.equal(setDavinciReady(state, ps[1], made.roomId, true, at()).ok, true);
  assert.equal(state.davinci.rooms[made.roomId].players.find((p)=>p.petId===ps[1].id).ready, true);
  assert.equal(joinDavinciRoom(state, ps[2], made.roomId, at(1)).ok, true);
  assert.equal(state.davinci.rooms[made.roomId].players.find((p)=>p.petId===ps[1].id).ready, false, '새 참가자가 들어오면 기존 준비를 초기화한다');
  assert.equal(setDavinciReady(state, ps[1], made.roomId, true, at(2)).ok, true);
  assert.equal(setDavinciReady(state, ps[2], made.roomId, true, at(2)).ok, true);
  const denied = kickDavinciPlayer(state, ps[1], made.roomId, ps[2].id, at(3));
  assert.equal(denied.ok, false, '방장이 아닌 참가자는 강퇴할 수 없다');
  const kicked = kickDavinciPlayer(state, ps[0], made.roomId, ps[2].id, at(3));
  assert.equal(kicked.ok, true);
  assert.equal(state.davinci.rooms[made.roomId].players.some((p)=>p.petId===ps[2].id), false);
  assert.equal(state.davinci.rooms[made.roomId].players.find((p)=>p.petId===ps[1].id).ready, false, '강퇴로 구성원이 바뀌면 준비를 다시 받는다');
});

test('판이 끝나기 전에는 비밀을 숨기고 종료 후에는 모든 코드와 남은 덱을 공개한다', () => {
  const {state, ps, roomId} = setupPlayers(2, 100);
  startToTurn(state, ps, roomId);
  const room = state.davinci.rooms[roomId];
  const before = davinciRoomView(state, roomId, ps[0].id, at(4));
  const opponentBefore = before.players.find((p)=>p.petId===ps[1].id);
  assert.ok(opponentBefore.hand.some((tile)=>tile.hidden), '진행 중 상대 비밀 타일이 있어야 한다');
  assert.equal(before.deckColors.black + before.deckColors.white, before.deckCount);

  const target = room.players[1];
  const hidden = target.hand.filter((tile)=>!tile.revealed);
  for (const tile of hidden.slice(0, -1)) tile.revealed = true;
  const last = hidden.at(-1);
  const guess = last.joker ? 'joker' : String(last.value);
  const result = guessDavinciTile(state, ps[0], roomId, ps[1].id, last.id, guess, 'final-reveal', at(5));
  assert.equal(result.finished, true);
  const after = davinciRoomView(state, roomId, ps[1].id, at(6));
  assert.equal(after.status, 'ended');
  assert.equal(after.players.every((player)=>player.hand.every((tile)=>tile.hidden===false)), true, '종료 후 모든 참가자의 코드를 공개한다');
  assert.equal(after.endedDeck.length, after.deckCount);
  assert.equal(after.endedDeck.every((tile)=>tile.hidden===false), true, '종료 후 남은 덱도 전부 공개한다');
});

import { createRoom, register, authRequest, responseJson } from './helpers.js';

async function post(room, path, token, body={}) {
  return responseJson(await room.fetch(authRequest(path, token, { method:'POST', body:JSON.stringify(body) })));
}

test('다빈치 API 생성→참가→준비→시작 흐름과 bootstrap 비밀정보가 연결된다', async () => {
  const { room } = await createRoom();
  const tokenA = await register(room, '다빈치A');
  const tokenB = await register(room, '다빈치B');
  let state = await room.store.load();
  for (const pet of Object.values(state.pets)) pet.stats.points = 5000;
  await room.store.save(state);
  let r = await post(room, '/api/davinci/rooms', tokenA, {stakePoints:500});
  assert.equal(r.response.status, 201, JSON.stringify(r.data));
  const roomId = r.data.roomId;
  assert.ok(r.data.bootstrap?.davinci?.rooms?.some(x=>x.id===roomId));
  r = await post(room, `/api/davinci/rooms/${roomId}/join`, tokenB);
  assert.equal(r.response.status, 200, JSON.stringify(r.data));
  r = await post(room, `/api/davinci/rooms/${roomId}/ready`, tokenB, {ready:true});
  assert.equal(r.response.status, 200, JSON.stringify(r.data));
  r = await post(room, `/api/davinci/rooms/${roomId}/start`, tokenA);
  assert.equal(r.response.status, 200, JSON.stringify(r.data));
  const viewA = r.data.bootstrap.davinci.rooms.find(x=>x.id===roomId);
  const petA = viewA.players.find(x=>x.petId===viewA.selfPetId);
  const petB = viewA.players.find(x=>x.petId!==viewA.selfPetId);
  assert.equal(petA.hand.every(tile=>tile.hidden===false), true);
  assert.equal(petB.hand.every(tile=>tile.hidden===true || tile.revealed), true);
  assert.equal(petB.hand.every(tile=>tile.hidden ? tile.value===null && tile.joker===false : true), true);
});

test('방장 강퇴 API는 대기방에서만 동작하고 강퇴 뒤 기존 준비를 초기화한다', async () => {
  const { room } = await createRoom();
  const tokenA = await register(room, '강퇴방장');
  const tokenB = await register(room, '강퇴참가A');
  const tokenC = await register(room, '강퇴참가B');
  let state = await room.store.load();
  for (const pet of Object.values(state.pets)) pet.stats.points = 5000;
  await room.store.save(state);
  const made = await post(room, '/api/davinci/rooms', tokenA, {stakePoints:100});
  const roomId = made.data.roomId;
  await post(room, `/api/davinci/rooms/${roomId}/join`, tokenB);
  await post(room, `/api/davinci/rooms/${roomId}/ready`, tokenB, {ready:true});
  await post(room, `/api/davinci/rooms/${roomId}/join`, tokenC);
  const current = (await room.store.load()).davinci.rooms[roomId];
  const targetPetId = current.players.find((p)=>p.displayName.includes('강퇴참가B')).petId;
  const denied = await post(room, `/api/davinci/rooms/${roomId}/kick`, tokenB, {targetPetId});
  assert.equal(denied.response.status, 400);
  const kicked = await post(room, `/api/davinci/rooms/${roomId}/kick`, tokenA, {targetPetId});
  assert.equal(kicked.response.status, 200, JSON.stringify(kicked.data));
  const saved = (await room.store.load()).davinci.rooms[roomId];
  assert.equal(saved.players.some((p)=>p.petId===targetPetId), false);
  assert.equal(saved.players.filter((p)=>p.petId!==saved.hostPetId).every((p)=>p.ready===false), true);
});

test('공통 공감은 플레이어도 사용 가능하고 7종 중 졸려요를 실시간 메모리로만 전달한다', async () => {
  const { room } = await createRoom();
  const tokenA = await register(room, '공감A');
  const tokenB = await register(room, '공감B');
  let state = await room.store.load();
  for (const pet of Object.values(state.pets)) pet.stats.points = 5000;
  await room.store.save(state);
  const made = await post(room, '/api/davinci/rooms', tokenA, {stakePoints:100});
  const roomId = made.data.roomId;
  await post(room, `/api/davinci/rooms/${roomId}/join`, tokenB);
  await post(room, `/api/davinci/rooms/${roomId}/ready`, tokenB, {ready:true});
  await post(room, `/api/davinci/rooms/${roomId}/start`, tokenA);
  const before = JSON.stringify(await room.store.load());
  const reaction = await post(room, `/api/davinci/rooms/${roomId}/reaction`, tokenA, {type:'sleepy'});
  assert.equal(reaction.response.status, 200, JSON.stringify(reaction.data));
  assert.equal(reaction.data.reaction.emoji, '🥱');
  assert.equal(reaction.data.reaction.label, '졸려요');
  assert.equal(reaction.data.bootstrap.davinci.rooms.find(x=>x.id===roomId).reactions.some(x=>x.label==='졸려요'), true);
  const after = JSON.stringify(await room.store.load());
  assert.equal(after, before, '공감은 Durable 상태에 저장하지 않는다');
});
