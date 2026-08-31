import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { BODY_STAGES } from '../src/game/constants.js';
import { SICHUAN_TILES } from '../src/game/sichuan.js';

const mythLabels = ['베헤모스레고','펜리르레고','히드라레고','오로치레고','가루다레고','니드호그레고','요르문간드레고','아펩레고','아틀라스레고','수르트레고','티폰레고','신화재앙레고'];
const legacySichuanIds = ['cat','soccer','crown','moon','diamond','guitar','book','planet','flower','dragon','sword','shield','teddy','skate','coffee','ribbon','trident','sunglasses','briefcase','crystal'];

test('체형도감은 기존 34단계를 보존하고 신화편 12단계를 뒤에 추가하며 포만감 비용 상한 7을 유지한다', () => {
  assert.equal(BODY_STAGES.length, 46);
  assert.equal(BODY_STAGES[33].label, '레비아탄레고');
  assert.equal(BODY_STAGES[33].max, 9699);
  assert.deepEqual(BODY_STAGES.slice(34).map((stage) => stage.label), mythLabels);
  assert.equal(BODY_STAGES.at(-1).max, Infinity);
  assert.ok(BODY_STAGES.slice(33).every((stage) => stage.activityHungerCost === 7));
  for (let index = 1; index < BODY_STAGES.length; index += 1) assert.equal(BODY_STAGES[index].min, BODY_STAGES[index - 1].max + 1);
});

test('신화편 12개 SVG는 실제 파일로 존재하고 각 단계명이 포함된다', async () => {
  for (const stage of BODY_STAGES.slice(34)) {
    const path = new URL(`../public/pets/${stage.assetKey}.svg`, import.meta.url);
    await access(path);
    const svg = await readFile(path, 'utf8');
    assert.match(svg, /<svg[^>]+viewBox="0 0 300 240"/);
    assert.match(svg, new RegExp(stage.label));
  }
});

test('사천성 리뉴얼은 저장 호환을 위해 기존 20개 tile id를 유지하고 표시 자산만 새 SVG로 교체한다', async () => {
  assert.deepEqual(SICHUAN_TILES.map((tile) => tile.id), legacySichuanIds);
  assert.equal(new Set(SICHUAN_TILES.map((tile) => tile.src)).size, 20);
  for (const tile of SICHUAN_TILES) {
    assert.match(tile.src, /^\/sichuan\/[a-z-]+\.svg$/);
    const path = new URL(`../public${tile.src}`, import.meta.url);
    await access(path);
    const svg = await readFile(path, 'utf8');
    assert.match(svg, /<svg/);
  }
});

test('틀린그림찾기 UI·Worker API·서비스워커 자산 연결이 모두 존재한다', async () => {
  const [app, worker, sw, css] = await Promise.all([
    readFile(new URL('../public/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/worker.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/sw.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/styles.css', import.meta.url), 'utf8')
  ]);
  assert.match(app, /<section class="section spot-difference-wrap">\$\{spotDifferenceSection\(\)\}<\/section>/);
  assert.match(app, /data-action="spot-difference-image"/);
  assert.match(app, /정답 공개/);
  assert.match(worker, /\/api\/spot-difference\/rooms/);
  assert.match(worker, /spotDifference: \(\(\) => \{ const view = spotDifferenceView\(state, pet\.id\)/);
  assert.match(sw, /spot-difference-scene\.js/);
  assert.match(css, /\.spot-picture-button/);
  assert.match(css, /@media\(max-width:640px\)\{[\s\S]*?\.spot-picture-grid\{grid-template-columns:1fr/);
});
