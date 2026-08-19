import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const appSource = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const cssSource = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
const workerSource = await readFile(new URL('../src/worker.js', import.meta.url), 'utf8');

test('게임 화면에 다빈치코드 2방 로비와 2~4인 안내가 연결된다', () => {
  assert.match(appSource, /function davinciLobby\(\)/);
  assert.match(appSource, /다빈치코드', '2~4인 · 숫자 추리 · 조커 포함 · 승자 판돈 독식/);
  assert.match(appSource, /<section class="section davinci-wrap">\$\{davinciSection\(\)\}<\/section>/);
  assert.match(workerSource, /DAVINCI_MAX_ROOMS/);
});

test('다빈치 UI는 조커 배치·가위바위보·선후공·추리·덱소진 패널티·재대결 동작을 노출한다', () => {
  for (const action of ['davinci-joker-position','davinci-rps','davinci-order','davinci-target','davinci-guess','davinci-decision','davinci-penalty','davinci-rematch']) {
    assert.ok(appSource.includes(`data-action="${action}"`) || appSource.includes(`action === '${action}'`), `${action} missing`);
  }
  assert.match(appSource, /3 · 2 · 1 · /);
  assert.match(appSource, /뿅!/);
  assert.match(appSource, /계속 추리/);
  assert.match(appSource, /여기서 멈추기/);
  assert.match(appSource, /오답 패널티/);
});

test('공감은 7종 이모지+글씨로 오목·테트리스·다빈치 공통 사용한다', () => {
  for (const text of ["['funny', '😂', 'ㅋㅋ']", "['like', '👍', '좋아요']", "['wow', '😮', '헉']", "['fire', '🔥', '대박']", "['clap', '👏', '박수']", "['cringe', '😬', '짜쳐요']", "['sleepy', '🥱', '졸려요']"]) assert.ok(appSource.includes(text), text);
  assert.match(appSource, /<b>\$\{esc\(item\.emoji\)\}<\/b><small>\$\{esc\(item\.label\)\}<\/small>/);
  assert.match(cssSource, /\.reaction-burst small\{/);
  assert.match(workerSource, /sleepy: \{ emoji: '🥱', label: '졸려요' \}/);
});

test('모바일 다빈치 4인전은 참가자를 세로 한 줄씩 두고 각 패는 가로 스크롤한다', () => {
  assert.match(cssSource, /\.davinci-player-stack\{display:grid;grid-template-columns:1fr;gap:10px\}/);
  assert.match(cssSource, /\.davinci-hand\{[^}]*overflow-x:auto/);
  assert.match(cssSource, /@media\(max-width:640px\)/);
});

test('다빈치 랭킹은 승수와 정답을 표시하고 공통 3일 시즌 영역에 들어간다', () => {
  assert.match(appSource, /🧩 다빈치코드 TOP 5/);
  assert.match(appSource, /\$\{item\.wins\}승 · 정답 \$\{item\.correct\}/);
  assert.match(workerSource, /rankings: \{ \.\.\.rankingsView\(state, pet\.id\), blockBattle: blockBattleRankings\(state, pet\.id\), davinci: davinciRanking\(state, pet\.id\) \}/);
});


test('현재 차례는 카드 전체 강조와 배지로 표시하고 선택 타일도 강조한다', () => {
  assert.match(appSource, /current-turn/);
  assert.match(appSource, /▶ 현재 차례/);
  assert.match(appSource, /davinci-order-badge/);
  assert.match(appSource, /selected-target/);
  assert.match(cssSource, /\.davinci-player-panel\.current-turn\{[^}]*border:3px solid var\(--primary\)/);
  assert.match(cssSource, /\.davinci-tile\.selected-target\{/);
});

test('상단 중앙에는 남은 패 총개수와 검정·흰색 개수를 표시한다', () => {
  assert.match(appSource, /function davinciDeckSummaryHtml\(room\)/);
  assert.match(appSource, /🎴 남은 패/);
  assert.match(appSource, /⬛ 검정 \$\{black\}/);
  assert.match(appSource, /⬜ 흰색 \$\{white\}/);
  assert.match(cssSource, /\.davinci-deck-summary\{[^}]*justify-self:center/);
});

test('대기방 방장 강퇴 UI와 종료 후 전체 공개 안내가 있다', () => {
  assert.match(appSource, /data-action="davinci-kick"/);
  assert.match(appSource, /참가자가 들어오거나 나가거나 강퇴되면 준비 상태가 모두 초기화됩니다/);
  assert.match(appSource, /판이 끝나 모든 참가자의 코드와 남은 패를 공개했습니다/);
  assert.match(workerSource, /'\/api\/davinci\/rooms\/:roomId\/kick'/);
});
