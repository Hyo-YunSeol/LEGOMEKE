const app = {
  token: localStorage.getItem('lego_token'),
  data: null,
  tab: 'home',
  modal: null,
  profile: null,
  busy: false,
  ws: null,
  pollTimer: null,
  refreshTimer: null,
  tickTimer: null,
  fishingClaimInFlight: false,
  liarChatDraft: '',
  popupSeen: new Set(),
  brokenPromptPetId: null,
  liarKeyboardActive: false,
  liarLastRefreshAt: 0,
  omokRoomId: null,
  omokLobbyForced: false,
  omokLastRefreshAt: 0,
  appleFinishInFlight: false,
  bootstrapSyncedAt: Date.now(),
  revision: 0,
  bootstrapRequestId: 0,
  bootstrapController: null,
  reactionReadyTimer: null,
  lastTouchNavAt: 0,
  lastMiniResultChallengeId: null
};

let omokBoardObserver = null;
let omokObservedBoard = null;
let omokSquareFrame = 0;

function disconnectOmokBoardObserver() {
  omokBoardObserver?.disconnect();
  omokBoardObserver = null;
  omokObservedBoard = null;
}

function syncOmokBoardSquare() {
  cancelAnimationFrame(omokSquareFrame);
  omokSquareFrame = requestAnimationFrame(() => {
    const board = $('.omok-board');
    if (!board) {
      disconnectOmokBoardObserver();
      return;
    }
    const square = () => {
      const width = board.getBoundingClientRect().width;
      const height = board.getBoundingClientRect().height;
      if (width > 0 && Math.abs(height - width) > 0.5) board.style.height = `${width}px`;
    };
    square();
    if (omokObservedBoard !== board) {
      disconnectOmokBoardObserver();
      omokObservedBoard = board;
      if ('ResizeObserver' in window) {
        omokBoardObserver = new ResizeObserver(() => square());
        omokBoardObserver.observe(board);
      }
    }
  });
}

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const points = (value) => `${Number(value || 0).toLocaleString('ko-KR')}P`;
const dateText = (value) => value ? new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
const durationText = (milliseconds) => {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
};

function toast(message, type = '', duration = 3400) {
  const node = document.createElement('div');
  node.className = `toast ${type}`;
  node.textContent = message;
  (type === 'game-start' ? document.body : $('#toast-root')).appendChild(node);
  setTimeout(() => node.remove(), Math.max(250, Number(duration) || 3400));
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (app.token) headers.Authorization = `Bearer ${app.token}`;
  let response;
  try {
    response = await fetch(path, { ...options, headers });
  } catch (error) {
    throw new Error(navigator.onLine ? '서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.' : '인터넷 연결이 끊겼습니다. 연결 후 다시 시도해주세요.');
  }
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : {}; } catch { /* Cloudflare 오류 HTML 등 비JSON 응답 */ }
  if (response.status === 401 && !path.includes('/auth/')) logout(false);
  if (!data || typeof data !== 'object') {
    const status = response.status || 0;
    const hint = status >= 500
      ? `서버가 정상 JSON 대신 오류 응답을 보냈습니다. Cloudflare 배포·Durable Object 상태를 확인해주세요. (HTTP ${status})`
      : `서버 응답 형식이 올바르지 않습니다. (HTTP ${status || '알 수 없음'})`;
    throw new Error(hint);
  }
  if (!response.ok) throw new Error(data.message || `요청을 처리하지 못했습니다. (HTTP ${response.status})`);
  return data;
}

function showAuth() {
  $('#auth-screen').classList.remove('hidden');
  $('#app-shell').classList.add('hidden');
}

function showApp() {
  $('#auth-screen').classList.add('hidden');
  $('#app-shell').classList.remove('hidden');
}

function applyBootstrap(next) {
  if (!next || typeof next !== 'object') return false;
  const revision = Math.max(0, Math.floor(Number(next.revision) || 0));
  if (app.data && revision < app.revision) return false;
  app.data = next;
  app.revision = revision;
  app.bootstrapSyncedAt = Date.now();
  return true;
}

function showPopupNotifications() {
  for (const item of app.data?.notifications ?? []) {
    if (item.read || !item.payload?.popup || app.popupSeen.has(item.id)) continue;
    app.popupSeen.add(item.id);
    const type = ['warning', 'break-warning', 'break'].includes(item.type) ? 'error' : 'success';
    toast(item.text, type, type === 'error' ? 6000 : 4200);
  }
}

function showBrokenPromptIfNeeded() {}

function logout(callServer = true) {
  if (callServer && app.token) api('/api/account/logout-all', { method: 'POST', body: '{}' }).catch(() => {});
  app.bootstrapController?.abort();
  app.bootstrapController = null;
  app.bootstrapRequestId += 1;
  app.ws?.close();
  app.ws = null;
  clearInterval(app.pollTimer);
  clearTimeout(app.refreshTimer);
  app.pollTimer = null;
  app.refreshTimer = null;
  app.token = null;
  app.data = null;
  app.revision = 0;
  app.liarChatDraft = '';
  app.omokRoomId = null;
  app.omokLobbyForced = false;
  app.appleFinishInFlight = false;
  app.popupSeen.clear();
  app.brokenPromptPetId = null;
  setLiarKeyboardMode(false);
  localStorage.removeItem('lego_token');
  closeModal();
  showAuth();
}

async function loadBootstrap({ silent = false, renderMode = 'full' } = {}) {
  if (!app.token) return showAuth();
  const previousChallenge = app.data?.activeMiniChallenge ? structuredClone(app.data.activeMiniChallenge) : null;
  const previousAppleBest = Number(app.data?.dashboard?.pet?.records?.appleBestScore || 0);
  const requestId = ++app.bootstrapRequestId;
  app.bootstrapController?.abort();
  const controller = new AbortController();
  app.bootstrapController = controller;
  try {
    const result = await api('/api/bootstrap', { signal: controller.signal });
    if (requestId !== app.bootstrapRequestId || controller.signal.aborted) return;
    applyBootstrap(result.bootstrap);
    if (!app.data) return;
    showApp();
    const chatOnlyUpdated = renderMode === 'liar-chat' && refreshLiarChatOnly();
    if (!chatOnlyUpdated) {
      render();
      if (app.modal) refreshModal();
    }
    showPopupNotifications();
    if (previousChallenge?.gameId === 'apple' && !app.data?.activeMiniChallenge && app.lastMiniResultChallengeId !== previousChallenge.id) {
      openMiniResult({ finished: true, reward: previousChallenge.applePendingPoints, detail: `사과게임 종료 · ${Number(previousChallenge.appleScore || 0).toLocaleString('ko-KR')}점` }, previousChallenge, { previousBest: previousAppleBest });
    }
    connectRealtime();
    if (!silent) requestAnimationFrame(showBrokenPromptIfNeeded);
  } catch (error) {
    if (error?.name === 'AbortError') return;
    if (!silent) toast(error.message, 'error');
  } finally {
    if (app.bootstrapController === controller) app.bootstrapController = null;
  }
}

function connectRealtime() {
  if (!app.token || app.ws || !navigator.onLine) return startPolling();
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(`${protocol}//${location.host}/api/ws?token=${encodeURIComponent(app.token)}`);
  app.ws = socket;
  const fallback = setTimeout(() => {
    if (socket.readyState !== WebSocket.OPEN) {
      socket.close();
      if (app.ws === socket) app.ws = null;
      startPolling();
    }
  }, 7000);
  socket.addEventListener('open', () => {
    clearTimeout(fallback);
    if (app.pollTimer) clearInterval(app.pollTimer);
    app.pollTimer = null;
  });
  socket.addEventListener('message', (event) => {
    try {
      const payload = JSON.parse(event.data);
      if (payload.type === 'refresh') {
        clearTimeout(app.refreshTimer);
        app.refreshTimer = setTimeout(() => loadBootstrap({ silent: true, renderMode: payload.reason === 'liar-chat' ? 'liar-chat' : 'full' }), 180);
      }
    } catch { /* ignore */ }
  });
  socket.addEventListener('close', () => {
    clearTimeout(fallback);
    if (app.ws === socket) app.ws = null;
    if (app.token) startPolling();
  });
  socket.addEventListener('error', () => socket.close());
}

function startPolling() {
  if (!app.token || app.pollTimer) return;
  app.pollTimer = setInterval(() => {
    if (!document.hidden && navigator.onLine) loadBootstrap({ silent: true });
  }, 10_000);
}

function modalHeader(title, description = '') {
  return `<header class="modal-head"><div><h2>${esc(title)}</h2>${description ? `<p>${esc(description)}</p>` : ''}</div><button class="icon-button" data-action="close-modal" type="button" aria-label="닫기">✕</button></header>`;
}

function openModal(html, descriptor = {}) {
  app.modal = descriptor;
  $('#modal-content').innerHTML = html;
  $('#modal-root').classList.remove('hidden');
  $('#modal-root').setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => $('#modal-root').classList.add('open'));
}

function closeModal() {
  clearTimeout(app.reactionReadyTimer);
  app.reactionReadyTimer = null;
  app.modal = null;
  app.profile = null;
  $('#modal-root').classList.remove('open');
  $('#modal-root').classList.add('hidden');
  $('#modal-root').setAttribute('aria-hidden', 'true');
}

async function refreshModal() {
  if (!app.modal) return;
  const descriptor = { ...app.modal };
  if (descriptor.type === 'notifications') return openNotifications();
  if (descriptor.type === 'online') return openOnlineModal();
  if (descriptor.type === 'recentBungs') return openRecentBungs();
  if (descriptor.type === 'bodyGuide') return openBodyGuide(descriptor.body);
  if (descriptor.type === 'food') return openFoodShop();
  if (descriptor.type === 'fishingRewards') return openFishingRewards();
  if (descriptor.type === 'profile') return openProfile(descriptor.petId);
  if (descriptor.type === 'bung') return openBung(descriptor.bungId);
  if (descriptor.type === 'mini') return openMiniGame(app.data?.activeMiniChallenge);
  if (descriptor.type === 'omokCreate') return openCreateOmok();
  if (descriptor.type === 'admin') return openAdmin();
  if (descriptor.type === 'styleShop') return openStyleShop();
}

async function perform(path, body = {}, successMessage = null, method = 'POST', { renderMode = 'full', toastDuration = 3400, toastType = null } = {}) {
  if (app.busy) return null;
  app.busy = true;
  document.body.classList.add('is-busy');
  const lockedControls = $$('button, input[type="submit"]');
  lockedControls.forEach((element) => {
    element.dataset.busyWasDisabled = element.disabled ? 'true' : 'false';
    if (element.dataset.allowBusy !== 'true') element.disabled = true;
  });
  try {
    const result = await api(path, { method, body: method === 'GET' || method === 'DELETE' ? undefined : JSON.stringify(body) });
    if (result.bootstrap) applyBootstrap(result.bootstrap);
    if (successMessage || result.message) toast(successMessage || result.message, result.ok === false ? 'error' : (toastType || 'success'), toastDuration);
    showPopupNotifications();
    const chatOnlyUpdated = renderMode === 'liar-chat' && refreshLiarChatOnly();
    if (!chatOnlyUpdated) {
      render();
      if (app.modal) refreshModal();
    }
    requestAnimationFrame(showBrokenPromptIfNeeded);
    return result;
  } catch (error) {
    toast(error.message, 'error');
    return null;
  } finally {
    app.busy = false;
    document.body.classList.remove('is-busy');
    lockedControls.forEach((element) => {
      if (!document.contains(element)) return;
      element.disabled = element.dataset.busyWasDisabled === 'true';
      delete element.dataset.busyWasDisabled;
    });
  }
}

const BODY_STAGE_FALLBACK = [
{min:60,max:69,key:'skinny',label:'마름레고',activityHungerCost:1},{min:70,max:79,key:'normal',label:'보통레고',activityHungerCost:1},{min:80,max:89,key:'yukdeok',label:'육덕레고',activityHungerCost:1},{min:90,max:99,key:'jjap',label:'짭덥레고',activityHungerCost:1},{min:100,max:109,key:'myeol-tteop',label:'멸떱레고',activityHungerCost:2},{min:110,max:119,key:'chubby',label:'통통레고',activityHungerCost:2},{min:120,max:129,key:'bi-tteop',label:'비떱레고',activityHungerCost:2},{min:130,max:159,key:'fat',label:'뚱뚱레고',activityHungerCost:2},{min:160,max:199,key:'three-digit',label:'세자리레고',activityHungerCost:2},{min:200,max:239,key:'big-big-woman',label:'빅빅우먼레고',activityHungerCost:3},{min:240,max:299,key:'royal-bi-tteop',label:'로얄비떱레고',activityHungerCost:3},{min:300,max:379,key:'hippo',label:'하마레고',activityHungerCost:3},{min:380,max:479,key:'elephant',label:'코끼리레고',activityHungerCost:3},{min:480,max:599,key:'mammoth',label:'맘모스레고',activityHungerCost:3},{min:600,max:739,key:'wild-boar',label:'매태지레고',activityHungerCost:3},{min:740,max:899,key:'daeruk',label:'돼룩돼룩레고',activityHungerCost:4},{min:900,max:1079,key:'ultra-daeruk',assetKey:'pig-ultra-daeruk',label:'초대룩레고',activityHungerCost:4},{min:1080,max:1279,key:'pig-emperor',assetKey:'pig-emperor',label:'돼황레고',activityHungerCost:4},{min:1280,max:1499,key:'monster-pig',assetKey:'pig-monster',label:'괴수돼지레고',activityHungerCost:4},{min:1500,max:1749,key:'bedbreaker-pig',assetKey:'pig-bedbreaker',label:'침대파괴돼지레고',activityHungerCost:4},{min:1750,max:2029,key:'disaster-text-pig',assetKey:'pig-disaster-text',label:'재난문자돼지레고',activityHungerCost:4},{min:2030,max:2339,key:'national-emergency-pig',assetKey:'pig-national-emergency',label:'국가비상돼지레고',activityHungerCost:4},{min:2340,max:2689,key:'protoceratops',assetKey:'lego-protoceratops',label:'프로토케라톱스레고',activityHungerCost:5},{min:2690,max:3079,key:'triceratops',assetKey:'lego-triceratops',label:'트리케라톱스레고',activityHungerCost:5},{min:3080,max:3509,key:'stegosaurus',assetKey:'lego-stegosaurus',label:'스테고사우루스레고',activityHungerCost:5},{min:3510,max:3989,key:'brachiosaurus',assetKey:'lego-brachiosaurus',label:'브라키오사우루스레고',activityHungerCost:5},{min:3990,max:4519,key:'patagotitan',assetKey:'lego-patagotitan',label:'파타고티탄레고',activityHungerCost:6},{min:4520,max:null,key:'argentinosaurus',assetKey:'lego-argentinosaurus',label:'아르헨티노사우루스레고',activityHungerCost:6}
];

