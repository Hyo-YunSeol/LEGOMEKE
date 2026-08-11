export const GAME_DAY_HOURS = 6;
export const GAME_DAY_RESET_HOURS_KST = Object.freeze([0, 6, 12, 18]);
export const ACTIONS_PER_DAY = 5;
export const ACTION_COOLDOWN_MINUTES = 30;
export const MINI_GAMES_PER_DAY = 40;
export const FISHING_PER_DAY = 20;
export const FISHING_WAIT_MS = 30_000;
export const STATUS_MESSAGE_MAX_LENGTH = 20;
export const REACTION_MIN_VALID_MS = 100;
export const REACTION_CLOCK_TOLERANCE_MS = 120;
export const REACTION_MAX_NETWORK_GAP_MS = 2_500;

export const STARTING_POINTS = 0;
export const STARTING_STAMINA = 100;
export const STARTING_HUNGER = 100;
export const STARTING_BODY = 70;
export const STARTING_LEGO_POWER = 1;
export const WORK_POINTS = 500;
export const HUNGER_PENALTY_POINTS_PER_HOUR = 10;
export const BUNG_MIN_STAKE = 500;
export const BUNG_MIN_PLAYERS = 2;
export const BUNG_MAX_PLAYERS = 30;

export const TERRITORY_SIZE = 5;
export const TERRITORY_STEAL_COST = 50;
export const TERRITORY_WIN_POINTS = 500;
// 황금 영토는 진행 중에는 절대 공개하지 않고 시즌 정산이 끝난 뒤 결과에서만 공개한다.
// 기존 설정/테스트 호환을 위해 상수는 유지하되 0시간(종료 시점)으로 둔다.
export const TERRITORY_GOLDEN_REVEAL_HOURS_BEFORE_END = 0;

export const ODD_EVEN_MIN_STAKE = 10;
export const ODD_EVEN_STAKE_STEP = 10;
export const ODD_EVEN_PAYOUT_PERCENT = Object.freeze({ 1: 130, 2: 160, 3: 200 });

