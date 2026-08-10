import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import {
  ACTIONS_PER_DAY,
  ACTION_COOLDOWN_MINUTES,
  BREAK_WARNING_MAX,
  BREAK_INACTIVITY_HOURS,
  BODY_STAGES,
  BUNG_MAX_PLAYERS,
  BUNG_MIN_PLAYERS,
  BUNG_MIN_STAKE,
  FISHING_PER_DAY,
  FISHING_REWARDS,
  FISHING_WAIT_MS,
  GAME_DAY_HOURS,
  GAME_DAY_RESET_HOURS_KST,
  HUNGER_PENALTY_POINTS_PER_HOUR,
  STATUS_MESSAGE_MAX_LENGTH,
  MINI_GAMES,
  MINI_GAMES_PER_DAY,
  STARTING_LEGO_POWER,
  STARTING_POINTS,
  ODD_EVEN_MIN_STAKE,
  ODD_EVEN_PAYOUT_PERCENT,
  ODD_EVEN_STAKE_STEP,
  TERRITORY_SIZE,
  TERRITORY_WIN_POINTS,
  TERRITORY_GOLDEN_REVEAL_HOURS_BEFORE_END,
  WORK_POINTS
} from '../src/game/constants.js';
import { LIAR_BET_OPTIONS, LIAR_GUESS_SECONDS, LIAR_PLAYER_OPTIONS, LIAR_RESULT_SECONDS, LIAR_REVOTE_SECONDS, LIAR_TOTAL_ROUNDS, LIAR_VOTING_SECONDS } from '../src/game/liar-game.js';
import { territoryLimitForLevel } from '../src/game/progression.js';

