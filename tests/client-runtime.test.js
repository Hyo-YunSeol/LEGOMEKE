import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

async function loadClient() {
  const [html, source] = await Promise.all([
    readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/app.js', import.meta.url), 'utf8')
  ]);
  const dom = new JSDOM(html, {
    url: 'https://lego.test/',
    runScripts: 'outside-only',
    pretendToBeVisual: true
  });
  const { window } = dom;
  window.scrollTo = () => {};
  window.fetch = async () => ({
    ok: false,
    status: 401,
    text: async () => JSON.stringify({ ok: false, message: '로그인이 만료되었습니다.' })
  });
  Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
  Object.defineProperty(window, 'visualViewport', {
    value: {
      height: 512,
      offsetTop: 16,
      addEventListener() {}
    },
    configurable: true
  });
  window.eval(`${source}\n;globalThis.__legoTestHooks = { app, api, logout, switchMainTab, setLiarKeyboardMode, updateVisualViewportVars };`);
  return { dom, window, hooks: window.__legoTestHooks };
}

test('하단 메뉴 클릭은 ReferenceError 없이 탭을 전환한다', async (t) => {
  const { dom, window, hooks } = await loadClient();
  t.after(() => dom.window.close());

  const gamesButton = window.document.querySelector('.bottom-nav [data-tab="games"]');
  assert.ok(gamesButton);
  assert.doesNotThrow(() => gamesButton.click());
  assert.equal(hooks.app.tab, 'games');
  assert.equal(gamesButton.classList.contains('active'), true);
  assert.equal(window.document.querySelector('.tab-pane[data-pane="games"]')?.classList.contains('hidden'), false);
});

test('라이어 키보드 모드를 켜고 끄면 클래스와 화면 높이 변수가 함께 정리된다', async (t) => {
  const { dom, window, hooks } = await loadClient();
  t.after(() => dom.window.close());

  hooks.setLiarKeyboardMode(true);
  assert.equal(hooks.app.liarKeyboardActive, true);
  assert.equal(window.document.body.classList.contains('liar-keyboard-open'), true);
  assert.equal(window.document.documentElement.style.getPropertyValue('--visual-viewport-height'), '512px');
  assert.equal(window.document.documentElement.style.getPropertyValue('--visual-viewport-top'), '16px');

  hooks.setLiarKeyboardMode(false);
  assert.equal(hooks.app.liarKeyboardActive, false);
  assert.equal(window.document.body.classList.contains('liar-keyboard-open'), false);
  assert.equal(window.document.documentElement.style.getPropertyValue('--visual-viewport-height'), '');
  assert.equal(window.document.documentElement.style.getPropertyValue('--visual-viewport-top'), '');
});

test('401 응답은 추가 ReferenceError 없이 토큰을 지우고 로그인 화면으로 복귀한다', async (t) => {
  const { dom, window, hooks } = await loadClient();
  t.after(() => dom.window.close());
  hooks.app.token = 'expired-token';
  window.localStorage.setItem('lego_token', 'expired-token');

  await assert.rejects(() => hooks.api('/api/bootstrap'), /로그인이 만료되었습니다/);
  assert.equal(hooks.app.token, null);
  assert.equal(window.localStorage.getItem('lego_token'), null);
  assert.equal(window.document.querySelector('#auth-screen').classList.contains('hidden'), false);
  assert.equal(window.document.querySelector('#app-shell').classList.contains('hidden'), true);
});
