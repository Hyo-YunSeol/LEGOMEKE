import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { blockBattleView, leaveBlockBattleRoom } from '../src/game/block-battle.js';
import { authRequest, createRoom, register, responseJson } from './helpers.js';

const HTML_URL = new URL('../public/index.html', import.meta.url);
const APP_URL = new URL('../public/app.js', import.meta.url);

async function waitFor(predicate, message, timeoutMs = 2500) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail(message);
}

function roomFetch(window, room) {
  return async (input, options = {}) => {
    const url = new URL(String(input), window.location.href);
    const method = String(options.method || 'GET').toUpperCase();
    return room.fetch(new Request(`https://game.test${url.pathname}${url.search}`, {
      method,
      headers: new Headers(options.headers || {}),
      body: method === 'GET' || method === 'HEAD' ? undefined : options.body
    }));
  };
}

async function createBrowser({ token = '', fetchImpl }) {
  const [html, appSource] = await Promise.all([readFile(HTML_URL, 'utf8'), readFile(APP_URL, 'utf8')]);
  const dom = new JSDOM(html, {
    url: 'https://game.test/',
    runScripts: 'outside-only',
    pretendToBeVisual: true
  });
  const { window } = dom;
  const errors = [];
  window.addEventListener('error', (event) => errors.push(event.error || new Error(event.message)));
  window.addEventListener('unhandledrejection', (event) => errors.push(event.reason || new Error('unhandled rejection')));
  window.structuredClone = globalThis.structuredClone;
  window.scrollTo = () => {};
  window.confirm = () => true;
  window.prompt = () => null;
  window.fetch = fetchImpl(window);

  class TestPointerEvent extends window.MouseEvent {
    constructor(type, options = {}) {
      super(type, options);
      Object.defineProperties(this, {
        pointerId: { value: options.pointerId ?? 1 },
        pointerType: { value: options.pointerType ?? 'touch' },
        isPrimary: { value: options.isPrimary ?? true }
      });
    }
  }
  window.PointerEvent = TestPointerEvent;

  class MockWebSocket extends window.EventTarget {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSED = 3;
    constructor() {
      super();
      this.readyState = MockWebSocket.OPEN;
      window.__testSockets ??= [];
      window.__testSockets.push(this);
      window.queueMicrotask(() => this.dispatchEvent(new window.Event('open')));
    }
    send(value) {
      window.__sentSocketMessages ??= [];
      window.__sentSocketMessages.push(JSON.parse(String(value)));
    }
    emit(payload) {
      this.dispatchEvent(new window.MessageEvent('message', { data: JSON.stringify(payload) }));
    }
    close() { this.readyState = MockWebSocket.CLOSED; }
  }
  window.WebSocket = MockWebSocket;
  if (token) window.localStorage.setItem('lego_token', token);
  window.eval(appSource);
  return { dom, window, errors };
}

test('실제 브라우저 DOM에서 하단 5개 메뉴를 연속 터치해도 현재 화면 하나만 연결되고 런타임 오류가 없다', async (t) => {
  const { room } = await createRoom();
  const token = await register(room, '브라우저메뉴');
  const runtime = await createBrowser({ token, fetchImpl: (window) => roomFetch(window, room) });
  t.after(() => runtime.dom.window.close());

  await waitFor(() => !runtime.window.document.querySelector('#app-shell')?.classList.contains('hidden'), '앱 화면이 열리지 않았습니다.');
  for (const tab of ['games', 'territory', 'social', 'records', 'home', 'games', 'home']) {
    const button = runtime.window.document.querySelector(`.nav-item[data-tab="${tab}"]`);
    button.dispatchEvent(new runtime.window.PointerEvent('pointerdown', {
      bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 7, isPrimary: true
    }));
    await waitFor(() => runtime.window.document.querySelector('#view .tab-pane')?.dataset.pane === tab, `${tab} 탭으로 전환되지 않았습니다.`);
    assert.equal(runtime.window.document.querySelectorAll('#view > .tab-pane').length, 1);
    assert.equal(runtime.window.document.querySelectorAll('.nav-item.active').length, 1);
    assert.equal(runtime.window.document.querySelector('.nav-item.active')?.dataset.tab, tab);
  }
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.deepEqual(errorsToMessages(runtime.errors), []);
});

test('만료된 토큰의 401 응답은 반복 요청 없이 세션을 정리하고 로그인 화면으로 복구한다', async (t) => {
  let calls = 0;
  const runtime = await createBrowser({
    token: 'expired-token',
    fetchImpl: () => async () => {
      calls += 1;
      return new Response(JSON.stringify({ ok: false, message: '로그인이 필요합니다.' }), {
        status: 401,
        headers: { 'content-type': 'application/json' }
      });
    }
  });
  t.after(() => runtime.dom.window.close());

  await waitFor(() => runtime.window.localStorage.getItem('lego_token') === null, '만료 토큰이 제거되지 않았습니다.');
  assert.equal(runtime.window.document.querySelector('#auth-screen')?.classList.contains('hidden'), false);
  assert.equal(runtime.window.document.querySelector('#app-shell')?.classList.contains('hidden'), true);
  assert.equal(calls, 1);
  assert.deepEqual(errorsToMessages(runtime.errors), []);
});

