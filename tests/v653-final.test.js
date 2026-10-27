import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initialState } from '../src/durable-store.js';
import { createPet, publicProfile, privateDashboard, requestAppleNewBoardGame, selectAppleGame } from '../src/game/engine.js';
import { countAppleMovesOnBoard, normalizeAppleChallenge, requestAppleNewBoard } from '../src/game/apple-game.js';
import { createRoom, register, authRequest, responseJson } from './helpers.js';

const BASE = new Date('2026-08-10T02:00:00.000Z');

async function roomApi(room, token, path, body = {}) {
  return responseJson(await room.fetch(authRequest(path, token, { method:'POST', body:JSON.stringify(body) })));
}

async function roomBootstrap(room, token) {
  const { response, data } = await responseJson(await room.fetch(authRequest('/api/bootstrap', token)));
  assert.equal(response.status, 200, JSON.stringify(data));
  return data.bootstrap;
}

function blankBoard() { return Array.from({ length: 10 }, () => Array(10).fill(null)); }
function setupApple() {
  const state = initialState();
  const user = { id:'u', nickname:'사과', generation:1, currentPetId:null, sessionVersion:1, workoutBadge:false, notifications:[], createdAt:BASE.toISOString(), lastSeenAt:BASE.toISOString() };
  const pet = createPet(user, 1, BASE); user.currentPetId = pet.id; state.users[user.id] = user; state.pets[pet.id] = pet;
  const challenge = { id:'apple-test', petId:pet.id, gameId:'apple', createdAt:BASE.toISOString(), expiresAt:new Date(BASE.getTime()+120000).toISOString(), completed:false, appleBoard:blankBoard(), applePendingPoints:0, appleScore:0, appleRemovedCount:0, appleSuccesses:0, appleBoardsGenerated:1, appleProcessedRequestIds:[], appleRefreshRequestIds:[] };
  state.miniGameChallenges[challenge.id] = normalizeAppleChallenge(challenge);
  return { state, user, pet, challenge: state.miniGameChallenges[challenge.id] };
}

test('사과 선택지 개수는 null 여백만 다른 같은 숫자 묶음을 중복 경우의 수로 세지 않는다', () => {
  const board = blankBoard(); board[4][4] = 4; board[4][5] = 6;
  assert.equal(countAppleMovesOnBoard(board, 6), 1);
});

test('사과게임은 성공 후 1~5개 선택지가 남으면 새 판 제안을 허용하고 0개면 자동 새 판으로 넘어간다', () => {
  const { state, pet, challenge } = setupApple();
  // 독립된 합10 묶음 2개를 만들고 하나를 지워, 성공 직후 사람이 볼 만한 선택지가 1개 남는 상황을 만든다.
  challenge.appleBoard = blankBoard();
  challenge.appleBoard[0][0]=4; challenge.appleBoard[0][1]=6;
  challenge.appleBoard[9][8]=3; challenge.appleBoard[9][9]=7;
  challenge.appleAvailableMoves = countAppleMovesOnBoard(challenge.appleBoard, 6);
  challenge.appleNewBoardAvailable = challenge.appleAvailableMoves <= 5;
  assert.equal(challenge.appleAvailableMoves, 2);
  const beforeBoards = challenge.appleBoardsGenerated;
  const result = selectAppleGame(state, pet, challenge.id, { startRow:0,startCol:0,endRow:0,endCol:1 }, 'leave-one-choice', BASE);
  assert.equal(result.removed, true);
  assert.equal(result.boardRefreshed, undefined, '1개가 남았을 때는 자동 교체하지 않는다');
  assert.equal(result.availableMoves, 1);
  assert.equal(result.newBoardAvailable, true);
  assert.equal(challenge.appleBoardsGenerated, beforeBoards);

  const requested = requestAppleNewBoardGame(state, pet, challenge.id, 'new-board-123456', new Date(BASE.getTime()+1000));
  assert.equal(requested.ok, true);
  assert.equal(requested.boardRefreshed, true);
  assert.equal(challenge.appleBoardsGenerated, beforeBoards + 1);

  challenge.appleBoard = blankBoard(); challenge.appleBoard[0][0]=4; challenge.appleBoard[0][1]=6;
  challenge.appleAvailableMoves = 1; challenge.appleNewBoardAvailable = true;
  const autoBefore = challenge.appleBoardsGenerated;
  const removed = selectAppleGame(state, pet, challenge.id, { startRow:0,startCol:0,endRow:0,endCol:1 }, 'remove-last-123', new Date(BASE.getTime()+2000));
  assert.equal(removed.removed, true);
  assert.equal(removed.boardRefreshed, true);
  assert.equal(challenge.appleBoardsGenerated, autoBefore + 1);
});

test('사과 새 판 요청은 requestId 중복으로 판을 두 번 바꾸지 않는다', () => {
  const challenge = { completed:false, expiresAt:new Date(BASE.getTime()+120000).toISOString(), appleBoard:blankBoard(), applePendingPoints:12, appleScore:400, appleRemovedCount:20, appleSuccesses:5, appleBoardsGenerated:2, appleProcessedRequestIds:[], appleRefreshRequestIds:[] };
  challenge.appleBoard[0][0]=4; challenge.appleBoard[0][1]=6; normalizeAppleChallenge(challenge);
  const r1=requestAppleNewBoard(challenge,'same-board-request',BASE,()=>0.4); const after=challenge.appleBoardsGenerated;
  const r2=requestAppleNewBoard(challenge,'same-board-request',new Date(BASE.getTime()+1000),()=>0.5);
  assert.equal(r1.ok,true); assert.equal(r2.duplicate,true); assert.equal(challenge.appleBoardsGenerated,after); assert.equal(challenge.appleScore,400); assert.equal(challenge.applePendingPoints,12);
});

