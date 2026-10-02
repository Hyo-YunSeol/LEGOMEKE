import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');

test('stale same-match reply acknowledges pending input without replacing newer room state', () => {
  const start = app.indexOf('function applyBlockBattleRoomState(payload)');
  const end = app.indexOf('function blockBattleBatchIsPending(', start);
  assert.ok(start !== -1 && end > start);
  const body = app.slice(start, end);
  assert.match(body, /if \(sameMatch && incomingVersion < acceptedVersion\) \{\s*\/\/[\s\S]*?const staleAcknowledged = acknowledgeBlockBattleBatch\(room\);/);
  assert.match(body, /if \(staleAcknowledged && !app\.blockBattleSending && app\.blockBattleInputBuffer\.length && !app\.blockBattleFlushTimer\)/);
  assert.match(body, /app\.blockBattleFlushTimer = setTimeout\(flushBlockBattleInputs, 0\);[\s\S]*?return false;/);
  assert.ok(body.indexOf('if (sameMatch && incomingVersion < acceptedVersion)') < body.indexOf('if (index >= 0) rooms[index] = room;'));
});

// Exercise the exact browser functions with a delayed WS/HTTP response rather than
// relying on a source-text assertion alone.
test('out-of-order ACK clears the in-flight batch, preserves the newer view and resumes queued inputs', async () => {
  const { runInNewContext } = await import('node:vm');
  const ackStart = app.indexOf('function acknowledgeBlockBattleBatch(room)');
  const ackEnd = app.indexOf('function replayBlockBattlePendingInputs(', ackStart);
  const applyStart = app.indexOf('function applyBlockBattleRoomState(payload)');
  const applyEnd = app.indexOf('function blockBattleBatchIsPending(', applyStart);
  const previous = { id: 'room1', matchId: 'match1', stateVersion: 12, lastProcessedRequestId:'newer', status:'playing', viewerRole:'player' };
  const older = { id: 'room1', matchId: 'match1', stateVersion: 11, lastProcessedRequestId:'req1', status:'playing', viewerRole:'player' };
  const appState = {
    data: { blockBattle: { rooms: [previous] } },
    blockBattleServerVersions: new Map([['room1', 12]]),
    blockBattlePendingBatches: [{ message: { requestId:'req1', roomId:'room1', actions: [{action:'left'}] }, retryTimer: 42, expectsLock: false }],
    blockBattleInputBuffer: [{action:'right',piece:0,seq:2}],
    blockBattleSending: true, blockBattleFlushTimer: null,
  };
  let queuedFlush = null;
  const result = runInNewContext(`${app.slice(ackStart, ackEnd)}\n${app.slice(applyStart, applyEnd)}\napplyBlockBattleRoomState({room: older})`, {
    app: appState, older,
    preserveBlockBattleActiveContinuity: () => false,
    clearTimeout: () => {},
    setTimeout: (fn) => { queuedFlush = fn; return 99; },
    flushBlockBattleInputs: () => {},
  });
  assert.equal(result, false);
  assert.equal(appState.data.blockBattle.rooms[0], previous);
  assert.equal(appState.blockBattleServerVersions.get('room1'), 12);
  assert.equal(appState.blockBattlePendingBatches.length, 0);
  assert.equal(appState.blockBattleSending, false);
  assert.equal(appState.blockBattleFlushTimer, 99);
  assert.equal(typeof queuedFlush, 'function');
});
