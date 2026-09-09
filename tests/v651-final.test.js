import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('모바일 교미 버튼은 하단 메뉴와 겹치지 않게 모달 영역과 터치 높이를 확보한다',async()=>{const css=await readFile(new URL('../public/styles.css',import.meta.url),'utf8');assert.match(css,/\.modal-root\s*\{[\s\S]*?inset:\s*0 0 calc\(72px \+ env\(safe-area-inset-bottom\)\) 0/);assert.match(css,/\.profile-actions > button\s*\{[\s\S]*?min-height:\s*48px/);});

test('과거 꾸미기 상점 UI와 구매 API 호출은 프론트에서 사라진다',async()=>{const app=await readFile(new URL('../public/app.js',import.meta.url),'utf8');assert.doesNotMatch(app,/꾸미기 상점|openStyleShop|buy-cosmetic|profile\/cosmetics\/buy|cosmeticClasses|cosmeticNameClass|cosmeticStatusClass/);});

test('주요 순위는 3열로 유지하고 닉네임 글씨를 크게 표시한다',async()=>{const css=await readFile(new URL('../public/styles.css',import.meta.url),'utf8');assert.match(css,/\.ranking-section \.game-rank-grid\s*\{\s*grid-template-columns:repeat\(3/);assert.match(css,/\.ranking-section \.rank-tabs-grid\s*\{\s*grid-template-columns:repeat\(3/);assert.match(css,/font-size:\s*\.88rem !important/);assert.match(css,/@media \(max-width: 520px\)[\s\S]*?font-size:\s*\.78rem !important/);});