test('실제 포인터 드래그로 1+9를 선택하면 서버에서 한 번만 5P 예정 보상으로 반영된다', async (t) => {
  const { room } = await createRoom();
  const token = await register(room, '브라우저사과');
  const started = await responseJson(await room.fetch(authRequest('/api/minigames/start', token, {
    method: 'POST', body: JSON.stringify({ gameId: 'apple' })
  })));
  assert.equal(started.data.ok, true);
  const challengeId = started.data.challenge.id;
  const state = await room.store.load();
  const challenge = state.miniGameChallenges[challengeId];
  challenge.expiresAt = new Date(Date.now() + 120_000).toISOString();
  challenge.appleBoard = Array.from({ length: 10 }, () => Array(10).fill(null));
  challenge.appleBoard[0][0] = 1;
  challenge.appleBoard[0][1] = 9;
  challenge.appleBoard[9][8] = 2;
  challenge.appleBoard[9][9] = 8;
  challenge.appleAvailableMoves = 2;
  challenge.appleNewBoardAvailable = true;
  await room.store.save(state);

  const runtime = await createBrowser({ token, fetchImpl: (window) => roomFetch(window, room) });
  t.after(() => runtime.dom.window.close());
  await waitFor(() => !runtime.window.document.querySelector('#app-shell')?.classList.contains('hidden'), '앱 화면이 열리지 않았습니다.');

  const gamesButton = runtime.window.document.querySelector('.nav-item[data-tab="games"]');
  gamesButton.dispatchEvent(new runtime.window.PointerEvent('pointerdown', {
    bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 8, isPrimary: true
  }));
  await waitFor(() => runtime.window.document.querySelector('[data-action="resume-mini"]'), '사과게임 이어하기 버튼이 보이지 않습니다.');
  runtime.window.document.querySelector('[data-action="resume-mini"]').click();
  await waitFor(() => runtime.window.document.querySelector('#apple-board')?.children.length === 100, '사과 10×10 판이 열리지 않았습니다.');
  await new Promise((resolve) => runtime.window.requestAnimationFrame(() => resolve()));

  const board = runtime.window.document.querySelector('#apple-board');
  assert.equal(runtime.window.document.body.classList.contains('apple-game-open'), true);
  assert.equal(runtime.window.document.querySelector('#modal-root').classList.contains('apple-modal-root'), true);
  assert.equal(board.style.width, board.style.height);
  Object.defineProperties(board, {
    clientWidth: { configurable: true, value: 300 },
    clientHeight: { configurable: true, value: 300 }
  });
  board.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 300, bottom: 300, width: 300, height: 300, toJSON() {} });
  board.dispatchEvent(new runtime.window.PointerEvent('pointerdown', {
    bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 11, clientX: 5, clientY: 5, isPrimary: true
  }));
  assert.equal(runtime.window.document.body.classList.contains('apple-dragging'), true);
  const moveEvent = new runtime.window.PointerEvent('pointermove', {
    bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 11, clientX: 35, clientY: 5, isPrimary: true
  });
  board.dispatchEvent(moveEvent);
  assert.equal(moveEvent.defaultPrevented, true, '드래그 중 페이지 스크롤을 막아야 한다');
  // 같은 프레임 안에서 손을 떼는 빠른 드래그도 최종 칸까지 계산되어야 한다.
  board.dispatchEvent(new runtime.window.PointerEvent('pointerup', {
    bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 11, clientX: 35, clientY: 5, isPrimary: true
  }));
  assert.equal(runtime.window.document.body.classList.contains('apple-dragging'), false);

  await waitFor(async () => {
    const latest = await room.store.load();
    return latest.miniGameChallenges[challengeId]?.applePendingPoints === 5;
  }, '사과 선택 보상이 서버에 반영되지 않았습니다.');
  const latest = await room.store.load();
  assert.equal(latest.miniGameChallenges[challengeId].applePendingPoints, 5);
  assert.equal(latest.miniGameChallenges[challengeId].appleSuccesses, 1);
  assert.deepEqual(errorsToMessages(runtime.errors), []);
});

