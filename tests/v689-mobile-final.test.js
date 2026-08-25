import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
const blockBattle = fs.readFileSync(new URL('../src/game/block-battle.js', import.meta.url), 'utf8');

test('테트리스 자동 낙하는 장시간 플레이에도 700ms 고정이며 시간 가속식을 사용하지 않는다', () => {
  assert.match(blockBattle, /export const BLOCK_BATTLE_GRAVITY_MS = 700;/);
  assert.match(blockBattle, /export function blockBattleGravityMs[\s\S]*?return BLOCK_BATTLE_GRAVITY_MS;/);
  assert.doesNotMatch(blockBattle, /850 - Math\.floor\(elapsed \/ 30_000\) \* 70/);
  assert.match(app, /const BLOCK_BATTLE_GRAVITY_MS = 700;/);
  assert.match(app, /const gravity = BLOCK_BATTLE_GRAVITY_MS;/);
  assert.match(app, /data-block-speed>속도 고정<\/span>/);
});

test('모바일 테트리스 플레이 중 하단 메뉴만 숨기고 종료 시 클래스 기반으로 복구한다', () => {
  assert.match(app, /document\.body\.classList\.toggle\('block-battle-playing'/);
  assert.match(app, /blockRoom\?\.viewerRole === 'player' && blockRoom\.status === 'playing'/);
  assert.match(css, /body\.block-battle-playing \.bottom-nav\s*\{\s*display:none(?:\s*!important)?;/);
  assert.match(css, /body\.block-battle-playing \.block-battle-controls\s*\{[^}]*bottom:(?:calc\(8px \+ )?env\(safe-area-inset-bottom\)\)?/);
  assert.doesNotMatch(css, /body\.block-battle-playing[^}]*position\s*:\s*fixed/i);
});

test('하단 메뉴는 transform 중심정렬 대신 좌우 고정 기준을 사용한다', () => {
  assert.match(css, /\.bottom-nav\s*\{[\s\S]*?left:0;[\s\S]*?right:0;[\s\S]*?transform:none;[\s\S]*?margin:(?:0 auto|[^;]+);/);
});

test('레고방 게임 순위에 서버 시즌 종료시각 기반 남은 시간을 표시한다', () => {
  assert.match(app, /function gameSeasonCountdownText\(/);
  assert.match(app, /id="game-season-countdown"/);
  assert.match(app, /rankings\.gameSeason\?\.endsAt/);
  assert.match(app, /시즌 종료까지 \$\{days\}일 \$\{hours\}시간/);
});


test('테트리스 플레이 중 숨겨진 하단 메뉴 이벤트가 들어와도 탭 전환을 거부한다', () => {
  assert.match(app, /function activateBottomNav\(button\)[\s\S]*?room\?\.viewerRole === 'player' && room\.status === 'playing'\) return;[\s\S]*?switchMainTab/);
});

test('테트리스 라이브 입력은 전체 게임 화면 재렌더 대신 부분 보드 패치를 유지한다', () => {
  assert.match(app, /function paintBlockBattleBoard\(/);
  assert.match(app, /if \(cache\[index\] !== className\)/);
  assert.match(app, /else if \(room\) patchBlockBattleDynamic\(room\)/);
  assert.match(app, /BLOCK_BATTLE_MAX_UNCONFIRMED_ACTIONS = 12/);
});

test('테트리스 로컬 입력은 첫 전체 렌더 이후 활성 블록 주변 칸만 다시 그린다', () => {
  assert.match(app, /function paintBlockBattleBoard\(player, root = document, \{ activeOnly = false \} = \{\}\)/);
  assert.match(app, /board\.__blockBattleActiveIndices/);
  assert.match(app, /activeOnly && board\.__blockBattlePaintReady/);
  assert.match(app, /paintBlockBattleBoard\(player, document, \{ activeOnly: true \}\)/);
});

test('테트리스 플레이 중 숨겨진 하단 메뉴의 지연 입력도 탭을 바꾸지 않는다', () => {
  assert.match(app, /const room = app\.data \? currentBlockBattleRoom\(\) : null;/);
  assert.match(app, /app\.tab === 'games' && room\?\.viewerRole === 'player' && room\.status === 'playing'\) return;/);
});

test('모바일 UI 공용 tick은 1초 주기로 제한하고 새 정적 자산 리비전을 사용한다', () => {
  assert.match(app, /app\.tickTimer = setInterval\(tick, 1_000\);/);
  assert.match(app, /\/sw\.js\?v=610104/);
});
