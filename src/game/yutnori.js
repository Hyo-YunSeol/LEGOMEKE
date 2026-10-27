// LEGO LIFE 윷놀이: 서버가 윷 결과, 이동, 업기, 잡기, 순위와 보상을 단독 확정합니다.
// 넷마블 게임의 공개된 전통 윷놀이 규칙을 참고한 독립 구현입니다.
import { id } from '../lib/ids.js';
import { gameDayKey } from '../lib/time.js';
import { canStartBattleForPets, consumeBattleForPets } from './battle-limit.js';
import { consumeInteractionHunger, hungerActionLock } from './activity.js';

export const YUT_MAX_ROOMS = 3;
export const YUT_REWARD = 300;
export const YUT_MATCH_MS = 25 * 60_000;
export const YUT_THROW_MS = 15_000;
export const YUT_MOVE_MS = 30_000;
const WAIT_MS = 10 * 60_000;
const RESULT_MS = 24 * 60 * 60_000;
const bad = (message) => ({ ok: false, message });
const iso = (time) => new Date(time).toISOString();
const ms = (time) => new Date(time || 0).getTime() || 0;
const nn = (n) => Math.max(0, Math.floor(Number(n) || 0));
const clone = (value) => structuredClone(value);

export function initialYut() { return { rooms: {}, results: {} }; }
export function normalizeYut(raw, state, date = new Date()) {
  const data = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : initialYut();
  if (!data.rooms || typeof data.rooms !== 'object' || Array.isArray(data.rooms)) data.rooms = {};
  if (!data.results || typeof data.results !== 'object' || Array.isArray(data.results)) data.results = {};
  for (const [key, value] of Object.entries(data.results)) if (!value || ms(value.endedAt) + RESULT_MS < date.getTime()) delete data.results[key];
  for (const [key, room] of Object.entries(data.rooms)) {
    if (!room || !Array.isArray(room.players) || !room.players.some((player) => state?.pets?.[player.petId])) delete data.rooms[key];
  }
  return data;
}
function roomOf(state, petId) {
  return Object.values(state.yut?.rooms || {}).find((room) => room.players.some((p) => p.petId === petId)) || null;
}
// 대전방의 players 자료형은 게임마다 다릅니다.
// 루미큐브는 배열, 오목은 host/guest ID, 테트리스·사천성·레고도쿠는 petId를 키로 한 객체입니다.
// 객체에 배열 전용 .some()을 호출하면 윷놀이 방 생성 자체가 500 오류로 실패합니다.
function isRoomParticipant(room, petId) {
  if (!room || !petId) return false;
  if ([room.hostPetId, room.guestPetId, room.blackPetId, room.whitePetId,
    room.player1PetId, room.player2PetId].includes(petId)) return true;
  const players = room.players;
  if (Array.isArray(players)) {
    return players.some((entry) => (typeof entry === 'string' ? entry : entry?.petId) === petId);
  }
  if (players && typeof players === 'object') {
    // 초기/대기방은 빈 객체일 수 있고, 대전 중인 방은 선수 petId가 객체 키입니다.
    return Object.hasOwn(players, petId) || Object.values(players).some((entry) =>
      (typeof entry === 'string' ? entry : entry?.petId) === petId);
  }
  return false;
}
function conflict(state, petId) {
  for (const key of ['omok', 'blockBattle', 'sichuan', 'legodoku', 'rummikub']) {
    const rooms = state[key]?.rooms || {};
    if (Object.values(rooms).some((room) =>
      room && ['waiting', 'playing', 'setup', 'rps'].includes(room.status) && isRoomParticipant(room, petId)
    )) return true;
  }
  return false;
}
function sameSide(room, a, b) {
  const first = room.players.find((p) => p.petId === a);
  const second = room.players.find((p) => p.petId === b);
  return Boolean(first && second && (room.mode === 'team' ? first.team === second.team : a === b));
}
export function createYutRoom(state, pet, { mode = 'solo', seats = 2 } = {}, date = new Date()) {
  state.yut = normalizeYut(state.yut, state, date);
  if (mode !== 'solo' && mode !== 'team') return bad('게임 방식을 선택해 주세요.');
  seats = mode === 'team' ? 4 : Number(seats);
  if (![2, 3, 4].includes(seats)) return bad('개인전은 2~4명까지 가능합니다.');
  if (roomOf(state, pet.id) || conflict(state, pet.id)) return bad('이미 참가 중인 대전방이 있습니다.');
  const used = new Set(Object.values(state.yut.rooms).map((r) => r.number));
  const number = [1, 2, 3].find((n) => !used.has(n));
  if (!number) return bad('윷놀이 방 3개가 모두 사용 중입니다.');
  const room = { id: id('yut'), number, mode, seats, status: 'waiting', hostPetId: pet.id,
    createdAt: iso(date), startedAt: null, endsAt: null, deadlineAt: null,
    players: [{ petId: pet.id, team: 0, forfeited: false, inactive: 0 }], spectators: [],
    pieces: [], currentIndex: 0, phase: 'throw', pending: [], history: [], turn: 0, revision: 0 };
  state.yut.rooms[room.id] = room;
  return { ok: true, roomId: room.id, message: `${number}번 윷놀이 방을 만들었습니다.` };
}
export function joinYutRoom(state, pet, roomId) {
  const room = state.yut?.rooms?.[roomId];
  if (!room || room.status !== 'waiting') return bad('참가할 수 없는 방입니다.');
  if (room.players.some((p) => p.petId === pet.id)) return { ok: true, roomId };
  if (roomOf(state, pet.id) || conflict(state, pet.id)) return bad('이미 참가 중인 대전방이 있습니다.');
  if (room.players.length >= room.seats) return bad('정원이 가득 찼습니다.');
  room.players.push({ petId: pet.id, team: room.mode === 'team' ? room.players.length % 2 : room.players.length, forfeited: false, inactive: 0 });
  room.revision++;
  return { ok: true, roomId, message: '윷놀이 방에 참가했습니다.' };
}
export function spectateYutRoom(state, pet, roomId) {
  const room = state.yut?.rooms?.[roomId];
  if (!room || room.status !== 'playing') return bad('진행 중인 윷놀이만 관전할 수 있습니다.');
  if (room.players.some((p) => p.petId === pet.id)) return bad('참가 중인 사람은 관전할 수 없습니다.');
  if (!room.spectators.includes(pet.id)) room.spectators.push(pet.id);
  return { ok: true, roomId };
}
function log(room, text) {
  room.history.unshift(text);
  room.history = room.history.slice(0, 12);
  room.revision++;
}
function active(room) { return room.players.filter((p) => !p.forfeited); }
function current(room) { return room.players[room.currentIndex]; }
function deadline(room, date) {
  room.deadlineAt = iso(date.getTime() + (room.phase === 'throw' ? YUT_THROW_MS : YUT_MOVE_MS));
}
export function startYutRoom(state, pet, roomId, date = new Date(), random = Math.random) {
  const room = state.yut?.rooms?.[roomId];
  if (!room || room.status !== 'waiting' || room.hostPetId !== pet.id) return bad('방장만 게임을 시작할 수 있습니다.');
  if (room.players.length !== room.seats) return bad(`${room.seats}명이 모여야 게임을 시작할 수 있습니다.`);
  const pets = room.players.map((p) => state.pets?.[p.petId]);
  if (pets.some((p) => !p?.alive || hungerActionLock(p, date).locked)) return bad('참가자 중 게임에 참가할 수 없는 레고가 있습니다.');
  const allowed = canStartBattleForPets(pets, date);
  if (!allowed.ok) return allowed;
  consumeBattleForPets(pets, date);
  for (const p of pets) consumeInteractionHunger(p, date, 2);
  room.pieces = room.players.flatMap((p) => Array.from({ length: room.mode === 'team' ? 3 : 4 }, (_, n) => ({
    id: `${p.petId}:${n}`, owner: p.petId, number: n + 1, position: 'start', path: ['start'], route: 'outer', finished: false
  })));
  room.currentIndex = Math.min(room.players.length - 1, Math.floor(random() * room.players.length));
  room.status = 'playing'; room.startedAt = iso(date); room.endsAt = iso(date.getTime() + YUT_MATCH_MS);
  room.phase = 'throw'; room.pending = []; room.turn = 1;
  deadline(room, date); log(room, '윷놀이가 시작됐습니다.');
  return { ok: true, roomId, message: '윷놀이가 시작됐습니다.' };
}

