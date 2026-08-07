import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');

test('게임 메뉴는 라이어게임 → 오목게임 → 개인게임 순서이며 사과게임 UI가 포함된다', () => {
  const liar = app.indexOf('<section class="section liar-wrap">');
  const omok = app.indexOf('<section class="section omok-wrap">');
  const personal = app.indexOf("sectionHeading('개인게임'");
  assert.ok(liar >= 0 && omok > liar && personal > omok);
  assert.match(app, /case 'apple'|id === 'apple'|gameId === 'apple'/);
  assert.match(css, /grid-template-columns:\s*repeat\(10,/);
  assert.match(css, /touch-action:\s*none/);
});

test('사과게임 모바일 좌표는 실제 터치 셀 우선 + 보드 콘텐츠 박스 보정으로 계산한다', () => {
  assert.match(app, /document\.elementFromPoint/);
  assert.match(app, /borderLeftWidth/);
  assert.match(app, /setPointerCapture/);
  assert.match(app, /pointerdown/);
  assert.match(app, /pointermove/);
  assert.match(app, /pointerup/);
});

test('오목 UI는 15×15 보드와 관전/참가/재대결을 제공하고 오목 채팅 UI를 만들지 않는다', () => {
  assert.match(css, /grid-template-columns:\s*repeat\(15,/);
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
