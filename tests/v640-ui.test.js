import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');

test('게임 메뉴는 포인트 개인게임 → 단체게임 오목 → 라이어 순서이며 사과게임 UI가 포함된다', () => {
  const personal = app.indexOf("sectionHeading('포인트 개인게임'");
  const group = app.indexOf('<span>단체게임</span>');
  const omok = app.indexOf('<section class="section omok-wrap">');
  const liar = app.indexOf('<section class="section liar-wrap">');
  assert.ok(personal >= 0 && group > personal && omok > group && liar > omok);
  assert.match(app, /case 'apple'|id === 'apple'|gameId === 'apple'/);
  assert.match(css, /grid-template-columns:\s*repeat\(10,/);
  assert.match(css, /touch-action:\s*none/);
});

test('내 레고 레고방 순위 아래 게임 순위에 홀짝·사과·오목 TOP 5가 함께 표시된다', () => {
  const homeRanking = app.indexOf("sectionHeading('레고방 순위'");
  const gameRanking = app.indexOf('게임 순위', homeRanking);
  assert.ok(homeRanking >= 0 && gameRanking > homeRanking);
  assert.match(app, /🌓 홀짝 TOP 5/);
  assert.match(app, /🍎 사과게임 TOP 5/);
  assert.match(app, /⚫ 오목 TOP 5/);
  assert.match(css, /\.game-rank-grid/);
});

test('관리자 UI는 회원 포인트 지급·회수와 계정 완전 삭제 버튼을 제공한다', () => {
  assert.match(app, /data-action="admin-points"/);
  assert.match(app, /포인트\+/);
  assert.match(app, /포인트-/);
  assert.match(app, /\/api\/admin\/points/);
  assert.match(app, /data-action="admin-delete-account"/);
  assert.match(app, /계정 삭제/);
  assert.match(app, /\/api\/admin\/users\//);
});

test('사과게임 모바일 좌표는 실제 터치 셀 우선 + 보드 콘텐츠 박스 보정으로 계산한다', () => {
  assert.match(app, /document\.elementFromPoint/);
  assert.match(app, /borderLeftWidth/);
  assert.match(app, /setPointerCapture/);
  assert.match(app, /pointerdown/);
  assert.match(app, /pointermove/);
  assert.match(app, /pointerup/);
});

test('오목 UI는 15×15 정사각형 보드와 관전/참가/재대결을 제공하고 오목 채팅 UI를 만들지 않는다', () => {
  assert.match(css, /grid-template-columns:\s*repeat\(15,/);
  assert.match(css, /grid-template-rows:\s*repeat\(15,/);
  assert.match(css, /aspect-ratio:\s*1\s*\/\s*1/);
  assert.match(css, /box-sizing:\s*border-box/);
  assert.match(css, /\.omok-cell[^}]*width:\s*100%[^}]*height:\s*100%/s);
  assert.match(app, /data-action="omok-spectate"/);
  assert.match(app, /data-action="omok-join"/);
  assert.match(app, /data-action="omok-rematch"/);
  const start = app.indexOf('function omokRoomView');
  const end = app.indexOf('function omokSection', start);
  const omokRoomSource = app.slice(start, end);
  assert.doesNotMatch(omokRoomSource, /chat/i);
});

test('회원가입 버튼 바로 위에 요청한 본인 닉네임 안내문이 정확히 들어간다', () => {
  const warning = '※ 반드시 레고방에서 사용 중인 본인 닉네임으로 가입해주세요.본인 닉네임이 아닌 계정은 확인 후 관리자가 별도 경고 없이 삭제할 수 있습니다.';
  const warningIndex = html.indexOf(warning);
  const buttonIndex = html.indexOf('<button class="primary wide" type="submit">첫 레고 만들기</button>');
  assert.ok(warningIndex >= 0 && buttonIndex > warningIndex);
});
