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

export const TERRITORY_SIZE = 6;
export const TERRITORY_STEAL_COST = 50;
export const TERRITORY_WIN_POINTS = 5_000;
// 황금 영토는 진행 중에는 절대 공개하지 않고 시즌 정산이 끝난 뒤 결과에서만 공개한다.
// 기존 설정/테스트 호환을 위해 상수는 유지하되 0시간(종료 시점)으로 둔다.
export const TERRITORY_GOLDEN_REVEAL_HOURS_BEFORE_END = 0;

export const ODD_EVEN_MIN_STAKE = 10;
export const ODD_EVEN_STAKE_STEP = 10;
export const ODD_EVEN_PAYOUT_PERCENT = Object.freeze({ 1: 150, 2: 300, 3: 600 });

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

export const BODY_ADVANCEMENT_BODY = 8750;
export const BODY_ADVANCEMENTS = Object.freeze({
  babyDino: Object.freeze({ key:'babyDino', label:'아기공룡', assetKey:'form-baby-dino', description:'동글동글한 꼬리와 등가시가 포인트인 아기공룡 체형.', order:1 }),
  malangBear: Object.freeze({ key:'malangBear', label:'말랑곰', assetKey:'form-malang-bear', description:'포근하고 둥근 실루엣의 말랑한 곰 체형.', order:2 }),
  rabbitBean: Object.freeze({ key:'rabbitBean', label:'토끼콩', assetKey:'form-rabbit-bean', description:'긴 귀와 콩 같은 몸통이 특징인 토끼 체형.', order:3 }),
  catBean: Object.freeze({ key:'catBean', label:'고양콩', assetKey:'form-cat-bean', description:'삼각 귀와 말린 꼬리를 가진 고양이 체형.', order:4 }),
  hamster: Object.freeze({ key:'hamster', label:'햄찌', assetKey:'form-hamster', description:'볼이 빵빵하고 작은 귀가 귀여운 햄스터 체형.', order:5 }),
  frog: Object.freeze({ key:'frog', label:'개굴이', assetKey:'form-frog', description:'동그란 눈과 짧은 팔다리를 가진 개구리 체형.', order:6 }),
  puppy: Object.freeze({ key:'puppy', label:'강아지', assetKey:'form-puppy', description:'접힌 귀와 꼬리가 포인트인 강아지 체형.', order:7 }),
  piglet: Object.freeze({ key:'piglet', label:'아기돼지', assetKey:'form-piglet', description:'작은 코와 동그란 몸통의 아기돼지 체형.', order:8 }),
  chick: Object.freeze({ key:'chick', label:'삐약이', assetKey:'form-chick', description:'노란 솜뭉치 같은 병아리 체형.', order:9 }),
  blackWolf: Object.freeze({ key:'blackWolf', label:'검은늑대', assetKey:'form-black-wolf', description:'날렵한 귀와 꼬리가 살아있는 다크 늑대 체형.', order:10 }),
  babyDragon: Object.freeze({ key:'babyDragon', label:'꼬마드래곤', assetKey:'form-baby-dragon', description:'작은 뿔과 날개를 가진 멋있는 드래곤 체형.', order:11 })
});

const food = (id, name, category, tier, price, hunger, body, description) => Object.freeze({
  id, name, category, tier, minLevel: tier, price, hunger, body, description
});