test('게임 화면은 라이어게임 대신 테트리스대전 3방 로비를 표시한다', async (t) => {
  const { room } = await createRoom();
  const token = await register(room, '블럭대전');
  const state = await room.store.load();
  const user = Object.values(state.users).find((item) => item.nickname === '블럭대전');
  state.pets[user.currentPetId].stats.points = 1_000;
  await room.store.save(state);
  const runtime = await createBrowser({ token, fetchImpl: (window) => roomFetch(window, room) });
  t.after(() => runtime.dom.window.close());
  const { window } = runtime;
  await waitFor(() => !window.document.querySelector('#app-shell')?.classList.contains('hidden'), '앱 화면이 열리지 않았습니다.');

  window.document.querySelector('.nav-item[data-tab="games"]').dispatchEvent(new window.PointerEvent('pointerdown', {
    bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 21, isPrimary: true
  }));
  await waitFor(() => window.document.querySelector('[data-action="block-battle-create"]'), '테트리스대전 방 만들기 버튼이 보이지 않습니다.');
  assert.match(window.document.querySelector('.block-battle-wrap').textContent, /테트리스대전/);
  assert.equal(window.document.querySelector('[data-action="liar-join"]'), null);
  assert.equal(window.document.querySelectorAll('.block-battle-lobby-card').length, 3);
  window.document.querySelector('[data-action="block-battle-create"]').click();
  await waitFor(() => window.document.querySelector('#block-battle-create-form'), '테트리스대전 방 만들기 창이 열리지 않았습니다.');
  window.document.querySelector('#block-battle-create-form').requestSubmit();
  await waitFor(() => window.document.querySelector('[data-action="block-battle-back"]'), '생성한 테트리스대전 방 화면이 열리지 않았습니다.');
  assert.equal(Object.keys((await room.store.load()).blockBattle.rooms).length, 1);
  assert.deepEqual(errorsToMessages(runtime.errors), []);
});

test('운영자 회원 목록 새로고침은 열린 모달과 스크롤을 유지하고 회원 영역만 갱신한다', async (t) => {
  const created = await createRoom();
  const token = await register(created.room, '운영자브라우저');
  const state = await created.room.store.load();
  const adminUser = Object.values(state.users).find((user) => user.nickname === '운영자브라우저');
  created.room.env.ADMIN_USER_IDS = adminUser.id;
  const runtime = await createBrowser({ token, fetchImpl: (window) => roomFetch(window, created.room) });
  t.after(() => runtime.dom.window.close());
  const { window } = runtime;
  await waitFor(() => !window.document.querySelector('#app-shell')?.classList.contains('hidden'), '앱 화면이 열리지 않았습니다.');
  window.document.querySelector('.nav-item[data-tab="records"]').dispatchEvent(new window.PointerEvent('pointerdown', {
    bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 31, isPrimary: true
  }));
  await waitFor(() => window.document.querySelector('[data-action="open-admin"]'), '운영자 버튼이 보이지 않습니다.');
  window.document.querySelector('[data-action="open-admin"]').click();
  await waitFor(() => window.document.querySelector('#admin-member-list'), '운영자 회원 목록이 열리지 않았습니다.');

  const modal = window.document.querySelector('#modal-content');
  const list = window.document.querySelector('#admin-member-list');
  modal.scrollTop = 137;
  window.document.querySelector('[data-action="admin-refresh"]').click();
  await waitFor(() => window.document.querySelector('[data-action="admin-refresh"]')?.textContent.includes('완료'), '회원 목록 새로고침이 완료되지 않았습니다.');
  assert.equal(window.document.querySelector('#modal-content'), modal);
  assert.equal(window.document.querySelector('#admin-member-list'), list);
  assert.equal(modal.scrollTop, 137);
  assert.match(list.textContent, /운영자브라우저레고/);
  assert.deepEqual(errorsToMessages(runtime.errors), []);
});