// 일반 도개걸윷모: 뒤집힌 윷 4개의 16가지 경우를 같은 확률로 판정한다.
// 특별표시 윷 하나만 뒤집힌 도는 빽도. 게이지 없이 모든 던지기에 낙 1%.
export function rollYut(power, random = Math.random) {
  const p = Number(power);
  // 이전 버전과 함수 호출 호환성은 유지하되, 클라이언트 파워 입력은 결과에 영향을 주지 않는다.
  void p;
  const nak = 0.01;
  if (random() < nak) return { name: '낙', steps: 0, nak: true, extra: false };
  const bits = Array.from({ length: 4 }, () => random() < 0.5);
  const count = bits.filter(Boolean).length;
  if (count === 0) return { name: '모', steps: 5, nak: false, extra: true };
  if (count === 4) return { name: '윷', steps: 4, nak: false, extra: true };
  if (count === 1 && bits[0]) return { name: '빽도', steps: -1, nak: false, extra: false };
  return { name: ['','도','개','걸'][count], steps: count, nak: false, extra: false };
}

// 네 귀퉁이와 중앙을 독립적인 그래프로 구현. 지름길은 해당 분기점에서 출발할 때만 선택한다.
const next = (node, route = 'outer', shortcut = false) => {
  if (node === 'start') return '0';
  if (node === 'home') return null;
  if (node === '4' && shortcut) return 'a1';
  if (node === '9' && shortcut) return 'b1';
  if (node === 'center') return route === 'b' || shortcut ? 'b4' : 'a4';
  const diag = { a1: 'a2', a2: 'center', a4: 'a5', a5: '14', b1: 'b2', b2: 'center', b4: 'b5', b5: '19' };
  if (diag[node]) return diag[node];
  const n = Number(node);
  return Number.isInteger(n) && n >= 0 && n < 20 ? (n === 19 ? 'home' : String(n + 1)) : null;
};
function forward(piece, steps, shortcut = false) {
  const copyPiece = clone(piece);
  if (copyPiece.finished) return null;
  let node = copyPiece.position;
  for (let i = 0; i < steps; i++) {
    const turnHere = i === 0 && Boolean(shortcut);
    if (turnHere && node === '4') copyPiece.route = 'a';
    if (turnHere && node === '9') copyPiece.route = 'b';
    if (turnHere && node === 'center') copyPiece.route = 'b';
    node = next(node, copyPiece.route, turnHere);
    if (node === null) return null;
    copyPiece.path.push(node);
    if (node === 'home' || node === '19') {
      // 윷판 외곽의 20번째 칸(19)은 출발·골인 지점과 동일하다.
      copyPiece.finished = true;
      copyPiece.position = 'home';
      return copyPiece;
    }
  }
  copyPiece.position = node;
  return copyPiece;
}
function backward(piece) {
  if (piece.finished || piece.position === 'start' || piece.path.length < 2) return null;
  const p = clone(piece);
  p.path.pop();
  p.position = p.path[p.path.length - 1];
  p.route = p.path.some((n) => String(n).startsWith('b')) ? 'b' : p.path.some((n) => String(n).startsWith('a')) ? 'a' : 'outer';
  return p;
}
export function calculateYutMove(piece, steps, shortcut = false) {
  if (!Number.isInteger(steps) || steps < -1 || steps > 5) return null;
  if (steps < 0) return backward(piece);
  if (!steps) return null;
  if (shortcut && !['4', '9', 'center'].includes(piece.position)) return null;
  return forward(piece, steps, shortcut);
}
function movableGroup(room, piece, actorId) {
  if (!piece || piece.finished || piece.owner !== actorId) return [];
  if (piece.position === 'start') return [piece];
  return room.pieces.filter((candidate) => !candidate.finished && candidate.position === piece.position && sameSide(room, piece.owner, candidate.owner));
}
export function yutMoves(room) {
  if (room.status !== 'playing' || room.phase !== 'move') return [];
  const owner = current(room)?.petId;
  const result = [];
  for (let rollIndex = 0; rollIndex < room.pending.length; rollIndex++) {
    const roll = room.pending[rollIndex];
    for (const piece of room.pieces) {
      if (piece.owner !== owner || piece.finished) continue;
      if (piece.position !== 'start' && room.pieces.some((other) => other.owner === owner && other.position === piece.position && other.id < piece.id)) continue;
      for (const shortcut of ['4', '9', 'center'].includes(piece.position) ? [false, true] : [false]) {
        const destination = calculateYutMove(piece, roll.steps, shortcut);
        if (destination) {
          const options = [false];
          if (room.mode === 'team' && destination.position !== 'home' && destination.position !== 'start' && room.pieces.some((p) => !p.finished && p.position === destination.position && p.owner !== owner && sameSide(room, owner, p.owner))) options.push(true);
          for (const friendlyCatch of options) result.push({ pieceId: piece.id, rollIndex, roll: roll.name, steps: roll.steps, shortcut, friendlyCatch,
            from: piece.position, to: destination.position });
        }
      }
    }
  }
  return result;
}
function endTurn(room, date) {
  room.pending = []; room.phase = 'throw';
  let index = room.currentIndex;
  for (let step = 0; step < room.players.length; step++) {
    index = (index + 1) % room.players.length;
    if (!room.players[index].forfeited) break;
  }
  room.currentIndex = index; room.turn++;
  deadline(room, date); room.revision++;
}
function ensureMovePhase(room, date) {
  if (room.phase !== 'move') return;
  // 빽도만 남았는데 뒤로 갈 말이 없는 상황 등에서는 선택 불가 결과를 소모한다.
  while (room.pending.length && !yutMoves(room).length) { room.pending.shift(); room.revision++; }
  if (!room.pending.length) endTurn(room, date);
  else deadline(room, date);
}
function completed(room, player) {
  return room.pieces.filter((p) => p.owner === player.petId).every((p) => p.finished);
}
function finishedCount(room, player) { return room.pieces.filter((p) => p.owner === player.petId && p.finished).length; }
function progression(room, player) {
  return room.pieces.filter((p) => p.owner === player.petId).reduce((sum, p) => sum + (p.finished ? 30 : p.path.length - 1), 0);
}
function settle(state, room, winners, reason, date) {
  if (room.status !== 'playing') return null;
  // 같은 조합과의 반복 기권·짧은 어뷰징 경기에서는 보상을 중복 지급하지 않는다.
  const eligible = !/상대방의 기권/.test(reason) || room.turn >= 3;
  const entries = room.players.map((player) => {
    const p = state.pets?.[player.petId];
    const winner = winners.includes(player.petId) && !player.forfeited;
    const participants = room.players.map((x) => x.petId).sort().join(':');
    const rewardKey = `${gameDayKey(date)}:${participants}`;
    p.records ??= {};
    p.records.yutGames = nn(p.records.yutGames) + 1;
    p.records.yutWins = nn(p.records.yutWins) + (winner ? 1 : 0);
    p.records.yutLosses = nn(p.records.yutLosses) + (winner ? 0 : 1);
    p.records.seasonYutWins = nn(p.records.seasonYutWins) + (winner ? 1 : 0);
    p.records.seasonYutLosses = nn(p.records.seasonYutLosses) + (winner ? 0 : 1);
    const paid = nn(p.records.yutRewardMatches?.[rewardKey]);
    const payout = winner && eligible && paid < 3 ? YUT_REWARD : 0;
    if (payout) {
      p.records.yutRewardMatches ??= {};
      p.records.yutRewardMatches[rewardKey] = paid + 1;
      // 이전 게임일의 중복방지 기록은 즉시 삭제해 상태 크기를 제한한다.
      for (const k of Object.keys(p.records.yutRewardMatches)) if (!k.startsWith(`${gameDayKey(date)}:`)) delete p.records.yutRewardMatches[k];
      p.stats.points = nn(p.stats.points) + payout;
      p.records.pointsEarned = nn(p.records.pointsEarned) + payout;
      p.records.maxPoints = Math.max(nn(p.records.maxPoints), p.stats.points);
    }
    return { petId: player.petId, displayName: p?.displayName || '레고', winner, forfeit: player.forfeited, payout };
  });
  const result = { matchId: room.id, mode: room.mode, reason, entries, endedAt: iso(date) };
  for (const player of room.players) state.yut.results[player.petId] = result;
  for (const petId of room.spectators) state.yut.results[petId] = result;
  room.status = 'ended';
  delete state.yut.rooms[room.id];
  return result;
}
function autoVictory(state, room, date) {
  if (room.status !== 'playing') return;
  const winner = room.players.find((p) => !p.forfeited && completed(room, p));
  if (winner) {
    const ids = room.mode === 'team' ? room.players.filter((p) => p.team === winner.team).map((p) => p.petId) : [winner.petId];
    settle(state, room, ids, '모든 말을 골인했습니다.', date);
  }
}
function forfeit(state, room, playerId, date) {
  const p = room.players.find((x) => x.petId === playerId);
  if (!p || p.forfeited) return;
  p.forfeited = true; room.revision++;
  log(room, `${state.pets?.[playerId]?.displayName || '참가자'}님이 기권했습니다.`);
  if (room.mode === 'team') {
    settle(state, room, room.players.filter((x) => x.team !== p.team && !x.forfeited).map((x) => x.petId), '상대방의 기권', date);
  } else if (active(room).length <= 1) {
    settle(state, room, active(room).map((x) => x.petId), '상대방의 기권', date);
  } else if (current(room)?.petId === playerId) endTurn(room, date);
}
export function leaveYutRoom(state, pet, roomId, date = new Date()) {
  const room = state.yut?.rooms?.[roomId];
  if (!room) return bad('게임방이 존재하지 않습니다.');
  if (room.spectators.includes(pet.id)) {
    room.spectators = room.spectators.filter((n) => n !== pet.id); room.revision++;
    return { ok: true, message: '관전을 종료했습니다.' };
  }
  const idx = room.players.findIndex((p) => p.petId === pet.id);
  if (idx < 0) return bad('참가자가 아닙니다.');
  if (room.status === 'playing') forfeit(state, room, pet.id, date);
  else {
    room.players.splice(idx, 1);
    if (room.players.length) room.hostPetId = room.players[0].petId;
    else delete state.yut.rooms[room.id];
    room.revision++;
  }
  return { ok: true, message: '윷놀이 방에서 나갔습니다.' };
}
export function actionYut(state, pet, roomId, body, date = new Date(), random = Math.random) {
  const room = state.yut?.rooms?.[roomId];
  if (!room || room.status !== 'playing') return bad('진행 중인 게임이 아닙니다.');
  if (ms(room.endsAt) <= date.getTime() || ms(room.deadlineAt) <= date.getTime()) return bad('제한 시간이 지났습니다. 상태를 새로고침해 주세요.');
  if (current(room)?.petId !== pet.id || current(room)?.forfeited) return bad('본인 차례가 아닙니다.');
  if (body?.type === 'throw') {
    if (room.phase !== 'throw') return bad('먼저 말을 이동해 주세요.');
    // 시간 초과 횟수는 직접 조작으로 초기화하지 않는다(누적 4회 기권).
    delete current(room).disconnectedAt;
    const roll = rollYut(50, random);
    room.lastRoll = { name: roll.name, steps: roll.steps, petId: pet.id, at: iso(date) };
    log(room, `${pet.displayName}: ${roll.name}`);
    if (roll.nak) { endTurn(room, date); return { ok: true, roll, message: '낙! 다음 차례로 넘어갑니다.' }; }
    room.pending.push({ name: roll.name, steps: roll.steps });
    room.phase = roll.extra ? 'throw' : 'move';
    if (room.phase === 'move') ensureMovePhase(room, date);
    else deadline(room, date);
    return { ok: true, roll, message: `${roll.name}이(가) 나왔습니다.` };
  }
  if (body?.type !== 'move' || room.phase !== 'move') return bad('지금은 말을 움직일 차례가 아닙니다.');
  const allowed = yutMoves(room).find((m) => m.pieceId === body.pieceId && m.rollIndex === body.rollIndex && m.shortcut === Boolean(body.shortcut) && m.friendlyCatch === Boolean(body.friendlyCatch));
  if (!allowed) return bad('선택할 수 없는 말 또는 이동 경로입니다.');
  // 직접 입력은 현재 턴·마감 시각·합법 이동을 검사한 후에만 반영한다.
  delete current(room).disconnectedAt;
  return applyYutMove(state,room,pet,allowed,date);
}
function applyYutMove(state, room, pet, allowed, date) {
  const piece = room.pieces.find((p) => p.id === allowed.pieceId);
  const group = movableGroup(room, piece, pet.id);
  const result = calculateYutMove(piece, allowed.steps, allowed.shortcut);
  for (const p of group) {
    p.position = result.position; p.path = clone(result.path); p.route = result.route; p.finished = result.finished;
  }
  room.pending.splice(allowed.rollIndex, 1);
  const caught = !result.finished && result.position !== 'start' ? room.pieces.filter((p) => !p.finished && p.position === result.position && !group.includes(p) && (!sameSide(room, piece.owner, p.owner) || (allowed.friendlyCatch && p.owner !== piece.owner))) : [];
  for (const other of caught) { other.position = 'start'; other.path = ['start']; other.route = 'outer'; other.finished = false; }
  log(room, `${pet.displayName}: ${allowed.roll}${allowed.shortcut ? ' · 지름길' : ''}${caught.length ? ` · ${caught.length}개 잡기` : ''}${result.finished ? ' · 골인' : ''}`);
  autoVictory(state, room, date);
  if (room.status !== 'playing') return { ok: true, message: '게임이 종료됐습니다.' };
  if (caught.length) { room.phase = 'throw'; deadline(room, date); }
  else ensureMovePhase(room, date);
  return { ok: true, message: caught.length ? '상대 말을 잡았습니다! 한 번 더 던지세요.' : '말을 이동했습니다.' };
}

