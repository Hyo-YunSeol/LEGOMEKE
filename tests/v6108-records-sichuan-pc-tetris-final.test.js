import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createPet } from '../src/game/engine.js';
import { createSichuanRoom, SICHUAN_MAX_ROOMS } from '../src/game/sichuan.js';
import { stateWithUsers } from './helpers.js';

const BASE = new Date('2026-08-26T09:00:00.000Z');
const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');

function functionSource(name, nextName) {
  const start = app.indexOf(`function ${name}(`);
  const end = nextName ? app.indexOf(`function ${nextName}(`, start + 1) : -1;
  assert.ok(start >= 0, `${name} 함수를 찾지 못했습니다.`);
  return app.slice(start, end > start ? end : start + 8000);
}

test('사천성은 동시에 5방까지 만들 수 있고 6번째 방은 거절한다', () => {
  assert.equal(SICHUAN_MAX_ROOMS, 5);
  const state = stateWithUsers(Array.from({ length: 6 }, (_, index) => [`u${index + 1}`, `방장${index + 1}`]), BASE);
  const pets = Object.values(state.pets);
  for (let index = 0; index < 5; index += 1) {
    pets[index].stats.points = 10_000;
    const result = createSichuanRoom(state, pets[index], 100, BASE);
    assert.equal(result.ok, true, `사천성 ${index + 1}번째 방 생성 실패: ${result.message}`);
  }
  pets[5].stats.points = 10_000;
  const sixth = createSichuanRoom(state, pets[5], 100, BASE);
  assert.equal(sixth.ok, false);
  assert.match(sixth.message, /5개가 모두 사용 중/);
});

test('왕 경력은 시즌 로그를 쌓지 않고 8개 고정 boolean만 유지한다', () => {
  const user = { id: 'u1', nickname: '기록', generation: 1, currentPetId: null, sessionVersion: 1, notifications: [], createdAt: BASE.toISOString(), lastSeenAt: BASE.toISOString() };
  const pet = createPet(user, 1, BASE);
  assert.deepEqual(Object.keys(pet.kingHistory).sort(), [
    'apple', 'blockBattle', 'minesweeperHard', 'minesweeperNormal', 'omok', 'sichuan', 'singleTetris'
  ]);
  for (const value of Object.values(pet.kingHistory)) assert.equal(typeof value, 'boolean');
  assert.equal(Array.isArray(pet.kingHistory), false);
});

test('레고의 기록은 생활 기록 중심이며 최고레벨·최대영토·승패 전적을 표시하지 않는다', () => {
  const source = functionSource('recordsView', 'markAllTabsDirty');
  for (const label of ['탄생일', '생존', '최고 몸집', '최고 포인트', '현재 커플', '현재 왕 칭호', '현재 장식', '왕 경력']) {
    assert.match(source, new RegExp(`compactMetric\\('${label}'`));
  }
  assert.doesNotMatch(source, /최고 레벨|최대 영토|총 경기|총 게임|승률|승\s*\/\s*패|승패 전적|테트리스 총|개인게임 총/);
});

test('1대1 테트리스는 PC/mobile 분기 없이 싱글과 같은 composite-cell 렌더러를 사용한다', () => {
  assert.match(app, /function blockBattleCompositeBoard\(player\)/);
  assert.match(app, /const visual = blockBattleCompositeBoard\(player\);/);
  assert.doesNotMatch(app, /matchMedia\?\.\('\\(hover: hover\\) and \\(pointer: fine\\)'\)/);
  assert.doesNotMatch(app, /paintBlockBattleActiveLayer\(/);
  assert.match(app, /__singleTetrisPaintCache/);
  assert.match(app, /__blockBattlePaintCache/);
});

test('싱글 테트리스의 정상 변경셀 렌더링 경로는 그대로 유지한다', () => {
  assert.match(app, /__singleTetrisPaintCache/);
  assert.match(app, /if\s*\(cache\[index\] !== className\) \{/);
  assert.match(app, /cache\[index\]=className;/);
  assert.match(app, /next\.dataset\.nextType!==nextType/);
});