// 음식점은 살찌는 음식/다이어트 음식 2열로 운영한다. 같은 단계 두 음식은 가격을 동일하게 맞춘다.
// 에너지드링크는 체력이 부족할 때 음식점에서 바로 회복할 수 있는 긴급 회복용 아이템이다.
export const FOODS = Object.freeze({
  triangle: food('triangle', '삼각김밥', 'gain', 1, 20, 20, 2, '저렴하게 배를 채우고 몸집을 조금 늘립니다.'),
  cucumber: food('cucumber', '오이', 'diet', 1, 20, 12, -2, '가볍게 배를 채우며 몸집을 줄입니다.'),

  ramen: food('ramen', '컵라면', 'gain', 2, 40, 28, 3, '든든하게 먹고 몸집을 늘립니다.'),
  tomato: food('tomato', '토마토', 'diet', 2, 40, 20, -3, '산뜻하게 먹고 몸집을 조금 줄입니다.'),

  tteokbokki: food('tteokbokki', '떡볶이', 'gain', 3, 70, 36, 5, '매콤하게 먹고 몸집을 키웁니다.'),
  sweetPotato: food('sweetPotato', '고구마', 'diet', 3, 70, 28, -5, '포만감을 채우고 몸집을 줄입니다.'),

  chicken: food('chicken', '치킨', 'gain', 4, 120, 48, 7, '든든하게 먹고 몸집을 크게 늘립니다.'),
  salad: food('salad', '샐러드', 'diet', 4, 120, 40, -7, '신선하게 먹고 몸집을 줄입니다.'),

  hamburger: food('hamburger', '햄버거', 'gain', 5, 200, 60, 10, '한 끼를 꽉 채우고 몸집을 늘립니다.'),
  corn: food('corn', '옥수수', 'diet', 5, 200, 50, -10, '든든하게 먹고 몸집을 10 줄입니다.'),

  cake: food('cake', '케이크', 'gain', 6, 320, 72, 14, '달콤하게 배를 채우고 몸집을 키웁니다.'),
  banana: food('banana', '바나나', 'diet', 6, 320, 62, -14, '포만감을 채우며 몸집을 크게 줄입니다.'),

  mala: food('mala', '마라탕', 'gain', 7, 500, 88, 20, '아주 든든하게 먹고 몸집을 크게 늘립니다.'),
  chickenBreast: food('chickenBreast', '닭가슴살', 'diet', 7, 500, 76, -20, '포만감을 충분히 채우고 몸집을 크게 줄입니다.'),

  jokbalLarge: food('jokbalLarge', '족발 대짜', 'gain', 8, 750, 100, 30, '포만감을 가득 채우고 몸집을 대폭 늘립니다.'),
  dietLunchbox: food('dietLunchbox', '다이어트 도시락', 'diet', 8, 750, 90, -30, '포만감을 크게 채우면서 몸집을 대폭 줄입니다.'),

  energyDrink: Object.freeze({ id: 'energyDrink', name: '에너지드링크', category: 'energy', tier: 1, minLevel: 1, price: 300, hunger: 0, body: 0, stamina: 50, description: '체력이 부족할 때 즉시 체력 50을 회복합니다.' })
});

export const SHOP_ITEMS = Object.freeze({
  miniGame20: Object.freeze({ id: 'miniGame20', icon: '🎮', name: '미니게임 +20회권', price: 4000, description: '구매할 때마다 이번 게임 하루의 개인게임 한도를 20회 늘립니다.' }),
  battle20: Object.freeze({ id: 'battle20', icon: '⚔️', name: '대전 +20회권', price: 4000, description: '구매할 때마다 이번 게임 하루의 오목·테트리스대전·사천성 합산 한도를 20회 늘립니다.' }),
  fishing5: Object.freeze({ id: 'fishing5', icon: '🎣', name: '낚시 +5회권', price: 500, description: '구매할 때마다 이번 게임 하루의 낚시 한도를 5회 늘립니다.' }),
  lottery: Object.freeze({ id: 'lottery', icon: '🍀', name: '하루 복권', price: 100, retryPrice: 500, maxPlays: 3, description: '하루 3회. 첫 도전 100P, 2·3회차 500P. 최대 5,000P가 나옵니다.' }),
  staminaHour: Object.freeze({ id: 'staminaHour', icon: '🔋', name: '체력 1시간 100% 유지권', price: 500, description: '즉시 체력 100%. 1시간 동안 감소하지 않습니다.' }),
  hungerHour: Object.freeze({ id: 'hungerHour', icon: '🍖', name: '포만감 1시간 100% 유지권', price: 700, description: '즉시 포만감 100%. 1시간 동안 감소하지 않습니다.' }),
  loudspeaker: Object.freeze({ id: 'loudspeaker', icon: '📢', name: '확성기', price: 300, maxLength: LOUDSPEAKER_MAX_LENGTH, durationSeconds: LOUDSPEAKER_DURATION_SECONDS, description: '메시지 최대 30자. 접속 중인 모든 레고 화면에 10초 동안 표시합니다.' })
});

