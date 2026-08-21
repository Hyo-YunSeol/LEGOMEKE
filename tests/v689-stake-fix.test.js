import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createBlockBattleRoom, validBlockBattleStake } from '../src/game/block-battle.js';
import { stateWithUsers } from './helpers.js';

const DATE = new Date('2026-08-13T03:00:00.000Z');

function singlePlayer(points = 20_000) {
  const state = stateWithUsers([['stake-user', '판돈테스트']], DATE);
  const pet = state.pets[state.users['stake-user'].currentPetId];
  pet.stats.points = points;
  return { state, pet };
}

test('테트리스 판돈은 2,000P·3,000P·4,000P 이상 천 단위를 서버에서 허용한다', () => {
  for (const stake of [2000, 3000, 4000, 10_000]) {
    assert.equal(validBlockBattleStake(stake), true);
    const { state, pet } = singlePlayer();
    const result = createBlockBattleRoom(state, pet, stake, DATE);
    assert.equal(result.ok, true);
    assert.equal(state.blockBattle.rooms[result.roomId].stakePoints, stake);
  }
});

test('테트리스 판돈은 1,500P·2,500P처럼 천 단위가 아닌 값을 거절한다', () => {
  for (const stake of [1500, 2500, 3500]) {
    const { state, pet } = singlePlayer();
    const result = createBlockBattleRoom(state, pet, stake, DATE);
    assert.equal(result.ok, false);
  }
});

test('오목·테트리스 생성 모달은 실시간 갱신으로 다시 그려져 100P로 초기화되지 않는다', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /descriptor\.type === 'omokCreate' \|\| descriptor\.type === 'blockBattleCreate' \|\| descriptor\.type === 'davinciCreate'\) return;/);
  assert.doesNotMatch(app, /if \(descriptor\.type === 'omokCreate'\) return openCreateOmok\(\);/);
  assert.doesNotMatch(app, /if \(descriptor\.type === 'blockBattleCreate'\) return openCreateBlockBattle\(\);/);
});

test('테트리스 생성창은 2,000P·3,000P 프리셋과 직접 입력을 제공하고 실제 선택값을 전송한다', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /\[100, 500, 1000, 2000, 3000\]/);
  assert.match(app, /id="block-battle-stake-preset"/);
  assert.match(app, /name="customStake"/);
  assert.match(app, /preset === 'custom' \? Number\(data\.customStake\) : Number\(preset\)/);
  assert.match(app, /perform\('\/api\/block-battle\/rooms', \{ stakePoints \}\)/);
});


test('Worker bootstrap 카탈로그도 테트리스 판돈 프리셋을 서버 상수와 공유한다', async () => {
  const worker = await readFile(new URL('../src/worker.js', import.meta.url), 'utf8');
  assert.match(worker, /BLOCK_BATTLE_STAKES, blockBattleNextAlarmAt/);
  assert.match(worker, /blockBattle: \{ maxRooms: 3, stakes: \[\.\.\.BLOCK_BATTLE_STAKES\], width: 10, height: 20 \}/);
});
