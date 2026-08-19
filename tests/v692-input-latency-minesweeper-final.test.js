import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const appSource = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const workerSource = fs.readFileSync(new URL('../src/worker.js', import.meta.url), 'utf8');

test('지뢰찾기 모바일 롱프레스는 400ms이며 지원 기기에서 짧은 진동을 준다', () => {
  assert.match(appSource, /MINESWEEPER_LONG_PRESS_MS = 400/u);
  assert.match(appSource, /typeof navigator\.vibrate === 'function'[\s\S]*?navigator\.vibrate\(25\)/u);
});

test('지뢰찾기 입력은 in-flight 동안 폐기하지 않고 큐로 순차 처리한다', () => {
  assert.match(appSource, /minesweeperActionQueue: \[\]/u);
  assert.match(appSource, /function submitMinesweeperAction\([\s\S]*?app\.minesweeperActionQueue\.push/u);
  assert.match(appSource, /async function drainMinesweeperActionQueue\([\s\S]*?app\.minesweeperActionQueue\.shift/u);
  assert.doesNotMatch(appSource, /challenge\.gameId !== 'minesweeper' \|\| app\.busy \|\| app\.minesweeperActionInFlight/u);
  assert.match(appSource, /function clearMinesweeperActionQueue\(\)/u);
});

test('대기방을 열어 보던 비참가자는 게임 시작 순간 자동으로 로비로 돌아간다', () => {
  assert.match(appSource, /waitingViewerAutoExit[\s\S]*?previous\?\.status === 'waiting'[\s\S]*?room\.status === 'playing'[\s\S]*?room\.viewerRole === 'none'/u);
  assert.match(appSource, /if \(waitingViewerAutoExit\) \{[\s\S]*?app\.blockBattleRoomId = null;[\s\S]*?app\.blockBattleLobbyForced = true;/u);
});

test('테트리스 새 블록 authoritative 상태 전송은 일반 저장 I/O보다 먼저 수행된다', () => {
  const httpStart = workerSource.indexOf('// lock 직후 새 active 블록');
  assert.ok(httpStart >= 0);
  const httpChunk = workerSource.slice(httpStart, httpStart + 1000);
  assert.ok(httpChunk.indexOf('this.sendBlockBattleState') < httpChunk.indexOf('await this.store.saveBlockBattle'));

  const wsStart = workerSource.indexOf('// WebSocket 경로도 저장 I/O보다 먼저');
  assert.ok(wsStart >= 0);
  const wsChunk = workerSource.slice(wsStart, wsStart + 700);
  assert.ok(wsChunk.indexOf('this.sendBlockBattleState') < wsChunk.indexOf('await this.store.saveBlockBattle'));
});


test('지뢰찾기 갱신은 기존 칸 DOM을 유지해 빠른 PC 클릭과 모바일 pointer를 중간에 끊지 않는다', () => {
  const refreshStart = appSource.indexOf('function refreshMinesweeperMiniOnly');
  const refreshEnd = appSource.indexOf('function clearMinesweeperActionQueue', refreshStart);
  const refreshSource = appSource.slice(refreshStart, refreshEnd);
  assert.match(appSource, /function patchMinesweeperBoard\(/u);
  assert.match(refreshSource, /patchMinesweeperBoard\(board, challenge\)/u);
  assert.doesNotMatch(refreshSource, /board\.innerHTML\s*=\s*minesweeperBoardHtml/u);
  assert.match(appSource, /MINESWEEPER_MOVE_CANCEL_PX = 18/u);
});

test('지뢰찾기는 시작·매 클릭 때 자기 자신에게 중복 WebSocket refresh를 보내지 않는다', () => {
  const startRoute = workerSource.slice(workerSource.indexOf("pathname === '/api/minigames/start'"), workerSource.indexOf("pathname === '/api/minigames/finish'"));
  const actionRoute = workerSource.slice(workerSource.indexOf("pathname === '/api/minigames/minesweeper/action'"), workerSource.indexOf("pathname === '/api/minigames/minesweeper/abandon'"));
  assert.match(startRoute, /gameId \|\| ''\) !== 'minesweeper'/u);
  assert.doesNotMatch(actionRoute, /broadcastRefresh/u);
});
