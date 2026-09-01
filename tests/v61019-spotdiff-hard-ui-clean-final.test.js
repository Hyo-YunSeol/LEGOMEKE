import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [app, scene, css] = await Promise.all([
  readFile(new URL('../public/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/spot-difference-scene.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/styles.css', import.meta.url), 'utf8')
]);

test('단체게임 로비는 게임명·대전 사용량·방 목록만 남기고 중복 규칙 TMI를 제거한다', () => {
  assert.match(app, /return `대전 \$\{used\}\/\$\{limit\}회`;/);
  for (const title of ['오목게임','테트리스대전','사천성대전','틀린그림찾기','다빈치코드']) {
    assert.match(app, new RegExp(`sectionHeading\\('${title}', battleUsageText\\(\\)`));
  }
  assert.doesNotMatch(app, /block-battle-intro|sichuan-intro|sichuan-rule-strip|spot-intro|spot-rule-strip|davinci-intro/);
  assert.doesNotMatch(app, /고밀도 장면 20세트|636,480조합|🧠 성인 난이도/);
  assert.doesNotMatch(app, /개인게임으로 포인트를 벌고|실시간으로 다른 레고와 함께 플레이합니다/);
  assert.doesNotMatch(app, /3초 카운트다운 뒤 같은 랜덤 문제|완전히 같은 8×10 판|승자는 두 사람의 판돈 전액|게임 시작 순간 참가자 전원의 판돈/);
  assert.doesNotMatch(css, /\.block-battle-intro|\.sichuan-rule-strip|\.spot-rule-strip|\.davinci-intro/);
});

test('신규 틀린그림 차이는 세모·점·숫자표를 추가하지 않고 원본 픽셀을 국소 변형한다', () => {
  const start = scene.indexOf('function dynamicAtlasDifferenceMarkup');
  const end = scene.indexOf('function renderCandidate', start);
  const dynamic = scene.slice(start, end);
  assert.match(dynamic, /spot-natural-edit/);
  assert.match(dynamic, /clipPath/);
  assert.match(dynamic, /<image href=/);
  assert.match(dynamic, /scale\(-1 1\)|scale\(1 -1\)/);
  assert.doesNotMatch(dynamic, /M0-10 10 8H-10Z|<text|<circle r="8"|stroke-dasharray="7 5"/);
});

test('틀린그림 플레이 중 generic render 세 경로가 모두 부분패치 후 종료되어 판 DOM을 지킨다', () => {
  const renderTab = app.slice(app.indexOf('function renderTab'), app.indexOf('function scheduleTabRender'));
  const schedule = app.slice(app.indexOf('function scheduleTabRender'), app.indexOf('function render()'));
  const render = app.slice(app.indexOf('function render()'), app.indexOf('function openNotifications'));
  assert.match(renderTab, /currentSpotDifferenceRoom\(\)[\s\S]*patchSpotDifferenceLiveRoom\(liveSpotDifferenceRoom\)[\s\S]*return;/);
  assert.match(schedule, /currentSpotDifferenceRoom\(\)[\s\S]*patchSpotDifferenceLiveRoom\(liveSpotDifferenceRoom\)[\s\S]*return;/);
  assert.match(render, /currentSpotDifferenceRoom\(\)[\s\S]*patchSpotDifferenceLiveRoom\(liveSpotDifferenceRoom\)[\s\S]*return;/);
});