async function text(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

async function json(path) {
  return JSON.parse(await text(path));
}

test('Cloudflare Worker 설정은 현재 프로젝트 구조와 일치한다', async () => {
  const config = await json('wrangler.jsonc');
  assert.equal(config.name, 'legomeke');
  assert.equal(config.main, 'src/worker.js');
  assert.equal(config.workers_dev, true);
  assert.equal(config.assets.directory, './public');
  assert.equal(config.assets.binding, 'ASSETS');
  assert.deepEqual(config.assets.run_worker_first, ['/api/*', '/healthz']);
  assert.equal(config.durable_objects.bindings[0].name, 'GAME_ROOM');
  assert.equal(config.durable_objects.bindings[0].class_name, 'LegoGameRoom');
  assert.deepEqual(config.migrations[0].new_sqlite_classes, ['LegoGameRoom']);
});

test('패키지, Worker, 서비스워커 버전이 v6.4.8으로 통일되어 있다', async () => {
  const pkg = await json('package.json');
  const lock = await json('package-lock.json');
  const worker = await text('src/worker.js');
  const sw = await text('public/sw.js');
  assert.equal(pkg.version, '6.4.7');
  assert.equal(lock.version, '6.4.7');
  assert.equal(lock.packages[''].version, '6.4.7');
  assert.equal(pkg.engines.node, '>=22');
  assert.equal(pkg.scripts.verify, 'npm run check && npm test');
  assert.match(pkg.scripts.test, /territory\.test\.js/);
  assert.equal(pkg.scripts['deploy:cloudflare'], 'npm run verify && npx wrangler deploy');
  assert.match(worker, /6\.4\.7-final/);
  assert.match(sw, /lego-life-v648-final/);
});

test('몸집 이미지와 서비스워커 캐시는 28단계 레고형 체형의 실제 assetKey를 모두 포함한다', async () => {
  const sw = await text('public/sw.js');
  const assetKeys = [...new Set(BODY_STAGES.map((stage) => stage.assetKey || stage.key))];
  for (const assetKey of assetKeys) {
    await access(new URL(`../public/pets/${assetKey}.svg`, import.meta.url));
    assert.match(sw, new RegExp(`/pets/${assetKey}\\.svg`));
  }
  assert.equal(BODY_STAGES.length, 28);
  assert.equal(BODY_STAGES[9].label, '돼룩돼룩레고');
  assert.equal(BODY_STAGES[10].label, '왕돼룩레고');
  assert.equal(BODY_STAGES[21].label, '국가비상돼지레고');
  assert.equal(BODY_STAGES[22].label, '프로토케라톱스레고');
  assert.equal(BODY_STAGES.at(-1).label, '아르헨티노사우루스레고');
});
test('생활·포인트·레고 파손 최종 상수가 최신 요구사항과 일치한다', () => {
  assert.equal(GAME_DAY_HOURS, 6);
  assert.deepEqual(GAME_DAY_RESET_HOURS_KST, [0, 6, 12, 18]);
  assert.equal(ACTIONS_PER_DAY, 5);
  assert.equal(ACTION_COOLDOWN_MINUTES, 30);
  assert.equal(STARTING_POINTS, 0);
  assert.equal(STARTING_LEGO_POWER, 1);
  assert.equal(WORK_POINTS, 500);
  assert.equal(HUNGER_PENALTY_POINTS_PER_HOUR, 10);
  assert.equal(BREAK_WARNING_MAX, 3);
  assert.equal(BREAK_INACTIVITY_HOURS, 24 * 7);
  assert.equal(STATUS_MESSAGE_MAX_LENGTH, 20);
});

test('개인게임과 낚시 보상은 최종 포인트 규칙만 사용한다', () => {
  assert.deepEqual(Object.keys(MINI_GAMES), ['oddEven', 'reaction', 'number', 'apple']);
  assert.equal(MINI_GAMES_PER_DAY, 40);
  assert.equal(MINI_GAMES.number.maxAttempts, 5);
  assert.match(MINI_GAMES.number.description, /5번 안에/);
  assert.equal(FISHING_WAIT_MS, 30_000);
  assert.equal(FISHING_PER_DAY, 20);
  assert.deepEqual(FISHING_REWARDS.map((item) => item.reward), [0, 5, 10, 20, 50, 100, 200, 300, 500]);
  assert.equal(FISHING_REWARDS.reduce((sum, item) => sum + item.weight, 0), 100);
});

test('벙·라이어게임·영토전 최종 수치가 일치한다', () => {
  assert.equal(BUNG_MIN_STAKE, 500);
  assert.equal(BUNG_MIN_PLAYERS, 2);
  assert.equal(BUNG_MAX_PLAYERS, 30);
  assert.equal(LIAR_TOTAL_ROUNDS, 1);
  assert.deepEqual(LIAR_PLAYER_OPTIONS, [3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.deepEqual(LIAR_BET_OPTIONS, [10, 100, 500]);
  assert.equal(LIAR_VOTING_SECONDS, 20);
  assert.equal(LIAR_REVOTE_SECONDS, 20);
  assert.equal(LIAR_GUESS_SECONDS, 20);
  assert.equal(LIAR_RESULT_SECONDS, 20);
  assert.equal(TERRITORY_SIZE, 5);
  assert.equal(TERRITORY_WIN_POINTS, 300);
  assert.equal(ODD_EVEN_MIN_STAKE, 10);
  assert.equal(ODD_EVEN_STAKE_STEP, 10);
  assert.deepEqual(ODD_EVEN_PAYOUT_PERCENT, { 1: 130, 2: 160, 3: 200 });
  assert.equal(TERRITORY_GOLDEN_REVEAL_HOURS_BEFORE_END, 0);
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 20].map(territoryLimitForLevel), [1, 2, 3, 4, 4, 4, 4, 4, 4]);
});

test('최종 모바일 UI에는 확정 기능이 노출되고 과거 제거 기능은 다시 노출되지 않는다', async () => {
  const app = await text('public/app.js');
  const html = await text('public/index.html');
  const styles = await text('public/styles.css');

  for (const phrase of [
    '포인트 TOP 5', '레벨 TOP 5', '찌르기 TOP 5', '최근 10개',
    '오늘의 레고력', '낚시 보상 보기',
    '라이어게임', '레고 영토전', '벙 열기',
    '교미 신청', '운영자 관리', '레고 체형 도감', '상태메시지', '파손 경고'
  ]) assert.match(app, new RegExp(phrase));

  assert.match(app, /name="guess" type="number"[^>]*placeholder="숫자를 입력하세요"/);
  assert.match(app, /id="odd-even-bet-form"/);
  assert.match(app, /const rules = app\.data\?\.catalog\?\.oddEven/);
  assert.match(app, /name="stakePoints" type="number"[^>]*min="\$\{minStake\}"[^>]*max="\$\{maxStake\}"[^>]*step="\$\{stakeStep\}"/);
  assert.match(app, /1연승은 원금\+30%\(1\.3배\), 2연승은 원금\+60%\(1\.6배\), 3연승은 원금\+100%\(2배\)/);
  assert.match(app, /1라운드 · 포인트 배팅/);
  assert.match(app, /현재 게임 중입니다/);
  assert.match(app, /관전하기/);
  assert.match(app, /오목게임/);
  assert.match(app, /사과게임/);
  assert.match(app, /id="liar-max-players"/);
  assert.match(app, /liarPlayerOptions/);
  assert.match(app, /toastDuration: \['reaction', 'number'\]\.includes\(idValue\) \? 700 : 3400/);
  assert.match(app, /data-action=\"claim-territory-direct\"/);
  assert.match(app, /function territoryOwnerColor/);
  assert.match(app, /data-action=\"accept-mating\"/);
  assert.match(app, /data-action=\"reject-mating\"/);
  assert.match(app, /data-action=\"restart-broken\"/);
  assert.doesNotMatch(app, /territoryMoveSource|selectedTerritory|생활위기|파산/);
  assert.match(app, /주변 8칸/);
  assert.match(app, /본진/);
  assert.match(app, /지난 벙 보기/);
  assert.match(app, /카테고리/);
  assert.match(styles, /toast\.game-start/);
  assert.match(styles, /liar-keyboard-open/);
  assert.match(styles, /--visual-viewport-height/);
  assert.match(app, /challenge\.maxAttempts \|\| 5/);
  assert.doesNotMatch(app, /challenge\.maxAttempts \|\| 7/);
  assert.match(app, /Lv\.\$\{pet\.levelProgress\.level \+ 1\}까지 \$\{Math\.max\(0, pet\.levelProgress\.nextAt - pet\.levelProgress\.totalPower\)\} 레고력 남음/);
  assert.match(app, /daily-goals-compact/);
  assert.match(styles, /\.daily-goals-compact \.goal-list/);
  assert.match(styles, /\.odd-even-preview/);
  assert.doesNotMatch(app, /name="guess"[^>]*value="50"/);
  assert.match(app, /loadBootstrap\(\{ silent: true \}\)/);
  assert.match(app, /data-action=\"resume-mini\"/);
  assert.match(app, /진행 중[\s\S]*?이어하기/);
  assert.match(styles, /\.active-game-banner/);
  assert.match(styles, /\.chat-message\.mine/);
  assert.match(styles, /\.chat-message\.mine \.chat-message-head[^}]*justify-content:\s*flex-end/s);
  assert.match(html, /data-tab="territory"/);
  assert.match(html, /data-tab="social"/);
  assert.match(html, /data-tab="records"/);

  const removedUiWords = [
    '호감표현', '고백하기', '연락하기', '새끼레고', '임신', '출산',
    '비벙', '벙 채팅', '소문 듣기', '소문 내기', '선물 상점',
    '대출', '상환', '월급', '구직', '기분', '평판'
  ];
  for (const phrase of removedUiWords) {
    assert.doesNotMatch(app, new RegExp(phrase));
    assert.doesNotMatch(html, new RegExp(phrase));
  }
});

test('과거에 제거한 게임 기능 API와 런타임 로직은 다시 생기지 않는다', async () => {
  const worker = await text('src/worker.js');
  const constants = await text('src/game/constants.js');
  const removedRoutes = [
    '/api/finance/borrow', '/api/finance/repay', '/api/shop/buy-gift',
    '/api/rumors/listen', '/api/bungs/:bungId/rumors',
    '/api/bungs/:bungId/chat', '/api/bungs/:bungId/interact',
    '/api/actions/find-job', '/api/actions/solo-bung'
  ];
  for (const route of removedRoutes) assert.doesNotMatch(worker, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(constants, /GIFTS|BUNG_TYPES|INTERACTIONS|BANKRUPTCY_DEBT/);
  assert.doesNotMatch(worker, /adminActiveRumors|adminBungChats|state\.rumors/);
});

test('삭제된 과거 필드는 마이그레이션에서만 정리되고 현재 상태에는 다시 생성되지 않는다', async () => {
  const engine = await text('src/game/engine.js');
  const store = await text('src/durable-store.js');
  assert.match(store, /meta:\s*\{\s*version:\s*17/);
  assert.match(store, /delete state\.rumors/);
  assert.match(store, /delete state\.offspring/);
  assert.match(engine, /delete pet\.stats\[key\]/);
  assert.match(engine, /oldStats\.charm/); // 기존 매력도는 레고력으로 1회 안전 이관
  assert.doesNotMatch(engine, /export function (borrowMoney|repayDebt|buyGift|listenRumor|createUserRumor|spreadRumor|addBungChat|bungInteraction)/);
});

test('소식은 최근 10개로 제한되고 알람 예약은 유효한 미래 시각만 사용한다', async () => {
  const worker = await text('src/worker.js');
  const store = await text('src/durable-store.js');
  const engine = await text('src/game/engine.js');
  assert.match(store, /publicEvents[\s\S]*?slice\(0, 10\)/);
  assert.match(engine, /state\.publicEvents = state\.publicEvents\.slice\(0, 10\)/);
  assert.match(worker, /candidates\.filter\(\(value\) => Number\.isFinite\(value\) && value > 0\)/);
  assert.match(worker, /Math\.max\(Math\.min\(\.\.\.valid\), Date\.now\(\) \+ 1_000\)/);
  assert.match(worker, /deleteAlarm/);
});


test('모바일 재접속과 터치 UI 방어 코드가 포함되어 있다', async () => {
  const app = await text('public/app.js');
  const styles = await text('public/styles.css');
  const html = await text('public/index.html');
  const worker = await text('src/worker.js');
  const store = await text('src/durable-store.js');

  assert.match(html, /viewport-fit=cover/);
  assert.match(app, /function applyBootstrap\(next\)/);
  assert.match(app, /revision < app\.revision/);
  assert.match(app, /bootstrapController\?\.abort\(\)/);
  assert.match(app, /visibilitychange/);
  assert.match(app, /event\.persisted/);
  assert.match(styles, /\.brand-button \{ min-height: 40px/);
  assert.match(styles, /\.rank-row > button \{[^}]*min-height: 36px/s);
  assert.match(styles, /\.territory-cell \{[^}]*width: 100%;[^}]*aspect-ratio: 1/s);
  assert.match(worker, /runExclusive\(task\)/);
  assert.match(worker, /this\.runExclusive\(\(\) => this\.handleFetch\(request\)\)/);
  assert.match(store, /state\.meta\.revision = [^;]+ \+ 1/);
});