test('모바일 숫자맞히기는 오답 제출 후에도 입력창·초점·모달 스크롤을 그대로 유지한다', async (t) => {
  const { room } = await createRoom();
  const token = await register(room, '숫자모바일');
  const started = await responseJson(await room.fetch(authRequest('/api/minigames/start', token, {
    method: 'POST', body: JSON.stringify({ gameId: 'number' })
  })));
  const state = await room.store.load();
  state.miniGameChallenges[started.data.challenge.id].target = 100;
  await room.store.save(state);

  const runtime = await createBrowser({ token, fetchImpl: (window) => roomFetch(window, room) });
  t.after(() => runtime.dom.window.close());
  const { window } = runtime;
  Object.defineProperty(window.navigator, 'maxTouchPoints', { configurable: true, value: 1 });
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  await waitFor(() => !window.document.querySelector('#app-shell')?.classList.contains('hidden'), '앱 화면이 열리지 않았습니다.');

  window.document.querySelector('.nav-item[data-tab="games"]').dispatchEvent(new window.PointerEvent('pointerdown', {
    bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 41, isPrimary: true
  }));
  await waitFor(() => window.document.querySelector('[data-action="resume-mini"]'), '숫자맞히기 이어하기가 보이지 않습니다.');
  window.document.querySelector('[data-action="resume-mini"]').click();
  await waitFor(() => window.document.querySelector('#number-game-form input[name="guess"]'), '숫자 입력창이 열리지 않았습니다.');

  const modal = window.document.querySelector('#modal-content');
  const input = window.document.querySelector('#number-game-form input[name="guess"]');
  modal.scrollTop = 83;
  input.focus();
  input.value = '1';
  window.document.querySelector('#number-game-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));

  await waitFor(() => window.document.querySelector('#number-attempts')?.textContent.includes('1/5'), '오답 후 시도 횟수가 갱신되지 않았습니다.');
  await new Promise((resolve) => setTimeout(resolve, 230));
  const currentInput = window.document.querySelector('#number-game-form input[name="guess"]');
  assert.equal(currentInput, input, '오답 제출 때 모바일 입력 DOM을 교체하면 안 된다');
  assert.equal(window.document.activeElement, input);
  assert.equal(modal.scrollTop, 83);
  assert.equal(input.value, '');
  assert.match(window.document.querySelector('#number-guess-history').textContent, /1/);
  assert.match(window.document.querySelector('#number-game-hint').textContent, /UP|큽니다/);
  assert.deepEqual(errorsToMessages(runtime.errors), []);
});

test('블록게임은 문양·공용 empty 클래스 없이 색상만 표시하고 그만하기를 정산한다', async (t) => {
  const { room } = await createRoom();
  const token = await register(room, '블록화면');
  const started = await responseJson(await room.fetch(authRequest('/api/minigames/start', token, {
    method: 'POST', body: JSON.stringify({ gameId: 'block' })
  })));
  const state = await room.store.load();
  const challenge = state.miniGameChallenges[started.data.challenge.id];
  challenge.blockBoard = Array.from({ length: 12 }, () => Array(10).fill(null));
  challenge.blockBoard[11][0] = 0;
  challenge.blockBoard[11][1] = 0;
  challenge.blockBoard[11][5] = 1;
  challenge.blockBoard[11][6] = 1;
  challenge.blockPendingPoints = 5;
  challenge.blockRemovedCount = 2;
  await room.store.save(state);

  const runtime = await createBrowser({ token, fetchImpl: (window) => roomFetch(window, room) });
  t.after(() => runtime.dom.window.close());
  const { window } = runtime;
  await waitFor(() => !window.document.querySelector('#app-shell')?.classList.contains('hidden'), '앱 화면이 열리지 않았습니다.');
  window.document.querySelector('.nav-item[data-tab="games"]').dispatchEvent(new window.PointerEvent('pointerdown', {
    bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 42, isPrimary: true
  }));
  await waitFor(() => window.document.querySelector('[data-action="resume-mini"]'), '블록게임 이어하기가 보이지 않습니다.');
  window.document.querySelector('[data-action="resume-mini"]').click();
  await waitFor(() => window.document.querySelector('#block-board')?.children.length === 120, '블록판이 열리지 않았습니다.');

  const board = window.document.querySelector('#block-board');
  assert.equal(board.querySelectorAll('.block-empty-cell').length, 116);
  assert.equal(board.querySelectorAll('.block-cell.empty').length, 0);
  assert.equal([...board.querySelectorAll('button.block-cell')].every((cell) => cell.textContent === ''), true, '색상 블록 안에 동그라미·별·네모 문양이 없어야 한다');
  const modal = window.document.querySelector('#modal-content');
  const unaffectedBlock = board.children[115];
  board.querySelector('[data-row="11"][data-col="0"]').click();
  assert.equal([...board.querySelectorAll('button.block-cell')].some((cell) => cell.disabled), false, '선택 요청 중 판 전체를 반투명 처리하면 안 된다');
  await waitFor(() => window.document.querySelector('#block-pending')?.textContent.includes('10P'), '블록 선택 후 HUD가 갱신되지 않았습니다.');
  assert.equal(window.document.querySelector('#modal-content'), modal, '블록 클릭 때 모달 전체 DOM을 교체하면 안 된다');
  assert.equal(window.document.querySelector('#block-board'), board, '블록 클릭 때 게임판 DOM을 교체하면 안 된다');
  assert.equal(board.children[115], unaffectedBlock, '변하지 않은 블록까지 다시 생성하면 안 된다');
  assert.equal(window.document.querySelectorAll('.toast.game-start').length, 0, '블록 클릭마다 화면을 가리는 성공 토스트를 띄우면 안 된다');
  window.__testSockets[0].emit({ type: 'refresh', reason: 'block', at: Date.now() });
  await new Promise((resolve) => setTimeout(resolve, 240));
  assert.equal(window.document.querySelector('#modal-content'), modal, '서버의 블록 갱신 알림도 모달 전체를 교체하면 안 된다');
  assert.equal(window.document.querySelector('#block-board'), board, '서버 갱신 뒤에도 같은 블록판 DOM을 유지해야 한다');
  const stop = window.document.querySelector('.block-controls [data-action="stop-mini"]');
  assert.ok(stop);
  assert.match(stop.textContent, /10P/);
  stop.click();
  await waitFor(() => window.document.querySelector('.mini-result-card'), '그만하기 결과가 열리지 않았습니다.');
  const latest = await room.store.load();
  const pet = Object.values(latest.pets)[0];
  assert.equal(latest.miniGameChallenges[challenge.id].completed, true);
  assert.equal(pet.stats.points, 10);
  assert.equal(pet.daily.miniGamesPlayed, 1);
  assert.match(window.document.querySelector('.mini-result-card').textContent, /게임을 그만했습니다/);
  assert.deepEqual(errorsToMessages(runtime.errors), []);
});

test('테트리스대전은 늦은 서버 상태가 와도 확인되지 않은 좌우 입력을 되돌리지 않는다', async (t) => {
  const { room } = await createRoom();
  const hostToken = await register(room, '테트리스방장');
  const guestToken = await register(room, '테트리스손님');
  let state = await room.store.load();
  for (const pet of Object.values(state.pets)) pet.stats.points = 1_000;
  await room.store.save(state);
  const created = await responseJson(await room.fetch(authRequest('/api/block-battle/rooms', hostToken, {
    method: 'POST', body: JSON.stringify({ stakePoints: 100 })
  })));
  await room.fetch(authRequest(`/api/block-battle/rooms/${created.data.roomId}/join`, guestToken, { method: 'POST', body: '{}' }));
  state = await room.store.load();
  const host = Object.values(state.users).find((user) => user.nickname === '테트리스방장');
  const oldRoom = structuredClone(blockBattleView(state, host.currentPetId).rooms.find((item) => item.id === created.data.roomId));

  const runtime = await createBrowser({ token: hostToken, fetchImpl: (window) => roomFetch(window, room) });
  t.after(() => runtime.dom.window.close());
  const { window } = runtime;
  await waitFor(() => !window.document.querySelector('#app-shell')?.classList.contains('hidden'), '앱 화면이 열리지 않았습니다.');
  window.document.querySelector('.nav-item[data-tab="games"]').dispatchEvent(new window.PointerEvent('pointerdown', {
    bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 51, isPrimary: true
  }));
  await waitFor(() => window.document.querySelector('[data-action="block-battle-control"][data-value="left"]'), '테트리스 조작 화면이 열리지 않았습니다.');

  const activeSignature = () => [...window.document.querySelectorAll('.block-battle-player.mine .block-battle-cell[class*="piece-"]')]
    .map((cell) => `${cell.dataset.row}:${cell.dataset.col}:${cell.className}`).join('|');
  const before = activeSignature();
  window.document.querySelector('[data-action="block-battle-control"][data-value="left"]').click();
  const optimistic = activeSignature();
  assert.notEqual(optimistic, before, '왼쪽 입력은 서버 응답 전에 즉시 화면에 반영되어야 한다');
  await waitFor(() => window.__sentSocketMessages?.some((item) => item.type === 'block-battle-input'), '테트리스 입력이 전송되지 않았습니다.');

  window.__testSockets[0].emit({ type: 'block-battle-state', room: oldRoom, serverTime: Date.now() });
  assert.equal(activeSignature(), optimistic, '과거 서버 위치가 미확정 로컬 입력을 덮어쓰면 안 된다');

  const message = window.__sentSocketMessages.find((item) => item.type === 'block-battle-input');
  const processed = await responseJson(await room.fetch(authRequest(`/api/block-battle/rooms/${created.data.roomId}/input`, hostToken, {
    method: 'POST', body: JSON.stringify(message)
  })));
  const confirmedRoom = processed.data.blockBattle.rooms.find((item) => item.id === created.data.roomId);
  window.__testSockets[0].emit({ type: 'block-battle-state', room: confirmedRoom, serverTime: Date.now() });
  const confirmed = activeSignature();
  assert.equal(confirmed, optimistic, '서버 확정 뒤에도 같은 위치를 유지해야 한다');

  window.__testSockets[0].emit({ type: 'block-battle-state', room: oldRoom, serverTime: Date.now() - 1_000 });
  assert.equal(activeSignature(), confirmed, '확정 뒤 늦게 도착한 낮은 상태 버전은 무시해야 한다');
  assert.deepEqual(errorsToMessages(runtime.errors), []);
});

test('테트리스 버튼은 260ms 짧은 터치·길게 누른 뒤 click·키보드 repeat에서도 입력이 겹치지 않는다', async (t) => {
  const { room } = await createRoom();
  const hostToken = await register(room, '입력방장');
  const guestToken = await register(room, '입력손님');
  const state = await room.store.load();
  for (const pet of Object.values(state.pets)) pet.stats.points = 1_000;
  await room.store.save(state);
  const created = await responseJson(await room.fetch(authRequest('/api/block-battle/rooms', hostToken, {
    method: 'POST', body: JSON.stringify({ stakePoints: 100 })
  })));
  await room.fetch(authRequest(`/api/block-battle/rooms/${created.data.roomId}/join`, guestToken, { method: 'POST', body: '{}' }));

  const runtime = await createBrowser({ token: hostToken, fetchImpl: (window) => roomFetch(window, room) });
  t.after(() => runtime.dom.window.close());
  const { window } = runtime;
  await waitFor(() => !window.document.querySelector('#app-shell')?.classList.contains('hidden'), '앱 화면이 열리지 않았습니다.');
  window.document.querySelector('.nav-item[data-tab="games"]').dispatchEvent(new window.PointerEvent('pointerdown', {
    bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 54, isPrimary: true
  }));
  await waitFor(() => window.document.querySelector('[data-action="block-battle-control"][data-value="left"]'), '테트리스 조작 화면이 열리지 않았습니다.');

  const activeSignature = () => [...window.document.querySelectorAll('.block-battle-player.mine .block-battle-cell[class*="piece-"]')]
    .map((cell) => `${cell.dataset.row}:${cell.dataset.col}:${cell.className}`).join('|');
  const left = window.document.querySelector('[data-action="block-battle-control"][data-value="left"]');
  const beforeShortTap = activeSignature();
  left.dispatchEvent(new window.PointerEvent('pointerdown', {
    bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 55, isPrimary: true
  }));
  const afterShortDown = activeSignature();
  assert.notEqual(afterShortDown, beforeShortTap, 'pointerdown에서 한 칸은 즉시 움직여야 한다');
  await new Promise((resolve) => setTimeout(resolve, 260));
  left.dispatchEvent(new window.PointerEvent('pointerup', {
    bubbles: true, pointerType: 'touch', pointerId: 55, isPrimary: true
  }));
  left.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
  assert.equal(activeSignature(), afterShortDown, '260ms 터치와 뒤따르는 click은 정확히 한 칸만 움직여야 한다');

  const softDrop = window.document.querySelector('[data-action="block-battle-control"][data-value="softDrop"]');
  softDrop.dispatchEvent(new window.PointerEvent('pointerdown', {
    bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 56, isPrimary: true
  }));
  await new Promise((resolve) => setTimeout(resolve, 370));
  softDrop.dispatchEvent(new window.PointerEvent('pointerup', {
    bubbles: true, pointerType: 'touch', pointerId: 56, isPrimary: true
  }));
  const afterLongHold = activeSignature();
  softDrop.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
  assert.equal(activeSignature(), afterLongHold, '길게 누른 뒤 합성 click이 마지막 입력을 한 번 더 실행하면 안 된다');

  const beforeKeyboard = activeSignature();
  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'ArrowRight', code: 'ArrowRight' }));
  const afterKeyboardDown = activeSignature();
  assert.notEqual(afterKeyboardDown, beforeKeyboard, '키보드 첫 입력은 즉시 움직여야 한다');
  for (let index = 0; index < 4; index += 1) {
    window.document.dispatchEvent(new window.KeyboardEvent('keydown', {
      bubbles: true, cancelable: true, key: 'ArrowRight', code: 'ArrowRight', repeat: true
    }));
  }
  window.document.dispatchEvent(new window.KeyboardEvent('keyup', { bubbles: true, key: 'ArrowRight', code: 'ArrowRight' }));
  assert.equal(activeSignature(), afterKeyboardDown, '브라우저 keydown repeat와 자체 반복 타이머가 중복되면 안 된다');
  assert.deepEqual(errorsToMessages(runtime.errors), []);
});

