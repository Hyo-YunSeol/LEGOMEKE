import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');

test('사천성 마지막 패가 화면에서 먼저 사라져도 판정 중 표시와 서버 재동기화가 걸린다', () => {
  assert.match(app, /function updateSichuanFinishState\(room = currentSichuanRoom\(\)\)/);
  assert.match(app, /sichuanEffectiveRemovedCount\(self, room\) >= 80/);
  assert.match(app, /data-sichuan-finish-status>마지막 패 처리 중 · 승리 판정 확인 중/);
  assert.match(app, /setTimeout\(\(\) => \{[\s\S]*loadBootstrap\(\{ silent: true, renderMode: 'games-live' \}\);[\s\S]*\}, 1200\)/);
  assert.match(css, /\.sichuan-finish-status\{/);
});

test('사천성 pair 요청은 무한 대기하지 않고 8초 뒤 abort 후 상태를 다시 맞춘다', () => {
  assert.match(app, /const requestController = new AbortController\(\);/);
  assert.match(app, /setTimeout\(\(\) => requestController\.abort\(\), 8000\)/);
  assert.match(app, /signal: requestController\.signal/);
  assert.match(app, /사천성 처리 응답이 늦어 상태를 다시 확인합니다\./);
});
