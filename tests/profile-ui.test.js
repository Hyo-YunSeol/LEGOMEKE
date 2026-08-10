import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function text(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('체형 이름을 누르면 28단계 그림·범위·체급별 배고픔·현재 단계를 보여주는 도감이 열린다', async () => {
  const app = await text('public/app.js');
  const css = await text('public/styles.css');
  assert.match(app, /data-action="body-guide"/);
  assert.match(app, /function openBodyGuide\(/);
  assert.match(app, /레고 체형 도감/);
  assert.match(app, /bodyStages\(\)\.map\(\(stage, index\)/);
  assert.match(app, /avatar\(stage, \{ mini: true \}\)/);
  assert.match(app, /몸집 \$\{esc\(bodyRangeLabel\(stage\)\)\}/);
  assert.match(app, /현재 단계/);
  assert.match(app, /게임·교미·영토 배고픔/);
  assert.match(app, /맘모스레고/);
  assert.match(app, /돼룩돼룩레고/);
  assert.match(app, /국가비상돼지레고/);
  assert.match(app, /아르헨티노사우루스레고/);
  assert.match(app, /생활: 일 -/);
  assert.match(css, /\.body-guide-list/);
  assert.match(css, /\.body-guide-card\.current/);
});

test('상태메시지 편집 UI는 20자 제한을 서버 카탈로그와 공유하고 온라인 카드에 표시한다', async () => {
  const app = await text('public/app.js');
  const css = await text('public/styles.css');
  assert.match(app, /function openStatusMessageEditor\(/);
  assert.match(app, /statusMessageMaxLength/);
  assert.match(app, /id="status-message-form"/);
  assert.match(app, /maxlength="\$\{maxLength\}"/);
  assert.match(app, /\/api\/profile\/status-message/);
  assert.match(app, /profile\.statusMessage \? `<span class="profile-status-message">/);
  assert.match(css, /\.profile-status-message/);
  assert.match(css, /\.status-message-counter/);
});
