import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const appSource = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const workerSource = await readFile(new URL('../src/worker.js', import.meta.url), 'utf8');

test('라이어 채팅은 전체 렌더링에서도 작성 중 내용과 포커스·커서 위치를 저장하고 복원한다', () => {
  assert.match(appSource, /function captureLiarComposerState\(\)/);
  assert.match(appSource, /document\.activeElement === input/);
  assert.match(appSource, /selectionStart/);
  assert.match(appSource, /function restoreLiarComposerState\(snapshot\)/);
  assert.match(appSource, /input\.setSelectionRange\(start, end\)/);
  assert.match(appSource, /const liarComposer = captureLiarComposerState\(\)/);
  assert.match(appSource, /restoreLiarComposerState\(liarComposer\)/);
});

test('다른 사람의 라이어 채팅 실시간 갱신은 입력 폼을 교체하지 않고 메시지 목록만 갱신한다', () => {
  assert.match(workerSource, /pathname === '\/api\/liar\/chat' \? 'liar-chat' : 'liar'/);
  assert.match(appSource, /payload\.reason === 'liar-chat'/);
  assert.match(appSource, /function refreshLiarChatOnly\(\)/);
  assert.match(appSource, /chat\.innerHTML = liarChatMessages\(game, me\.id\)/);
  assert.match(appSource, /renderMode === 'liar-chat'/);
});

test('라이어 채팅은 전송 실패 시 작성 내용을 유지하고 성공했을 때만 비운다', () => {
  assert.match(appSource, /liarChatDraft/);
  assert.match(appSource, /if \(input\) app\.liarChatDraft = input\.value/);
  assert.doesNotMatch(appSource, /if \(form\.id === 'liar-chat-form'\) \{ form\.reset\(\)/);
  assert.match(appSource, /perform\('\/api\/liar\/chat',[\s\S]*renderMode: 'liar-chat'/);
  assert.match(appSource, /if \(result\?\.ok\) \{/);
});

const cssSource = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');

test('휴대폰 키보드가 열리면 라이어 채팅만 visualViewport 높이에 고정하고 전체 페이지 밀림을 막는다', () => {
  assert.match(appSource, /window\.visualViewport/);
  assert.match(appSource, /--visual-viewport-height/);
  assert.match(appSource, /setLiarKeyboardMode\(true\)/);
  assert.match(cssSource, /body\.liar-keyboard-open\s*\{[^}]*overflow:\s*hidden/s);
  assert.match(cssSource, /body\.liar-keyboard-open \.liar-chat-section[\s\S]*position:\s*fixed/);
  assert.match(cssSource, /height:\s*var\(--visual-viewport-height, 100dvh\)/);
  assert.match(cssSource, /grid-template-rows:\s*auto minmax\(0,1fr\) auto/);
  assert.match(cssSource, /body\.liar-keyboard-open \.liar-chat-section \.chat-box[^}]*overflow-y:\s*auto/s);
});


test('모바일 라이어 채팅은 새 메시지·전체 갱신·키보드 변화에서도 읽던 메시지 앵커를 보존한다', () => {
  assert.match(appSource, /function captureLiarChatScrollState/);
  assert.match(appSource, /data-chat-id/);
  assert.match(appSource, /anchorId/);
  assert.match(appSource, /function restoreLiarChatScrollState/);
  assert.match(appSource, /preserveLiarScrollDuringViewportChange/);
  assert.match(appSource, /visualViewport\?\.addEventListener\('resize'/);
});