test('테트리스대전 관전자는 오목과 같은 5종 공감을 보내고 플레이어도 즉시 확인한다', async (t) => {
  const { room } = await createRoom();
  const hostToken = await register(room, '공감방장');
  const guestToken = await register(room, '공감손님');
  const spectatorToken = await register(room, '공감관전자');
  let state = await room.store.load();
  for (const pet of Object.values(state.pets)) pet.stats.points = 1_000;
  await room.store.save(state);
  const created = await responseJson(await room.fetch(authRequest('/api/block-battle/rooms', hostToken, {
    method: 'POST', body: JSON.stringify({ stakePoints: 100 })
  })));
  await room.fetch(authRequest(`/api/block-battle/rooms/${created.data.roomId}/join`, guestToken, { method: 'POST', body: '{}' }));
  await room.fetch(authRequest(`/api/block-battle/rooms/${created.data.roomId}/spectate`, spectatorToken, { method: 'POST', body: '{}' }));

  const runtime = await createBrowser({ token: spectatorToken, fetchImpl: (window) => roomFetch(window, room) });
  t.after(() => runtime.dom.window.close());
  const { window } = runtime;
  await waitFor(() => !window.document.querySelector('#app-shell')?.classList.contains('hidden'), '앱 화면이 열리지 않았습니다.');
  window.document.querySelector('.nav-item[data-tab="games"]').dispatchEvent(new window.PointerEvent('pointerdown', {
    bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 52, isPrimary: true
  }));
  await waitFor(() => window.document.querySelectorAll('[data-action="block-battle-reaction"]').length === 5, '관전자 공감 5종이 보이지 않습니다.');
  const labels = [...window.document.querySelectorAll('[data-action="block-battle-reaction"]')].map((button) => button.textContent.trim());
  assert.deepEqual(labels, ['😂웃겨요', '😢슬퍼요', '😡화나요', '😴졸려요', '🥵짜쳐요']);
  window.document.querySelector('[data-action="block-battle-reaction"][data-reaction="funny"]').click();
  await waitFor(() => /공감관전자레고.*웃겨요/.test(window.document.querySelector('.reaction-live')?.textContent || ''), '보낸 공감이 관전 화면에 즉시 표시되지 않았습니다.');

  const hostBootstrap = await responseJson(await room.fetch(authRequest('/api/bootstrap', hostToken)));
  const hostRoom = hostBootstrap.data.bootstrap.blockBattle.rooms.find((item) => item.id === created.data.roomId);
  assert.equal(hostRoom.reactions.some((item) => item.displayName === '공감관전자레고' && item.label === '웃겨요'), true, '플레이어도 관전자 공감을 즉시 봐야 한다');
  const hostRuntime = await createBrowser({ token: hostToken, fetchImpl: (hostWindow) => roomFetch(hostWindow, room) });
  t.after(() => hostRuntime.dom.window.close());
  await waitFor(() => !hostRuntime.window.document.querySelector('#app-shell')?.classList.contains('hidden'), '플레이어 앱 화면이 열리지 않았습니다.');
  hostRuntime.window.document.querySelector('.nav-item[data-tab="games"]').dispatchEvent(new hostRuntime.window.PointerEvent('pointerdown', {
    bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 53, isPrimary: true
  }));
  await waitFor(() => /공감관전자레고.*웃겨요/.test(hostRuntime.window.document.querySelector('.reaction-live')?.textContent || ''), '플레이어 화면에 관전자 공감이 표시되지 않았습니다.');
  assert.deepEqual(errorsToMessages(runtime.errors), []);
  assert.deepEqual(errorsToMessages(hostRuntime.errors), []);
});

