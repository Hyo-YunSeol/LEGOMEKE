export const GAME_DAY_HOURS = 6;
export const GAME_DAY_RESET_HOURS_KST = Object.freeze([0, 6, 12, 18]);
export const ACTIONS_PER_DAY = 5;
export const ACTION_COOLDOWN_MINUTES = 30;
export const MINI_GAMES_PER_DAY = 40;
export const SINGLE_TETRIS_DURATION_MS = 2 * 60_000;
export const FISHING_PER_DAY = 20;
export const FISHING_WAIT_MS = 30_000;
export const STATUS_MESSAGE_MAX_LENGTH = 20;
export const STATUS_MESSAGE_ADMIN_MAX_LENGTH = 50;
export const LOUDSPEAKER_MAX_LENGTH = 30;
export const LOUDSPEAKER_DURATION_SECONDS = 10;
export const REACTION_MIN_VALID_MS = 100;
export const REACTION_CLOCK_TOLERANCE_MS = 120;

export const STARTING_POINTS = 0;
export const STARTING_STAMINA = 100;
export const STARTING_HUNGER = 100;
export const STARTING_BODY = 70;
export const STARTING_LEGO_POWER = 1;
export const WORK_POINTS = 500;
export const HUNGER_PENALTY_POINTS_PER_HOUR = 50;
export const HUNGER_PENALTY_MAX_HOURS = 6;
export const BUNG_MIN_STAKE = 500;
export const BUNG_MIN_PLAYERS = 2;
export const BUNG_MAX_PLAYERS = 30;

export const TERRITORY_SIZE = 5;
export const TERRITORY_STEAL_COST = 50;
export const TERRITORY_WIN_POINTS = 5_000;
// 황금 영토는 진행 중에는 절대 공개하지 않고 시즌 정산이 끝난 뒤 결과에서만 공개한다.
// 기존 설정/테스트 호환을 위해 상수는 유지하되 0시간(종료 시점)으로 둔다.
export const TERRITORY_GOLDEN_REVEAL_HOURS_BEFORE_END = 0;

export const ODD_EVEN_MIN_STAKE = 10;
export const ODD_EVEN_STAKE_STEP = 10;
export const ODD_EVEN_PAYOUT_PERCENT = Object.freeze({ 1: 150, 2: 250, 3: 400 });

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
  { min: 4520, max: 5099, key: 'argentinosaurus', assetKey: 'lego-argentinosaurus', label: '아르헨티노사우루스레고', activityHungerCost: 6 },
  { min: 5100, max: 5729, key: 'blue-whale', assetKey: 'lego-blue-whale', label: '대왕고래레고', activityHungerCost: 6 },
  { min: 5730, max: 6409, key: 'ultra-whale', assetKey: 'lego-ultra-whale', label: '초거대고래레고', activityHungerCost: 6 },
  { min: 6410, max: 7139, key: 'abyss-monster', assetKey: 'lego-abyss-monster', label: '심해괴수레고', activityHungerCost: 6 },
  { min: 7140, max: 7919, key: 'kraken', assetKey: 'lego-kraken', label: '크라켄레고', activityHungerCost: 7 },
  { min: 7920, max: 8749, key: 'deep-sea-disaster', assetKey: 'lego-deep-sea-disaster', label: '심해재난레고', activityHungerCost: 7 },
  { min: 8750, max: Infinity, key: 'leviathan', assetKey: 'lego-leviathan', label: '레비아탄레고', activityHungerCost: 7 }
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
  sushi: food('sushi', '초밥', 'maintain', 4, 150, 44, 0, '포만감을 채우며 몸집을 유지합니다.'),
  salad: food('salad', '샐러드', 'diet', 4, 180, 40, -7, '신선하게 먹고 몸집을 줄입니다.'),

  hamburger: food('hamburger', '햄버거', 'gain', 5, 200, 60, 10, '한 끼를 꽉 채우고 몸집을 늘립니다.'),
  shabu: food('shabu', '샤브샤브', 'maintain', 5, 240, 56, 0, '푸짐하지만 몸집 변화는 없습니다.'),
  corn: food('corn', '옥수수', 'diet', 5, 290, 50, -10, '든든하게 먹고 몸집을 10 줄입니다.'),

  cake: food('cake', '케이크', 'gain', 6, 320, 72, 14, '달콤하게 배를 채우고 몸집을 키웁니다.'),
  lunchbox: food('lunchbox', '도시락', 'maintain', 6, 380, 68, 0, '알찬 한 끼로 몸집을 유지합니다.'),
  banana: food('banana', '바나나', 'diet', 6, 450, 62, -14, '포만감을 채우며 몸집을 크게 줄입니다.'),

  mala: food('mala', '마라탕', 'gain', 7, 500, 88, 20, '아주 든든하게 먹고 몸집을 크게 늘립니다.'),
  steak: food('steak', '스테이크', 'maintain', 7, 580, 84, 0, '고급 한 끼로 몸집을 그대로 유지합니다.'),
  chickenBreast: food('chickenBreast', '닭가슴살', 'diet', 7, 680, 76, -20, '포만감을 충분히 채우고 몸집을 크게 줄입니다.'),

  jokbalLarge: food('jokbalLarge', '족발 대짜', 'gain', 8, 750, 100, 30, '포만감을 가득 채우고 몸집을 대폭 늘립니다.'),
  poke: food('poke', '포케', 'maintain', 8, 850, 96, 0, '포만감을 거의 가득 채우며 몸집을 유지합니다.'),
  dietLunchbox: food('dietLunchbox', '다이어트 도시락', 'diet', 8, 1000, 90, -30, '포만감을 크게 채우면서 몸집을 대폭 줄입니다.')
});