test('💪 운동방 뱃지는 user 권한 값으로 공개/내 프로필에 전달되고 게임 능력치와 분리된다', () => {
  const state=initialState(); const user={id:'fit',nickname:'운동',generation:1,currentPetId:null,sessionVersion:1,workoutBadge:true,notifications:[],createdAt:BASE.toISOString(),lastSeenAt:BASE.toISOString()}; const pet=createPet(user,1,BASE);user.currentPetId=pet.id;state.users.fit=user;state.pets[pet.id]=pet;
  assert.equal(publicProfile(state,pet.id,pet.id,true).workoutBadge,true);
  assert.equal(privateDashboard(state,'fit').pet.workoutBadge,true);
  assert.equal('workoutBadge' in pet,false,'뱃지는 레고 능력치가 아닌 가입 계정 플래그여야 한다');
});

test('과거 꾸미기 상점은 제거되고 운동방 관리자 API와 사과 새 판 API가 연결된다', async () => {
  const engine=await readFile(new URL('../src/game/engine.js',import.meta.url),'utf8');
  const worker=await readFile(new URL('../src/worker.js',import.meta.url),'utf8');
  const app=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
  const css=await readFile(new URL('../public/styles.css',import.meta.url),'utf8');
  assert.doesNotMatch(engine,/COSMETIC_SHOP|function buyCosmetic|function cosmeticView/);
  assert.doesNotMatch(worker,/profile\/cosmetics\/buy|COSMETIC_SHOP|buyCosmetic/);
  assert.doesNotMatch(app,/꾸미기 상점|openStyleShop|buy-cosmetic/);
  assert.doesNotMatch(css,/cos-|style-shop|꾸미기 상점/);
  assert.match(worker,/\/api\/admin\/workout-badge/);
  assert.match(worker,/\/api\/minigames\/apple\/new-board/);
  assert.match(app,/workout-room-badge/);
  assert.match(app,/가능한 합10 영역이 \$\{moves\}개 남았습니다/);
});


test('운영자는 💪 운동방 뱃지를 실제 API로 부여하고 해제할 수 있다', async () => {
  const shared = new Map();
  const first = await createRoom(shared);
  const adminToken = await register(first.room, '운동관리자');
  const targetToken = await register(first.room, '운동대상');
  const adminId = (await roomBootstrap(first.room, adminToken)).admin.userId;
  const targetId = (await roomBootstrap(first.room, targetToken)).admin.userId;
  const second = await createRoom(shared, { ADMIN_USER_IDS: adminId });

  const granted = await roomApi(second.room, adminToken, '/api/admin/workout-badge', { targetUserId: targetId, enabled: true });
  assert.equal(granted.response.status, 200, JSON.stringify(granted.data));
  assert.equal((await roomBootstrap(second.room, targetToken)).dashboard.pet.workoutBadge, true);

  const revoked = await roomApi(second.room, adminToken, '/api/admin/workout-badge', { targetUserId: targetId, enabled: false });
  assert.equal(revoked.response.status, 200, JSON.stringify(revoked.data));
  assert.equal((await roomBootstrap(second.room, targetToken)).dashboard.pet.workoutBadge, false);
});

test('사과 새 판 API는 5개 이하일 때만 서버에서 허용하고 점수·포인트를 보존한다', async () => {
  const { room } = await createRoom();
  const token = await register(room, '사과새판');
  const started = await roomApi(room, token, '/api/minigames/start', { gameId:'apple' });
  assert.equal(started.response.status, 200, JSON.stringify(started.data));
  const challengeId = started.data.bootstrap.activeMiniChallenge.id;
  let state = await room.store.load();
  const challenge = state.miniGameChallenges[challengeId];
  challenge.appleBoard = blankBoard();
  challenge.appleBoard[0][0] = 4; challenge.appleBoard[0][1] = 6;
  challenge.applePendingPoints = 17;
  challenge.appleScore = 620;
  challenge.appleRemovedCount = 31;
  challenge.appleAvailableMoves = 1;
  challenge.appleNewBoardAvailable = true;
  const beforeBoards = challenge.appleBoardsGenerated;
  await room.store.save(state);

  const changed = await roomApi(room, token, '/api/minigames/apple/new-board', { challengeId, requestId:'api-new-board-once' });
  assert.equal(changed.response.status, 200, JSON.stringify(changed.data));
  state = await room.store.load();
  assert.equal(state.miniGameChallenges[challengeId].appleBoardsGenerated, beforeBoards + 1);
  assert.equal(state.miniGameChallenges[challengeId].appleScore, 620);
  assert.equal(state.miniGameChallenges[challengeId].applePendingPoints, 17);
  assert.equal(state.miniGameChallenges[challengeId].appleRemovedCount, 31);
});
