const W = 800;
const H = 520;

// Candidate points are intentionally irregular instead of a visible grid. Only seven are answers per match.
// difficulty is also shared with the server test suite so every match is 1 easy + 4 normal + 2 hard.
export const SPOT_CLIENT_HITBOXES = Object.freeze([
  { id:'d0',  x:.075, y:.115, r:.050, difficulty:'easy' },
  { id:'d1',  x:.205, y:.090, r:.046, difficulty:'normal' },
  { id:'d2',  x:.345, y:.145, r:.043, difficulty:'hard' },
  { id:'d3',  x:.495, y:.085, r:.048, difficulty:'normal' },
  { id:'d4',  x:.635, y:.135, r:.046, difficulty:'normal' },
  { id:'d5',  x:.785, y:.090, r:.043, difficulty:'hard' },
  { id:'d6',  x:.920, y:.150, r:.050, difficulty:'easy' },
  { id:'d7',  x:.125, y:.285, r:.046, difficulty:'normal' },
  { id:'d8',  x:.285, y:.245, r:.043, difficulty:'hard' },
  { id:'d9',  x:.435, y:.305, r:.048, difficulty:'normal' },
  { id:'d10', x:.575, y:.245, r:.050, difficulty:'easy' },
  { id:'d11', x:.735, y:.305, r:.046, difficulty:'normal' },
  { id:'d12', x:.885, y:.270, r:.043, difficulty:'hard' },
  { id:'d13', x:.060, y:.455, r:.046, difficulty:'normal' },
  { id:'d14', x:.205, y:.415, r:.050, difficulty:'easy' },
  { id:'d15', x:.355, y:.475, r:.043, difficulty:'hard' },
  { id:'d16', x:.510, y:.400, r:.046, difficulty:'normal' },
  { id:'d17', x:.660, y:.465, r:.048, difficulty:'normal' },
  { id:'d18', x:.805, y:.415, r:.043, difficulty:'hard' },
  { id:'d19', x:.945, y:.475, r:.050, difficulty:'easy' },
  { id:'d20', x:.120, y:.635, r:.043, difficulty:'hard' },
  { id:'d21', x:.275, y:.615, r:.046, difficulty:'normal' },
  { id:'d22', x:.425, y:.655, r:.050, difficulty:'easy' },
  { id:'d23', x:.575, y:.610, r:.043, difficulty:'hard' },
  { id:'d24', x:.730, y:.655, r:.046, difficulty:'normal' },
  { id:'d25', x:.885, y:.620, r:.048, difficulty:'normal' },
  { id:'d26', x:.060, y:.820, r:.050, difficulty:'easy' },
  { id:'d27', x:.220, y:.775, r:.043, difficulty:'hard' },
  { id:'d28', x:.370, y:.830, r:.046, difficulty:'normal' },
  { id:'d29', x:.525, y:.770, r:.048, difficulty:'normal' },
  { id:'d30', x:.690, y:.825, r:.043, difficulty:'hard' },
  { id:'d31', x:.890, y:.790, r:.050, difficulty:'easy' }
]);

const THEMES = Object.freeze({
  'body-guide': { label:'레고 체형도감', sky:'#fff7ed', floor:'#fde68a', accent:'#ea580c', pool:['crown','heart','book','camera','cup','plant','clock','gift','apple','flower'] },
  'lego-room': { label:'레고의 방', sky:'#eff6ff', floor:'#e7e5e4', accent:'#2563eb', pool:['clock','plant','book','cup','cat','gamepad','camera','gift','heart','cake'] },
  convenience: { label:'편의점', sky:'#ecfdf5', floor:'#d1fae5', accent:'#059669', pool:['bottle','apple','cake','cup','camera','gift','mushroom','book','clock','balloon'] },
  beach: { label:'바닷가', sky:'#e0f2fe', floor:'#fef3c7', accent:'#0284c7', pool:['sun','cloud','fish','umbrella','balloon','apple','camera','bottle','flower','star'] },
  'game-room': { label:'게임방', sky:'#f5f3ff', floor:'#ddd6fe', accent:'#7c3aed', pool:['gamepad','star','rocket','camera','cup','clock','moon','crown','gift','book'] },
  picnic: { label:'공원 피크닉', sky:'#f0fdf4', floor:'#bbf7d0', accent:'#16a34a', pool:['sun','cloud','flower','apple','cake','cat','balloon','umbrella','book','bottle'] },
  camping: { label:'캠핑장', sky:'#fefce8', floor:'#d9f99d', accent:'#65a30d', pool:['moon','star','mushroom','bottle','cup','fish','book','apple','camera','cloud'] },
  cafe: { label:'카페', sky:'#fff7ed', floor:'#fed7aa', accent:'#c2410c', pool:['cup','cake','plant','book','clock','camera','flower','apple','cat','gift'] },
  festival: { label:'축제', sky:'#fdf2f8', floor:'#fbcfe8', accent:'#db2777', pool:['balloon','gift','star','crown','cake','camera','apple','rocket','flower','cup'] },
  'space-lab': { label:'우주 연구소', sky:'#eef2ff', floor:'#c7d2fe', accent:'#4338ca', pool:['rocket','moon','star','gamepad','bottle','clock','camera','crown','plant','gift'] }
});

