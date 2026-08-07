export const GAME_DAY_HOURS = 6;
export const ACTIONS_PER_DAY = 5;
export const ACTION_COOLDOWN_MINUTES = 30;
export const MINI_GAMES_PER_DAY = 30;
export const FISHING_PER_DAY = 20;
export const FISHING_WAIT_MS = 30_000;
export const STATUS_MESSAGE_MAX_LENGTH = 20;

export const STARTING_POINTS = 0;
export const STARTING_STAMINA = 100;
export const STARTING_HUNGER = 100;
export const STARTING_BODY = 70;
export const STARTING_LEGO_POWER = 1;
export const WORK_POINTS = 500;
export const HUNGER_PENALTY_POINTS_PER_HOUR = 10;
export const BREAK_WARNING_MAX = 3;
export const BREAK_PATTERN_DAYS = 2;
export const BREAK_RECOVERY_DAYS = 2;
export const BREAK_OVER_EAT_COUNT = 5;
export const BREAK_WORK_MIN_ACTIONS = 4;
export const BREAK_WORK_RATIO = 0.8;
export const BREAK_BUNG_COUNT = 4;
export const BREAK_BUNG_OTHER_MAX = 1;
export const BREAK_REPEAT_MIN_TOTAL = 5;
export const BREAK_REPEAT_RATIO = 0.8;
export const BREAK_INACTIVITY_HOURS = 24 * 7;

export const BUNG_MIN_STAKE = 500;
export const BUNG_MIN_PLAYERS = 2;
export const BUNG_MAX_PLAYERS = 30;

export const TERRITORY_SIZE = 4;
export const TERRITORY_WIN_POINTS = 300;
export const TERRITORY_GOLDEN_REVEAL_HOURS_BEFORE_END = 2;

export const ODD_EVEN_MIN_STAKE = 10;
export const ODD_EVEN_STAKE_STEP = 10;
export const ODD_EVEN_PAYOUT_PERCENT = Object.freeze({ 1: 130, 2: 160, 3: 200 });

export const BODY_STAGES = [
  { min: 60, max: 69, key: 'skinny', label: '마름레고', activityHungerCost: 1 },
  { min: 70, max: 79, key: 'normal', label: '보통레고', activityHungerCost: 1 },
  { min: 80, max: 89, key: 'jjap', label: '짭덥레고', activityHungerCost: 1 },
  { min: 90, max: 99, key: 'chubby', label: '통통레고', activityHungerCost: 1 },
  { min: 100, max: 109, key: 'tteop', label: '떱레고', activityHungerCost: 2 },
  { min: 110, max: 119, key: 'real-tteop', label: '리얼떱레고', activityHungerCost: 2 },
  { min: 120, max: 129, key: 'pig', label: '돼지레고', activityHungerCost: 2 },
  { min: 130, max: 159, key: 'elephant', label: '코끼리레고', activityHungerCost: 3 },
  { min: 160, max: 199, key: 'mammoth', label: '맘모스레고', activityHungerCost: 4 },
  { min: 200, max: Infinity, key: 'daeruk', label: '돼룩돼룩레고', activityHungerCost: 4 }
];

export const FOODS = {
  triangle: {
    id: 'triangle',
    name: '삼각김밥',
    price: 20,
    hunger: 18,
    body: 1,
    description: '가볍게 배고픔을 채웁니다.'
  },
  ramen: {
    id: 'ramen',
    name: '컵라면',
    price: 30,
    hunger: 24,
    body: 2,
    description: '저렴하고 든든한 한 끼입니다.'
  },
  tteokbokki: {
    id: 'tteokbokki',
    name: '떡볶이',
    price: 60,
    hunger: 30,
    body: 4,
    description: '배고픔을 크게 채우고 몸집도 늘어납니다.'
  },
  cake: {
    id: 'cake',
    name: '케이크',
    price: 90,
    hunger: 22,
    body: 5,
    description: '달콤하지만 몸집이 제법 늘어납니다.'
  },
  mala: {
    id: 'mala',
    name: '마라탕',
    price: 150,
    hunger: 42,
    body: 8,
    description: '배고픔을 많이 채우는 묵직한 음식입니다.'
  },
  chicken: {
    id: 'chicken',
    name: '치킨',
    price: 180,
    hunger: 45,
    body: 7,
    description: '든든하지만 몸집도 크게 늘어납니다.'
  },
  buffet: {
    id: 'buffet',
    name: '뷔페',
    price: 320,
    hunger: 70,
    body: 13,
    description: '비싸지만 배고픔을 가장 크게 채웁니다.'
  }
};

export const MINI_GAMES = {
  oddEven: {
    id: 'oddEven',
    name: '홀짝 배팅',
    description: '원하는 포인트를 직접 걸고 최대 3연승에 도전합니다.',
    rewardType: 'points'
  },
  reaction: {
    id: 'reaction',
    name: '번개 반응',
    description: '신호가 뜬 뒤 빠르게 눌러 포인트를 얻습니다.',
    rewardType: 'points'
  },
  number: {
    id: 'number',
    name: '숫자 맞히기',
    description: '업·다운 힌트로 1~100 숫자를 5번 안에 맞힙니다.',
    rewardType: 'points',
    maxAttempts: 5
  },
  apple: {
    id: 'apple',
    name: '사과게임',
    description: '난이도 중간 · 2분 동안 10×10 숫자판에서 합이 10인 사각형을 찾아 제거합니다.',
    rewardType: 'points'
  }
};

export const FISHING_REWARDS = [
  { id: 'lighter', label: '라이터', weight: 15, reward: 0 },
  { id: 'card', label: '레고명함', weight: 10, reward: 5 },
  { id: 'seaweed', label: '미역줄기', weight: 20, reward: 10 },
  { id: 'snackRamen', label: '스낵면', weight: 20, reward: 20 },
  { id: 'banquetNoodles', label: '잔치국수', weight: 15, reward: 50 },
  { id: 'spicyGalbi', label: '매운갈비찜', weight: 10, reward: 100 },
  { id: 'pepperoniPizza', label: '페퍼로니피자', weight: 7, reward: 200 },
  { id: 'carbonaraChicken', label: '까르보치킨', weight: 2, reward: 300 },
  { id: 'banquetTrio', label: '잔치집 삼합', weight: 1, reward: 500 }
];
