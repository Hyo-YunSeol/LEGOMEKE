import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const APP = new URL('../public/app.js', import.meta.url);
const BROWSER_TEST = new URL('./browser-runtime.test.js', import.meta.url);

test('v6.8.9 실시간 테트리스는 게임 탭 입력 안에서 즉시 조작 화면을 렌더링한다', async () => {
  const source = await readFile(APP, 'utf8');
  assert.match(source, /const realtimeGameOpen = tabName === 'games' && Boolean\(app\.data && \(currentOmokRoom\(\) \|\| currentBlockBattleRoom\(\)\)\)/);
  assert.match(source, /if \(realtimeGameOpen && pane\) \{[\s\S]*?renderTab\(tabName, \{ force: true \}\);/);
});

test('v6.8.9 공유 CI의 일시적 스케줄 지연이 테트리스 화면 실패로 오인되지 않는다', async () => {
  const source = await readFile(BROWSER_TEST, 'utf8');
  const match = source.match(/async function waitFor\(predicate, message, timeoutMs = (\d+)\)/);
  assert.ok(match, '브라우저 테스트 공통 waitFor 제한을 찾을 수 없습니다.');
  assert.ok(Number(match[1]) >= 8_000, '공유 CI를 위한 최소 8초 대기 여유가 필요합니다.');
});