function bodyStages() {
  return app.data?.catalog?.bodyStages?.length ? app.data.catalog.bodyStages : BODY_STAGE_FALLBACK;
}

function stageForBody(body) {
  const stages = bodyStages();
  const value = Math.max(Number(stages[0]?.min ?? 60), Number(body) || 60);
  return stages.find((stage) => value >= stage.min && (stage.max == null || value <= stage.max)) ?? stages.at(-1);
}

function cosmeticClasses(c = {}) {
  return [c.goldBorder ? 'cos-gold' : '', c.royalCard ? 'cos-royal' : '', c.aurora ? 'cos-aura' : ''].filter(Boolean).join(' ');
}

function seasonBadgesHtml(profile = {}) {
  const badges = Array.isArray(profile.seasonBadges) ? profile.seasonBadges : [];
  return badges.length ? `<span class="season-badges">${badges.map((badge) => `<b class="season-badge season-${esc(badge.key)}">${esc(badge.label)}</b>`).join('')}</span>` : '';
}

function reactionPosition(seed = '') {
  let hash = 2166136261;
  for (const ch of String(seed)) { hash ^= ch.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  const x = 5 + Math.abs(hash % 90);
  const y = 4 + Math.abs((hash >>> 7) % 88);
  const rot = -18 + Math.abs((hash >>> 13) % 37);
  return { x, y, rot };
}

function spectatorBurstLayer(reactions = [], scope = '') {
  if (!reactions.length) return '';
  return `<div class="spectator-burst-layer ${esc(scope)}-bursts" aria-hidden="true">${reactions.slice(-12).map((item) => {
    const pos = reactionPosition(item.reactionId || `${item.petId}-${item.createdAt}`);
    return `<span class="reaction-burst burst-${esc(item.type)}" style="--burst-x:${pos.x}%;--burst-y:${pos.y}%;--burst-rot:${pos.rot}deg">${esc(item.emoji)}</span>`;
  }).join('')}</div>`;
}


function lifeHungerCostsForStage(stage) {
  const tier = Math.max(1, Math.min(10, Math.floor(Number(stage?.activityHungerCost) || 1)));
  const table = {
    1:[10,5,15], 2:[11,5,16], 3:[12,6,17], 4:[13,6,18], 5:[14,7,19],
    6:[15,7,20], 7:[16,8,22], 8:[17,8,23], 9:[18,9,24], 10:[18,9,25]
  };
  const [work, rest, exercise] = table[tier] || table[10];
  return { work, rest, exercise };
}

function avatar(stage, { mini = false } = {}) {
  const stageClass = `stage-${String(stage?.key || 'normal').replace(/[^a-z0-9-]/gi, '')}`;
  const src = `/pets/${esc(stage.assetKey || stage.key)}.svg?v=649`;
  return `<div class="pet-visual ${mini ? 'mini' : ''} ${stageClass}"><span class="pet-shadow"></span><img src="${src}" alt="${esc(stage.label)}" draggable="false" onerror="this.onerror=null;this.src='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyMjAgMjIwIj48ZWxsaXBzZSBjeD0iMTEwIiBjeT0iMjAyIiByeD0iNzAiIHJ5PSIxMCIgZmlsbD0iIzQyNDY1YSIgb3BhY2l0eT0iLjE1Ii8+PHJlY3QgeD0iNzQiIHk9IjE4IiB3aWR0aD0iNzIiIGhlaWdodD0iNjgiIHJ4PSIxNiIgZmlsbD0iI2YyYmQzNSIgc3Ryb2tlPSIjNzQ1OTE2IiBzdHJva2Utd2lkdGg9IjYiLz48cmVjdCB4PSI5MSIgeT0iNyIgd2lkdGg9IjM4IiBoZWlnaHQ9IjE3IiByeD0iNyIgZmlsbD0iI2YyYmQzNSIgc3Ryb2tlPSIjNzQ1OTE2IiBzdHJva2Utd2lkdGg9IjUiLz48Y2lyY2xlIGN4PSI5NyIgY3k9IjUwIiByPSI1Ii8+PGNpcmNsZSBjeD0iMTIzIiBjeT0iNTAiIHI9IjUiLz48cGF0aCBkPSJNOTYgNjggUTExMCA3NyAxMjQgNjgiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzRhMzgxMCIgc3Ryb2tlLXdpZHRoPSI1IiBzdHJva2UtbGluZWNhcD0icm91bmQiLz48cmVjdCB4PSI2MSIgeT0iODIiIHdpZHRoPSI5OCIgaGVpZ2h0PSI5NSIgcng9IjI0IiBmaWxsPSIjZTY5YjJjIiBzdHJva2U9IiM3NjUwMWUiIHN0cm9rZS13aWR0aD0iNyIvPjxyZWN0IHg9IjM5IiB5PSI5NCIgd2lkdGg9IjI2IiBoZWlnaHQ9IjcwIiByeD0iMTIiIGZpbGw9IiNlNjliMmMiIHN0cm9rZT0iIzc2NTAxZSIgc3Ryb2tlLXdpZHRoPSI2Ii8+PHJlY3QgeD0iMTU1IiB5PSI5NCIgd2lkdGg9IjI2IiBoZWlnaHQ9IjcwIiByeD0iMTIiIGZpbGw9IiNlNjliMmMiIHN0cm9rZT0iIzc2NTAxZSIgc3Ryb2tlLXdpZHRoPSI2Ii8+PHJlY3QgeD0iNjkiIHk9IjE2NyIgd2lkdGg9IjM4IiBoZWlnaHQ9IjM4IiByeD0iOCIgZmlsbD0iI2M5N2QxZiIgc3Ryb2tlPSIjNzY1MDFlIiBzdHJva2Utd2lkdGg9IjYiLz48cmVjdCB4PSIxMTMiIHk9IjE2NyIgd2lkdGg9IjM4IiBoZWlnaHQ9IjM4IiByeD0iOCIgZmlsbD0iI2M5N2QxZiIgc3Ryb2tlPSIjNzY1MDFlIiBzdHJva2Utd2lkdGg9IjYiLz48L3N2Zz4='"></div>`;
}

function bar(label, value, { badLow = false } = {}) {
  const numeric = Math.max(0, Math.min(100, Number(value) || 0));
  const stateClass = badLow ? (numeric <= 20 ? 'bad' : numeric >= 70 ? 'good' : '') : (numeric >= 70 ? 'bad' : numeric <= 30 ? 'good' : '');
  return `<div class="stat"><div class="stat-head"><span>${esc(label)}</span><strong>${Math.round(numeric)}</strong></div><div class="bar ${stateClass}"><span style="width:${numeric}%"></span></div></div>`;
}

function resetCountdown() {
  const nextAt = app.data?.dashboard?.pet?.daily?.nextGameDayAt;
  return nextAt ? durationText(new Date(nextAt).getTime() - Date.now()) : '-';
}

function actionCooldownText() {
  const daily = app.data?.dashboard?.pet?.daily;
  if (!daily) return '';
  if (daily.actionsLeft <= 0) return `행동 5회 사용 완료 · 초기화 ${resetCountdown()}`;
  const remaining = daily.nextActionAt ? new Date(daily.nextActionAt).getTime() - Date.now() : 0;
  return remaining > 0 ? `다음 행동 ${durationText(remaining)} · 초기화 ${resetCountdown()}` : `지금 행동 가능 · 초기화 ${resetCountdown()}`;
}

function lifeActionsLocked() {
  const daily = app.data?.dashboard?.pet?.daily;
  if (!daily || daily.actionsLeft <= 0) return true;
  const nextAt = new Date(daily.nextActionAt ?? 0).getTime();
  return Number.isFinite(nextAt) && nextAt > Date.now();
}

function actionDots(left) {
  const total = app.data?.catalog?.actionsPerDay || 5;
  return `<div class="action-dots">${Array.from({ length: total }, (_, index) => `<span class="${index < left ? 'on' : ''}"></span>`).join('')}</div>`;
}

function compactMetric(label, value, className = '', { raw = false } = {}) {
  return `<div class="metric ${className}"><small>${esc(label)}</small><strong>${raw ? value : esc(value)}</strong></div>`;
}

function sectionHeading(title, description = '', action = '') {
  return `<div class="section-heading"><div><h2>${esc(title)}</h2>${description ? `<p>${esc(description)}</p>` : ''}</div>${action}</div>`;
}

function goalList(goals) {
  return `<div class="goal-list">${(goals?.items ?? []).map((goal) => `<div class="goal-item ${goal.completed ? 'done' : ''}"><span>${goal.completed ? '✓' : '○'}</span><div><strong>${esc(goal.label)}</strong>${goal.target ? `<small>${goal.current}/${goal.target}</small>` : '<small>미완료</small>'}</div><b>+1</b></div>`).join('')}</div>`;
}

function homeView() {
  const pet = app.data.dashboard.pet;
  const stage = pet.bodyStage || stageForBody(pet.stats.body);
  const goals = pet.daily.goals;
  const fishing = pet.daily.fishing;
  const fishingLeft = (app.data.catalog.fishingPerDay || 20) - pet.daily.fishingPlayed;
  const unread = app.data.notifications.filter((item) => !item.read).length;
  const integrity = { warnings: 0, maxWarnings: 0, broken: false };
  const breakPanel = '';
  return `
    <section class="hero-card ${cosmeticClasses(pet.cosmetics)}">
      <div class="hero-main">${avatar(stage)}<div class="hero-copy"><span class="eyebrow">${pet.cosmetics?.title ? `<em class="cos-title">${esc(pet.cosmetics.title)}</em> · ` : ''}<button class="body-stage-link" data-action="body-guide" data-body="${pet.stats.body}" type="button">${esc(stage.label)}</button> · ${pet.generation}세대</span><h1 class="${pet.cosmetics?.nameSparkle ? 'cos-name-sparkle' : ''}">${esc(pet.displayName)}${seasonBadgesHtml(pet)}</h1><div class="status-message-row"><span class="status-message-text ${pet.statusMessage ? '' : 'muted'} ${pet.cosmetics?.statusGlow ? 'cos-status-glow' : ''}">${esc(pet.statusMessage || '상태메시지 없음')}</span><button class="status-edit-button" data-action="edit-status-message" type="button" >수정</button></div><p class="system-status">${esc(pet.status)}</p><div class="hero-tags"><span>Lv.${pet.stats.level}</span><span>레고력 ${pet.stats.legoPower}</span><span>${pet.partnerPetId ? `커플 D+${pet.coupleDay}` : '솔로'}</span></div></div></div>
      <div class="metric-grid primary-metrics">${compactMetric('포인트', points(pet.stats.points), 'accent')}${compactMetric('레벨', `Lv.${pet.stats.level}`)}${compactMetric('몸집', `${pet.stats.body}`)}${compactMetric('누적 경고', `${pet.records.warnings}회`)}</div>
      <div class="level-progress"><div><span>Lv.${pet.levelProgress.level + 1}까지 ${Math.max(0, pet.levelProgress.nextAt - pet.levelProgress.totalPower)} 레고력 남음</span><strong>${pet.levelProgress.current} / ${pet.levelProgress.needed}</strong></div><div class="bar level"><span style="width:${Math.min(100, pet.levelProgress.current / pet.levelProgress.needed * 100)}%"></span></div></div>
    </section>
    ${breakPanel}
    <section class="section stat-panel">${bar('체력', pet.stats.stamina, { badLow: true })}${bar('배고픔', pet.stats.hunger, { badLow: true })}</section>

    <section class="section">
      ${sectionHeading('생활 행동', '게임 하루 5회 · 30분 쿨타임', `<button class="soft-button" data-action="open-food" type="button" >🍚 밥 먹기</button>`)}
      ${actionDots(pet.daily.actionsLeft)}<p id="action-cooldown" class="helper">${actionCooldownText()}</p>
      <div class="action-grid">
        <button class="action-card life-action" data-action="work" type="button" ${lifeActionsLocked() ? 'disabled' : ''}><span>💼</span><strong>일하기</strong><small>+500P · 체력 -15 · 배고픔 -10</small></button>
        <button class="action-card life-action" data-action="exercise" type="button" ${lifeActionsLocked() ? 'disabled' : ''}><span>🏋️</span><strong>헬스</strong><small>몸집 -2 · 체력 -20 · 배고픔 -15</small></button>
        <button class="action-card life-action" data-action="rest" type="button" ${lifeActionsLocked() || pet.stats.stamina >= 90 ? 'disabled' : ''}><span>🛋️</span><strong>쉬기</strong><small>체력 +40 · 배고픔 -5</small></button>
      </div>
    </section>

    <section class="section daily-goals-compact">
      ${sectionHeading('오늘의 레고력', '한국시간 00·06·12·18시에 초기화됩니다.', `<span class="tag">${goals.completed}/${goals.total}</span>`)}
      ${goalList(goals)}
      <p class="helper daily-goals-note">벙 정상 종료마다 레고력 +1 추가</p>
    </section>

    <section class="section fishing-card">
      ${sectionHeading('30초 낚시', '미니게임 횟수와 별도입니다.', `<button class="text-button" data-action="show-fishing-rewards" type="button">낚시 보상 보기</button>`)}
      <div class="fishing-status"><div><strong id="fishing-state">${fishing ? '낚시 중' : '낚시 가능'}</strong><small id="fishing-countdown">${fishing ? durationText(new Date(fishing.readyAt).getTime() - Date.now()) : `남은 횟수 ${Math.max(0, fishingLeft)}/${app.data.catalog.fishingPerDay}`}</small></div><button class="primary" data-action="start-fishing" type="button" ${fishing || fishingLeft <= 0 ? 'disabled' : ''}>낚시 시작</button></div>
      ${pet.daily.lastFishingResult ? `<div class="last-result"><span>최근 결과</span><strong>${esc(pet.daily.lastFishingResult.label)} · ${pet.daily.lastFishingResult.reward ? points(pet.daily.lastFishingResult.reward) : '꽝'}</strong></div>` : ''}
    </section>

    ${rankingsSection()}
    <section class="section">${sectionHeading('레고방 소식', '새 소식이 생기면 오래된 소식부터 사라집니다.', `<span class="tag">최근 10개</span>`)}${newsList()}</section>
    ${unread ? `<button class="floating-notice" data-action="notifications" type="button">읽지 않은 알림 ${unread}개</button>` : ''}
  `;
}

function rankingsSection() {
  const rankings = app.data.rankings;
  const rankRows = (items, value) => items.length ? items.map((item) => `<div class="rank-row"><b>${item.rank}</b><button data-action="profile" data-id="${item.petId}" type="button">${esc(item.displayName)}</button><strong>${value(item)}</strong></div>`).join('') : '<div class="empty">아직 순위가 없습니다.</div>';
  const couples = rankings.couples.length ? rankings.couples.map((item) => `<div class="couple-row"><span>♥</span><strong>${esc(item.names.join(' · '))}</strong><b>D+${item.day}</b></div>`).join('') : '<div class="empty">현재 커플이 없습니다.</div>';
  const pokes = rankings.pokes.length ? rankings.pokes.map((item) => `<div class="rank-row"><b>${item.rank}</b><span>${esc(item.members[0].displayName)} ↔ ${esc(item.members[1].displayName)}</span><strong>${item.total}회</strong></div>`).join('') : '<div class="empty">서로 찌른 기록이 없습니다.</div>';
  const reaction = rankRows(rankings.reaction ?? [], (item) => `${(Number(item.ms || 0) / 1000).toFixed(3)}초`);
  const apple = rankRows(rankings.apple ?? [], (item) => `${Number(item.score || 0).toLocaleString('ko-KR')}점`);
  const omok = rankRows(rankings.omok ?? [], (item) => `${item.wins}승 ${item.draws}무 ${item.losses}패`);
  const myGameRanks = rankings.myGameRanks ?? {};
  const myRank = (item, value) => item
    ? `<div class="game-my-rank"><span>내 기록 · 전체 ${item.rank}위</span><strong>${value(item)}</strong></div>`
    : '<div class="game-my-rank empty-record"><span>내 기록</span><strong>아직 기록 없음</strong></div>';
  return `<section class="section ranking-section">${sectionHeading('레고방 순위', '포인트·레벨과 게임 TOP 5')}<div class="rank-tabs-grid"><article class="rank-card"><h3>포인트 TOP 5</h3>${rankRows(rankings.points, (item) => points(item.points))}</article><article class="rank-card"><h3>레벨 TOP 5</h3>${rankRows(rankings.levels, (item) => `Lv.${item.level} · ${item.legoPower}`)}</article></div><div class="game-ranking-heading"><strong>게임 순위</strong><small>번개반응 · 사과게임 · 오목 TOP 5 · 3일 시즌제</small></div><div class="game-rank-grid"><article class="rank-card"><h3>⚡ 번개반응 TOP 5</h3>${reaction}${myRank(myGameRanks.reaction, (item) => `${(Number(item.ms || 0) / 1000).toFixed(3)}초`)}</article><article class="rank-card"><h3>🍎 사과게임 TOP 5</h3>${apple}${myRank(myGameRanks.apple, (item) => `${Number(item.score || 0).toLocaleString('ko-KR')}점`)}</article><article class="rank-card"><h3>⚫ 오목 TOP 5</h3>${omok}${myRank(myGameRanks.omok, (item) => `${item.wins}승 ${item.draws}무 ${item.losses}패`)}</article></div><div class="game-ranking-heading relation-ranking-heading"><strong>관계 현황</strong><small>기존 커플·찌르기 기록</small></div><div class="rank-tabs-grid"><article class="rank-card"><h3>커플</h3>${couples}</article><article class="rank-card"><h3>찌르기 TOP 5</h3>${pokes}</article></div></section>`;
}

function newsList() {
  const events = app.data.publicEvents ?? [];
  return events.length ? `<div class="news-list">${events.map((event) => `<article><span class="news-dot ${esc(event.type)}"></span><div><p>${esc(event.text)}</p><small>${dateText(event.createdAt)}</small></div></article>`).join('')}</div>` : '<div class="empty">아직 레고방 소식이 없습니다.</div>';
}

function miniGameIcon(gameId) {
  return ({ oddEven: '🌓', reaction: '⚡', number: '🔢', apple: '🍎' })[gameId] || '🎮';
}

function gamesView() {
  const games = app.data.catalog.miniGames;
  const active = app.data.activeMiniChallenge;
  const activeGame = active ? games.find((game) => game.id === active.gameId) : null;
  const resume = active
    ? `<div class="active-game-banner"><div><strong>${esc(activeGame?.name || '개인게임')} 진행 중</strong><small>새로고침해도 이어서 할 수 있습니다.</small></div><button class="primary" data-action="resume-mini" type="button">이어하기</button></div>`
    : '';
  return `
    <section class="page-title"><span class="eyebrow">포인트 게임</span><h1>게임</h1><p>개인게임으로 포인트를 벌고, 단체게임에서 오목·라이어 대전을 즐길 수 있습니다.</p></section>
    <section class="section personal-game-wrap">${sectionHeading('포인트 개인게임', `이번 게임 하루 ${app.data.dashboard.pet.daily.miniGamesPlayed}/${app.data.catalog.miniGamesPerDay}회`)}${resume}<div class="game-grid">${games.map((game) => `<article class="game-card"><div class="game-icon">${miniGameIcon(game.id)}</div><h3>${esc(game.name)}</h3><p>${esc(game.description)}</p><button class="primary wide" data-action="${active?.gameId === game.id ? 'resume-mini' : 'start-mini'}" data-id="${game.id}" type="button" ${active && active.gameId !== game.id ? 'disabled' : ''}>${active?.gameId === game.id ? '이어하기' : '시작'}</button></article>`).join('')}</div></section>
    <div class="game-category-heading"><span>단체게임</span><small>실시간으로 다른 레고와 함께 플레이합니다.</small></div>
    <section class="section omok-wrap">${omokSection()}</section>
    <section class="section liar-wrap">${liarSection()}</section>
  `;
}

function omokStatusLabel(status) {
  return ({ waiting: '대기중', playing: '게임중', ended: '종료' })[status] || status;
}

function serverAlignedNow(serverTime) {
  const base = Number(serverTime || Date.now());
  return base + (Date.now() - app.bootstrapSyncedAt);
}

function currentOmokRoom() {
  if (app.omokLobbyForced) return null;
  const rooms = app.data.omok?.rooms ?? [];
  let room = rooms.find((item) => item.id === app.omokRoomId);
  if (!room) room = rooms.find((item) => item.viewerRole === 'player' || item.viewerRole === 'spectator');
  if (room) app.omokRoomId = room.id;
  return room ?? null;
}

function omokLobby() {
  const omok = app.data.omok;
  const rooms = omok?.rooms ?? [];
  const roomByNumber = new Map(rooms.map((room) => [room.roomNumber, room]));
  const cards = Array.from({ length: omok?.maxRooms || 3 }, (_, index) => {
    const room = roomByNumber.get(index + 1);
    if (!room) return `<article class="omok-lobby-card empty-room"><div><strong>${index + 1}번방</strong><small>비어있음</small></div></article>`;
    const versus = room.guest ? `${esc(room.host?.displayName || '-')} VS ${esc(room.guest.displayName)}` : esc(room.host?.displayName || '-');
    let action = '';
    if (room.viewerRole !== 'none') action = `<button class="soft-button" data-action="omok-open" data-id="${room.id}" type="button">열기</button>`;
    else if (room.status === 'waiting') action = `<button class="primary" data-action="omok-join" data-id="${room.id}" type="button">참가</button>`;
    else if (room.status === 'playing') action = `<button class="soft-button" data-action="omok-spectate" data-id="${room.id}" type="button">관전</button>`;
    else action = `<button class="ghost" data-action="omok-open" data-id="${room.id}" type="button">결과</button>`;
    return `<article class="omok-lobby-card"><div><strong>${room.roomNumber}번방 · ${versus}</strong><small>판돈 ${points(room.stakePoints)} · ${omokStatusLabel(room.status)}</small></div>${action}</article>`;
  }).join('');
  const canCreate = rooms.length < (omok?.maxRooms || 3);
  return `${sectionHeading('오목게임', '15×15 · 1:1 실시간 대전 · 한 수 30초', `<button class="primary" data-action="omok-create" type="button" ${canCreate ? '' : 'disabled'}>방 만들기</button>`)}<div class="omok-lobby-list">${cards}</div>`;
}

function spectatorReactionBar(scope, roomId, reactions = [], canSend = true) {
  if (!canSend && !reactions.length) return '';
  const buttons = canSend ? [
    ['funny', '😂', '웃겨요'], ['sad', '😢', '슬퍼요'], ['angry', '😡', '화나요'], ['sleepy', '😴', '졸려요'], ['cringe', '🥵', '짜쳐요']
  ].map(([type, emoji, label]) => `<button class="reaction-button" data-action="${scope}-reaction" data-reaction="${type}" ${roomId ? `data-id="${esc(roomId)}"` : ''} type="button"><span>${emoji}</span><small>${label}</small></button>`).join('') : '';
  const live = reactions.length ? `<div class="reaction-live">${reactions.map((item) => `<span><b>${esc(item.displayName)}</b> ${esc(item.emoji)} ${esc(item.label)}</span>`).join('')}</div>` : '<div class="reaction-live empty-live">관전 리액션을 보내보세요.</div>';
  return `<div class="spectator-reactions">${buttons ? `<div class="reaction-buttons">${buttons}</div>` : ''}${live}</div>`;
}

function omokRoomView(room) {
  const me = app.data.dashboard.pet;
  const isPlayer = room.viewerRole === 'player';
  const isSpectator = room.viewerRole === 'spectator';
  const board = room.board.map((line, row) => line.map((cell, col) => { const last = room.lastMove && Number(room.lastMove.row) === row && Number(room.lastMove.col) === col; return `<button class="omok-cell ${cell || ''} ${last ? 'last-move' : ''}" data-action="omok-move" data-row="${row}" data-col="${col}" type="button" ${!isPlayer || room.status !== 'playing' || !room.isMyTurn || cell ? 'disabled' : ''} aria-label="${row + 1}행 ${col + 1}열${last ? ' · 마지막 수' : ''}">${cell === 'black' ? '<span class="omok-stone black"></span>' : cell === 'white' ? '<span class="omok-stone white"></span>' : ''}${last ? '<i class="last-move-mark"></i>' : ''}</button>`; }).join('')).join('');
  const turnName = room.currentTurnPetId === room.black?.petId ? room.black?.displayName : room.currentTurnPetId === room.white?.petId ? room.white?.displayName : '-';
  const resultText = room.status === 'ended'
    ? room.result === 'draw' ? '무승부 · 판돈 반환' : `${esc(room.winnerPetId === room.black?.petId ? room.black?.displayName : room.white?.displayName || '승자')} 승리`
    : null;
  const rematch = room.status === 'ended' && isPlayer ? `<button class="primary" data-action="omok-rematch" data-id="${room.id}" type="button">${room.rematchRequestedByMe ? '재대결 수락 대기 중' : '재대결'}</button>` : '';
  const leave = isSpectator
    ? `<button class="ghost" data-action="omok-spectate-leave" data-id="${room.id}" type="button">관전 나가기</button>`
    : isPlayer ? `<button class="ghost" data-action="omok-leave" data-id="${room.id}" type="button">${room.status === 'playing' ? '기권하고 나가기' : '나가기'}</button>` : `<button class="ghost" data-action="omok-back" type="button">로비로</button>`;
  return `${sectionHeading('오목게임', `${room.roomNumber}번방 · ${omokStatusLabel(room.status)}`, '<button class="text-button" data-action="omok-back" type="button">로비 보기</button>')}<div class="omok-game-head"><div><span class="omok-stone black small"></span><strong>${esc(room.black?.displayName || '흑 미정')}</strong></div><div class="omok-pot"><small>판돈</small><b>${points(room.stakePoints)}</b></div><div><span class="omok-stone white small"></span><strong>${esc(room.white?.displayName || '백 미정')}</strong></div></div>${room.status === 'waiting' ? `<div class="omok-wait"><strong>${esc(room.host?.displayName || '')}</strong><p>상대를 기다리는 중입니다.</p></div>` : `<div class="omok-status-line"><span>현재 차례 <b>${esc(turnName || '-')}</b></span><span>남은 시간 <b id="omok-countdown">${room.status === 'playing' ? '30초' : '-'}</b></span><span>관전자 ${room.spectatorCount}명</span></div><div class="omok-board-stage"><div class="omok-board" role="grid">${board}</div>${spectatorBurstLayer(room.reactions || [], 'omok')}</div>`}${resultText ? `<div class="result-card"><strong>${resultText}</strong><p>${esc(room.resultReason || '')}</p></div>` : ''}<div class="button-row">${rematch}${leave}</div>${isSpectator ? `${spectatorReactionBar('omok', room.id, room.reactions || [], true)}<p class="helper">관전자는 착수·판돈 변경·재대결 등 게임 입력을 할 수 없습니다.</p>` : isPlayer ? spectatorReactionBar('omok', room.id, room.reactions || [], false) : ''}`;
}

function omokSection() {
  const room = currentOmokRoom();
  return room ? omokRoomView(room) : omokLobby();
}

function liarPhaseLabel(phase) {
  return ({ waiting: '대기실', discussion: '토론', voting: '투표', liar_guess: '라이어 정답', result: '라운드 결과', game_over: '게임 종료' })[phase] || phase;
}

function liarSection() {
  const game = app.data.liarGame;
  const me = app.data.dashboard.pet;
  if (!game.joined && !game.spectating) {
    const inProgress = game.phase !== 'waiting';
    return `${sectionHeading('라이어게임', inProgress ? `게임 중 · 관전자 ${game.spectatorCount || 0}명` : '1라운드 · 포인트 배팅')}<div class="liar-intro"><div class="game-icon big">🎭</div><h3>${inProgress ? '현재 게임 중입니다' : `현재 ${game.players.length}/${game.settings.maxPlayers}명 참가 중`}</h3><p>${inProgress ? '플레이어로 중간 참가할 수는 없지만 읽기 전용으로 관전할 수 있습니다.' : '방장이 판돈·토론 시간·최대 참가 인원을 정하고 한 라운드만 진행합니다.'}</p>${inProgress ? '<button class="primary" data-action="liar-spectate" type="button">관전하기</button>' : '<button class="primary" data-action="liar-join" type="button">참가하기</button>'}</div>`;
  }
  const spectator = game.spectating && !game.joined;
  const players = game.players.map((player) => `<div class="liar-player ${player.petId === me.id ? 'me' : ''} ${player.forfeited ? 'offline' : ''}"><div><strong>${esc(player.displayName)}</strong><small>${player.isHost ? '방장 · ' : ''}${player.connected ? '접속' : '이탈'}${player.ready ? ' · 준비' : ''}</small></div><b>${player.score}점</b>${!spectator && game.isHost && game.phase === 'waiting' && player.petId !== me.id ? `<button class="tiny danger" data-action="liar-kick" data-id="${player.petId}" type="button">내보내기</button>` : ''}</div>`).join('');
  if (spectator) {
    const spectatorResult = game.roundResult ? `<div class="result-card"><strong>${game.phase === 'game_over' && game.roundResult.liarWon != null ? (game.roundResult.liarWon ? '라이어 승리' : '시민 승리') : '라운드 진행 결과'}</strong><p>${esc(game.roundResult.reason || '')}</p>${game.phase === 'game_over' ? `<small>제시어 ${esc(game.roundResult.word || game.word || '-')} · 라이어 ${esc(game.roundResult.liarDisplayName || '-')}</small>` : ''}</div>` : '';
    return `${sectionHeading('라이어게임 관전', `${liarPhaseLabel(game.phase)} · 관전자 ${game.spectatorCount || 0}명`, game.phaseEndsAt ? '<span id="liar-countdown" class="tag"></span>' : '')}<div class="liar-reaction-stage">${spectatorBurstLayer(game.reactions || [], 'liar')}<div class="liar-layout"><div><div class="liar-player-list">${players}</div><div class="spectator-card"><strong>👀 관전 중</strong><p>투표·정답·게임 조작·채팅은 사용할 수 없습니다. 제시어와 라이어 정보는 게임 종료 전 서버에서 전송되지 않습니다.</p></div>${spectatorResult}${spectatorReactionBar('liar', null, game.reactions || [], true)}<button class="ghost" data-action="liar-spectate-leave" type="button">관전 나가기</button></div>${liarChat(game, me.id, true)}</div></div>`;
  }
  const waitingControls = game.phase === 'waiting' ? `<div class="liar-controls">${game.isHost ? `<div class="setting-row"><label>토론<select id="liar-discussion">${app.data.catalog.liarDiscussionOptions.map((value) => `<option value="${value}" ${game.settings.discussionSeconds === value ? 'selected' : ''}>${value}초</option>`).join('')}</select></label><label>판돈<select id="liar-bet">${app.data.catalog.liarBetOptions.map((value) => `<option value="${value}" ${game.settings.betPoints === value ? 'selected' : ''}>${value}P</option>`).join('')}</select></label><label>최대 인원<select id="liar-max-players">${app.data.catalog.liarPlayerOptions.map((value) => `<option value="${value}" ${game.settings.maxPlayers === value ? 'selected' : ''}>${value}명</option>`).join('')}</select></label><button class="soft-button" data-action="liar-save-settings" type="button">설정 저장</button></div>` : ''}<div class="button-row"><button class="${game.ready ? 'soft-button' : 'primary'}" data-action="liar-ready" type="button">${game.ready ? '준비 취소' : '준비'}</button>${game.isHost ? '<button class="primary" data-action="liar-start" type="button">게임 시작</button>' : ''}<button class="ghost" data-action="liar-leave" type="button">나가기</button></div><p class="helper">참가 ${game.players.length}/${game.settings.maxPlayers}명 · 시작 판돈 ${points(game.settings.betPoints)}</p></div>` : '';
  const role = ['discussion', 'voting', 'liar_guess'].includes(game.phase) ? `<div class="role-card ${game.isLiar ? 'liar' : 'citizen'}"><span>${game.isLiar ? '당신은 라이어' : '당신은 시민'}</span><small>카테고리: <b>${esc(game.category || '-')}</b></small><strong>${game.isLiar ? '제시어: ???' : `제시어: ${esc(game.word || '')}`}</strong></div>` : '';
  const vote = game.phase === 'voting' ? `<div class="vote-grid">${game.players.filter((player) => player.connected && game.voteCandidateIds.includes(player.petId)).map((player) => `<button data-action="liar-vote" data-id="${player.petId}" type="button" ${game.hasVoted ? 'disabled' : ''}>${esc(player.displayName)}</button>`).join('')}</div>` : '';
  const guess = game.phase === 'liar_guess' && game.isLiar ? `<form id="liar-guess-form" class="inline-form"><input name="guess" maxlength="40" placeholder="제시어 입력" required><button class="primary" type="submit">정답 제출</button></form>` : '';
  const result = game.roundResult ? `<div class="result-card"><strong>${game.roundResult.liarWon ? '라이어 승리' : '시민 승리'}</strong><p>${esc(game.roundResult.reason)}</p><small>총 판돈 ${points(game.roundResult.payout?.pot || 0)} · 1인 지급 ${points(game.roundResult.payout?.each || 0)}</small></div>` : '';
  const gameOver = game.phase === 'game_over' && game.isHost ? '<button class="primary" data-action="liar-reset" type="button">다시 준비하기</button>' : '';
  return `${sectionHeading('라이어게임', `${liarPhaseLabel(game.phase)} · 1라운드`, game.phaseEndsAt ? '<span id="liar-countdown" class="tag"></span>' : '')}<div class="liar-reaction-stage">${spectatorBurstLayer(game.reactions || [], 'liar')}<div class="liar-layout"><div><div class="liar-player-list">${players}</div>${waitingControls}${role}${vote}${guess}${result}${spectatorReactionBar('liar', null, game.reactions || [], false)}${gameOver}</div>${liarChat(game, me.id, false)}</div></div>`;
}

function liarChatMessages(game, myPetId) {
  const messages = game.messages.map((message) => message.type === 'system'
    ? `<div class="chat-system" data-chat-id="${esc(message.id || '')}">${esc(message.text)}</div>`
    : `<div class="chat-message ${message.petId === myPetId ? 'mine' : ''}" data-chat-id="${esc(message.id || '')}"><div class="chat-message-head"><strong>${esc(message.displayName)}</strong>${app.data.admin.isAdmin ? `<button data-action="admin-delete-liar-chat" data-id="${message.id}" type="button">삭제</button>` : ''}</div><p>${esc(message.text)}</p></div>`).join('');
  return messages || '<div class="empty">아직 채팅이 없습니다.</div>';
}

function liarChat(game, myPetId, readOnly = false) {
  return `<div class="liar-chat-section"><h3>${readOnly ? '공개 채팅 보기' : '게임 채팅'}</h3><div id="liar-chat-box" class="chat-box">${liarChatMessages(game, myPetId)}</div>${readOnly ? '<p class="helper">관전자는 채팅에 참여할 수 없습니다.</p>' : `<form id="liar-chat-form" class="chat-form"><input name="text" maxlength="200" autocomplete="off" placeholder="채팅 입력" value="${esc(app.liarChatDraft)}" required><button class="primary" type="submit">전송</button></form>`}</div>`;
}

function captureLiarChatScrollState(chat = $('#liar-chat-box')) {
  if (!chat) return null;
  const distanceFromBottom = chat.scrollHeight - chat.scrollTop - chat.clientHeight;
  const nearBottom = distanceFromBottom < 80;
  const chatRect = chat.getBoundingClientRect();
  const items = [...chat.querySelectorAll('[data-chat-id]')];
  const anchor = items.find((item) => item.getBoundingClientRect().bottom > chatRect.top + 1) ?? items[0] ?? null;
  return {
    nearBottom,
    scrollTop: chat.scrollTop,
    scrollHeight: chat.scrollHeight,
    anchorId: anchor?.dataset.chatId ?? null,
    anchorOffset: anchor ? anchor.getBoundingClientRect().top - chatRect.top : 0
  };
}

function restoreLiarChatScrollState(snapshot, chat = $('#liar-chat-box')) {
  if (!chat) return;
  if (!snapshot || snapshot.nearBottom) {
    chat.scrollTop = chat.scrollHeight;
    return;
  }
  const anchor = [...chat.querySelectorAll('[data-chat-id]')].find((item) => item.dataset.chatId === snapshot.anchorId);
  if (anchor) {
    const chatTop = chat.getBoundingClientRect().top;
    const delta = (anchor.getBoundingClientRect().top - chatTop) - snapshot.anchorOffset;
    chat.scrollTop = Math.max(0, chat.scrollTop + delta);
    return;
  }
  const heightDelta = chat.scrollHeight - snapshot.scrollHeight;
  chat.scrollTop = Math.max(0, snapshot.scrollTop + Math.max(0, heightDelta));
}

function refreshLiarChatOnly() {
  if (!app.data || app.tab !== 'games') return false;
  const game = app.data.liarGame;
  const me = app.data.dashboard.pet;
  const chat = $('#liar-chat-box');
  const input = $('#liar-chat-form input[name="text"]');
  if (!game?.joined || !chat || !input) return false;
  const scrollSnapshot = captureLiarChatScrollState(chat);
  const composerSnapshot = captureLiarComposerState();
  app.liarChatDraft = input.value;
  chat.innerHTML = liarChatMessages(game, me.id);
  requestAnimationFrame(() => {
    restoreLiarComposerState(composerSnapshot);
    restoreLiarChatScrollState(scrollSnapshot, chat);
  });
  return true;
}
function territoryOwnerColor(ownerPetId = '') {
  let hash = 0;
  for (const char of String(ownerPetId)) hash = ((hash << 5) - hash + char.codePointAt(0)) | 0;
  return `hsl(${Math.abs(hash) % 360} 62% 38%)`;
}

function territoryViewPage() {
  const territory = app.data.territory;
  const mapSize = Math.max(1, Math.floor(Number(territory.size) || 4));
  const occupied = new Map(territory.cells.map((cell) => [`${cell.row}:${cell.col}`, cell]));
  const battleUnlocked = Boolean(territory.battleUnlocked);
  const rows = Array.from({ length: mapSize }, (_, row) => {
    const rowCells = Array.from({ length: mapSize }, (_, col) => {
      const cell = occupied.get(`${row}:${col}`) ?? null;
      const golden = Boolean(cell?.golden);
      const home = Boolean(cell?.home);
      const title = cell ? `${cell.ownerDisplayName}${home ? (battleUnlocked ? ' · 본진(전면전: 탈취 가능)' : ' · 본진') : ''}${golden ? ' · 황금 영토' : ''}` : (golden ? '황금 영토 · 빈 땅' : '빈 땅');
      const owner = cell ? `<span class="territory-owner" style="--owner-color:${territoryOwnerColor(cell.ownerPetId)}">${home ? '<span class="territory-home-icon" aria-hidden="true">🏠</span>' : ''}${esc(cell.ownerDisplayName)}</span>` : '<span class="territory-empty-label">빈 땅</span>';
      return `<button class="territory-cell ${cell ? (cell.mine ? 'mine occupied' : 'occupied') : 'vacant'} ${home ? 'home' : ''} ${golden ? 'golden' : ''}" ${cell ? `style="--owner-color:${territoryOwnerColor(cell.ownerPetId)}"` : ''} data-action="claim-territory-direct" data-row="${row}" data-col="${col}" type="button" ${cell?.mine ? 'disabled' : ''} title="${esc(title)}" aria-label="${row + 1}행 ${col + 1}열 · ${esc(title)}">${golden ? '<span class="territory-star">★</span>' : ''}${owner}</button>`;
    }).join('');
    return `<div class="territory-row" role="row" data-row="${row}">${rowCells}</div>`;
  }).join('');
  const ranking = territory.ranking.length ? territory.ranking.map((item) => `<div class="rank-row"><b>${item.rank}</b><span style="color:${territoryOwnerColor(item.petId)}">${esc(item.displayName)}${item.hasGolden ? ' ★' : ''}</span><strong>${item.count}칸</strong></div>`).join('') : '<div class="empty">아직 설치된 땅이 없습니다.</div>';
  const goldenStatus = '<b>👑 황금 영토는 게임 종료 후 공개됩니다.</b>';
  const last = territory.lastResult;
  const previousResult = last?.goldenCell
    ? `<section class="section territory-result-section">${sectionHeading(`제${last.seasonNumber}회 결과`, '종료된 시즌의 황금 영토는 이제 공개됩니다.')}<div class="territory-last-result"><div><small>우승</small><strong>${last.winnerDisplayName ? `${esc(last.winnerDisplayName)} · ${points(last.reward || 0)}` : '보상 대상 없음'}</strong></div><div><small>황금 영토</small><strong>${Number(last.goldenCell.row) + 1}행 ${Number(last.goldenCell.col) + 1}열</strong></div><div><small>종료 시점 소유</small><strong>${last.goldenOwnerDisplayName ? esc(last.goldenOwnerDisplayName) : '빈 땅'}</strong></div></div></section>`
    : '';
  return `<section class="page-title"><span class="eyebrow">6시간 시즌</span><h1>제${territory.seasonNumber}회 레고 영토전</h1><p>본진을 지키면서 주변 8칸으로 땅을 넓히고 상대 영토를 빼앗는 게임입니다.</p></section>${previousResult}<section class="section territory-summary"><div class="metric-grid">${compactMetric('남은 시간', `<span id="territory-countdown">${durationText(new Date(territory.endsAt).getTime() - Date.now())}</span>`, '', { raw: true })}${compactMetric('내 레벨', `Lv.${territory.my.level}`)}${compactMetric('내 영토', `${territory.my.owned}/${territory.my.limit}`)}${compactMetric('현재 순위', territory.my.rank ? `${territory.my.rank}위` : '-')}</div><div class="territory-golden-status">${goldenStatus}</div><div class="territory-golden-status"><b>${battleUnlocked ? '⚔️ 전면전 진행 중 · 본진 탈취 가능' : `🛡️ 본진 보호 중 · ${territory.cells.length}/${mapSize * mapSize}칸 점유`}</b></div><div class="territory-rule"><b>룰:</b> 빈 땅 점령은 무료, 상대 땅 탈취는 20P입니다. 처음에는 🏠 본진이 보호됩니다. 맵 25칸이 한 번이라도 모두 차면 ⚔️ 전면전이 열려 본진도 탈취할 수 있습니다. 전면전 이후 영토가 0칸이 되어도 다른 칸을 차지해 다시 참가할 수 있습니다. 보유 한도가 꽉 차면 가장 오래된 일반 영토가 이동하며, 일반 영토가 없는 1칸 보유자는 전면전에서 본진을 옮겨 공격할 수 있습니다.</div></section><section class="section territory-section">${sectionHeading('공용 맵', `${mapSize} × ${mapSize}`)}<div class="territory-scroll"><div class="territory-map" role="grid" aria-label="${mapSize}행 ${mapSize}열 레고 영토전 맵">${rows}</div></div><p class="helper centered">회색칸은 빈 땅, 색깔 닉네임은 소유자입니다. 🏠 본진은 전면전 전까지만 보호되며, 25/25칸이 모두 차면 이후 탈취 가능합니다. 황금 영토 위치는 종료 전에는 공개되지 않습니다.</p></section><section class="section">${sectionHeading('현재 순위', '단독 1위만 300P를 받습니다. 동률이면 종료 후 공개되는 황금 영토가 최종 승자를 가릅니다.')}<div class="rank-list">${ranking}</div></section>`;
}

function socialView() {
  const requests = app.data.requests ?? [];
  const relationships = app.data.relationships ?? [];
  const online = app.data.online ?? [];
  const bungs = app.data.bungs ?? [];
  const requestCards = requests.map((request) => request.type === 'mating'
    ? `<article class="request-card mating-request"><div><strong>💕 ${esc(request.fromDisplayName)}</strong><small>교미 신청</small></div><div class="button-row"><button class="primary" data-action="accept-mating" data-id="${request.fromPetId}" data-request-id="${request.id}" type="button">수락</button><button class="ghost" data-action="reject-mating" data-id="${request.fromPetId}" data-request-id="${request.id}" type="button">거절</button></div></article>`
    : `<article class="request-card"><div><strong>${esc(request.fromDisplayName)}</strong><small>매칭 신청</small></div><div class="button-row"><button class="primary" data-action="accept-match" data-id="${request.fromPetId}" data-request-id="${request.id}" type="button">수락</button><button class="ghost" data-action="reject-match" data-id="${request.fromPetId}" data-request-id="${request.id}" type="button">거절</button></div></article>`).join('');
  const bungActions = '<div class="button-row compact"><button class="soft-button" data-action="show-recent-bungs" type="button">지난 벙 보기</button><button class="primary" data-action="create-bung" type="button">벙 열기</button></div>';
  return `
    <section class="page-title"><span class="eyebrow">소셜</span><h1>관계와 벙</h1><p>매칭, 찌르기, 교미 신청과 포인트 벙을 이용할 수 있습니다.</p></section>
    ${requests.length ? `<section class="section">${sectionHeading('받은 신청')}<div class="request-list">${requestCards}</div></section>` : ''}
    <section class="section">${sectionHeading('온라인 레고', `${online.length}명 접속 중`, '<button class="soft-button" data-action="show-online" type="button">전체 보기</button>')}<div class="profile-grid">${online.slice(0, 8).map(profileMiniCard).join('') || '<div class="empty">현재 온라인 레고가 없습니다.</div>'}</div></section>
    <section class="section">${sectionHeading('내 관계')}<div class="relationship-list">${relationships.length ? relationships.map((item) => `<article class="relationship-card"><button data-action="profile" data-id="${item.petId}" type="button"><strong>${esc(item.displayName)}</strong><small>${esc(item.label)}${item.partner ? ` · D+${item.coupleDay}` : ''}</small></button></article>`).join('') : '<div class="empty">아직 관계 기록이 없습니다.</div>'}</div></section>
    <section class="section">${sectionHeading('레고 주민목록', `${(app.data.residents ?? []).length}명`, '<button class="soft-button" data-action="open-style-shop" type="button">꾸미기 상점</button>')}<div class="profile-grid resident-grid">${(app.data.residents ?? []).map(profileMiniCard).join('') || '<div class="empty">가입한 레고가 없습니다.</div>'}</div></section>
    <section class="section">${sectionHeading('벙', '방장이 최소 500P 이상 사용해 열 수 있습니다.', bungActions)}<div class="bung-list">${bungs.length ? bungs.map((bung) => `<button class="bung-card" data-action="open-bung" data-id="${bung.id}" type="button"><div><strong>${esc(bung.title)}</strong><small>${esc(bung.hostDisplayName)} · ${points(bung.stakePoints)}</small></div><span>${bung.status === 'live' ? '진행 중' : '모집 중'} · ${bung.attendees.length}/30명</span></button>`).join('') : '<div class="empty">현재 열린 벙이 없습니다.</div>'}</div></section>
  `;
}

function profileMiniCard(profile) {
  const stage = profile.bodyStage || stageForBody(profile.stats.body); const c = profile.cosmetics ?? {};
  const classes = ['profile-mini', cosmeticClasses(c)].filter(Boolean).join(' ');
  return `<button class="${classes}" data-action="profile" data-id="${profile.id}" type="button">${c.title ? `<em class="cos-title">${esc(c.title)}</em>` : ''}${seasonBadgesHtml(profile)}${avatar(stage, { mini: true })}<strong class="${c.nameSparkle ? 'cos-name-sparkle' : ''}">${esc(profile.displayName)}</strong>${profile.statusMessage ? `<span class="profile-status-message ${c.statusGlow ? 'cos-status-glow' : ''}">${esc(profile.statusMessage)}</span>` : ''}<small>${profile.online ? '🟢 ' : ''}Lv.${profile.stats.level} · ${points(profile.stats.points)}</small></button>`;
}

function openStyleShop() {
  const me = app.data.dashboard.pet; const items = app.data.catalog.cosmetics ?? [];
  openModal(`${modalHeader('꾸미기 상점', `보유 ${points(me.stats.points)} · 주민목록/프로필에 표시`)}<div class="style-shop">${items.map((item) => `<article class="style-shop-item"><div><strong>${esc(item.name)}</strong><p>${esc(item.description)}</p></div><button class="primary" data-action="buy-cosmetic" data-id="${esc(item.id)}" type="button" ${me.stats.points < item.price ? 'disabled' : ''}>${points(item.price)}</button></article>`).join('')}</div>`, { type:'styleShop' });
}

function recordsView() {
  const pet = app.data.dashboard.pet;
  const records = pet.records;
  const history = app.data.history ?? [];
    return `<section class="page-title"><span class="eyebrow">기록</span><h1>${esc(pet.displayName)}의 기록</h1><p>현재 레고의 핵심 기록만 표시합니다.</p></section><section class="section"><div class="record-grid">${compactMetric('세대', `${pet.generation}세대`)}${compactMetric('생존', `${records.days}게임일`)}${compactMetric('레벨', `Lv.${pet.stats.level}`)}${compactMetric('레고력', `${pet.stats.legoPower}`)}${compactMetric('포인트', points(pet.stats.points))}${compactMetric('최고 포인트', points(records.maxPoints))}${compactMetric('현재 경고', `${pet.warnings}회`)}${compactMetric('누적 경고', `${pet.records.warnings}회`)}${compactMetric('영토전 우승', `${records.territoryWins}회`)}${compactMetric('라이어 승리', `${records.liarWins}회`)}${compactMetric('번개 최고', records.bestReactionMs ? `${(records.bestReactionMs/1000).toFixed(3)}초` : '-')}${compactMetric('낚시', `${records.fishing}회`)}</div></section><section class="section">${sectionHeading('과거 레고', '강퇴 등으로 끝난 이전 세대')}<div class="history-list">${history.length ? history.map((item) => `<article><div><strong>${esc(item.displayName)}</strong><small>${esc(item.endReason || '종료')} · ${dateText(item.endedAt)}${item.endDetail ? ` · ${esc(item.endDetail)}` : ''}</small></div><span>최고 Lv.${item.records?.maxLevel || 1} · ${points(item.records?.maxPoints || 0)}</span></article>`).join('') : '<div class="empty">아직 과거 레고가 없습니다.</div>'}</div></section>${app.data.admin.isAdmin ? `<section class="section admin-callout"><div><h2>운영자 관리</h2><p>포인트 지급·회수, 일반 경고, 강퇴, 계정 삭제, 상태 초기화와 라이어게임 관리를 할 수 있습니다.</p></div><button class="primary" data-action="open-admin" type="button">관리 열기</button></section>` : ''}<section class="section"><button class="danger-button wide" data-action="logout" type="button">모든 기기에서 로그아웃</button></section>`;
}

function captureLiarComposerState() {
  const input = $('#liar-chat-form input[name="text"]');
  if (!input) return null;
  app.liarChatDraft = input.value;
  return {
    value: input.value,
    focused: document.activeElement === input,
    selectionStart: Number.isInteger(input.selectionStart) ? input.selectionStart : input.value.length,
    selectionEnd: Number.isInteger(input.selectionEnd) ? input.selectionEnd : input.value.length
  };
}

function restoreLiarComposerState(snapshot) {
  const input = $('#liar-chat-form input[name="text"]');
  if (!input) return;
  const value = snapshot?.value ?? app.liarChatDraft ?? '';
  input.value = value;
  app.liarChatDraft = value;
  if (!snapshot?.focused) return;
  try { input.focus({ preventScroll: true }); } catch { input.focus(); }
  const start = Math.min(value.length, Math.max(0, snapshot.selectionStart ?? value.length));
  const end = Math.min(value.length, Math.max(start, snapshot.selectionEnd ?? start));
  try { input.setSelectionRange(start, end); } catch { /* mobile browser fallback */ }
}

function render() {
  if (!app.data) return;
  const liarComposer = captureLiarComposerState();
  const liarScroll = captureLiarChatScrollState();
  const view = $('#view');
  if (app.tab === 'home') view.innerHTML = homeView();
  else if (app.tab === 'games') view.innerHTML = gamesView();
  else if (app.tab === 'territory') view.innerHTML = territoryViewPage();
  else if (app.tab === 'social') view.innerHTML = socialView();
  else view.innerHTML = recordsView();
  $$('.nav-item').forEach((button) => button.classList.toggle('active', button.dataset.tab === app.tab));
  $('#online-count').textContent = app.data.onlineCount || 0;
  const unread = app.data.notifications.filter((item) => !item.read).length;
  const badge = $('#notification-badge');
  badge.textContent = unread;
  badge.classList.toggle('hidden', unread === 0);
  requestAnimationFrame(() => {
    restoreLiarComposerState(liarComposer);
    restoreLiarChatScrollState(liarScroll);
    syncOmokBoardSquare();
  });
}

function openNotifications() {
  const items = app.data.notifications ?? [];
  openModal(`${modalHeader('알림', '새 알림을 확인하세요.')}<div class="modal-actions"><button class="soft-button wide" data-action="read-all" type="button">모두 읽음</button></div><div class="notification-list">${items.length ? items.map((item) => `<article class="${item.read ? '' : 'unread'}"><div><p>${esc(item.text)}</p><small>${dateText(item.createdAt)}</small></div>${item.read ? '' : `<button data-action="read-notification" data-id="${item.id}" type="button">읽음</button>`}</article>`).join('') : '<div class="empty">알림이 없습니다.</div>'}</div>`, { type: 'notifications' });
}

function openOnlineModal() {
  openModal(`${modalHeader('온라인 레고', `${app.data.onlineCount}명 접속 중`)}<div class="profile-grid">${app.data.online.map(profileMiniCard).join('') || '<div class="empty">현재 온라인 레고가 없습니다.</div>'}</div>`, { type: 'online' });
}

function openRecentBungs() {
  const items = app.data?.recentBungs ?? [];
  const cards = items.length ? items.map((bung) => `<article class="recent-bung-card"><div><strong>${esc(bung.title)}</strong><small>방장 ${esc(bung.hostDisplayName)} · ${bung.attendees.length}명</small></div><p>${bung.attendees.map((item) => esc(item.displayName)).join(', ')}</p><time>${dateText(bung.endedAt)} 종료</time></article>`).join('') : '<div class="empty">아직 끝난 벙이 없습니다.</div>';
  openModal(`${modalHeader('지난 벙', '최근 정상 종료된 벙 10개')}<div class="recent-bung-list">${cards}</div>`, { type: 'recentBungs' });
}

function bodyRangeLabel(stage) {
  return stage.max == null ? `${stage.min} 이상` : `${stage.min}~${stage.max}`;
}

function openBodyGuide(bodyValue = app.data?.dashboard?.pet?.stats?.body) {
  const body = Number(bodyValue);
  const current = stageForBody(body);
  const cards = bodyStages().map((stage, index) => { const life = lifeHungerCostsForStage(stage); return `<article class="body-guide-card ${stage.key === current.key ? 'current' : ''}"><span class="body-guide-step">${index + 1}단계</span>${avatar(stage, { mini: true })}<div><strong>${esc(stage.label)}</strong><small>몸집 ${esc(bodyRangeLabel(stage))}</small><small>게임·교미·영토 배고픔 -${Math.max(1, Number(stage.activityHungerCost) || 1)}</small><small>생활: 일 -${life.work} · 쉬기 -${life.rest} · 헬스 -${life.exercise}</small>${stage.key === current.key ? '<b>현재 단계</b>' : ''}</div></article>`; }).join('');
  openModal(`${modalHeader('레고 체형 도감', `현재 몸집 ${Number.isFinite(body) ? Math.round(body) : '-'} · ${current.label}`)}<div class="body-guide-list">${cards}</div>`, { type: 'bodyGuide', body });
}

function openStatusMessageEditor() {
  const pet = app.data.dashboard.pet;
  const maxLength = Math.max(1, Number(app.data?.catalog?.statusMessageMaxLength) || 20);
  const value = String(pet.statusMessage ?? '');
  openModal(`${modalHeader('상태메시지', `온라인 레고에 표시됩니다. 최대 ${maxLength}자`)}<form id="status-message-form" class="stack-form"><label>상태메시지<input id="status-message-input" name="statusMessage" maxlength="${maxLength}" value="${esc(value)}" placeholder="예: 오늘도 레고 키우는 중" autocomplete="off"></label><div class="status-message-counter"><span>비워두면 상태메시지가 표시되지 않습니다.</span><strong id="status-message-count">${[...value].length}/${maxLength}</strong></div><button class="primary wide" type="submit">저장</button></form>`, { type: 'statusMessage' });
  requestAnimationFrame(() => {
    const input = $('#status-message-input');
    if (!input) return;
    input.focus();
    input.setSelectionRange?.(input.value.length, input.value.length);
  });
}

function openFoodShop() {
  const foods = app.data.catalog.foods;
  const body = Number(app.data.dashboard.pet.stats.body) || 0;
  openModal(`${modalHeader('음식 상점', `보유 포인트 ${points(app.data.dashboard.pet.stats.points)}`)}<div class="food-grid">${foods.map((food) => { const locked = Number(food.minBody) > body; return `<article class="food-card ${locked ? 'locked' : ''}"><div><strong>${esc(food.name)}</strong><p>${esc(food.description)}</p><small>배고픔 +${food.hunger} · 몸집 +${food.body}${food.minBody ? ` · 몸집 ${food.minBody}+` : ''}</small></div><button class="primary" data-action="eat" data-id="${food.id}" type="button" ${locked ? 'disabled' : ''}>${locked ? '잠김' : points(food.price)}</button></article>`; }).join('')}</div>`, { type: 'food' });
}

function openFishingRewards() {
  openModal(`${modalHeader('🎣 낚시 보상', '30초 후 아래 결과 중 하나가 나옵니다.')}<div class="reward-grid">${app.data.catalog.fishingRewards.map((item) => `<article><strong>${esc(item.label)}</strong><span>${item.reward ? points(item.reward) : '꽝'}</span></article>`).join('')}</div>`, { type: 'fishingRewards' });
}

async function openProfile(petId) {
  try {
    const result = await api(`/api/profiles/${encodeURIComponent(petId)}`);
    app.profile = result.profile;
    const profile = result.profile;
    const me = app.data.dashboard.pet;
    const self = profile.id === me.id;
    const stage = profile.bodyStage || stageForBody(profile.stats.body);
    const relationshipActions = self ? '' : `<div class="profile-actions"><button class="soft-button" data-action="poke" data-id="${profile.id}" type="button" ${profile.poke && !profile.poke.canPoke ? 'disabled' : ''}>${profile.poke?.isReturnPoke ? '되찌르기' : '찌르기'}${profile.poke ? ` · ${profile.poke.total}회` : ''}</button>${!me.partnerPetId && !profile.partnerPetId ? `<button class="primary" data-action="request-match" data-id="${profile.id}" type="button">매칭 신청</button>` : ''}${me.partnerPetId === profile.id ? `<button class="danger-button" data-action="breakup" data-id="${profile.id}" type="button">헤어지기</button>` : ''}<button class="warning-button" data-action="request-mating" data-id="${profile.id}" type="button">교미 신청</button></div>`;
    openModal(`${modalHeader(profile.displayName, profile.relationshipLabel || '')}<div class="profile-detail ${cosmeticClasses(profile.cosmetics)}">${profile.cosmetics?.title ? `<em class="cos-title profile-title">${esc(profile.cosmetics.title)}</em>` : ''}${seasonBadgesHtml(profile)}${avatar(stage)}<button class="body-stage-profile-link" data-action="body-guide" data-body="${profile.stats.body}" type="button">${esc(stage.label)} · 몸집 ${profile.stats.body} · 단계 보기</button>${profile.statusMessage ? `<p class="profile-status-detail ${profile.cosmetics?.statusGlow ? 'cos-status-glow' : ''}">${esc(profile.statusMessage)}</p>` : ''}<div class="metric-grid">${compactMetric('포인트', points(profile.stats.points))}${compactMetric('레벨', `Lv.${profile.stats.level}`)}${compactMetric('레고력', `${profile.stats.legoPower}`)}${compactMetric('몸집', `${profile.stats.body}`)}${compactMetric('경고', `${profile.warnings}회`)}${compactMetric('상태', profile.partnerPetId ? `커플 D+${profile.coupleDay}` : '솔로')}</div>${relationshipActions}</div>`, { type: 'profile', petId });
  } catch (error) { toast(error.message, 'error'); }
}

function openOddEvenBet() {
  const balance = Math.max(0, Math.floor(Number(app.data?.dashboard?.pet?.stats?.points) || 0));
  const rules = app.data?.catalog?.oddEven ?? { minStake: 10, stakeStep: 10, payoutPercent: { 1: 130, 2: 160, 3: 200 } };
  const minStake = Math.max(1, Math.floor(Number(rules.minStake) || 10));
  const stakeStep = Math.max(1, Math.floor(Number(rules.stakeStep) || 10));
  const payoutPercent = rules.payoutPercent ?? { 1: 130, 2: 160, 3: 200 };
  const maxStake = balance;
  const disabled = maxStake < minStake ? 'disabled' : '';
  openModal(`${modalHeader('홀짝 배팅', `보유 포인트 ${points(balance)}`)}<form id="odd-even-bet-form" class="stack-form odd-even-bet-form"><label>걸 포인트<input id="odd-even-stake" name="stakePoints" type="number" inputmode="numeric" min="${minStake}" max="${maxStake}" step="${stakeStep}" placeholder="${minStake}~${maxStake}P · ${stakeStep}P 단위" autocomplete="off" required ${disabled}></label><div class="odd-even-preview"><div><span>1연승 정산</span><strong id="odd-even-payout-1">-</strong></div><div><span>2연승 정산</span><strong id="odd-even-payout-2">-</strong></div><div><span>3연승 정산</span><strong id="odd-even-payout-3">-</strong></div></div><p class="warning-box">보유 포인트 안에서 ${minStake}P 이상을 ${stakeStep}P 단위로 원하는 만큼 걸 수 있습니다. 시작할 때 판돈이 차감되고, 실패하면 전액을 잃습니다. 1연승은 원금+30%(1.3배), 2연승은 원금+60%(1.6배), 3연승은 원금+100%(2배)를 총 지급합니다.</p><button class="primary wide" type="submit" ${disabled}>배팅 시작</button></form>`, { type: 'oddEvenBet' });
  requestAnimationFrame(() => {
    const input = $('#odd-even-stake');
    if (!input) return;
    const update = () => {
      const stake = Number(input.value);
      const valid = Number.isSafeInteger(stake) && stake >= minStake && stake <= maxStake && stake % stakeStep === 0;
      const payout = (streak) => {
        const percent = Number(payoutPercent[streak]);
        return valid && Number.isFinite(percent) ? points(Math.floor((stake * percent) / 100)) : '-';
      };
      $('#odd-even-payout-1').textContent = payout(1);
      $('#odd-even-payout-2').textContent = payout(2);
      $('#odd-even-payout-3').textContent = payout(3);
    };
    input.addEventListener('input', update);
    input.focus();
    update();
  });
}

function appleTimeText(challenge) {
  const remaining = Math.max(0, Math.ceil((new Date(challenge.expiresAt).getTime() - serverAlignedNow(app.data?.serverTime)) / 1000));
  return `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
}

function appleBoardHtml(challenge) {
  return (challenge.appleBoard ?? []).map((row, rowIndex) => row.map((value, colIndex) => `<div class="apple-cell ${value == null ? 'removed' : ''}" data-apple-row="${rowIndex}" data-apple-col="${colIndex}">${value == null ? '' : value}</div>`).join('')).join('');
}

function openMiniGame(challenge) {
  if (!challenge) return closeModal();
  let content = '';
  if (challenge.gameId === 'oddEven') content = `<div class="mini-center"><div class="game-icon big">🌓</div><h3>${challenge.streak ? `${challenge.streak}연승 중` : '홀일까 짝일까?'}</h3><p>${points(challenge.stake)}는 시작할 때 이미 걸었습니다. 틀리면 전액을 잃습니다.</p><div class="button-row"><button class="primary" data-action="finish-mini" data-value="odd" type="button">홀</button><button class="primary" data-action="finish-mini" data-value="even" type="button">짝</button></div>${challenge.streak > 0 ? `<button class="soft-button wide" data-action="stop-mini" type="button">그만하고 ${points(challenge.pendingPayout)}</button>` : ''}</div>`;
  if (challenge.gameId === 'reaction') content = `<div id="reaction-stage" class="mini-center reaction-stage waiting"><div class="game-icon big">⚡</div><h3 id="reaction-title">아직 누르지 마세요</h3><p id="reaction-guide">PC는 마우스를 버튼 위에 올려두고 <b>초록색으로 바뀌는 순간</b> 클릭하세요.</p><button id="reaction-button" class="reaction-trigger-button" data-action="finish-mini" data-value="1" type="button"><span>대기</span><small>초록색이 되면 클릭!</small></button></div>`;
  if (challenge.gameId === 'number') content = `<div class="mini-center"><div class="game-icon big">🔢</div><h3>1부터 100 사이 숫자</h3><p>${challenge.attempts || 0}/${challenge.maxAttempts || 5}회 사용</p><form id="number-game-form" class="number-form"><input name="guess" type="number" inputmode="numeric" min="1" max="100" placeholder="숫자를 입력하세요" autocomplete="off" required><button class="primary" type="submit">확인</button></form>${challenge.guesses?.length ? `<div class="guess-history">입력: ${challenge.guesses.join(', ')}</div>` : ''}</div>`;
  if (challenge.gameId === 'apple') content = `<div class="apple-game"><div class="apple-hud"><div><small>남은 시간</small><strong id="apple-countdown">${appleTimeText(challenge)}</strong></div><div><small>게임 점수</small><strong>${Number(challenge.appleScore || 0).toLocaleString('ko-KR')}점</strong></div><div><small>획득 예정</small><strong>${points(challenge.applePendingPoints || 0)}</strong></div></div><p class="helper">드래그한 사각형 안 숫자의 합이 정확히 10이면 제거됩니다. 숫자 2개 제거 성공 +5P, 숫자 3개 이상 제거 성공 +6P · 랭킹 점수는 제거 숫자 1개당 20점.</p><div id="apple-board" class="apple-board" aria-label="사과게임 10 곱하기 10 숫자판">${appleBoardHtml(challenge)}</div><div id="apple-selection-info" class="apple-selection-info">드래그해서 숫자를 선택하세요.</div></div>`;
  openModal(`${modalHeader(app.data.catalog.miniGames.find((game) => game.id === challenge.gameId)?.name || '미니게임')}${content}`, { type: 'mini' });
  scheduleReactionReady(challenge);
  requestAnimationFrame(() => {
    $('#number-game-form input')?.focus();
    if (challenge.gameId === 'apple') setupAppleBoardInteractions();
  });
}

function appleCellFromPointer(event, board) {
  // 실제 터치 지점 아래의 셀을 먼저 사용해 모바일 CSS 스케일/테두리 때문에 좌표가 밀리지 않게 한다.
  const pointed = document.elementFromPoint?.(event.clientX, event.clientY)?.closest?.('.apple-cell');
  if (pointed && board.contains(pointed)) return { row: Number(pointed.dataset.appleRow), col: Number(pointed.dataset.appleCol) };

  // 포인터 캡처 상태에서 손가락이 보드 가장자리 밖으로 살짝 나간 경우에는 콘텐츠 박스 기준으로 안전하게 클램프한다.
  const rect = board.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const style = getComputedStyle(board);
  const leftBorder = Number.parseFloat(style.borderLeftWidth) || 0;
  const rightBorder = Number.parseFloat(style.borderRightWidth) || 0;
  const topBorder = Number.parseFloat(style.borderTopWidth) || 0;
  const bottomBorder = Number.parseFloat(style.borderBottomWidth) || 0;
  const width = Math.max(1, rect.width - leftBorder - rightBorder);
  const height = Math.max(1, rect.height - topBorder - bottomBorder);
  const x = Math.max(0, Math.min(width - 0.001, event.clientX - rect.left - leftBorder));
  const y = Math.max(0, Math.min(height - 0.001, event.clientY - rect.top - topBorder));
  return { row: Math.floor((y / height) * 10), col: Math.floor((x / width) * 10) };
}

function paintAppleSelection(start, end) {
  const minRow = Math.min(start.row, end.row), maxRow = Math.max(start.row, end.row);
  const minCol = Math.min(start.col, end.col), maxCol = Math.max(start.col, end.col);
  let sum = 0;
  let count = 0;
  $$('.apple-cell').forEach((cell) => {
    const row = Number(cell.dataset.appleRow), col = Number(cell.dataset.appleCol);
    const selected = row >= minRow && row <= maxRow && col >= minCol && col <= maxCol;
    cell.classList.toggle('selected', selected);
    if (selected && !cell.classList.contains('removed')) {
      sum += Number(cell.textContent || 0);
      count += 1;
    }
  });
  const info = $('#apple-selection-info');
  if (info) info.textContent = `선택 ${count}개 · 합 ${sum}${sum === 10 ? ' · 제거 가능!' : ''}`;
}

async function submitAppleSelection(start, end) {
  const challenge = app.data?.activeMiniChallenge;
  if (!challenge || challenge.gameId !== 'apple' || app.busy) return;
  const requestId = crypto.randomUUID?.() || `apple-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const result = await perform('/api/minigames/apple/select', {
    challengeId: challenge.id, startRow: start.row, startCol: start.col, endRow: end.row, endCol: end.col, requestId
  }, null, 'POST', { toastDuration: 900, toastType: 'game-start' });
}

function preventAppleBoardTouchScroll(event) {
  if (event.cancelable) event.preventDefault();
}

function setupAppleBoardInteractions() {
  const board = $('#apple-board');
  if (!board) return;
  // iOS/Android에서 숫자판 드래그가 페이지 스크롤로 전달되지 않도록 비수동 touchmove를 명시한다.
  board.addEventListener('touchmove', preventAppleBoardTouchScroll, { passive: false });
  let drag = null;
  board.addEventListener('pointerdown', (event) => {
    if (app.busy || drag) return;
    const cell = appleCellFromPointer(event, board);
    if (!cell) return;
    event.preventDefault();
    drag = { pointerId: event.pointerId, start: cell, end: cell };
    try { board.setPointerCapture(event.pointerId); } catch { /* ignore */ }
    paintAppleSelection(drag.start, drag.end);
  });
  board.addEventListener('pointermove', (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const cell = appleCellFromPointer(event, board);
    if (!cell) return;
    event.preventDefault();
    drag.end = cell;
    paintAppleSelection(drag.start, drag.end);
  });
  const finish = (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const finalDrag = drag;
    drag = null;
    try { board.releasePointerCapture(event.pointerId); } catch { /* ignore */ }
    submitAppleSelection(finalDrag.start, finalDrag.end);
  };
  board.addEventListener('pointerup', finish);
  board.addEventListener('pointercancel', () => { drag = null; $$('.apple-cell.selected').forEach((cell) => cell.classList.remove('selected')); });
}

function openCreateOmok() {
  const balance = Math.max(0, Number(app.data?.dashboard?.pet?.stats?.points) || 0);
  openModal(`${modalHeader('오목방 만들기', `보유 포인트 ${points(balance)}`)}<form id="omok-create-form" class="stack-form"><label>판돈<select name="preset" id="omok-stake-preset"><option value="100">100P</option><option value="500">500P</option><option value="1000">1,000P</option><option value="2000">2,000P</option><option value="3000">3,000P</option><option value="custom">직접 입력</option></select></label><label id="omok-custom-stake-wrap" class="hidden">직접 입력<input name="customStake" type="number" inputmode="numeric" min="1000" step="1000" placeholder="4,000 / 5,000 / ..."></label><p class="warning-box">100P, 500P 또는 1,000P 이상 1,000P 단위만 가능합니다. 상대가 참가해 게임이 확정될 때 양쪽 판돈이 서버에서 함께 확보됩니다.</p><button class="primary wide" type="submit">방 만들기</button></form>`, { type: 'omokCreate' });
  requestAnimationFrame(() => {
    const preset = $('#omok-stake-preset');
    preset?.addEventListener('change', () => $('#omok-custom-stake-wrap')?.classList.toggle('hidden', preset.value !== 'custom'));
  });
}

function openCreateBung() {
  openModal(`${modalHeader('벙 열기', `최소 ${points(app.data.catalog.bungMinStake)} 이상 사용`)}<form id="bung-create-form" class="stack-form"><label>벙 제목<input name="title" maxlength="40" placeholder="예: 주말 치킨벙" required></label><label>개설 포인트<input name="stakePoints" type="number" inputmode="numeric" min="${app.data.catalog.bungMinStake}" step="1" value="${app.data.catalog.bungMinStake}" required></label><p class="warning-box">개설 포인트는 즉시 차감되며 취소해도 반환되지 않습니다.</p><button class="primary wide" type="submit">벙 열기</button></form>`, { type: 'createBung' });
}

function openBung(bungId) {
  const bung = app.data.bungs.find((item) => item.id === bungId);
  if (!bung) return closeModal();
  const me = app.data.dashboard.pet;
  const controls = `<div class="button-row">${!bung.joined && bung.status === 'open' ? `<button class="primary" data-action="join-bung" data-id="${bung.id}" type="button">참가</button>` : ''}${bung.joined ? `<button class="ghost" data-action="leave-bung" data-id="${bung.id}" type="button">나가기</button>` : ''}${bung.isHost && bung.status === 'open' ? `<button class="primary" data-action="start-bung" data-id="${bung.id}" type="button">시작</button>` : ''}${bung.isHost && bung.status === 'live' ? `<button class="primary" data-action="end-bung" data-id="${bung.id}" type="button">벙 끝내기</button>` : ''}</div>`;
  openModal(`${modalHeader(bung.title, `${bung.hostDisplayName} · 개설 ${points(bung.stakePoints)}`)}<div class="bung-detail"><div class="metric-grid">${compactMetric('상태', bung.status === 'live' ? '진행 중' : '모집 중')}${compactMetric('참가 인원', `${bung.attendees.length}/30`)}${compactMetric('시작 조건', '2명 이상')}${compactMetric('종료 보상', '레고력 +1')}</div><div class="attendee-list">${bung.attendees.map((item) => `<div class="${item.petId === me.id ? 'me' : ''}"><span>${esc(item.displayName)}</span><small>${esc(item.status)}</small></div>`).join('')}</div><p class="warning-box">정상 종료 시 끝까지 참가한 전원 체력 -20, 레고력 +1. 오늘 첫 벙 목표도 별도로 +1입니다.</p>${controls}</div>`, { type: 'bung', bungId });
}

function openAdmin() {
  const admin = app.data.admin;
  const members = admin.members.map((member) => {
    const petControls = member.hasActivePet !== false
      ? `<button class="admin-point-give" data-action="admin-points" data-id="${member.petId}" data-name="${esc(member.displayName)}" data-value="1" type="button">포인트+</button><button class="admin-point-take" data-action="admin-points" data-id="${member.petId}" data-name="${esc(member.displayName)}" data-value="-1" type="button">포인트-</button><button data-action="admin-warning" data-id="${member.petId}" data-value="1" type="button">경고+</button><button data-action="admin-warning" data-id="${member.petId}" data-value="-1" type="button">경고-</button><button data-action="admin-reset-user" data-id="${member.petId}" type="button">상태 초기화</button><button class="danger-button" data-action="admin-kick" data-id="${member.petId}" type="button">강퇴</button>`
      : '';
    const summary = member.hasActivePet === false
      ? '가입 계정은 존재하지만 현재 레고 데이터가 없습니다.'
      : `Lv.${member.level} · ${points(member.points)} · 일반 경고 ${member.warnings} · 누적 ${member.warningTotal}`;
    return `<article class="admin-member" data-admin-user-id="${esc(member.userId)}"><div><strong>${esc(member.displayName)}${member.isSelf ? ' <span class="admin-self-badge">내 계정</span>' : ''}</strong><small>${summary}</small></div><div class="admin-buttons">${petControls}${member.isSelf ? '' : `<button class="danger-button admin-delete-account" data-action="admin-delete-account" data-user-id="${member.userId}" type="button">계정 삭제</button>`}</div></article>`;
  }).join('');
  const chats = admin.liarChats.map((chat) => `<article class="admin-chat"><div><strong>${esc(chat.displayName)}</strong><p>${esc(chat.text)}</p><small>${dateText(chat.createdAt)}</small></div><button class="danger-button" data-action="admin-delete-liar-chat" data-id="${chat.id}" type="button">삭제</button></article>`).join('');
  const auditLogs = (admin.auditLogs ?? []).map((entry) => {
    const detail = entry.action === 'account_delete'
      ? `${esc(entry.adminDisplayName)} → ${esc(entry.targetDisplayName)} 계정 삭제`
      : `${esc(entry.adminDisplayName)} → ${esc(entry.targetDisplayName)} ${Number(entry.delta) >= 0 ? '지급' : '회수'} ${points(Math.abs(Number(entry.delta) || 0))}`;
    const balance = entry.action === 'point_adjust' && Number.isFinite(Number(entry.before)) && Number.isFinite(Number(entry.after)) ? ` · ${points(entry.before)} → ${points(entry.after)}` : '';
    return `<article class="admin-audit"><div><strong>${detail}</strong><small>${dateText(entry.createdAt)}${balance}</small></div></article>`;
  }).join('');
  openModal(`${modalHeader('운영자 관리', `내 User ID: ${admin.userId}`)}<div class="admin-top"><button class="ghost wide" data-action="admin-refresh" type="button">회원 목록 새로고침</button><button class="warning-button wide" data-action="admin-force-liar" type="button">진행 중 라이어게임 강제 종료</button></div><h3>회원 관리</h3><p class="helper">포인트+ / 포인트-로 회원 포인트를 직접 지급하거나 회수할 수 있습니다. 포인트는 0P 아래로 내려가지 않습니다. 계정 삭제는 회원가입 정보와 모든 세대 레고 데이터를 제거하며 복구할 수 없습니다.</p><div class="admin-list">${members || '<div class="empty">회원이 없습니다.</div>'}</div><h3>운영 기록</h3><p class="helper">포인트 지급·회수와 계정 삭제 기록을 최근 100개까지 표시합니다.</p><div class="admin-list">${auditLogs || '<div class="empty">아직 운영 기록이 없습니다.</div>'}</div><h3>라이어 채팅 관리</h3><div class="admin-list">${chats || '<div class="empty">채팅이 없습니다.</div>'}</div>`, { type: 'admin' });
}

function updateReactionButton() {
  if (app.modal?.type !== 'mini') return;
  const challenge = app.data?.activeMiniChallenge;
  if (!challenge || challenge.gameId !== 'reaction') return;
  const button = $('#reaction-button');
  const title = $('#reaction-title');
  const stage = $('#reaction-stage');
  if (!button || !title) return;
  const ready = serverAlignedNow(app.data?.serverTime) >= Number(challenge.readyAt || 0);
  button.innerHTML = ready ? '<span>지금 클릭!</span><small>GO!</small>' : '<span>대기</span><small>초록색이 되면 클릭!</small>';
  button.classList.toggle('ready', ready);
  stage?.classList.toggle('ready', ready);
  stage?.classList.toggle('waiting', !ready);
  title.textContent = ready ? '지금 누르세요!!!' : '아직 누르지 마세요';
}

function scheduleReactionReady(challenge) {
  clearTimeout(app.reactionReadyTimer);
  app.reactionReadyTimer = null;
  if (!challenge || challenge.gameId !== 'reaction') return;
  updateReactionButton();
  const delay = Math.max(0, Number(challenge.readyAt || 0) - serverAlignedNow(app.data?.serverTime));
  if (delay <= 0) return updateReactionButton();
  app.reactionReadyTimer = setTimeout(() => { app.reactionReadyTimer = null; updateReactionButton(); }, delay);
}

function openMiniResult(result, challenge, { previousBest = 0 } = {}) {
  if (!challenge || app.lastMiniResultChallengeId === challenge.id) return;
  app.lastMiniResultChallengeId = challenge.id;
  const gameId = challenge.gameId;
  const gameName = app.data?.catalog?.miniGames?.find((game) => game.id === gameId)?.name || '미니게임';
  const reward = Math.max(0, Number(result?.reward ?? (gameId === 'apple' ? challenge.applePendingPoints : 0)) || 0);
  let rows = '';
  let headline = '게임 종료';
  if (gameId === 'apple') {
    const score = Math.max(0, Number(challenge.appleScore || 0));
    const currentBest = Math.max(0, Number(app.data?.dashboard?.pet?.records?.appleBestScore || 0));
    const isNew = score > Number(previousBest || 0) && currentBest >= score;
    rows = `<div><span>최종 점수</span><strong>${score.toLocaleString('ko-KR')}점</strong></div><div><span>획득 포인트</span><strong>+${reward.toLocaleString('ko-KR')}P</strong></div><div><span>진행한 판</span><strong>${Math.max(1, Number(challenge.appleBoardsGenerated || 1))}판</strong></div><div><span>최고기록</span><strong>${currentBest.toLocaleString('ko-KR')}점${isNew ? ' 👑 NEW!' : ''}</strong></div>`;
  } else if (gameId === 'reaction') {
    const ms = Math.max(0, Number(result?.reactionMs || 0));
    const best = Math.max(0, Number(app.data?.dashboard?.pet?.records?.seasonBestReactionMs || 0));
    rows = `<div><span>반응속도</span><strong>${ms ? (ms / 1000).toFixed(3) + '초' : '실패'}</strong></div><div><span>획득 포인트</span><strong>+${reward.toLocaleString('ko-KR')}P</strong></div><div><span>시즌 최고</span><strong>${best ? (best / 1000).toFixed(3) + '초' : '-'}</strong></div>`;
  } else if (gameId === 'number') {
    rows = `<div><span>정답</span><strong>${Number(result?.target || 0) || '-'}</strong></div><div><span>시도</span><strong>${Number(result?.attempts || challenge.attempts || 0)}회</strong></div><div><span>획득 포인트</span><strong>+${reward.toLocaleString('ko-KR')}P</strong></div>`;
  } else if (gameId === 'oddEven') {
    const stake = Math.max(0, Number(result?.stake ?? challenge.stake) || 0);
    const net = Number.isFinite(Number(result?.netProfit)) ? Number(result.netProfit) : (reward > 0 ? reward - stake : -stake);
    rows = `<div><span>최종 연승</span><strong>${Number(result?.streak ?? challenge.streak ?? 0)}연승</strong></div><div><span>정산</span><strong>${reward.toLocaleString('ko-KR')}P</strong></div><div><span>이번 게임</span><strong>${net >= 0 ? '+' : ''}${net.toLocaleString('ko-KR')}P</strong></div>`;
  }
  openModal(`${modalHeader(gameName, headline)}<div class="mini-result-card"><h3>${headline}</h3><div class="mini-result-grid">${rows}</div>${result?.detail ? `<p>${esc(result.detail)}</p>` : ''}<div class="button-row"><button class="primary" data-action="restart-mini" data-id="${esc(gameId)}" type="button">다시 하기</button><button class="ghost" data-action="close-modal" type="button">닫기</button></div></div>`, { type: 'miniResult', gameId });
}

async function tick() {
  if (!app.data) return;
  const cooldown = $('#action-cooldown');
  if (cooldown) cooldown.textContent = actionCooldownText();
  const fishing = app.data.dashboard.pet.daily.fishing;
  const fishingCountdown = $('#fishing-countdown');
  if (fishing && fishingCountdown) {
    const remaining = new Date(fishing.readyAt).getTime() - Date.now();
    fishingCountdown.textContent = durationText(remaining);
    if (remaining <= 0 && !app.fishingClaimInFlight) {
      app.fishingClaimInFlight = true;
      try {
        // 서버 알람이나 다른 요청에서 이미 자동 정산됐을 수 있으므로
        // 수령 API를 중복 호출하지 않고 최신 상태만 다시 불러온다.
        await loadBootstrap({ silent: true });
      } finally {
        app.fishingClaimInFlight = false;
      }
    }
  }
  const liar = app.data.liarGame;
  const liarCountdown = $('#liar-countdown');
  if (liarCountdown && liar.phaseEndsAt) {
    const remaining = new Date(liar.phaseEndsAt).getTime() - Date.now();
    liarCountdown.textContent = `${Math.max(0, Math.ceil(remaining / 1000))}초`;
    if (remaining <= 0 && Date.now() - app.liarLastRefreshAt > 1500) {
      app.liarLastRefreshAt = Date.now();
      loadBootstrap({ silent: true });
    }
  }
  const omokCountdown = $('#omok-countdown');
  const omokRoom = currentOmokRoom();
  if (omokCountdown && omokRoom?.status === 'playing' && omokRoom.turnStartedAt) {
    const deadline = new Date(omokRoom.turnStartedAt).getTime() + Number(app.data.omok.turnSeconds || 30) * 1000;
    const remaining = deadline - serverAlignedNow(app.data.omok.serverTime);
    omokCountdown.textContent = `${Math.max(0, Math.ceil(remaining / 1000))}초`;
    if (remaining <= 0 && Date.now() - app.omokLastRefreshAt > 1200) {
      app.omokLastRefreshAt = Date.now();
      loadBootstrap({ silent: true });
    }
  }
  const appleCountdown = $('#apple-countdown');
  const appleChallenge = app.data.activeMiniChallenge;
  if (appleCountdown && appleChallenge?.gameId === 'apple') {
    const remaining = new Date(appleChallenge.expiresAt).getTime() - serverAlignedNow(app.data?.serverTime);
    appleCountdown.textContent = `${Math.floor(Math.max(0, Math.ceil(remaining / 1000)) / 60)}:${String(Math.max(0, Math.ceil(remaining / 1000)) % 60).padStart(2, '0')}`;
    if (remaining <= 0 && !app.appleFinishInFlight) {
      app.appleFinishInFlight = true;
      const finishedApple = structuredClone(appleChallenge);
      const previousBest = Number(app.data?.dashboard?.pet?.records?.appleBestScore || 0);
      try {
        await loadBootstrap({ silent: true });
        if (!app.data?.activeMiniChallenge && app.modal?.type !== 'miniResult') openMiniResult({ finished: true, reward: finishedApple.applePendingPoints, detail: `사과게임 종료 · ${Number(finishedApple.appleScore || 0).toLocaleString('ko-KR')}점` }, finishedApple, { previousBest });
      } finally { app.appleFinishInFlight = false; }
    }
  }
  const territoryCountdown = $('#territory-countdown');
  if (territoryCountdown) territoryCountdown.textContent = durationText(new Date(app.data.territory.endsAt).getTime() - Date.now());
}

async function handleAction(button) {
  const action = button.dataset.action;
  const idValue = button.dataset.id;
  if (action === 'close-modal') return closeModal();
  if (action === 'home') { app.tab = 'home'; return render(); }
  if (action === 'notifications') return openNotifications();
  if (action === 'show-online') return openOnlineModal();
  if (action === 'body-guide') return openBodyGuide(Number(button.dataset.body));
  if (action === 'edit-status-message') return openStatusMessageEditor();
  if (action === 'open-food') return openFoodShop();
  if (action === 'show-fishing-rewards') return openFishingRewards();
  if (action === 'profile') return openProfile(idValue);
  if (action === 'logout') return logout(true);
  if (action === 'work') return perform('/api/actions/work');
  if (action === 'rest') return perform('/api/actions/rest');
  if (action === 'exercise') return perform('/api/actions/exercise');
  if (action === 'eat') return perform('/api/actions/eat', { foodId: idValue });
  if (action === 'start-fishing') return perform('/api/fishing/start');
  if (action === 'resume-mini') return openMiniGame(app.data.activeMiniChallenge);
  if (action === 'start-mini' || action === 'restart-mini') {
    if (idValue === 'oddEven') return openOddEvenBet();
    const result = await perform('/api/minigames/start', { gameId: idValue }, null, 'POST', { toastDuration: ['reaction', 'number'].includes(idValue) ? 700 : 3400, toastType: ['reaction', 'number'].includes(idValue) ? 'game-start' : null });
    if (result?.bootstrap?.activeMiniChallenge) openMiniGame(result.bootstrap.activeMiniChallenge);
    return;
  }
  if (action === 'finish-mini') {
    const challenge = app.data.activeMiniChallenge ? structuredClone(app.data.activeMiniChallenge) : null;
    const previousBest = Number(app.data?.dashboard?.pet?.records?.appleBestScore || 0);
    const result = await perform('/api/minigames/finish', { challengeId: challenge?.id, value: button.dataset.value });
    if (result?.finished) openMiniResult(result, challenge, { previousBest });
    return result;
  }
  if (action === 'stop-mini') {
    const challenge = app.data.activeMiniChallenge ? structuredClone(app.data.activeMiniChallenge) : null;
    const result = await perform('/api/minigames/stop', { challengeId: challenge?.id });
    if (result?.finished) openMiniResult(result, challenge);
    return result;
  }
  if (action === 'read-all') return perform('/api/notifications/read', {});
  if (action === 'read-notification') return perform('/api/notifications/read', { id: idValue });
  if (action === 'poke') return perform('/api/social/poke', { targetPetId: idValue });
  if (action === 'request-match') return perform('/api/social/action', { targetPetId: idValue, action: 'requestMatch' });
  if (action === 'accept-match') return perform('/api/social/action', { targetPetId: idValue, requestId: button.dataset.requestId, action: 'acceptMatch' });
  if (action === 'reject-match') return perform('/api/social/action', { targetPetId: idValue, requestId: button.dataset.requestId, action: 'rejectMatch' });
  if (action === 'breakup') { if (confirm('정말 헤어질까요? 커플 D-day가 삭제됩니다.')) return perform('/api/social/action', { targetPetId: idValue, action: 'breakup' }); return; }
  if (action === 'request-mating') { if (confirm('교미 신청을 보낼까요? 상대가 거절하면 50% 확률로 신청자에게 경고가 누적됩니다.')) return perform('/api/social/action', { targetPetId: idValue, action: 'requestMating' }); return; }
  if (action === 'accept-mating') return perform('/api/social/action', { targetPetId: idValue, requestId: button.dataset.requestId, action: 'acceptMating' });
  if (action === 'reject-mating') return perform('/api/social/action', { targetPetId: idValue, requestId: button.dataset.requestId, action: 'rejectMating' });
  if (action === 'create-bung') return openCreateBung();
  if (action === 'show-recent-bungs') return openRecentBungs();
  if (action === 'open-bung') return openBung(idValue);
  if (action === 'join-bung') return perform(`/api/bungs/${idValue}/join`, {});
  if (action === 'leave-bung') return perform(`/api/bungs/${idValue}/leave`, {});
  if (action === 'start-bung') return perform(`/api/bungs/${idValue}/start`, {});
  if (action === 'end-bung') { if (confirm('벙을 끝내고 참가자 보상을 지급할까요?')) return perform(`/api/bungs/${idValue}/end`, {}); return; }
  if (action === 'liar-join') return perform('/api/liar/join');
  if (action === 'liar-spectate') return perform('/api/liar/spectate');
  if (action === 'liar-spectate-leave') return perform('/api/liar/spectate/leave');
  if (action === 'liar-leave') return perform('/api/liar/leave');
  if (action === 'liar-ready') return perform('/api/liar/ready');
  if (action === 'liar-save-settings') return perform('/api/liar/settings', { discussionSeconds: Number($('#liar-discussion')?.value), betPoints: Number($('#liar-bet')?.value), maxPlayers: Number($('#liar-max-players')?.value) });
  if (action === 'liar-start') return perform('/api/liar/start');
  if (action === 'liar-vote') return perform('/api/liar/vote', { targetPetId: idValue });
  if (action === 'liar-reset') return perform('/api/liar/reset');
  if (action === 'liar-kick') return perform('/api/liar/kick', { targetPetId: idValue });
  if (action === 'liar-reaction') return perform('/api/liar/reaction', { type: button.dataset.reaction });
  if (action === 'omok-reaction') return perform(`/api/omok/rooms/${encodeURIComponent(idValue)}/reaction`, { type: button.dataset.reaction });
  if (action === 'omok-create') return openCreateOmok();
  if (action === 'omok-open') { app.omokLobbyForced = false; app.omokRoomId = idValue; render(); return; }
  if (action === 'omok-back') { app.omokRoomId = null; app.omokLobbyForced = true; render(); return; }
  if (action === 'omok-join') {
    const result = await perform(`/api/omok/rooms/${encodeURIComponent(idValue)}/join`, {});
    if (result?.ok) { app.omokLobbyForced = false; app.omokRoomId = result.roomId || idValue; render(); }
    return;
  }
  if (action === 'omok-spectate') {
    const result = await perform(`/api/omok/rooms/${encodeURIComponent(idValue)}/spectate`, {});
    if (result?.ok) { app.omokLobbyForced = false; app.omokRoomId = result.roomId || idValue; render(); }
    return;
  }
  if (action === 'omok-spectate-leave') {
    const result = await perform(`/api/omok/rooms/${encodeURIComponent(idValue)}/spectate/leave`, {});
    if (result?.ok) { app.omokRoomId = null; app.omokLobbyForced = true; render(); }
    return;
  }
  if (action === 'omok-leave') {
    const room = app.data.omok.rooms.find((item) => item.id === idValue);
    if (room?.status === 'playing' && !confirm('게임 중 나가면 기권패 처리되고 판돈은 상대에게 지급됩니다. 나갈까요?')) return;
    const result = await perform(`/api/omok/rooms/${encodeURIComponent(idValue)}/leave`, {});
    if (result?.ok) { app.omokRoomId = null; app.omokLobbyForced = true; render(); }
    return;
  }
  if (action === 'omok-move') {
    const room = currentOmokRoom();
    if (!room || room.id !== app.omokRoomId && app.omokRoomId) return;
    const requestId = crypto.randomUUID?.() || `omok-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return perform(`/api/omok/rooms/${encodeURIComponent(room.id)}/move`, { row: Number(button.dataset.row), col: Number(button.dataset.col), requestId }, null, 'POST', { toastDuration: 650, toastType: 'game-start' });
  }
  if (action === 'omok-rematch') return perform(`/api/omok/rooms/${encodeURIComponent(idValue)}/rematch`, {});
  if (action === 'claim-territory-direct') {
    const row = Number(button.dataset.row);
    const col = Number(button.dataset.col);
    return perform('/api/territory/claim', { row, col });
  }
  if (action === 'open-style-shop') return openStyleShop();
  if (action === 'buy-cosmetic') return perform('/api/profile/cosmetics/buy', { itemId: idValue });
  if (action === 'open-admin') return openAdmin();
  if (action === 'admin-refresh') { await loadBootstrap({ silent: false }); if (app.data?.admin?.isAdmin) openAdmin(); return; }
  if (action === 'admin-points') {
    const direction = Number(button.dataset.value) < 0 ? -1 : 1;
    const label = direction > 0 ? '지급' : '회수';
    const raw = prompt(`${label}할 포인트를 숫자로 입력하세요.`, '100');
    if (raw === null) return;
    const amount = Number(String(raw).replace(/,/g, '').trim());
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 1_000_000_000) {
      toast('1~1,000,000,000 사이의 정수 포인트를 입력해주세요.', 'error');
      return;
    }
    const targetName = String(button.dataset.name || '이 회원');
    const amountText = amount.toLocaleString('ko-KR');
    const warning = amount >= 10_000 ? '⚠ 큰 금액입니다.\n\n' : '';
    const confirmText = direction > 0
      ? `${warning}${targetName}에게 ${amountText}P를 지급할까요?`
      : `${warning}${targetName}에게서 ${amountText}P를 회수할까요?`;
    if (!confirm(confirmText)) return;
    const requestId = crypto.randomUUID?.() || `admin-points-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return perform('/api/admin/points', { targetPetId: idValue, delta: direction * amount, requestId });
  }
  if (action === 'admin-warning') return perform('/api/admin/warnings', { targetPetId: idValue, delta: Number(button.dataset.value) });
  if (action === 'admin-reset-user') { if (confirm('이 레고의 비정상 진행 상태를 초기화할까요?')) return perform('/api/admin/reset-user', { targetPetId: idValue }); return; }
  if (action === 'admin-kick') { if (confirm('강퇴하면 대상은 모든 것을 잃고 뉴레고가 됩니다.')) return perform('/api/admin/kick', { targetPetId: idValue }); return; }
  if (action === 'admin-delete-account') {
    const targetUserId = String(button.dataset.userId || '');
    if (!targetUserId) return;
    if (!confirm('이 회원 계정을 완전히 삭제할까요? 회원가입 정보, 현재/과거 레고 기록, 랭킹 기록이 삭제되며 복구할 수 없습니다.')) return;
    if (!confirm('최종 확인입니다. 정말 계정을 삭제하시겠습니까?')) return;
    return perform(`/api/admin/users/${encodeURIComponent(targetUserId)}`, {}, null, 'DELETE');
  }
  if (action === 'admin-force-liar') { if (confirm('라이어게임을 강제 종료하고 남은 판돈을 환불할까요?')) return perform('/api/admin/liar/force-end', {}); return; }
  if (action === 'admin-delete-liar-chat') return perform(`/api/admin/liar/chat/${encodeURIComponent(idValue)}`, {}, null, 'DELETE');
}

function switchMainTab(tabName, { smooth = true } = {}) {
  if (!['home','games','territory','social','records'].includes(tabName)) return;
  app.tab = tabName;
  if (app.tab !== 'games') setLiarKeyboardMode(false);
  render();
  window.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' });
}

const bottomNav = document.querySelector('.bottom-nav');
bottomNav?.addEventListener('pointerup', (event) => {
  if (!['touch','pen'].includes(event.pointerType)) return;
  const tab = event.target.closest?.('[data-tab]');
  if (!tab) return;
  event.preventDefault();
  app.lastTouchNavAt = Date.now();
  switchMainTab(tab.dataset.tab, { smooth: false });
});

document.addEventListener('click', (event) => {
  const tab = event.target.closest('[data-tab]');
  if (tab) {
    if (Date.now() - app.lastTouchNavAt < 550) return;
    switchMainTab(tab.dataset.tab);
    return;
  }
  const button = event.target.closest('[data-action]');
  if (button) handleAction(button);
});

document.addEventListener('input', (event) => {
  const statusInput = event.target.closest?.('#status-message-input');
  if (statusInput) {
    const maxLength = Math.max(1, Number(app.data?.catalog?.statusMessageMaxLength) || 20);
    const count = $('#status-message-count');
    if (count) count.textContent = `${[...statusInput.value].length}/${maxLength}`;
  }
  const input = event.target.closest?.('#liar-chat-form input[name="text"]');
  if (input) app.liarChatDraft = input.value;
});

document.addEventListener('pointerdown', (event) => {
  if (event.target.closest?.('#liar-chat-form input[name="text"]')) setLiarKeyboardMode(true);
});
document.addEventListener('focusin', (event) => {
  if (event.target.closest?.('#liar-chat-form input[name="text"]')) setLiarKeyboardMode(true);
});
document.addEventListener('focusout', (event) => {
  if (!event.target.closest?.('#liar-chat-form input[name="text"]')) return;
  setTimeout(() => {
    if (!document.activeElement?.closest?.('#liar-chat-form input[name="text"]')) setLiarKeyboardMode(false);
  }, 120);
});

document.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.target;
  const data = Object.fromEntries(new FormData(form));
  if (form.id === 'login-form' || form.id === 'register-form') {
    try {
      const result = await api(form.id === 'login-form' ? '/api/auth/login' : '/api/auth/register', { method: 'POST', body: JSON.stringify(data) });
      app.token = result.token;
      localStorage.setItem('lego_token', result.token);
      await loadBootstrap();
    } catch (error) { toast(error.message, 'error'); }
  }
  if (form.id === 'status-message-form') {
    const result = await perform('/api/profile/status-message', { statusMessage: String(data.statusMessage ?? '') });
    if (result?.ok) closeModal();
    return;
  }
  if (form.id === 'odd-even-bet-form') {
    const stakePoints = Number(data.stakePoints);
    const result = await perform('/api/minigames/start', { gameId: 'oddEven', stakePoints });
    if (result?.bootstrap?.activeMiniChallenge) openMiniGame(result.bootstrap.activeMiniChallenge);
  }
  if (form.id === 'number-game-form') { const challenge = app.data.activeMiniChallenge ? structuredClone(app.data.activeMiniChallenge) : null; const result = await perform('/api/minigames/finish', { challengeId: challenge?.id, value: data.guess }); if (result?.finished) openMiniResult(result, challenge); return; }
  if (form.id === 'liar-chat-form') {
    const text = String(data.text ?? '').trim();
    app.liarChatDraft = text;
    const result = await perform('/api/liar/chat', { text }, null, 'POST', { renderMode: 'liar-chat' });
    if (result?.ok) {
      app.liarChatDraft = '';
      const input = $('#liar-chat-form input[name="text"]');
      if (input) { input.value = ''; try { input.focus({ preventScroll: true }); } catch { input.focus(); } }
    }
  }
  if (form.id === 'liar-guess-form') { form.reset(); await perform('/api/liar/guess', { guess: data.guess }); }
  if (form.id === 'omok-create-form') {
    const preset = String(data.preset ?? '100');
    const stakePoints = preset === 'custom' ? Number(data.customStake) : Number(preset);
    const result = await perform('/api/omok/rooms', { stakePoints });
    if (result?.ok) {
      app.omokLobbyForced = false;
      app.omokRoomId = result.roomId;
      closeModal();
      render();
    }
    return;
  }
  if (form.id === 'bung-create-form') {
    const result = await perform('/api/bungs', { title: data.title, stakePoints: Number(data.stakePoints) });
    if (result?.ok) closeModal();
  }
});