export const BODY_STAGES = [
  { min: 60, max: 69, key: 'skinny', label: '마름레고', activityHungerCost: 1 },
  { min: 70, max: 79, key: 'normal', label: '보통레고', activityHungerCost: 1 },
  { min: 80, max: 89, key: 'yukdeok', assetKey: 'yukdeok', label: '육덕레고', activityHungerCost: 1 },
  { min: 90, max: 99, key: 'jjap', label: '짭덥레고', activityHungerCost: 1 },
  { min: 100, max: 109, key: 'myeol-tteop', assetKey: 'myeol-tteop', label: '멸떱레고', activityHungerCost: 2 },
  { min: 110, max: 119, key: 'chubby', label: '통통레고', activityHungerCost: 2 },
  { min: 120, max: 129, key: 'bi-tteop', assetKey: 'bi-tteop', label: '비떱레고', activityHungerCost: 2 },
  { min: 130, max: 159, key: 'fat', assetKey: 'fat', label: '뚱뚱레고', activityHungerCost: 2 },
  { min: 160, max: 199, key: 'three-digit', assetKey: 'three-digit', label: '세자리레고', activityHungerCost: 2 },
  { min: 200, max: 239, key: 'big-big-woman', assetKey: 'big-big-woman', label: '빅빅우먼레고', activityHungerCost: 3 },
  { min: 240, max: 299, key: 'royal-bi-tteop', assetKey: 'royal-bi-tteop', label: '로얄비떱레고', activityHungerCost: 3 },
  { min: 300, max: 379, key: 'hippo', assetKey: 'hippo', label: '하마레고', activityHungerCost: 3 },
  { min: 380, max: 479, key: 'elephant', label: '코끼리레고', activityHungerCost: 3 },
  { min: 480, max: 599, key: 'mammoth', label: '맘모스레고', activityHungerCost: 3 },
  { min: 600, max: 739, key: 'wild-boar', assetKey: 'wild-boar', label: '매태지레고', activityHungerCost: 3 },
  { min: 740, max: 899, key: 'daeruk', label: '돼룩돼룩레고', activityHungerCost: 4 },
  { min: 900, max: 1079, key: 'ultra-daeruk', assetKey: 'pig-ultra-daeruk', label: '초대룩레고', activityHungerCost: 4 },
  { min: 1080, max: 1279, key: 'pig-emperor', assetKey: 'pig-emperor', label: '돼황레고', activityHungerCost: 4 },
  { min: 1280, max: 1499, key: 'monster-pig', assetKey: 'pig-monster', label: '괴수돼지레고', activityHungerCost: 4 },
  { min: 1500, max: 1749, key: 'bedbreaker-pig', assetKey: 'pig-bedbreaker', label: '침대파괴돼지레고', activityHungerCost: 4 },
  { min: 1750, max: 2029, key: 'disaster-text-pig', assetKey: 'pig-disaster-text', label: '재난문자돼지레고', activityHungerCost: 4 },
  { min: 2030, max: 2339, key: 'national-emergency-pig', assetKey: 'pig-national-emergency', label: '국가비상돼지레고', activityHungerCost: 4 },
  { min: 2340, max: 2689, key: 'protoceratops', assetKey: 'lego-protoceratops', label: '프로토케라톱스레고', activityHungerCost: 5 },
  { min: 2690, max: 3079, key: 'triceratops', assetKey: 'lego-triceratops', label: '트리케라톱스레고', activityHungerCost: 5 },
  { min: 3080, max: 3509, key: 'stegosaurus', assetKey: 'lego-stegosaurus', label: '스테고사우루스레고', activityHungerCost: 5 },
  { min: 3510, max: 3989, key: 'brachiosaurus', assetKey: 'lego-brachiosaurus', label: '브라키오사우루스레고', activityHungerCost: 5 },
  { min: 3990, max: 4519, key: 'patagotitan', assetKey: 'lego-patagotitan', label: '파타고티탄레고', activityHungerCost: 6 },
  { min: 4520, max: Infinity, key: 'argentinosaurus', assetKey: 'lego-argentinosaurus', label: '아르헨티노사우루스레고', activityHungerCost: 6 }
];

const food = (id, name, category, tier, price, hunger, body, description) => Object.freeze({
  id, name, category, tier, minLevel: tier, price, hunger, body, description
});

