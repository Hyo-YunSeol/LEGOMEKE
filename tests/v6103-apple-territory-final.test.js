import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stateWithUsers } from './helpers.js';
import { claimTerritory, initialTerritory, normalizeTerritory, processTerritorySeason, territoryView } from '../src/game/territory.js';
import { gameDayKey } from '../src/lib/time.js';

const BASE = new Date('2026-08-25T00:10:00.000Z'); // KST 09:10

function onePlayerState() {
  const state = stateWithUsers([['u1', '레고']], BASE);
  const pet = state.pets[state.users.u1.currentPetId];
  pet.stats.points = 10_000;
  return { state, pet };
}

test('사과게임은 PC 판 크기 피드백 루프 없이 제목 옆 소형 포기 + 안정 판 stage를 사용한다', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
  assert.match(app, /function appleModalHeader[\s\S]*apple-header-abandon[\s\S]*data-action="abandon-mini"[\s\S]*>포기<\/button>/);
  assert.doesNotMatch(app, /apple-abandon-controls/);
  assert.match(app, /id="apple-board-stage" class="apple-board-stage"/);
  assert.doesNotMatch(app, /new ResizeObserver\(\(\) => syncAppleGameLayout\(\)\)/);
  assert.doesNotMatch(app, /stage\.clientHeight - verticalPadding/);
  assert.match(app, /game\.clientHeight - fixedHeight - verticalPadding - 4/);
  assert.match(app, /board\.style\.removeProperty\('width'\)/);
  assert.match(css, /\.apple-board-stage \{[^}]*flex:1 1 0;[^}]*min-height:120px;[^}]*place-items:center/s);
  assert.match(css, /\.modal-root\.apple-modal-root \.modal \{[^}]*overflow-y:auto/s);
  assert.match(css, /\.apple-header-abandon \{[^}]*min-height:30px/s);
});

test('모바일 fixed 미니게임 모달은 visualViewport offsetTop을 다시 더하지 않는다', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
  assert.match(app, /setProperty\('--visual-viewport-top', '0px'\)/);
  assert.doesNotMatch(app, /Number\(viewport\?\.offsetTop\)/);
  assert.match(css, /\.modal-root\.apple-modal-root \{[^}]*inset:\s*0;[^}]*height:\s*var\(--visual-viewport-height/s);
});

test('영토전 종료 결과는 최근 4회 history에 누적되고 view로 전달된다', () => {
  const { state, pet } = onePlayerState();
  state.territory = initialTerritory(BASE, 12);
  const end = new Date('2026-08-25T02:37:00.000Z'); // KST 11:37
  state.territory.endsAt = end.toISOString();
  state.territory.seasonId = gameDayKey(new Date(end.getTime() - 1));
  assert.equal(claimTerritory(state, pet, 2, 2, BASE).ok, true);
  const settled = processTerritorySeason(state, end);
  assert.equal(settled.reset, true);
  assert.equal(state.territory.history.length, 1);
  assert.equal(state.territory.history[0].seasonNumber, 12);
  assert.equal(state.territory.history[0].endedAt, end.toISOString());
  const view = territoryView(state, pet.id);
  assert.equal(view.history.length, 1);
  assert.equal(view.history[0].endedAt, end.toISOString());
});

test('기존 lastResult는 history가 없던 저장 데이터에서도 보존되고 history는 최대 4회다', () => {
  const { state } = onePlayerState();
  const raw = initialTerritory(BASE, 20);
  const makeResult = (n) => ({ seasonId: `legacy-${n}`, seasonNumber: n, endedAt: new Date(BASE.getTime() - n * 60_000).toISOString() });
  raw.lastResult = makeResult(20);
  raw.history = [makeResult(19), makeResult(18), makeResult(17), makeResult(16), makeResult(15)];
  const normalized = normalizeTerritory(raw, state, BASE);
  assert.equal(normalized.history.length, 4);
  assert.equal(normalized.history[0].seasonNumber, 20);
  assert.deepEqual(normalized.history.map((item) => item.seasonNumber), [20, 19, 18, 17]);
});

test('영토 UI는 최근 종료시각과 짧은 황금영토 설명을 표시한다', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /최근 종료/);
  assert.match(app, /제\$\{Number\(item\.seasonNumber\) \|\| '-'\}회 · \$\{dateText\(item\.endedAt\)\}/);
  assert.match(app, /👑 황금영토는 종료 후 공개됩니다\. 공동 1위일 경우 황금영토를 가진 사람이 최종 우승합니다\./);
  assert.match(app, /<small>종료 시각<\/small><strong>\$\{dateText\(last\.endedAt\) \|\| '-'\}<\/strong>/);
});
