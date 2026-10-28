import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
const start = app.indexOf('return `<div class="rummi-play-area">');
const end = app.indexOf('\n}', start);
const playTemplate = app.slice(start, end);

test('루미큐브는 규칙을 맨 위에 표시하고 게임판을 넓게 배치하며 우측 정렬과 전 패 표시를 지원', () => {
  assert.ok(start > 0);
  assert.ok(playTemplate.indexOf('rummi-rule-top') < playTemplate.indexOf('rummi-table-layout'));
  assert.ok(playTemplate.includes('${header}${players}<div class="rummi-table-layout"'));
  assert.ok(app.includes('const boardTools=') && app.includes('rummi-board-tools')); 
  assert.ok(app.includes('const rackHtml=') && app.includes('rummi-rack-tiles'));
  assert.match(css, /\.rummi-play-area \.rummi-table-layout\{display:grid/);
  assert.match(css, /\.rummi-play-area \.rummi-rack-tiles\{display:grid/);
  assert.match(css, /max-height:none!important;min-height:0;overflow:visible!important/);
});

test('루미큐브 입장에서는 이전 페이지 스크롤 위치를 초기화하고 플레이 중 다시 그리기는 스크롤을 보존', () => {
  assert.match(app, /if\(wasScreen!==shouldScreen\).*?if\(shouldScreen\)window\.scrollTo\?\.\(0,0\)/);
  assert.match(app, /if\(playNode\)playNode\.scrollTop=playScroll/);
  assert.match(app, /if\(tableNode\)tableNode\.scrollTop=tableScroll/);
});