export const SHOP_ITEMS = Object.freeze({
  miniGame10: Object.freeze({ id: 'miniGame10', icon: '🎮', name: '미니게임 +10회권', price: 2000, description: '구매할 때마다 이번 게임 하루의 개인게임 한도를 10회 늘립니다.' }),
  fishing5: Object.freeze({ id: 'fishing5', icon: '🎣', name: '낚시 +5회권', price: 500, description: '구매할 때마다 이번 게임 하루의 낚시 한도를 5회 늘립니다.' }),
  lottery: Object.freeze({ id: 'lottery', icon: '🍀', name: '하루 복권', price: 100, retryPrice: 500, maxPlays: 3, description: '하루 3회. 첫 도전 100P, 2·3회차 500P. 최대 5,000P가 나옵니다.' }),
  staminaHour: Object.freeze({ id: 'staminaHour', icon: '🔋', name: '체력 1시간 100% 유지권', price: 500, description: '즉시 체력 100%. 1시간 동안 감소하지 않습니다.' }),
  hungerHour: Object.freeze({ id: 'hungerHour', icon: '🍖', name: '포만감 1시간 100% 유지권', price: 700, description: '즉시 포만감 100%. 1시간 동안 감소하지 않습니다.' }),
  loudspeaker: Object.freeze({ id: 'loudspeaker', icon: '📢', name: '확성기', price: 300, maxLength: LOUDSPEAKER_MAX_LENGTH, durationSeconds: LOUDSPEAKER_DURATION_SECONDS, description: '메시지 최대 30자. 접속 중인 모든 레고 화면에 10초 동안 표시합니다.' })
});

const flexItem = (id, name, price, requiredLevel, assetKey, description, { kind = 'basic', nameplateKey = null, order = 0 } = {}) => Object.freeze({
  id, name, price, requiredLevel, tier: Math.max(1, Math.ceil(requiredLevel / 5)), assetKey, description,
  kind, nameplateKey, order, durationHours: 24
});

