const W = 800;
const H = 520;

export const SPOT_CLIENT_HITBOXES = Object.freeze([
  { id: 'd0', x: 0.10, y: 0.15, r: 0.065 }, { id: 'd1', x: 0.27, y: 0.14, r: 0.060 },
  { id: 'd2', x: 0.46, y: 0.15, r: 0.060 }, { id: 'd3', x: 0.66, y: 0.14, r: 0.060 },
  { id: 'd4', x: 0.85, y: 0.16, r: 0.060 }, { id: 'd5', x: 0.18, y: 0.34, r: 0.064 },
  { id: 'd6', x: 0.38, y: 0.34, r: 0.062 }, { id: 'd7', x: 0.58, y: 0.35, r: 0.062 },
  { id: 'd8', x: 0.79, y: 0.34, r: 0.064 }, { id: 'd9', x: 0.10, y: 0.55, r: 0.064 },
  { id: 'd10', x: 0.30, y: 0.54, r: 0.062 }, { id: 'd11', x: 0.49, y: 0.55, r: 0.062 },
  { id: 'd12', x: 0.69, y: 0.54, r: 0.062 }, { id: 'd13', x: 0.88, y: 0.55, r: 0.060 },
  { id: 'd14', x: 0.19, y: 0.75, r: 0.067 }, { id: 'd15', x: 0.40, y: 0.74, r: 0.064 },
  { id: 'd16', x: 0.62, y: 0.75, r: 0.064 }, { id: 'd17', x: 0.82, y: 0.74, r: 0.067 }
]);

const THEMES = Object.freeze({
  'body-guide': { label: '전자부품 도감', sky: '#fff7ed', floor: '#fde68a', accent: '#ea580c', pool: ['crown','heart','star','apple','cake','cat','balloon','flower','book','moon','gift','clock'] },
  'lego-room': { label: '식물 세밀화', sky: '#eff6ff', floor: '#e7e5e4', accent: '#2563eb', pool: ['clock','plant','book','cup','cat','gamepad','camera','gift','heart','cake','star','moon'] },
  convenience: { label: '빈티지 지도', sky: '#ecfdf5', floor: '#d1fae5', accent: '#059669', pool: ['bottle','apple','cake','cup','camera','gift','star','mushroom','book','heart','clock','balloon'] },
  beach: { label: '카메라 작업대', sky: '#e0f2fe', floor: '#fef3c7', accent: '#0284c7', pool: ['sun','cloud','fish','umbrella','balloon','apple','star','moon','camera','bottle','heart','flower'] },
  'game-room': { label: '카페 바', sky: '#f5f3ff', floor: '#ddd6fe', accent: '#7c3aed', pool: ['gamepad','star','rocket','camera','cup','clock','moon','heart','crown','gift','book','balloon'] },
  picnic: { label: '캠핑 장비', sky: '#f0fdf4', floor: '#bbf7d0', accent: '#16a34a', pool: ['sun','cloud','flower','apple','cake','cat','balloon','umbrella','heart','book','bottle','star'] },
  camping: { label: '서재', sky: '#fefce8', floor: '#d9f99d', accent: '#65a30d', pool: ['moon','star','mushroom','bottle','cup','fish','book','apple','camera','heart','cloud','rocket'] },
  cafe: { label: '실험실', sky: '#fff7ed', floor: '#fed7aa', accent: '#c2410c', pool: ['cup','cake','plant','book','clock','camera','heart','flower','apple','cat','gift','star'] },
  festival: { label: '야시장 진열대', sky: '#fdf2f8', floor: '#fbcfe8', accent: '#db2777', pool: ['balloon','gift','star','crown','cake','heart','camera','apple','rocket','flower','moon','cup'] },
  'space-lab': { label: '우주 관측실', sky: '#eef2ff', floor: '#c7d2fe', accent: '#4338ca', pool: ['rocket','moon','star','gamepad','bottle','clock','camera','crown','heart','plant','fish','gift'] }
});