test('후반 180ms 낙하에서도 자동 tick은 누적되지 않고 다음 수동 좌우 입력을 먼저 전송한다', async (t) => {
  const { room } = await createRoom();
  const hostToken = await register(room, '후반방장');
  const guestToken = await register(room, '후반손님');
  let state = await room.store.load();
  for (const pet of Object.values(state.pets)) pet.stats.points = 1_000;
  await room.store.save(state);
  const created = await responseJson(await room.fetch(authRequest('/api/block-battle/rooms', hostToken, {
    method: 'POST', body: JSON.stringify({ stakePoints: 100 })
  })));
  await room.fetch(authRequest(`/api/block-battle/rooms/${created.data.roomId}/join`, guestToken, { method: 'POST', body: '{}' }));
  state = await room.store.load();
  const host = Object.values(state.users).find((user) => user.nickname === '후반방장');
  const battle = state.blockBattle.rooms[created.data.roomId];
  battle.startedAt = new Date(Date.now() - 10 * 60_000).toISOString();
  for (const player of Object.values(battle.players)) player.lastGravityAt = new Date().toISOString();
  await room.store.saveBlockBattle(state);

  const runtime = await createBrowser({ token: hostToken, fetchImpl: (window) => roomFetch(window, room) });
  t.after(() => runtime.dom.window.close());
  const { window } = runtime;
  await waitFor(() => !window.document.querySelector('#app-shell')?.classList.contains('hidden'), '앱 화면이 열리지 않았습니다.');
  window.document.querySelector('.nav-item[data-tab="games"]').dispatchEvent(new window.PointerEvent('pointerdown', {
    bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 61, isPrimary: true
  }));
  await waitFor(() => window.document.querySelector('[data-action="block-battle-control"][data-value="left"]'), '후반 테트리스 조작 화면이 열리지 않았습니다.');
  await waitFor(() => (window.__sentSocketMessages || []).filter((item) => item.type === 'block-battle-input').length === 1, '첫 자동 낙하 입력이 전송되지 않았습니다.');

  window.document.querySelector('[data-action="block-battle-control"][data-value="left"]').click();
  await new Promise((resolve) => setTimeout(resolve, 650));
  let sentInputs = (window.__sentSocketMessages || []).filter((item) => item.type === 'block-battle-input');
  assert.equal(sentInputs.length, 1, '서버 확인 전 자동 낙하 요청이 계속 쌓여 전송되면 안 된다');

  const first = sentInputs[0];
  const processed = await responseJson(await room.fetch(authRequest(`/api/block-battle/rooms/${battle.id}/input`, hostToken, {
    method: 'POST', body: JSON.stringify(first)
  })));
  assert.equal(processed.data.ok, true);
  const confirmed = processed.data.blockBattle.rooms.find((item) => item.id === battle.id);
  window.__testSockets[0].emit({ type: 'block-battle-state', room: confirmed, serverTime: processed.data.blockBattle.serverTime });
  await waitFor(() => (window.__sentSocketMessages || []).filter((item) => item.type === 'block-battle-input').length >= 2, '확인 뒤 수동 입력이 이어서 전송되지 않았습니다.');
  sentInputs = window.__sentSocketMessages.filter((item) => item.type === 'block-battle-input');
  const second = sentInputs[1];
  assert.ok(second.actions.includes('left'), '후반에도 좌우 입력이 자동 낙하보다 먼저 보존되어야 한다');
  assert.ok(second.actions.filter((action) => action === 'tick').length <= 1, '한 배치에 자동 낙하가 여러 개 누적되면 안 된다');
  assert.ok(second.actions.length <= 2, '응답 대기 동안 입력 큐가 시간에 비례해 커지면 안 된다');
  assert.deepEqual(errorsToMessages(runtime.errors), []);
});

