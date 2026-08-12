const monotonicNow = () => globalThis.performance?.now?.() ?? Date.now();

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
  liarKeyboardActive: false,
  liarInputFocused: false,
  liarComposing: false,
  liarChatSending: false,
  liarUnreadChatCount: 0,
  liarLastRefreshAt: 0,
  omokRoomId: null,
  omokLobbyForced: false,
  omokLastRefreshAt: 0,
  blockBattleRoomId: null,
  blockBattleLobbyForced: false,
  blockBattleInputBuffer: [],
  blockBattlePendingBatches: [],
  blockBattleSending: false,
  blockBattleServerVersions: new Map(),
  blockBattleFlushTimer: null,
  blockBattleGravityTimer: null,
  blockBattleGravityKey: null,
  blockBattleHoldDelay: null,
  blockBattleHoldTimer: null,
  blockBattleHold: null,
  blockBattleRenderFrame: 0,
  blockBattleNeedsLayout: false,
  blockBattleViewportFrame: 0,
  blockBattleRecoveryTimer: null,
  blockBattleLastErrorKey: '',
  blockBattleLastErrorAt: 0,
  appleFinishInFlight: false,
  bootstrapSyncedAt: monotonicNow(),
  revision: 0,
  bootstrapRequestId: 0,
  bootstrapController: null,
  reactionReadyTimer: null,
  lastMiniResultChallengeId: null,
  appleNewBoardDismissedKey: null,
  dirtyTabs: new Set(['home','games','territory','social','records']),
  tabSwitchToken: 0,
  tabCache: new Map(),
  tabRenderFrame: 0,
  residentsExpanded: false,
  rankingRelationsExpanded: false,
  appleBoardUi: null,
  appleModalActive: false,
  reactionReadyPerformanceAt: null,
  reactionSubmissionInFlight: false,
  pendingTerritoryClaim: null,
  loggingOut: false
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
function territoryResetText(value) {
  if (!value) return '-';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date(value)).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return `${Number(parts.month)}월 ${Number(parts.day)}일 ${parts.hour}:${parts.minute} · 한국시간`;
}
const durationText = (milliseconds) => {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
};

function updateVisualViewportVars() {
  const viewport = window.visualViewport;
  const height = Math.max(1, Math.round(Number(viewport?.height) || window.innerHeight || document.documentElement.clientHeight || 1));
  const top = Math.max(0, Math.round(Number(viewport?.offsetTop) || 0));
  document.documentElement.style.setProperty('--visual-viewport-height', `${height}px`);
  document.documentElement.style.setProperty('--visual-viewport-top', `${top}px`);
}

function setLiarKeyboardMode(active) {
  const enabled = Boolean(active && app.token && app.tab === 'games');
  app.liarKeyboardActive = enabled;
  document.body.classList.toggle('liar-keyboard-open', enabled);
  if (enabled) updateVisualViewportVars();
  else if (!app.appleModalActive) {
    document.documentElement.style.removeProperty('--visual-viewport-height');
    document.documentElement.style.removeProperty('--visual-viewport-top');
  }
}

function setAppleModalMode(active) {
  app.appleModalActive = Boolean(active);
  document.body.classList.toggle('apple-game-open', app.appleModalActive);
  $('#modal-root')?.classList.toggle('apple-modal-root', app.appleModalActive);
  if (app.appleModalActive) updateVisualViewportVars();
  else if (!app.liarKeyboardActive) {
    document.documentElement.style.removeProperty('--visual-viewport-height');
    document.documentElement.style.removeProperty('--visual-viewport-top');
  }
}

function liarComposerIsActive() {
  const input = $('#liar-chat-form input[name="text"]');
  return Boolean(app.tab === 'games' && input && (app.liarInputFocused || app.liarComposing || document.activeElement === input));
}

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
  if (response.status === 401 && !path.includes('/auth/')) {
    logout(false);
    throw new Error(data?.message || '로그인이 만료되었습니다. 다시 로그인해주세요.');
  }
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
  const previousRooms = new Map((app.data?.blockBattle?.rooms || []).map((room) => [room.id, room]));
  const previousBattleKey = (app.data?.blockBattle?.rooms || [])
    .map((room) => `${room.id}:${room.matchId}:${room.stateVersion}:${room.status}:${room.spectatorCount}`).join('|');
  const nextBattleKey = (next?.blockBattle?.rooms || [])
    .map((room) => `${room.id}:${room.matchId}:${room.stateVersion}:${room.status}:${room.spectatorCount}`).join('|');
  const changed = !app.data || revision !== app.revision || previousBattleKey !== nextBattleKey;
  app.data = next;
  app.revision = revision;
  app.bootstrapSyncedAt = monotonicNow();
  const nextRoomIds = new Set((app.data?.blockBattle?.rooms || []).map((room) => room.id));
  for (const roomId of app.blockBattleServerVersions.keys()) if (!nextRoomIds.has(roomId)) app.blockBattleServerVersions.delete(roomId);
  if (app.blockBattlePendingBatches.some((batch) => !nextRoomIds.has(batch.message.roomId))) {
    resetBlockBattleInputQueue();
  }
  for (let index = 0; index < (app.data?.blockBattle?.rooms || []).length; index += 1) {
    const room = app.data.blockBattle.rooms[index];
    const previous = previousRooms.get(room.id);
    const sameMatch = Boolean(previous?.matchId && previous.matchId === room.matchId);
    const acceptedVersion = sameMatch ? Math.max(0, Number(app.blockBattleServerVersions.get(room.id)) || 0) : 0;
    const incomingVersion = Math.max(0, Number(room.stateVersion) || 0);
    if (sameMatch && incomingVersion < acceptedVersion) {
      app.data.blockBattle.rooms[index] = previous;
      continue;
    }
    if (previous?.matchId && previous.matchId !== room.matchId
      && (room.viewerRole === 'player' || app.blockBattlePendingBatches.some((batch) => batch.message.roomId === room.id))) {
      resetBlockBattleInputQueue();
    }
    app.blockBattleServerVersions.set(room.id, incomingVersion);
    acknowledgeBlockBattleBatch(room);
    if (room.viewerRole === 'player' && blockBattleInputStopped(room)) resetBlockBattleInputQueue();
    else replayBlockBattlePendingInputs(room, { paint: false });
  }
  if (!app.blockBattleSending && app.blockBattleInputBuffer.length && !app.blockBattleFlushTimer) {
    app.blockBattleFlushTimer = setTimeout(flushBlockBattleInputs, 0);
  }
  if (changed) markAllTabsDirty();
  return true;
}

function showPopupNotifications() {
  for (const item of app.data?.notifications ?? []) {
    if (item.read || !item.payload?.popup || app.popupSeen.has(item.id)) continue;
    app.popupSeen.add(item.id);
    const type = item.type === 'warning' ? 'error' : 'success';
    toast(item.text, type, type === 'error' ? 6000 : 4200);
  }
}


function logout(callServer = true) {
  if (app.loggingOut) return;
  app.loggingOut = true;
  if (callServer && app.token) api('/api/account/logout-all', { method: 'POST', body: '{}' }).catch(() => {});
  app.bootstrapController?.abort();
  app.bootstrapController = null;
  app.bootstrapRequestId += 1;
  app.ws?.close();
  app.ws = null;
  clearInterval(app.pollTimer);
  clearTimeout(app.blockBattleGravityTimer);
  clearTimeout(app.blockBattleFlushTimer);
  for (const batch of app.blockBattlePendingBatches) clearTimeout(batch.retryTimer);
  clearTimeout(app.blockBattleHoldDelay);
  clearTimeout(app.blockBattleHoldTimer);
  clearTimeout(app.blockBattleRecoveryTimer);
  cancelAnimationFrame(app.blockBattleRenderFrame);
  cancelAnimationFrame(app.blockBattleViewportFrame);
  clearTimeout(app.refreshTimer);
  app.pollTimer = null;
  app.refreshTimer = null;
  app.token = null;
  app.data = null;
  app.revision = 0;
  app.rankingRelationsExpanded = false;
  app.liarChatDraft = '';
  app.liarInputFocused = false;
  app.liarComposing = false;
  app.liarChatSending = false;
  app.liarUnreadChatCount = 0;
  app.omokRoomId = null;
  app.omokLobbyForced = false;
  app.blockBattleRoomId = null;
  app.blockBattleLobbyForced = false;
  app.blockBattleInputBuffer = [];
  app.blockBattlePendingBatches = [];
  app.blockBattleSending = false;
  app.blockBattleServerVersions = new Map();
  app.blockBattleGravityTimer = null;
  app.blockBattleGravityKey = null;
  app.blockBattleFlushTimer = null;
  app.blockBattleHoldDelay = null;
  app.blockBattleHoldTimer = null;
  app.blockBattleHold = null;
  app.blockBattleRenderFrame = 0;
  app.blockBattleNeedsLayout = false;
  app.blockBattleViewportFrame = 0;
  app.blockBattleRecoveryTimer = null;
  app.blockBattleLastErrorKey = '';
  app.blockBattleLastErrorAt = 0;
  app.appleFinishInFlight = false;
  app.appleNewBoardDismissedKey = null;
  app.dirtyTabs = new Set(['home','games','territory','social','records']);
  app.tabCache = new Map();
  cancelAnimationFrame(app.tabRenderFrame);
  app.tabRenderFrame = 0;
  app.tabSwitchToken += 1;
  app.residentsExpanded = false;
  cleanupAppleBoardUi();
  app.reactionReadyPerformanceAt = null;
  app.reactionSubmissionInFlight = false;
  app.pendingTerritoryClaim = null;
  const view = $('#view');
  if (view) view.innerHTML = '';
  app.popupSeen.clear();
  setLiarKeyboardMode(false);
  setAppleModalMode(false);
  localStorage.removeItem('lego_token');
  closeModal();
  showAuth();
  app.loggingOut = false;
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
    const hadData = Boolean(app.data);
    const previousRevision = app.revision;
    applyBootstrap(result.bootstrap);
    if (!app.data) return;
    const dataChanged = !hadData || app.revision !== previousRevision;
    if (renderMode === 'games-live') markTabDirty('games');
    showApp();
    const chatOnlyUpdated = renderMode === 'liar-chat' && refreshLiarChatOnly();
    const composerProtected = renderMode === 'full' && liarComposerIsActive() && refreshLiarChatOnly();
    const appleOnlyUpdated = renderMode === 'apple' && refreshAppleMiniOnly();
    const blockOnlyUpdated = renderMode === 'block' && refreshBlockMiniOnly();
    const numberInputProtected = renderMode === 'full' && numberGuessInputIsActive() && refreshNumberMiniOnly();
    if (composerProtected) markTabDirty('games');
    if (numberInputProtected) markTabDirty('games');
    if (!chatOnlyUpdated && !composerProtected && !appleOnlyUpdated && !blockOnlyUpdated && !numberInputProtected) {
      render();
      if (app.modal && dataChanged) refreshModal();
    }
    showPopupNotifications();
    if (previousChallenge?.gameId === 'apple' && !app.data?.activeMiniChallenge && app.lastMiniResultChallengeId !== previousChallenge.id) {
      openMiniResult({ finished: true, reward: previousChallenge.applePendingPoints, detail: `사과게임 종료 · ${Number(previousChallenge.appleScore || 0).toLocaleString('ko-KR')}점` }, previousChallenge, { previousBest: previousAppleBest });
    }
    connectRealtime();
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
        const renderMode = payload.reason === 'liar-chat' ? 'liar-chat'
          : payload.reason === 'apple' ? 'apple'
            : payload.reason === 'block' ? 'block'
              : payload.reason === 'spectator-reaction' ? 'games-live' : 'full';
        app.refreshTimer = setTimeout(() => loadBootstrap({ silent: true, renderMode }), 180);
      } else if (payload.type === 'liar-chat-event') {
        applyLiarChatEvent(payload);
      } else if (payload.type === 'block-battle-state') {
        applyBlockBattleRoomState(payload);
      } else if (payload.type === 'block-battle-error') {
        handleBlockBattleInputError(payload);
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
  if (descriptor.type !== 'mini') cleanupAppleBoardUi();
  setAppleModalMode(descriptor.type === 'mini' && ['apple', 'block'].includes(descriptor.gameId));
  app.modal = descriptor;
  $('#modal-content').innerHTML = html;
  $('#modal-root').classList.remove('hidden');
  $('#modal-root').setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => $('#modal-root').classList.add('open'));
}

function closeModal() {
  clearTimeout(app.reactionReadyTimer);
  app.reactionReadyTimer = null;
  app.reactionReadyPerformanceAt = null;
  app.reactionSubmissionInFlight = false;
  cleanupAppleBoardUi();
  setAppleModalMode(false);
  app.modal = null;
  app.profile = null;
  $('#modal-root').classList.remove('open');
  $('#modal-root').classList.add('hidden');
  $('#modal-root').setAttribute('aria-hidden', 'true');
  $('#modal-content')?.replaceChildren();
}

async function refreshModal() {
  if (!app.modal) return;
  const descriptor = { ...app.modal };
  if (descriptor.type === 'notifications') return openNotifications();
  if (descriptor.type === 'online') return openOnlineModal();
  if (descriptor.type === 'recentBungs') return openRecentBungs();
  if (descriptor.type === 'bodyGuide') return openBodyGuide(descriptor.body);
  if (descriptor.type === 'territoryLimits') return openTerritoryLimits();
  if (descriptor.type === 'food') return openFoodShop();
  if (descriptor.type === 'shop') return openShop();
  if (descriptor.type === 'fishingRewards') return openFishingRewards();
  if (descriptor.type === 'profile') return openProfile(descriptor.petId);
  if (descriptor.type === 'bung') return openBung(descriptor.bungId);
  if (descriptor.type === 'mini') return openMiniGame(app.data?.activeMiniChallenge);
  if (descriptor.type === 'omokCreate') return openCreateOmok();
  if (descriptor.type === 'blockBattleCreate') return openCreateBlockBattle();
  if (descriptor.type === 'admin') return openAdmin();
}

