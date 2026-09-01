import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
const worker = await readFile(new URL('../src/worker.js', import.meta.url), 'utf8');
const sw = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
const head = await readFile(new URL('../public/legodoku/bi-tteop-head.svg', import.meta.url), 'utf8');

test('레고도쿠 UI는 클릭 레고·드래그 X/삭제·오답 자동 X와 0.85초 안내를 구현한다', () => {
  assert.match(app, /data-action="legodoku-cell"/);
  assert.match(app, /Math\.hypot\(dx, dy\) >= 8/);
  assert.match(app, /mode: app\.legodokuMarks\.has\(index\) \? 'erase' : 'mark'/);
  assert.match(app, /if \(result\.correct === false\) app\.legodokuMarks\.add\(queued\.index\)/);
  assert.match(app, /note\.textContent = '여기 아닙니다'/);
  assert.match(app, /}, 850\);/);
  assert.match(css, /\.legodoku-x/);
});

test('레고도쿠는 진행바만 실시간 공개하고 경기 중 관전자에게 위치를 보여주지 않는다', () => {
  assert.match(app, /legodoku-progress-track/);
  assert.match(app, /실수 \$\{mistakes\}\/3/);
  assert.match(app, /경기 중 위치 비공개/);
  assert.match(app, /관전자는 진행도만 볼 수 있으며/);
  assert.match(app, /function patchLegodokuLiveRoom\(room\)/);
  assert.match(app, /if \(!patchLegodokuLiveRoom\(room\)\) renderLegodokuRegion\(\)/);
});

test('빠른 연속 탭은 in-flight 중 폐기하지 않고 레고도쿠 입력 큐로 순차 처리한다', () => {
  assert.match(app, /legodokuCellQueue: \[\]/);
  assert.match(app, /app\.legodokuCellQueue\.push\(/);
  assert.match(app, /async function flushLegodokuCellQueue\(\)/);
  assert.doesNotMatch(app, /if \(app\.legodokuActionInFlight \|\| !room/);
});

test('레고도쿠 서버 API·운영자 종료방 정리·서비스워커 머리 자산이 연결된다', () => {
  assert.match(worker, /\/api\/legodoku\/rooms/);
  assert.match(worker, /\/api\/admin\/legodoku\/clear-ended/);
  assert.match(worker, /endedLegodokuRooms/);
  assert.match(sw, /versioned\('\/legodoku\/bi-tteop-head\.svg'\)/);
  assert.match(head, /viewBox="80 10 80 82"/);
  assert.match(head, /M105 65 Q120 76 135 65/);
});