// 자동 진행에서 유리한 합법 이동부터 선택한다. 팀원의 말을 자동으로 잡지 않는다.
export function chooseAutoYutMove(room) {
  const moves=yutMoves(room).filter(move=>!move.friendlyCatch);
  const ranked=moves.map((move)=>{
    const piece=room.pieces.find(p=>p.id===move.pieceId);
    const destination=calculateYutMove(piece,move.steps,move.shortcut);
    const same=room.pieces.filter(p=>p.id!==piece.id && !p.finished && p.position===destination.position);
    const catchOpponent=!destination.finished&&same.some(p=>!sameSide(room,piece.owner,p.owner));
    const stack=!destination.finished&&same.some(p=>p.owner!==piece.owner&&sameSide(room,piece.owner,p.owner)) ||
      !destination.finished&&same.some(p=>p.owner===piece.owner);
    const priority=destination.finished?4:catchOpponent?3:stack?2:1;
    const advancement=destination.finished?100:destination.path.length-piece.path.length;
    return {move,priority,advancement};
  });
  ranked.sort((a,b)=>b.priority-a.priority||b.advancement-a.advancement||a.move.rollIndex-b.move.rollIndex||a.move.pieceId.localeCompare(b.move.pieceId)||Number(b.move.shortcut)-Number(a.move.shortcut));
  return ranked[0]?.move||null;
}
export function processYutTimers(state, date = new Date(), random = Math.random) {
  if (!state.yut?.rooms) return { changed: false };
  let changed = false;
  for (const room of Object.values(state.yut.rooms)) {
    if (room.status === 'waiting' && ms(room.createdAt) + WAIT_MS <= date.getTime()) {
      delete state.yut.rooms[room.id]; changed = true; continue;
    }
    if (room.status !== 'playing') continue;
    const disconnected = room.players.find((p) => !p.forfeited && p.disconnectedAt && ms(p.disconnectedAt) + 60_000 <= date.getTime());
    if (disconnected) { forfeit(state, room, disconnected.petId, date); changed = true; continue; }
    if (ms(room.endsAt) <= date.getTime()) {
      // 제한시간 종료는 골인 수 → 실제 이동량 순으로 판정, 동률이면 무승부
      const eligible = active(room);
      const ranked = [...eligible].sort((a, b) => finishedCount(room, b) - finishedCount(room, a) || progression(room, b) - progression(room, a));
      const top = ranked[0];
      const winner = top ? ranked.filter((p) => finishedCount(room, p) === finishedCount(room, top) && progression(room, p) === progression(room, top)) : [];
      const ids = winner.length === 1 ? (room.mode === 'team' ? eligible.filter((p) => p.team === winner[0].team).map((p) => p.petId) : [winner[0].petId]) : [];
      settle(state, room, ids, ids.length ? '제한시간 종료 · 이동 진행도 우세' : '제한시간 종료 · 무승부', date);
      changed = true; continue;
    }
    if (ms(room.deadlineAt) > date.getTime()) continue;
    const actor = current(room);
    if (!actor) continue;
    actor.inactive++;
    if (actor.inactive >= 4) { forfeit(state, room, actor.petId, date); changed = true; continue; }
    if (room.phase === 'throw') {
      // 게이지가 없으며 모든 던지기는 동일하게 낙 확률 1%
      const roll = rollYut(50, random);
      room.lastRoll = { name: roll.name, steps: roll.steps, petId: actor.petId, at: iso(date) };
      log(room, `${state.pets?.[actor.petId]?.displayName || '참가자'} 자동 던지기: ${roll.name}`);
      if (roll.nak) endTurn(room, date);
      else {
        room.pending.push({ name: roll.name, steps: roll.steps });
        room.phase = roll.extra ? 'throw' : 'move';
        if (room.phase === 'move') ensureMovePhase(room, date);
        else deadline(room, date);
      }
    } else {
      const move = chooseAutoYutMove(room);
      if (move) {
        log(room, `${state.pets?.[actor.petId]?.displayName || '참가자'} 시간 초과 · 자동 이동`);
        applyYutMove(state, room, state.pets[actor.petId], move, date);
      }
      else endTurn(room, date);
      if (room.status === 'playing') deadline(room, date);
    }
    changed = true;
  }
  return { changed };
}
export function setYutConnected(state, petId, connected, date = new Date()) {
  let changed = false;
  for (const room of Object.values(state.yut?.rooms || {})) {
    if (room.status !== 'playing') continue;
    const player = room.players.find((p) => p.petId === petId);
    if (!player) continue;
    if (connected && player.disconnectedAt) { delete player.disconnectedAt; changed = true; }
    if (!connected && !player.disconnectedAt) { player.disconnectedAt = iso(date); changed = true; }
    if (changed) room.revision++;
  }
  return { changed };
}
export function yutNextAlarmAt(state) {
  const next = Object.values(state.yut?.rooms || {}).flatMap((r) => r.status === 'waiting' ? [ms(r.createdAt) + WAIT_MS] : r.status === 'playing' ? [ms(r.endsAt), ms(r.deadlineAt), ...r.players.filter(p=>!p.forfeited&&p.disconnectedAt).map(p=>ms(p.disconnectedAt)+60_000)] : []).filter((t) => t > 0);
  return next.length ? iso(Math.min(...next)) : null;
}
export function yutRanking(state, viewerId) {
  const rows = Object.values(state.pets || {}).filter((p) => p?.alive && (nn(p.records?.seasonYutWins) || nn(p.records?.seasonYutLosses)))
    .map((p) => ({ petId: p.id, displayName: p.displayName, wins: nn(p.records.seasonYutWins), losses: nn(p.records.seasonYutLosses) }))
    .sort((a, b) => b.wins - a.wins || a.losses - b.losses || a.displayName.localeCompare(b.displayName, 'ko'))
    .map((row, n) => ({ ...row, rank: n + 1 }));
  return { top: rows.slice(0, 5), mine: rows.find((r) => r.petId === viewerId) || null };
}
export function acknowledgeYutResult(state,pet,matchId) {
  const result=state.yut?.results?.[pet.id];
  if(result&&result.matchId===matchId){delete state.yut.results[pet.id];return {ok:true,acknowledged:true};}
  return {ok:true,acknowledged:false};
}
export function yutView(state, viewerId) {
  return { maxRooms: YUT_MAX_ROOMS, reward: YUT_REWARD,
    rooms: Object.values(state.yut?.rooms || {}).sort((a, b) => a.number - b.number).map((r) => ({
      id: r.id, number: r.number, mode: r.mode, seats: r.seats, hostPetId: r.hostPetId, status: r.status,
      role: r.players.some((p) => p.petId === viewerId) ? 'player' : r.spectators.includes(viewerId) ? 'spectator' : 'none',
      players: r.players.map((p) => ({ ...p, displayName: state.pets?.[p.petId]?.displayName || '레고' })),
      spectatorCount: r.spectators.length, revision: r.revision, currentPetId: current(r)?.petId,
      ...(r.status === 'playing' ? { pieces: r.pieces, phase: r.phase, pending: r.pending,
        moves: current(r)?.petId === viewerId ? yutMoves(r) : [], history: r.history, lastRoll: r.lastRoll || null,
        deadlineAt: r.deadlineAt, endsAt: r.endsAt, turn: r.turn } : {})
    })), latestResult: state.yut?.results?.[viewerId] || null };
}
export function removePetFromYut(state, petId, date = new Date()) {
  for (const room of Object.values(state.yut?.rooms || {})) {
    room.spectators = room.spectators.filter((id) => id !== petId);
    if (room.players.some((p) => p.petId === petId)) leaveYutRoom(state, { id: petId }, room.id, date);
  }
  if (state.yut?.results) delete state.yut.results[petId];
}
