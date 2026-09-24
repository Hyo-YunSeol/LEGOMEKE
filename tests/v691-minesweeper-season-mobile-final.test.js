import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gameRankingSeasonWindow } from '../src/lib/time.js';
import { normalizeMinesweeperSeason } from '../src/game/minesweeper.js';

const appSource = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const styleSource = readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
const mineSource = readFileSync(new URL('../src/game/minesweeper.js', import.meta.url), 'utf8');
const workerSource = readFileSync(new URL('../src/worker.js', import.meta.url), 'utf8');

test('지뢰찾기 시즌은 다른 게임 순위와 동일한 72시간 시즌 키와 종료 시각을 사용한다', () => {
  for (const dateText of [
    '2026-08-15T09:10:00.000Z',
    '2026-08-16T14:59:59.000Z',
    '2026-08-16T15:00:01.000Z'
  ]) {
    const date = new Date(dateText);
    const shared = gameRankingSeasonWindow(date);
    const mine = normalizeMinesweeperSeason(null, date);
    assert.equal(mine.key, shared.key);
    assert.equal(mine.startsAt, shared.startsAt);
    assert.equal(mine.endsAt, shared.endsAt);
  }
  assert.match(mineSource, /gameRankingSeasonWindow/u);
  assert.doesNotMatch(mineSource, /gameDayWindow|gameDaysBetweenKeys/u);
});

test('순위 UI는 지뢰찾기 전용 6시간 카운트다운 없이 모든 게임 3일 동시 초기화를 안내한다', () => {
  assert.match(appSource, /모든 게임 순위는 3일 시즌 · 동시에 초기화/u);
  assert.doesNotMatch(appSource, /지뢰찾기는 6시간마다 초기화|초기화까지/u);
  assert.doesNotMatch(appSource, /minesweeper-season-countdown|mine-rank-reset/u);
});

test('모바일 지뢰찾기는 별도 모드 버튼 없이 짧은 터치 열기와 롱프레스 깃발을 사용한다', () => {
  assert.doesNotMatch(appSource, /minesweeperMode|minesweeper-mode-button|data-action="minesweeper-mode"/u);
  assert.match(appSource, /MINESWEEPER_LONG_PRESS_MS = 400/u);
  assert.match(appSource, /document\.addEventListener\('pointerdown', beginMinesweeperPointerGesture/u);
  assert.match(appSource, /document\.addEventListener\('pointerup', finishMinesweeperPointerGesture/u);
  assert.match(appSource, /submitMinesweeperAction\('flag', gesture\.row, gesture\.col\)/u);
  assert.match(appSource, /submitMinesweeperAction\('reveal', row, col\)/u);
  assert.match(appSource, /짧게 터치 열기 · 길게 누르기 깃발/u);
  assert.match(styleSource, /\.minesweeper-board\s*\{[\s\S]*?touch-action:none;/u);
  assert.match(styleSource, /\.minesweeper-cell\s*\{[\s\S]*?touch-action:none;/u);
});

test('롱프레스 뒤 합성 click/contextmenu 이중 입력 방지 코드와 3일 칭호 안내가 유지된다', () => {
  assert.match(appSource, /suppressMinesweeperSyntheticClick/u);
  assert.match(appSource, /shouldSuppressMinesweeperSyntheticClick/u);
  assert.match(appSource, /Date\.now\(\) - minesweeperLastTouchPointerAt < 1600/u);
  assert.match(workerSource, /다음 3일 시즌 동안 \$\{champion\.badgeLabel\} 칭호/u);
});
