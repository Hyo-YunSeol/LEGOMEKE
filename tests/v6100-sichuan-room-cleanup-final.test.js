import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stateWithUsers } from './helpers.js';
import { createOmokRoom, joinOmokRoom, spectateOmokRoom, playOmokMove, leaveOmokRoom, omokView } from '../src/game/omok.js';
import { createBlockBattleRoom, joinBlockBattleRoom, leaveBlockBattleRoom, blockBattleView } from '../src/game/block-battle.js';
import { createSichuanRoom, joinSichuanRoom, leaveSichuanRoom, sichuanView } from '../src/game/sichuan.js';
import { createDavinciRoom, joinDavinciRoom, setDavinciReady, startDavinciRoom, leaveDavinciRoom } from '../src/game/davinci.js';

const BASE = new Date('2026-08-24T00:00:00.000Z');
const at = (ms = 0) => new Date(BASE.getTime() + ms);
const petsOf = (state) => Object.values(state.pets);

const [app, styles, sw, index, pkg] = await Promise.all([
  readFile(new URL('../public/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/styles.css', import.meta.url), 'utf8'),
  readFile(new URL('../public/sw.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../package.json', import.meta.url), 'utf8')
]);

test('사천성은 PC/모바일 공통으로 Grid를 쓰지 않고 80개 슬롯을 절대좌표에 고정한다', () => {
  const board = styles.match(/\.sichuan-board\{([^}]*)\}/)?.[1] || '';
  const cell = styles.match(/\.sichuan-cell\{([^}]*)\}/)?.[1] || '';
  assert.match(board, /position:relative/);
  assert.match(board, /display:block/);
  assert.match(board, /aspect-ratio:10\/8/);
  assert.doesNotMatch(board, /display:grid|grid-template|grid-auto/);
  assert.match(cell, /position:absolute/);
  assert.match(cell, /width:calc\(10% - var\(--sichuan-gap\)\)/);
  assert.match(cell, /height:calc\(12\.5% - var\(--sichuan-gap\)\)/);
  assert.match(app, /--sichuan-left:\$\{\(column - 1\) \* 10\}%;--sichuan-top:\$\{\(row - 1\) \* 12\.5\}%/);
  assert.doesNotMatch(app, /const position = `grid-row:/);
});

test('공통 결과창 확인은 화면만 닫지 않고 게임별 서버 leave를 먼저 호출한다', () => {
  assert.match(app, /async function dismissBattleResult\(game, roomId, key, viewerRole = 'none'\)/);
  assert.match(app, /omok: '\/api\/omok\/rooms'/);
  assert.match(app, /blockBattle: '\/api\/block-battle\/rooms'/);
  assert.match(app, /sichuan: '\/api\/sichuan\/rooms'/);
  assert.match(app, /davinci: '\/api\/davinci\/rooms'/);
  assert.match(app, /viewerRole === 'spectator' \? '\/spectate\/leave' : '\/leave'/);
  assert.match(app, /data-role="\$\{esc\(role\)\}"/);
  assert.match(app, /if \(!result\?\.ok\) return false/);
});

test('오목 종료 후 두 플레이어가 나가면 방이 실제 서버 상태에서 삭제된다', () => {
  const state = stateWithUsers([['o1','오목1'],['o2','오목2']], BASE);
  const [a,b] = petsOf(state); a.stats.points = b.stats.points = 5000;
  const made = createOmokRoom(state, a, 100, at());
  assert.equal(joinOmokRoom(state, b, made.roomId, at(10)).ok, true);
  assert.equal(leaveOmokRoom(state, a, made.roomId, at(20)).forfeited, true);
  assert.equal(state.omok.rooms[made.roomId].status, 'ended');
  assert.equal(omokView(state, a.id).rooms.find((r) => r.id === made.roomId).viewerRole, 'none');
  const last = leaveOmokRoom(state, b, made.roomId, at(30));
  assert.equal(last.deleted, true);
  assert.equal(state.omok.rooms[made.roomId], undefined);
  assert.equal(leaveOmokRoom(state, b, made.roomId, at(40)).ok, true, '중복 확인도 멱등 처리한다');
});

test('테트리스대전 종료 후 두 플레이어가 나가면 방이 삭제된다', () => {
  const state = stateWithUsers([['b1','블럭1'],['b2','블럭2']], BASE);
  const [a,b] = petsOf(state); a.stats.points = b.stats.points = 5000;
  const made = createBlockBattleRoom(state, a, 100, at());
  assert.equal(joinBlockBattleRoom(state, b, made.roomId, at(10)).ok, true);
  assert.equal(leaveBlockBattleRoom(state, a, made.roomId, at(20)).forfeited, true);
  assert.equal(blockBattleView(state, a.id, at(21)).rooms.find((r) => r.id === made.roomId).viewerRole, 'none');
  const last = leaveBlockBattleRoom(state, b, made.roomId, at(30));
  assert.equal(last.deleted, true);
  assert.equal(state.blockBattle.rooms[made.roomId], undefined);
});

test('사천성 종료 후 두 플레이어가 나가면 방이 삭제된다', () => {
  const state = stateWithUsers([['s1','사천1'],['s2','사천2']], BASE);
  const [a,b] = petsOf(state); a.stats.points = b.stats.points = 5000;
  const made = createSichuanRoom(state, a, 100, at());
  assert.equal(joinSichuanRoom(state, b, made.roomId, at(10)).ok, true);
  assert.equal(leaveSichuanRoom(state, a, made.roomId, at(20)).forfeited, true);
  assert.equal(sichuanView(state, a.id, at(21)).rooms.find((r) => r.id === made.roomId).viewerRole, 'none');
  const last = leaveSichuanRoom(state, b, made.roomId, at(30));
  assert.equal(last.ok, true);
  assert.equal(state.sichuan.rooms[made.roomId], undefined);
});

test('다빈치 종료 결과 확인은 종료방을 대기방으로 되살리지 않고 마지막 참가자 퇴장 시 삭제한다', () => {
  const state = stateWithUsers([['d1','다빈치1'],['d2','다빈치2']], BASE);
  const [a,b] = petsOf(state); a.stats.points = b.stats.points = 5000;
  const made = createDavinciRoom(state, a, 100, at());
  assert.equal(joinDavinciRoom(state, b, made.roomId, at(5)).ok, true);
  assert.equal(setDavinciReady(state, b, made.roomId, true, at(6)).ok, true);
  assert.equal(startDavinciRoom(state, a, made.roomId, at(10)).ok, true);
  const first = leaveDavinciRoom(state, a, made.roomId, at(20));
  assert.equal(first.ok, true);
  assert.equal(state.davinci.rooms[made.roomId].status, 'ended');
  const last = leaveDavinciRoom(state, b, made.roomId, at(30));
  assert.equal(last.deleted, true);
  assert.equal(state.davinci.rooms[made.roomId], undefined);
});

test('종료된 방은 서버에 결과 보존 중이어도 일반 로비 슬롯과 새 방 한도를 점유하지 않는다', () => {
  assert.match(app, /function omokLobby\(\)[\s\S]*filter\(\(room\) => room\.status !== 'ended'\)/);
  assert.match(app, /function blockBattleLobby\(\)[\s\S]*filter\(\(room\) => room\.status !== 'ended'\)/);
  assert.match(app, /function sichuanLobby\(\)[\s\S]*filter\(\(room\) => room\.status !== 'ended'\)/);
  assert.match(app, /function davinciLobby\(\)[\s\S]*filter\(\(room\) => room\.status !== 'ended'\)/);
});



test('이미 삭제된 방은 leave만 멱등 성공하고 join·관전·착수 같은 일반 동작은 성공으로 위장하지 않는다', () => {
  const state = stateWithUsers([['x1','검증1'],['x2','검증2']], BASE);
  const [a] = petsOf(state);
  a.stats.points = 5000;
  assert.equal(joinOmokRoom(state, a, 'missing-omok', at()).ok, false);
  assert.equal(spectateOmokRoom(state, a, 'missing-omok', at()).ok, false);
  assert.equal(playOmokMove(state, a, 'missing-omok', 0, 0, 'req-missing', at()).ok, false);
  assert.equal(joinBlockBattleRoom(state, a, 'missing-block', at()).ok, false);
  assert.equal(joinSichuanRoom(state, a, 'missing-sichuan', at()).ok, false);
  assert.equal(joinDavinciRoom(state, a, 'missing-davinci', at()).ok, false);
  assert.equal(leaveOmokRoom(state, a, 'missing-omok', at()).ok, true);
  assert.equal(leaveBlockBattleRoom(state, a, 'missing-block', at()).ok, true);
  assert.equal(leaveSichuanRoom(state, a, 'missing-sichuan', at()).ok, true);
  assert.equal(leaveDavinciRoom(state, a, 'missing-davinci', at()).ok, true);
});

test('v6.10.4 캐시 버전은 HTML·앱·서비스워커에 완전히 일치한다', () => {
  assert.equal(JSON.parse(pkg).version, '6.10.11');
  assert.match(index, /styles\.css\?v=610111/);
  assert.match(index, /app\.js\?v=610111/);
  assert.match(app, /sw\.js\?v=610111/);
  assert.match(sw, /const CACHE = 'lego-life-v610111-battle-tetris-sync-final'/);
  assert.match(sw, /const VERSION = '610111'/);
});