const SPOT_ATLAS_LEGACY_VERSION = 2;
const SPOT_ATLAS_ASSET_VERSION = 4;
const SPOT_ATLAS_CACHE_VERSION = '610119';

export function spotDifferenceAssetUrls(puzzle) {
  const assetVersion = Number(puzzle?.assetVersion || 0);
  if (![SPOT_ATLAS_LEGACY_VERSION, 3, SPOT_ATLAS_ASSET_VERSION].includes(assetVersion)) return null;
  const themeId = Object.prototype.hasOwnProperty.call(THEMES, puzzle.themeId) ? puzzle.themeId : 'body-guide';
  const variant = Math.max(0, Math.min(1, Number(puzzle.variant || 0) | 0));
  const root = `/spot-atlas/${themeId}-${variant}`;
  const original = `${root}-base.webp?v=${SPOT_ATLAS_CACHE_VERSION}`;
  return {
    original,
    // v3는 원본 한 장 위에 서버가 선택한 7개 차이를 SVG로 합성한다. v2 진행방만 기존 changed WebP를 사용한다.
    changed: assetVersion === SPOT_ATLAS_LEGACY_VERSION ? `${root}-changed.webp?v=${SPOT_ATLAS_CACHE_VERSION}` : original
  };
}

const atlasPreload = new Map();
export function preloadSpotDifferenceSceneAssets(puzzle) {
  const urls = spotDifferenceAssetUrls(puzzle);
  if (!urls || typeof Image === 'undefined') return Promise.resolve(false);
  const tasks = Object.values(urls).map((url) => {
    if (atlasPreload.has(url)) return atlasPreload.get(url);
    const task = new Promise((resolve) => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => resolve(true);
      image.onerror = () => resolve(false);
      image.src = url;
      if (typeof image.decode === 'function') image.decode().then(() => resolve(true)).catch(() => {});
    });
    atlasPreload.set(url, task);
    return task;
  });
  return Promise.all(tasks).then((values) => values.every(Boolean));
}

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
  const common = `<rect width="800" height="520" rx="24" fill="${theme.sky}"/><rect y="360" width="800" height="160" fill="${theme.floor}"/><path d="M0 360H800" stroke="#334155" stroke-opacity=".12" stroke-width="3"/>`;
  if (themeId === 'beach') return `${common}<circle cx="688" cy="68" r="34" fill="#fde047"/><path d="M0 300 Q105 ${270 + v * 5} 210 300 T420 300 T630 300 T840 300 V360 H0Z" fill="#7dd3fc"/><path d="M0 329 Q110 300 220 329 T440 329 T660 329 T880 329" fill="none" stroke="#f8fafc" stroke-width="10" opacity=".8"/>`;
  if (themeId === 'space-lab') return `${common}<rect x="36" y="36" width="728" height="278" rx="30" fill="#111827" opacity=".92"/><circle cx="120" cy="88" r="4" fill="#fff"/><circle cx="246" cy="128" r="3" fill="#fff"/><circle cx="596" cy="78" r="5" fill="#fff"/><circle cx="700" cy="166" r="3" fill="#fff"/><circle cx="412" cy="82" r="38" fill="#818cf8"/><path d="M364 84c34 16 82 16 109-2" fill="none" stroke="#f8fafc" stroke-width="8" opacity=".65"/>`;
  if (themeId === 'camping') return `${common}<path d="M0 250 120 120l86 94 100-128 126 164 98-116 144 116 126-90v200H0Z" fill="#86efac" opacity=".65"/><path d="M330 360 430 205l102 155Z" fill="#fb923c"/><path d="M430 205v155" stroke="#7c2d12" stroke-width="6"/>`;
  if (themeId === 'picnic') return `${common}<path d="M0 315Q120 240 245 315T500 315T800 305V360H0Z" fill="#86efac"/><rect x="298" y="382" width="204" height="86" rx="12" fill="#fff" opacity=".72"/><path d="M298 410h204M350 382v86M446 382v86" stroke="#ef4444" stroke-opacity=".55" stroke-width="9"/>`;
  if (themeId === 'game-room') return `${common}<rect x="92" y="58" width="616" height="228" rx="24" fill="#1e1b4b"/><rect x="126" y="88" width="548" height="158" rx="14" fill="#111827"/><path d="M150 214l72-68 67 46 88-86 78 70 66-50 125 88" fill="none" stroke="#a78bfa" stroke-width="8"/><rect x="344" y="286" width="112" height="74" rx="12" fill="#475569"/>`;
  if (themeId === 'convenience') return `${common}<rect x="62" y="56" width="676" height="265" rx="18" fill="#fff"/><path d="M84 116h632M84 184h632M84 252h632" stroke="#94a3b8" stroke-width="8"/><path d="M172 56v265M318 56v265M478 56v265M626 56v265" stroke="#cbd5e1" stroke-width="5"/>`;
  if (themeId === 'cafe') return `${common}<rect x="58" y="48" width="252" height="232" rx="18" fill="#bae6fd"/><path d="M184 48v232M58 164h252" stroke="#fff" stroke-width="12"/><rect x="516" y="76" width="178" height="164" rx="18" fill="#fff" opacity=".82"/><path d="M548 118h112M548 154h92M548 190h104" stroke="#c2410c" stroke-width="9" stroke-linecap="round" opacity=".45"/>`;
  if (themeId === 'festival') return `${common}<path d="M24 58 780 58" stroke="#475569" stroke-width="4"/><path d="M70 60 104 118 138 60ZM184 60l34 58 34-58ZM300 60l34 58 34-58ZM420 60l34 58 34-58ZM540 60l34 58 34-58ZM660 60l34 58 34-58Z" fill="#f472b6"/><rect x="86" y="268" width="628" height="92" rx="16" fill="#fff" opacity=".7"/>`;
  if (themeId === 'body-guide') return `${common}<rect x="54" y="48" width="692" height="278" rx="22" fill="#fff" opacity=".75"/><path d="M145 291v-132M285 291V128M425 291V96M565 291V68M705 291V42" stroke="#cbd5e1" stroke-width="3" stroke-dasharray="7 8"/><text x="400" y="337" text-anchor="middle" font-size="18" font-family="system-ui,sans-serif" font-weight="800" fill="#9a3412">체형 비교 구역</text>`;
  return `${common}<rect x="54" y="48" width="280" height="200" rx="18" fill="#bfdbfe"/><path d="M194 48v200M54 148h280" stroke="#fff" stroke-width="10"/><rect x="514" y="72" width="202" height="220" rx="18" fill="#fff" opacity=".72"/><rect x="104" y="292" width="228" height="68" rx="20" fill="#94a3b8" opacity=".55"/>`;
}