const flexItem = (id, name, price, requiredLevel, assetKey, description, { kind = 'basic', nameplateKey = null, order = 0, retired = false } = {}) => Object.freeze({
  id, name, price, requiredLevel, tier: Math.max(1, Math.ceil(requiredLevel / 5)), assetKey, description,
  kind, nameplateKey, order, retired, durationHours: 24
});

// 플렉스 상점은 5레벨마다 정확히 5종씩 열린다.
// Lv.5·10은 500P 일반 3종 + 700P 펫 2종, Lv.15부터는 500P 일반 3종 + 700P 펫 1종 + 1,500P 이름표 플렉스 1종이다.
// 모든 아이템은 능력치 효과가 없는 24시간 정적 장착 아이템이며 동시에 1개만 장착한다.
export const FLEX_ITEMS = Object.freeze({
  // Lv.5 — 첫 해금부터 바로 사고 싶은 기본 꾸미기
  sunglasses: flexItem('sunglasses','블랙 선글라스',400,5,'sunglasses','얼굴에 딱 붙는 기본 블랙 선글라스.',{order:1}),
  ballCap: flexItem('ballCap','볼캡',450,5,'ball-cap','캐주얼하게 쓰는 심플 볼캡.',{order:2}),
  beanie: flexItem('beanie','비니',450,5,'beanie','어떤 체형에도 잘 어울리는 니트 비니.',{order:3}),
  dog: flexItem('dog','강아지 펫',650,5,'dog','레고 옆을 따라다니는 느낌의 강아지 펫.',{kind:'pet',order:4}),
  cat: flexItem('cat','고양이 펫',700,5,'cat','작고 선명한 실루엣의 고양이 펫.',{kind:'pet',order:5}),

  // Lv.10
  headset: flexItem('headset','오버이어 헤드셋',650,10,'headset','레고 머리에 안정적으로 맞는 기본 헤드셋.',{order:1}),
  tintGlasses: flexItem('tintGlasses','틴트 안경',550,10,'tint-glasses','은은한 틴트 렌즈 안경.',{order:2}),
  rabbit: flexItem('rabbit','토끼 펫',750,10,'rabbit','작은 토끼 펫을 장착합니다.',{kind:'pet',order:3}),
  pig: flexItem('pig','아기돼지 펫',700,10,'pig','동글한 아기돼지 펫을 장착합니다.',{kind:'pet',order:4}),
  teddyBackpack: flexItem('teddyBackpack','곰돌이 백팩',900,10,'teddy-backpack','등 뒤에 보이는 귀여운 곰돌이 백팩.',{order:5}),

  // Lv.15
  gamingHeadset: flexItem('gamingHeadset','게이밍 헤드셋',950,15,'gaming-headset','마이크가 달린 선명한 게이밍 헤드셋.',{order:1}),
  slimSunglasses: flexItem('slimSunglasses','슬림 선글라스',700,15,'slim-sunglasses','얇고 날렵한 프레임의 선글라스.',{order:2}),
  ribbon: flexItem('ribbon','리본',650,15,'ribbon','머리 쪽에 포인트를 주는 리본 장식.',{order:3}),
  panda: flexItem('panda','판다 펫',900,15,'panda','작은 판다 펫을 장착합니다.',{kind:'pet',order:4}),
  trophy: flexItem('trophy','트로피',1000,15,'trophy','승부욕 있는 레고에게 어울리는 트로피.',{order:5}),

  // Lv.20
  catEarHeadset: flexItem('catEarHeadset','고양이귀 헤드셋',1200,20,'cat-ear-headset','고양이 귀가 붙은 인기 헤드셋.',{order:1}),
  sportGoggles: flexItem('sportGoggles','스포츠 고글',950,20,'sport-goggles','눈매를 살려주는 반투명 스포츠 고글.',{order:2}),
  teddyBear: flexItem('teddyBear','곰인형',800,20,'teddy-bear','옆에 두는 작은 곰인형.',{order:3}),
  otter: flexItem('otter','수달 펫',1100,20,'otter','귀여운 수달 펫을 장착합니다.',{kind:'pet',order:4}),
  skateboard: flexItem('skateboard','스케이트보드',900,20,'skateboard','발밑에 놓이는 스케이트보드.',{order:5}),

  // Lv.25
  visor: flexItem('visor','네온 바이저',1300,25,'visor','얼굴을 가로지르는 미래형 바이저.',{order:1}),
  guitar: flexItem('guitar','기타',950,25,'guitar','레고 옆에 기타를 장착합니다.',{order:2}),
  soccerBall: flexItem('soccerBall','축구공',900,25,'soccer-ball','발밑에 축구공을 놓습니다.',{order:3}),
  lion: flexItem('lion','사자 펫',1300,25,'lion','존재감 있는 사자 펫.',{kind:'pet',order:4}),
  flameBadge: flexItem('flameBadge','불꽃 장식',1500,25,'flame-badge','불꽃 장식과 전용 이름표.',{kind:'nameplate',nameplateKey:'flame',order:5}),

  // Lv.30
  wolf: flexItem('wolf','늑대 펫',1500,30,'wolf','간지나는 늑대 펫.',{kind:'pet',order:1}),
  darkCape: flexItem('darkCape','다크 케이프',1450,30,'dark-cape','등 뒤로 떨어지는 어두운 망토.',{order:2}),
  sword: flexItem('sword','검',1200,30,'sword','레고 옆에 검을 장착합니다.',{order:3}),
  shield: flexItem('shield','방패',1200,30,'shield','레고 옆에 방패를 장착합니다.',{order:4}),
  demonWings: flexItem('demonWings','악마 날개',1800,30,'demon-wings','악마 날개와 다크 이름표.',{kind:'nameplate',nameplateKey:'dark',order:5}),

  // Lv.35
  goldenCrown: flexItem('goldenCrown','황금 왕관',1900,35,'golden-crown','머리 위에 올라가는 황금 왕관.',{kind:'nameplate',nameplateKey:'royal',order:1}),
  halo: flexItem('halo','빛나는 후광',1700,35,'halo','머리 위에 고정되는 심플한 후광.',{order:2}),
  topHat: flexItem('topHat','실크햇',1350,35,'top-hat','클래식한 실크햇.',{order:3}),
  peacock: flexItem('peacock','공작 펫',1500,35,'peacock','화려한 공작 펫.',{kind:'pet',order:4}),
  briefcase: flexItem('briefcase','돈가방',1400,35,'briefcase','묵직한 돈가방.',{order:5}),

  // Lv.40
  babyDragon: flexItem('babyDragon','아기용 펫',1900,40,'baby-dragon','작은 드래곤 펫.',{kind:'pet',order:1}),
  crystalVisor: flexItem('crystalVisor','크리스탈 바이저',1800,40,'crystal-visor','수정처럼 반짝이는 바이저.',{order:2}),
  angelWings: flexItem('angelWings','천사 날개',2100,40,'angel-wings','천사 날개와 천상 이름표.',{kind:'nameplate',nameplateKey:'angel',order:3}),
  magicWand: flexItem('magicWand','마법봉',1500,40,'magic-wand','레고 옆에 마법봉을 장착합니다.',{order:4}),
  crystalBall: flexItem('crystalBall','수정구',1600,40,'crystal-ball','레고 옆에 수정구를 장착합니다.',{order:5}),

  // Lv.45
  neonHeadset: flexItem('neonHeadset','네온 헤드셋',2000,45,'neon-headset','고레벨 전용 네온 헤드셋.',{order:1}),
  unicorn: flexItem('unicorn','유니콘 펫',2000,45,'unicorn','유니콘 펫을 장착합니다.',{kind:'pet',order:2}),
  galaxy: flexItem('galaxy','은하 장식',2500,45,'galaxy','은하 장식과 우주 이름표.',{kind:'nameplate',nameplateKey:'galaxy',order:3}),
  crescentMoon: flexItem('crescentMoon','초승달',1700,45,'crescent-moon','레고 옆의 초승달 장식.',{order:4}),
  starCharm: flexItem('starCharm','별 장식',1700,45,'star-charm','작은 별 장식을 장착합니다.',{order:5}),

  // Lv.50
  goldenDragon: flexItem('goldenDragon','황금용 펫',2800,50,'golden-dragon','최종 단계의 황금용 펫.',{kind:'pet',order:1}),
  legoKingCrown: flexItem('legoKingCrown','레고왕 왕관',3500,50,'lego-king-crown','Lv.50 전용 왕관과 왕 이름표.',{kind:'nameplate',nameplateKey:'king',order:2}),
  legendaryWings: flexItem('legendaryWings','전설의 날개',3200,50,'legendary-wings','크고 선명한 최종 단계 날개.',{kind:'nameplate',nameplateKey:'legend',order:3}),
  royalThrone: flexItem('royalThrone','왕좌',2400,50,'royal-throne','레고 옆에 작은 왕좌를 장착합니다.',{order:4}),
  holySword: flexItem('holySword','성검',2300,50,'holy-sword','최종 단계 성검.',{order:5}),

  // 기존 v6.10.19 장착 상태 보존용. 새 구매 목록에서는 숨긴다.
  americano: flexItem('americano','아이스 아메리카노',500,5,'americano','구버전 호환 아이템.',{retired:true}),
  bouquet: flexItem('bouquet','장미꽃다발',500,5,'bouquet','구버전 호환 아이템.',{retired:true}),
  champagne: flexItem('champagne','샴페인',500,10,'champagne','구버전 호환 아이템.',{retired:true}),
  luxuryBag: flexItem('luxuryBag','명품 쇼핑백',500,10,'luxury-bag','구버전 호환 아이템.',{retired:true}),
  moneyBundle: flexItem('moneyBundle','돈다발',500,15,'money-bundle','구버전 호환 아이템.',{retired:true}),
  blackCard: flexItem('blackCard','블랙카드',500,15,'black-card','구버전 호환 아이템.',{retired:true}),
  diamond: flexItem('diamond','다이아몬드',1500,15,'diamond','구버전 호환 아이템.',{kind:'nameplate',nameplateKey:'diamond',retired:true}),
  goldBars: flexItem('goldBars','골드바',500,20,'gold-bars','구버전 호환 아이템.',{retired:true}),
  cherryBlossom: flexItem('cherryBlossom','벚꽃 장식',1500,20,'cherry-blossom','구버전 호환 아이템.',{kind:'nameplate',nameplateKey:'blossom',retired:true}),
  trident: flexItem('trident','삼지창',500,30,'trident','구버전 호환 아이템.',{retired:true}),
  goblet: flexItem('goblet','황금잔',500,35,'goblet','구버전 호환 아이템.',{retired:true}),
  magicBook: flexItem('magicBook','마법서',500,40,'magic-book','구버전 호환 아이템.',{retired:true}),
  planet: flexItem('planet','행성',500,45,'planet','구버전 호환 아이템.',{retired:true}),
  goldenTrophy: flexItem('goldenTrophy','황금 트로피',500,50,'golden-trophy','구버전 호환 아이템.',{retired:true})
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
