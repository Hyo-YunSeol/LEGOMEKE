export const GAME_DAY_HOURS = 6;
export const GAME_DAY_RESET_HOURS_KST = Object.freeze([0, 6, 12, 18]);
export const ACTIONS_PER_DAY = 5;
export const ACTION_COOLDOWN_MINUTES = 30;
export const MINI_GAMES_PER_DAY = 40;
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
// 황금 영토는 진행 중에는 절대 공개하지 않고 시즌 정산이 끝난 뒤 결과에서만 공개한다.
// 기존 설정/테스트 호환을 위해 상수는 유지하되 0시간(종료 시점)으로 둔다.
export const TERRITORY_GOLDEN_REVEAL_HOURS_BEFORE_END = 0;

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
  { min: 200, max: 239, key: 'daeruk', label: '돼룩돼룩레고', activityHungerCost: 4 },

  { min: 240, max: 299, key: 'king-daeruk', assetKey: 'pig-king-daeruk', label: '왕돼룩레고', activityHungerCost: 5 },
  { min: 300, max: 379, key: 'great-daeruk', assetKey: 'pig-great-daeruk', label: '대왕돼룩레고', activityHungerCost: 5 },
  { min: 380, max: 479, key: 'ultra-daeruk', assetKey: 'pig-ultra-daeruk', label: '초돼룩레고', activityHungerCost: 5 },
  { min: 480, max: 599, key: 'king-oink', assetKey: 'pig-king-oink', label: '왕꿀꿀레고', activityHungerCost: 5 },
  { min: 600, max: 739, key: 'pok-pig', assetKey: 'pig-pok', label: '폭돼레고', activityHungerCost: 5 },
  { min: 740, max: 899, key: 'pig-king', assetKey: 'pig-king', label: '돼왕레고', activityHungerCost: 5 },
  { min: 900, max: 1079, key: 'pig-emperor', assetKey: 'pig-emperor', label: '돼황레고', activityHungerCost: 5 },
  { min: 1080, max: 1279, key: 'monster-pig', assetKey: 'pig-monster', label: '괴수돼지레고', activityHungerCost: 6 },
  { min: 1280, max: 1499, key: 'overloaded-pig', assetKey: 'pig-overloaded', label: '과적돼지레고', activityHungerCost: 6 },
  { min: 1500, max: 1749, key: 'bedbreaker-pig', assetKey: 'pig-bedbreaker', label: '침대파괴돼지레고', activityHungerCost: 7 },
  { min: 1750, max: 2029, key: 'disaster-text-pig', assetKey: 'pig-disaster-text', label: '재난문자돼지레고', activityHungerCost: 7 },
  { min: 2030, max: 2339, key: 'national-emergency-pig', assetKey: 'pig-national-emergency', label: '국가비상돼지레고', activityHungerCost: 7 },

  { min: 2340, max: 2689, key: 'protoceratops', assetKey: 'lego-protoceratops', label: '프로토케라톱스레고', activityHungerCost: 8 },
  { min: 2690, max: 3079, key: 'triceratops', assetKey: 'lego-triceratops', label: '트리케라톱스레고', activityHungerCost: 8 },
  { min: 3080, max: 3509, key: 'stegosaurus', assetKey: 'lego-stegosaurus', label: '스테고사우루스레고', activityHungerCost: 9 },
  { min: 3510, max: 3989, key: 'brachiosaurus', assetKey: 'lego-brachiosaurus', label: '브라키오사우루스레고', activityHungerCost: 9 },
  { min: 3990, max: 4519, key: 'patagotitan', assetKey: 'lego-patagotitan', label: '파타고티탄레고', activityHungerCost: 10 },
  { min: 4520, max: Infinity, key: 'argentinosaurus', assetKey: 'lego-argentinosaurus', label: '아르헨티노사우루스레고', activityHungerCost: 10 }
];

export const FOODS = {
  triangle: {
    id: 'triangle', name: '삼각김밥', price: 20, hunger: 18, body: 1,
    description: '가볍게 배고픔을 채웁니다.'
  },
  ramen: {
    id: 'ramen', name: '컵라면', price: 30, hunger: 24, body: 2,
    description: '저렴하고 든든한 한 끼입니다.'
  },
  tteokbokki: {
    id: 'tteokbokki', name: '떡볶이', price: 60, hunger: 30, body: 4,
    description: '배고픔을 크게 채우고 몸집도 늘어납니다.'
  },
  cake: {
    id: 'cake', name: '케이크', price: 90, hunger: 22, body: 5,
    description: '달콤하지만 몸집이 제법 늘어납니다.'
  },
  mala: {
    id: 'mala', name: '마라탕', price: 150, hunger: 42, body: 8,
    description: '배고픔을 많이 채우는 묵직한 음식입니다.'
  },
  chicken: {
    id: 'chicken', name: '치킨', price: 180, hunger: 45, body: 7,
    description: '든든하지만 몸집도 크게 늘어납니다.'
  },
  buffet: {
    id: 'buffet', name: '뷔페', price: 320, hunger: 70, body: 13,
    description: '비싸지만 배고픔을 가장 크게 채웁니다.'
  },
  jokbalLarge: {
    id: 'jokbalLarge', name: '족발 대짜', price: 420, hunger: 80, body: 14, minBody: 200,
    description: '돼룩돼룩레고부터 먹을 수 있는 대용량 한 상입니다.'
  },
  buffetSweep: {
    id: 'buffetSweep', name: '뷔페 털기', price: 650, hunger: 95, body: 22, minBody: 1750,
    description: '재난문자돼지레고부터 가능한 본격적인 대식입니다.'
  },
  dinoFeed: {
    id: 'dinoFeed', name: '공룡사료 포대', price: 900, hunger: 100, body: 32, minBody: 2340,
    description: '공룡 단계 전용. 포대째 먹고 배고픔을 가득 채웁니다.'
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