function symbolMarkup(type, accent = '#2563eb') {
  switch (type) {
    case 'sun': return `<circle r="22" fill="#facc15"/><g stroke="#f59e0b" stroke-width="6" stroke-linecap="round"><path d="M0-35V-47M0 35v12M-35 0h-12M35 0h12M-25-25l-9-9M25 25l9 9M25-25l9-9M-25 25l-9 9"/></g>`;
    case 'cloud': return `<path d="M-34 15h62c15 0 21-21 8-29-5-3-11-4-16-2-4-15-22-22-35-13-6 4-9 10-9 17-19-4-29 24-10 27Z" fill="#fff" stroke="#94a3b8" stroke-width="4"/>`;
    case 'star': return `<path d="M0-31 9-10 32-8 14 7 20 30 0 17-20 30-14 7-32-8-9-10Z" fill="#fde047" stroke="#ca8a04" stroke-width="4"/>`;
    case 'heart': return `<path d="M0 28C-34 7-43-9-34-24-24-40-5-34 0-21 5-34 24-40 34-24 43-9 34 7 0 28Z" fill="#fb7185" stroke="#be123c" stroke-width="4"/>`;
    case 'cup': return `<path d="M-24-19h46v36c0 12-8 19-23 19S-24 29-24 17Z" fill="#fff" stroke="#78350f" stroke-width="5"/><path d="M22-10h12c18 0 18 25 0 25H22" fill="none" stroke="#78350f" stroke-width="5"/><path d="M-13-27c-8-10 7-12 0-22M5-27c-7-10 8-12 1-22" fill="none" stroke="#94a3b8" stroke-width="4"/>`;
    case 'plant': return `<path d="M0 17C-5-4-18-16-31-19c1 18 10 31 31 36ZM0 17C5-4 18-16 31-19c-1 18-10 31-31 36ZM0 12C-2-10 7-27 19-35 6-35-8-21 0 12Z" fill="#4ade80" stroke="#15803d" stroke-width="3"/><path d="M-22 18h44l-7 25h-30Z" fill="#fb923c" stroke="#9a3412" stroke-width="4"/>`;
    case 'clock': return `<circle r="31" fill="#fff" stroke="#334155" stroke-width="5"/><path d="M0 0V-18M0 0l14 9" stroke="${accent}" stroke-width="6" stroke-linecap="round"/><circle r="4" fill="#334155"/>`;
    case 'balloon': return `<ellipse cy="-8" rx="24" ry="31" fill="#60a5fa" stroke="#1d4ed8" stroke-width="4"/><path d="M-4 23 0 31l5-8ZM0 31c-18 16 13 26-7 41" fill="none" stroke="#475569" stroke-width="3"/>`;
    case 'cat': return `<path d="M-29-17-20-37-8-25C0-30 8-30 16-25l14-12 4 24c8 30-14 47-34 47-24 0-40-21-29-51Z" fill="#fdba74" stroke="#9a3412" stroke-width="4"/><circle cx="-11" cy="-5" r="4"/><circle cx="12" cy="-5" r="4"/><path d="M-5 8Q0 14 5 8M-34 5h18M16 5h19" fill="none" stroke="#7c2d12" stroke-width="3" stroke-linecap="round"/>`;
    case 'fish': return `<path d="M-29 0C-15-22 18-23 31 0 18 23-15 22-29 0Z" fill="#38bdf8" stroke="#0369a1" stroke-width="4"/><path d="M-29 0-48-19v38Z" fill="#7dd3fc" stroke="#0369a1" stroke-width="4"/><circle cx="16" cy="-6" r="4" fill="#0f172a"/>`;
    case 'book': return `<path d="M-35-27C-16-32-6-27 0-18v48c-9-8-20-10-35-6ZM35-27C16-32 6-27 0-18v48c9-8 20-10 35-6Z" fill="#f8fafc" stroke="#475569" stroke-width="4"/><path d="M0-18v48" stroke="${accent}" stroke-width="4"/>`;
    case 'cake': return `<path d="M-32 0h64v30c0 8-6 12-14 12h-36c-8 0-14-4-14-12Z" fill="#f9a8d4" stroke="#be185d" stroke-width="4"/><path d="M-34 0c5-16 14-23 34-23S29-16 34 0Z" fill="#fff" stroke="#be185d" stroke-width="4"/><path d="M0-23v-18" stroke="#78350f" stroke-width="5"/><path d="M0-44c8 4 7 12 0 15-7-3-8-11 0-15Z" fill="#facc15"/>`;
    case 'gamepad': return `<path d="M-36 1c4-24 14-32 36-26 22-6 32 2 36 26l7 31c3 14-14 21-23 9L8 24H-8l-12 17c-9 12-26 5-23-9Z" fill="#334155" stroke="#0f172a" stroke-width="4"/><path d="M-20-3v20M-30 7h20" stroke="#fff" stroke-width="5"/><circle cx="21" cy="1" r="5" fill="#f472b6"/><circle cx="30" cy="12" r="5" fill="#4ade80"/>`;
    case 'umbrella': return `<path d="M-38 0Q0-45 38 0Z" fill="#fb7185" stroke="#be123c" stroke-width="4"/><path d="M0 0v34c0 15 20 15 20 1" fill="none" stroke="#475569" stroke-width="5" stroke-linecap="round"/><path d="M-38 0Q-18-16 0 0Q18-16 38 0" fill="none" stroke="#fff" stroke-width="3"/>`;
    case 'apple': return `<path d="M0-22c25-11 39 7 33 29-7 27-20 37-33 27-13 10-26 0-33-27-6-22 8-40 33-29Z" fill="#ef4444" stroke="#991b1b" stroke-width="4"/><path d="M0-22c1-13 8-21 19-25" fill="none" stroke="#78350f" stroke-width="5"/><path d="M9-36c11-5 19-2 23 6-12 4-20 2-23-6Z" fill="#22c55e"/>`;
    case 'rocket': return `<path d="M0-42C25-22 25 12 0 31-25 12-25-22 0-42Z" fill="#f8fafc" stroke="#334155" stroke-width="4"/><circle cy="-9" r="10" fill="#60a5fa" stroke="#1d4ed8" stroke-width="3"/><path d="M-17 18-34 33l19 2M17 18l34 15-19 2M-9 31 0 48l9-17" fill="#fb7185" stroke="#be123c" stroke-width="4"/>`;
    case 'moon': return `<path d="M21-32C-5-20-11 14 15 31-23 35-43 5-30-22-20-42 4-48 21-32Z" fill="#fde68a" stroke="#ca8a04" stroke-width="4"/>`;
    case 'camera': return `<rect x="-38" y="-24" width="76" height="52" rx="10" fill="#475569" stroke="#0f172a" stroke-width="4"/><path d="M-18-24-9-36h23l9 12" fill="#64748b" stroke="#0f172a" stroke-width="4"/><circle r="17" fill="#bae6fd" stroke="#0f172a" stroke-width="5"/><circle cx="25" cy="-11" r="5" fill="#f87171"/>`;
    case 'mushroom': return `<path d="M-35-6C-32-34-13-44 0-44S32-34 35-6Z" fill="#ef4444" stroke="#991b1b" stroke-width="4"/><circle cx="-14" cy="-20" r="6" fill="#fff"/><circle cx="14" cy="-27" r="7" fill="#fff"/><path d="M-14-6h28l7 39c-11 10-31 10-42 0Z" fill="#fef3c7" stroke="#92400e" stroke-width="4"/>`;
    case 'flower': return `<g fill="#f472b6" stroke="#be185d" stroke-width="3"><circle cy="-20" r="14"/><circle cx="19" cy="-5" r="14"/><circle cx="12" cy="17" r="14"/><circle cx="-12" cy="17" r="14"/><circle cx="-19" cy="-5" r="14"/></g><circle r="12" fill="#fde047"/><path d="M0 27v24" stroke="#15803d" stroke-width="5"/>`;
    case 'bottle': return `<path d="M-12-38h24v14l9 12v47c0 7-5 11-12 11H-9c-7 0-12-4-12-11v-47l9-12Z" fill="#a7f3d0" stroke="#047857" stroke-width="4"/><rect x="-18" y="4" width="36" height="19" rx="3" fill="#fff" opacity=".9"/>`;
    case 'gift': return `<rect x="-34" y="-14" width="68" height="49" rx="5" fill="#fb7185" stroke="#be123c" stroke-width="4"/><rect x="-39" y="-25" width="78" height="16" rx="5" fill="#fda4af" stroke="#be123c" stroke-width="4"/><path d="M0-25v60" stroke="#fde047" stroke-width="8"/><path d="M0-25C-24-18-30-44-12-46 0-47 0-25 0-25ZM0-25C24-18 30-44 12-46 0-47 0-25 0-25Z" fill="#fde047" stroke="#ca8a04" stroke-width="3"/>`;
    case 'crown': return `<path d="M-36-21-20 5 0-26 20 5 36-21 29 28h-58Z" fill="#fde047" stroke="#ca8a04" stroke-width="4"/><circle cx="-20" cy="5" r="4" fill="#fb7185"/><circle cy="2" r="4" fill="#60a5fa"/><circle cx="20" cy="5" r="4" fill="#4ade80"/>`;
    default: return `<circle r="28" fill="${accent}" opacity=".75"/><circle r="11" fill="#fff"/>`;
  }
}

