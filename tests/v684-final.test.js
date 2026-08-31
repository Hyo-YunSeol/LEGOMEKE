import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const files = async () => {
  const [app, css, territory, worker, index, sw, pkg] = await Promise.all([
    readFile(new URL('../public/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/styles.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/game/territory.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/worker.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/sw.js', import.meta.url), 'utf8'),
    readFile(new URL('../package.json', import.meta.url), 'utf8')
  ]);
  return { app, css, territory, worker, index, sw, pkg };
};

test('v6.8.4 게임 순위는 2×2이고 커플 D-Day·찌르기는 더보기 전까지 숨긴다', async () => {
  const { app, css } = await files();
  assert.match(css, /\.ranking-section \.game-rank-grid \{ grid-template-columns:repeat\(2,minmax\(0,1fr\)\) !important; \}/);
  assert.doesNotMatch(css, /game-rank-grid \{ grid-template-columns:repeat\(3/);
  assert.match(app, /rankingRelationsExpanded: false/);
  assert.match(app, /data-action="toggle-relation-rankings"/);
  assert.match(app, /app\.rankingRelationsExpanded\s*\?\s*`<div class="rank-tabs-grid relation-rank-grid"/);
});

test('v6.8.4 테트리스 라이브 갱신은 판 전체 재생성 대신 부분 패치하고 모바일 높이를 반영한다', async () => {
  const { app, css } = await files();
  assert.match(app, /function patchBlockBattleDynamic\(room, \{ paintSelf = false \} = \{\}\)/);
  assert.match(app, /else if \(room\) patchBlockBattleDynamic\(room, \{ paintSelf \}\)/);
  assert.match(app, /function blockBattleLayoutSignature\(room\)/);
  assert.doesNotMatch(app.slice(app.indexOf('function blockBattleLayoutSignature'), app.indexOf('function applyBlockBattleRoomState')), /lines|attackSent|pendingGarbage|lastAttack|spectatorCount|reactions/);
  assert.equal((app.match(/function paintBlockBattleBoard\(/g) || []).length, 1);
  assert.doesNotMatch(app, /blockBattleMatrix\(/);
  assert.match(app, /visualViewport/);
  assert.match(css, /--block-battle-viewport-height:100dvh/);
  assert.match(css, /backdrop-filter:none; -webkit-backdrop-filter:none/);
  assert.match(css, /block-battle-cell\[class\*="piece-"\] \{ box-shadow:none/);
});

test('v6.8.4 영토 본진은 전면전에서도 탈취·이동 후보에서 제외한다', async () => {
  const { app, territory } = await files();
  assert.match(territory, /if \(existing\?\.home\).*본진은 전면전 여부와 관계없이 보호/);
  assert.match(territory, /filter\(\(\[key, cell\]\) => key !== exceptKey && !cell\.home\)/);
  assert.doesNotMatch(territory, /oldestOwnedCell/);
  assert.doesNotMatch(territory, /releasedWasHome/);
  assert.match(app, /본진은 전면전에서도 항상 보호되며 탈취·이동·포기할 수 없습니다/);
  assert.doesNotMatch(app, /본진\(전면전: 탈취 가능\)|전면전 진행 중 · 본진 탈취 가능/);
});

test('현재 배포 버전과 정적 자산 캐시는 함께 올라간다', async () => {
  const { app, worker, index, sw, pkg } = await files();
  assert.match(pkg, /"version": "6\.10\.14"/);
  assert.match(worker, /6\.10\.14-spotdiff-sichuan-myth-final/);
  assert.match(index, /\?v=610114/);
  assert.match(app, /\?v=610114/);
  assert.match(sw, /lego-life-v610114-spotdiff-sichuan-myth-final/);
});
