import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const ROOT = new URL('../', import.meta.url);

test('정상 WebSocket 연결 중에는 refresh/bootstrap 후에도 5초 fallback 폴링을 만들지 않는다', async () => {
  const source = await readFile(new URL('public/app.js', ROOT), 'utf8');
  const start = source.indexOf('function connectRealtime() {');
  const end = source.indexOf('function modalHeader(', start);
  assert.ok(start >= 0 && end > start, '실시간 연결 함수 위치');

  const intervals = [];
  const timeouts = [];
  const sockets = [];
  let bootstrapCalls = 0;
  class FakeWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSED = 3;
    constructor() {
      this.readyState = FakeWebSocket.CONNECTING;
      this.listeners = new Map();
      sockets.push(this);
    }
    addEventListener(name, callback) { this.listeners.set(name, callback); }
    emit(name, payload = {}) {
      this.listeners.get(name)?.(name === 'message' ? { data: JSON.stringify(payload) } : payload);
    }
    close() { this.readyState = FakeWebSocket.CLOSED; this.emit('close', { code: 1000 }); }
  }
  const app = { token: 'token', ws: null, pollTimer: null, refreshTimer: null };
  const context = vm.createContext({
    app,
    WebSocket: FakeWebSocket,
    navigator: { onLine: true },
    document: { hidden: false },
    location: { protocol: 'https:', host: 'game.test' },
    setInterval(fn, milliseconds) { intervals.push({ fn, milliseconds }); return intervals.length; },
    clearInterval() {},
    setTimeout(fn, milliseconds) { timeouts.push({ fn, milliseconds }); return timeouts.length; },
    clearTimeout() {},
    loadBootstrap() { bootstrapCalls++; vm.runInContext('connectRealtime()', context); },
    // Only invoked if a test deliberately fires the websocket's other event types.
    JSON, encodeURIComponent
  });
  vm.runInContext(source.slice(start, end), context);

  vm.runInContext('connectRealtime()', context);
  assert.equal(sockets.length, 1);
  vm.runInContext('connectRealtime()', context); // CONNECTING socket
  assert.equal(intervals.length, 0, '연결 중에도 폴링 중복 금지');
  sockets[0].readyState = FakeWebSocket.OPEN;
  sockets[0].emit('open');
  vm.runInContext('connectRealtime()', context); // OPEN socket
  assert.equal(intervals.length, 0, '연결 성공 후 폴링 중복 금지');

  sockets[0].emit('message', { type: 'refresh', reason: 'presence' });
  const refresh = timeouts.find((entry) => entry.milliseconds === 180);
  assert.ok(refresh, 'refresh 수신 뒤 bootstrap 예약');
  refresh.fn();
  assert.equal(bootstrapCalls, 1);
  assert.equal(intervals.length, 0, '서버 refresh로 다시 bootstrap 후에도 폴링 중복 금지');

  sockets[0].close();
  assert.equal(app.ws, null);
  assert.equal(intervals.length, 1, '실시간 소켓 종료 시에는 폴링 시작');
  assert.equal(intervals[0].milliseconds, 5000);
});

test('서비스워커는 버전이 지정된 정적 파일을 캐시 우선, HTML은 네트워크 우선으로 제공한다', async () => {
  const source = await readFile(new URL('public/sw.js', ROOT), 'utf8');
  const listeners = {};
  let networkRequests = 0;
  let cacheRequests = 0;
  const swSelf = {
    location: { origin: 'https://game.test' },
    addEventListener(name, callback) { listeners[name] = callback; },
    skipWaiting() {}, clients: { claim() {} }
  };
  vm.runInNewContext(source, {
    self: swSelf, URL,
    caches: {
      match() { cacheRequests++; return Promise.resolve({ source: 'cache' }); },
      open() { throw new Error('install was not called'); }
    },
    fetch() { networkRequests++; return Promise.resolve({ source: 'network' }); }
  });

  const request = async (path, destination) => {
    let response;
    listeners.fetch({
      request: { method: 'GET', url: `https://game.test${path}`, destination },
      respondWith(promise) { response = promise; }
    });
    return response;
  };
  assert.equal((await request('/app.js?v=6101420', 'script')).source, 'cache');
  assert.equal(networkRequests, 0);
  assert.equal(cacheRequests, 1);
  assert.equal((await request('/', 'document')).source, 'network');
  assert.equal(networkRequests, 1);
});