function dynamicAtlasDifferenceMarkup(puzzle, imageHref) {
  const assetVersion = Number(puzzle?.assetVersion || 0);
  if (assetVersion < 3 || !imageHref) return '';
  const ids = new Set(Array.isArray(puzzle?.differenceIds) ? puzzle.differenceIds : []);
  const seedBase = Number(puzzle?.seed || 1);
  const selected = SPOT_CLIENT_HITBOXES.filter((hitbox) => ids.has(hitbox.id));
  const defs = [];
  const patches = [];

  for (const base of selected) {
    const index = Number(base.id.slice(1)) || 0;
    const random = seededRandom(seedBase + (index + 1) * 104729);
    // 같은 후보 지점이라도 매판 중심이 조금씩 달라져 좌표 암기를 어렵게 한다.
    const x = Math.max(30, Math.min(W - 30, base.x * W + (random() - .5) * 18));
    const y = Math.max(30, Math.min(H - 30, base.y * H + (random() - .5) * 14));
    const rx = 25 + random() * 13;
    const ry = 21 + random() * 11;
    const mode = Math.floor(random() * 5);
    const dx = (random() > .5 ? 1 : -1) * (7 + random() * 10);
    const dy = (random() - .5) * 9;
    const uid = `spot-mutation-${seedBase}-${index}`;
    defs.push(`<clipPath id="${uid}"><ellipse cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" rx="${rx.toFixed(2)}" ry="${ry.toFixed(2)}"/></clipPath>`);

    // 임의의 세모/점/숫자를 추가하지 않는다. 원본 이미지의 실제 픽셀을 국소적으로
    // 이동·반전·확대해 부품/문양/선/글자 같은 기존 요소 자체가 달라지게 만든다.
    let transform = `translate(${dx.toFixed(2)} ${dy.toFixed(2)})`;
    if (mode === 1) {
      transform = `translate(${(2 * x).toFixed(2)} 0) scale(-1 1) translate(${dx.toFixed(2)} ${dy.toFixed(2)})`;
    } else if (mode === 2) {
      const scale = 1.055 + random() * .035;
      transform = `translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${scale.toFixed(4)}) translate(${(-x + dx).toFixed(2)} ${(-y + dy).toFixed(2)})`;
    } else if (mode === 3) {
      const angle = (random() > .5 ? 1 : -1) * (3.5 + random() * 3.5);
      transform = `rotate(${angle.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)}) translate(${dx.toFixed(2)} ${dy.toFixed(2)})`;
    } else if (mode === 4) {
      // 아주 작은 위치 교환: 근처의 실제 질감을 가져와 선/부품 하나가 없어진 것처럼 보이게 한다.
      transform = `translate(${(dx * 1.45).toFixed(2)} ${(dy + (random() - .5) * 8).toFixed(2)})`;
    }
    patches.push(`<g clip-path="url(#${uid})" opacity=".98"><image href="${imageHref}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="none" transform="${transform}"/></g>`);
  }

  return `${defs.length ? `<defs>${defs.join('')}</defs>` : ''}${patches.join('')}`;
}