// 음식은 레벨별 한 줄에 살찌는/유지/다이어트 순서로 노출한다.
// 일하기 1회 500P와 넓어지는 후반 체형 간격을 기준으로 가격과 몸집 효과를 완만하게 키운다.
export const FOODS = Object.freeze({
  triangle: food('triangle', '삼각김밥', 'gain', 1, 20, 20, 2, '저렴하게 배를 채우고 몸집을 조금 늘립니다.'),
  boiledEgg: food('boiledEgg', '삶은계란', 'maintain', 1, 25, 16, 0, '몸집 변화 없이 가볍게 먹습니다.'),
  cucumber: food('cucumber', '오이', 'diet', 1, 30, 12, -2, '가볍게 배를 채우며 몸집을 줄입니다.'),

  ramen: food('ramen', '컵라면', 'gain', 2, 40, 28, 3, '든든하게 먹고 몸집을 늘립니다.'),
  homeMeal: food('homeMeal', '집밥', 'maintain', 2, 50, 24, 0, '균형 있게 먹어 몸집을 유지합니다.'),
  tomato: food('tomato', '토마토', 'diet', 2, 60, 20, -3, '산뜻하게 먹고 몸집을 조금 줄입니다.'),

  tteokbokki: food('tteokbokki', '떡볶이', 'gain', 3, 70, 36, 5, '매콤하게 먹고 몸집을 키웁니다.'),
  sandwich: food('sandwich', '샌드위치', 'maintain', 3, 90, 32, 0, '적당히 든든하게 몸집을 유지합니다.'),
  sweetPotato: food('sweetPotato', '고구마', 'diet', 3, 110, 28, -5, '포만감을 채우고 몸집을 줄입니다.'),

  chicken: food('chicken', '치킨', 'gain', 4, 120, 48, 7, '든든하게 먹고 몸집을 크게 늘립니다.'),
  sushi: food('sushi', '초밥', 'maintain', 4, 150, 44, 0, '배고픔을 채우며 몸집을 유지합니다.'),
  salad: food('salad', '샐러드', 'diet', 4, 180, 40, -7, '신선하게 먹고 몸집을 줄입니다.'),

  hamburger: food('hamburger', '햄버거', 'gain', 5, 200, 60, 10, '한 끼를 꽉 채우고 몸집을 늘립니다.'),
  shabu: food('shabu', '샤브샤브', 'maintain', 5, 240, 56, 0, '푸짐하지만 몸집 변화는 없습니다.'),
  corn: food('corn', '옥수수', 'diet', 5, 290, 50, -10, '든든하게 먹고 몸집을 10 줄입니다.'),

  cake: food('cake', '케이크', 'gain', 6, 320, 72, 14, '달콤하게 배를 채우고 몸집을 키웁니다.'),
  lunchbox: food('lunchbox', '도시락', 'maintain', 6, 380, 68, 0, '알찬 한 끼로 몸집을 유지합니다.'),
  banana: food('banana', '바나나', 'diet', 6, 450, 62, -14, '포만감을 채우며 몸집을 크게 줄입니다.'),

  mala: food('mala', '마라탕', 'gain', 7, 500, 88, 20, '아주 든든하게 먹고 몸집을 크게 늘립니다.'),
  steak: food('steak', '스테이크', 'maintain', 7, 580, 84, 0, '고급 한 끼로 몸집을 그대로 유지합니다.'),
  chickenBreast: food('chickenBreast', '닭가슴살', 'diet', 7, 680, 76, -20, '배고픔을 충분히 채우고 몸집을 크게 줄입니다.'),

  jokbalLarge: food('jokbalLarge', '족발 대짜', 'gain', 8, 750, 100, 30, '배고픔을 가득 채우고 몸집을 대폭 늘립니다.'),
  poke: food('poke', '포케', 'maintain', 8, 850, 96, 0, '배고픔을 거의 가득 채우며 몸집을 유지합니다.'),
  dietLunchbox: food('dietLunchbox', '다이어트 도시락', 'diet', 8, 1000, 90, -30, '배고픔을 크게 채우면서 몸집을 대폭 줄입니다.')
});

export const SHOP_ITEMS = Object.freeze({
  miniGame10: Object.freeze({ id: 'miniGame10', icon: '🎮', name: '미니게임 +10회권', price: 1000, description: '구매할 때마다 이번 게임 하루의 개인게임 한도를 10회 늘립니다.' }),
  fishing5: Object.freeze({ id: 'fishing5', icon: '🎣', name: '낚시 +5회권', price: 300, description: '구매할 때마다 이번 게임 하루의 낚시 한도를 5회 늘립니다.' }),
  nickname24h: Object.freeze({ id: 'nickname24h', icon: '🪪', name: '24시간 닉변권', price: 500, description: '24시간 동안 임시 닉네임을 사용하고 만료 후 자동 복귀합니다.' }),
  lottery: Object.freeze({ id: 'lottery', icon: '🍀', name: '하루 복권', price: 100, retryPrice: 500, maxPlays: 3, description: '하루 3회. 첫 도전 100P, 2·3회차 500P. 최대 5,000P가 나옵니다.' }),
  staminaHour: Object.freeze({ id: 'staminaHour', icon: '🔋', name: '체력 1시간 100% 유지권', price: 500, description: '즉시 체력 100%. 1시간 동안 감소하지 않습니다.' }),
  hungerHour: Object.freeze({ id: 'hungerHour', icon: '🍖', name: '배고픔 1시간 100% 유지권', price: 700, description: '즉시 배고픔 100%. 1시간 동안 감소하지 않습니다.' })
});