$$('[data-auth-tab]').forEach((button) => button.addEventListener('click', () => {
  $$('[data-auth-tab]').forEach((item) => item.classList.toggle('active', item === button));
  $('#login-form').classList.toggle('hidden', button.dataset.authTab !== 'login');
  $('#register-form').classList.toggle('hidden', button.dataset.authTab !== 'register');
}));

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && app.modal) closeModal();
});

function preserveLiarScrollDuringViewportChange() {
  if (!app.liarKeyboardActive) return;
  const snapshot = captureLiarChatScrollState();
  updateVisualViewportVars();
  requestAnimationFrame(() => restoreLiarChatScrollState(snapshot));
}
window.visualViewport?.addEventListener('resize', preserveLiarScrollDuringViewportChange);
window.visualViewport?.addEventListener('scroll', preserveLiarScrollDuringViewportChange);
window.addEventListener('resize', preserveLiarScrollDuringViewportChange);
window.addEventListener('resize', syncOmokBoardSquare);
window.visualViewport?.addEventListener('resize', syncOmokBoardSquare);

window.addEventListener('online', () => {
  loadBootstrap({ silent: true });
  connectRealtime();
});
window.addEventListener('offline', () => {
  const socket = app.ws;
  app.ws = null;
  socket?.close();
  toast('인터넷 연결이 끊겼습니다.', 'error');
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && app.token && navigator.onLine) loadBootstrap({ silent: true });
});
window.addEventListener('pageshow', (event) => {
  if (event.persisted && app.token && navigator.onLine) loadBootstrap({ silent: true });
});
app.tickTimer = setInterval(tick, 500);
if (app.token) loadBootstrap(); else showAuth();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js?v=648').catch(() => {});