function renderCandidate(type, hitbox, index, changed, accent) {
  const x = hitbox.x * W;
  const y = hitbox.y * H;
  const mode = index % 6;
  const base = symbolMarkup(type, accent);
  if (!changed) return `<g transform="translate(${x} ${y})">${base}</g>`;
  if (mode === 0) return '';
  if (mode === 1) return `<g transform="translate(${x} ${y})" opacity=".42">${base}</g>`;
  if (mode === 2) return `<g transform="translate(${x} ${y}) rotate(180)">${base}</g>`;
  if (mode === 3) return `<g transform="translate(${x - 13} ${y}) scale(.82)">${base}</g><g transform="translate(${x + 24} ${y + 13}) scale(.48)">${base}</g>`;
  if (mode === 4) return `<g transform="translate(${x} ${y}) scale(.62)">${base}</g>`;
  return `<g transform="translate(${x} ${y})">${base}<circle cx="27" cy="-27" r="9" fill="#111827"/><circle cx="27" cy="-27" r="3" fill="#fff"/></g>`;
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

export function renderSpotDifferenceAnswerMarks(puzzle, foundIds = [], revealAll = false) {
  if (!puzzle) return '';
  const differences = new Set(Array.isArray(puzzle.differenceIds) ? puzzle.differenceIds : []);
  const found = new Set(Array.isArray(foundIds) ? foundIds : []);
  return SPOT_CLIENT_HITBOXES
    .map((base) => ({ ...base, x: puzzle.mirrored ? 1 - base.x : base.x }))
    .filter((hitbox) => differences.has(hitbox.id) && (revealAll || found.has(hitbox.id)))
    .map((hitbox) => {
      const radius = Math.max(25, hitbox.r * W * .82);
      return `<g data-spot-answer-id="${hitbox.id}"><circle cx="${hitbox.x * W}" cy="${hitbox.y * H}" r="${radius}" fill="none" stroke="#ef4444" stroke-width="8"/><circle cx="${hitbox.x * W}" cy="${hitbox.y * H}" r="${Math.max(10, radius - 12)}" fill="none" stroke="#fff" stroke-width="3" opacity=".92"/></g>`;
    }).join('');
}

export function renderSpotDifferenceScene(puzzle, { changed = false, foundIds = [], revealAll = false, ariaLabel = '' } = {}) {
  if (!puzzle) return '';
  const theme = THEMES[puzzle.themeId] || THEMES['lego-room'];
  const atlasUrls = spotDifferenceAssetUrls(puzzle);
  if (atlasUrls) {
    const assetVersion = Number(puzzle.assetVersion || 0);
    const href = changed ? atlasUrls.changed : atlasUrls.original;
    const transform = puzzle.mirrored ? ` transform="translate(${W} 0) scale(-1 1)"` : '';
    const dynamicDifferences = changed && assetVersion >= 3 ? dynamicAtlasDifferenceMarkup(puzzle, href) : '';
    const answers = renderSpotDifferenceAnswerMarks(puzzle, foundIds, revealAll);
    return `<svg class="spot-scene-svg spot-atlas-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${String(ariaLabel || theme.label).replace(/[&<>\"]/g, '')}"><rect width="${W}" height="${H}" fill="#111827"/><image class="spot-atlas-image" href="${href}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="none"${transform}/><g class="spot-dynamic-layer" aria-hidden="true"${transform}>${dynamicDifferences}</g><g class="spot-answer-layer" data-spot-answer-layer>${answers}</g></svg>`;
  }
  const random = seededRandom(Number(puzzle.seed || 1) + Number(puzzle.variant || 0) * 7919);
  const symbolPool = shuffled([...new Set([...theme.pool, 'star','heart','clock','camera','gift','apple','cup','rocket','flower','book'])], random);
  const symbols = Array.from({ length: SPOT_CLIENT_HITBOXES.length }, (_, index) => symbolPool[index % symbolPool.length]);
  const differences = new Set(Array.isArray(puzzle.differenceIds) ? puzzle.differenceIds : []);
  const hitboxes = SPOT_CLIENT_HITBOXES.map((base) => ({ ...base, x: puzzle.mirrored ? 1 - base.x : base.x }));
  const objects = hitboxes.map((hitbox, index) => renderCandidate(symbols[index], hitbox, index, Boolean(changed && differences.has(hitbox.id)), theme.accent)).join('');
  const answers = renderSpotDifferenceAnswerMarks(puzzle, foundIds, revealAll);
  return `<svg class="spot-scene-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${String(ariaLabel || theme.label).replace(/[&<>\"]/g, '')}">${themeBackground(puzzle.themeId, puzzle.variant)}${objects}<rect x="12" y="12" width="776" height="496" rx="20" fill="none" stroke="#0f172a" stroke-opacity=".14" stroke-width="4"/><g class="spot-answer-layer" data-spot-answer-layer>${answers}</g></svg>`;
}
