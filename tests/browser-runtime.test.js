import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
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
    send() {}
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

test('한글 조합 중 새 라이어 채팅이 와도 입력 DOM·내용·선택·초점과 과거 스크롤을 보존한다', async (t) => {
  const { room } = await createRoom();
  const token = await register(room, '채팅보존');
  const runtime = await createBrowser({ token, fetchImpl: (window) => roomFetch(window, room) });
  t.after(() => runtime.dom.window.close());
  const { window } = runtime;
  await waitFor(() => !window.document.querySelector('#app-shell')?.classList.contains('hidden'), '앱 화면이 열리지 않았습니다.');

  window.document.querySelector('.nav-item[data-tab="games"]').dispatchEvent(new window.PointerEvent('pointerdown', {
    bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 21, isPrimary: true
  }));
  await waitFor(() => window.document.querySelector('[data-action="liar-join"]'), '라이어게임 참가 버튼이 보이지 않습니다.');
  window.document.querySelector('[data-action="liar-join"]').click();
  await waitFor(() => window.document.querySelector('#liar-chat-form input[name="text"]'), '라이어 채팅 입력창이 보이지 않습니다.');
  await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));

  const input = window.document.querySelector('#liar-chat-form input[name="text"]');
  input.focus();
  input.value = '한글 조합 중';
  input.setSelectionRange(2, 5);
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
  input.dispatchEvent(new window.CompositionEvent('compositionstart', { bubbles: true, data: '조합' }));

  const chat = window.document.querySelector('#liar-chat-box');
  Object.defineProperties(chat, {
    scrollHeight: { configurable: true, value: 500 },
    clientHeight: { configurable: true, value: 100 }
  });
  chat.scrollTop = 120;
  const socket = window.__testSockets.at(-1);
  assert.ok(socket);
  socket.emit({
    type: 'liar-chat-event',
    action: 'append',
    chat: { id: 'chat-live-0001', type: 'chat', petId: 'other', displayName: '상대레고', text: '새 채팅', createdAt: BASE_BROWSER_TIME }
  });
  await new Promise((resolve) => window.requestAnimationFrame(() => resolve()));

  const currentInput = window.document.querySelector('#liar-chat-form input[name="text"]');
  assert.equal(currentInput, input, '채팅 수신으로 입력 요소를 교체하면 안 된다');
  assert.equal(currentInput.value, '한글 조합 중');
  assert.equal(currentInput.selectionStart, 2);
  assert.equal(currentInput.selectionEnd, 5);
  assert.equal(window.document.activeElement, currentInput);
  assert.equal(chat.scrollTop, 120);
  assert.match(chat.textContent, /새 채팅/);
  assert.equal(window.document.querySelector('#liar-new-message').classList.contains('hidden'), false);
  currentInput.dispatchEvent(new window.CompositionEvent('compositionend', { bubbles: true, data: '조합' }));
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

const BASE_BROWSER_TIME = '2026-08-11T03:00:00.000Z';

function errorsToMessages(errors) {
  return errors.map((error) => String(error?.stack || error?.message || error));
}
