import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const appSource = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const cssSource = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
const workerSource = await readFile(new URL('../src/worker.js', import.meta.url), 'utf8');

test('게임 화면에 다빈치코드 2방 로비와 2~4인 안내가 연결된다', () => {
  assert.match(appSource, /function davinciLobby\(\)/);
  assert.match(appSource, /다빈치코드', `2~4인 · 숫자 추리 · 조커 포함 · 승자 판돈 독식/);
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

test('모바일 다빈치 4인전은 상대를 세로 영역에 두고 타일 가로 스크롤을 허용한다', () => {
  assert.match(cssSource, /\.davinci-opponents\{display:grid;gap:10px\}/);
  assert.match(cssSource, /\.davinci-hand\{[^}]*overflow-x:auto/);
  assert.match(cssSource, /@media\(max-width:640px\)/);
});

test('다빈치 랭킹은 승수와 정답을 표시하고 공통 3일 시즌 영역에 들어간다', () => {
  assert.match(appSource, /🧩 다빈치 TOP 5/);
  assert.match(appSource, /\$\{item\.wins\}승 · 정답 \$\{item\.correct\}/);
  assert.match(workerSource, /rankings: \{ \.\.\.rankingsView\(state, pet\.id\), blockBattle: blockBattleRankings\(state, pet\.id\), sichuan: sichuanRanking\(state, pet\.id\), spotDifference: spotDifferenceRanking\(state, pet\.id\), davinci: davinciRanking\(state, pet\.id\) \}/);
});