// 플렉스 상점은 5레벨마다 정확히 5종씩 열린다.
// Lv.5·10은 500P 일반 3종 + 700P 펫 2종, Lv.15부터는 500P 일반 3종 + 700P 펫 1종 + 1,500P 이름표 플렉스 1종이다.
// 모든 아이템은 능력치 효과가 없는 24시간 정적 장착 아이템이며 동시에 1개만 장착한다.
export const FLEX_ITEMS = Object.freeze({
  // Lv.5
  americano: flexItem('americano', '아이스 아메리카노', 500, 5, 'americano', '레고 옆에 시원한 테이크아웃 커피를 장착합니다.', { order: 1 }),
  bouquet: flexItem('bouquet', '장미꽃다발', 500, 5, 'bouquet', '레고 옆에 포장된 장미꽃다발을 장착합니다.', { order: 2 }),
  sunglasses: flexItem('sunglasses', '선글라스', 500, 5, 'sunglasses', '레고에 선글라스를 장착합니다.', { order: 3 }),
  pig: flexItem('pig', '돼지', 700, 5, 'pig', '레고 옆에 귀여운 돼지 펫을 장착합니다.', { kind: 'pet', order: 4 }),
  dog: flexItem('dog', '강아지', 700, 5, 'dog', '레고 옆에 귀여운 강아지 펫을 장착합니다.', { kind: 'pet', order: 5 }),

  // Lv.10
  headset: flexItem('headset', '헤드셋', 500, 10, 'headset', '레고에 헤드셋을 장착합니다.', { order: 1 }),
  champagne: flexItem('champagne', '샴페인', 500, 10, 'champagne', '레고 옆에 샴페인을 장착합니다.', { order: 2 }),
  luxuryBag: flexItem('luxuryBag', '명품 쇼핑백', 500, 10, 'luxury-bag', '레고 옆에 고급 쇼핑백을 장착합니다.', { order: 3 }),
  cat: flexItem('cat', '고양이', 700, 10, 'cat', '레고 옆에 귀여운 고양이 펫을 장착합니다.', { kind: 'pet', order: 4 }),
  rabbit: flexItem('rabbit', '토끼', 700, 10, 'rabbit', '레고 옆에 토끼 펫을 장착합니다.', { kind: 'pet', order: 5 }),

  // Lv.15
  moneyBundle: flexItem('moneyBundle', '돈다발', 500, 15, 'money-bundle', '레고 옆에 두툼한 돈다발을 장착합니다.', { order: 1 }),
  blackCard: flexItem('blackCard', '블랙카드', 500, 15, 'black-card', '레고 옆에 블랙카드를 장착합니다.', { order: 2 }),
  trophy: flexItem('trophy', '트로피', 500, 15, 'trophy', '레고 옆에 트로피를 장착합니다.', { order: 3 }),
  panda: flexItem('panda', '판다', 700, 15, 'panda', '레고 옆에 판다 펫을 장착합니다.', { kind: 'pet', order: 4 }),
  diamond: flexItem('diamond', '다이아몬드', 1500, 15, 'diamond', '다이아몬드 장식과 전용 다이아 이름표를 24시간 적용합니다.', { kind: 'nameplate', nameplateKey: 'diamond', order: 5 }),

  // Lv.20
  goldBars: flexItem('goldBars', '골드바', 500, 20, 'gold-bars', '레고 옆에 금괴를 장착합니다.', { order: 1 }),
  ribbon: flexItem('ribbon', '리본', 500, 20, 'ribbon', '레고 옆에 고급 리본 장식을 붙입니다.', { order: 2 }),
  teddyBear: flexItem('teddyBear', '곰인형', 500, 20, 'teddy-bear', '레고 옆에 작은 곰인형을 장착합니다.', { order: 3 }),
  otter: flexItem('otter', '수달', 700, 20, 'otter', '레고 옆에 수달 펫을 장착합니다.', { kind: 'pet', order: 4 }),
  cherryBlossom: flexItem('cherryBlossom', '벚꽃 장식', 1500, 20, 'cherry-blossom', '벚꽃 장식과 전용 벚꽃 이름표를 24시간 적용합니다.', { kind: 'nameplate', nameplateKey: 'blossom', order: 5 }),

  // Lv.25
  guitar: flexItem('guitar', '기타', 500, 25, 'guitar', '레고 옆에 기타를 장착합니다.', { order: 1 }),
  skateboard: flexItem('skateboard', '스케이트보드', 500, 25, 'skateboard', '레고 옆에 스케이트보드를 장착합니다.', { order: 2 }),
  soccerBall: flexItem('soccerBall', '축구공', 500, 25, 'soccer-ball', '레고 옆에 축구공을 장착합니다.', { order: 3 }),
  lion: flexItem('lion', '사자', 700, 25, 'lion', '레고 옆에 사자 펫을 장착합니다.', { kind: 'pet', order: 4 }),
  flameBadge: flexItem('flameBadge', '불꽃 장식', 1500, 25, 'flame-badge', '불꽃 장식과 전용 불꽃 이름표를 24시간 적용합니다.', { kind: 'nameplate', nameplateKey: 'flame', order: 5 }),

  // Lv.30
  sword: flexItem('sword', '검', 500, 30, 'sword', '레고 옆에 검을 장착합니다.', { order: 1 }),
  trident: flexItem('trident', '삼지창', 500, 30, 'trident', '레고 옆에 삼지창을 장착합니다.', { order: 2 }),
  shield: flexItem('shield', '방패', 500, 30, 'shield', '레고 옆에 방패를 장착합니다.', { order: 3 }),
  wolf: flexItem('wolf', '늑대', 700, 30, 'wolf', '레고 옆에 늑대 펫을 장착합니다.', { kind: 'pet', order: 4 }),
  demonWings: flexItem('demonWings', '악마 날개', 1500, 30, 'demon-wings', '악마 날개와 전용 다크 이름표를 24시간 적용합니다.', { kind: 'nameplate', nameplateKey: 'dark', order: 5 }),

  // Lv.35
  briefcase: flexItem('briefcase', '돈가방', 500, 35, 'briefcase', '레고 옆에 묵직한 돈가방을 장착합니다.', { order: 1 }),
  topHat: flexItem('topHat', '실크햇', 500, 35, 'top-hat', '레고에 클래식 실크햇을 장착합니다.', { order: 2 }),
  goblet: flexItem('goblet', '황금잔', 500, 35, 'goblet', '레고 옆에 황금잔을 장착합니다.', { order: 3 }),
  peacock: flexItem('peacock', '공작', 700, 35, 'peacock', '레고 옆에 화려한 공작 펫을 장착합니다.', { kind: 'pet', order: 4 }),
  goldenCrown: flexItem('goldenCrown', '황금 왕관', 1500, 35, 'golden-crown', '황금 왕관과 전용 왕실 이름표를 24시간 적용합니다.', { kind: 'nameplate', nameplateKey: 'royal', order: 5 }),

  // Lv.40
  magicWand: flexItem('magicWand', '마법봉', 500, 40, 'magic-wand', '레고 옆에 마법봉을 장착합니다.', { order: 1 }),
  magicBook: flexItem('magicBook', '마법서', 500, 40, 'magic-book', '레고 옆에 마법서를 장착합니다.', { order: 2 }),
  crystalBall: flexItem('crystalBall', '수정구', 500, 40, 'crystal-ball', '레고 옆에 수정구를 장착합니다.', { order: 3 }),
  babyDragon: flexItem('babyDragon', '아기용', 700, 40, 'baby-dragon', '레고 옆에 아기용 펫을 장착합니다.', { kind: 'pet', order: 4 }),
  angelWings: flexItem('angelWings', '천사 날개', 1500, 40, 'angel-wings', '천사 날개와 전용 천상 이름표를 24시간 적용합니다.', { kind: 'nameplate', nameplateKey: 'angel', order: 5 }),

  // Lv.45
  crescentMoon: flexItem('crescentMoon', '초승달', 500, 45, 'crescent-moon', '레고 옆에 초승달 장식을 붙입니다.', { order: 1 }),
  starCharm: flexItem('starCharm', '별 장식', 500, 45, 'star-charm', '레고 옆에 별 장식을 붙입니다.', { order: 2 }),
  planet: flexItem('planet', '행성', 500, 45, 'planet', '레고 옆에 작은 행성 장식을 붙입니다.', { order: 3 }),
  unicorn: flexItem('unicorn', '유니콘', 700, 45, 'unicorn', '레고 옆에 유니콘 펫을 장착합니다.', { kind: 'pet', order: 4 }),
  galaxy: flexItem('galaxy', '은하 장식', 1500, 45, 'galaxy', '은하 장식과 전용 우주 이름표를 24시간 적용합니다.', { kind: 'nameplate', nameplateKey: 'galaxy', order: 5 }),

  // Lv.50
  holySword: flexItem('holySword', '성검', 500, 50, 'holy-sword', '레고 옆에 성검을 장착합니다.', { order: 1 }),
  royalThrone: flexItem('royalThrone', '왕좌', 500, 50, 'royal-throne', '레고 옆에 작은 왕좌를 장착합니다.', { order: 2 }),
  goldenTrophy: flexItem('goldenTrophy', '황금 트로피', 500, 50, 'golden-trophy', '레고 옆에 황금 트로피를 장착합니다.', { order: 3 }),
  goldenDragon: flexItem('goldenDragon', '황금용', 700, 50, 'golden-dragon', '레고 옆에 황금용 펫을 장착합니다.', { kind: 'pet', order: 4 }),
  legoKingCrown: flexItem('legoKingCrown', '레고왕 왕관', 1500, 50, 'lego-king-crown', '레고왕 왕관과 Lv.50 전용 이름표를 24시간 적용합니다.', { kind: 'nameplate', nameplateKey: 'king', order: 5 })
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
  apple: {
    id: 'apple',
    name: '사과게임',
    description: '난이도 중간 · 2분 동안 10×10 숫자판에서 합이 10인 사각형을 찾아 제거합니다.',
    rewardType: 'points'
  },
  minesweeper: {
    id: 'minesweeper',
    name: '지뢰찾기',
    description: '보통 10×10·지뢰 12개 / 어려움 16×16·지뢰 40개. 빠른 클리어 기록에 도전합니다.',
    rewardType: 'points'
  },
  block: {
    id: 'block',
    name: '블록게임',
    description: '난이도 쉬움 · 같은 색 블록 2개 이상을 눌러 끝까지 제거합니다.',
    rewardType: 'points'
  },
  tetrisSingle: {
    id: 'tetrisSingle',
    name: '싱글 테트리스',
    description: '2분 동안 고정 속도로 줄을 지워 최고점수에 도전합니다. 1줄 1점 · 2줄 3점 · 3줄 5점 · 4줄 8점.',
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