const flexItem = (id, name, price, tier, assetKey, description) => Object.freeze({
  id, name, price, tier, assetKey, description, durationHours: 24
});

// 능력치 효과 없이 24시간 동안 다른 주민에게 보이는 장착 아이템이다.
export const FLEX_ITEMS = Object.freeze({
  americano: flexItem('americano', '아이스 아메리카노', 500, 1, 'americano', '레고 옆에 시원한 테이크아웃 커피를 장착합니다.'),
  bouquet: flexItem('bouquet', '장미꽃다발', 500, 1, 'bouquet', '레고 옆에 포장된 장미꽃다발을 장착합니다.'),
  moneyBundle: flexItem('moneyBundle', '돈다발', 1000, 2, 'money-bundle', '레고 옆에 두툼한 돈다발을 장착합니다.'),
  luxuryBag: flexItem('luxuryBag', '명품 쇼핑백', 1000, 2, 'luxury-bag', '레고 옆에 고급 쇼핑백을 장착합니다.'),
  goldBars: flexItem('goldBars', '골드바', 1500, 3, 'gold-bars', '레고 옆에 반짝이는 금괴를 장착하고 전용 이름표를 적용합니다.'),
  blackCard: flexItem('blackCard', '블랙카드', 1500, 3, 'black-card', '레고 옆에 블랙카드를 장착하고 전용 이름표를 적용합니다.'),
  diamond: flexItem('diamond', '다이아몬드', 2000, 4, 'diamond', '레고 옆에 보석 케이스를 장착하고 다이아 이름표를 적용합니다.'),
  goldenCrown: flexItem('goldenCrown', '황금 왕관', 2000, 4, 'golden-crown', '레고에게 황금 왕관과 전용 금색 이름표를 적용합니다.')
});

// 기대 지급액은 144P다. 첫 도전은 가볍게 즐길 수 있고 500P 재도전은 포인트 회수 역할을 한다.
export const LOTTERY_REWARDS = Object.freeze([
  Object.freeze({ points: 0, weight: 380 }),
  Object.freeze({ points: 50, weight: 240 }),
  Object.freeze({ points: 100, weight: 180 }),
  Object.freeze({ points: 200, weight: 100 }),
  Object.freeze({ points: 500, weight: 60 }),
  Object.freeze({ points: 1000, weight: 30 }),
  Object.freeze({ points: 3000, weight: 8 }),
  Object.freeze({ points: 5000, weight: 2 })
]);

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
  },
  block: {
    id: 'block',
    name: '블록게임',
    description: '난이도 쉬움 · 같은 색 블록 2개 이상을 눌러 끝까지 제거합니다.',
    rewardType: 'points'
  }
};

export const FISHING_REWARDS = [
  { id: 'lighter', label: '꽁초', weight: 15, reward: 0 },
  { id: 'card', label: '비떱명함', weight: 10, reward: 5 },
  { id: 'seaweed', label: '미역줄기', weight: 20, reward: 10 },
  { id: 'snackRamen', label: '스낵면', weight: 20, reward: 20 },
  { id: 'banquetNoodles', label: '잔치국수', weight: 15, reward: 50 },
  { id: 'spicyGalbi', label: '매운갈비찜', weight: 10, reward: 100 },
  { id: 'pepperoniPizza', label: '치즈돈가스', weight: 7, reward: 200 },
  { id: 'carbonaraChicken', label: '까르보치킨', weight: 2, reward: 300 },
  { id: 'banquetTrio', label: '잔치집 생굴', weight: 1, reward: 500 }
];