const BODY_ASSETS = Object.freeze([
  'normal','chubby','fat','hippo','mammoth','lego-stegosaurus','lego-triceratops','lego-brachiosaurus',
  'lego-blue-whale','lego-ultra-whale','lego-kraken','lego-deep-sea-disaster','lego-leviathan','lego-behemoth',
  'lego-fenrir','lego-hydra','lego-orochi','lego-garuda','lego-nidhogg','lego-jormungandr','lego-apep','lego-atlas','lego-surtr','lego-typhon','lego-myth-disaster'
]);

function seededRandom(seedValue) {
  let seed = (Number(seedValue) >>> 0) || 0x6d2b79f5;
  return () => {
    seed += 0x6d2b79f5;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(values, random) {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

function themeBackground(themeId, variant) {
  const theme = THEMES[themeId] || THEMES['lego-room'];
  const v = Number(variant || 0) % 4;
  const common = `<rect width="800" height="520" rx="24" fill="${theme.sky}"/><rect y="354" width="800" height="166" fill="${theme.floor}"/><path d="M0 354H800" stroke="#334155" stroke-opacity=".12" stroke-width="3"/>`;
  if (themeId === 'beach') return `${common}<circle cx="690" cy="70" r="31" fill="#fde047"/><path d="M0 296Q110 ${268+v*4} 220 296T440 296T660 296T880 296V354H0Z" fill="#7dd3fc"/><path d="M0 324Q110 297 220 324T440 324T660 324T880 324" fill="none" stroke="#fff" stroke-width="9" opacity=".82"/><path d="M38 348q80-70 166 0M610 348q72-58 150 0" fill="#fcd34d" opacity=".82"/>`;
  if (themeId === 'space-lab') return `${common}<rect x="28" y="28" width="744" height="288" rx="28" fill="#111827" opacity=".94"/><g fill="#fff" opacity=".8"><circle cx="90" cy="82" r="3"/><circle cx="180" cy="144" r="4"/><circle cx="284" cy="74" r="3"/><circle cx="520" cy="115" r="4"/><circle cx="690" cy="78" r="3"/><circle cx="735" cy="198" r="4"/></g><circle cx="420" cy="95" r="39" fill="#818cf8"/><path d="M364 98c36 15 83 15 112-3" fill="none" stroke="#f8fafc" stroke-width="7" opacity=".65"/><rect x="72" y="270" width="176" height="84" rx="14" fill="#334155"/><rect x="552" y="260" width="174" height="94" rx="14" fill="#334155"/>`;
  if (themeId === 'camping') return `${common}<path d="M0 254 110 132l92 89 100-135 126 168 103-113 146 113 123-96v196H0Z" fill="#86efac" opacity=".66"/><path d="M315 354 414 203l104 151Z" fill="#fb923c"/><path d="M414 203v151" stroke="#7c2d12" stroke-width="6"/><circle cx="630" cy="332" r="24" fill="#fb923c" opacity=".8"/>`;
  if (themeId === 'picnic') return `${common}<path d="M0 310Q120 240 246 310T500 310T800 302V354H0Z" fill="#86efac"/><rect x="286" y="386" width="228" height="88" rx="12" fill="#fff" opacity=".8"/><path d="M286 415h228M345 386v88M456 386v88" stroke="#ef4444" stroke-opacity=".48" stroke-width="8"/><circle cx="88" cy="337" r="41" fill="#4ade80"/><rect x="82" y="337" width="13" height="55" fill="#92400e"/>`;
  if (themeId === 'game-room') return `${common}<rect x="72" y="46" width="656" height="234" rx="24" fill="#1e1b4b"/><rect x="108" y="78" width="584" height="164" rx="14" fill="#111827"/><path d="M132 215l72-67 68 45 89-86 77 69 68-48 132 87" fill="none" stroke="#a78bfa" stroke-width="7"/><rect x="336" y="278" width="128" height="76" rx="12" fill="#475569"/><rect x="90" y="382" width="186" height="72" rx="16" fill="#334155" opacity=".52"/><rect x="530" y="382" width="180" height="72" rx="16" fill="#334155" opacity=".52"/>`;
  if (themeId === 'convenience') return `${common}<rect x="44" y="40" width="712" height="278" rx="18" fill="#fff"/><path d="M62 101h676M62 166h676M62 231h676" stroke="#94a3b8" stroke-width="7"/><path d="M158 40v278M294 40v278M430 40v278M566 40v278M700 40v278" stroke="#cbd5e1" stroke-width="4"/><rect x="280" y="370" width="240" height="88" rx="14" fill="#bbf7d0"/>`;
  if (themeId === 'cafe') return `${common}<rect x="42" y="36" width="270" height="238" rx="18" fill="#bae6fd"/><path d="M177 36v238M42 154h270" stroke="#fff" stroke-width="11"/><rect x="518" y="58" width="198" height="174" rx="18" fill="#fff" opacity=".86"/><path d="M548 101h138M548 139h112M548 177h126" stroke="#c2410c" stroke-width="8" stroke-linecap="round" opacity=".4"/><ellipse cx="400" cy="408" rx="144" ry="42" fill="#92400e" opacity=".25"/>`;
  if (themeId === 'festival') return `${common}<path d="M22 55H780" stroke="#475569" stroke-width="4"/><path d="M62 57l34 58 34-58ZM176 57l34 58 34-58ZM290 57l34 58 34-58ZM404 57l34 58 34-58ZM518 57l34 58 34-58ZM632 57l34 58 34-58Z" fill="#f472b6"/><rect x="72" y="270" width="656" height="84" rx="16" fill="#fff" opacity=".72"/><circle cx="112" cy="420" r="48" fill="#f9a8d4" opacity=".65"/><circle cx="690" cy="422" r="50" fill="#f9a8d4" opacity=".65"/>`;
  if (themeId === 'body-guide') return `${common}<rect x="38" y="34" width="724" height="294" rx="22" fill="#fff" opacity=".82"/><path d="M116 298v-118M260 298V146M404 298V112M548 298V78M692 298V50" stroke="#cbd5e1" stroke-width="3" stroke-dasharray="7 8"/><text x="400" y="344" text-anchor="middle" font-size="18" font-family="system-ui,sans-serif" font-weight="900" fill="#9a3412">레고 체형도감 특별전</text>`;
  return `${common}<rect x="38" y="36" width="292" height="214" rx="18" fill="#bfdbfe"/><path d="M184 36v214M38 143h292" stroke="#fff" stroke-width="10"/><rect x="515" y="55" width="212" height="230" rx="18" fill="#fff" opacity=".76"/><rect x="88" y="291" width="250" height="63" rx="20" fill="#94a3b8" opacity=".55"/><rect x="500" y="388" width="215" height="70" rx="18" fill="#cbd5e1" opacity=".72"/>`;
}

function symbolMarkup(type, accent='#2563eb') {
  switch(type) {
    case 'sun': return `<circle r="20" fill="#facc15"/><g stroke="#f59e0b" stroke-width="5" stroke-linecap="round"><path d="M0-32V-42M0 32v10M-32 0h-10M32 0h10M-23-23l-8-8M23 23l8 8M23-23l8-8M-23 23l-8 8"/></g>`;
    case 'cloud': return `<path d="M-31 13h57c14 0 19-19 7-27-5-3-10-3-15-2-4-14-20-20-32-12-6 4-8 9-8 16-18-4-27 22-9 25Z" fill="#fff" stroke="#94a3b8" stroke-width="4"/>`;
    case 'star': return `<path d="M0-28 8-9 29-7 13 6 18 27 0 15-18 27-13 6-29-7-8-9Z" fill="#fde047" stroke="#ca8a04" stroke-width="3.5"/>`;
    case 'heart': return `<path d="M0 25C-30 6-38-8-30-22-21-36-5-31 0-19 5-31 21-36 30-22 38-8 30 6 0 25Z" fill="#fb7185" stroke="#be123c" stroke-width="3.5"/>`;
    case 'cup': return `<path d="M-22-17h42v33c0 11-8 17-21 17s-21-6-21-17Z" fill="#fff" stroke="#78350f" stroke-width="4"/><path d="M20-8h11c16 0 16 22 0 22H20" fill="none" stroke="#78350f" stroke-width="4"/><path d="M-11-24c-7-9 6-11 0-20M5-24c-6-9 7-11 1-20" fill="none" stroke="#94a3b8" stroke-width="3"/>`;
    case 'plant': return `<path d="M0 14C-4-3-16-14-28-17c1 16 9 28 28 31ZM0 14C4-3 16-14 28-17c-1 16-9 28-28 31ZM0 10C-2-9 6-24 17-31 5-31-7-19 0 10Z" fill="#4ade80" stroke="#15803d" stroke-width="3"/><path d="M-20 16h40l-6 23h-28Z" fill="#fb923c" stroke="#9a3412" stroke-width="3.5"/>`;
    case 'clock': return `<circle r="28" fill="#fff" stroke="#334155" stroke-width="4"/><path d="M0 0V-16M0 0l12 8" stroke="${accent}" stroke-width="5" stroke-linecap="round"/><circle r="3.5" fill="#334155"/>`;
    case 'balloon': return `<ellipse cy="-7" rx="21" ry="28" fill="#60a5fa" stroke="#1d4ed8" stroke-width="3.5"/><path d="M-4 20 0 28l5-8ZM0 28c-16 14 12 23-6 37" fill="none" stroke="#475569" stroke-width="3"/>`;
    case 'cat': return `<path d="M-26-15-18-33-7-23C0-27 7-27 14-23l13-10 3 22c7 27-13 42-30 42-22 0-36-19-26-46Z" fill="#fdba74" stroke="#9a3412" stroke-width="3.5"/><circle cx="-10" cy="-4" r="3.5"/><circle cx="11" cy="-4" r="3.5"/><path d="M-5 7Q0 12 5 7M-31 5h16M15 5h17" fill="none" stroke="#7c2d12" stroke-width="2.5" stroke-linecap="round"/>`;
    case 'fish': return `<path d="M-27 0C-14-20 16-21 29 0 16 21-14 20-27 0Z" fill="#38bdf8" stroke="#0369a1" stroke-width="3.5"/><path d="M-27 0-44-17v34Z" fill="#7dd3fc" stroke="#0369a1" stroke-width="3.5"/><circle cx="14" cy="-5" r="3.5" fill="#0f172a"/>`;
    case 'book': return `<path d="M-31-24C-14-29-5-24 0-16v43c-8-7-18-9-31-5ZM31-24C14-29 5-24 0-16v43c8-7 18-9 31-5Z" fill="#f8fafc" stroke="#475569" stroke-width="3.5"/><path d="M0-16v43" stroke="${accent}" stroke-width="3.5"/>`;
    case 'cake': return `<path d="M-29 0h58v27c0 7-5 11-13 11h-32c-8 0-13-4-13-11Z" fill="#f9a8d4" stroke="#be185d" stroke-width="3.5"/><path d="M-31 0c5-14 13-20 31-20S26-14 31 0Z" fill="#fff" stroke="#be185d" stroke-width="3.5"/><circle cy="-24" r="6" fill="#ef4444"/>`;
    case 'gamepad': return `<path d="M-36 1c5-29 18-38 36-23 18-15 31-6 36 23l-2 25c-1 9-13 12-19 4L4 18h-8l-11 12c-6 8-18 5-19-4Z" fill="#64748b" stroke="#1e293b" stroke-width="4"/><path d="M-21-3h14M-14-10V4" stroke="#fff" stroke-width="4" stroke-linecap="round"/><circle cx="17" cy="-6" r="4" fill="#f87171"/><circle cx="26" cy="4" r="4" fill="#fde047"/>`;
    case 'umbrella': return `<path d="M-34 0Q0-40 34 0Z" fill="#fb7185" stroke="#be123c" stroke-width="3.5"/><path d="M0 0v31c0 13 18 13 18 1" fill="none" stroke="#475569" stroke-width="4" stroke-linecap="round"/><path d="M-34 0Q-17-14 0 0Q17-14 34 0" fill="none" stroke="#fff" stroke-width="2.5"/>`;
    case 'apple': return `<path d="M0-20c22-10 35 6 30 26-6 24-18 33-30 24-12 9-24 0-30-24-5-20 8-36 30-26Z" fill="#ef4444" stroke="#991b1b" stroke-width="3.5"/><path d="M0-20c1-12 7-19 17-23" fill="none" stroke="#78350f" stroke-width="4"/><path d="M8-33c10-5 17-2 21 5-11 4-18 2-21-5Z" fill="#22c55e"/>`;
    case 'rocket': return `<path d="M0-37C22-19 22 11 0 28-22 11-22-19 0-37Z" fill="#f8fafc" stroke="#334155" stroke-width="3.5"/><circle cy="-8" r="9" fill="#60a5fa" stroke="#1d4ed8" stroke-width="2.5"/><path d="M-15 16-30 29l17 2M15 16l30 13-17 2M-8 28 0 43l8-15" fill="#fb7185" stroke="#be123c" stroke-width="3.5"/>`;
    case 'moon': return `<path d="M19-29C-5-18-10 13 14 28-21 32-39 5-27-20-18-38 4-43 19-29Z" fill="#fde68a" stroke="#ca8a04" stroke-width="3.5"/>`;
    case 'camera': return `<rect x="-34" y="-22" width="68" height="47" rx="9" fill="#475569" stroke="#0f172a" stroke-width="3.5"/><path d="M-16-22-8-32h21l8 10" fill="#64748b" stroke="#0f172a" stroke-width="3.5"/><circle r="15" fill="#bae6fd" stroke="#0f172a" stroke-width="4"/><circle cx="23" cy="-10" r="4.5" fill="#f87171"/>`;
    case 'mushroom': return `<path d="M-31-5C-28-31-12-39 0-39S28-31 31-5Z" fill="#ef4444" stroke="#991b1b" stroke-width="3.5"/><circle cx="-12" cy="-18" r="5" fill="#fff"/><circle cx="12" cy="-24" r="6" fill="#fff"/><path d="M-12-5h24l6 35c-10 9-26 9-36 0Z" fill="#fef3c7" stroke="#92400e" stroke-width="3.5"/>`;
    case 'flower': return `<g fill="#f472b6" stroke="#be185d" stroke-width="2.5"><circle cy="-18" r="12"/><circle cx="17" cy="-4" r="12"/><circle cx="11" cy="15" r="12"/><circle cx="-11" cy="15" r="12"/><circle cx="-17" cy="-4" r="12"/></g><circle r="10" fill="#fde047"/><path d="M0 24v22" stroke="#15803d" stroke-width="4"/>`;
    case 'bottle': return `<path d="M-11-34h22v13l8 10v42c0 6-5 10-11 10H-8c-6 0-11-4-11-10v-42l8-10Z" fill="#a7f3d0" stroke="#047857" stroke-width="3.5"/><rect x="-16" y="4" width="32" height="17" rx="3" fill="#fff" opacity=".9"/>`;
    case 'gift': return `<rect x="-30" y="-12" width="60" height="43" rx="5" fill="#fb7185" stroke="#be123c" stroke-width="3.5"/><rect x="-35" y="-22" width="70" height="14" rx="5" fill="#fda4af" stroke="#be123c" stroke-width="3.5"/><path d="M0-22v53" stroke="#fde047" stroke-width="7"/><path d="M0-22C-21-16-26-39-11-41 0-42 0-22 0-22ZM0-22C21-16 26-39 11-41 0-42 0-22 0-22Z" fill="#fde047" stroke="#ca8a04" stroke-width="2.5"/>`;
    case 'crown': return `<path d="M-32-18-18 4 0-23 18 4 32-18 26 25h-52Z" fill="#fde047" stroke="#ca8a04" stroke-width="3.5"/><circle cx="-18" cy="5" r="3.5" fill="#fb7185"/><circle cy="2" r="3.5" fill="#60a5fa"/><circle cx="18" cy="5" r="3.5" fill="#4ade80"/>`;
    default: return `<circle r="24" fill="${accent}" opacity=".76"/><circle r="9" fill="#fff"/>`;
  }
}

function renderBodies(puzzle, random) {
  const assets = shuffled(BODY_ASSETS, random).slice(0, puzzle.themeId === 'body-guide' ? 4 : 2);
  const slots = puzzle.themeId === 'body-guide'
    ? [{x:115,y:128,w:112,h:150},{x:265,y:116,w:126,h:166},{x:430,y:96,w:144,h:188},{x:600,y:76,w:162,h:212}]
    : [{x:265,y:152,w:150,h:194},{x:455,y:168,w:128,h:168}];
  return assets.map((asset,index) => {
    const slot = slots[index] || slots[0];
    const x = puzzle.mirrored ? W - slot.x - slot.w : slot.x;
    return `<image href="/pets/${asset}.svg" x="${x}" y="${slot.y}" width="${slot.w}" height="${slot.h}" preserveAspectRatio="xMidYMid meet" opacity=".97"/>`;
  }).join('');
}

function renderDecoys(theme, puzzle, random) {
  const pool = [...new Set([...theme.pool,'star','heart','clock','camera','gift','apple','cup','flower','book'])];
  const count = 18 + (Number(puzzle.variant || 0) % 5);
  let result = '';
  for (let i=0;i<count;i+=1) {
    const type = pool[Math.floor(random()*pool.length)] || 'star';
    let x = 32 + random()*736;
    const y = 52 + random()*410;
    if (puzzle.mirrored) x = W - x;
    const scale = .24 + random()*.22;
    const rotate = Math.round((random()-.5)*24);
    result += `<g opacity="${(.38+random()*.28).toFixed(2)}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rotate}) scale(${scale.toFixed(2)})">${symbolMarkup(type,theme.accent)}</g>`;
  }
  return result;
}

function subtleDetail(mode, changed, difficulty, accent) {
  const hard = difficulty === 'hard';
  const normal = difficulty === 'normal';
  const size = hard ? 3.4 : normal ? 4.7 : 6.2;
  switch(mode % 8) {
    case 0: return changed
      ? `<circle cx="-12" cy="-18" r="${size}" fill="#fff" stroke="#334155" stroke-width="2"/>`
      : `<circle cx="-12" cy="-18" r="${size}" fill="#fff" stroke="#334155" stroke-width="2"/><circle cx="9" cy="-19" r="${size*.72}" fill="#fff" stroke="#334155" stroke-width="2"/>`;
    case 1: return `<path d="M${changed?'-15':'15'} -27v13" stroke="${accent}" stroke-width="${hard?3:4}" stroke-linecap="round"/>`;
    case 2: return changed ? '' : `<path d="M17-23l3 7 8 1-6 5 2 8-7-4-7 4 2-8-6-5 8-1Z" fill="#fde047" stroke="#92400e" stroke-width="1.5"/>`;
    case 3: return changed
      ? `<path d="M-15 23h12" stroke="#334155" stroke-width="${hard?2.5:3.5}" stroke-linecap="round"/>`
      : `<path d="M-15 23h12M4 23h12" stroke="#334155" stroke-width="${hard?2.5:3.5}" stroke-linecap="round"/>`;
    case 4: return `<circle cx="${changed?17:-17}" cy="19" r="${size}" fill="none" stroke="#0f172a" stroke-width="2.5"/>`;
    case 5: return `<path d="M-9-28 0 ${changed?-19:-23} 9-28" fill="none" stroke="${changed?'#64748b':accent}" stroke-width="${hard?2.5:3.5}" stroke-linecap="round"/>`;
    case 6: return changed
      ? `<circle cx="18" cy="-21" r="${size*.75}" fill="#334155"/>`
      : `<circle cx="18" cy="-21" r="${size*.75}" fill="#334155"/><circle cx="20" cy="-23" r="${size*.27}" fill="#fff"/>`;
    default: return `<path d="M-18 ${changed?29:25}q18 ${changed?-8:8} 36 0" fill="none" stroke="#475569" stroke-width="${hard?2.2:3.2}" stroke-linecap="round"/>`;
  }
}

function renderCandidate(type, hitbox, index, changed, accent) {
  const x = hitbox.x * W;
  const y = hitbox.y * H;
  const scale = hitbox.difficulty === 'hard' ? .53 : hitbox.difficulty === 'normal' ? .60 : .68;
  const rotation = ((index * 13) % 17) - 8;
  const base = symbolMarkup(type, accent);
  const detail = subtleDetail(index, changed, hitbox.difficulty, accent);
  return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rotation}) scale(${scale})">${base}${detail}</g>`;
}

export function spotDifferenceThemeLabel(themeId) {
  return (THEMES[themeId] || THEMES['lego-room']).label;
}

export function spotDifferenceHitIdAt(puzzle, xValue, yValue) {
  if (!puzzle || !Array.isArray(puzzle.differenceIds)) return null;
  const x = Math.max(0, Math.min(1, Number(xValue) || 0));
  const y = Math.max(0, Math.min(1, Number(yValue) || 0));
  let best = null;
  for (const id of puzzle.differenceIds) {
    const base = SPOT_CLIENT_HITBOXES.find((item) => item.id === id);
    if (!base) continue;
    const hx = puzzle.mirrored ? 1 - base.x : base.x;
    const dist = Math.hypot(x - hx, y - base.y);
    if (dist <= base.r && (!best || dist < best.dist)) best = { id, dist };
  }
  return best?.id || null;
}

export function renderSpotDifferenceScene(puzzle, { changed=false, foundIds=[], revealAll=false, ariaLabel='' }={}) {
  if (!puzzle) return '';
  const theme = THEMES[puzzle.themeId] || THEMES['lego-room'];
  const random = seededRandom(Number(puzzle.seed || 1) + Number(puzzle.variant || 0) * 7919);
  const pool = shuffled([...new Set([...theme.pool,'star','heart','clock','camera','gift','apple','cup','rocket','flower','book'])], random);
  const hitboxes = SPOT_CLIENT_HITBOXES.map((base) => ({ ...base, x: puzzle.mirrored ? 1-base.x : base.x }));
  const symbols = hitboxes.map((_,index) => pool[(index + Math.floor(random()*pool.length)) % pool.length]);
  const differences = new Set(Array.isArray(puzzle.differenceIds) ? puzzle.differenceIds : []);
  const found = new Set(Array.isArray(foundIds) ? foundIds : []);
  const background = themeBackground(puzzle.themeId,puzzle.variant);
  const decoys = renderDecoys(theme,puzzle,random);
  const bodies = renderBodies(puzzle,random);
  const objects = hitboxes.map((hitbox,index) => renderCandidate(symbols[index],hitbox,index,Boolean(changed && differences.has(hitbox.id)),theme.accent)).join('');
  const answers = hitboxes.filter((hitbox) => differences.has(hitbox.id) && (revealAll || found.has(hitbox.id))).map((hitbox) => {
    const radius = Math.max(20, hitbox.r * W * .76);
    return `<circle cx="${hitbox.x*W}" cy="${hitbox.y*H}" r="${radius}" fill="none" stroke="#ef4444" stroke-width="7"/><circle cx="${hitbox.x*W}" cy="${hitbox.y*H}" r="${Math.max(9,radius-10)}" fill="none" stroke="#fff" stroke-width="2.5" opacity=".92"/>`;
  }).join('');
  const label = String(ariaLabel || theme.label).replace(/[&<>\"]/g,'');
  return `<svg class="spot-scene-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}">${background}${decoys}${bodies}${objects}<rect x="12" y="12" width="776" height="496" rx="20" fill="none" stroke="#0f172a" stroke-opacity=".14" stroke-width="4"/>${answers}</svg>`;
}
