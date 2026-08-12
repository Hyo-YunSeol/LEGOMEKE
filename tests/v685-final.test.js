import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const appUrl = new URL('../public/app.js', import.meta.url);

test('v6.8.5 테트리스 공격 알림은 게임 시작 직후 lastAttack=null을 정상 상태로 처리한다', async () => {
  const app = await readFile(appUrl, 'utf8');
  assert.match(app, /room\?\.status !== 'playing' \|\| !room\.lastAttack \|\| Number\(room\.lastAttack\.lines\) <= 0/);
  assert.doesNotMatch(app, /room\?\.status !== 'playing' \|\| Number\(room\.lastAttack\?\.lines\) <= 0/);
});

test('v6.8.8 정적 자산 버전은 688으로 동기화된다', async () => {
  const [app, index, sw] = await Promise.all([
    readFile(appUrl, 'utf8'),
    readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/sw.js', import.meta.url), 'utf8')
  ]);
  assert.match(index, /app\.js\?v=688/);
  assert.match(index, /styles\.css\?v=688/);
  assert.match(app, /sw\.js\?v=688/);
  assert.match(sw, /lego-life-v688-final/);
  assert.match(sw, /const VERSION = '688'/);
});