async function perform(path, body = {}, successMessage = null, method = 'POST', {
  renderMode = 'full', toastDuration = 3400, toastType = null, preserveControls = false, toastResult = true
} = {}) {
  if (app.busy) return null;
  app.busy = true;
  document.body.classList.add('is-busy');
  const lockedControls = preserveControls ? [] : $$('#view .tab-pane:not(.hidden) button, #view .tab-pane:not(.hidden) input[type="submit"], #modal-root.open button, #modal-root.open input[type="submit"], .topbar button');
  const adminModalScrollTop = app.modal?.type === 'admin' ? ($('#modal-content')?.scrollTop ?? 0) : null;
  lockedControls.forEach((element) => {
    element.dataset.busyWasDisabled = element.disabled ? 'true' : 'false';
    if (element.dataset.allowBusy !== 'true') element.disabled = true;
  });
  try {
    const result = await api(path, { method, body: method === 'GET' || method === 'DELETE' ? undefined : JSON.stringify(body) });
    if (result.bootstrap) applyBootstrap(result.bootstrap);
    if (successMessage || (toastResult && result.message)) toast(successMessage || result.message, result.ok === false ? 'error' : (toastType || 'success'), toastDuration);
    showPopupNotifications();
    const chatOnlyUpdated = renderMode === 'liar-chat' && refreshLiarChatOnly();
    const appleOnlyUpdated = renderMode === 'apple' && refreshAppleMiniOnly(result);
    const blockOnlyUpdated = renderMode === 'block' && refreshBlockMiniOnly(result);
    const numberOnlyUpdated = renderMode === 'number' && refreshNumberMiniOnly(result);
    let shopOnlyUpdated = false;
    if (renderMode === 'shop' && app.modal?.type === 'shop') {
      openShop();
      shopOnlyUpdated = true;
    }
    if (!chatOnlyUpdated && !appleOnlyUpdated && !blockOnlyUpdated && !numberOnlyUpdated && !shopOnlyUpdated) {
      render();
      if (app.modal) {
        await refreshModal();
        if (adminModalScrollTop != null) requestAnimationFrame(() => { const modal = $('#modal-content'); if (modal) modal.scrollTop = adminModalScrollTop; });
      }
    }
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

function workoutBadgeHtml(profile = {}, { compact = false } = {}) {
  return profile.workoutBadge ? `<span class="workout-room-badge${compact ? ' compact' : ''}" title="운동방" aria-label="운동방 뱃지">💪</span>` : '';
}

function seasonBadgesHtml(profile = {}) {
  const badges = Array.isArray(profile.seasonBadges) ? profile.seasonBadges : [];
  return badges.length ? `<span class="season-badges">${badges.map((badge) => `<b class="season-badge season-${esc(badge.key)}">${esc(badge.label)}</b>`).join('')}</span>` : '';
}

function flexStyleKey(flexItem) {
  return flexItem?.id ? String(flexItem.id).replace(/[^a-zA-Z0-9-]/g, '') : '';
}

function flexProfileClass(profile = {}) {
  const item = profile.flexItem;
  return item ? ` flex-equipped flex-tier-${Math.max(1, Number(item.tier) || 1)} flex-${flexStyleKey(item)}` : '';
}

function flexItemImage(flexItem, { mini = false, shop = false } = {}) {
  if (!flexItem?.assetKey) return '';
  const className = shop ? 'flex-shop-image' : `flex-item-image${mini ? ' mini' : ''}`;
  return `<img class="${className}" src="/flex/${esc(flexItem.assetKey)}.svg?v=689" alt="${esc(flexItem.name)}" draggable="false">`;
}

function flexItemStatus(flexItem) {
  if (!flexItem) return '';
  return `<div class="flex-item-status">${flexItemImage(flexItem, { mini: true })}<span><b>${esc(flexItem.name)}</b><small>${dateText(flexItem.expiresAt)}까지 장착</small></span></div>`;
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

function avatar(stage, { mini = false, flexItem = null } = {}) {
  const stageClass = `stage-${String(stage?.key || 'normal').replace(/[^a-z0-9-]/gi, '')}`;
  const src = `/pets/${esc(stage.assetKey || stage.key)}.svg?v=689`;
  const flexClass = flexItem ? ` has-flex-item flex-${flexStyleKey(flexItem)}` : '';
  return `<div class="pet-visual ${mini ? 'mini' : ''} ${stageClass}${flexClass}"><span class="pet-shadow"></span><img class="pet-avatar" src="${src}" alt="${esc(stage.label)}" draggable="false" onerror="this.onerror=null;this.src='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyMjAgMjIwIj48ZWxsaXBzZSBjeD0iMTEwIiBjeT0iMjAyIiByeD0iNzAiIHJ5PSIxMCIgZmlsbD0iIzQyNDY1YSIgb3BhY2l0eT0iLjE1Ii8+PHJlY3QgeD0iNzQiIHk9IjE4IiB3aWR0aD0iNzIiIGhlaWdodD0iNjgiIHJ4PSIxNiIgZmlsbD0iI2YyYmQzNSIgc3Ryb2tlPSIjNzQ1OTE2IiBzdHJva2Utd2lkdGg9IjYiLz48cmVjdCB4PSI5MSIgeT0iNyIgd2lkdGg9IjM4IiBoZWlnaHQ9IjE3IiByeD0iNyIgZmlsbD0iI2YyYmQzNSIgc3Ryb2tlPSIjNzQ1OTE2IiBzdHJva2Utd2lkdGg9IjUiLz48Y2lyY2xlIGN4PSI5NyIgY3k9IjUwIiByPSI1Ii8+PGNpcmNsZSBjeD0iMTIzIiBjeT0iNTAiIHI9IjUiLz48cGF0aCBkPSJNOTYgNjggUTExMCA3NyAxMjQgNjgiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzRhMzgxMCIgc3Ryb2tlLXdpZHRoPSI1IiBzdHJva2UtbGluZWNhcD0icm91bmQiLz48cmVjdCB4PSI2MSIgeT0iODIiIHdpZHRoPSI5OCIgaGVpZ2h0PSI5NSIgcng9IjI0IiBmaWxsPSIjZTY5YjJjIiBzdHJva2U9IiM3NjUwMWUiIHN0cm9rZS13aWR0aD0iNyIvPjxyZWN0IHg9IjM5IiB5PSI5NCIgd2lkdGg9IjI2IiBoZWlnaHQ9IjcwIiByeD0iMTIiIGZpbGw9IiNlNjliMmMiIHN0cm9rZT0iIzc2NTAxZSIgc3Ryb2tlLXdpZHRoPSI2Ii8+PHJlY3QgeD0iMTU1IiB5PSI5NCIgd2lkdGg9IjI2IiBoZWlnaHQ9IjcwIiByeD0iMTIiIGZpbGw9IiNlNjliMmMiIHN0cm9rZT0iIzc2NTAxZSIgc3Ryb2tlLXdpZHRoPSI2Ii8+PHJlY3QgeD0iNjkiIHk9IjE2NyIgd2lkdGg9IjM4IiBoZWlnaHQ9IjM4IiByeD0iOCIgZmlsbD0iI2M5N2QxZiIgc3Ryb2tlPSIjNzY1MDFlIiBzdHJva2Utd2lkdGg9IjYiLz48cmVjdCB4PSIxMTMiIHk9IjE2NyIgd2lkdGg9IjM4IiBoZWlnaHQ9IjM4IiByeD0iOCIgZmlsbD0iI2M5N2QxZiIgc3Ryb2tlPSIjNzY1MDFlIiBzdHJva2Utd2lkdGg9IjYiLz48L3N2Zz4='">${flexItemImage(flexItem, { mini })}</div>`;
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
  const fishingLimit = Number(pet.daily.fishingLimit || app.data.catalog.fishingPerDay || 20);
  const fishingLeft = fishingLimit - pet.daily.fishingPlayed;
  const unread = app.data.notifications.filter((item) => !item.read).length;
  const lifeHunger = lifeHungerCostsForStage(stage);
  const shop = app.data.dashboard.shop ?? {};
  const effectChips = [
    shop.effects?.staminaFullUntil ? `<span>🔋 체력 100% 유지 · ${dateText(shop.effects.staminaFullUntil)}까지</span>` : '',
    shop.effects?.hungerFullUntil ? `<span>🍖 배고픔 100% 유지 · ${dateText(shop.effects.hungerFullUntil)}까지</span>` : '',
    shop.temporaryNickname ? `<span>🪪 임시 닉네임 · ${dateText(shop.temporaryNickname.expiresAt)}까지</span>` : '',
    pet.flexItem ? `<span>✨ ${esc(pet.flexItem.name)} · ${dateText(pet.flexItem.expiresAt)}까지</span>` : ''
  ].filter(Boolean).join('');
  return `
    <section class="hero-card${flexProfileClass(pet)}">
      ${workoutBadgeHtml(pet)}
      <div class="hero-main">${avatar(stage, { flexItem: pet.flexItem })}<div class="hero-copy"><span class="eyebrow"><button class="body-stage-link" data-action="body-guide" data-body="${pet.stats.body}" type="button">${esc(stage.label)}</button> · ${pet.generation}세대</span><h1 class="flex-display-name">${esc(pet.displayName)}${seasonBadgesHtml(pet)}</h1><div class="status-message-row"><span class="status-message-text ${pet.statusMessage ? '' : 'muted'}">${esc(pet.statusMessage || '상태메시지 없음')}</span><button class="status-edit-button" data-action="edit-status-message" type="button" >수정</button></div><p class="system-status">${esc(pet.status)}</p><div class="hero-tags"><span>Lv.${pet.stats.level}</span><span>레고력 ${pet.stats.legoPower}</span><span>${esc(pet.coupleLabel || (pet.partnerPetId ? `${pet.partnerDisplayName || '상대'}와 커플 D+${pet.coupleDay}` : '솔로'))}</span></div></div></div>
      <div class="metric-grid primary-metrics">${compactMetric('포인트', points(pet.stats.points), 'accent')}${compactMetric('레벨', `Lv.${pet.stats.level}`)}${compactMetric('몸집', `${pet.stats.body}`)}${compactMetric('누적 경고', `${pet.records.warnings}회`)}</div>
      <div class="level-progress"><div><span>Lv.${pet.levelProgress.level + 1}까지 ${Math.max(0, pet.levelProgress.nextAt - pet.levelProgress.totalPower)} 레고력 남음</span><strong>${pet.levelProgress.current} / ${pet.levelProgress.needed}</strong></div><div class="bar level"><span style="width:${Math.min(100, pet.levelProgress.current / pet.levelProgress.needed * 100)}%"></span></div></div>
    </section>
    <section class="section stat-panel">${bar('체력', pet.stats.stamina, { badLow: true })}${bar('배고픔', pet.stats.hunger, { badLow: true })}${effectChips ? `<div class="active-effect-chips">${effectChips}</div>` : ''}</section>

    <section class="section">
      ${sectionHeading('생활 행동', '게임 하루 5회 · 30분 쿨타임', `<div class="button-row compact home-utility-buttons"><button class="soft-button" data-action="open-shop" type="button">🛍️ 상점</button><button class="soft-button" data-action="open-food" type="button">🍚 밥 먹기</button></div>`)}
      ${actionDots(pet.daily.actionsLeft)}<p id="action-cooldown" class="helper">${actionCooldownText()}</p>
      <div class="action-grid">
        <button class="action-card life-action" data-action="work" type="button" ${lifeActionsLocked() ? 'disabled' : ''}><span>💼</span><strong>일하기</strong><small>+500P · 체력 -15 · 배고픔 -${lifeHunger.work}</small></button>
        <button class="action-card life-action" data-action="exercise" type="button" ${lifeActionsLocked() ? 'disabled' : ''}><span>🏋️</span><strong>헬스</strong><small>몸집 최대 -2 · 체력 -20 · 배고픔 -${lifeHunger.exercise}</small></button>
        <button class="action-card life-action" data-action="rest" type="button" ${lifeActionsLocked() || pet.stats.stamina >= 90 ? 'disabled' : ''}><span>🛋️</span><strong>쉬기</strong><small>체력 +40 · 배고픔 -${lifeHunger.rest}</small></button>
      </div>
    </section>

    <section class="section daily-goals-compact">
      ${sectionHeading('오늘의 레고력', '한국시간 00·06·12·18시에 초기화됩니다.', `<span class="tag">${goals.completed}/${goals.total}</span>`)}
      ${goalList(goals)}
      <p class="helper daily-goals-note">벙 정상 종료마다 레고력 +1 추가</p>
    </section>

    <section class="section fishing-card">
      ${sectionHeading('30초 낚시', '미니게임 횟수와 별도입니다.', `<button class="text-button" data-action="show-fishing-rewards" type="button">낚시 보상 보기</button>`)}
      <div class="fishing-status"><div><strong id="fishing-state">${fishing ? '낚시 중' : '낚시 가능'}</strong><small id="fishing-countdown">${fishing ? durationText(new Date(fishing.readyAt).getTime() - Date.now()) : `남은 횟수 ${Math.max(0, fishingLeft)}/${fishingLimit}`}</small></div><button class="primary" data-action="start-fishing" type="button" ${fishing || fishingLeft <= 0 ? 'disabled' : ''}>낚시 시작</button></div>
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
  const blockBattle = rankRows(rankings.blockBattle?.top ?? [], (item) => `${item.wins}승 ${item.losses}패`);
  const myGameRanks = rankings.myGameRanks ?? {};
  const myRank = (item, value) => item
    ? `<div class="game-my-rank"><span>내 기록 · 전체 ${item.rank}위</span><strong>${value(item)}</strong></div>`
    : '<div class="game-my-rank empty-record"><span>내 기록</span><strong>아직 기록 없음</strong></div>';
  const relationRows = app.rankingRelationsExpanded
    ? `<div class="rank-tabs-grid relation-rank-grid"><article class="rank-card"><h3>커플 D-Day</h3>${couples}</article><article class="rank-card"><h3>찌르기 TOP 5</h3>${pokes}</article></div>`
    : '';
  const relationToggle = `<button class="relation-ranking-toggle" data-action="toggle-relation-rankings" type="button" aria-expanded="${app.rankingRelationsExpanded ? 'true' : 'false'}"><span>커플 D-Day · 찌르기</span><strong>${app.rankingRelationsExpanded ? '접기 ▲' : '더보기 ▼'}</strong></button>`;
  return `<section class="section ranking-section">${sectionHeading('레고방 순위', '포인트·레벨과 게임 TOP 5')}<div class="rank-tabs-grid"><article class="rank-card"><h3>포인트 TOP 5</h3>${rankRows(rankings.points, (item) => points(item.points))}</article><article class="rank-card"><h3>레벨 TOP 5</h3>${rankRows(rankings.levels, (item) => `Lv.${item.level} · ${item.legoPower}`)}</article></div><div class="game-ranking-heading"><strong>게임 순위</strong><small>번개반응 · 사과게임 · 오목은 3일 시즌제 · 테트리스대전은 누적 승패</small></div><div class="game-rank-grid"><article class="rank-card"><h3>⚡ 번개반응 TOP 5</h3>${reaction}${myRank(myGameRanks.reaction, (item) => `${(Number(item.ms || 0) / 1000).toFixed(3)}초`)}</article><article class="rank-card"><h3>🍎 사과게임 TOP 5</h3>${apple}${myRank(myGameRanks.apple, (item) => `${Number(item.score || 0).toLocaleString('ko-KR')}점`)}</article><article class="rank-card"><h3>⚫ 오목 TOP 5</h3>${omok}${myRank(myGameRanks.omok, (item) => `${item.wins}승 ${item.draws}무 ${item.losses}패`)}</article><article class="rank-card"><h3>🧱 테트리스대전 TOP 5</h3>${blockBattle}${myRank(rankings.blockBattle?.mine, (item) => `${item.wins}승 ${item.losses}패`)}</article></div><div class="relation-ranking-more">${relationToggle}${relationRows}</div></section>`;
}

function newsList() {
  const events = app.data.publicEvents ?? [];
  return events.length ? `<div class="news-list">${events.map((event) => `<article><span class="news-dot ${esc(event.type)}"></span><div><p>${esc(event.text)}</p><small>${dateText(event.createdAt)}</small></div></article>`).join('')}</div>` : '<div class="empty">아직 레고방 소식이 없습니다.</div>';
}

function miniGameIcon(gameId) {
  return ({ oddEven: '🌓', reaction: '⚡', number: '🔢', apple: '🍎', block: '🧱' })[gameId] || '🎮';
}

function gamesView() {
  const games = app.data.catalog.miniGames;
  const active = app.data.activeMiniChallenge;
  const activeGame = active ? games.find((game) => game.id === active.gameId) : null;
  const resume = active
    ? `<div class="active-game-banner"><div><strong>${esc(activeGame?.name || '개인게임')} 진행 중</strong><small>새로고침해도 이어서 할 수 있습니다.</small></div><button class="primary" data-action="resume-mini" type="button">이어하기</button></div>`
    : '';
  return `
    <section class="page-title"><span class="eyebrow">포인트 게임</span><h1>게임</h1><p>개인게임으로 포인트를 벌고, 단체게임에서 오목·테트리스대전을 즐길 수 있습니다.</p></section>
    <section class="section personal-game-wrap">${sectionHeading('포인트 개인게임', `이번 게임 하루 ${app.data.dashboard.pet.daily.miniGamesPlayed}/${app.data.dashboard.pet.daily.miniGamesLimit || app.data.catalog.miniGamesPerDay}회`)}${resume}<div class="game-grid">${games.map((game) => `<article class="game-card"><div class="game-icon">${miniGameIcon(game.id)}</div><h3>${esc(game.name)}</h3><p>${esc(game.description)}</p><button class="primary wide" data-action="${active?.gameId === game.id ? 'resume-mini' : 'start-mini'}" data-id="${game.id}" type="button" ${active && active.gameId !== game.id ? 'disabled' : ''}>${active?.gameId === game.id ? '이어하기' : '시작'}</button></article>`).join('')}</div></section>
    <div class="game-category-heading"><span>단체게임</span><small>실시간으로 다른 레고와 함께 플레이합니다.</small></div>
    <section class="section omok-wrap">${omokSection()}</section>
    <section class="section block-battle-wrap">${blockBattleSection()}</section>
  `;
}

function omokStatusLabel(status) {
  return ({ waiting: '대기중', playing: '게임중', ended: '종료' })[status] || status;
}

function serverAlignedNow(serverTime) {
  const base = Number(serverTime || Date.now());
  return base + (monotonicNow() - app.bootstrapSyncedAt);
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

function spectatorReactionLiveContent(reactions = [], emptyText = '관전 리액션을 보내보세요.') {
  return reactions.length
    ? reactions.map((item) => `<span><b>${esc(item.displayName)}</b> ${esc(item.emoji)} ${esc(item.label)}</span>`).join('')
    : emptyText;
}

function spectatorReactionBar(scope, roomId, reactions = [], canSend = true, persistEmpty = false) {
  if (!canSend && !reactions.length && !persistEmpty) return '';
  const buttons = canSend ? [
    ['funny', '😂', '웃겨요'], ['sad', '😢', '슬퍼요'], ['angry', '😡', '화나요'], ['sleepy', '😴', '졸려요'], ['cringe', '🥵', '짜쳐요']
  ].map(([type, emoji, label]) => `<button class="reaction-button" data-action="${scope}-reaction" data-reaction="${type}" ${roomId ? `data-id="${esc(roomId)}"` : ''} type="button"><span>${emoji}</span><small>${label}</small></button>`).join('') : '';
  const liveClass = reactions.length ? 'reaction-live' : 'reaction-live empty-live';
  const emptyMode = canSend ? 'prompt' : 'blank';
  const emptyText = canSend ? '관전 리액션을 보내보세요.' : '';
  return `<div class="spectator-reactions">${buttons ? `<div class="reaction-buttons">${buttons}</div>` : ''}<div class="${liveClass}" data-reaction-empty="${emptyMode}">${spectatorReactionLiveContent(reactions, emptyText)}</div></div>`;
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

const LOCAL_TETROMINO_SHAPES = {
  I: [[[0,1],[1,1],[2,1],[3,1]],[[2,0],[2,1],[2,2],[2,3]],[[0,2],[1,2],[2,2],[3,2]],[[1,0],[1,1],[1,2],[1,3]]],
  J: [[[0,0],[0,1],[1,1],[2,1]],[[1,0],[2,0],[1,1],[1,2]],[[0,1],[1,1],[2,1],[2,2]],[[1,0],[1,1],[0,2],[1,2]]],
  L: [[[2,0],[0,1],[1,1],[2,1]],[[1,0],[1,1],[1,2],[2,2]],[[0,1],[1,1],[2,1],[0,2]],[[0,0],[1,0],[1,1],[1,2]]],
  O: Array.from({ length: 4 }, () => [[1,0],[2,0],[1,1],[2,1]]),
  S: [[[1,0],[2,0],[0,1],[1,1]],[[1,0],[1,1],[2,1],[2,2]],[[1,1],[2,1],[0,2],[1,2]],[[0,0],[0,1],[1,1],[1,2]]],
  T: [[[1,0],[0,1],[1,1],[2,1]],[[1,0],[1,1],[2,1],[1,2]],[[0,1],[1,1],[2,1],[1,2]],[[1,0],[0,1],[1,1],[1,2]]],
  Z: [[[0,0],[1,0],[1,1],[2,1]],[[2,0],[1,1],[2,1],[1,2]],[[0,1],[1,1],[1,2],[2,2]],[[1,0],[0,1],[1,1],[0,2]]]
};

const BLOCK_BATTLE_POINTER_REPEAT_DELAY_MS = 320;
const BLOCK_BATTLE_KEYBOARD_REPEAT_DELAY_MS = 190;
const BLOCK_BATTLE_REPEAT_INTERVAL_MS = 85;
const BLOCK_BATTLE_MAX_UNCONFIRMED_ACTIONS = 12;
const BLOCK_BATTLE_REPEATABLE_ACTIONS = new Set(['left', 'right', 'softDrop']);

function blockBattleStatusLabel(status) {
  return ({ waiting: '대기중', playing: '게임중', ended: '종료' })[status] || status;
}

function currentBlockBattleRoom() {
  if (app.blockBattleLobbyForced) return null;
  const rooms = app.data.blockBattle?.rooms ?? [];
  let room = rooms.find((item) => item.id === app.blockBattleRoomId);
  if (!room) room = rooms.find((item) => item.viewerRole === 'player' || item.viewerRole === 'spectator');
  if (room) app.blockBattleRoomId = room.id;
  return room ?? null;
}

function blockBattleLobby() {
  const battle = app.data.blockBattle;
  const rooms = battle?.rooms ?? [];
  const byNumber = new Map(rooms.map((room) => [room.roomNumber, room]));
  const cards = Array.from({ length: battle?.maxRooms || 3 }, (_, index) => {
    const room = byNumber.get(index + 1);
    if (!room) return `<article class="block-battle-lobby-card empty-room"><div><strong>${index + 1}번방</strong><small>비어있음</small></div></article>`;
    const versus = room.guest ? `${esc(room.host?.displayName || '-')} VS ${esc(room.guest.displayName)}` : esc(room.host?.displayName || '-');
    let action = '';
    if (room.viewerRole !== 'none') action = `<button class="soft-button" data-action="block-battle-open" data-id="${room.id}" type="button">열기</button>`;
    else if (room.status === 'waiting') action = `<button class="primary" data-action="block-battle-join" data-id="${room.id}" type="button">참가</button>`;
    else if (room.status === 'playing') action = `<button class="soft-button" data-action="block-battle-spectate" data-id="${room.id}" type="button">관전</button>`;
    else action = `<button class="ghost" data-action="block-battle-open" data-id="${room.id}" type="button">결과</button>`;
    return `<article class="block-battle-lobby-card"><div><strong>${room.roomNumber}번방 · ${versus}</strong><small>판돈 ${points(room.stakePoints)} · ${blockBattleStatusLabel(room.status)}</small></div>${action}</article>`;
  }).join('');
  const canCreate = rooms.length < (battle?.maxRooms || 3);
  return `${sectionHeading('테트리스대전', '10×20 · 7종 블록 · 1:1 실시간 대전', `<button class="primary" data-action="block-battle-create" type="button" ${canCreate ? '' : 'disabled'}>방 만들기</button>`)}<p class="helper block-battle-intro">여러 줄을 한 번에 지우면 상대에게 방해줄을 보냅니다. 시간이 지날수록 낙하 속도가 빨라지며 먼저 천장에 닿으면 패배합니다.</p><div class="block-battle-lobby-list">${cards}</div>`;
}

function blockBattleBoardHtml(player, { compact = false } = {}) {
  if (!player) return '';
  // 네트워크/구버전 저장 상태가 부분적으로 손상되어도 게임 화면 전체를 죽이지 않는다.
  // 정상 상태에서는 그대로 복사하고, 누락된 칸만 빈 칸으로 안전 복구한다.
  const board = Array.from({ length: 20 }, (_, rowIndex) =>
    Array.from({ length: 10 }, (_, colIndex) => player.board?.[rowIndex]?.[colIndex] ?? null));
  if (player.active && LOCAL_TETROMINO_SHAPES[player.active.type]) {
    for (const [x, y] of LOCAL_TETROMINO_SHAPES[player.active.type][Number(player.active.rotation) || 0]) {
      const row = Number(player.active.row) + y;
      const col = Number(player.active.col) + x;
      if (row >= 0 && row < 20 && col >= 0 && col < 10) board[row][col] = player.active.type;
    }
  }
  return `<div class="block-battle-board ${compact ? 'compact' : ''}" data-block-player="${esc(player.petId)}" role="grid" aria-label="${esc(player.displayName)}의 10열 20행 테트리스 판">${board.flatMap((row, rowIndex) => row.map((cell, colIndex) => `<span class="block-battle-cell ${cell ? `piece-${esc(cell)}` : ''}" data-row="${rowIndex}" data-col="${colIndex}"></span>`)).join('')}</div>`;
}

function blockBattlePlayerPanel(player, { mine = false, compact = false } = {}) {
  if (!player) return '<div class="empty">플레이어 정보 없음</div>';
  const connection = player.connected ? '' : `<span class="tag warning">재접속 대기</span>`;
  return `<article class="block-battle-player ${mine ? 'mine' : ''} ${compact ? 'compact' : ''}" data-block-panel="${esc(player.petId)}"><header><div><strong>${esc(player.displayName)}</strong>${mine ? '<small>내 게임판</small>' : ''}</div>${connection}</header>${blockBattleBoardHtml(player, { compact })}<div class="block-battle-stats"><span>제거 <b data-block-stat="lines">${Number(player.lines || 0)}줄</b></span><span>공격 <b data-block-stat="attackSent">${Number(player.attackSent || 0)}줄</b></span><span>대기 방해 <b data-block-stat="pendingGarbage">${Number(player.pendingGarbage || 0)}줄</b></span></div></article>`;
}

function blockBattleRoomView(room) {
  const isPlayer = room.viewerRole === 'player';
  const isSpectator = room.viewerRole === 'spectator';
  const self = isPlayer ? room.players?.[room.selfPetId] : room.players?.[room.host?.petId];
  const opponent = isPlayer ? room.players?.[room.opponentPetId] : room.players?.[room.guest?.petId];
  const result = room.status === 'ended'
    ? room.winnerPetId
      ? `<div class="result-card"><strong>${room.winnerPetId === app.data.dashboard.pet.id ? '승리했습니다!' : `${esc(room.players?.[room.winnerPetId]?.displayName || '상대')} 승리`}</strong><p>${esc(room.resultReason || '')}</p><small>승자가 판돈 ${points(Number(room.stakePoints || 0) * 2)} 획득</small></div>`
      : `<div class="result-card"><strong>대전 종료 · 판돈 반환</strong><p>${esc(room.resultReason || '')}</p></div>`
    : '';
  const reconnecting = room.status === 'playing' && Object.values(room.players || {}).some((player) => !player.connected)
    ? '<div class="warning-box">한 플레이어의 재접속을 최대 30초 기다리는 동안 게임이 일시정지됩니다.</div>' : '';
  const attackNotice = blockBattleAttackHtml(room);
  const controls = isPlayer && room.status === 'playing'
    ? `<div class="block-battle-controls" aria-label="테트리스 조작"><button data-action="block-battle-control" data-value="left" type="button">←<small>왼쪽</small></button><button data-action="block-battle-control" data-value="rotate" type="button">↻<small>회전</small></button><button data-action="block-battle-control" data-value="right" type="button">→<small>오른쪽</small></button><button data-action="block-battle-control" data-value="softDrop" type="button">↓<small>내리기</small></button><button class="hard-drop" data-action="block-battle-control" data-value="hardDrop" type="button">⇩<small>바로 내리기</small></button></div><p class="helper centered">키보드: ← → 이동 · ↑ 회전 · ↓ 내리기 · Space 바로 내리기</p>` : '';
  const rematch = isPlayer && room.status === 'ended' ? `<button class="primary" data-action="block-battle-rematch" data-id="${room.id}" type="button">${room.rematchRequestedByMe ? '재대결 수락 대기 중' : '재대결'}</button>` : '';
  const leave = isSpectator
    ? `<button class="ghost" data-action="block-battle-spectate-leave" data-id="${room.id}" type="button">관전 나가기</button>`
    : isPlayer ? `<button class="ghost" data-action="block-battle-leave" data-id="${room.id}" type="button">${room.status === 'playing' ? '기권하고 나가기' : '나가기'}</button>` : '<button class="ghost" data-action="block-battle-back" type="button">로비로</button>';
  const boards = room.status === 'waiting'
    ? `<div class="omok-wait"><strong>${esc(room.host?.displayName || '')}</strong><p>상대를 기다리는 중입니다.</p></div>`
    : `<div class="block-battle-stage"><div class="block-battle-burst-slot" data-block-burst-slot>${spectatorBurstLayer(room.reactions || [], 'blockBattle')}</div><div class="block-battle-attack-slot" data-block-attack-slot>${attackNotice}</div><div class="block-battle-versus">${blockBattlePlayerPanel(self, { mine: isPlayer })}<div class="block-battle-vs"><b>VS</b><span data-block-speed>속도 ${Math.max(1, Math.round(850 / Math.max(180, Number(room.gravityMs || 850))))}단계</span><span data-block-spectators>관전자 ${Number(room.spectatorCount || 0)}명</span></div>${blockBattlePlayerPanel(opponent, { compact: true })}</div></div>`;
  return `${sectionHeading('테트리스대전', `${room.roomNumber}번방 · 판돈 ${points(room.stakePoints)} · ${blockBattleStatusLabel(room.status)}`, '<button class="text-button" data-action="block-battle-back" type="button">로비 보기</button>')}${reconnecting}${boards}${result}${controls}<div class="button-row">${rematch}${leave}</div>${isSpectator ? `${spectatorReactionBar('block-battle', room.id, room.reactions || [], true)}<p class="helper">관전자는 블록 조작·판돈·재대결에 참여할 수 없습니다.</p>` : isPlayer ? spectatorReactionBar('block-battle', room.id, room.reactions || [], false, true) : ''}`;
}

function blockBattleSection() {
  const room = currentBlockBattleRoom();
  return room ? blockBattleRoomView(room) : blockBattleLobby();
}

function blockBattleBoardNode(playerId, root = document) {
  const id = String(playerId || '');
  return [...root.querySelectorAll('.block-battle-board')].find((item) => item.dataset.blockPlayer === id) ?? null;
}

function paintBlockBattleBoard(player, root = document) {
  const board = blockBattleBoardNode(player?.petId, root);
  if (!board) return false;
  const cells = board.children;
  if (cells.length !== 200) return false;

  const activeCells = new Map();
  const active = player?.active;
  const shape = active && LOCAL_TETROMINO_SHAPES[active.type]?.[Number(active.rotation) || 0];
  if (shape) {
    for (const [x, y] of shape) {
      const row = Number(active.row) + y;
      const col = Number(active.col) + x;
      if (row >= 0 && row < 20 && col >= 0 && col < 10) activeCells.set(row * 10 + col, active.type);
    }
  }

  const cache = board.__blockBattlePaintCache || (board.__blockBattlePaintCache = Array.from(cells, (cell) => cell.className));
  for (let index = 0; index < 200; index += 1) {
    const row = Math.floor(index / 10);
    const col = index % 10;
    const type = activeCells.get(index) ?? player?.board?.[row]?.[col] ?? null;
    const className = `block-battle-cell${type ? ` piece-${type}` : ''}`;
    if (cache[index] !== className) {
      cells[index].className = className;
      cache[index] = className;
    }
  }
  return true;
}

function blockBattleAttackHtml(room) {
  // 게임 시작 직후에는 lastAttack이 null인 것이 정상이다. optional chaining의 undefined를
  // Number(undefined)로 바꾸면 NaN이 되어 `<= 0` 검사를 통과해버리므로 명시적으로 먼저 막는다.
  if (room?.status !== 'playing' || !room.lastAttack || Number(room.lastAttack.lines) <= 0) return '';
  const isPlayer = room.viewerRole === 'player';
  const isSpectator = room.viewerRole === 'spectator';
  const attackFromMe = isPlayer && room.lastAttack?.fromPetId === room.selfPetId;
  const attackMessage = isPlayer
    ? (attackFromMe ? `🔥 상대에게 ${Number(room.lastAttack.lines)}줄 공격` : `⚠️ 상대가 ${Number(room.lastAttack.lines)}줄 공격`)
    : `🔥 ${esc(room.players?.[room.lastAttack?.fromPetId]?.displayName || '플레이어')}이 ${Number(room.lastAttack.lines)}줄 공격`;
  return `<div class="block-battle-attack ${attackFromMe || isSpectator ? 'sent' : 'incoming'}">${attackMessage}</div>`;
}

function patchBlockBattleDynamic(room) {
  const region = $('.block-battle-wrap');
  if (!region || !room || room.status === 'waiting') return false;
  for (const player of Object.values(room.players || {})) {
    paintBlockBattleBoard(player, region);
    const panel = [...region.querySelectorAll('[data-block-panel]')].find((item) => item.dataset.blockPanel === String(player.petId));
    if (!panel) continue;
    const values = {
      lines: `${Number(player.lines || 0)}줄`,
      attackSent: `${Number(player.attackSent || 0)}줄`,
      pendingGarbage: `${Number(player.pendingGarbage || 0)}줄`
    };
    for (const [key, value] of Object.entries(values)) {
      const node = panel.querySelector(`[data-block-stat="${key}"]`);
      if (node && node.textContent !== value) node.textContent = value;
    }
  }
  const speed = $('[data-block-speed]', region);
  const speedText = `속도 ${Math.max(1, Math.round(850 / Math.max(180, Number(room.gravityMs || 850))))}단계`;
  if (speed && speed.textContent !== speedText) speed.textContent = speedText;
  const spectators = $('[data-block-spectators]', region);
  const spectatorText = `관전자 ${Number(room.spectatorCount || 0)}명`;
  if (spectators && spectators.textContent !== spectatorText) spectators.textContent = spectatorText;

  const attackSlot = $('[data-block-attack-slot]', region);
  if (attackSlot) {
    const attackKey = room.lastAttack ? `${room.lastAttack.at || ''}:${room.lastAttack.fromPetId || ''}:${room.lastAttack.lines || 0}` : '';
    if (attackSlot.dataset.attackKey !== attackKey) {
      attackSlot.dataset.attackKey = attackKey;
      attackSlot.innerHTML = blockBattleAttackHtml(room);
    }
  }

  const reactions = room.reactions || [];
  const reactionKey = reactions.map((item) => item.reactionId).join(':');
  const burstSlot = $('[data-block-burst-slot]', region);
  if (burstSlot && burstSlot.dataset.reactionKey !== reactionKey) {
    burstSlot.dataset.reactionKey = reactionKey;
    burstSlot.innerHTML = spectatorBurstLayer(reactions, 'blockBattle');
  }
  const live = $('.spectator-reactions .reaction-live', region);
  if (live && live.dataset.reactionKey !== reactionKey) {
    live.dataset.reactionKey = reactionKey;
    live.classList.toggle('empty-live', reactions.length === 0);
    const emptyText = live.dataset.reactionEmpty === 'blank' ? '' : '관전 리액션을 보내보세요.';
    live.innerHTML = spectatorReactionLiveContent(reactions, emptyText);
  }
  return true;
}

function syncBlockBattleViewport() {
  if (app.blockBattleViewportFrame) return;
  app.blockBattleViewportFrame = requestAnimationFrame(() => {
    app.blockBattleViewportFrame = 0;
    const region = $('.block-battle-wrap');
    if (!region) return;
    const viewport = window.visualViewport;
    const height = Math.max(320, Math.round(Number(viewport?.height) || window.innerHeight || document.documentElement.clientHeight || 320));
    if (region.dataset.viewportHeight !== String(height)) {
      region.dataset.viewportHeight = String(height);
      region.style.setProperty('--block-battle-viewport-height', `${height}px`);
    }
  });
}

function blockBattleLocalCollision(player, piece) {
  const shape = LOCAL_TETROMINO_SHAPES[piece?.type]?.[Number(piece?.rotation) || 0];
  if (!shape || !Array.isArray(player?.board)) return true;
  return shape.some(([x, y]) => {
    const row = Number(piece.row) + y;
    const col = Number(piece.col) + x;
    if (!Number.isFinite(row) || !Number.isFinite(col)) return true;
    return col < 0 || col >= 10 || row >= 20 || (row >= 0 && player.board[row]?.[col]);
  });
}

function previewBlockBattleInput(action, { room = currentBlockBattleRoom(), paint = true } = {}) {
  const player = room?.players?.[room.selfPetId];
  if (!player?.active || room.status !== 'playing' || room.viewerRole !== 'player') return false;
  if (!LOCAL_TETROMINO_SHAPES[player.active.type]
    || !Number.isFinite(Number(player.active.row)) || !Number.isFinite(Number(player.active.col))) return false;
  let changed = false;
  if (action === 'rotate') {
    const rotation = (Number(player.active.rotation) + 1) % 4;
    for (const offset of [0, -1, 1, -2, 2]) {
      const candidate = { ...player.active, rotation, col: Number(player.active.col) + offset };
      if (!blockBattleLocalCollision(player, candidate)) { player.active = candidate; changed = true; break; }
    }
  } else {
    const rowDelta = ['softDrop', 'hardDrop', 'tick'].includes(action) ? 1 : 0;
    const colDelta = action === 'left' ? -1 : action === 'right' ? 1 : 0;
    let candidate = { ...player.active, row: Number(player.active.row) + rowDelta, col: Number(player.active.col) + colDelta };
    if (action === 'hardDrop') {
      while (!blockBattleLocalCollision(player, candidate)) {
        player.active = candidate;
        changed = true;
        candidate = { ...player.active, row: Number(player.active.row) + 1 };
      }
    } else if (!blockBattleLocalCollision(player, candidate)) { player.active = candidate; changed = true; }
  }
  if (paint && changed) paintBlockBattleBoard(player);
  return changed;
}

function blockBattleInputStopped(room) {
  return !room || room.viewerRole !== 'player' || room.status !== 'playing'
    || Object.values(room.players || {}).some((player) => !player.connected);
}

function stopBlockBattleHold(sourceType = null, sourceId = null) {
  const hold = app.blockBattleHold;
  if (hold && sourceType && (hold.sourceType !== sourceType || hold.sourceId !== sourceId)) return false;
  clearTimeout(app.blockBattleHoldDelay);
  clearTimeout(app.blockBattleHoldTimer);
  app.blockBattleHoldDelay = null;
  app.blockBattleHoldTimer = null;
  app.blockBattleHold = null;
  return true;
}

function startBlockBattleHold(action, {
  sourceType, sourceId, control = null,
  repeatDelay = BLOCK_BATTLE_POINTER_REPEAT_DELAY_MS
} = {}) {
  stopBlockBattleHold();
  const room = currentBlockBattleRoom();
  if (blockBattleInputStopped(room)) return false;
  const hold = {
    action,
    sourceType: String(sourceType || 'pointer'),
    sourceId,
    control,
    roomKey: `${room.id}:${room.matchId}`
  };
  app.blockBattleHold = hold;
  if (!queueBlockBattleInput(action)) {
    app.blockBattleHold = null;
    return false;
  }
  if (!BLOCK_BATTLE_REPEATABLE_ACTIONS.has(action)) return true;

  const repeat = () => {
    const current = currentBlockBattleRoom();
    if (app.blockBattleHold !== hold || document.hidden || app.tab !== 'games'
      || (hold.control && !hold.control.isConnected) || !current
      || `${current.id}:${current.matchId}` !== hold.roomKey || blockBattleInputStopped(current)) {
      stopBlockBattleHold();
      return;
    }
    queueBlockBattleInput(action);
    app.blockBattleHoldTimer = setTimeout(repeat, BLOCK_BATTLE_REPEAT_INTERVAL_MS);
  };
  app.blockBattleHoldDelay = setTimeout(repeat, Math.max(0, Number(repeatDelay) || 0));
  return true;
}

function clearBlockBattlePendingBatches() {
  for (const batch of app.blockBattlePendingBatches) clearTimeout(batch.retryTimer);
  app.blockBattlePendingBatches = [];
  app.blockBattleSending = false;
}

function resetBlockBattleInputQueue() {
  clearTimeout(app.blockBattleFlushTimer);
  app.blockBattleFlushTimer = null;
  app.blockBattleInputBuffer.length = 0;
  clearBlockBattlePendingBatches();
  stopBlockBattleHold();
}

function acknowledgeBlockBattleBatch(room) {
  const requestId = String(room?.lastProcessedRequestId || '');
  if (!requestId) return false;
  const index = app.blockBattlePendingBatches.findIndex((batch) => batch.message.requestId === requestId);
  if (index < 0) return false;
  for (const batch of app.blockBattlePendingBatches.splice(0, index + 1)) clearTimeout(batch.retryTimer);
  app.blockBattleSending = app.blockBattlePendingBatches.length > 0;
  return true;
}

function replayBlockBattlePendingInputs(room, { paint = true } = {}) {
  if (!room || room.viewerRole !== 'player' || room.status !== 'playing') return;
  const pendingActions = app.blockBattlePendingBatches
    .filter((batch) => batch.message.roomId === room.id && batch.message.matchId === room.matchId)
    .flatMap((batch) => batch.message.actions);
  // 하드드롭이 확정되기 전에는 다음 입력을 이미 바닥에 닿은 이전 블록에 미리 그리지 않는다.
  const actions = pendingActions.includes('hardDrop') ? pendingActions : [...pendingActions, ...app.blockBattleInputBuffer];
  for (const action of actions) previewBlockBattleInput(action, { room, paint: false });
  if (paint) paintBlockBattleBoard(room.players?.[room.selfPetId]);
}

function syncBlockBattleGravity() {
  const room = currentBlockBattleRoom();
  const active = app.tab === 'games' && !document.hidden && navigator.onLine
    && room?.viewerRole === 'player' && room.status === 'playing'
    && Object.values(room.players || {}).every((player) => player.connected);
  const gravity = Math.max(180, Number(room?.gravityMs || 850));
  const key = active ? `${room.matchId}:${gravity}` : null;
  if (app.blockBattleGravityKey === key) return;
  clearTimeout(app.blockBattleGravityTimer);
  app.blockBattleGravityTimer = null;
  app.blockBattleGravityKey = key;
  if (!active) return;
  const run = () => {
    app.blockBattleGravityTimer = null;
    if (app.blockBattleGravityKey !== key) return;
    if (!document.hidden && app.tab === 'games') queueBlockBattleInput('tick');
    if (app.blockBattleGravityKey === key) app.blockBattleGravityTimer = setTimeout(run, gravity);
  };
  // setInterval 콜백이 밀린 뒤 연달아 실행되지 않도록 한 번씩 다시 예약한다.
  app.blockBattleGravityTimer = setTimeout(run, gravity);
}

function renderBlockBattleRegion() {
  const region = $('.block-battle-wrap');
  if (!region) { markTabDirty('games'); return false; }
  if (app.blockBattleRenderFrame) cancelAnimationFrame(app.blockBattleRenderFrame);
  app.blockBattleRenderFrame = 0;
  app.blockBattleNeedsLayout = false;
  // 구조가 실제로 바뀌는 순간에만 DOM을 교체한다. 일반 이동·낙하·줄 제거·리액션은
  // 아래 부분 갱신 경로를 사용하므로 조작 중인 pointer가 사라지지 않는다.
  stopBlockBattleHold();
  region.innerHTML = blockBattleSection();
  const room = currentBlockBattleRoom();
  if (room) patchBlockBattleDynamic(room);
  syncBlockBattleViewport();
  syncBlockBattleGravity();
  return true;
}

function scheduleBlockBattleDomUpdate(needsLayout = false) {
  app.blockBattleNeedsLayout ||= Boolean(needsLayout);
  if (app.tab !== 'games') { markTabDirty('games'); return; }
  if (app.blockBattleRenderFrame) return;
  app.blockBattleRenderFrame = requestAnimationFrame(() => {
    app.blockBattleRenderFrame = 0;
    const layout = app.blockBattleNeedsLayout;
    app.blockBattleNeedsLayout = false;
    const room = currentBlockBattleRoom();
    if (app.tab !== 'games') return markTabDirty('games');
    if (layout) renderBlockBattleRegion();
    else if (room) patchBlockBattleDynamic(room);
  });
}

function blockBattleLayoutSignature(room) {
  const players = Object.values(room?.players || {}).map((player) => [player.petId, player.connected].join(':')).sort().join('|');
  return [room?.id, room?.matchId, room?.status, room?.viewerRole, room?.host?.petId, room?.guest?.petId,
    room?.winnerPetId, room?.resultReason, room?.rematchRequestedByMe, players].join('~');
}

function applyBlockBattleRoomState(payload) {
  const room = payload?.room;
  if (!room || !app.data?.blockBattle) return false;
  const rooms = app.data.blockBattle.rooms ??= [];
  const index = rooms.findIndex((item) => item.id === room.id);
  const previous = index >= 0 ? rooms[index] : null;
  const sameMatch = Boolean(previous?.matchId && previous.matchId === room.matchId);
  const incomingVersion = Math.max(0, Number(room.stateVersion) || 0);
  const acceptedVersion = sameMatch ? Math.max(0, Number(app.blockBattleServerVersions.get(room.id)) || 0) : 0;
  if (sameMatch && incomingVersion < acceptedVersion) return false;
  const hasPendingForRoom = app.blockBattlePendingBatches.some((batch) => batch.message.roomId === room.id);
  if (!sameMatch && (room.viewerRole === 'player' || hasPendingForRoom)) {
    resetBlockBattleInputQueue();
  }
  app.blockBattleServerVersions.set(room.id, incomingVersion);
  acknowledgeBlockBattleBatch(room);
  if (index >= 0) rooms[index] = room;
  else rooms.push(room);
  app.data.blockBattle.serverTime = Number(payload.serverTime || Date.now());
  if (!app.blockBattleLobbyForced) app.blockBattleRoomId = room.id;
  const inputPaused = room.status !== 'playing' || Object.values(room.players || {}).some((player) => !player.connected);
  const ownsInputQueue = room.viewerRole === 'player'
    || app.blockBattlePendingBatches.some((batch) => batch.message.roomId === room.id);
  if (ownsInputQueue && (inputPaused || (previous?.matchId && previous.matchId !== room.matchId))) {
    resetBlockBattleInputQueue();
  } else {
    replayBlockBattlePendingInputs(room, { paint: false });
  }
  const needsLayout = !previous || blockBattleLayoutSignature(previous) !== blockBattleLayoutSignature(room);
  if (app.blockBattleLobbyForced) {
    syncBlockBattleGravity();
    return true;
  }
  scheduleBlockBattleDomUpdate(needsLayout);
  syncBlockBattleGravity();
  if (!app.blockBattleSending && app.blockBattleInputBuffer.length && !app.blockBattleFlushTimer) {
    app.blockBattleFlushTimer = setTimeout(flushBlockBattleInputs, 0);
  }
  return true;
}

function blockBattleBatchIsPending(requestId) {
  return app.blockBattlePendingBatches.some((batch) => batch.message.requestId === requestId);
}

function scheduleBlockBattleRecovery() {
  clearTimeout(app.blockBattleRecoveryTimer);
  app.blockBattleRecoveryTimer = setTimeout(() => {
    app.blockBattleRecoveryTimer = null;
    if (app.token && navigator.onLine) loadBootstrap({ silent: true, renderMode: 'games-live' });
  }, 120);
}

function expectedBlockBattleDiscard(payload) {
  if (payload?.discarded || payload?.terminal || payload?.stale || payload?.paused) return true;
  // 배포 순간 구 Worker와 새 클라이언트가 잠깐 섞여도 정상적인 늦은 입력을
  // 사용자 오류로 연속 표시하지 않는다.
  return /이미 종료|진행 중이 아닌|이전 대전|방.*찾을 수|재접속.*대기|일시정지/.test(String(payload?.message || ''));
}

function removeBlockBattlePendingBatch(requestId) {
  const index = app.blockBattlePendingBatches.findIndex((batch) => batch.message.requestId === requestId);
  if (index < 0) return false;
  clearTimeout(app.blockBattlePendingBatches[index].retryTimer);
  app.blockBattlePendingBatches.splice(index, 1);
  app.blockBattleSending = app.blockBattlePendingBatches.length > 0;
  return true;
}

function showBlockBattleErrorOnce(message) {
  const key = String(message || '테트리스대전 입력을 처리하지 못했습니다.');
  const now = monotonicNow();
  if (app.blockBattleLastErrorKey === key && now - app.blockBattleLastErrorAt < 2_500) return;
  app.blockBattleLastErrorKey = key;
  app.blockBattleLastErrorAt = now;
  toast(key, 'error');
}

function handleBlockBattleInputError(payload = {}) {
  removeBlockBattlePendingBatch(String(payload.requestId || ''));
  if (expectedBlockBattleDiscard(payload)) {
    if (payload.terminal || payload.stale || !payload.paused) resetBlockBattleInputQueue();
    else {
      app.blockBattleInputBuffer.length = 0;
      stopBlockBattleHold();
    }
    scheduleBlockBattleRecovery();
    return;
  }
  resetBlockBattleInputQueue();
  showBlockBattleErrorOnce(payload.message);
  scheduleBlockBattleRecovery();
}

async function sendBlockBattleBatchHttp(batch) {
  if (!blockBattleBatchIsPending(batch.message.requestId)) return;
  clearTimeout(batch.retryTimer);
  batch.retryTimer = null;
  try {
    const result = await api(`/api/block-battle/rooms/${encodeURIComponent(batch.message.roomId)}/input`, {
      method: 'POST', body: JSON.stringify(batch.message)
    });
    const next = result.blockBattle?.rooms?.find((item) => item.id === batch.message.roomId);
    if (next) applyBlockBattleRoomState({ room: next, serverTime: result.blockBattle.serverTime });
    else if (result.discarded || result.terminal || result.stale) resetBlockBattleInputQueue();
  } catch (error) {
    if (!blockBattleBatchIsPending(batch.message.requestId)) return;
    const room = currentBlockBattleRoom();
    if (!room || room.status !== 'playing' || room.matchId !== batch.message.matchId) {
      resetBlockBattleInputQueue();
      return;
    }
    resetBlockBattleInputQueue();
    showBlockBattleErrorOnce(error.message);
    scheduleBlockBattleRecovery();
  }
}

function flushBlockBattleInputs() {
  clearTimeout(app.blockBattleFlushTimer);
  app.blockBattleFlushTimer = null;
  if (app.blockBattleSending) return;
  const room = currentBlockBattleRoom();
  const actions = app.blockBattleInputBuffer.splice(0, BLOCK_BATTLE_MAX_UNCONFIRMED_ACTIONS);
  if (!room || !actions.length || room.viewerRole !== 'player' || room.status !== 'playing') return;
  const requestId = crypto.randomUUID?.() || `block-input-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const message = { type: 'block-battle-input', roomId: room.id, matchId: room.matchId, actions, requestId };
  const batch = { message, retryTimer: null };
  app.blockBattlePendingBatches.push(batch);
  app.blockBattleSending = true;
  if (app.ws?.readyState === WebSocket.OPEN) {
    app.ws.send(JSON.stringify(message));
    batch.retryTimer = setTimeout(() => sendBlockBattleBatchHttp(batch), 900);
  } else {
    sendBlockBattleBatchHttp(batch);
  }
}

function queueBlockBattleInput(action) {
  if (!['left', 'right', 'rotate', 'softDrop', 'hardDrop', 'tick'].includes(action)) return false;
  const room = currentBlockBattleRoom();
  if (app.tab !== 'games' || !navigator.onLine || blockBattleInputStopped(room)) return false;
  const awaitingHardDrop = app.blockBattlePendingBatches.some((batch) => batch.message.actions.includes('hardDrop'))
    || app.blockBattleInputBuffer.includes('hardDrop');
  if (action === 'tick') {
    // 자동 낙하는 최대 한 개만 미확정 상태로 둔다. 후반 180ms 주기에서도 네트워크
    // 응답보다 빠르게 tick이 쌓여 수동 조작을 밀어내지 못한다.
    const tickPending = app.blockBattleInputBuffer.includes('tick')
      || app.blockBattlePendingBatches.some((batch) => batch.message.actions.includes('tick'));
    if (tickPending || awaitingHardDrop) return false;
  } else {
    // 수동 조작이 들어오면 아직 전송하지 않은 자동 낙하를 뒤로 미루지 않고 제거한다.
    app.blockBattleInputBuffer = app.blockBattleInputBuffer.filter((queued) => queued !== 'tick');
  }
  const unconfirmedActions = app.blockBattleInputBuffer.length + app.blockBattlePendingBatches
    .reduce((count, batch) => count + batch.message.actions.length, 0);
  // 네트워크 응답이 늦을 때 길게 누르기 입력이 수십 개씩 쌓였다가 한꺼번에
  // 적용되는 현상을 막는다. 화면에는 즉시 반영하되 미확정 입력은 작은 상한만 둔다.
  if (unconfirmedActions >= BLOCK_BATTLE_MAX_UNCONFIRMED_ACTIONS && action !== 'hardDrop') return false;
  if (action !== 'tick' && !awaitingHardDrop) {
    const changed = previewBlockBattleInput(action);
    // 벽에 닿은 좌우/회전 입력은 서버에서도 결과가 같으므로 반복 전송하지 않는다.
    if (!changed && ['left', 'right', 'rotate'].includes(action)) return false;
  } else if (action === 'tick') previewBlockBattleInput(action);
  app.blockBattleInputBuffer.push(action);
  if (action === 'hardDrop' || app.blockBattleInputBuffer.length >= BLOCK_BATTLE_MAX_UNCONFIRMED_ACTIONS) flushBlockBattleInputs();
  else if (!app.blockBattleFlushTimer) app.blockBattleFlushTimer = setTimeout(flushBlockBattleInputs, 24);
  return true;
}

function liarPhaseLabel(phase) {
  return ({ waiting: '대기실', discussion: '토론', voting: '투표', liar_guess: '라이어 정답', result: '라운드 결과', game_over: '게임 종료' })[phase] || phase;
}

function liarPlayerConnectionLabel(player) {
  if (player.connected) return '접속';
  if (player.forfeited) return '최종 이탈';
  if (player.reconnectDeadlineAt) return '재접속 대기';
  return '이탈';
}

function liarTimerHtml(game) {
  if (game.pausedForReconnect && game.reconnectDeadlineAt) return '<span id="liar-reconnect-countdown" class="tag warning">재접속 대기</span>';
  return game.phaseEndsAt ? '<span id="liar-countdown" class="tag"></span>' : '';
}

function liarSection() {
  const game = app.data.liarGame;
  const me = app.data.dashboard.pet;
  if (!game.joined && !game.spectating) {
    const inProgress = game.phase !== 'waiting';
    return `${sectionHeading('라이어게임', inProgress ? `게임 중 · 관전자 ${game.spectatorCount || 0}명` : '1라운드 · 포인트 배팅')}<div class="liar-intro"><div class="game-icon big">🎭</div><h3>${inProgress ? '현재 게임 중입니다' : `현재 ${game.players.length}/${game.settings.maxPlayers}명 참가 중`}</h3><p>${inProgress ? '플레이어로 중간 참가할 수는 없지만 읽기 전용으로 관전할 수 있습니다.' : '방장이 판돈·토론 시간·최대 참가 인원을 정하고 한 라운드만 진행합니다.'}</p>${inProgress ? '<button class="primary" data-action="liar-spectate" type="button">관전하기</button>' : '<button class="primary" data-action="liar-join" type="button">참가하기</button>'}</div>`;
  }
  const spectator = game.spectating && !game.joined;
  const players = game.players.map((player) => `<div class="liar-player ${player.petId === me.id ? 'me' : ''} ${player.connected ? '' : 'offline'}"><div><strong>${esc(player.displayName)}</strong><small>${player.isHost ? '방장 · ' : ''}${liarPlayerConnectionLabel(player)}${player.ready ? ' · 준비' : ''}</small></div><b>${player.score}점</b>${!spectator && game.isHost && game.phase === 'waiting' && player.petId !== me.id ? `<button class="tiny danger" data-action="liar-kick" data-id="${player.petId}" type="button">내보내기</button>` : ''}</div>`).join('');
  if (spectator) {
    const spectatorResult = game.roundResult ? `<div class="result-card"><strong>${game.phase === 'game_over' && game.roundResult.liarWon != null ? (game.roundResult.liarWon ? '라이어 승리' : '시민 승리') : '라운드 진행 결과'}</strong><p>${esc(game.roundResult.reason || '')}</p>${game.phase === 'game_over' ? `<small>제시어 ${esc(game.roundResult.word || game.word || '-')} · 라이어 ${esc(game.roundResult.liarDisplayName || '-')}</small>` : ''}</div>` : '';
    return `${sectionHeading('라이어게임 관전', `${liarPhaseLabel(game.phase)} · 관전자 ${game.spectatorCount || 0}명`, liarTimerHtml(game))}<div class="liar-reaction-stage">${spectatorBurstLayer(game.reactions || [], 'liar')}<div class="liar-layout"><div><div class="liar-player-list">${players}</div><div class="spectator-card"><strong>👀 관전 중</strong><p>투표·정답·게임 조작·채팅은 사용할 수 없습니다. 제시어와 라이어 정보는 게임 종료 전 서버에서 전송되지 않습니다.</p></div>${spectatorResult}${spectatorReactionBar('liar', null, game.reactions || [], true)}<button class="ghost" data-action="liar-spectate-leave" type="button">관전 나가기</button></div>${liarChat(game, me.id, true)}</div></div>`;
  }
  const waitingControls = game.phase === 'waiting' ? `<div class="liar-controls">${game.isHost ? `<div class="setting-row"><label>토론<select id="liar-discussion">${app.data.catalog.liarDiscussionOptions.map((value) => `<option value="${value}" ${game.settings.discussionSeconds === value ? 'selected' : ''}>${value}초</option>`).join('')}</select></label><label>판돈<select id="liar-bet">${app.data.catalog.liarBetOptions.map((value) => `<option value="${value}" ${game.settings.betPoints === value ? 'selected' : ''}>${value}P</option>`).join('')}</select></label><label>최대 인원<select id="liar-max-players">${app.data.catalog.liarPlayerOptions.map((value) => `<option value="${value}" ${game.settings.maxPlayers === value ? 'selected' : ''}>${value}명</option>`).join('')}</select></label><button class="soft-button" data-action="liar-save-settings" type="button">설정 저장</button></div>` : ''}<div class="button-row"><button class="${game.ready ? 'soft-button' : 'primary'}" data-action="liar-ready" type="button">${game.ready ? '준비 취소' : '준비'}</button>${game.isHost ? '<button class="primary" data-action="liar-start" type="button">게임 시작</button>' : ''}<button class="ghost" data-action="liar-leave" type="button">나가기</button></div><p class="helper">참가 ${game.players.length}/${game.settings.maxPlayers}명 · 시작 판돈 ${points(game.settings.betPoints)}</p></div>` : '';
  const role = ['discussion', 'voting', 'liar_guess'].includes(game.phase) ? `<div class="role-card ${game.isLiar ? 'liar' : 'citizen'}"><span>${game.isLiar ? '당신은 라이어' : '당신은 시민'}</span><small>카테고리: <b>${esc(game.category || '-')}</b></small><strong>${game.isLiar ? '제시어: ???' : `제시어: ${esc(game.word || '')}`}</strong></div>` : '';
  const vote = game.phase === 'voting' ? `<div class="vote-grid">${game.players.filter((player) => player.connected && game.voteCandidateIds.includes(player.petId)).map((player) => `<button data-action="liar-vote" data-id="${player.petId}" type="button" ${game.hasVoted ? 'disabled' : ''}>${esc(player.displayName)}</button>`).join('')}</div>` : '';
  const guess = game.phase === 'liar_guess' && game.isLiar ? `<form id="liar-guess-form" class="inline-form"><input name="guess" maxlength="40" placeholder="제시어 입력" required><button class="primary" type="submit">정답 제출</button></form>` : '';
  const result = game.roundResult ? `<div class="result-card"><strong>${game.roundResult.liarWon ? '라이어 승리' : '시민 승리'}</strong><p>${esc(game.roundResult.reason)}</p><small>총 판돈 ${points(game.roundResult.payout?.pot || 0)} · 1인 지급 ${points(game.roundResult.payout?.each || 0)}</small></div>` : '';
  const gameOver = game.phase === 'game_over' && game.isHost ? '<button class="primary" data-action="liar-reset" type="button">다시 준비하기</button>' : '';
  return `${sectionHeading('라이어게임', `${liarPhaseLabel(game.phase)} · 1라운드`, liarTimerHtml(game))}<div class="liar-reaction-stage">${spectatorBurstLayer(game.reactions || [], 'liar')}<div class="liar-layout"><div><div class="liar-player-list">${players}</div>${waitingControls}${role}${vote}${guess}${result}${spectatorReactionBar('liar', null, game.reactions || [], false)}${gameOver}</div>${liarChat(game, me.id, false)}</div></div>`;
}

function liarChatMessageHtml(message, myPetId) {
  return message.type === 'system'
    ? `<div class="chat-system" data-chat-id="${esc(message.id || '')}">${esc(message.text)}</div>`
    : `<div class="chat-message ${message.petId === myPetId ? 'mine' : ''}" data-chat-id="${esc(message.id || '')}"><div class="chat-message-head"><strong>${esc(message.displayName)}</strong>${app.data.admin.isAdmin ? `<button data-action="admin-delete-liar-chat" data-id="${message.id}" type="button">삭제</button>` : ''}</div><p>${esc(message.text)}</p></div>`;
}

function liarChatMessages(game, myPetId) {
  const messages = game.messages.map((message) => liarChatMessageHtml(message, myPetId)).join('');
  return messages || '<div class="empty">아직 채팅이 없습니다.</div>';
}

function liarChat(game, myPetId, readOnly = false) {
  return `<div class="liar-chat-section"><h3>${readOnly ? '공개 채팅 보기' : '게임 채팅'}</h3><div class="chat-box-wrap"><div id="liar-chat-box" class="chat-box">${liarChatMessages(game, myPetId)}</div><button id="liar-new-message" class="liar-new-message hidden" data-action="liar-chat-jump-latest" type="button">새 메시지</button></div>${readOnly ? '<p class="helper">관전자는 채팅에 참여할 수 없습니다.</p>' : `<form id="liar-chat-form" class="chat-form"><input name="text" maxlength="200" autocomplete="off" placeholder="채팅 입력" value="${esc(app.liarChatDraft)}" required><button class="primary" type="submit">전송</button></form>`}</div>`;
}

function updateLiarNewMessageButton() {
  const button = $('#liar-new-message');
  if (!button) return;
  const count = Math.max(0, Number(app.liarUnreadChatCount) || 0);
  button.textContent = count > 1 ? `새 메시지 ${count}개` : '새 메시지';
  button.classList.toggle('hidden', count === 0);
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
  if ((!game?.joined && !game?.spectating) || !chat) return false;
  const scrollSnapshot = captureLiarChatScrollState(chat);
  const composerSnapshot = input ? captureLiarComposerState() : null;
  if (input) app.liarChatDraft = input.value;
  const desiredIds = new Set(game.messages.map((message) => String(message.id || '')));
  const existing = new Map([...chat.querySelectorAll('[data-chat-id]')].map((node) => [node.dataset.chatId, node]));
  for (const [chatId, node] of existing) if (!desiredIds.has(chatId)) node.remove();
  chat.querySelector('.empty')?.remove();
  let appended = 0;
  for (const message of game.messages) {
    const chatId = String(message.id || '');
    if (existing.has(chatId)) continue;
    chat.insertAdjacentHTML('beforeend', liarChatMessageHtml(message, me.id));
    appended += 1;
  }
  if (!game.messages.length) chat.innerHTML = '<div class="empty">아직 채팅이 없습니다.</div>';
  if (appended && scrollSnapshot && !scrollSnapshot.nearBottom) app.liarUnreadChatCount += appended;
  if (!scrollSnapshot || scrollSnapshot.nearBottom) app.liarUnreadChatCount = 0;
  requestAnimationFrame(() => {
    if (input) restoreLiarComposerState(composerSnapshot);
    restoreLiarChatScrollState(scrollSnapshot, chat);
    updateLiarNewMessageButton();
  });
  return true;
}

async function sendLiarChat(form) {
  if (app.liarChatSending || app.liarComposing) return null;
  const input = form?.querySelector('input[name="text"]');
  const text = String(input?.value ?? '').trim();
  if (!text) return null;
  const sentValue = input.value;
  const submit = form.querySelector('button[type="submit"]');
  const requestId = crypto.randomUUID?.() || `liar-chat-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  app.liarChatSending = true;
  if (submit) submit.disabled = true;
  try {
    const result = await api('/api/liar/chat', { method: 'POST', body: JSON.stringify({ text, requestId }) });
    if (result.chat) applyLiarChatEvent({ action: 'append', chat: result.chat });
    if (input && input.value === sentValue) {
      input.value = '';
      app.liarChatDraft = '';
    } else if (input) app.liarChatDraft = input.value;
    return result;
  } catch (error) {
    toast(error.message, 'error');
    return null;
  } finally {
    app.liarChatSending = false;
    if (submit && document.contains(submit)) submit.disabled = false;
  }
}

function applyLiarChatEvent(payload) {
  const game = app.data?.liarGame;
  if (!game || !payload) return false;
  game.messages = Array.isArray(game.messages) ? game.messages : [];
  if (payload.action === 'append' && payload.chat?.id && !game.messages.some((message) => message.id === payload.chat.id)) {
    game.messages.push(payload.chat);
    game.messages = game.messages.slice(-120);
    if (app.data.admin?.liarChats && payload.chat.type === 'chat') {
      app.data.admin.liarChats.push(payload.chat);
      app.data.admin.liarChats = app.data.admin.liarChats.slice(-120);
      const adminList = $('#admin-liar-chat-list');
      if (adminList && !adminList.querySelector(`[data-admin-chat-id="${payload.chat.id}"]`)) {
        adminList.querySelector('.empty')?.remove();
        adminList.insertAdjacentHTML('beforeend', `<article class="admin-chat" data-admin-chat-id="${esc(payload.chat.id)}"><div><strong>${esc(payload.chat.displayName)}</strong><p>${esc(payload.chat.text)}</p><small>${dateText(payload.chat.createdAt)}</small></div><button class="danger-button" data-action="admin-delete-liar-chat" data-id="${esc(payload.chat.id)}" type="button">삭제</button></article>`);
      }
    }
  } else if (payload.action === 'delete' && payload.chatId) {
    game.messages = game.messages.filter((message) => message.id !== payload.chatId);
    if (app.data.admin?.liarChats) app.data.admin.liarChats = app.data.admin.liarChats.filter((message) => message.id !== payload.chatId);
    $$('[data-admin-chat-id]').find((node) => node.dataset.adminChatId === String(payload.chatId))?.remove();
  } else return false;
  if (!refreshLiarChatOnly()) markTabDirty('games');
  return true;
}
function territoryOwnerColor(ownerPetId = '') {
  let hash = 0;
  for (const char of String(ownerPetId)) hash = ((hash << 5) - hash + char.codePointAt(0)) | 0;
  return `hsl(${Math.abs(hash) % 360} 62% 38%)`;
}

function territoryViewPage() {
  const territory = app.data.territory;
  const mapSize = Math.max(1, Math.floor(Number(territory.size) || 5));
  const occupied = new Map(territory.cells.map((cell) => [`${cell.row}:${cell.col}`, cell]));
  const battleUnlocked = Boolean(territory.battleUnlocked);
  const rows = Array.from({ length: mapSize }, (_, row) => {
    const rowCells = Array.from({ length: mapSize }, (_, col) => {
      const cell = occupied.get(`${row}:${col}`) ?? null;
      const golden = Boolean(cell?.golden);
      const home = Boolean(cell?.home);
      const title = cell ? `${cell.ownerDisplayName}${home ? ' · 본진(항상 보호)' : ''}${golden ? ' · 황금 영토' : ''}` : (golden ? '황금 영토 · 빈 땅' : '빈 땅');
      const owner = cell ? `<span class="territory-owner" style="--owner-color:${territoryOwnerColor(cell.ownerPetId)}">${home ? '<span class="territory-home-icon" aria-hidden="true">🏠</span>' : ''}${esc(cell.ownerDisplayName)}</span>` : '<span class="territory-empty-label">빈 땅</span>';
      return `<button class="territory-cell ${cell ? (cell.mine ? 'mine occupied' : 'occupied') : 'vacant'} ${home ? 'home' : ''} ${golden ? 'golden' : ''}" ${cell ? `style="--owner-color:${territoryOwnerColor(cell.ownerPetId)}"` : ''} data-action="claim-territory-direct" data-row="${row}" data-col="${col}" data-owner="${esc(cell?.ownerPetId || '')}" type="button" ${cell?.mine ? 'disabled' : ''} title="${esc(title)}" aria-label="${row + 1}행 ${col + 1}열 · ${esc(title)}">${golden ? '<span class="territory-star">★</span>' : ''}${owner}</button>`;
    }).join('');
    return `<div class="territory-row" role="row" data-row="${row}">${rowCells}</div>`;
  }).join('');
  const ranking = territory.ranking.length ? territory.ranking.map((item) => `<div class="rank-row"><b>${item.rank}</b><span style="color:${territoryOwnerColor(item.petId)}">${esc(item.displayName)}${item.hasGolden ? ' ★' : ''}</span><strong>${item.count}칸</strong></div>`).join('') : '<div class="empty">아직 설치된 땅이 없습니다.</div>';
  const goldenStatus = '<b>👑 황금 영토는 게임 종료 후 공개됩니다.</b>';
  const nextUpgrade = territory.my?.nextUpgrade;
  const territoryLimitHint = nextUpgrade
    ? `현재 Lv.${territory.my.level}은 최대 ${territory.my.limit}칸 · Lv.${nextUpgrade.level}부터 ${nextUpgrade.limit}칸`
    : `현재 Lv.${territory.my.level} · 최대 보유 한도 ${territory.my.limit}칸`;
  const last = territory.lastResult;
  const reentryNotice = battleUnlocked && Number(territory.my?.owned || 0) === 0
    ? `<div class="warning-box">⚔️ 현재 내 영토가 없습니다. 빈칸이 있으면 무료로 새 본진을 세울 수 있고, 맵이 꽉 찼다면 상대의 일반 영토를 눌러 ${Number(app.data?.catalog?.territoryStealCost || 50)}P로 빼앗아 🏠 새 본진을 세울 수 있습니다. 상대 본진은 항상 보호됩니다.</div>`
    : '';
  const previousResult = last?.goldenCell
    ? `<section class="section territory-result-section">${sectionHeading(`제${last.seasonNumber}회 결과`, '종료된 시즌의 황금 영토는 이제 공개됩니다.')}<div class="territory-last-result"><div><small>우승</small><strong>${last.winnerDisplayName ? `${esc(last.winnerDisplayName)} · ${points(last.reward || 0)}` : '보상 대상 없음'}</strong></div><div><small>황금 영토</small><strong>${Number(last.goldenCell.row) + 1}행 ${Number(last.goldenCell.col) + 1}열</strong></div><div><small>종료 시점 소유</small><strong>${last.goldenOwnerDisplayName ? esc(last.goldenOwnerDisplayName) : '빈 땅'}</strong></div></div></section>`
    : '';
  const serverNow = serverAlignedNow(territory.serverTime || app.data.serverTime);
  return `<section class="page-title"><span class="eyebrow">6시간 시즌</span><h1>제${territory.seasonNumber}회 레고 영토전</h1><p>본진을 지키면서 주변 8칸으로 땅을 넓히고 상대 영토를 빼앗는 게임입니다.</p></section>${previousResult}<section class="section territory-summary"><div class="metric-grid">${compactMetric('남은 시간', `<span id="territory-countdown">${durationText(new Date(territory.endsAt).getTime() - serverNow)}</span>`, '', { raw: true })}${compactMetric('내 레벨', `Lv.${territory.my.level}`)}${compactMetric('내 영토', `${territory.my.owned}/${territory.my.limit}`)}${compactMetric('현재 순위', territory.my.rank ? `${territory.my.rank}위` : '-')}</div><div class="territory-next-reset"><strong>다음 초기화: ${territoryResetText(territory.endsAt)}</strong></div><div class="territory-limit-strip"><span>${esc(territoryLimitHint)}</span><button class="soft-button" data-action="territory-limits" type="button">ⓘ 레벨별 한도</button></div><div class="territory-golden-status">${goldenStatus}</div><div class="territory-golden-status"><b>${battleUnlocked ? '⚔️ 전면전 진행 중 · 일반 영토 탈취 가능 · 본진은 항상 보호' : `🛡️ 본진은 항상 보호 · ${territory.cells.length}/${mapSize * mapSize}칸 점유`}</b></div>${reentryNotice}<div class="territory-rule"><b>안내:</b> 영토전은 한국시간 00시·06시·12시·18시에 새 회차가 시작됩니다. 점령 시각부터 6시간을 계산하는 방식이 아니며, 현재 영토는 표시된 다음 초기화 시각까지 유지됩니다.</div><div class="territory-rule"><b>룰:</b> 빈 땅 점령은 무료, 상대 땅 탈취는 50P입니다. 🏠 본진은 전면전 여부와 관계없이 항상 보호되며 누구도 빼앗거나 이동·포기할 수 없습니다. 맵 25칸이 한 번이라도 모두 차면 ⚔️ 전면전이 열리고 이후에는 일반 영토만 탈취할 수 있습니다. 신규 참가자나 영토가 0칸이 된 사람도 빈칸 또는 상대의 일반 영토를 통해 다시 참가할 수 있습니다. 보유 한도가 꽉 차면 빈 땅 추가 점령은 막히지만, 상대의 일반 영토는 50P를 내고 내 가장 오래된 일반 영토 한 칸을 옮기는 방식으로 계속 탈취할 수 있습니다.</div></section><section class="section territory-section">${sectionHeading('공용 맵', `${mapSize} × ${mapSize}`)}<div class="territory-scroll"><div class="territory-map" role="grid" aria-label="${mapSize}행 ${mapSize}열 레고 영토전 맵">${rows}</div></div><p class="helper centered">회색칸은 빈 땅, 색깔 닉네임은 소유자입니다. 🏠 본진은 전면전에서도 항상 보호되며 탈취·이동·포기할 수 없습니다. 황금 영토 위치는 종료 전에는 공개되지 않습니다.</p></section><section class="section">${sectionHeading('현재 순위', '단독 1위만 500P를 받습니다. 동률이면 종료 후 공개되는 황금 영토가 최종 승자를 가릅니다.')}<div class="rank-list">${ranking}</div></section>`;
}

function openTerritoryLimits() {
  const territory = app.data?.territory;
  if (!territory) return;
  const tiers = Array.isArray(territory.limitTiers) ? territory.limitTiers : [];
  const currentLevel = Number(territory.my?.level || 1);
  const rows = tiers.map((tier) => {
    const active = currentLevel >= Number(tier.minLevel) && (tier.maxLevel == null || currentLevel <= Number(tier.maxLevel));
    const levelText = tier.maxLevel == null
      ? `Lv.${tier.minLevel} 이상`
      : Number(tier.minLevel) === Number(tier.maxLevel) ? `Lv.${tier.minLevel}` : `Lv.${tier.minLevel}~${tier.maxLevel}`;
    return `<div class="territory-limit-row ${active ? 'current' : ''}"><span>${levelText}</span><strong>최대 ${tier.limit}칸</strong>${active ? '<b>현재</b>' : ''}</div>`;
  }).join('');
  const next = territory.my?.nextUpgrade;
  const note = next
    ? `현재 Lv.${currentLevel}에서는 최대 ${territory.my.limit}칸입니다. Lv.${next.level}부터 최대 ${next.limit}칸을 보유할 수 있습니다.`
    : `현재 최대 단계입니다. 한 사람의 최대 보유 영토는 ${territory.my.limit}칸입니다.`;
  openModal(`${modalHeader('영토 레벨별 보유 한도', note)}<div class="territory-limit-table">${rows}</div><p class="warning-box">한도가 꽉 차면 빈 땅 추가 점령은 제한됩니다. 상대 영토 탈취는 50P이며, 한도에 꽉 찬 상태에서는 가장 오래된 일반 영토 한 칸을 비우고 탈취한 칸으로 이동해 총 보유 수를 유지합니다. 본진은 전면전 여부와 관계없이 자동으로 비우거나 이동하지 않습니다.</p>`, { type:'territoryLimits' });
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
    <section class="section resident-section">${sectionHeading('레고 주민목록', `${(app.data.residents ?? []).length}명`)}<button id="resident-toggle" class="soft-button wide resident-toggle" data-action="toggle-residents" type="button" aria-expanded="${app.residentsExpanded ? 'true' : 'false'}">${app.residentsExpanded ? '레고 주민목록 접기 ▲' : '레고 주민목록 보기 ▼'}</button><div id="resident-list-region" class="resident-list-region">${app.residentsExpanded ? residentListHtml() : ''}</div></section>
    <section class="section">${sectionHeading('벙', '방장이 최소 500P 이상 사용해 열 수 있습니다.', bungActions)}<div class="bung-list">${bungs.length ? bungs.map((bung) => `<button class="bung-card" data-action="open-bung" data-id="${bung.id}" type="button"><div><strong>${esc(bung.title)}</strong><small>${esc(bung.hostDisplayName)} · ${points(bung.stakePoints)}</small></div><span>${bung.status === 'live' ? '진행 중' : '모집 중'} · ${bung.attendees.length}/30명</span></button>`).join('') : '<div class="empty">현재 열린 벙이 없습니다.</div>'}</div></section>
  `;
}

function residentListHtml() {
  const residents = app.data?.residents ?? [];
  return `<div class="profile-grid resident-grid">${residents.map(profileMiniCard).join('') || '<div class="empty">가입한 레고가 없습니다.</div>'}</div>`;
}

function renderResidentRegion(expanded = app.residentsExpanded) {
  app.residentsExpanded = Boolean(expanded);
  const pane = $('#view .tab-pane[data-pane="social"]');
  const button = $('#resident-toggle', pane ?? document);
  const region = $('#resident-list-region', pane ?? document);
  if (!button || !region) return false;
  button.textContent = app.residentsExpanded ? '레고 주민목록 접기 ▲' : '레고 주민목록 보기 ▼';
  button.setAttribute('aria-expanded', app.residentsExpanded ? 'true' : 'false');
  region.replaceChildren();
  if (app.residentsExpanded) region.insertAdjacentHTML('beforeend', residentListHtml());
  return true;
}

function profileMiniCard(profile) {
  const stage = profile.bodyStage || stageForBody(profile.stats.body);
  return `<button class="profile-mini${flexProfileClass(profile)}" data-action="profile" data-id="${profile.id}" type="button">${workoutBadgeHtml(profile, { compact: true })}${seasonBadgesHtml(profile)}${avatar(stage, { mini: true, flexItem: profile.flexItem })}<strong class="flex-display-name">${esc(profile.displayName)}</strong>${profile.statusMessage ? `<span class="profile-status-message">${esc(profile.statusMessage)}</span>` : ''}<small>${profile.online ? '🟢 ' : ''}Lv.${profile.stats.level} · ${points(profile.stats.points)}</small></button>`;
}

function recordsView() {
  const pet = app.data.dashboard.pet;
  const records = pet.records;
  return `<section class="page-title"><span class="eyebrow">기록</span><h1>${esc(pet.displayName)}의 기록</h1><p>현재 레고의 핵심 기록만 표시합니다.</p></section><section class="section"><div class="record-grid">${compactMetric('세대', `${pet.generation}세대`)}${compactMetric('생존', `${records.days}게임일`)}${compactMetric('레벨', `Lv.${pet.stats.level}`)}${compactMetric('레고력', `${pet.stats.legoPower}`)}${compactMetric('포인트', points(pet.stats.points))}${compactMetric('최고 포인트', points(records.maxPoints))}${compactMetric('현재 경고', `${pet.warnings}회`)}${compactMetric('누적 경고', `${pet.records.warnings}회`)}${compactMetric('영토전 우승', `${records.territoryWins}회`)}${compactMetric('테트리스대전', `${records.blockBattleWins || 0}승 ${records.blockBattleLosses || 0}패`)}${compactMetric('번개 최고', records.bestReactionMs ? `${(records.bestReactionMs/1000).toFixed(3)}초` : '-')}${compactMetric('낚시', `${records.fishing}회`)}</div></section>${app.data.admin.isAdmin ? `<section class="section admin-callout"><div><h2>운영자 관리</h2><p>포인트 지급·회수, 일반 경고, 강퇴, 계정 삭제, 상태 초기화와 기존 라이어게임 관리를 할 수 있습니다.</p></div><button class="primary" data-action="open-admin" type="button">관리 열기</button></section>` : ''}<section class="section"><button class="danger-button wide" data-action="logout" type="button">모든 기기에서 로그아웃</button></section>`;
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

const MAIN_TABS = ['home', 'games', 'territory', 'social', 'records'];

function markAllTabsDirty() {
  if (!(app.dirtyTabs instanceof Set)) app.dirtyTabs = new Set();
  MAIN_TABS.forEach((tab) => app.dirtyTabs.add(tab));
}

function markTabDirty(tab) {
  if (!(app.dirtyTabs instanceof Set)) app.dirtyTabs = new Set();
  if (MAIN_TABS.includes(tab)) app.dirtyTabs.add(tab);
}

function createTabPane(tab) {
  const pane = document.createElement('section');
  pane.className = 'tab-pane';
  pane.dataset.pane = tab;
  pane.dataset.rendered = 'false';
  pane.innerHTML = '<div class="tab-loading" aria-hidden="true"><span></span><span></span><span></span></div>';
  return pane;
}

function attachTabPane(tab) {
  const view = $('#view');
  if (!view) return null;
  const current = view.querySelector('.tab-pane');
  if (current?.dataset.pane === tab) return current;

  const cachedTarget = app.tabCache instanceof Map ? app.tabCache.get(tab) : null;
  app.tabCache?.delete(tab);
  if (current) {
    current.remove();
    app.tabCache.clear();
    app.tabCache.set(current.dataset.pane, current);
  }

  const pane = cachedTarget || createTabPane(tab);
  view.replaceChildren(pane);
  return pane;
}

function tabHtml(tab) {
  if (tab === 'home') return homeView();
  if (tab === 'games') return gamesView();
  if (tab === 'territory') return territoryViewPage();
  if (tab === 'social') return socialView();
  return recordsView();
}

function updateAppChrome() {
  $$('.nav-item').forEach((button) => button.classList.toggle('active', button.dataset.tab === app.tab));
  const onlineCount = $('#online-count');
  if (onlineCount) onlineCount.textContent = app.data?.onlineCount || 0;
  const unread = (app.data?.notifications ?? []).filter((item) => !item.read).length;
  const badge = $('#notification-badge');
  if (badge) {
    badge.textContent = unread;
    badge.classList.toggle('hidden', unread === 0);
  }
}

function renderTab(tab, { force = false } = {}) {
  if (!app.data || !MAIN_TABS.includes(tab)) return;
  const pane = $('#view .tab-pane');
  if (pane?.dataset.pane !== tab) return;
  if (!pane) return;
  const alreadyRendered = pane.dataset.rendered === 'true';
  const dirty = app.dirtyTabs instanceof Set && app.dirtyTabs.has(tab);
  if (!force && alreadyRendered && !dirty) return;
  if (tab === 'games' && alreadyRendered && liarComposerIsActive()) {
    refreshLiarChatOnly();
    app.dirtyTabs.add('games');
    return;
  }

  const liarComposer = tab === 'games' ? captureLiarComposerState() : null;
  const liarScroll = tab === 'games' ? captureLiarChatScrollState() : null;
  pane.innerHTML = tabHtml(tab);
  pane.dataset.rendered = 'true';
  pane.dataset.revision = String(app.revision);
  app.dirtyTabs.delete(tab);

  if (tab === 'games') {
    requestAnimationFrame(() => {
      restoreLiarComposerState(liarComposer);
      restoreLiarChatScrollState(liarScroll);
      if (app.tab === 'games') {
        syncOmokBoardSquare();
        syncBlockBattleViewport();
        syncBlockBattleGravity();
      }
    });
  }
}

function scheduleTabRender(tab, { afterPaint = false } = {}) {
  const token = ++app.tabSwitchToken;
  cancelAnimationFrame(app.tabRenderFrame);
  const run = () => {
    app.tabRenderFrame = 0;
    if (!app.data || app.tab !== tab || app.tabSwitchToken !== token) return;
    const pane = $('#view .tab-pane');
    if (!pane || pane.dataset.pane !== tab) return;
    renderTab(tab, { force: pane.dataset.rendered !== 'true' || app.dirtyTabs.has(tab) });
    updateAppChrome();
  };
  app.tabRenderFrame = requestAnimationFrame(() => {
    if (afterPaint) app.tabRenderFrame = requestAnimationFrame(run);
    else run();
  });
}

function render() {
  if (!app.data) return;
  const pane = attachTabPane(app.tab);
  updateAppChrome();
  if (!pane) return;
  if (pane.dataset.rendered !== 'true') renderTab(app.tab, { force: true });
  else if (app.dirtyTabs.has(app.tab)) scheduleTabRender(app.tab);
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
  const foods = app.data.catalog.foods ?? [];
  const level = Number(app.data.dashboard.pet.stats.level) || 1;
  const byTier = new Map();
  for (const food of foods) {
    const row = byTier.get(Number(food.tier)) ?? {};
    row[food.category] = food;
    byTier.set(Number(food.tier), row);
  }
  const effectText = (body) => body > 0 ? `몸집 +${body}` : body < 0 ? `몸집 ${body}` : '몸집 변화 없음';
  const card = (food) => {
    if (!food) return '<div class="food-card missing"></div>';
    const locked = level < Number(food.minLevel || food.tier || 1);
    return `<article class="food-card food-${esc(food.category)} ${locked ? 'locked' : ''}"><span class="food-tier">${food.tier}단계</span><strong>${esc(food.name)}</strong><small>배고픔 +${food.hunger}</small><small>${esc(effectText(Number(food.body) || 0))}</small><button class="primary" data-action="eat" data-id="${esc(food.id)}" type="button" ${locked ? 'disabled' : ''}>${locked ? `Lv.${food.minLevel}` : points(food.price)}</button></article>`;
  };
  const rows = [...byTier.entries()].sort((a, b) => a[0] - b[0]).map(([, row]) => `<div class="food-tier-row">${card(row.gain)}${card(row.maintain)}${card(row.diet)}</div>`).join('');
  openModal(`${modalHeader('음식 먹이기', `현재 Lv.${level} · 보유 포인트 ${points(app.data.dashboard.pet.stats.points)}`)}<div class="food-column-heads"><b>살찌는 음식</b><b>유지 음식</b><b>다이어트 음식</b></div><div class="food-matrix">${rows}</div><p class="helper centered">레벨이 오르면 같은 줄의 다음 단계 음식 3종이 함께 해금됩니다.</p>`, { type: 'food' });
}

function shopTimeLabel(value) {
  return value ? `${dateText(value)}까지` : '';
}

function shopActionFor(item, shop) {
  if (item.id === 'nickname24h') {
    return shop.temporaryNickname
      ? `<button class="primary" type="button" disabled>사용 중</button>`
      : `<button class="primary" data-action="nickname-ticket" type="button">${points(item.price)}</button>`;
  }
  if (item.id === 'lottery') {
    const plays = Number(shop.lotteryPlays || 0);
    const maxPlays = Math.max(1, Number(shop.lotteryMaxPlays || item.maxPlays || 3));
    if (plays >= maxPlays) return '<button class="primary" type="button" disabled>오늘 완료</button>';
    return `<button class="primary" data-action="buy-shop" data-id="lottery" type="button">${points(shop.lotteryNextPrice ?? item.price)}</button>`;
  }
  if (item.id === 'staminaHour' && shop.effects?.staminaFullUntil) return '<button class="primary" type="button" disabled>사용 중</button>';
  if (item.id === 'hungerHour' && shop.effects?.hungerFullUntil) return '<button class="primary" type="button" disabled>사용 중</button>';
  return `<button class="primary" data-action="buy-shop" data-id="${esc(item.id)}" type="button">${points(item.price)}</button>`;
}

function shopStatusFor(item, shop) {
  if (item.id === 'miniGame10' && Number(shop.miniGameBonus) > 0) return `이번 게임 하루 추가 +${shop.miniGameBonus}회 · 총 ${shop.miniGamesLimit}회`;
  if (item.id === 'fishing5' && Number(shop.fishingBonus) > 0) return `이번 게임 하루 추가 +${shop.fishingBonus}회 · 총 ${shop.fishingLimit}회`;
  if (item.id === 'nickname24h' && shop.temporaryNickname) return `${esc(shop.temporaryNickname.nickname)} · ${shopTimeLabel(shop.temporaryNickname.expiresAt)}`;
  if (item.id === 'lottery' && shop.lastLotteryResult) return `오늘 ${shop.lotteryPlays}/${shop.lotteryMaxPlays || item.maxPlays || 3}회 · 최근 ${shop.lastLotteryResult.prize ? points(shop.lastLotteryResult.prize) : '꽝'}`;
  if (item.id === 'staminaHour' && shop.effects?.staminaFullUntil) return `체력 100% · ${shopTimeLabel(shop.effects.staminaFullUntil)}`;
  if (item.id === 'hungerHour' && shop.effects?.hungerFullUntil) return `배고픔 100% · ${shopTimeLabel(shop.effects.hungerFullUntil)}`;
  return '';
}

function openShop() {
  const items = app.data?.catalog?.shopItems ?? [];
  const flexItems = app.data?.catalog?.flexItems ?? [];
  const shop = app.data?.dashboard?.shop ?? {};
  const cards = items.map((item) => {
    const status = shopStatusFor(item, shop);
    return `<article class="shop-card"><span class="shop-icon" aria-hidden="true">${esc(item.icon)}</span><div><strong>${esc(item.name)}</strong><p>${esc(item.description)}</p>${status ? `<small>${status}</small>` : ''}</div>${shopActionFor(item, shop)}</article>`;
  }).join('');
  const activeFlex = shop.flexItem;
  const activeCard = activeFlex
    ? `<div class="active-flex-card">${flexItemImage(activeFlex, { shop: true })}<div><small>현재 장착</small><strong>${esc(activeFlex.name)}</strong><span>${dateText(activeFlex.expiresAt)}까지</span></div></div>`
    : '<div class="active-flex-card empty-flex"><div><small>현재 장착</small><strong>장착한 아이템 없음</strong><span>아이템은 구매 즉시 24시간 동안 표시됩니다.</span></div></div>';
  const flexCards = flexItems.map((item) => `<article class="flex-shop-card flex-tier-${Math.max(1, Number(item.tier) || 1)}">${flexItemImage(item, { shop: true })}<div><strong>${esc(item.name)}</strong><p>${esc(item.description)}</p><small>24시간 장착</small></div><button class="primary" data-action="buy-flex" data-id="${esc(item.id)}" type="button">${points(item.price)}</button></article>`).join('');
  openModal(`${modalHeader('상점', `보유 포인트 ${points(app.data.dashboard.pet.stats.points)}`)}<h3 class="shop-section-title">기능 상품</h3><div class="shop-grid">${cards}</div><p class="helper centered">구매와 지급은 서버에서 한 번만 처리됩니다. 횟수권과 복권은 한국시간 00·06·12·18시 초기화 기준입니다.</p><div class="shop-section-divider"></div><h3 class="shop-section-title">플렉스 아이템</h3><p class="helper">능력치 효과 없이 내 레고·온라인 목록·주민목록·프로필에 24시간 표시됩니다. 동시에 1개만 장착할 수 있습니다.</p>${activeCard}<div class="flex-shop-grid">${flexCards}</div>`, { type: 'shop' });
}

function openNicknameTicket() {
  const original = app.data?.dashboard?.user?.nickname ?? '';
  openModal(`${modalHeader('24시간 닉변권', `500P · 만료 후 ${original}(으)로 자동 복귀`)}<form id="nickname-ticket-form" class="stack-form"><label>임시 닉네임<input name="nickname" maxlength="12" autocomplete="off" placeholder="2~12자" required></label><p class="warning-box">이미 사용 중인 닉네임은 쓸 수 없습니다. 로그인할 때는 기존 닉네임을 그대로 사용합니다.</p><button class="primary wide" type="submit">500P로 적용</button><button class="ghost wide" data-action="open-shop" type="button">상점으로 돌아가기</button></form>`, { type: 'nicknameTicket' });
  requestAnimationFrame(() => $('#nickname-ticket-form input')?.focus());
}

async function buyShopItem(itemId, extra = {}) {
  const requestId = crypto.randomUUID?.() || `shop-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return perform('/api/shop/purchase', { itemId, requestId, ...extra }, null, 'POST', { renderMode: 'shop' });
}

async function buyFlexItem(itemId) {
  const item = (app.data?.catalog?.flexItems ?? []).find((entry) => entry.id === itemId);
  if (!item) return null;
  const active = app.data?.dashboard?.shop?.flexItem;
  if (active) {
    const same = active.id === item.id;
    const question = same
      ? `${item.name}을 다시 구매하면 남은 시간이 사라지고 지금부터 24시간으로 갱신됩니다. ${points(item.price)}로 구매할까요?`
      : `${active.name}의 남은 시간이 사라지고 ${item.name}(으)로 즉시 교체됩니다. ${points(item.price)}로 구매할까요?`;
    if (!confirm(question)) return null;
  } else if (!confirm(`${item.name}을 ${points(item.price)}로 구매해 24시간 장착할까요?`)) return null;
  return buyShopItem(itemId);
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
    const coupleLabel = profile.coupleLabel || (profile.partnerPetId ? `${profile.partnerDisplayName || '상대'}와 커플 D+${profile.coupleDay}` : '솔로');
    openModal(`${modalHeader('레고 프로필', coupleLabel)}<div class="profile-detail${flexProfileClass(profile)}">${workoutBadgeHtml(profile)}${avatar(stage, { flexItem: profile.flexItem })}<strong class="profile-title flex-display-name">${esc(profile.displayName)}</strong>${seasonBadgesHtml(profile)}${flexItemStatus(profile.flexItem)}<button class="body-stage-profile-link" data-action="body-guide" data-body="${profile.stats.body}" type="button">${esc(stage.label)} · 몸집 ${profile.stats.body} · 단계 보기</button>${profile.statusMessage ? `<p class="profile-status-detail">${esc(profile.statusMessage)}</p>` : ''}<div class="metric-grid">${compactMetric('포인트', points(profile.stats.points))}${compactMetric('레벨', `Lv.${profile.stats.level}`)}${compactMetric('레고력', `${profile.stats.legoPower}`)}${compactMetric('몸집', `${profile.stats.body}`)}${compactMetric('경고', `${profile.warnings}회`)}${compactMetric('상태', coupleLabel)}</div>${relationshipActions}</div>`, { type: 'profile', petId });
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

function appleBoardKey(challenge) {
  return `${challenge?.id || 'apple'}:${Math.max(1, Number(challenge?.appleBoardsGenerated) || 1)}`;
}

function appleRefreshOfferHtml(challenge) {
  const moves = Number(challenge?.appleAvailableMoves);
  if (!Number.isInteger(moves) || moves <= 0 || moves > 5 || !challenge?.appleNewBoardAvailable) return '';
  const key = appleBoardKey(challenge);
  const dismissed = app.appleNewBoardDismissedKey === key;
  if (dismissed) {
    return `<div class="apple-refresh-compact"><span>🍎 가능한 합10 영역 ${moves}개 남음</span><button class="soft-button" data-action="apple-new-board" type="button">새 판 받기</button></div>`;
  }
  return `<div class="apple-refresh-offer"><div><strong>🍎 가능한 합10 영역이 ${moves}개 남았습니다.</strong><p>새로운 10×10 판으로 변경하시겠습니까? 남은 시간·점수·획득 예정 포인트는 그대로 이어집니다.</p></div><div class="button-row"><button class="primary" data-action="apple-new-board" type="button">새 판 받기</button><button class="ghost" data-action="apple-keep-board" type="button">계속하기</button></div></div>`;
}

const BLOCK_COLOR_NAMES = ['빨강', '파랑', '노랑', '초록', '보라'];

function blockCellHtml(value, rowIndex, colIndex, version) {
  if (value == null) return '<span class="block-cell block-empty-cell" aria-hidden="true"></span>';
  const color = Math.max(0, Math.min(4, Number(value) || 0));
  return `<button class="block-cell color-${color}" data-action="block-select" data-row="${rowIndex}" data-col="${colIndex}" data-version="${version}" type="button" aria-label="${BLOCK_COLOR_NAMES[color]} 블록"></button>`;
}

function blockBoardHtml(challenge) {
  const version = Math.max(1, Number(challenge.blockBoardVersion) || 1);
  return (challenge.blockBoard ?? []).map((row, rowIndex) => row.map((value, colIndex) => (
    blockCellHtml(value, rowIndex, colIndex, version)
  )).join('')).join('');
}

function syncBlockGameLayout() {
  if (!app.appleModalActive || app.modal?.gameId !== 'block') return;
  updateVisualViewportVars();
  const modal = $('#modal-content');
  const game = $('.block-game', modal ?? document);
  const board = $('#block-board', game ?? document);
  if (!modal || !game || !board) return;
  const fixed = ['.modal-head', '.block-hud', '.block-rules', '.block-controls', '.block-reward-guide', '.block-helper']
    .map((selector) => $(selector, selector === '.modal-head' ? modal : game));
  const modalStyle = getComputedStyle(modal);
  const verticalPadding = (parseFloat(modalStyle.paddingTop) || 0) + (parseFloat(modalStyle.paddingBottom) || 0);
  const fixedHeight = fixed.reduce((sum, node) => sum + (node?.offsetHeight || 0), 0);
  const availableHeight = Math.max(1, modal.clientHeight - verticalPadding - fixedHeight - 24);
  const width = Math.max(1, Math.floor(Math.min(500, game.clientWidth, availableHeight * (10 / 12))));
  board.style.width = `${width}px`;
  board.style.height = `${Math.floor(width * 1.2)}px`;
}

function openMiniGame(challenge) {
  if (!challenge) return closeModal();
  cleanupAppleBoardUi();
  let content = '';
  if (challenge.gameId === 'oddEven') content = `<div class="mini-center"><div class="game-icon big">🌓</div><h3>${challenge.streak ? `${challenge.streak}연승 중` : '홀일까 짝일까?'}</h3><p>${points(challenge.stake)}는 시작할 때 이미 걸었습니다. 틀리면 전액을 잃습니다.</p><div class="button-row"><button class="primary" data-action="finish-mini" data-value="odd" type="button">홀</button><button class="primary" data-action="finish-mini" data-value="even" type="button">짝</button></div>${challenge.streak > 0 ? `<button class="soft-button wide" data-action="stop-mini" type="button">그만하고 ${points(challenge.pendingPayout)}</button>` : ''}</div>`;
  if (challenge.gameId === 'reaction') content = `<div id="reaction-stage" class="mini-center reaction-stage waiting"><div class="game-icon big">⚡</div><h3 id="reaction-title">아직 누르지 마세요</h3><p id="reaction-guide">PC는 마우스를 버튼 위에 올려두고 <b>초록색으로 바뀌는 순간</b> 클릭하세요.</p><button id="reaction-button" class="reaction-trigger-button" data-action="finish-mini" data-value="1" type="button"><span>대기</span><small>초록색이 되면 클릭!</small></button></div>`;
  if (challenge.gameId === 'number') content = `<div class="mini-center"><div class="game-icon big">🔢</div><h3>1부터 100 사이 숫자</h3><p id="number-attempts">${challenge.attempts || 0}/${challenge.maxAttempts || 5}회 사용</p><form id="number-game-form" class="number-form"><input name="guess" type="number" inputmode="numeric" min="1" max="100" placeholder="숫자를 입력하세요" autocomplete="off" required><button class="primary" type="submit">확인</button></form><p id="number-game-hint" class="helper centered" aria-live="polite"></p><div id="number-guess-history" class="guess-history ${challenge.guesses?.length ? '' : 'hidden'}">입력: ${(challenge.guesses ?? []).join(', ')}</div></div>`;
  if (challenge.gameId === 'apple') content = `<div class="apple-game"><div class="apple-hud"><div><small>남은 시간</small><strong id="apple-countdown">${appleTimeText(challenge)}</strong></div><div><small>게임 점수</small><strong id="apple-score">${Number(challenge.appleScore || 0).toLocaleString('ko-KR')}점</strong></div><div><small>획득 예정</small><strong id="apple-pending">${points(challenge.applePendingPoints || 0)}</strong></div></div><p class="helper apple-rules">사각형 합 10이면 제거 · 2개 +5P · 3개 이상 +6P</p><div id="apple-board" class="apple-board" aria-label="사과게임 10 곱하기 10 숫자판">${appleBoardHtml(challenge)}</div><div id="apple-selection-info" class="apple-selection-info">드래그해서 숫자를 선택하세요.</div><div id="apple-refresh-region">${appleRefreshOfferHtml(challenge)}</div></div>`;
  if (challenge.gameId === 'block') content = `<div class="block-game"><div class="block-hud"><div><small>남은 블록</small><strong id="block-remaining">${Number(challenge.blockRemainingCount || 0)}개</strong></div><div><small>제거 가능 그룹</small><strong id="block-groups">${Number(challenge.blockAvailableGroups || 0)}개</strong></div><div><small>획득 예정</small><strong id="block-pending">${points(challenge.blockPendingPoints || 0)}</strong></div></div><p class="helper block-rules">같은 색 2개 이상 클릭 · 상하좌우만 연결 · 시간제한 없음</p><div class="block-controls"><button id="block-stop-button" class="soft-button wide" data-action="stop-mini" type="button">그만하고 ${points(challenge.blockPendingPoints || 0)} 받기</button></div><div id="block-board" class="block-board" role="grid" aria-label="블록게임 12행 10열 색상판">${blockBoardHtml(challenge)}</div><p id="block-helper" class="block-helper" aria-live="polite">제거한 자리 위의 블록만 아래로 바로 내려옵니다. 좌우로는 움직이지 않습니다.</p><p class="block-reward-guide"><b>포인트</b> 2개 5P · 3개 9P · 4개 13P · 5개 18P · 6개 23P · 7개 29P · 8개 35P · 9개 42P · 10~12개 52P · 13~15개 65P · 16개+ 80P · ALL CLEAR +100P</p></div>`;
  openModal(`${modalHeader(app.data.catalog.miniGames.find((game) => game.id === challenge.gameId)?.name || '미니게임')}${content}`, { type: 'mini', gameId: challenge.gameId });
  scheduleReactionReady(challenge);
  requestAnimationFrame(() => {
    const numberInput = $('#number-game-form input');
    if (numberInput && window.matchMedia?.('(pointer: fine)').matches && Number(navigator.maxTouchPoints || 0) === 0) {
      try { numberInput.focus({ preventScroll: true }); } catch { numberInput.focus(); }
    }
    if (challenge.gameId === 'apple') {
      setupAppleBoardInteractions();
      syncAppleGameLayout();
    }
    if (challenge.gameId === 'block') syncBlockGameLayout();
  });
}

function cleanupAppleBoardUi() {
  if (app.appleBoardUi?.moveFrame) cancelAnimationFrame(app.appleBoardUi.moveFrame);
  app.appleBoardUi?.abortController?.abort();
  app.appleBoardUi = null;
  document.body.classList.remove('apple-dragging');
}

function syncAppleGameLayout() {
  if (!app.appleModalActive) return;
  updateVisualViewportVars();
  const modal = $('#modal-content');
  const game = $('.apple-game', modal ?? document);
  const board = $('#apple-board', game ?? document);
  if (!modal || !game || !board) return;
  const header = $('.modal-head', modal);
  const hud = $('.apple-hud', game);
  const rules = $('.apple-rules', game);
  const selection = $('#apple-selection-info', game);
  const refresh = $('#apple-refresh-region', game);
  const modalStyle = getComputedStyle(modal);
  const verticalPadding = (parseFloat(modalStyle.paddingTop) || 0) + (parseFloat(modalStyle.paddingBottom) || 0);
  const fixedHeight = [header, hud, rules, selection, refresh].reduce((sum, node) => sum + (node?.offsetHeight || 0), 0);
  const availableHeight = modal.clientHeight - verticalPadding - fixedHeight - 34;
  const availableWidth = Math.max(1, game.clientWidth);
  const size = Math.max(1, Math.floor(Math.min(560, availableWidth, Math.max(1, availableHeight))));
  board.style.width = `${size}px`;
  board.style.height = `${size}px`;
}

function buildApplePrefix(values, countMode = false) {
  const prefix = Array.from({ length: 11 }, () => Array(11).fill(0));
  for (let row = 0; row < 10; row += 1) {
    for (let col = 0; col < 10; col += 1) {
      const value = values[row]?.[col];
      const amount = value == null ? 0 : countMode ? 1 : Number(value) || 0;
      prefix[row + 1][col + 1] = amount + prefix[row][col + 1] + prefix[row + 1][col] - prefix[row][col];
    }
  }
  return prefix;
}

function applePrefixRect(prefix, minRow, minCol, maxRow, maxCol) {
  return prefix[maxRow + 1][maxCol + 1] - prefix[minRow][maxCol + 1] - prefix[maxRow + 1][minCol] + prefix[minRow][minCol];
}

function measureAppleBoard(board) {
  const rect = board.getBoundingClientRect();
  const width = Math.max(1, board.clientWidth || rect.width);
  const height = Math.max(1, board.clientHeight || rect.height);
  return { left: rect.left + Math.max(0, (rect.width - width) / 2), top: rect.top + Math.max(0, (rect.height - height) / 2), width, height };
}

function appleCellFromPoint(clientX, clientY, layout) {
  if (!layout?.width || !layout?.height) return null;
  const x = Math.max(0, Math.min(layout.width - 0.001, clientX - layout.left));
  const y = Math.max(0, Math.min(layout.height - 0.001, clientY - layout.top));
  return { row: Math.floor((y / layout.height) * 10), col: Math.floor((x / layout.width) * 10) };
}

function clearAppleSelection(ui = app.appleBoardUi) {
  if (!ui) return;
  for (const index of ui.selected) ui.cells[index]?.classList.remove('selected');
  ui.selected.clear();
  ui.lastBoundsKey = null;
  ui.selection = { sum: 0, count: 0 };
  const info = $('#apple-selection-info');
  if (info) info.textContent = '드래그해서 숫자를 선택하세요.';
}

function paintAppleSelection(start, end, ui = app.appleBoardUi) {
  if (!ui) return;
  const minRow = Math.min(start.row, end.row), maxRow = Math.max(start.row, end.row);
  const minCol = Math.min(start.col, end.col), maxCol = Math.max(start.col, end.col);
  const boundsKey = `${minRow}:${minCol}:${maxRow}:${maxCol}`;
  if (boundsKey === ui.lastBoundsKey) return;
  ui.lastBoundsKey = boundsKey;

  const next = new Set();
  for (let row = minRow; row <= maxRow; row += 1) {
    for (let col = minCol; col <= maxCol; col += 1) next.add(row * 10 + col);
  }
  for (const index of ui.selected) if (!next.has(index)) ui.cells[index]?.classList.remove('selected');
  for (const index of next) if (!ui.selected.has(index)) ui.cells[index]?.classList.add('selected');
  ui.selected = next;

  const sum = applePrefixRect(ui.sumPrefix, minRow, minCol, maxRow, maxCol);
  const count = applePrefixRect(ui.countPrefix, minRow, minCol, maxRow, maxCol);
  ui.selection = { sum, count };
  const info = $('#apple-selection-info');
  if (info) info.textContent = `선택 ${count}개 · 합 ${sum}${sum === 10 ? ' · 제거 가능!' : ''}`;
}

async function submitAppleSelection(start, end, boardGeneration) {
  const challenge = app.data?.activeMiniChallenge;
  if (!challenge || challenge.gameId !== 'apple' || app.busy) return;
  const finishedChallenge = structuredClone(challenge);
  const requestId = crypto.randomUUID?.() || `apple-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const result = await perform('/api/minigames/apple/select', {
    challengeId: challenge.id, startRow: start.row, startCol: start.col, endRow: end.row, endCol: end.col, boardGeneration, requestId
  }, null, 'POST', { renderMode: 'apple', toastDuration: 900, toastType: 'game-start' });
  if (result?.finished) openMiniResult(result, finishedChallenge, { previousBest: Number(app.data?.dashboard?.pet?.records?.appleBestScore || 0) });
}

function preventAppleBoardTouchScroll(event) {
  if (event.cancelable) event.preventDefault();
}

function setupAppleBoardInteractions() {
  const board = $('#apple-board');
  if (!board) return;
  const challenge = app.data?.activeMiniChallenge;
  if (!challenge || challenge.gameId !== 'apple') return;
  const values = (challenge.appleBoard ?? []).map((row) => [...row]);
  const ui = {
    challengeId: challenge.id,
    boardGeneration: Number(challenge.appleBoardsGenerated || 1),
    board,
    cells: [...board.children],
    values,
    sumPrefix: buildApplePrefix(values),
    countPrefix: buildApplePrefix(values, true),
    selected: new Set(),
    lastBoundsKey: null,
    drag: null,
    pendingPoint: null,
    moveFrame: 0,
    layout: null,
    selection: { sum: 0, count: 0 },
    abortController: new AbortController()
  };
  app.appleBoardUi = ui;
  // iOS/Android에서 숫자판 드래그가 페이지 스크롤로 전달되지 않도록 비수동 touchmove를 명시한다.
  board.addEventListener('touchmove', preventAppleBoardTouchScroll, { passive: false });

  const begin = (clientX, clientY, pointerId, event) => {
    if (app.busy || ui.drag) return;
    ui.layout = measureAppleBoard(board);
    const cell = appleCellFromPoint(clientX, clientY, ui.layout);
    if (!cell) return;
    if (event?.cancelable) event.preventDefault();
    document.body.classList.add('apple-dragging');
    ui.drag = { pointerId, start: cell, end: cell, boardGeneration: ui.boardGeneration };
    paintAppleSelection(ui.drag.start, ui.drag.end, ui);
  };
  const move = (clientX, clientY, pointerId, event) => {
    if (!ui.drag || ui.drag.pointerId !== pointerId) return;
    if (event?.cancelable) event.preventDefault();
    ui.pendingPoint = { clientX, clientY };
    if (ui.moveFrame) return;
    ui.moveFrame = requestAnimationFrame(() => {
      ui.moveFrame = 0;
      if (!ui.drag || !ui.pendingPoint) return;
      const cell = appleCellFromPoint(ui.pendingPoint.clientX, ui.pendingPoint.clientY, ui.layout);
      ui.pendingPoint = null;
      if (!cell || (cell.row === ui.drag.end.row && cell.col === ui.drag.end.col)) return;
      ui.drag.end = cell;
      paintAppleSelection(ui.drag.start, ui.drag.end, ui);
    });
  };
  const finish = (clientX, clientY, pointerId, event) => {
    if (!ui.drag || ui.drag.pointerId !== pointerId) return;
    if (event?.cancelable) event.preventDefault();
    if (ui.moveFrame) cancelAnimationFrame(ui.moveFrame);
    ui.moveFrame = 0;
    const cell = appleCellFromPoint(clientX, clientY, ui.layout);
    if (cell) ui.drag.end = cell;
    // move 프레임이 실행되기 전에 손을 떼도 pointerup의 최종 칸으로 합계를 다시 계산한다.
    paintAppleSelection(ui.drag.start, ui.drag.end, ui);
    const finalDrag = ui.drag;
    ui.drag = null;
    ui.pendingPoint = null;
    document.body.classList.remove('apple-dragging');
    if (ui.selection.sum !== 10 || ui.selection.count <= 0) {
      toast(`합이 ${ui.selection.sum}이라 제거되지 않았습니다.`, 'error', 900);
      clearAppleSelection(ui);
      return;
    }
    submitAppleSelection(finalDrag.start, finalDrag.end, finalDrag.boardGeneration);
  };
  const cancel = () => {
    if (ui.moveFrame) cancelAnimationFrame(ui.moveFrame);
    ui.moveFrame = 0;
    ui.drag = null;
    ui.pendingPoint = null;
    document.body.classList.remove('apple-dragging');
    clearAppleSelection(ui);
  };

  if ('PointerEvent' in window) {
    board.addEventListener('pointerdown', (event) => {
      if (event.isPrimary === false || (event.pointerType === 'mouse' && event.button !== 0)) return;
      begin(event.clientX, event.clientY, event.pointerId, event);
      if (ui.drag) try { board.setPointerCapture(event.pointerId); } catch { /* ignore */ }
    });
    board.addEventListener('pointermove', (event) => move(event.clientX, event.clientY, event.pointerId, event));
    board.addEventListener('pointerup', (event) => {
      finish(event.clientX, event.clientY, event.pointerId, event);
      try { board.releasePointerCapture(event.pointerId); } catch { /* ignore */ }
    });
    board.addEventListener('pointercancel', cancel);
  } else {
    board.addEventListener('touchstart', (event) => {
      const touch = event.changedTouches?.[0];
      if (touch) begin(touch.clientX, touch.clientY, `touch-${touch.identifier}`, event);
    }, { passive: false });
    board.addEventListener('touchmove', (event) => {
      const touch = Array.from(event.changedTouches ?? []).find((item) => ui.drag?.pointerId === `touch-${item.identifier}`);
      if (touch) move(touch.clientX, touch.clientY, `touch-${touch.identifier}`, event);
    }, { passive: false });
    board.addEventListener('touchend', (event) => {
      const touch = Array.from(event.changedTouches ?? []).find((item) => ui.drag?.pointerId === `touch-${item.identifier}`);
      if (touch) finish(touch.clientX, touch.clientY, `touch-${touch.identifier}`, event);
    }, { passive: false });
    board.addEventListener('touchcancel', cancel, { passive: false });
    board.addEventListener('mousedown', (event) => {
      if (event.button !== 0) return;
      begin(event.clientX, event.clientY, 'mouse', event);
    });
    window.addEventListener('mousemove', (event) => move(event.clientX, event.clientY, 'mouse', event), { signal: ui.abortController?.signal });
    window.addEventListener('mouseup', (event) => finish(event.clientX, event.clientY, 'mouse', event), { signal: ui.abortController?.signal });
  }
}

function refreshAppleMiniOnly(result = null) {
  const challenge = app.data?.activeMiniChallenge;
  if (app.modal?.type !== 'mini' || !challenge || challenge.gameId !== 'apple') return false;
  const ui = app.appleBoardUi;
  if (!ui || ui.challengeId !== challenge.id || !document.contains(ui.board)) {
    openMiniGame(challenge);
    return true;
  }
  const nextValues = (result?.board ?? challenge.appleBoard ?? []).map((row) => [...row]);
  const nextGeneration = Number(challenge.appleBoardsGenerated || result?.boardsGenerated || 1);
  for (let row = 0; row < 10; row += 1) {
    for (let col = 0; col < 10; col += 1) {
      if (ui.boardGeneration === nextGeneration && ui.values[row]?.[col] === nextValues[row]?.[col]) continue;
      const index = row * 10 + col;
      const cell = ui.cells[index];
      const value = nextValues[row]?.[col] ?? null;
      if (!cell) continue;
      cell.textContent = value == null ? '' : String(value);
      cell.classList.toggle('removed', value == null);
    }
  }
  ui.values = nextValues;
  ui.boardGeneration = nextGeneration;
  ui.sumPrefix = buildApplePrefix(nextValues);
  ui.countPrefix = buildApplePrefix(nextValues, true);
  clearAppleSelection(ui);
  const score = $('#apple-score');
  const pending = $('#apple-pending');
  const refreshRegion = $('#apple-refresh-region');
  if (score) score.textContent = `${Number(challenge.appleScore || result?.score || 0).toLocaleString('ko-KR')}점`;
  if (pending) pending.textContent = points(challenge.applePendingPoints ?? result?.pendingPoints ?? 0);
  if (refreshRegion) refreshRegion.innerHTML = appleRefreshOfferHtml(challenge);
  requestAnimationFrame(syncAppleGameLayout);
  return true;
}

function refreshBlockMiniOnly(result = null) {
  if (app.modal?.type !== 'mini' || app.modal?.gameId !== 'block') return false;
  if (result?.finished) return true;
  const challenge = app.data?.activeMiniChallenge;
  const board = $('#block-board');
  if (!challenge || challenge.gameId !== 'block' || !board || board.children.length !== 120) return false;
  const nextBoard = result?.board ?? challenge.blockBoard;
  if (!Array.isArray(nextBoard) || nextBoard.length !== 12 || nextBoard.some((row) => !Array.isArray(row) || row.length !== 10)) return false;
  const version = Math.max(1, Number(result?.boardVersion ?? challenge.blockBoardVersion) || 1);
  for (let row = 0; row < 12; row += 1) {
    for (let col = 0; col < 10; col += 1) {
      const index = row * 10 + col;
      const value = nextBoard[row][col];
      const current = board.children[index];
      const shouldBeButton = value != null;
      if (!current || (current.tagName === 'BUTTON') !== shouldBeButton) {
        const template = document.createElement('template');
        template.innerHTML = blockCellHtml(value, row, col, version);
        current?.replaceWith(template.content.firstElementChild);
        continue;
      }
      if (!shouldBeButton) continue;
      const color = Math.max(0, Math.min(4, Number(value) || 0));
      current.className = `block-cell color-${color}`;
      current.dataset.version = String(version);
      current.setAttribute('aria-label', `${BLOCK_COLOR_NAMES[color]} 블록`);
    }
  }
  const remaining = $('#block-remaining');
  const groups = $('#block-groups');
  const pending = $('#block-pending');
  const stop = $('#block-stop-button');
  const helper = $('#block-helper');
  const pendingPoints = Math.max(0, Number(result?.pendingPoints ?? challenge.blockPendingPoints) || 0);
  if (remaining) remaining.textContent = `${Math.max(0, Number(result?.remainingCount ?? challenge.blockRemainingCount) || 0)}개`;
  if (groups) groups.textContent = `${Math.max(0, Number(result?.availableGroups ?? challenge.blockAvailableGroups) || 0)}개`;
  if (pending) pending.textContent = points(pendingPoints);
  if (stop) stop.textContent = `그만하고 ${points(pendingPoints)} 받기`;
  if (helper) helper.textContent = result?.message || '제거한 자리 위의 블록만 아래로 바로 내려옵니다. 좌우로는 움직이지 않습니다.';
  requestAnimationFrame(syncBlockGameLayout);
  return true;
}

function numberGuessInputIsActive() {
  const input = $('#number-game-form input[name="guess"]');
  return Boolean(app.modal?.type === 'mini' && app.modal?.gameId === 'number' && input && document.activeElement === input);
}

function refreshNumberMiniOnly(result = null) {
  const challenge = app.data?.activeMiniChallenge;
  if (app.modal?.type !== 'mini' || app.modal?.gameId !== 'number' || !challenge || challenge.gameId !== 'number' || result?.finished) return false;
  const form = $('#number-game-form');
  const input = $('input[name="guess"]', form ?? document);
  const attempts = $('#number-attempts');
  const hint = $('#number-game-hint');
  const history = $('#number-guess-history');
  if (!form || !input || !attempts || !history) return false;
  const modal = $('#modal-content');
  const scrollTop = modal?.scrollTop ?? 0;
  attempts.textContent = `${Number(challenge.attempts || 0)}/${Number(challenge.maxAttempts || 5)}회 사용`;
  history.textContent = `입력: ${(challenge.guesses ?? []).join(', ')}`;
  history.classList.toggle('hidden', !(challenge.guesses?.length));
  if (hint) hint.textContent = result?.message ?? '';
  input.value = '';
  if (modal) modal.scrollTop = scrollTop;
  return true;
}

function openCreateOmok() {
  const balance = Math.max(0, Number(app.data?.dashboard?.pet?.stats?.points) || 0);
  openModal(`${modalHeader('오목방 만들기', `보유 포인트 ${points(balance)}`)}<form id="omok-create-form" class="stack-form"><label>판돈<select name="preset" id="omok-stake-preset"><option value="100">100P</option><option value="500">500P</option><option value="1000">1,000P</option><option value="2000">2,000P</option><option value="3000">3,000P</option><option value="custom">직접 입력</option></select></label><label id="omok-custom-stake-wrap" class="hidden">직접 입력<input name="customStake" type="number" inputmode="numeric" min="1000" step="1000" placeholder="4,000 / 5,000 / ..."></label><p class="warning-box">100P, 500P 또는 1,000P 이상 1,000P 단위만 가능합니다. 상대가 참가해 게임이 확정될 때 양쪽 판돈이 서버에서 함께 확보됩니다.</p><button class="primary wide" type="submit">방 만들기</button></form>`, { type: 'omokCreate' });
  requestAnimationFrame(() => {
    const preset = $('#omok-stake-preset');
    preset?.addEventListener('change', () => $('#omok-custom-stake-wrap')?.classList.toggle('hidden', preset.value !== 'custom'));
  });
}

function openCreateBlockBattle() {
  const balance = Math.max(0, Number(app.data?.dashboard?.pet?.stats?.points) || 0);
  const options = (app.data?.blockBattle?.stakes || [100, 500, 1000]).map((stake) => `<option value="${stake}">${Number(stake).toLocaleString('ko-KR')}P</option>`).join('');
  openModal(`${modalHeader('테트리스대전 방 만들기', `보유 포인트 ${points(balance)}`)}<form id="block-battle-create-form" class="stack-form"><label>판돈<select name="stakePoints">${options}</select></label><p class="warning-box">상대가 참가해 대전이 확정될 때 양쪽에서 같은 판돈을 한 번만 보관합니다. 승자는 두 사람의 판돈 전액을 받습니다.</p><button class="primary wide" type="submit">방 만들기</button></form>`, { type: 'blockBattleCreate' });
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

function adminMembersHtml(admin = app.data?.admin) {
  return (admin?.members ?? []).map((member) => {
    const petControls = member.hasActivePet !== false
      ? `<button class="admin-point-give" data-action="admin-points" data-id="${member.petId}" data-name="${esc(member.displayName)}" data-value="1" type="button">포인트+</button><button class="admin-point-take" data-action="admin-points" data-id="${member.petId}" data-name="${esc(member.displayName)}" data-value="-1" type="button">포인트-</button><button data-action="admin-warning" data-id="${member.petId}" data-value="1" type="button">경고+</button><button data-action="admin-warning" data-id="${member.petId}" data-value="-1" type="button">경고-</button><button data-action="admin-reset-user" data-id="${member.petId}" type="button">상태 초기화</button><button class="danger-button" data-action="admin-kick" data-id="${member.petId}" type="button">강퇴</button>`
      : '';
    const summary = member.hasActivePet === false
      ? '가입 계정은 존재하지만 현재 레고 데이터가 없습니다.'
      : `Lv.${member.level} · ${points(member.points)} · 일반 경고 ${member.warnings} · 누적 ${member.warningTotal}`;
    const workoutControl = `<button class="${member.workoutBadge ? 'warning-button' : 'soft-button'}" data-action="admin-workout-badge" data-user-id="${esc(member.userId)}" data-enabled="${member.workoutBadge ? 'false' : 'true'}" type="button">${member.workoutBadge ? '💪 뱃지 해제' : '💪 운동방 뱃지'}</button>`;
    return `<article class="admin-member" data-admin-user-id="${esc(member.userId)}"><div><strong>${esc(member.displayName)}${member.isSelf ? ' <span class="admin-self-badge">내 계정</span>' : ''}${member.workoutBadge ? ' <span class="admin-workout-label">💪 운동방</span>' : ''}</strong><small>${summary}</small></div><div class="admin-buttons">${workoutControl}${petControls}${member.isSelf ? '' : `<button class="danger-button admin-delete-account" data-action="admin-delete-account" data-user-id="${member.userId}" type="button">계정 삭제</button>`}</div></article>`;
  }).join('') || '<div class="empty">회원이 없습니다.</div>';
}

async function refreshAdminMembers(button) {
  if (app.modal?.type !== 'admin' || !app.data?.admin?.isAdmin) return;
  const modal = $('#modal-content');
  const list = $('#admin-member-list');
  if (!modal || !list) return;
  const scrollTop = modal.scrollTop;
  const originalText = button?.textContent || '회원 목록 새로고침';
  if (button) { button.disabled = true; button.textContent = '새로고침 중…'; }
  try {
    const result = await api('/api/bootstrap');
    applyBootstrap(result.bootstrap);
    if (app.modal?.type !== 'admin') return;
    list.innerHTML = adminMembersHtml(app.data.admin);
    modal.scrollTop = scrollTop;
    if (button) button.textContent = '새로고침 완료';
    setTimeout(() => { if (button && document.contains(button)) button.textContent = originalText; }, 900);
  } catch (error) {
    modal.scrollTop = scrollTop;
    toast(error.message, 'error');
    if (button) button.textContent = originalText;
  } finally {
    if (button && document.contains(button)) button.disabled = false;
  }
}

function openAdmin() {
  const admin = app.data.admin;
  const members = adminMembersHtml(admin);
  const activeBungs = (admin.activeBungs ?? []).map((bung) => `<article class="admin-bung"><div><strong>${esc(bung.title)}</strong><small>${esc(bung.hostDisplayName)} · ${bung.status === 'live' ? '진행 중' : '모집 중'} · ${Number(bung.attendeeCount || 0)}명 · 개설 ${points(bung.stakePoints)}</small></div><button class="danger-button" data-action="admin-force-bung" data-id="${esc(bung.id)}" data-name="${esc(bung.title)}" type="button">벙 강제취소</button></article>`).join('');
  const chats = admin.liarChats.map((chat) => `<article class="admin-chat" data-admin-chat-id="${esc(chat.id)}"><div><strong>${esc(chat.displayName)}</strong><p>${esc(chat.text)}</p><small>${dateText(chat.createdAt)}</small></div><button class="danger-button" data-action="admin-delete-liar-chat" data-id="${chat.id}" type="button">삭제</button></article>`).join('');
  const auditLogs = (admin.auditLogs ?? []).map((entry) => {
    let detail = '';
    if (entry.action === 'account_delete') detail = `${esc(entry.adminDisplayName)} → ${esc(entry.targetDisplayName)} 계정 삭제`;
    else if (entry.action === 'bung_force_cancel') detail = `${esc(entry.adminDisplayName)} → ${esc(entry.targetDisplayName)} 벙 강제취소`;
    else if (entry.action === 'workout_badge') detail = `${esc(entry.adminDisplayName)} → ${esc(entry.targetDisplayName)} ${esc(entry.detail || '💪 운동방 뱃지 변경')}`;
    else if (entry.action === 'state_reset') detail = `${esc(entry.adminDisplayName)} → ${esc(entry.targetDisplayName)} 상태 초기화`;
    else if (entry.action === 'omok_clear_ended') detail = `${esc(entry.adminDisplayName)} → 종료된 오목방 비우기`;
    else detail = `${esc(entry.adminDisplayName)} → ${esc(entry.targetDisplayName)} ${Number(entry.delta) >= 0 ? '지급' : '회수'} ${points(Math.abs(Number(entry.delta) || 0))}`;
    const balance = entry.action === 'point_adjust' && Number.isFinite(Number(entry.before)) && Number.isFinite(Number(entry.after)) ? ` · ${points(entry.before)} → ${points(entry.after)}` : '';
    const extra = entry.detail ? ` · ${esc(entry.detail)}` : '';
    return `<article class="admin-audit"><div><strong>${detail}</strong><small>${dateText(entry.createdAt)}${balance}${extra}</small></div></article>`;
  }).join('');
  openModal(`${modalHeader('운영자 관리', `내 User ID: ${admin.userId}`)}<div class="admin-top"><button class="ghost wide" data-action="admin-refresh" type="button">회원 목록 새로고침</button><button class="warning-button wide" data-action="admin-force-liar" type="button">진행 중 라이어게임 강제 종료</button><button class="soft-button wide" data-action="admin-clear-ended-omok" type="button">종료된 오목방 비우기 (${Number(admin.endedOmokRooms || 0)})</button></div><h3>회원 관리</h3><p class="helper">회원별 💪 운동방 뱃지를 부여·해제할 수 있습니다. 포인트+ / 포인트-로 회원 포인트를 직접 지급하거나 회수할 수 있습니다. 포인트는 0P 아래로 내려가지 않습니다. 계정 삭제는 회원가입 정보와 모든 세대 레고 데이터를 제거하며 복구할 수 없습니다.</p><div id="admin-member-list" class="admin-list">${members}</div><h3>벙 관리</h3><p class="helper">벙주가 마감을 하지 않은 벙을 정리하는 기능입니다. 강제취소하면 개설 포인트는 반환되지 않고 참가·개최 레고력과 오늘의 레고력도 지급되지 않습니다.</p><div class="admin-list">${activeBungs || '<div class="empty">강제취소할 진행 중 벙이 없습니다.</div>'}</div><h3>오목방 관리</h3><p class="helper">종료된 방만 비우며 대기·진행 중인 방과 이미 정산된 승패·포인트 기록은 건드리지 않습니다.</p><h3>운영 기록</h3><p class="helper">포인트 지급·회수, 운동방 뱃지 변경, 계정 삭제, 상태 초기화, 벙·오목방 정리 기록을 최근 100개까지 표시합니다.</p><div class="admin-list">${auditLogs || '<div class="empty">아직 운영 기록이 없습니다.</div>'}</div><h3>라이어 채팅 관리</h3><div id="admin-liar-chat-list" class="admin-list">${chats || '<div class="empty">채팅이 없습니다.</div>'}</div>`, { type: 'admin' });
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
  app.reactionReadyPerformanceAt = null;
  if (!challenge || challenge.gameId !== 'reaction') return;
  const delay = Math.max(0, Number(challenge.readyAt || 0) - serverAlignedNow(app.data?.serverTime));
  app.reactionReadyPerformanceAt = performance.now() + delay;
  updateReactionButton();
  if (delay <= 0) return updateReactionButton();
  app.reactionReadyTimer = setTimeout(() => { app.reactionReadyTimer = null; updateReactionButton(); }, delay);
}

async function submitReactionClick() {
  const challenge = app.data?.activeMiniChallenge;
  if (!challenge || challenge.gameId !== 'reaction' || app.busy || app.reactionSubmissionInFlight) return null;
  const clickedPerformanceAt = performance.now();
  const readyPerformanceAt = Number(app.reactionReadyPerformanceAt);
  const clientReactionMs = Number.isFinite(readyPerformanceAt) ? Math.round(clickedPerformanceAt - readyPerformanceAt) : null;
  const clientClickedAt = Number.isFinite(clientReactionMs) ? Math.round(Number(challenge.readyAt || 0) + clientReactionMs) : null;
  const finishedChallenge = structuredClone(challenge);
  app.reactionSubmissionInFlight = true;
  try {
    const result = await perform('/api/minigames/finish', {
      challengeId: challenge.id,
      value: 1,
      clientReactionMs,
      clientClickedAt
    }, null, 'POST', { toastDuration: 700, toastType: 'game-start' });
    if (result?.finished) openMiniResult(result, finishedChallenge);
    return result;
  } finally {
    app.reactionSubmissionInFlight = false;
  }
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
  } else if (gameId === 'block') {
    const removed = Math.max(0, Number(result?.removedCount ?? challenge.blockRemovedCount ?? 0));
    const remaining = Math.max(0, Number(result?.remainingCount ?? challenge.blockRemainingCount ?? 0));
    const moves = Math.max(0, Number(result?.moveCount ?? challenge.blockMoveCount ?? 0));
    const allClear = Boolean(result?.allClear);
    headline = allClear ? 'ALL CLEAR!' : result?.stopped ? '게임을 그만했습니다' : '게임 종료';
    rows = `<div><span>제거한 블록</span><strong>${removed}개</strong></div><div><span>남은 블록</span><strong>${remaining}개</strong></div><div><span>선택 횟수</span><strong>${moves}번</strong></div><div><span>획득 포인트</span><strong>+${reward.toLocaleString('ko-KR')}P</strong></div>`;
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
  const liarReconnectCountdown = $('#liar-reconnect-countdown');
  if (liarReconnectCountdown && liar.reconnectDeadlineAt) {
    const remaining = new Date(liar.reconnectDeadlineAt).getTime() - serverAlignedNow(app.data.serverTime);
    liarReconnectCountdown.textContent = `재접속 대기 ${Math.max(0, Math.ceil(remaining / 1000))}초`;
    if (remaining <= 0 && Date.now() - app.liarLastRefreshAt > 1200) {
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
  if (territoryCountdown) territoryCountdown.textContent = durationText(new Date(app.data.territory.endsAt).getTime() - serverAlignedNow(app.data.territory.serverTime || app.data.serverTime));
}

async function handleAction(button, event = null) {
  const action = button.dataset.action;
  const idValue = button.dataset.id;
  if (action === 'close-modal') return closeModal();
  if (action === 'home') return switchMainTab('home');
  if (action === 'notifications') return openNotifications();
  if (action === 'show-online') return openOnlineModal();
  if (action === 'body-guide') return openBodyGuide(Number(button.dataset.body));
  if (action === 'edit-status-message') return openStatusMessageEditor();
  if (action === 'open-shop') return openShop();
  if (action === 'open-food') return openFoodShop();
  if (action === 'buy-shop') return buyShopItem(idValue);
  if (action === 'buy-flex') return buyFlexItem(idValue);
  if (action === 'nickname-ticket') return openNicknameTicket();
  if (action === 'toggle-residents') return renderResidentRegion(!app.residentsExpanded);
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
  if (action === 'block-select') {
    const challenge = app.data?.activeMiniChallenge ? structuredClone(app.data.activeMiniChallenge) : null;
    if (!challenge || challenge.gameId !== 'block') return;
    const requestId = crypto.randomUUID?.() || `block-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const result = await perform('/api/minigames/block/select', {
      challengeId: challenge.id,
      row: Number(button.dataset.row),
      col: Number(button.dataset.col),
      boardVersion: Number(button.dataset.version),
      requestId
    }, null, 'POST', { renderMode: 'block', preserveControls: true, toastResult: false });
    if (result?.finished) openMiniResult(result, challenge);
    return result;
  }
  if (action === 'finish-mini') {
    if (app.data?.activeMiniChallenge?.gameId === 'reaction') return submitReactionClick();
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
  if (action === 'apple-keep-board') {
    const challenge = app.data?.activeMiniChallenge;
    if (!challenge || challenge.gameId !== 'apple') return;
    app.appleNewBoardDismissedKey = appleBoardKey(challenge);
    const region = $('#apple-refresh-region');
    if (region) region.innerHTML = appleRefreshOfferHtml(challenge);
    requestAnimationFrame(syncAppleGameLayout);
    return;
  }
  if (action === 'apple-new-board') {
    const challenge = app.data?.activeMiniChallenge;
    if (!challenge || challenge.gameId !== 'apple') return;
    const requestId = crypto.randomUUID?.() || `apple-board-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    app.appleNewBoardDismissedKey = null;
    const result = await perform('/api/minigames/apple/new-board', { challengeId: challenge.id, requestId }, null, 'POST', { renderMode: 'apple', toastDuration: 900, toastType: 'game-start' });
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
  if (action === 'liar-chat-jump-latest') {
    const chat = $('#liar-chat-box');
    if (chat) chat.scrollTop = chat.scrollHeight;
    app.liarUnreadChatCount = 0;
    updateLiarNewMessageButton();
    return;
  }
  if (action === 'liar-reaction') return perform('/api/liar/reaction', { type: button.dataset.reaction });
  if (action === 'omok-reaction') return perform(`/api/omok/rooms/${encodeURIComponent(idValue)}/reaction`, { type: button.dataset.reaction });
  if (action === 'omok-create') return openCreateOmok();
  if (action === 'omok-open') { app.omokLobbyForced = false; app.omokRoomId = idValue; markTabDirty('games'); render(); return; }
  if (action === 'omok-back') { app.omokRoomId = null; app.omokLobbyForced = true; markTabDirty('games'); render(); return; }
  if (action === 'omok-join') {
    const result = await perform(`/api/omok/rooms/${encodeURIComponent(idValue)}/join`, {});
    if (result?.ok) { app.omokLobbyForced = false; app.omokRoomId = result.roomId || idValue; markTabDirty('games'); render(); }
    return;
  }
  if (action === 'omok-spectate') {
    const result = await perform(`/api/omok/rooms/${encodeURIComponent(idValue)}/spectate`, {});
    if (result?.ok) { app.omokLobbyForced = false; app.omokRoomId = result.roomId || idValue; markTabDirty('games'); render(); }
    return;
  }
  if (action === 'omok-spectate-leave') {
    const result = await perform(`/api/omok/rooms/${encodeURIComponent(idValue)}/spectate/leave`, {});
    if (result?.ok) { app.omokRoomId = null; app.omokLobbyForced = true; markTabDirty('games'); render(); }
    return;
  }
  if (action === 'omok-leave') {
    const room = app.data.omok.rooms.find((item) => item.id === idValue);
    if (room?.status === 'playing' && !confirm('게임 중 나가면 기권패 처리되고 판돈은 상대에게 지급됩니다. 나갈까요?')) return;
    const result = await perform(`/api/omok/rooms/${encodeURIComponent(idValue)}/leave`, {});
    if (result?.ok) { app.omokRoomId = null; app.omokLobbyForced = true; markTabDirty('games'); render(); }
    return;
  }
  if (action === 'omok-move') {
    const room = currentOmokRoom();
    if (!room || room.id !== app.omokRoomId && app.omokRoomId) return;
    const requestId = crypto.randomUUID?.() || `omok-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return perform(`/api/omok/rooms/${encodeURIComponent(room.id)}/move`, { row: Number(button.dataset.row), col: Number(button.dataset.col), requestId }, null, 'POST', { toastDuration: 650, toastType: 'game-start' });
  }
  if (action === 'omok-rematch') return perform(`/api/omok/rooms/${encodeURIComponent(idValue)}/rematch`, {});
  if (action === 'block-battle-create') return openCreateBlockBattle();
  if (action === 'block-battle-open') { app.blockBattleLobbyForced = false; app.blockBattleRoomId = idValue; renderBlockBattleRegion(); return; }
  if (action === 'block-battle-back') { app.blockBattleRoomId = null; app.blockBattleLobbyForced = true; renderBlockBattleRegion(); return; }
  if (action === 'block-battle-join') {
    const result = await perform(`/api/block-battle/rooms/${encodeURIComponent(idValue)}/join`, {});
    if (result?.ok) { app.blockBattleLobbyForced = false; app.blockBattleRoomId = result.roomId || idValue; renderBlockBattleRegion(); }
    return result;
  }
  if (action === 'block-battle-spectate') {
    const result = await perform(`/api/block-battle/rooms/${encodeURIComponent(idValue)}/spectate`, {});
    if (result?.ok) { app.blockBattleLobbyForced = false; app.blockBattleRoomId = result.roomId || idValue; renderBlockBattleRegion(); }
    return result;
  }
  if (action === 'block-battle-spectate-leave') {
    const result = await perform(`/api/block-battle/rooms/${encodeURIComponent(idValue)}/spectate/leave`, {});
    if (result?.ok) { app.blockBattleRoomId = null; app.blockBattleLobbyForced = true; renderBlockBattleRegion(); }
    return result;
  }
  if (action === 'block-battle-leave') {
    const room = currentBlockBattleRoom();
    if (room?.status === 'playing' && !confirm('게임 중 나가면 기권패 처리되고 판돈은 상대에게 지급됩니다. 나갈까요?')) return;
    const result = await perform(`/api/block-battle/rooms/${encodeURIComponent(idValue)}/leave`, {});
    if (result?.ok) { app.blockBattleRoomId = null; app.blockBattleLobbyForced = true; renderBlockBattleRegion(); }
    return result;
  }
  if (action === 'block-battle-rematch') return perform(`/api/block-battle/rooms/${encodeURIComponent(idValue)}/rematch`, {});
  if (action === 'block-battle-control') {
    // 실제 포인터 조작은 pointerdown에서 이미 처리한다. 손을 오래 누른 뒤 발생하는
    // 합성 click까지 다시 실행하면 마지막에 한 칸 더 움직이므로 키보드/스크립트 click만 허용한다.
    if (event && event.detail !== 0 && 'PointerEvent' in window) return;
    return queueBlockBattleInput(button.dataset.value);
  }
  if (action === 'block-battle-reaction') {
    try {
      const result = await api(`/api/block-battle/rooms/${encodeURIComponent(idValue)}/reaction`, {
        method: 'POST', body: JSON.stringify({ type: button.dataset.reaction })
      });
      const room = result.blockBattle?.rooms?.find((item) => item.id === idValue);
      if (room) applyBlockBattleRoomState({ room, serverTime: result.blockBattle.serverTime });
      return result;
    } catch (error) { toast(error.message, 'error'); return null; }
  }
  if (action === 'toggle-relation-rankings') {
    app.rankingRelationsExpanded = !app.rankingRelationsExpanded;
    markTabDirty('home');
    scheduleTabRender('home');
    return;
  }
  if (action === 'territory-limits') return openTerritoryLimits();
  if (action === 'claim-territory-direct') {
    const row = Number(button.dataset.row);
    const col = Number(button.dataset.col);
    const claimKey = `${row}:${col}`;
    if (app.pendingTerritoryClaim) return null;
    app.pendingTerritoryClaim = claimKey;
    button.classList.add('claim-pending');
    button.setAttribute('aria-busy', 'true');
    button.disabled = true;
    const requestId = crypto.randomUUID?.() || `territory-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      return await perform('/api/territory/claim', {
        row,
        col,
        requestId,
        seasonId: app.data?.territory?.seasonId ?? null,
        expectedOwnerPetId: button.dataset.owner || null
      });
    } finally {
      if (app.pendingTerritoryClaim === claimKey) app.pendingTerritoryClaim = null;
      if (document.contains(button)) {
        button.classList.remove('claim-pending');
        button.removeAttribute('aria-busy');
        button.disabled = false;
      }
    }
  }
  if (action === 'open-admin') return openAdmin();
  if (action === 'admin-refresh') return refreshAdminMembers(button);
  if (action === 'admin-workout-badge') {
    const targetUserId = String(button.dataset.userId || '');
    if (!targetUserId) return;
    const enabled = button.dataset.enabled === 'true';
    return perform('/api/admin/workout-badge', { targetUserId, enabled });
  }
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
  if (action === 'admin-force-bung') {
    const bungName = String(button.dataset.name || '이 벙');
    if (!confirm(`${bungName}을(를) 강제취소할까요?\n\n개설 포인트는 반환되지 않고 참가자·벙주 레고력 및 오늘의 레고력도 지급되지 않습니다.`)) return;
    return perform(`/api/admin/bungs/${encodeURIComponent(idValue)}/force-cancel`, {});
  }
  if (action === 'admin-clear-ended-omok') return perform('/api/admin/omok/clear-ended', {});
  if (action === 'admin-force-liar') { if (confirm('라이어게임을 강제 종료하고 남은 판돈을 환불할까요?')) return perform('/api/admin/liar/force-end', {}); return; }
  if (action === 'admin-delete-liar-chat') {
    try {
      const result = await api(`/api/admin/liar/chat/${encodeURIComponent(idValue)}`, { method: 'DELETE' });
      applyLiarChatEvent({ action: 'delete', chatId: idValue });
      toast(result.message || '라이어게임 채팅을 삭제했습니다.', 'success');
      return result;
    } catch (error) { toast(error.message, 'error'); return null; }
  }
}

function switchMainTab(tabName, { smooth = false } = {}) {
  if (!MAIN_TABS.includes(tabName)) return;
  const changed = app.tab !== tabName;
  if (app.modal) closeModal();

  // 실시간 방 상태가 이미 도착했다면 requestAnimationFrame을 기다리지 않는다.
  // 같은 게임 탭을 다시 누른 경우에도 직전 로비 DOM이 남아 있으면 즉시 교체한다.
  const realtimeGameOpen = tabName === 'games' && Boolean(app.data && (currentOmokRoom() || currentBlockBattleRoom()));

  if (!changed) {
    updateAppChrome();
    const pane = $('#view .tab-pane');
    const needsImmediateRealtimeRender = realtimeGameOpen
      && (!pane || pane.dataset.pane !== tabName || pane.dataset.rendered !== 'true' || app.dirtyTabs.has(tabName));
    if (needsImmediateRealtimeRender) {
      cancelAnimationFrame(app.tabRenderFrame);
      app.tabRenderFrame = 0;
      app.tabSwitchToken += 1;
      renderTab(tabName, { force: true });
      updateAppChrome();
    } else if (app.dirtyTabs.has(tabName)) scheduleTabRender(tabName);
    window.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' });
    return;
  }

  if (app.tab === 'social') renderResidentRegion(false);
  if (app.tab === 'games') {
    disconnectOmokBoardObserver();
    stopBlockBattleHold();
  }
  app.tab = tabName;
  if (app.tab !== 'games') setLiarKeyboardMode(false);
  syncBlockBattleGravity();

  // 현재 화면 하나만 DOM에 연결한다. 직전 화면 하나만 분리 캐시하며 나머지는 즉시 폐기한다.
  // 선택 표시는 무거운 화면 HTML을 만들기 전에 먼저 반영한다.
  const pane = attachTabPane(tabName);
  updateAppChrome();
  if (tabName === 'social') renderResidentRegion(false);

  // 진행 중인 실시간 게임은 조작 화면이 늦게 뜨면 입력 자체가 불가능하다.
  // 일반 탭은 첫 페인트 뒤 렌더링해 전환감을 가볍게 유지하되, 오목/테트리스 플레이어·관전자는
  // pointerdown 처리 안에서 즉시 DOM을 만든다. JSDOM/PWA의 requestAnimationFrame 지연에도
  // 게임 조작부가 사라진 채 남지 않도록 하는 안전 경로다.
  if (realtimeGameOpen && pane) {
    cancelAnimationFrame(app.tabRenderFrame);
    app.tabRenderFrame = 0;
    app.tabSwitchToken += 1;
    renderTab(tabName, { force: true });
    updateAppChrome();
  } else {
    scheduleTabRender(tabName, { afterPaint: true });
  }
  window.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' });
}

const bottomNav = document.querySelector('.bottom-nav');

function bottomNavButtonFromEvent(event) {
  const button = event.target.closest?.('.nav-item[data-tab]');
  return button && bottomNav?.contains(button) ? button : null;
}

function activateBottomNav(button) {
  if (!button) return;
  switchMainTab(button.dataset.tab, { smooth: false });
}

// click만 기다리면 일부 모바일 브라우저/PWA에서 체감 지연이 생길 수 있어
// 실제 포인터 입력은 pointerdown 순간 바로 전환한다. 키보드 접근성은 click으로 유지한다.
bottomNav?.addEventListener('pointerdown', (event) => {
  const button = bottomNavButtonFromEvent(event);
  if (!button || event.isPrimary === false) return;
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  activateBottomNav(button);
}, { passive: false });

bottomNav?.addEventListener('click', (event) => {
  const button = bottomNavButtonFromEvent(event);
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  // 키보드 Enter/Space나 PointerEvent 미지원 환경만 click에서 처리한다.
  if (event.detail === 0 || !('PointerEvent' in window)) activateBottomNav(button);
});

document.addEventListener('click', (event) => {
  const tab = event.target.closest('[data-tab]');
  if (tab) {
    if (tab.closest('.bottom-nav')) return;
    switchMainTab(tab.dataset.tab);
    return;
  }
  const button = event.target.closest('[data-action]');
  if (button) handleAction(button, event);
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

document.addEventListener('compositionstart', (event) => {
  if (event.target.closest?.('#liar-chat-form input[name="text"]')) app.liarComposing = true;
});
document.addEventListener('compositionend', (event) => {
  if (!event.target.closest?.('#liar-chat-form input[name="text"]')) return;
  app.liarComposing = false;
  app.liarChatDraft = event.target.value;
});
document.addEventListener('scroll', (event) => {
  const chat = event.target.closest?.('#liar-chat-box');
  if (!chat) return;
  const distanceFromBottom = chat.scrollHeight - chat.scrollTop - chat.clientHeight;
  if (distanceFromBottom < 80 && app.liarUnreadChatCount) {
    app.liarUnreadChatCount = 0;
    updateLiarNewMessageButton();
  }
}, true);

document.addEventListener('pointerdown', (event) => {
  const blockControl = event.target.closest?.('[data-action="block-battle-control"]');
  if (blockControl && event.isPrimary !== false && (event.pointerType !== 'mouse' || event.button === 0)) {
    event.preventDefault();
    const action = blockControl.dataset.value;
    try { blockControl.setPointerCapture?.(event.pointerId); } catch { /* 일부 모바일 브라우저 미지원 */ }
    startBlockBattleHold(action, {
      sourceType: 'pointer', sourceId: event.pointerId, control: blockControl,
      repeatDelay: BLOCK_BATTLE_POINTER_REPEAT_DELAY_MS
    });
    return;
  }
  const reactionButton = event.target.closest?.('#reaction-button');
  if (reactionButton && event.isPrimary !== false && (event.pointerType !== 'mouse' || event.button === 0)) {
    event.preventDefault();
    submitReactionClick();
    return;
  }
  if (event.target.closest?.('#liar-chat-form input[name="text"]')) setLiarKeyboardMode(true);
}, { passive: false });
document.addEventListener('pointerup', (event) => stopBlockBattleHold('pointer', event.pointerId), { passive: true });
document.addEventListener('pointercancel', (event) => stopBlockBattleHold('pointer', event.pointerId), { passive: true });
document.addEventListener('lostpointercapture', (event) => stopBlockBattleHold('pointer', event.pointerId), { passive: true });
window.addEventListener('blur', () => stopBlockBattleHold());
document.addEventListener('focusin', (event) => {
  if (event.target.closest?.('#liar-chat-form input[name="text"]')) {
    app.liarInputFocused = true;
    setLiarKeyboardMode(true);
  }
});
document.addEventListener('focusout', (event) => {
  if (!event.target.closest?.('#liar-chat-form input[name="text"]')) return;
  app.liarInputFocused = false;
  setTimeout(() => {
    if (!document.activeElement?.closest?.('#liar-chat-form input[name="text"]')) {
      setLiarKeyboardMode(false);
      if (!app.liarComposing && app.dirtyTabs.has('games') && app.tab === 'games') scheduleTabRender('games');
    }
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
  if (form.id === 'nickname-ticket-form') {
    const result = await buyShopItem('nickname24h', { nickname: String(data.nickname ?? '') });
    if (result?.ok) openShop();
    return;
  }
  if (form.id === 'odd-even-bet-form') {
    const stakePoints = Number(data.stakePoints);
    const result = await perform('/api/minigames/start', { gameId: 'oddEven', stakePoints });
    if (result?.bootstrap?.activeMiniChallenge) openMiniGame(result.bootstrap.activeMiniChallenge);
  }
  if (form.id === 'number-game-form') { const challenge = app.data.activeMiniChallenge ? structuredClone(app.data.activeMiniChallenge) : null; const result = await perform('/api/minigames/finish', { challengeId: challenge?.id, value: data.guess }, null, 'POST', { renderMode: 'number' }); if (result?.finished) openMiniResult(result, challenge); return; }
  if (form.id === 'liar-chat-form') {
    await sendLiarChat(form);
    return;
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
      markTabDirty('games');
      render();
    }
    return;
  }
  if (form.id === 'block-battle-create-form') {
    const result = await perform('/api/block-battle/rooms', { stakePoints: Number(data.stakePoints) });
    if (result?.ok) {
      app.blockBattleLobbyForced = false;
      app.blockBattleRoomId = result.roomId;
      closeModal();
      markTabDirty('games');
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
  if (app.modal || app.tab !== 'games' || event.ctrlKey || event.altKey || event.metaKey || event.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
  const room = currentBlockBattleRoom();
  if (!room || room.viewerRole !== 'player' || room.status !== 'playing') return;
  const action = ({ ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'rotate', ArrowDown: 'softDrop', ' ': 'hardDrop', Spacebar: 'hardDrop' })[event.key];
  if (!action) return;
  event.preventDefault();
  if (event.repeat) return;
  startBlockBattleHold(action, {
    sourceType: 'keyboard', sourceId: event.code || event.key,
    repeatDelay: BLOCK_BATTLE_KEYBOARD_REPEAT_DELAY_MS
  });
});
document.addEventListener('keyup', (event) => {
  stopBlockBattleHold('keyboard', event.code || event.key);
});

function preserveLiarScrollDuringViewportChange() {
  if (app.appleModalActive) requestAnimationFrame(() => {
    syncAppleGameLayout();
    syncBlockGameLayout();
  });
  if (app.liarKeyboardActive) {
    const snapshot = captureLiarChatScrollState();
    updateVisualViewportVars();
    requestAnimationFrame(() => restoreLiarChatScrollState(snapshot));
  }
}
window.visualViewport?.addEventListener('resize', preserveLiarScrollDuringViewportChange);
window.visualViewport?.addEventListener('scroll', preserveLiarScrollDuringViewportChange);
window.addEventListener('resize', preserveLiarScrollDuringViewportChange);
window.addEventListener('resize', syncOmokBoardSquare);
window.visualViewport?.addEventListener('resize', syncOmokBoardSquare);
window.visualViewport?.addEventListener('resize', syncBlockBattleViewport);
window.visualViewport?.addEventListener('scroll', syncBlockBattleViewport);
window.addEventListener('resize', syncBlockBattleViewport);
window.addEventListener('orientationchange', syncBlockBattleViewport);

window.addEventListener('online', () => {
  loadBootstrap({ silent: true });
  connectRealtime();
});
window.addEventListener('offline', () => {
  resetBlockBattleInputQueue();
  syncBlockBattleGravity();
  const socket = app.ws;
  app.ws = null;
  socket?.close();
  toast('인터넷 연결이 끊겼습니다.', 'error');
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopBlockBattleHold();
  syncBlockBattleGravity();
  if (!document.hidden && app.token && navigator.onLine) loadBootstrap({ silent: true });
});
window.addEventListener('pageshow', (event) => {
  if (event.persisted && app.token && navigator.onLine) loadBootstrap({ silent: true });
});
app.tickTimer = setInterval(tick, 500);
if (app.token) loadBootstrap(); else showAuth();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js?v=689').catch(() => {});
