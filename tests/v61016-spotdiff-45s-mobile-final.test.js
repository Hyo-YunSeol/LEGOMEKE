import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [app, scene, server, css, sw, index, pkg] = await Promise.all([
  readFile(new URL('../public/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/spot-difference-scene.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/game/spot-difference.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/styles.css', import.meta.url), 'utf8'),
  readFile(new URL('../public/sw.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../package.json', import.meta.url), 'utf8')
]);

test('틀린그림찾기 제한시간은 서버 30초·오답 5회이며 로비 TMI는 노출하지 않는다', () => {
  assert.match(server, /SPOT_DIFFERENCE_MATCH_SECONDS = 30/);
  assert.match(server, /SPOT_DIFFERENCE_MAX_WRONG_CLICKS = 5/);
  assert.match(server, /player\.wrongClicks >= SPOT_DIFFERENCE_MAX_WRONG_CLICKS/);
  assert.doesNotMatch(app, /30초 안에 틀린 곳 7개를 먼저 찾으면 승리합니다/);
  assert.match(app, /sectionHeading\('틀린그림찾기', battleUsageText\(\)/);
  assert.doesNotMatch(app, /고밀도 장면 20세트|636,480조합|성인 난이도|spot-rule-strip/);
});

test('카운트다운과 경기 타이머는 서버 시각이 뒤로 보정돼도 증가하지 않는 구조를 사용한다', () => {
  assert.match(app, /spotDifferenceLastServerNow = Math\.max/);
  assert.match(app, /startSeconds > 0 \? String\(Math\.max\(1, Math\.min\(3, startSeconds\)\)\) : ''/);
  assert.match(app, /const rawSeconds = ready \? Math\.ceil\(\(deadline - now\) \/ 1000\) : configured/);
  assert.match(app, /Math\.max\(0, Math\.min\(configured, rawSeconds\)\)/);
});

test('플레이 중 서버/부트스트랩 갱신은 그림 전체를 재생성하지 않고 부분 패치한다', () => {
  assert.match(app, /function patchSpotDifferenceLiveRoom\(room\)/);
  assert.match(app, /patchSpotDifferenceAnswers\(room\)/);
  assert.match(app, /renderSpotDifferenceAnswerMarks\(room\.puzzle, foundIds, false\)/);
  assert.match(app, /room\.status === 'playing' && patchSpotDifferenceLiveRoom\(room\)/);
  assert.match(app, /spotDifferenceLivePatched = Boolean\(liveSpotDifferenceRoom\?\.status === 'playing' && patchSpotDifferenceLiveRoom\(liveSpotDifferenceRoom\)\)/);
  assert.match(app, /function renderTab[\s\S]*liveSpotDifferenceRoom\?\.status === 'playing' && patchSpotDifferenceLiveRoom\(liveSpotDifferenceRoom\)[\s\S]*pane\.innerHTML = tabHtml\(tab\)/);
  assert.match(app, /function scheduleTabRender[\s\S]*liveSpotDifferenceRoom\?\.status === 'playing' && patchSpotDifferenceLiveRoom\(liveSpotDifferenceRoom\)/);
  assert.match(app, /function render\(\)[\s\S]*liveSpotDifferenceRoom\?\.status === 'playing' && patchSpotDifferenceLiveRoom\(liveSpotDifferenceRoom\)/);
  assert.match(scene, /data-spot-answer-layer/);
  assert.doesNotMatch(scene, /feColorMatrix|filter="url\(#spotHue\)"/);
});

test('모바일/PC 그림 선택은 pointerdown 단일 경로이며 focusin은 정답 제출에 사용하지 않는다', () => {
  assert.match(app, /document\.addEventListener\('pointerdown',[\s\S]*?const spotPictureButton = event\.target\.closest\?\.\('\[data-action="spot-difference-image"\]'\)[\s\S]*?submitSpotDifferenceClick\(spotPictureButton, event\)/);
  const focusBlock = app.match(/document\.addEventListener\('focusin',[\s\S]*?\n\}\);/)?.[0] || '';
  assert.doesNotMatch(focusBlock, /spot-difference-image|submitSpotDifferenceClick/);
  assert.match(app, /Number\.isFinite\(clientX\) \|\| !Number\.isFinite\(clientY\)/);
});

test('모바일 SVG 합성 안정화와 v6.10.21 캐시 버전을 함께 배포한다', () => {
  assert.match(css, /spot-picture-button[^}]*contain:paint[^}]*translateZ\(0\)[^}]*backface-visibility:hidden/);
  assert.equal(JSON.parse(pkg).version, '6.10.21');
  assert.match(index, /styles\.css\?v=610121/);
  assert.match(index, /app\.js\?v=610121/);
  assert.match(app, /spot-difference-scene\.js\?v=610121/);
  assert.match(app, /sw\.js\?v=610121/);
  assert.match(sw, /const VERSION = '610121'/);
});
