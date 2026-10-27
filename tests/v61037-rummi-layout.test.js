import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
const start = app.indexOf('return `<div class="rummi-play-area">');
const end = app.indexOf('\n}', start);
const playTemplate = app.slice(start, end);

test('루미큐브는 상단 정보 다음 곧바로 확대된 게임판을 보여주고 규칙·지난 결과는 아래로 이동', () => {
  assert.ok(start > 0);
  assert.ok(playTemplate.includes('${header}${players}<div class="rummi-table"'));
  assert.ok(playTemplate.indexOf('<div class="rummi-table"') < playTemplate.indexOf('${rummiRulesHtml()}${resultHtml}'));
  assert.ok(playTemplate.indexOf('rummi-actions') < playTemplate.indexOf('${rummiRulesHtml()}${resultHtml}'));
  assert.match(css, /\.rummi-play-area \.rummi-table\{flex:1 0 clamp\(250px,38dvh,430px\);min-height:clamp\(250px,38dvh,430px\)/);
  assert.match(css, /\.rummi-play-area \.rummi-group-tiles \.rummi-tile\{width:35px;min-width:35px;height:47px/);
});

test('루미큐브 입장에서는 이전 페이지 스크롤 위치를 초기화하고 플레이 중 다시 그리기는 스크롤을 보존', () => {
  assert.match(app, /if\(wasScreen!==shouldScreen\).*?if\(shouldScreen\)window\.scrollTo\?\.\(0,0\)/);
  assert.match(app, /if\(playNode\)playNode\.scrollTop=playScroll/);
  assert.match(app, /if\(tableNode\)tableNode\.scrollTop=tableScroll/);
});