test('테트리스 종료 직후 늦은 입력 오류는 팝업 없이 폐기되고 재전송·자동 낙하가 모두 멈춘다', async (t) => {
  const { room } = await createRoom();
  const hostToken = await register(room, '종료방장');
  const guestToken = await register(room, '종료손님');
  let state = await room.store.load();
  for (const pet of Object.values(state.pets)) pet.stats.points = 1_000;
  await room.store.save(state);
  const created = await responseJson(await room.fetch(authRequest('/api/block-battle/rooms', hostToken, {
    method: 'POST', body: JSON.stringify({ stakePoints: 100 })
  })));
  await room.fetch(authRequest(`/api/block-battle/rooms/${created.data.roomId}/join`, guestToken, { method: 'POST', body: '{}' }));
  const runtime = await createBrowser({ token: hostToken, fetchImpl: (window) => roomFetch(window, room) });
  t.after(() => runtime.dom.window.close());
  const { window } = runtime;
  await waitFor(() => !window.document.querySelector('#app-shell')?.classList.contains('hidden'), '앱 화면이 열리지 않았습니다.');
  window.document.querySelector('.nav-item[data-tab="games"]').dispatchEvent(new window.PointerEvent('pointerdown', {
    bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 62, isPrimary: true
  }));
  await waitFor(() => window.document.querySelector('[data-action="block-battle-control"][data-value="left"]'), '테트리스 조작 화면이 열리지 않았습니다.');
  window.document.querySelector('[data-action="block-battle-control"][data-value="left"]').click();
  await waitFor(() => (window.__sentSocketMessages || []).some((item) => item.type === 'block-battle-input'), '종료 직전 입력이 전송되지 않았습니다.');
  const pending = window.__sentSocketMessages.find((item) => item.type === 'block-battle-input');

  state = await room.store.load();
  const hostUser = Object.values(state.users).find((user) => user.nickname === '종료방장');
  const guestUser = Object.values(state.users).find((user) => user.nickname === '종료손님');
  const guest = state.pets[guestUser.currentPetId];
  assert.equal(leaveBlockBattleRoom(state, guest, created.data.roomId, new Date()).ok, true);
  await room.store.save(state);
  const endedRoom = blockBattleView(state, hostUser.currentPetId).rooms.find((item) => item.id === created.data.roomId);
  const sentBeforeEnd = window.__sentSocketMessages.filter((item) => item.type === 'block-battle-input').length;
  window.__testSockets[0].emit({
    type: 'block-battle-error', roomId: created.data.roomId, matchId: pending.matchId,
    requestId: pending.requestId, discarded: true, terminal: true,
    message: '이미 종료된 테트리스대전의 늦은 입력을 폐기했습니다.'
  });
  window.__testSockets[0].emit({ type: 'block-battle-state', room: endedRoom, serverTime: Date.now() });
  await waitFor(() => window.document.querySelector('.block-battle-wrap .result-card'), '종료 결과 화면으로 전환되지 않았습니다.');
  await new Promise((resolve) => setTimeout(resolve, 1_050));
  assert.equal(window.__sentSocketMessages.filter((item) => item.type === 'block-battle-input').length, sentBeforeEnd, '종료 뒤 입력 재전송이나 자동 낙하가 남으면 안 된다');
  assert.equal(window.document.querySelectorAll('.toast.error').length, 0, '정상적인 늦은 입력 폐기를 오류 팝업으로 표시하면 안 된다');
  assert.equal(window.document.querySelector('[data-action="block-battle-control"]'), null);
  assert.deepEqual(errorsToMessages(runtime.errors), []);
});

const BASE_BROWSER_TIME = '2026-08-11T03:00:00.000Z';

function errorsToMessages(errors) {
  return errors.map((error) => String(error?.stack || error?.message || error));
}
