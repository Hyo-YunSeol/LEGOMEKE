const monotonicNow = () => globalThis.performance?.now?.() ?? Date.now();
const SUPPORT_LINK = 'https://link.kakaopay.com/__/4oKU3W1';
const DEFAULT_SUPPORT_MESSAGE = '🥹 게임이 계속 업데이트될 수 있게 투잡하는 레고에게 작은 힘을 주세요 💛';
const SUPPORT_MESSAGE_MAX_LENGTH = 120;

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
  reconcileTimer: null,
  pendingOperationIds: new Map(),
  tickTimer: null,
  fishingClaimInFlight: false,
  popupSeen: new Set(),
  omokRoomId: null,
  omokLobbyForced: false,
  omokLastRefreshAt: 0,
  blockBattleRoomId: null,
  davinciRoomId: null,
  davinciLobbyForced: false,
  davinciGuessTarget: null,
  davinciLastRefreshAt: 0,
  blockBattleLobbyForced: false,
  blockBattleInputBuffer: [],
  blockBattlePendingBatches: [],
  blockBattleSending: false,
  blockBattleServerVersions: new Map(),
  blockBattleServerSyncedAt: monotonicNow(),
  blockBattleFlushTimer: null,
  blockBattleGravityTimer: null,
  blockBattleGravityKey: null,
  blockBattlePredictedGravity: null,
  blockBattleLockQueued: false,
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
  minesweeperRankTab: 'normal',
  minesweeperSessionActive: false,
  minesweeperActionInFlight: false,
  minesweeperActionQueue: [],
  minesweeperCurrentAction: null,
  minesweeperAbandonInFlight: false,
  minesweeperClockTimer: null,
  minesweeperClockChallengeId: null,
  minesweeperBoardUi: null,
  appleBoardUi: null,
  appleModalActive: false,
  reactionReadyPerformanceAt: null,
  reactionSubmissionInFlight: false,
  pendingTerritoryClaim: null,
  loggingOut: false,
  loudspeakerTimer: null,
  loudspeakerId: null,
  loudspeakerValue: null,
  loudspeakerDraft: '',
  loudspeakerComposing: false,
  loudspeakerEditing: false
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

function gameSeasonCountdownText(endsAt, now = serverAlignedNow(app.data?.serverTime)) {
  const endMs = new Date(endsAt || '').getTime();
  if (!Number.isFinite(endMs)) return '시즌 종료 시간 확인 중';
  const totalMinutes = Math.max(0, Math.ceil((endMs - now) / 60_000));
  if (totalMinutes <= 0) return '시즌 정산 중';
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `시즌 종료까지 ${days}일 ${hours}시간`;
  if (hours > 0) return `시즌 종료까지 ${hours}시간 ${minutes}분`;
  return `시즌 종료까지 ${Math.max(1, minutes)}분`;
}

function updateVisualViewportVars() {
  const viewport = window.visualViewport;
  const height = Math.max(1, Math.round(Number(viewport?.height) || window.innerHeight || document.documentElement.clientHeight || 1));
  const top = Math.max(0, Math.round(Number(viewport?.offsetTop) || 0));
  document.documentElement.style.setProperty('--visual-viewport-height', `${height}px`);
  document.documentElement.style.setProperty('--visual-viewport-top', `${top}px`);
}

function setAppleModalMode(active) {
  app.appleModalActive = Boolean(active);
  document.body.classList.toggle('apple-game-open', app.appleModalActive);
  $('#modal-root')?.classList.toggle('apple-modal-root', app.appleModalActive);
  if (app.appleModalActive) updateVisualViewportVars();
  else {
    document.documentElement.style.removeProperty('--visual-viewport-height');
    document.documentElement.style.removeProperty('--visual-viewport-top');
  }
}

function currentSupportSettings() {
  const raw = app.data?.support && typeof app.data.support === 'object' ? app.data.support : {};
  const message = [...String(raw.message ?? DEFAULT_SUPPORT_MESSAGE).replace(/\s+/g, ' ').trim()].slice(0, SUPPORT_MESSAGE_MAX_LENGTH).join('');
  return { enabled: raw.enabled !== false, message: message || DEFAULT_SUPPORT_MESSAGE };
}

function supportBannerShouldHide() {
  if (!app.data || app.modal) return true;
  if (app.tab !== 'games') return false;
  return Boolean(currentOmokRoom() || currentBlockBattleRoom() || currentDavinciRoom());
}

function syncSupportBanner() {
  const banner = $('#support-banner');
  if (!banner) return;
  const support = currentSupportSettings();
  const text = $('#support-banner-text');
  if (text && text.textContent !== support.message) text.textContent = support.message;
  banner.classList.toggle('hidden', !support.enabled || supportBannerShouldHide());
}


function toast(message, type = '', duration = 3400) {
  const node = document.createElement('div');
  node.className = `toast ${type}`;
  node.textContent = message;
  (type === 'game-start' ? document.body : $('#toast-root')).appendChild(node);
  setTimeout(() => node.remove(), Math.max(250, Number(duration) || 3400));
}

function clearLoudspeaker(expectedId = null) {
  if (expectedId && app.loudspeakerId && expectedId !== app.loudspeakerId) return;
  clearTimeout(app.loudspeakerTimer);
  app.loudspeakerTimer = null;
  app.loudspeakerId = null;
  app.loudspeakerValue = null;
  const root = $('#loudspeaker-root');
  if (!root) return;
  root.classList.add('hidden');
  root.replaceChildren();
  updateLoudspeakerShopState();
}

function activeLoudspeaker(value = app.loudspeakerValue ?? app.data?.loudspeaker) {
  if (!value?.message || !value?.displayName || !value?.expiresAt) return null;
  const expiresAt = new Date(value.expiresAt).getTime();
  const now = app.data?.serverTime ? serverAlignedNow(app.data.serverTime) : Date.now();
  return Number.isFinite(expiresAt) && expiresAt > now ? value : null;
}

function showLoudspeaker(value) {
  const loudspeaker = activeLoudspeaker(value);
  if (!loudspeaker) return clearLoudspeaker();
  const root = $('#loudspeaker-root');
  if (!root) return;
  clearTimeout(app.loudspeakerTimer);
  app.loudspeakerId = String(loudspeaker.id || loudspeaker.expiresAt);
  app.loudspeakerValue = loudspeaker;
  const banner = document.createElement('div');
  banner.className = 'loudspeaker-banner';
  const sender = document.createElement('strong');
  sender.textContent = `📢 ${loudspeaker.displayName}`;
  const message = document.createElement('span');
  message.textContent = loudspeaker.message;
  banner.append(sender, message);
  root.replaceChildren(banner);
  root.classList.remove('hidden');
  const now = app.data?.serverTime ? serverAlignedNow(app.data.serverTime) : Date.now();
  const remaining = Math.max(0, new Date(loudspeaker.expiresAt).getTime() - now);
  const currentId = app.loudspeakerId;
  app.loudspeakerTimer = setTimeout(() => clearLoudspeaker(currentId), remaining + 60);
  updateLoudspeakerShopState();
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
  app.blockBattleServerSyncedAt = app.bootstrapSyncedAt;
  const bootstrapLoudspeaker = activeLoudspeaker(app.data?.loudspeaker);
  if (bootstrapLoudspeaker) showLoudspeaker(bootstrapLoudspeaker);
  else if (!activeLoudspeaker(app.loudspeakerValue)) clearLoudspeaker();
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
    toast(item.text, 'success', 4200);
  }
}


function logout(callServer = true) {
  if (app.loggingOut) return;
  cancelMinesweeperPointerGesture();
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
  app.minesweeperRankTab = 'normal';
  app.minesweeperSessionActive = false;
  app.minesweeperActionInFlight = false;
  app.minesweeperAbandonInFlight = false;
  clearInterval(app.minesweeperClockTimer);
  app.minesweeperClockTimer = null;
  app.minesweeperClockChallengeId = null;
  app.minesweeperBoardUi = null;
  app.omokRoomId = null;
  app.omokLobbyForced = false;
  app.blockBattleRoomId = null;
  app.davinciRoomId = null;
  app.davinciLobbyForced = false;
  app.davinciGuessTarget = null;
  app.blockBattleLobbyForced = false;
  app.blockBattleInputBuffer = [];
  app.blockBattlePendingBatches = [];
  app.blockBattleSending = false;
  app.blockBattleServerVersions = new Map();
  app.blockBattleGravityTimer = null;
  app.blockBattleGravityKey = null;
  app.blockBattlePredictedGravity = null;
  app.blockBattleLockQueued = false;
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
  app.blockBattleServerSyncedAt = monotonicNow();
  app.appleFinishInFlight = false;
  app.appleNewBoardDismissedKey = null;
  app.loudspeakerDraft = '';
  app.loudspeakerComposing = false;
  app.loudspeakerEditing = false;
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
  app.pendingOperationIds = new Map();
  document.body.classList.remove('block-battle-playing');
  const view = $('#view');
  if (view) view.innerHTML = '';
  app.popupSeen.clear();
  clearLoudspeaker();
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
    const staleMinesweeper = app.data.activeMiniChallenge?.gameId === 'minesweeper' && !app.minesweeperSessionActive;
    if (staleMinesweeper) {
      try {
        const abandoned = await api('/api/minigames/minesweeper/abandon', { method: 'POST', body: JSON.stringify({ challengeId: app.data.activeMiniChallenge.id }) });
        if (abandoned?.bootstrap) applyBootstrap(abandoned.bootstrap);
      } catch { /* 다음 동기화 때 다시 정리 */ }
    }
    const dataChanged = !hadData || app.revision !== previousRevision;
    if (renderMode === 'games-live') markTabDirty('games');
    // 첫 bootstrap부터 이미 참가/관전 중인 실시간 방이 있으면 게임 화면을 즉시 복구한다.
    // 느린 CI/PWA에서도 하단 탭 pointerdown이나 rAF 타이밍에 의존하지 않아 테트리스 조작부가 항상 DOM에 존재한다.
    if (!hadData && (currentOmokRoom() || currentBlockBattleRoom() || currentDavinciRoom())) {
      app.tab = 'games';
      app.omokLobbyForced = false;
      app.blockBattleLobbyForced = false;
      app.davinciLobbyForced = false;
      markTabDirty('games');
    }
    showApp();
    const appleOnlyUpdated = renderMode === 'apple' && refreshAppleMiniOnly();
    const blockOnlyUpdated = renderMode === 'block' && refreshBlockMiniOnly();
    const minesweeperOnlyUpdated = (renderMode === 'minesweeper' || (renderMode === 'full' && app.modal?.type === 'mini' && app.modal?.gameId === 'minesweeper')) && refreshMinesweeperMiniOnly();
    const numberInputProtected = renderMode === 'full' && numberGuessInputIsActive() && refreshNumberMiniOnly();
    if (numberInputProtected) markTabDirty('games');
    if (!appleOnlyUpdated && !blockOnlyUpdated && !minesweeperOnlyUpdated && !numberInputProtected) {
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
        const renderMode = payload.reason === 'apple' ? 'apple'
            : payload.reason === 'block' ? 'block'
              : payload.reason === 'minesweeper' ? 'minesweeper'
                : payload.reason === 'spectator-reaction' ? 'games-live' : 'full';
        app.refreshTimer = setTimeout(() => loadBootstrap({ silent: true, renderMode }), 180);
      } else if (payload.type === 'loudspeaker') {
        if (app.data) app.data.loudspeaker = payload.loudspeaker ?? null;
        showLoudspeaker(payload.loudspeaker);
        updateLoudspeakerShopState();
      } else if (payload.type === 'block-battle-state') {
        applyBlockBattleRoomState(payload);
      } else if (payload.type === 'block-battle-error') {
        handleBlockBattleInputError(payload);
      }
    } catch { /* ignore */ }
  });
  socket.addEventListener('close', (event) => {
    clearTimeout(fallback);
    if (app.ws === socket) app.ws = null;
    // 운영자 계정 잠금/삭제처럼 서버가 세션을 강제로 종료한 경우에는 오래된 토큰으로
    // polling을 반복하지 않고 즉시 로그인 화면으로 돌려보낸다.
    if (event.code === 4001 && app.token) {
      logout(false);
      toast('계정 사용이 중지되어 로그아웃되었습니다.', 'error');
      return;
    }
    if (app.token) startPolling();
  });
  socket.addEventListener('error', () => socket.close());
}

function startPolling() {
  if (!app.token || app.pollTimer) return;
  app.pollTimer = setInterval(() => {
    if (!document.hidden && navigator.onLine) loadBootstrap({ silent: true });
  }, 5_000);
}

function modalHeader(title, description = '') {
  return `<header class="modal-head"><div><h2>${esc(title)}</h2>${description ? `<p>${esc(description)}</p>` : ''}</div><button class="icon-button" data-action="close-modal" type="button" aria-label="닫기">✕</button></header>`;
}

function openSupportModal() {
  const support = currentSupportSettings();
  openModal(`${modalHeader('💛 LEGO LIFE 후원하기')}<div class="support-modal-card"><div class="support-heart">🧱💛</div><p>${esc(support.message)}</p><a class="support-kakaopay-link" href="${SUPPORT_LINK}" target="_blank" rel="noopener noreferrer">카카오페이로 작은 힘 보태기</a><small>후원은 자유입니다 💛</small></div>`, { type: 'support' });
}

function openModal(html, descriptor = {}) {
  if (descriptor.type !== 'mini') cleanupAppleBoardUi();
  setAppleModalMode(descriptor.type === 'mini' && ['apple', 'block', 'minesweeper'].includes(descriptor.gameId));
  app.modal = descriptor;
  $('#modal-content').innerHTML = html;
  $('#modal-root').classList.remove('hidden');
  $('#modal-root').setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => $('#modal-root').classList.add('open'));
  syncSupportBanner();
}

function closeModal() {
  cancelMinesweeperPointerGesture();
  clearMinesweeperActionQueue();
  if (app.modal?.type === 'mini' && app.modal?.gameId === 'minesweeper' && app.data?.activeMiniChallenge?.gameId === 'minesweeper') abandonMinesweeperSilently();
  clearInterval(app.minesweeperClockTimer);
  app.minesweeperClockTimer = null;
  app.minesweeperClockChallengeId = null;
  app.minesweeperBoardUi = null;
  clearTimeout(app.reactionReadyTimer);
  app.reactionReadyTimer = null;
  app.reactionReadyPerformanceAt = null;
  app.reactionSubmissionInFlight = false;
  cleanupAppleBoardUi();
  setAppleModalMode(false);
  app.loudspeakerComposing = false;
  app.loudspeakerEditing = false;
  app.modal = null;
  app.profile = null;
  $('#modal-root').classList.remove('open');
  $('#modal-root').classList.add('hidden');
  $('#modal-root').setAttribute('aria-hidden', 'true');
  $('#modal-content')?.replaceChildren();
  syncSupportBanner();
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
  if (descriptor.type === 'shop') {
    const input = $('#loudspeaker-message-input');
    // 상점이 열린 동안 실시간 bootstrap은 확성기 input DOM 자체를 절대 교체하지 않는다.
    // PC/모바일 한글 IME는 조합 중뿐 아니라 후보 선택·포커스 전환 순간에도
    // composition/focus 이벤트 순서가 브라우저마다 달라 DOM 교체 시 입력값이 사라질 수 있다.
    // 실제 구매 작업(renderMode: shop)이 끝난 경우에만 openShop()으로 다시 그린다.
    if (input) {
      app.loudspeakerDraft = input.value;
      return updateLoudspeakerShopState();
    }
    return openShop();
  }
  if (descriptor.type === 'fishingRewards') return openFishingRewards();
  if (descriptor.type === 'profile') return openProfile(descriptor.petId);
  if (descriptor.type === 'bung') return openBung(descriptor.bungId);
  if (descriptor.type === 'mini') return openMiniGame(app.data?.activeMiniChallenge);
  // 방 생성 중 사용자가 고른 판돈은 실시간 bootstrap 갱신보다 우선한다.
  // 생성 모달을 다시 그리면 select가 첫 값(100P)으로 되돌아가므로 입력 중에는 DOM을 유지한다.
  if (descriptor.type === 'omokCreate' || descriptor.type === 'blockBattleCreate' || descriptor.type === 'davinciCreate') return;
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
    const appleOnlyUpdated = renderMode === 'apple' && refreshAppleMiniOnly(result);
    const blockOnlyUpdated = renderMode === 'block' && refreshBlockMiniOnly(result);
    const minesweeperOnlyUpdated = renderMode === 'minesweeper' && refreshMinesweeperMiniOnly(result);
    const numberOnlyUpdated = renderMode === 'number' && refreshNumberMiniOnly(result);
    let shopOnlyUpdated = false;
    if (renderMode === 'shop' && app.modal?.type === 'shop') {
      openShop();
      shopOnlyUpdated = true;
    }
    if (!appleOnlyUpdated && !blockOnlyUpdated && !minesweeperOnlyUpdated && !numberOnlyUpdated && !shopOnlyUpdated) {
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

function operationRequestId(key) {
  const safeKey = String(key || 'operation');
  const existing = app.pendingOperationIds.get(safeKey);
  if (existing) return existing;
  const requestId = crypto.randomUUID?.() || `${safeKey.replace(/[^A-Za-z0-9_-]/g, '-')}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  app.pendingOperationIds.set(safeKey, requestId);
  return requestId;
}

async function performIdempotent(path, body, operationKey, successMessage = null, method = 'POST', options = {}) {
  const requestId = operationRequestId(operationKey);
  const result = await perform(path, { ...body, requestId }, successMessage, method, options);
  if (result) app.pendingOperationIds.delete(String(operationKey));
  return result;
}

const BODY_STAGE_FALLBACK = [
{min:60,max:69,key:'skinny',label:'마름레고',activityHungerCost:1},{min:70,max:79,key:'normal',label:'보통레고',activityHungerCost:1},{min:80,max:89,key:'yukdeok',label:'육덕레고',activityHungerCost:1},{min:90,max:99,key:'jjap',label:'짭덥레고',activityHungerCost:1},{min:100,max:109,key:'myeol-tteop',label:'멸떱레고',activityHungerCost:2},{min:110,max:119,key:'chubby',label:'통통레고',activityHungerCost:2},{min:120,max:129,key:'bi-tteop',label:'비떱레고',activityHungerCost:2},{min:130,max:159,key:'fat',label:'뚱뚱레고',activityHungerCost:2},{min:160,max:199,key:'three-digit',label:'세자리레고',activityHungerCost:2},{min:200,max:239,key:'big-big-woman',label:'빅빅우먼레고',activityHungerCost:3},{min:240,max:299,key:'royal-bi-tteop',label:'로얄비떱레고',activityHungerCost:3},{min:300,max:379,key:'hippo',label:'하마레고',activityHungerCost:3},{min:380,max:479,key:'elephant',label:'코끼리레고',activityHungerCost:3},{min:480,max:599,key:'mammoth',label:'맘모스레고',activityHungerCost:3},{min:600,max:739,key:'wild-boar',label:'매태지레고',activityHungerCost:3},{min:740,max:899,key:'daeruk',label:'돼룩돼룩레고',activityHungerCost:4},{min:900,max:1079,key:'ultra-daeruk',assetKey:'pig-ultra-daeruk',label:'초대룩레고',activityHungerCost:4},{min:1080,max:1279,key:'pig-emperor',assetKey:'pig-emperor',label:'돼황레고',activityHungerCost:4},{min:1280,max:1499,key:'monster-pig',assetKey:'pig-monster',label:'괴수돼지레고',activityHungerCost:4},{min:1500,max:1749,key:'bedbreaker-pig',assetKey:'pig-bedbreaker',label:'침대파괴돼지레고',activityHungerCost:4},{min:1750,max:2029,key:'disaster-text-pig',assetKey:'pig-disaster-text',label:'재난문자돼지레고',activityHungerCost:4},{min:2030,max:2339,key:'national-emergency-pig',assetKey:'pig-national-emergency',label:'국가비상돼지레고',activityHungerCost:4},{min:2340,max:2689,key:'protoceratops',assetKey:'lego-protoceratops',label:'프로토케라톱스레고',activityHungerCost:5},{min:2690,max:3079,key:'triceratops',assetKey:'lego-triceratops',label:'트리케라톱스레고',activityHungerCost:5},{min:3080,max:3509,key:'stegosaurus',assetKey:'lego-stegosaurus',label:'스테고사우루스레고',activityHungerCost:5},{min:3510,max:3989,key:'brachiosaurus',assetKey:'lego-brachiosaurus',label:'브라키오사우루스레고',activityHungerCost:5},{min:3990,max:4519,key:'patagotitan',assetKey:'lego-patagotitan',label:'파타고티탄레고',activityHungerCost:6},{min:4520,max:5099,key:'argentinosaurus',assetKey:'lego-argentinosaurus',label:'아르헨티노사우루스레고',activityHungerCost:6},{min:5100,max:5729,key:'blue-whale',assetKey:'lego-blue-whale',label:'대왕고래레고',activityHungerCost:6},{min:5730,max:6409,key:'ultra-whale',assetKey:'lego-ultra-whale',label:'초거대고래레고',activityHungerCost:6},{min:6410,max:7139,key:'abyss-monster',assetKey:'lego-abyss-monster',label:'심해괴수레고',activityHungerCost:6},{min:7140,max:7919,key:'kraken',assetKey:'lego-kraken',label:'크라켄레고',activityHungerCost:7},{min:7920,max:8749,key:'deep-sea-disaster',assetKey:'lego-deep-sea-disaster',label:'심해재난레고',activityHungerCost:7},{min:8750,max:null,key:'leviathan',assetKey:'lego-leviathan',label:'레비아탄레고',activityHungerCost:7}
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

function levelBadgeHtml(profile = {}) {
  const badge = profile.levelBadge;
  if (!badge?.icon || !badge?.label) return '';
  const key = String(badge.key || '').replace(/[^a-zA-Z0-9-]/g, '');
  return `<span class="level-rank-badge level-rank-${esc(key)}" title="${esc(badge.label)}" aria-label="${esc(badge.label)}">${esc(badge.icon)}</span>`;
}

function flexStyleKey(flexItem) {
  return flexItem?.id ? String(flexItem.id).replace(/[^a-zA-Z0-9-]/g, '') : '';
}

function flexProfileClass(profile = {}) {
  const item = profile.flexItem;
  if (!item) return '';
  const nameplateKey = item.nameplateKey ? String(item.nameplateKey).replace(/[^a-zA-Z0-9-]/g, '') : '';
  return ` flex-equipped flex-tier-${Math.max(1, Number(item.tier) || 1)} flex-${flexStyleKey(item)}${nameplateKey ? ` nameplate-${nameplateKey}` : ''}`;
}

function flexItemImage(flexItem, { mini = false, shop = false } = {}) {
  if (!flexItem?.assetKey) return '';
  const className = shop ? 'flex-shop-image' : `flex-item-image${mini ? ' mini' : ''}`;
  return `<img class="${className}" src="/flex/${esc(flexItem.assetKey)}.svg?v=69202" alt="${esc(flexItem.name)}" draggable="false">`;
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
    return `<span class="reaction-burst burst-${esc(item.type)}" style="--burst-x:${pos.x}%;--burst-y:${pos.y}%;--burst-rot:${pos.rot}deg"><b>${esc(item.emoji)}</b><small>${esc(item.label)}</small></span>`;
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
  const src = `/pets/${esc(stage.assetKey || stage.key)}.svg?v=69202`;
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
    shop.effects?.hungerFullUntil ? `<span>🍖 포만감 100% 유지 · ${dateText(shop.effects.hungerFullUntil)}까지</span>` : '',
    pet.flexItem ? `<span>✨ ${esc(pet.flexItem.name)} · ${dateText(pet.flexItem.expiresAt)}까지</span>` : ''
  ].filter(Boolean).join('');
  return `
    <section class="hero-card${flexProfileClass(pet)}">
      ${workoutBadgeHtml(pet)}
      <div class="hero-main">${avatar(stage, { flexItem: pet.flexItem })}<div class="hero-copy"><span class="eyebrow"><button class="body-stage-link" data-action="body-guide" data-body="${pet.stats.body}" type="button">${esc(stage.label)}</button> · ${pet.generation}세대</span><h1>${levelBadgeHtml(pet)}<span class="flex-display-name">${esc(pet.displayName)}</span>${seasonBadgesHtml(pet)}</h1><div class="status-message-row"><span class="status-message-text ${pet.statusMessage ? '' : 'muted'}">${esc(pet.statusMessage || '상태메시지 없음')}</span><button class="status-edit-button" data-action="edit-status-message" type="button" >수정</button></div><p class="system-status">${esc(pet.status)}</p><div class="hero-tags"><span>Lv.${pet.stats.level}</span><span>레고력 ${pet.stats.legoPower}</span><span>${esc(pet.coupleLabel || (pet.partnerPetId ? `${pet.partnerDisplayName || '상대'}와 커플 D+${pet.coupleDay}` : '솔로'))}</span></div></div></div>
      <div class="metric-grid primary-metrics">${compactMetric('포인트', points(pet.stats.points), 'accent')}${compactMetric('레벨', `Lv.${pet.stats.level}`)}${compactMetric('몸집', `${pet.stats.body}`)}${compactMetric('오늘 행동', `${pet.daily.actionsLeft}회`)}</div>
      <div class="level-progress"><div><span>Lv.${pet.levelProgress.level + 1}까지 ${Math.max(0, pet.levelProgress.nextAt - pet.levelProgress.totalPower)} 레고력 남음</span><strong>${pet.levelProgress.current} / ${pet.levelProgress.needed}</strong></div><div class="bar level"><span style="width:${Math.min(100, pet.levelProgress.current / pet.levelProgress.needed * 100)}%"></span></div><small class="level-reward-hint">다음 레벨 보상 ${points(pet.levelProgress.nextRewardPoints || 500)} · 체력/포만감 100%${pet.levelProgress.nextMilestone && pet.levelProgress.level + 1 <= 50 ? ' · 플렉스 5종 해금' : ''}</small></div>
    </section>
    <section class="section stat-panel">${bar('체력', pet.stats.stamina, { badLow: true })}${bar('포만감', pet.stats.hunger, { badLow: true })}<small class="hunger-penalty-note">포만감이 0인 상태가 1시간 지속될 때마다 50P 감소 · 최대 6시간</small>${effectChips ? `<div class="active-effect-chips">${effectChips}</div>` : ''}</section>

    <section class="section">
      ${sectionHeading('생활 행동', '게임 하루 5회 · 30분 쿨타임', `<div class="button-row compact home-utility-buttons"><button class="soft-button" data-action="open-shop" type="button">🛍️ 상점</button><button class="soft-button" data-action="open-food" type="button">🍚 밥 먹기</button></div>`)}
      ${actionDots(pet.daily.actionsLeft)}<p id="action-cooldown" class="helper">${actionCooldownText()}</p>
      <div class="action-grid">
        <button class="action-card life-action" data-action="work" type="button" ${lifeActionsLocked() ? 'disabled' : ''}><span>💼</span><strong>일하기</strong><small>+500P · 체력 -15 · 포만감 -${lifeHunger.work}</small></button>
        <button class="action-card life-action" data-action="cook" type="button" ${lifeActionsLocked() || pet.stats.hunger >= 100 ? 'disabled' : ''}><span>🍳</span><strong>요리하기</strong><small>포만감 +50 · 체력 -10 · 최대 100</small></button>
        <button class="action-card life-action" data-action="rest" type="button" ${lifeActionsLocked() || pet.stats.stamina >= 90 ? 'disabled' : ''}><span>🛋️</span><strong>쉬기</strong><small>체력 +40 · 포만감 -${lifeHunger.rest}</small></button>
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
  const davinci = rankRows(rankings.davinci?.top ?? [], (item) => `${item.wins}승 · 정답 ${item.correct}`);
  const myGameRanks = rankings.myGameRanks ?? {};
  const myRank = (item, value) => item
    ? `<div class="game-my-rank"><span>내 기록 · 전체 ${item.rank}위</span><strong>${value(item)}</strong></div>`
    : '<div class="game-my-rank empty-record"><span>내 기록</span><strong>아직 기록 없음</strong></div>';
  const mineRankings = rankings.minesweeper ?? { normal: [], hard: [], mine: {}, season: null };
  const mineTab = app.minesweeperRankTab === 'hard' ? 'hard' : 'normal';
  const mineRows = rankRows(mineRankings[mineTab] ?? [], (item) => `${(Number(item.ms || 0) / 1000).toFixed(1)}초`);
  const mineMyRank = myRank(mineRankings.mine?.[mineTab], (item) => `${(Number(item.ms || 0) / 1000).toFixed(1)}초`);
  const mineTabs = `<div class="mine-rank-tabs" role="tablist" aria-label="지뢰찾기 난이도"><button class="${mineTab === 'normal' ? 'active' : ''}" data-action="minesweeper-rank-tab" data-value="normal" type="button">보통</button><button class="${mineTab === 'hard' ? 'active' : ''}" data-action="minesweeper-rank-tab" data-value="hard" type="button">어려움</button></div>`;
  const mineCard = `<article class="rank-card mine-rank-card"><h3>💣 지뢰찾기 TOP 5</h3>${mineTabs}${mineRows}${mineMyRank}</article>`;
  const relationRows = app.rankingRelationsExpanded
    ? `<div class="rank-tabs-grid relation-rank-grid"><article class="rank-card"><h3>커플 D-Day</h3>${couples}</article><article class="rank-card"><h3>찌르기 TOP 5</h3>${pokes}</article></div>`
    : '';
  const relationToggle = `<button class="relation-ranking-toggle" data-action="toggle-relation-rankings" type="button" aria-expanded="${app.rankingRelationsExpanded ? 'true' : 'false'}"><span>커플 D-Day · 찌르기</span><strong>${app.rankingRelationsExpanded ? '접기 ▲' : '더보기 ▼'}</strong></button>`;
  return `<section class="section ranking-section">${sectionHeading('레고방 순위', '포인트·레벨과 게임 TOP 5')}<div class="rank-tabs-grid"><article class="rank-card"><h3>포인트 TOP 5</h3>${rankRows(rankings.points, (item) => points(item.points))}</article><article class="rank-card"><h3>레벨 TOP 5</h3>${rankRows(rankings.levels, (item) => `Lv.${item.level} · ${item.legoPower}`)}</article></div><div class="game-ranking-heading"><strong>게임 순위</strong><div class="game-ranking-meta"><small>모든 게임 순위는 3일 시즌 · 동시에 초기화</small><b id="game-season-countdown">${gameSeasonCountdownText(rankings.gameSeason?.endsAt)}</b></div></div><div class="game-rank-grid personal-game-rank-grid"><article class="rank-card"><h3>⚡ 번개반응 TOP 5</h3>${reaction}${myRank(myGameRanks.reaction, (item) => `${(Number(item.ms || 0) / 1000).toFixed(3)}초`)}</article>${mineCard}<article class="rank-card"><h3>🍎 사과게임 TOP 5</h3>${apple}${myRank(myGameRanks.apple, (item) => `${Number(item.score || 0).toLocaleString('ko-KR')}점`)}</article></div><div class="battle-game-rank-grid"><article class="rank-card"><h3>⚫ 오목 TOP 5</h3>${omok}${myRank(myGameRanks.omok, (item) => `${item.wins}승 ${item.draws}무 ${item.losses}패`)}</article><article class="rank-card"><h3>🧱 테트리스대전 TOP 5</h3>${blockBattle}${myRank(rankings.blockBattle?.mine, (item) => `${item.wins}승 ${item.losses}패`)}</article><article class="rank-card"><h3>🧩 다빈치코드 TOP 5</h3>${davinci}${myRank(rankings.davinci?.mine, (item) => `${item.wins}승 · 정답 ${item.correct}`)}</article></div><div class="relation-ranking-more">${relationToggle}${relationRows}</div></section>`;
}

function newsList() {
  const events = app.data.publicEvents ?? [];
  return events.length ? `<div class="news-list">${events.map((event) => `<article><span class="news-dot ${esc(event.type)}"></span><div><p>${esc(event.text)}</p><small>${dateText(event.createdAt)}</small></div></article>`).join('')}</div>` : '<div class="empty">아직 레고방 소식이 없습니다.</div>';
}

function miniGameIcon(gameId) {
  return ({ oddEven: '🌓', reaction: '⚡', number: '🔢', apple: '🍎', minesweeper: '💣', block: '🧱' })[gameId] || '🎮';
}

function gamesView() {
  const games = app.data.catalog.miniGames;
  const active = app.data.activeMiniChallenge;
  const activeGame = active ? games.find((game) => game.id === active.gameId) : null;
  const resume = active
    ? `<div class="active-game-banner"><div><strong>${esc(activeGame?.name || '개인게임')} 진행 중</strong><small>${active.gameId === 'minesweeper' ? '게임 화면을 나가면 포기 처리됩니다.' : '새로고침해도 이어서 할 수 있습니다.'}</small></div><button class="primary" data-action="resume-mini" type="button">${active.gameId === 'minesweeper' ? '게임으로 돌아가기' : '이어하기'}</button></div>`
    : '';
  return `
    <section class="page-title"><span class="eyebrow">포인트 게임</span><h1>게임</h1><p>개인게임으로 포인트를 벌고, 단체게임에서 오목·테트리스대전·다빈치코드를 즐길 수 있습니다.</p></section>
    <section class="section personal-game-wrap">${sectionHeading('포인트 개인게임', `이번 게임 하루 ${app.data.dashboard.pet.daily.miniGamesPlayed}/${app.data.dashboard.pet.daily.miniGamesLimit || app.data.catalog.miniGamesPerDay}회`)}${resume}<div class="game-grid">${games.map((game) => `<article class="game-card"><div class="game-icon">${miniGameIcon(game.id)}</div><h3>${esc(game.name)}</h3><p>${esc(game.description)}</p><button class="primary wide" data-action="${active?.gameId === game.id ? 'resume-mini' : 'start-mini'}" data-id="${game.id}" type="button" ${active && active.gameId !== game.id ? 'disabled' : ''}>${active?.gameId === game.id ? (game.id === 'minesweeper' ? '게임으로' : '이어하기') : '시작'}</button></article>`).join('')}</div></section>
    <div class="game-category-heading"><span>단체게임</span><small>실시간으로 다른 레고와 함께 플레이합니다.</small></div>
    <section class="section omok-wrap">${omokSection()}</section>
    <section class="section block-battle-wrap">${blockBattleSection()}</section>
    <section class="section davinci-wrap">${davinciSection()}</section>
  `;
}

function omokStatusLabel(status) {
  return ({ waiting: '대기중', playing: '게임중', ended: '종료' })[status] || status;
}

function serverAlignedNow(serverTime) {
  const base = Number(serverTime || Date.now());
  return base + (monotonicNow() - app.bootstrapSyncedAt);
}

function blockBattleServerNow() {
  const base = Number(app.data?.blockBattle?.serverTime || app.data?.serverTime || Date.now());
  return base + (monotonicNow() - app.blockBattleServerSyncedAt);
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

function spectatorReactionLiveContent(reactions = [], emptyText = '공감을 보내보세요.') {
  return reactions.length
    ? reactions.map((item) => `<span><b>${esc(item.displayName)}</b> ${esc(item.emoji)} ${esc(item.label)}</span>`).join('')
    : emptyText;
}

function spectatorReactionBar(scope, roomId, reactions = [], canSend = true, persistEmpty = false) {
  if (!canSend && !reactions.length && !persistEmpty) return '';
  const buttons = canSend ? [
    ['funny', '😂', 'ㅋㅋ'], ['like', '👍', '좋아요'], ['wow', '😮', '헉'], ['fire', '🔥', '대박'], ['clap', '👏', '박수'], ['cringe', '😬', '짜쳐요'], ['sleepy', '🥱', '졸려요']
  ].map(([type, emoji, label]) => `<button class="reaction-button" data-action="${scope}-reaction" data-reaction="${type}" ${roomId ? `data-id="${esc(roomId)}"` : ''} type="button"><span>${emoji}</span><small>${label}</small></button>`).join('') : '';
  const liveClass = reactions.length ? 'reaction-live' : 'reaction-live empty-live';
  const emptyMode = canSend ? 'prompt' : 'blank';
  const emptyText = canSend ? '공감을 보내보세요.' : '';
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
  return `${sectionHeading('오목게임', `${room.roomNumber}번방 · ${omokStatusLabel(room.status)}`, '<button class="text-button" data-action="omok-back" type="button">로비 보기</button>')}<div class="omok-game-head"><div><span class="omok-stone black small"></span><strong>${esc(room.black?.displayName || '흑 미정')}</strong></div><div class="omok-pot"><small>판돈</small><b>${points(room.stakePoints)}</b></div><div><span class="omok-stone white small"></span><strong>${esc(room.white?.displayName || '백 미정')}</strong></div></div>${room.status === 'waiting' ? `<div class="omok-wait"><strong>${esc(room.host?.displayName || '')}</strong><p>상대를 기다리는 중입니다.</p></div>` : `<div class="omok-status-line"><span>현재 차례 <b>${esc(turnName || '-')}</b></span><span>남은 시간 <b id="omok-countdown">${room.status === 'playing' ? '30초' : '-'}</b></span><span>관전자 ${room.spectatorCount}명</span></div><div class="omok-board-stage"><div class="omok-board" role="grid">${board}</div>${spectatorBurstLayer(room.reactions || [], 'omok')}</div>`}${resultText ? `<div class="result-card"><strong>${resultText}</strong><p>${esc(room.resultReason || '')}</p></div>` : ''}<div class="button-row">${rematch}${leave}</div>${isSpectator ? `${spectatorReactionBar('omok', room.id, room.reactions || [], true)}<p class="helper">관전자는 착수·판돈 변경·재대결 등 게임 입력을 할 수 없습니다.</p>` : isPlayer ? spectatorReactionBar('omok', room.id, room.reactions || [], true) : ''}`;
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

const BLOCK_BATTLE_GRAVITY_MS = 700;
const BLOCK_BATTLE_POINTER_REPEAT_DELAY_MS = 320;
const BLOCK_BATTLE_KEYBOARD_REPEAT_DELAY_MS = 190;
const BLOCK_BATTLE_REPEAT_INTERVAL_MS = 85;
const BLOCK_BATTLE_MAX_UNCONFIRMED_ACTIONS = 12;
const BLOCK_BATTLE_REPEATABLE_ACTIONS = new Set(['left', 'right', 'softDrop']);
const BLOCK_BATTLE_VERTICAL_ACTIONS = new Set(['softDrop', 'hardDrop', 'tick']);

function blockBattleStatusLabel(status) {
  return ({ waiting: '대기중', playing: '게임중', ended: '종료' })[status] || status;
}

function currentBlockBattleRoom() {
  if (app.blockBattleLobbyForced) return null;
  const rooms = app.data?.blockBattle?.rooms ?? [];
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
  return `${sectionHeading('테트리스대전', '10×20 · 7종 블록 · 1:1 실시간 대전', `<button class="primary" data-action="block-battle-create" type="button" ${canCreate ? '' : 'disabled'}>방 만들기</button>`)}<p class="helper block-battle-intro">여러 줄을 한 번에 지우면 상대에게 방해줄을 보냅니다. 낙하 속도는 일정하며 블록이 천장까지 쌓이면 패배합니다.</p><div class="block-battle-lobby-list">${cards}</div>`;
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
    : `<div class="block-battle-stage"><div class="block-battle-burst-slot" data-block-burst-slot>${spectatorBurstLayer(room.reactions || [], 'blockBattle')}</div><div class="block-battle-attack-slot" data-block-attack-slot>${attackNotice}</div><div class="block-battle-versus">${blockBattlePlayerPanel(self, { mine: isPlayer })}<div class="block-battle-vs"><b>VS</b><span data-block-speed>속도 고정</span><span data-block-spectators>관전자 ${Number(room.spectatorCount || 0)}명</span></div>${blockBattlePlayerPanel(opponent, { compact: true })}</div></div>`;
  return `${sectionHeading('테트리스대전', `${room.roomNumber}번방 · 판돈 ${points(room.stakePoints)} · ${blockBattleStatusLabel(room.status)}`, '<button class="text-button" data-action="block-battle-back" type="button">로비 보기</button>')}${reconnecting}${boards}${result}${controls}<div class="button-row">${rematch}${leave}</div>${isSpectator ? `${spectatorReactionBar('block-battle', room.id, room.reactions || [], true)}<p class="helper">관전자는 블록 조작·판돈·재대결에 참여할 수 없습니다.</p>` : isPlayer ? spectatorReactionBar('block-battle', room.id, room.reactions || [], true, true) : ''}`;
}

function blockBattleSection() {
  const room = currentBlockBattleRoom();
  return room ? blockBattleRoomView(room) : blockBattleLobby();
}

function davinciStatusLabel(status) {
  return ({ waiting: '대기중', playing: '게임중', ended: '종료' })[status] || status;
}

function davinciPhaseLabel(phase) {
  return ({
    waiting: '참가자 대기', jokerSetup: '조커 배치', rps: '가위바위보', orderChoice: '순서 선택',
    turn: '숫자 추리', drawnJokerPlacement: '조커 배치', deckPenalty: '패널티 타일 선택', ended: '게임 종료'
  })[phase] || phase;
}

function currentDavinciRoom() {
  if (app.davinciLobbyForced) return null;
  const rooms = app.data?.davinci?.rooms ?? [];
  let room = rooms.find((item) => item.id === app.davinciRoomId);
  if (!room) room = rooms.find((item) => item.viewerRole === 'player' || item.viewerRole === 'spectator');
  if (room) app.davinciRoomId = room.id;
  return room ?? null;
}

function davinciPlayerName(room, petId) {
  return room.players?.find((player) => player.petId === petId)?.displayName || '-';
}

function davinciLobby() {
  const game = app.data?.davinci ?? { rooms: [], maxRooms: 2 };
  const rooms = game.rooms ?? [];
  const roomByNumber = new Map(rooms.map((room) => [room.roomNumber, room]));
  const cards = Array.from({ length: game.maxRooms || 2 }, (_, index) => {
    const room = roomByNumber.get(index + 1);
    if (!room) return `<article class="davinci-lobby-card empty-room"><div><strong>${index + 1}번방</strong><small>비어있음 · 2~4인</small></div></article>`;
    const names = (room.players ?? []).map((player) => esc(player.displayName)).join(' · ');
    let action = '';
    if (room.viewerRole === 'player' || room.viewerRole === 'spectator') action = `<button class="soft-button" data-action="davinci-open" data-id="${room.id}" type="button">열기</button>`;
    else if (room.status === 'waiting') action = `<button class="primary" data-action="davinci-join" data-id="${room.id}" type="button" ${(room.players?.length || 0) >= 4 ? 'disabled' : ''}>참가</button>`;
    else if (room.status === 'playing') action = `<button class="soft-button" data-action="davinci-spectate" data-id="${room.id}" type="button">관전</button>`;
    else action = `<button class="ghost" data-action="davinci-open" data-id="${room.id}" type="button">결과</button>`;
    return `<article class="davinci-lobby-card"><div><strong>${room.roomNumber}번방 · ${names || '참가자 없음'}</strong><small>${room.players?.length || 0}/4명 · 판돈 ${points(room.stakePoints)} · ${davinciStatusLabel(room.status)}</small></div>${action}</article>`;
  }).join('');
  const canCreate = rooms.length < (game.maxRooms || 2) && !rooms.some((room) => room.viewerRole === 'player' && room.status !== 'ended');
  return `${sectionHeading('다빈치코드', '2~4인 · 숫자 추리 · 조커 포함 · 승자 판돈 독식', `<button class="primary" data-action="davinci-create" type="button" ${canCreate ? '' : 'disabled'}>방 만들기</button>`)}<p class="helper davinci-intro">검정·흰색 0~11과 조커 2개를 사용합니다. 숨겨진 상대 코드의 숫자를 맞히고 마지막까지 내 코드를 지켜내세요.</p><div class="davinci-lobby-list">${cards}</div>`;
}

function davinciTileHtml(tile, { selectable = false, penalty = false } = {}) {
  if (!tile) return '';
  const color = tile.color === 'white' ? 'white' : 'black';
  const value = tile.hidden ? '?' : tile.joker ? '−' : tile.value;
  const classes = ['davinci-tile', color, tile.hidden ? 'hidden-tile' : 'known-tile', tile.revealed ? 'revealed' : '', tile.drawn ? 'drawn' : ''].filter(Boolean).join(' ');
  if (selectable) return `<button class="${classes} selectable" data-action="davinci-target" data-target-pet="${esc(tile.ownerPetId)}" data-tile-id="${esc(tile.id)}" data-color="${color}" type="button"><b>${esc(value)}</b>${tile.revealed ? '<small>공개</small>' : ''}</button>`;
  if (penalty) return `<button class="${classes} selectable danger" data-action="davinci-penalty" data-tile-id="${esc(tile.id)}" type="button"><b>${esc(value)}</b><small>공개</small></button>`;
  return `<span class="${classes}"><b>${esc(value)}</b>${tile.revealed ? '<small>공개</small>' : ''}</span>`;
}

function davinciPlacementHtml(room, self, mode = 'initial') {
  const hand = self?.hand ?? [];
  const pending = mode === 'initial' ? self?.pendingJokers?.[0] : self?.drawnTile;
  const colorName = pending?.color === 'white' ? '흰색' : '검정';
  const slots = [];
  for (let position = 0; position <= hand.length; position += 1) {
    slots.push(`<button class="davinci-insert-slot" data-action="davinci-joker-position" data-position="${position}" type="button">＋</button>`);
    if (position < hand.length) slots.push(davinciTileHtml(hand[position]));
  }
  return `<div class="davinci-action-card"><strong>${colorName} 조커 ` + (mode === 'initial' ? '위치를 선택하세요' : '배치 위치를 선택하세요') + `</strong><p>조커는 어느 위치든 넣을 수 있고 한 번 배치하면 움직일 수 없습니다.</p><div class="davinci-placement">${slots.join('')}</div><small>20초 안에 고르지 않으면 서버가 안전하게 임의 배치합니다.</small></div>`;
}

function davinciRpsResultHtml(room) {
  const result = room.lastRpsResult;
  if (!result?.choices) return '';
  const emoji = { rock: '✊', paper: '✋', scissors: '✌️' };
  const label = { rock: '바위', paper: '보', scissors: '가위' };
  const entries = Object.entries(result.choices).map(([petId, choice]) => `<span><b>${esc(davinciPlayerName(room, petId))}</b> ${emoji[choice] || ''} ${label[choice] || ''}</span>`).join('');
  const outcome = result.tie
    ? '<strong>무승부 · 다시!</strong>'
    : result.winnerPetIds?.length === 1
      ? `<strong>🏆 ${esc(davinciPlayerName(room, result.winnerPetIds[0]))} 승리!</strong>`
      : `<strong>${(result.winnerPetIds || []).map((id) => esc(davinciPlayerName(room, id))).join(' · ')} 다음 라운드 진출</strong>`;
  return `<div class="davinci-rps-result"><div class="davinci-rps-pop"><span>3 · 2 · 1 · </span><b>뿅!</b></div><div class="davinci-rps-reveal">${entries}</div>${outcome}</div>`;
}

function davinciRpsHtml(room, self) {
  const emoji = { rock: '✊', paper: '✋', scissors: '✌️' };
  const label = { rock: '바위', paper: '보', scissors: '가위' };
  const resultHtml = davinciRpsResultHtml(room);
  const candidate = room.rpsCandidates?.includes(self?.petId);
  const myChoice = self ? room.rpsChoices?.[self.petId] : null;
  const controls = self && candidate ? myChoice
    ? `<div class="davinci-selected">${emoji[myChoice]} ${label[myChoice]} 선택 완료 · 다른 참가자를 기다리는 중</div>`
    : `<div class="davinci-rps-buttons"><button data-action="davinci-rps" data-value="scissors" type="button">✌️<small>가위</small></button><button data-action="davinci-rps" data-value="rock" type="button">✊<small>바위</small></button><button data-action="davinci-rps" data-value="paper" type="button">✋<small>보</small></button></div>`
    : '<p class="helper centered">가위바위보 결과를 기다리는 중입니다.</p>';
  return `<div class="davinci-action-card"><strong>가위바위보 · ${room.rpsRound}라운드</strong><p>마지막 승자가 선공 또는 후공을 선택합니다.</p>${resultHtml}${controls}</div>`;
}

function davinciOrderHtml(room, self) {
  const winnerName = davinciPlayerName(room, room.rpsWinnerPetId);
  const finalResult = davinciRpsResultHtml(room);
  if (self?.petId === room.rpsWinnerPetId) return `<div class="davinci-action-card">${finalResult}<strong>🏆 ${esc(winnerName)} 가위바위보 승리!</strong><p>선공과 후공 중 하나를 선택하세요.</p><div class="button-row"><button class="primary" data-action="davinci-order" data-value="first" type="button">선공</button><button class="soft-button" data-action="davinci-order" data-value="last" type="button">후공</button></div></div>`;
  return `<div class="davinci-action-card">${finalResult}<strong>🏆 ${esc(winnerName)} 승리</strong><p>선공·후공 선택을 기다리는 중입니다.</p></div>`;
}

function davinciGuessPanel(room) {
  const selected = app.davinciGuessTarget;
  if (!selected || !room.isMyTurn || room.phase !== 'turn' || room.awaitingDecision) return '';
  const target = room.players?.find((player) => player.petId === selected.targetPetId);
  const tile = target?.hand?.find((item) => item.id === selected.tileId && item.hidden && !item.revealed);
  if (!target || !tile) { app.davinciGuessTarget = null; return ''; }
  const choices = [...Array(12).keys()].map((value) => `<button data-action="davinci-guess" data-value="${value}" type="button">${value}</button>`).join('') + `<button class="joker" data-action="davinci-guess" data-value="joker" type="button">−<small>조커</small></button>`;
  return `<div class="davinci-guess-panel"><strong>${esc(target.displayName)}의 ${tile.color === 'white' ? '⬜ 흰색' : '⬛ 검정'} 타일 추리</strong><p>숫자 또는 조커를 선택하세요.</p><div class="davinci-number-grid">${choices}</div><button class="text-button" data-action="davinci-target-cancel" type="button">선택 취소</button></div>`;
}

function davinciRecentLog(room) {
  if (!(room.guessLog || []).length) return '<div class="davinci-log empty">아직 추리 기록이 없습니다.</div>';
  return `<div class="davinci-log"><strong>최근 추리 · 6개까지</strong>${room.guessLog.map((item) => `<div><span>${esc(item.actorName)} → ${esc(item.targetName)}</span><b>${item.color === 'white' ? '⬜' : '⬛'} ${esc(item.guess)}</b><em class="${item.correct ? 'correct' : 'wrong'}">${item.correct ? '정답' : '오답'}</em></div>`).join('')}</div>`;
}

function davinciRoomView(room) {
  const self = room.players?.find((player) => player.petId === room.selfPetId) ?? null;
  const isPlayer = room.viewerRole === 'player';
  const isSpectator = room.viewerRole === 'spectator';
  const activeOthers = (room.players ?? []).filter((player) => player.petId !== room.selfPetId);
  const currentName = davinciPlayerName(room, room.currentTurnPetId);
  let phaseAction = '';
  if (isPlayer && room.status === 'playing') {
    if (room.phase === 'jokerSetup' && self?.pendingJokerCount > 0) phaseAction = davinciPlacementHtml(room, self, 'initial');
    else if (room.phase === 'jokerSetup') phaseAction = '<div class="davinci-action-card"><strong>조커 배치 대기 중</strong><p>다른 참가자의 조커 배치를 기다리고 있습니다.</p></div>';
    else if (room.phase === 'rps') phaseAction = davinciRpsHtml(room, self);
    else if (room.phase === 'orderChoice') phaseAction = davinciOrderHtml(room, self);
    else if (room.phase === 'drawnJokerPlacement' && room.isMyTurn && self?.drawnTile?.joker) phaseAction = davinciPlacementHtml(room, self, 'drawn');
    else if (room.phase === 'deckPenalty' && room.isMyTurn) phaseAction = `<div class="davinci-action-card danger"><strong>오답 패널티</strong><p>덱이 비어 있어 내 비공개 타일 하나를 공개해야 합니다.</p></div>`;
    else if (room.phase === 'turn' && room.isMyTurn && room.awaitingDecision) phaseAction = `<div class="davinci-action-card success"><strong>정답!</strong><p>계속 추리할까요, 여기서 멈출까요?</p><div class="button-row"><button class="primary" data-action="davinci-decision" data-value="continue" type="button">계속 추리</button><button class="soft-button" data-action="davinci-decision" data-value="stop" type="button">여기서 멈추기</button></div></div>`;
  }
  if (isSpectator && room.status === 'playing') {
    if (room.phase === 'jokerSetup') phaseAction = '<div class="davinci-action-card"><strong>게임 준비 중</strong><p>참가자들이 조커 배치를 마치는 중입니다.</p></div>';
    else if (room.phase === 'rps') phaseAction = davinciRpsHtml(room, null);
    else if (room.phase === 'orderChoice') phaseAction = davinciOrderHtml(room, null);
  }
  const ownPanel = self ? `<article class="davinci-player-panel mine ${self.eliminated || self.forfeited ? 'eliminated' : ''}"><header><div><strong>${esc(self.displayName)}</strong><small>내 코드${self.eliminated ? ' · 코드 해독 완료' : self.forfeited ? ' · 포기' : ''}</small></div><span>${self.connected ? '접속중' : '재접속 대기'}</span></header><div class="davinci-hand">${self.hand.map((tile) => davinciTileHtml(tile, { penalty: room.phase === 'deckPenalty' && room.isMyTurn && !tile.revealed })).join('') || '<span class="empty">배치 준비 중</span>'}</div>${self.drawnTile ? `<div class="davinci-drawn"><small>이번 턴 뽑은 타일</small>${davinciTileHtml(self.drawnTile)}</div>` : ''}</article>` : '';
  const opponents = activeOthers.map((player) => {
    const canTarget = isPlayer && room.status === 'playing' && room.phase === 'turn' && room.isMyTurn && !room.awaitingDecision && !player.eliminated && !player.forfeited;
    return `<article class="davinci-player-panel opponent ${player.eliminated || player.forfeited ? 'eliminated' : ''}"><header><div><strong>${esc(player.displayName)}</strong><small>${player.eliminated ? '💀 코드 해독 완료' : player.forfeited ? '기권' : `정답 ${Number(player.correctGuesses || 0)}`}</small></div><span>${room.currentTurnPetId === player.petId ? '현재 차례' : player.connected ? '' : '오프라인'}</span></header><div class="davinci-hand">${player.hand.map((tile) => davinciTileHtml(tile, { selectable: canTarget && tile.hidden && !tile.revealed })).join('') || '<span class="empty">배치 준비 중</span>'}</div></article>`;
  }).join('');
  const waiting = room.status === 'waiting' ? `<div class="davinci-waiting"><div class="davinci-seat-list">${(room.players || []).map((player) => `<div class="davinci-seat"><span>${player.petId === room.hostPetId ? '👑' : '•'}</span><strong>${esc(player.displayName)}</strong><small>${player.petId === room.hostPetId ? '방장' : player.ready ? '준비 완료' : '준비 전'}</small></div>`).join('')}${Array.from({ length: Math.max(0, 4 - (room.players?.length || 0)) }, () => '<div class="davinci-seat empty"><span>＋</span><strong>빈자리</strong><small>참가 대기</small></div>').join('')}</div></div>` : '';
  const allGuestsReady = (room.players || []).filter((player) => player.petId !== room.hostPetId && !player.leftRoom).every((player) => player.ready);
  const seatedCount = (room.players || []).filter((player) => !player.leftRoom).length;
  const waitingControls = room.status === 'waiting' && isPlayer ? (self?.petId === room.hostPetId
    ? `<button class="primary" data-action="davinci-start" data-id="${room.id}" type="button" ${seatedCount < 2 || !allGuestsReady ? 'disabled' : ''}>게임 시작</button>`
    : `<button class="primary" data-action="davinci-ready" data-id="${room.id}" data-ready="${self?.ready ? 'false' : 'true'}" type="button">${self?.ready ? '준비 취소' : '준비'}</button>`) : '';
  const result = room.status === 'ended' ? `<div class="result-card"><strong>${room.winnerPetId ? `${esc(davinciPlayerName(room, room.winnerPetId))} 승리!` : '게임 종료'}</strong><p>${esc(room.resultReason || '')}</p><small>총 판돈 ${points(Number(room.stakePoints || 0) * Number(room.players?.length || 0))}</small></div>` : '';
  const rematch = isPlayer && room.status === 'ended' ? `<button class="primary" data-action="davinci-rematch" data-id="${room.id}" type="button" ${room.rematchRequestedByMe ? 'disabled' : ''}>${room.rematchRequestedByMe ? `재대결 대기 (${room.rematchRequests?.length || 0}/${room.rematchEligibleCount || room.players?.length || 0})` : '재대결'}</button>` : '';
  const leave = isSpectator ? `<button class="ghost" data-action="davinci-spectate-leave" data-id="${room.id}" type="button">관전 나가기</button>` : isPlayer ? `<button class="ghost" data-action="davinci-leave" data-id="${room.id}" type="button">${room.status === 'playing' ? '포기하고 나가기' : '나가기'}</button>` : `<button class="ghost" data-action="davinci-back" type="button">로비로</button>`;
  const gameBody = room.status === 'waiting' ? waiting : `<div class="davinci-stage"><div class="davinci-burst-slot">${spectatorBurstLayer(room.reactions || [], 'davinci')}</div><div class="davinci-status"><span>단계 <b>${esc(davinciPhaseLabel(room.phase))}</b></span><span>현재 차례 <b>${esc(currentName)}</b></span><span>남은 타일 <b>${Number(room.deckCount || 0)}개</b></span><span>남은 시간 <b id="davinci-countdown">-</b></span><span>관전자 <b>${Number(room.spectatorCount || 0)}명</b></span></div>${phaseAction}${ownPanel}<div class="davinci-opponents">${opponents}</div>${davinciGuessPanel(room)}${davinciRecentLog(room)}</div>`;
  return `${sectionHeading('다빈치코드', `${room.roomNumber}번방 · ${room.players?.length || 0}명 · 판돈 ${points(room.stakePoints)} · ${davinciStatusLabel(room.status)}`, '<button class="text-button" data-action="davinci-back" type="button">로비 보기</button>')}${gameBody}${result}<div class="button-row">${waitingControls}${rematch}${leave}</div>${room.status === 'playing' && (isPlayer || isSpectator) ? spectatorReactionBar('davinci', room.id, room.reactions || [], true, true) : ''}${isSpectator ? '<p class="helper">관전자는 공개된 숫자와 조커만 볼 수 있으며 게임 입력에는 참여할 수 없습니다.</p>' : ''}`;
}

function davinciSection() {
  const room = currentDavinciRoom();
  return room ? davinciRoomView(room) : davinciLobby();
}

function blockBattleBoardNode(playerId, root = document) {
  const id = String(playerId || '');
  return [...root.querySelectorAll('.block-battle-board')].find((item) => item.dataset.blockPlayer === id) ?? null;
}

function paintBlockBattleBoard(player, root = document, { activeOnly = false } = {}) {
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
  const previousActive = Array.isArray(board.__blockBattleActiveIndices) ? board.__blockBattleActiveIndices : [];
  const currentActive = [...activeCells.keys()];
  const indices = activeOnly && board.__blockBattlePaintReady
    ? [...new Set([...previousActive, ...currentActive])]
    : Array.from({ length: 200 }, (_, index) => index);

  for (const index of indices) {
    const row = Math.floor(index / 10);
    const col = index % 10;
    const type = activeCells.get(index) ?? player?.board?.[row]?.[col] ?? null;
    const className = `block-battle-cell${type ? ` piece-${type}` : ''}`;
    if (cache[index] !== className) {
      cells[index].className = className;
      cache[index] = className;
    }
  }
  board.__blockBattleActiveIndices = currentActive;
  board.__blockBattlePaintReady = true;
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
  const speedText = '속도 고정';
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

function blockBattleVerticalWouldLock(room = currentBlockBattleRoom()) {
  const player = room?.players?.[room.selfPetId];
  if (!player?.active) return true;
  const candidate = { ...player.active, row: Number(player.active.row) + 1 };
  return blockBattleLocalCollision(player, candidate);
}

function blockBattleHasUnconfirmedVerticalInput() {
  const tickPending = app.blockBattleInputBuffer.some((action) => BLOCK_BATTLE_VERTICAL_ACTIONS.has(action))
    || app.blockBattlePendingBatches.some((batch) =>
      batch.message.actions.some((action) => BLOCK_BATTLE_VERTICAL_ACTIONS.has(action)));
  return tickPending;
}

function blockBattleAwaitingLock() {
  return Boolean(app.blockBattleLockQueued)
    || app.blockBattlePendingBatches.some((batch) => batch.expectsLock);
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
  // 좌우/낙하 입력 때마다 200칸 전체를 다시 검사하지 않고 활성 블록 주변만 갱신한다.
  if (paint && changed) paintBlockBattleBoard(player, document, { activeOnly: true });
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
  app.blockBattlePredictedGravity = null;
  app.blockBattleLockQueued = false;
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
  const roomPendingBatches = app.blockBattlePendingBatches
    .filter((batch) => batch.message.roomId === room.id && batch.message.matchId === room.matchId);
  const pendingActions = roomPendingBatches.flatMap((batch) => batch.message.actions);
  // lock을 일으키는 tick/softDrop/hardDrop이 서버에서 확정되기 전에는 뒤에 대기한 입력을
  // 이전 active 블록에 다시 그리지 않는다. lock → 줄삭제 → 새 블록 생성 경계를 서버와 한 번에 맞춘다.
  const awaitingLock = roomPendingBatches.some((batch) => batch.expectsLock);
  const actions = awaitingLock ? pendingActions : [...pendingActions, ...app.blockBattleInputBuffer];
  for (const action of actions) previewBlockBattleInput(action, { room, paint: false });
  // 상대 입력 등으로 더 최신 서버 상태가 도착해도 아직 ACK되지 않은 내 낙하 입력의
  // 로컬 중력 기준은 유지한다. 서버 snapshot의 이전 gravityDueAt이 잠깐 되살아나면
  // 같은 낙하 주기를 두 번 예약할 수 있으므로 ACK 전까지는 로컬 예정시각을 보존한다.
  const predictionKey = `${room.id}:${room.matchId}`;
  const saved = app.blockBattlePredictedGravity;
  const savedDeadline = Number(saved?.deadlineAt);
  const savedValid = saved?.key === predictionKey
    && Number.isFinite(new Date(saved.dueAt).getTime())
    && Number.isFinite(savedDeadline)
    && savedDeadline >= monotonicNow() - 40;
  const hasPredictedGravityAction = actions.some((action) => ['softDrop', 'hardDrop', 'tick'].includes(action));
  if (hasPredictedGravityAction || savedValid) {
    const player = room.players?.[room.selfPetId];
    const dueAt = savedValid ? saved.dueAt : new Date(blockBattleServerNow() + BLOCK_BATTLE_GRAVITY_MS).toISOString();
    const deadlineAt = savedValid ? savedDeadline : monotonicNow() + BLOCK_BATTLE_GRAVITY_MS;
    app.blockBattlePredictedGravity = { key: predictionKey, dueAt, deadlineAt };
    if (player) player.gravityDueAt = dueAt;
  } else if (saved?.key === predictionKey) {
    // 로컬 예정시각이 이미 지나갔다면 서버 상태의 authoritative gravityDueAt으로 복귀한다.
    app.blockBattlePredictedGravity = null;
  }
  if (paint) paintBlockBattleBoard(room.players?.[room.selfPetId]);
}

function syncBlockBattleGravity() {
  const room = currentBlockBattleRoom();
  const active = app.tab === 'games' && !document.hidden && navigator.onLine
    && room?.viewerRole === 'player' && room.status === 'playing'
    && Object.values(room.players || {}).every((player) => player.connected);
  const gravity = BLOCK_BATTLE_GRAVITY_MS;
  const self = active ? room.players?.[room.selfPetId] : null;
  const dueAt = self?.gravityDueAt || null;
  // 서버가 계산한 다음 낙하시각까지 key에 포함한다. 수동 하강/하드드롭/서버 ACK로
  // 중력 기준시각이 바뀌면 기존 setTimeout을 폐기하고 정확한 다음 주기로 다시 맞춘다.
  const key = active ? `${room.matchId}:${gravity}:${dueAt || 'fallback'}` : null;
  if (app.blockBattleGravityKey === key) return;
  clearTimeout(app.blockBattleGravityTimer);
  app.blockBattleGravityTimer = null;
  app.blockBattleGravityKey = key;
  if (!active) return;

  const dueMs = new Date(dueAt || '').getTime();
  const initialDelay = Number.isFinite(dueMs)
    ? Math.max(16, Math.min(gravity, dueMs - blockBattleServerNow()))
    : gravity;
  const run = () => {
    app.blockBattleGravityTimer = null;
    if (app.blockBattleGravityKey !== key) return;
    if (!document.hidden && app.tab === 'games') queueBlockBattleInput('tick');
    // queueBlockBattleInput이 로컬 gravityDueAt을 갱신하면 syncBlockBattleGravity가
    // 새 key로 다음 타이머를 이미 예약한다. 서버 ACK가 늦는 경우에만 안전하게 재예약한다.
    if (app.blockBattleGravityKey === key) app.blockBattleGravityTimer = setTimeout(run, gravity);
  };
  app.blockBattleGravityTimer = setTimeout(run, initialDelay);
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
  const waitingViewerAutoExit = Boolean(previous?.status === 'waiting' && previous.viewerRole === 'none'
    && room.status === 'playing' && room.viewerRole === 'none' && app.blockBattleRoomId === room.id);
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
  app.blockBattleServerSyncedAt = monotonicNow();
  if (waitingViewerAutoExit) {
    app.blockBattleRoomId = null;
    app.blockBattleLobbyForced = true;
    resetBlockBattleInputQueue();
    scheduleBlockBattleDomUpdate(true);
    updateAppChrome();
    syncBlockBattleGravity();
    return true;
  }
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
  updateAppChrome();
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
      app.blockBattleLockQueued = false;
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
  const expectsLock = Boolean(app.blockBattleLockQueued);
  app.blockBattleLockQueued = false;
  if (!room || !actions.length || room.viewerRole !== 'player' || room.status !== 'playing') return;
  const requestId = crypto.randomUUID?.() || `block-input-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const message = { type: 'block-battle-input', roomId: room.id, matchId: room.matchId, actions, requestId };
  const batch = { message, retryTimer: null, expectsLock };
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

  // 바닥 충돌을 서버가 lock → 줄삭제 → 새 블록 생성으로 확정하는 짧은 구간에는
  // 이전 active 블록을 더 움직이지 않는다. 천장에 가까울수록 lock 빈도가 높아지므로
  // 이 장벽이 없으면 오래된 블록에 입력을 미리 그렸다가 새 블록 상태로 교체되며
  // 모양이 깨지거나 위아래로 튀는 것처럼 보일 수 있다.
  if (blockBattleAwaitingLock()) return false;

  const awaitingHardDrop = app.blockBattlePendingBatches.some((batch) => batch.message.actions.includes('hardDrop'))
    || app.blockBattleInputBuffer.includes('hardDrop');
  if (action === 'tick') {
    // 자동 낙하와 수동 하강/하드드롭을 같은 미확정 구간에 겹치지 않는다.
    // 둘이 한 서버 배치에 같은 시각으로 들어가면 lock 경계에서 새 블록까지 한 칸
    // 움직이는 것처럼 보일 수 있으므로 수직 입력은 하나씩 확정한다.
    if (blockBattleHasUnconfirmedVerticalInput() || awaitingHardDrop) return false;
  }

  const unconfirmedActions = app.blockBattleInputBuffer.length + app.blockBattlePendingBatches
    .reduce((count, batch) => count + batch.message.actions.length, 0);
  if (unconfirmedActions >= BLOCK_BATTLE_MAX_UNCONFIRMED_ACTIONS && action !== 'hardDrop') return false;

  const willLock = action === 'hardDrop'
    || (['softDrop', 'tick'].includes(action) && blockBattleVerticalWouldLock(room));

  if (action !== 'tick' && !awaitingHardDrop) {
    const changed = previewBlockBattleInput(action);
    if (!changed && ['left', 'right', 'rotate'].includes(action)) return false;
  } else if (action === 'tick') {
    previewBlockBattleInput(action);
  }

  app.blockBattleInputBuffer.push(action);
  if (willLock) app.blockBattleLockQueued = true;

  if (BLOCK_BATTLE_VERTICAL_ACTIONS.has(action)) {
    const self = room.players?.[room.selfPetId];
    const dueAt = new Date(blockBattleServerNow() + BLOCK_BATTLE_GRAVITY_MS).toISOString();
    app.blockBattlePredictedGravity = { key: `${room.id}:${room.matchId}`, dueAt, deadlineAt: monotonicNow() + BLOCK_BATTLE_GRAVITY_MS };
    if (self) self.gravityDueAt = dueAt;
    syncBlockBattleGravity();
  }

  // 낙하 입력은 지연 배치하지 않는다. 특히 자동 tick이 24ms 창에서 softDrop과
  // 합쳐지는 것을 막아 서버와 로컬의 Y 진행 순서를 항상 동일하게 유지한다.
  if (BLOCK_BATTLE_VERTICAL_ACTIONS.has(action)
    || app.blockBattleInputBuffer.length >= BLOCK_BATTLE_MAX_UNCONFIRMED_ACTIONS) {
    flushBlockBattleInputs();
  } else if (!app.blockBattleFlushTimer) {
    app.blockBattleFlushTimer = setTimeout(flushBlockBattleInputs, 24);
  }
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
  return `<button class="profile-mini${flexProfileClass(profile)}" data-action="profile" data-id="${profile.id}" type="button">${workoutBadgeHtml(profile, { compact: true })}${seasonBadgesHtml(profile)}${avatar(stage, { mini: true, flexItem: profile.flexItem })}<strong>${levelBadgeHtml(profile)}<span class="flex-display-name">${esc(profile.displayName)}</span></strong>${profile.statusMessage ? `<span class="profile-status-message">${esc(profile.statusMessage)}</span>` : ''}<small>${profile.online ? '🟢 ' : ''}Lv.${profile.stats.level} · ${points(profile.stats.points)}</small></button>`;
}

function recordsView() {
  const pet = app.data.dashboard.pet;
  const records = pet.records;
  return `<section class="page-title"><span class="eyebrow">기록</span><h1>${esc(pet.displayName)}의 기록</h1><p>현재 레고의 핵심 기록만 표시합니다.</p></section><section class="section"><div class="record-grid">${compactMetric('세대', `${pet.generation}세대`)}${compactMetric('생존', `${records.days}게임일`)}${compactMetric('레벨', `Lv.${pet.stats.level}`)}${compactMetric('레고력', `${pet.stats.legoPower}`)}${compactMetric('포인트', points(pet.stats.points))}${compactMetric('최고 포인트', points(records.maxPoints))}${compactMetric('개인게임', `${records.miniGames || 0}회`)}${compactMetric('벙 완료', `${records.bungs || 0}회`)}${compactMetric('영토전 우승', `${records.territoryWins}회`)}${compactMetric('테트리스대전', `${records.blockBattleWins || 0}승 ${records.blockBattleLosses || 0}패`)}${compactMetric('다빈치코드', `${records.davinciTotalWins || 0}승 · 정답 ${records.davinciTotalCorrect || 0}`)}${compactMetric('번개 최고', records.bestReactionMs ? `${(records.bestReactionMs/1000).toFixed(3)}초` : '-')}${compactMetric('낚시', `${records.fishing}회`)}</div></section>${app.data.admin.isAdmin ? `<section class="section admin-callout"><div><h2>운영자 관리</h2><p>포인트 지급·회수, 강퇴, 계정 삭제, 상태 초기화와 진행 중 벙·오목·테트리스대전·다빈치코드 방 관리를 할 수 있습니다.</p></div><button class="primary" data-action="open-admin" type="button">관리 열기</button></section>` : ''}<section class="section"><button class="danger-button wide" data-action="logout" type="button">모든 기기에서 로그아웃</button></section>`;
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
  const blockRoom = app.data ? currentBlockBattleRoom() : null;
  const blockBattlePlaying = app.tab === 'games' && blockRoom?.viewerRole === 'player' && blockRoom.status === 'playing';
  document.body.classList.toggle('block-battle-playing', Boolean(blockBattlePlaying));
  $$('.nav-item').forEach((button) => button.classList.toggle('active', button.dataset.tab === app.tab));
  const onlineCount = $('#online-count');
  if (onlineCount) onlineCount.textContent = app.data?.onlineCount || 0;
  const unread = (app.data?.notifications ?? []).filter((item) => !item.read).length;
  const badge = $('#notification-badge');
  if (badge) {
    badge.textContent = unread;
    badge.classList.toggle('hidden', unread === 0);
  }
  syncSupportBanner();
}

function renderTab(tab, { force = false } = {}) {
  if (!app.data || !MAIN_TABS.includes(tab)) return;
  const pane = $('#view .tab-pane');
  if (pane?.dataset.pane !== tab) return;
  if (!pane) return;
  const alreadyRendered = pane.dataset.rendered === 'true';
  const dirty = app.dirtyTabs instanceof Set && app.dirtyTabs.has(tab);
  if (!force && alreadyRendered && !dirty) return;
  pane.innerHTML = tabHtml(tab);
  pane.dataset.rendered = 'true';
  pane.dataset.revision = String(app.revision);
  app.dirtyTabs.delete(tab);

  if (tab === 'games') {
    requestAnimationFrame(() => {
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
  const cards = bodyStages().map((stage, index) => { const life = lifeHungerCostsForStage(stage); return `<article class="body-guide-card ${stage.key === current.key ? 'current' : ''}"><span class="body-guide-step">${index + 1}단계</span>${avatar(stage, { mini: true })}<div><strong>${esc(stage.label)}</strong><small>몸집 ${esc(bodyRangeLabel(stage))}</small><small>게임·교미·영토 포만감 -${Math.max(1, Number(stage.activityHungerCost) || 1)}</small><small>생활: 일 -${life.work} · 쉬기 -${life.rest} · 요리 포만감 +50 · 체력 -10</small>${stage.key === current.key ? '<b>현재 단계</b>' : ''}</div></article>`; }).join('');
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
    return `<article class="food-card food-${esc(food.category)} ${locked ? 'locked' : ''}"><span class="food-tier">${food.tier}단계</span><strong>${esc(food.name)}</strong><small>포만감 +${food.hunger}</small><small>${esc(effectText(Number(food.body) || 0))}</small><button class="primary" data-action="eat" data-id="${esc(food.id)}" type="button" ${locked ? 'disabled' : ''}>${locked ? `Lv.${food.minLevel}` : points(food.price)}</button></article>`;
  };
  const rows = [...byTier.entries()].sort((a, b) => a[0] - b[0]).map(([, row]) => `<div class="food-tier-row">${card(row.gain)}${card(row.maintain)}${card(row.diet)}</div>`).join('');
  openModal(`${modalHeader('음식 먹이기', `현재 Lv.${level} · 보유 포인트 ${points(app.data.dashboard.pet.stats.points)}`)}<div class="food-column-heads"><b>살찌는 음식</b><b>유지 음식</b><b>다이어트 음식</b></div><div class="food-matrix">${rows}</div><p class="helper centered">레벨이 오르면 같은 줄의 다음 단계 음식 3종이 함께 해금됩니다.</p>`, { type: 'food' });
}

function shopTimeLabel(value) {
  return value ? `${dateText(value)}까지` : '';
}

function shopActionFor(item, shop) {
  if (item.id === 'lottery') {
    const plays = Number(shop.lotteryPlays || 0);
    const maxPlays = Math.max(1, Number(shop.lotteryMaxPlays || item.maxPlays || 3));
    if (plays >= maxPlays) return '<button class="primary" type="button" disabled>오늘 완료</button>';
    return `<button class="primary" data-action="buy-shop" data-id="lottery" type="button">${points(shop.lotteryNextPrice ?? item.price)}</button>`;
  }
  if (item.id === 'staminaHour' && shop.effects?.staminaFullUntil) return '<button class="primary" type="button" disabled>사용 중</button>';
  if (item.id === 'hungerHour' && shop.effects?.hungerFullUntil) return '<button class="primary" type="button" disabled>사용 중</button>';
  if (item.id === 'loudspeaker') {
    if (activeLoudspeaker()) return '<button class="primary" type="button" disabled>방송 중</button>';
    return `<button class="primary" data-action="buy-loudspeaker" data-id="loudspeaker" type="button">${points(item.price)}</button>`;
  }
  return `<button class="primary" data-action="buy-shop" data-id="${esc(item.id)}" type="button">${points(item.price)}</button>`;
}

function shopStatusFor(item, shop) {
  if (item.id === 'miniGame10' && Number(shop.miniGameBonus) > 0) return `이번 게임 하루 추가 +${shop.miniGameBonus}회 · 총 ${shop.miniGamesLimit}회`;
  if (item.id === 'fishing5' && Number(shop.fishingBonus) > 0) return `이번 게임 하루 추가 +${shop.fishingBonus}회 · 총 ${shop.fishingLimit}회`;
  if (item.id === 'lottery' && shop.lastLotteryResult) return `오늘 ${shop.lotteryPlays}/${shop.lotteryMaxPlays || item.maxPlays || 3}회 · 최근 ${shop.lastLotteryResult.prize ? points(shop.lastLotteryResult.prize) : '꽝'}`;
  if (item.id === 'staminaHour' && shop.effects?.staminaFullUntil) return `체력 100% · ${shopTimeLabel(shop.effects.staminaFullUntil)}`;
  if (item.id === 'hungerHour' && shop.effects?.hungerFullUntil) return `포만감 100% · ${shopTimeLabel(shop.effects.hungerFullUntil)}`;
  if (item.id === 'loudspeaker') {
    const loudspeaker = activeLoudspeaker();
    if (loudspeaker) return `${loudspeaker.displayName} 확성기 방송 중`;
  }
  return '';
}

function loudspeakerShopCard(item, shop) {
  const active = activeLoudspeaker();
  const maxLength = Math.max(1, Number(item.maxLength) || 30);
  const durationSeconds = Math.max(1, Number(item.durationSeconds) || 10);
  const status = shopStatusFor(item, shop);
  const draft = [...String(app.loudspeakerDraft || '')].slice(0, maxLength).join('');
  return `<article class="shop-card loudspeaker-shop-card"><span class="shop-icon" aria-hidden="true">${esc(item.icon)}</span><div class="loudspeaker-shop-copy"><strong>${esc(item.name)}</strong><p>${esc(item.description)}</p><small id="loudspeaker-shop-status">${esc(status || `최대 ${maxLength}자 · ${durationSeconds}초`)}</small><div class="loudspeaker-compose"><input id="loudspeaker-message-input" type="text" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="확성기 메시지 입력" data-max-length="${maxLength}" maxlength="${maxLength * 2}" value="${esc(draft)}" ${active ? 'disabled' : ''}><span id="loudspeaker-message-count">${[...draft].length}/${maxLength}</span></div></div><button id="loudspeaker-use-button" class="primary" data-action="buy-loudspeaker" data-id="loudspeaker" type="button" ${active ? 'disabled' : ''}>${active ? '방송 중' : points(item.price)}</button></article>`;
}

function updateLoudspeakerShopState() {
  if (app.modal?.type !== 'shop') return;
  const item = (app.data?.catalog?.shopItems ?? []).find((entry) => entry.id === 'loudspeaker');
  if (!item) return;
  const active = activeLoudspeaker();
  const input = $('#loudspeaker-message-input');
  const button = $('#loudspeaker-use-button');
  const status = $('#loudspeaker-shop-status');
  if (input) input.disabled = Boolean(active);
  if (button) { button.disabled = Boolean(active); button.textContent = active ? '방송 중' : points(item.price); }
  if (status) {
    if (active) {
      const remaining = Math.max(0, Math.ceil((new Date(active.expiresAt).getTime() - serverAlignedNow(app.data?.serverTime)) / 1000));
      status.textContent = `${active.displayName} 확성기 방송 중 · ${remaining}초 남음`;
    } else status.textContent = `최대 ${Math.max(1, Number(item.maxLength) || 30)}자 · ${Math.max(1, Number(item.durationSeconds) || 10)}초`;
  }
}

function openShop() {
  // 명시적 상점 재렌더 직전에도 현재 DOM 값을 먼저 보존한다.
  // input 이벤트가 아직 처리되지 않은 IME 경계에서도 작성 중 문구가 빈 값으로 되돌아가는 것을 막는다.
  const existingLoudspeakerInput = $('#loudspeaker-message-input');
  if (existingLoudspeakerInput) app.loudspeakerDraft = existingLoudspeakerInput.value;
  const items = [...(app.data?.catalog?.shopItems ?? [])].sort((a, b) => Number(b.id === 'loudspeaker') - Number(a.id === 'loudspeaker'));
  const flexItems = [...(app.data?.catalog?.flexItems ?? [])].sort((a, b) => Number(a.requiredLevel || 0) - Number(b.requiredLevel || 0) || Number(a.order || 0) - Number(b.order || 0));
  const shop = app.data?.dashboard?.shop ?? {};
  const cards = items.map((item) => {
    if (item.id === 'loudspeaker') return loudspeakerShopCard(item, shop);
    const status = shopStatusFor(item, shop);
    return `<article class="shop-card"><span class="shop-icon" aria-hidden="true">${esc(item.icon)}</span><div><strong>${esc(item.name)}</strong><p>${esc(item.description)}</p>${status ? `<small>${status}</small>` : ''}</div>${shopActionFor(item, shop)}</article>`;
  }).join('');
  const activeFlex = shop.flexItem;
  const activeCard = activeFlex
    ? `<div class="active-flex-card">${flexItemImage(activeFlex, { shop: true })}<div><small>현재 장착</small><strong>${esc(activeFlex.name)}</strong><span>${dateText(activeFlex.expiresAt)}까지</span></div></div>`
    : '<div class="active-flex-card empty-flex"><div><small>현재 장착</small><strong>장착한 아이템 없음</strong><span>아이템은 구매 즉시 24시간 동안 표시됩니다.</span></div></div>';
  const currentLevel = Math.max(1, Number(app.data?.dashboard?.pet?.stats?.level) || 1);
  const flexLevels = Array.from({ length: 10 }, (_, index) => (index + 1) * 5);
  const flexSections = flexLevels.map((requiredLevel) => {
    const unlocked = currentLevel >= requiredLevel;
    const group = flexItems.filter((item) => Number(item.requiredLevel) === requiredLevel);
    const flexCards = group.map((item) => {
      const kindText = item.kind === 'nameplate' ? '이름표 포함 · 24시간' : item.kind === 'pet' ? '펫 · 24시간' : '플렉스 · 24시간';
      return `<article class="flex-shop-card flex-tier-${Math.max(1, Number(item.tier) || 1)} ${unlocked ? '' : 'locked'}">${flexItemImage(item, { shop: true })}<div><strong>${esc(item.name)}</strong><p>${esc(item.description)}</p><small>${esc(kindText)}</small></div><button class="primary" data-action="buy-flex" data-id="${esc(item.id)}" type="button" ${unlocked ? '' : 'disabled'}>${unlocked ? points(item.price) : `🔒 Lv.${requiredLevel}`}</button></article>`;
    }).join('');
    return `<section class="flex-level-section ${unlocked ? 'unlocked' : 'locked'}"><div class="flex-level-heading"><h4>Lv.${requiredLevel} 플렉스</h4><span>${unlocked ? '해금됨' : `🔒 Lv.${requiredLevel} 달성 시 해금`}</span></div><div class="flex-shop-grid">${flexCards}</div></section>`;
  }).join('');
  openModal(`${modalHeader('상점', `보유 포인트 ${points(app.data.dashboard.pet.stats.points)}`)}<h3 class="shop-section-title">기능 상품</h3><div class="shop-grid">${cards}</div><p class="helper centered">구매와 지급은 서버에서 한 번만 처리됩니다. 횟수권과 복권은 한국시간 00·06·12·18시 초기화 기준입니다.</p><div class="shop-section-divider"></div><h3 class="shop-section-title">플렉스 아이템</h3><p class="helper">5레벨마다 새 상품 5종이 열립니다. 능력치 효과 없이 24시간 표시되며 동시에 1개만 장착할 수 있습니다. Lv.15부터 각 단계의 1,500P 상품은 전용 이름표도 함께 적용됩니다.</p>${activeCard}${flexSections}`, { type: 'shop' });
  updateLoudspeakerShopState();
}


async function buyShopItem(itemId, extra = {}) {
  return performIdempotent('/api/shop/purchase', { itemId, ...extra }, `shop:${itemId}`, null, 'POST', { renderMode: 'shop' });
}

async function buyLoudspeaker() {
  const item = (app.data?.catalog?.shopItems ?? []).find((entry) => entry.id === 'loudspeaker');
  if (!item) return null;
  if (activeLoudspeaker()) {
    toast('현재 다른 레고의 확성기가 표시 중입니다. 끝난 뒤 다시 이용해주세요.', 'error');
    return null;
  }
  const input = $('#loudspeaker-message-input');
  const maxLength = Math.max(1, Number(item.maxLength) || 30);
  const message = String(input?.value ?? '').replace(/\s+/g, ' ').trim();
  if (!message) { toast('확성기 메시지를 입력해주세요.', 'error'); input?.focus(); return null; }
  if ([...message].length > maxLength) { toast(`확성기 메시지는 ${maxLength}자 이내로 입력해주세요.`, 'error'); input?.focus(); return null; }
  const result = await buyShopItem('loudspeaker', { message });
  if (result?.loudspeaker) {
    app.loudspeakerDraft = '';
    app.loudspeakerComposing = false;
    app.loudspeakerEditing = false;
    showLoudspeaker(result.loudspeaker);
  }
  return result;
}


async function buyFlexItem(itemId) {
  const item = (app.data?.catalog?.flexItems ?? []).find((entry) => entry.id === itemId);
  if (!item) return null;
  const currentLevel = Math.max(1, Number(app.data?.dashboard?.pet?.stats?.level) || 1);
  if (currentLevel < Number(item.requiredLevel || 1)) {
    toast(`Lv.${item.requiredLevel}부터 구매할 수 있습니다.`, 'error');
    return null;
  }
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
    openModal(`${modalHeader('레고 프로필', coupleLabel)}<div class="profile-detail${flexProfileClass(profile)}">${workoutBadgeHtml(profile)}${avatar(stage, { flexItem: profile.flexItem })}<strong class="profile-title">${levelBadgeHtml(profile)}<span class="flex-display-name">${esc(profile.displayName)}</span></strong>${seasonBadgesHtml(profile)}${flexItemStatus(profile.flexItem)}<button class="body-stage-profile-link" data-action="body-guide" data-body="${profile.stats.body}" type="button">${esc(stage.label)} · 몸집 ${profile.stats.body} · 단계 보기</button>${profile.statusMessage ? `<p class="profile-status-detail">${esc(profile.statusMessage)}</p>` : ''}<div class="metric-grid">${compactMetric('포인트', points(profile.stats.points))}${compactMetric('레벨', `Lv.${profile.stats.level}`)}${compactMetric('레고력', `${profile.stats.legoPower}`)}${compactMetric('몸집', `${profile.stats.body}`)}${compactMetric('체력', `${profile.stats.stamina}`)}${compactMetric('상태', coupleLabel)}</div>${relationshipActions}</div>`, { type: 'profile', petId });
  } catch (error) { toast(error.message, 'error'); }
}

function openOddEvenBet() {
  const balance = Math.max(0, Math.floor(Number(app.data?.dashboard?.pet?.stats?.points) || 0));
  const rules = app.data?.catalog?.oddEven ?? { minStake: 10, stakeStep: 10, payoutPercent: { 1: 150, 2: 250, 3: 400 } };
  const minStake = Math.max(1, Math.floor(Number(rules.minStake) || 10));
  const stakeStep = Math.max(1, Math.floor(Number(rules.stakeStep) || 10));
  const payoutPercent = rules.payoutPercent ?? { 1: 150, 2: 250, 3: 400 };
  const maxStake = balance;
  const disabled = maxStake < minStake ? 'disabled' : '';
  openModal(`${modalHeader('홀짝 배팅', `보유 포인트 ${points(balance)}`)}<form id="odd-even-bet-form" class="stack-form odd-even-bet-form"><label>걸 포인트<input id="odd-even-stake" name="stakePoints" type="number" inputmode="numeric" min="${minStake}" max="${maxStake}" step="${stakeStep}" placeholder="${minStake}~${maxStake}P · ${stakeStep}P 단위" autocomplete="off" required ${disabled}></label><div class="odd-even-preview"><div><span>1연승 정산</span><strong id="odd-even-payout-1">-</strong></div><div><span>2연승 정산</span><strong id="odd-even-payout-2">-</strong></div><div><span>3연승 정산</span><strong id="odd-even-payout-3">-</strong></div></div><p class="warning-box">보유 포인트 안에서 ${minStake}P 이상을 ${stakeStep}P 단위로 원하는 만큼 걸 수 있습니다. 시작할 때 판돈이 차감되고, 실패하면 전액을 잃습니다. 1연승은 1.5배, 2연승은 2.5배, 3연승은 4배를 총 지급합니다.</p><button class="primary wide" type="submit" ${disabled}>배팅 시작</button></form>`, { type: 'oddEvenBet' });
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

function minesweeperTimeText(msValue) {
  const ms = Math.max(0, Number(msValue) || 0);
  return `${(ms / 1000).toFixed(1)}초`;
}

function syncMinesweeperClock() {
  const challenge = app.data?.activeMiniChallenge;
  const timer = $('#minesweeper-timer');
  if (!timer || challenge?.gameId !== 'minesweeper' || !challenge.startedAt) return;
  const elapsed = Math.max(0, serverAlignedNow(app.data?.serverTime) - new Date(challenge.startedAt).getTime());
  const nextText = minesweeperTimeText(elapsed);
  if (timer.textContent !== nextText) timer.textContent = nextText;
}

function startMinesweeperClock() {
  const challenge = app.data?.activeMiniChallenge;
  const challengeId = challenge?.gameId === 'minesweeper' ? String(challenge.id || '') : '';
  if (app.modal?.gameId !== 'minesweeper' || !challengeId || !challenge.startedAt) {
    clearInterval(app.minesweeperClockTimer);
    app.minesweeperClockTimer = null;
    app.minesweeperClockChallengeId = null;
    return;
  }
  syncMinesweeperClock();
  if (app.minesweeperClockTimer && app.minesweeperClockChallengeId === challengeId) return;
  clearInterval(app.minesweeperClockTimer);
  app.minesweeperClockChallengeId = challengeId;
  app.minesweeperClockTimer = setInterval(syncMinesweeperClock, 100);
}

function minesweeperCellState(value, row, col, finished = false) {
  let className = 'minesweeper-cell closed';
  let content = '';
  let label = `${row + 1}행 ${col + 1}열 닫힌 칸`;
  if (value === 'flag') {
    className = 'minesweeper-cell flagged'; content = '🚩'; label = `${row + 1}행 ${col + 1}열 깃발`;
  } else if (value === 'mine') {
    className = 'minesweeper-cell revealed mine'; content = '💣'; label = `${row + 1}행 ${col + 1}열 지뢰`;
  } else if (value === 'boom') {
    className = 'minesweeper-cell revealed exploded'; content = '💥'; label = `${row + 1}행 ${col + 1}열 폭발한 지뢰`;
  } else if (Number.isInteger(value)) {
    const number = Math.max(0, Math.min(8, value));
    className = `minesweeper-cell revealed number-${number}`;
    content = number ? String(number) : '';
    label = `${row + 1}행 ${col + 1}열 ${number ? `주변 지뢰 ${number}개` : '빈 칸'}`;
  }
  return { className, content, label, disabled: Boolean(finished) };
}

function minesweeperCellHtml(value, row, col, finished = false) {
  const state = minesweeperCellState(value, row, col, finished);
  return `<button class="${state.className}" data-action="minesweeper-cell" data-row="${row}" data-col="${col}" type="button" ${state.disabled ? 'disabled' : ''} aria-label="${state.label}">${state.content}</button>`;
}

function patchMinesweeperBoard(board, challenge) {
  if (!board) return false;
  const rows = Math.max(0, Number(challenge?.rows) || 0);
  const cols = Math.max(0, Number(challenge?.cols) || 0);
  const expectedCount = rows * cols;
  const cacheKey = `${String(challenge?.id || '')}:${rows}x${cols}`;
  let ui = app.minesweeperBoardUi;
  if (!ui || ui.board !== board || ui.cacheKey !== cacheKey || ui.cells.length !== expectedCount) {
    const cells = Array.from(board.querySelectorAll('.minesweeper-cell[data-action="minesweeper-cell"]'));
    if (!expectedCount || cells.length !== expectedCount) {
      board.innerHTML = minesweeperBoardHtml(challenge);
      app.minesweeperBoardUi = { board, cacheKey, cells: Array.from(board.children), values: Array(expectedCount).fill(Symbol('unset')), finished: null };
      return true;
    }
    ui = { board, cacheKey, cells, values: Array(expectedCount).fill(Symbol('unset')), finished: null };
    app.minesweeperBoardUi = ui;
  }
  const finished = ['cleared', 'failed', 'abandoned'].includes(challenge?.status);
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const index = row * cols + col;
      const value = challenge?.cells?.[row]?.[col] ?? null;
      if (ui.values[index] === value && ui.finished === finished) continue;
      const cell = ui.cells[index];
      if (!cell) continue;
      const state = minesweeperCellState(value, row, col, finished);
      if (cell.className !== state.className) cell.className = state.className;
      if (cell.textContent !== state.content) cell.textContent = state.content;
      if (cell.getAttribute('aria-label') !== state.label) cell.setAttribute('aria-label', state.label);
      if (cell.disabled !== state.disabled) cell.disabled = state.disabled;
      ui.values[index] = value;
    }
  }
  ui.finished = finished;
  return true;
}

function minesweeperBoardHtml(challenge) {
  const finished = ['cleared', 'failed', 'abandoned'].includes(challenge?.status);
  return (challenge?.cells ?? []).map((row, rowIndex) => row.map((value, colIndex) => minesweeperCellHtml(value, rowIndex, colIndex, finished)).join('')).join('');
}

function syncMinesweeperGameLayout() {
  if (!app.appleModalActive || app.modal?.gameId !== 'minesweeper') return;
  updateVisualViewportVars();
  const modal = $('#modal-content');
  const game = $('.minesweeper-game', modal ?? document);
  const board = $('#minesweeper-board', game ?? document);
  if (!modal || !game || !board) return;
  const fixed = ['.modal-head', '.minesweeper-hud', '.minesweeper-rules', '.minesweeper-controls', '.minesweeper-helper']
    .map((selector) => $(selector, selector === '.modal-head' ? modal : game));
  const modalStyle = getComputedStyle(modal);
  const verticalPadding = (parseFloat(modalStyle.paddingTop) || 0) + (parseFloat(modalStyle.paddingBottom) || 0);
  const fixedHeight = fixed.reduce((sum, node) => sum + (node?.offsetHeight || 0), 0);
  const availableHeight = Math.max(1, modal.clientHeight - verticalPadding - fixedHeight - 24);
  const availableWidth = Math.max(1, game.clientWidth);
  const size = Math.max(1, Math.floor(Math.min(620, availableWidth, availableHeight)));
  board.style.width = `${size}px`;
  board.style.height = `${size}px`;
}

function openMinesweeperDifficulty() {
  const config = app.data?.catalog?.minesweeper ?? {};
  const card = (key, icon) => {
    const item = config[key] ?? (key === 'hard'
      ? { label: '어려움', rows: 16, cols: 16, mines: 40, successReward: 200, failReward: 50 }
      : { label: '보통', rows: 10, cols: 10, mines: 12, successReward: 100, failReward: 30 });
    return `<button class="minesweeper-difficulty-card" data-action="start-minesweeper" data-value="${key}" type="button"><span class="difficulty-icon">${icon}</span><strong>${esc(item.label)}</strong><small>${item.rows}×${item.cols} · 지뢰 ${item.mines}개</small><em>클리어 +${item.successReward}P · 실패 +${item.failReward}P</em></button>`;
  };
  openModal(`${modalHeader('💣 지뢰찾기', '난이도를 선택하세요. 첫 칸을 열 때 개인게임 1회가 차감됩니다.')}<div class="minesweeper-difficulty-grid">${card('normal', '💥')}${card('hard', '💣')}</div><p class="helper centered">매판 지뢰 위치는 새로 랜덤 생성 · 첫 클릭과 주변 8칸은 안전 · 포기하면 0P</p>`, { type: 'minesweeperDifficulty' });
}

async function startMinesweeper(difficulty = 'normal') {
  if (app.busy) return null;
  clearMinesweeperActionQueue();
  app.minesweeperSessionActive = true;
  const result = await perform('/api/minigames/start', { gameId: 'minesweeper', difficulty }, null, 'POST', { toastDuration: 1200, toastType: 'game-start' });
  const challenge = result?.bootstrap?.activeMiniChallenge;
  if (!result?.ok || challenge?.gameId !== 'minesweeper') {
    app.minesweeperSessionActive = false;
    return result;
  }
  openMiniGame(challenge);
  return result;
}

function refreshMinesweeperMiniOnly(result = null) {
  if (app.modal?.type !== 'mini' || app.modal?.gameId !== 'minesweeper') return false;
  const challenge = result?.challenge?.gameId === 'minesweeper' ? result.challenge : app.data?.activeMiniChallenge;
  if (!challenge || challenge.gameId !== 'minesweeper') return false;
  const board = $('#minesweeper-board');
  if (board) {
    board.style.setProperty('--mine-cols', String(challenge.cols || 10));
    // 서버 응답마다 board.innerHTML 전체를 갈아엎으면 PC의 mousedown→click 사이 또는
    // 모바일 pointerdown→pointerup 사이에 누르고 있던 버튼이 DOM에서 사라져 입력이 유실된다.
    // 같은 게임판에서는 버튼 노드를 유지하고 상태만 제자리에서 갱신한다.
    patchMinesweeperBoard(board, challenge);
  }
  const flags = $('#minesweeper-flags');
  if (flags) flags.textContent = `${Number(challenge.flagCount || 0)}/${Number(challenge.mines || 0)}`;
  const opened = $('#minesweeper-opened');
  if (opened) opened.textContent = `${Number(challenge.revealedSafeCount || 0)}/${Number(challenge.safeCellCount || 0)}`;
  const timer = $('#minesweeper-timer');
  if (timer) {
    const elapsed = challenge.startedAt
      ? (challenge.elapsedMs ?? Math.max(0, serverAlignedNow(app.data?.serverTime) - new Date(challenge.startedAt).getTime()))
      : 0;
    timer.textContent = minesweeperTimeText(elapsed);
  }
  const helper = $('#minesweeper-helper');
  if (helper) helper.textContent = challenge.startedAt ? 'PC: 좌클릭 열기 · 우클릭 깃발 / 모바일: 짧게 터치 열기 · 길게 누르기 깃발' : '첫 칸을 짧게 터치해 열면 시간이 시작되고 개인게임 1회가 차감됩니다.';
  startMinesweeperClock();
  return true;
}

function clearMinesweeperActionQueue() {
  const pending = app.minesweeperActionQueue.splice(0);
  for (const item of pending) item.resolve?.(null);
}

async function drainMinesweeperActionQueue() {
  if (app.minesweeperActionInFlight) return;
  const first = app.minesweeperActionQueue.shift();
  if (!first) return;
  const challenge = app.data?.activeMiniChallenge;
  if (!challenge || challenge.gameId !== 'minesweeper' || challenge.id !== first.challengeId || !app.minesweeperSessionActive) {
    first.resolve?.(null);
    return drainMinesweeperActionQueue();
  }

  const batch = [first];
  while (batch.length < 8 && app.minesweeperActionQueue.length) {
    const next = app.minesweeperActionQueue[0];
    if (next.challengeId !== challenge.id) break;
    batch.push(app.minesweeperActionQueue.shift());
  }
  let canFlag = Boolean(challenge.startedAt);
  const sendable = [];
  for (const item of batch) {
    if (item.action === 'flag' && !canFlag) {
      toast('먼저 첫 칸을 열어주세요.', 'error', 1500);
      item.resolve?.(null);
      continue;
    }
    sendable.push(item);
    if (item.action === 'reveal') canFlag = true;
  }
  if (!sendable.length) return drainMinesweeperActionQueue();

  const finishedChallenge = structuredClone(challenge);
  app.minesweeperActionInFlight = true;
  app.minesweeperCurrentAction = sendable.length === 1 ? sendable[0].action : 'batch';
  let result = null;
  try {
    result = await api('/api/minigames/minesweeper/action', {
      method: 'POST',
      body: JSON.stringify({
        challengeId: challenge.id,
        actions: sendable.map((item) => ({ action: item.action, row: item.row, col: item.col }))
      })
    });
    if (result?.bootstrap) applyBootstrap(result.bootstrap);
    else if (result?.challenge?.gameId === 'minesweeper' && app.data) {
      app.data.activeMiniChallenge = result.challenge;
      if (Number.isFinite(Number(result.serverTime))) {
        app.data.serverTime = Number(result.serverTime);
        app.bootstrapSyncedAt = monotonicNow();
      }
      if (Number.isFinite(Number(result.revision))) app.revision = Math.max(app.revision, Number(result.revision));
    }
    refreshMinesweeperMiniOnly(result);
    const results = Array.isArray(result?.results) ? result.results : [result];
    sendable.forEach((item, index) => item.resolve?.(results[index] ?? null));
    if (result?.finished) {
      const shouldShowResult = app.minesweeperSessionActive && app.modal?.type === 'mini' && app.modal?.gameId === 'minesweeper';
      app.minesweeperSessionActive = false;
      clearMinesweeperActionQueue();
      if (shouldShowResult) openMiniResult(result, result.challenge ?? finishedChallenge);
    }
  } catch (error) {
    sendable.forEach((item) => item.resolve?.(null));
    toast(error.message, 'error');
    loadBootstrap({ silent: true, renderMode: 'minesweeper' });
  } finally {
    app.minesweeperActionInFlight = false;
    app.minesweeperCurrentAction = null;
  }
  if (app.minesweeperSessionActive) queueMicrotask(drainMinesweeperActionQueue);
  return result;
}

function submitMinesweeperAction(action, rowValue, colValue) {
  const challenge = app.data?.activeMiniChallenge;
  if (!challenge || challenge.gameId !== 'minesweeper' || !app.minesweeperSessionActive) return Promise.resolve(null);
  const row = Number(rowValue);
  const col = Number(colValue);
  if (!Number.isInteger(row) || !Number.isInteger(col)) return Promise.resolve(null);
  const revealPending = app.minesweeperCurrentAction === 'reveal' || app.minesweeperActionQueue.some((item) => item.challengeId === challenge.id && item.action === 'reveal');
  if (action === 'flag' && !challenge.startedAt && !revealPending) {
    toast('먼저 첫 칸을 열어주세요.', 'error', 1500);
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    app.minesweeperActionQueue.push({ challengeId: challenge.id, action, row, col, resolve });
    drainMinesweeperActionQueue();
  });
}

async function abandonMinesweeperExplicit() {
  const challenge = app.data?.activeMiniChallenge;
  if (!challenge || challenge.gameId !== 'minesweeper' || app.minesweeperAbandonInFlight) return null;
  if (challenge.startedAt && !confirm('지뢰찾기를 포기할까요? 포기하면 보상은 없고 사용한 개인게임 횟수는 돌아오지 않습니다.')) return null;
  const snapshot = structuredClone(challenge);
  app.minesweeperAbandonInFlight = true;
  app.minesweeperSessionActive = false;
  clearMinesweeperActionQueue();
  try {
    const result = await perform('/api/minigames/minesweeper/abandon', { challengeId: challenge.id }, null, 'POST', { toastResult: false });
    if (result?.ok) openMiniResult(result, result.challenge ?? snapshot);
    return result;
  } finally {
    app.minesweeperAbandonInFlight = false;
  }
}

function abandonMinesweeperSilently() {
  const challenge = app.data?.activeMiniChallenge;
  if (!challenge || challenge.gameId !== 'minesweeper' || app.minesweeperAbandonInFlight) return;
  const challengeId = challenge.id;
  app.minesweeperSessionActive = false;
  clearMinesweeperActionQueue();
  app.minesweeperAbandonInFlight = true;
  if (app.data) app.data.activeMiniChallenge = null;
  markTabDirty('games');
  if (!app.token) { app.minesweeperAbandonInFlight = false; return; }
  api('/api/minigames/minesweeper/abandon', { method: 'POST', body: JSON.stringify({ challengeId }) })
    .then((result) => { if (result?.bootstrap) applyBootstrap(result.bootstrap); })
    .catch(() => loadBootstrap({ silent: true }))
    .finally(() => { app.minesweeperAbandonInFlight = false; });
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
  if (challenge.gameId === 'minesweeper') {
    app.minesweeperSessionActive = true;
    const elapsed = challenge.startedAt ? Math.max(0, serverAlignedNow(app.data?.serverTime) - new Date(challenge.startedAt).getTime()) : 0;
    content = `<div class="minesweeper-game ${challenge.difficulty === 'hard' ? 'hard' : 'normal'}"><div class="minesweeper-hud"><div><small>시간</small><strong id="minesweeper-timer">${minesweeperTimeText(elapsed)}</strong></div><div><small>깃발</small><strong id="minesweeper-flags">${Number(challenge.flagCount || 0)}/${Number(challenge.mines || 0)}</strong></div><div><small>안전칸</small><strong id="minesweeper-opened">${Number(challenge.revealedSafeCount || 0)}/${Number(challenge.safeCellCount || 0)}</strong></div></div><p class="helper minesweeper-rules">안전칸을 모두 열면 클리어 · 첫 클릭과 주변 8칸은 지뢰 없음</p><div class="minesweeper-controls"><button class="ghost minesweeper-abandon-button" data-action="minesweeper-abandon" type="button">포기하기</button></div><div id="minesweeper-board" class="minesweeper-board" style="--mine-cols:${Number(challenge.cols || 10)}" role="grid" aria-label="지뢰찾기 ${Number(challenge.rows || 10)}행 ${Number(challenge.cols || 10)}열">${minesweeperBoardHtml(challenge)}</div><p id="minesweeper-helper" class="minesweeper-helper">${challenge.startedAt ? 'PC: 좌클릭 열기 · 우클릭 깃발 / 모바일: 짧게 터치 열기 · 길게 누르기 깃발' : '첫 칸을 짧게 터치해 열면 시간이 시작되고 개인게임 1회가 차감됩니다.'}</p></div>`;
  }
  if (challenge.gameId === 'block') content = `<div class="block-game"><div class="block-hud"><div><small>남은 블록</small><strong id="block-remaining">${Number(challenge.blockRemainingCount || 0)}개</strong></div><div><small>제거 가능 그룹</small><strong id="block-groups">${Number(challenge.blockAvailableGroups || 0)}개</strong></div><div><small>획득 예정</small><strong id="block-pending">${points(challenge.blockPendingPoints || 0)}</strong></div></div><p class="helper block-rules">같은 색 2개 이상 클릭 · 상하좌우만 연결 · 시간제한 없음</p><div class="block-controls"><button id="block-stop-button" class="soft-button wide" data-action="stop-mini" type="button">그만하고 ${points(challenge.blockPendingPoints || 0)} 받기</button></div><div id="block-board" class="block-board" role="grid" aria-label="블록게임 12행 10열 색상판">${blockBoardHtml(challenge)}</div><p id="block-helper" class="block-helper" aria-live="polite">제거한 자리 위의 블록만 아래로 바로 내려옵니다. 좌우로는 움직이지 않습니다.</p><p class="block-reward-guide"><b>포인트</b> 2개 5P · 3개 9P · 4개 13P · 5개 18P · 6개 23P · 7개 29P · 8개 35P · 9개 42P · 10~12개 52P · 13~15개 65P · 16개+ 80P · ALL CLEAR +100P</p></div>`;
  const miniName = app.data.catalog.miniGames.find((game) => game.id === challenge.gameId)?.name || '미니게임';
  const miniDescription = challenge.gameId === 'minesweeper' ? `${challenge.difficultyLabel || (challenge.difficulty === 'hard' ? '어려움' : '보통')} · ${Number(challenge.rows || 0)}×${Number(challenge.cols || 0)} · 지뢰 ${Number(challenge.mines || 0)}개` : '';
  openModal(`${modalHeader(miniName, miniDescription)}${content}`, { type: 'mini', gameId: challenge.gameId });
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
    if (challenge.gameId === 'minesweeper') { syncMinesweeperGameLayout(); startMinesweeperClock(); }
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
  const draftValue = input.value;
  const hadFocus = document.activeElement === input;
  attempts.textContent = `${Number(challenge.attempts || 0)}/${Number(challenge.maxAttempts || 5)}회 사용`;
  history.textContent = `입력: ${(challenge.guesses ?? []).join(', ')}`;
  history.classList.toggle('hidden', !(challenge.guesses?.length));
  if (hint && result) hint.textContent = result.message ?? '';
  // 서버의 실시간 bootstrap 갱신(result 없음)은 사용자가 타이핑 중인 숫자를 절대 지우지 않는다.
  // 실제 숫자 제출 응답(result 있음)일 때만 다음 추측을 위해 입력값을 비운다.
  if (result) input.value = '';
  else input.value = draftValue;
  if (modal) modal.scrollTop = scrollTop;
  if (hadFocus && document.activeElement !== input) {
    try { input.focus({ preventScroll: true }); } catch { input.focus(); }
  }
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
  const presets = app.data?.blockBattle?.stakes?.length ? app.data.blockBattle.stakes : [100, 500, 1000, 2000, 3000];
  const options = presets.map((stake) => `<option value="${stake}">${Number(stake).toLocaleString('ko-KR')}P</option>`).join('');
  openModal(`${modalHeader('테트리스대전 방 만들기', `보유 포인트 ${points(balance)}`)}<form id="block-battle-create-form" class="stack-form"><label>판돈<select name="preset" id="block-battle-stake-preset">${options}<option value="custom">직접 입력</option></select></label><label id="block-battle-custom-stake-wrap" class="hidden">직접 입력<input name="customStake" type="number" inputmode="numeric" min="1000" step="1000" placeholder="4,000 / 5,000 / ..."></label><p class="warning-box">100P, 500P 또는 1,000P 이상 1,000P 단위만 가능합니다. 상대가 참가해 대전이 확정될 때 양쪽에서 같은 판돈을 한 번만 보관합니다. 승자는 두 사람의 판돈 전액을 받습니다.</p><button class="primary wide" type="submit">방 만들기</button></form>`, { type: 'blockBattleCreate' });
  requestAnimationFrame(() => {
    const preset = $('#block-battle-stake-preset');
    preset?.addEventListener('change', () => $('#block-battle-custom-stake-wrap')?.classList.toggle('hidden', preset.value !== 'custom'));
  });
}

function openCreateDavinci() {
  const balance = Math.max(0, Number(app.data?.dashboard?.pet?.stats?.points) || 0);
  const presets = [100, 500, 1000, 2000, 3000];
  const options = presets.map((stake) => `<option value="${stake}">${Number(stake).toLocaleString('ko-KR')}P</option>`).join('');
  openModal(`${modalHeader('다빈치코드 방 만들기', `보유 포인트 ${points(balance)}`)}<form id="davinci-create-form" class="stack-form"><label>판돈<select name="preset" id="davinci-stake-preset">${options}<option value="custom">직접 입력</option></select></label><label id="davinci-custom-stake-wrap" class="hidden">직접 입력<input name="customStake" type="number" inputmode="numeric" min="1000" step="1000" placeholder="4,000 / 5,000 / ..."></label><p class="warning-box">2~4인이 참가할 수 있습니다. 게임 시작 순간 참가자 전원의 판돈을 함께 확보하며 마지막 승자가 전액을 받습니다.</p><button class="primary wide" type="submit">방 만들기</button></form>`, { type: 'davinciCreate' });
  requestAnimationFrame(() => {
    const preset = $('#davinci-stake-preset');
    preset?.addEventListener('change', () => $('#davinci-custom-stake-wrap')?.classList.toggle('hidden', preset.value !== 'custom'));
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

function adminMembersHtml(admin = app.data?.admin) {
  return (admin?.members ?? []).map((member) => {
    const petControls = member.hasActivePet !== false
      ? `<button class="admin-point-give" data-action="admin-points" data-id="${member.petId}" data-name="${esc(member.displayName)}" data-value="1" type="button">포인트+</button><button class="admin-point-take" data-action="admin-points" data-id="${member.petId}" data-name="${esc(member.displayName)}" data-value="-1" type="button">포인트-</button><button data-action="admin-reset-user" data-id="${member.petId}" type="button">상태 초기화</button><button class="danger-button" data-action="admin-kick" data-id="${member.petId}" type="button">강퇴</button>`
      : '';
    const summaryBase = member.hasActivePet === false
      ? '가입 계정은 존재하지만 현재 레고 데이터가 없습니다.'
      : `Lv.${member.level} · ${points(member.points)}`;
    const summary = `${summaryBase}${member.accountLocked ? ' · 계정 잠금 중' : ''}`;
    const workoutControl = `<button class="${member.workoutBadge ? 'warning-button' : 'soft-button'}" data-action="admin-workout-badge" data-user-id="${esc(member.userId)}" data-enabled="${member.workoutBadge ? 'false' : 'true'}" type="button">${member.workoutBadge ? '💪 뱃지 해제' : '💪 운동방 뱃지'}</button>`;
    const lockControl = member.isSelf ? '' : `<button class="${member.accountLocked ? 'warning-button' : 'soft-button'}" data-action="admin-account-lock" data-user-id="${esc(member.userId)}" data-enabled="${member.accountLocked ? 'false' : 'true'}" data-name="${esc(member.displayName)}" type="button">${member.accountLocked ? '🔓 잠금 해제' : '🔒 계정 잠금'}</button>`;
    return `<article class="admin-member${member.accountLocked ? ' account-locked' : ''}" data-admin-user-id="${esc(member.userId)}"><div><strong>${esc(member.displayName)}${member.isSelf ? ' <span class="admin-self-badge">내 계정</span>' : ''}${member.workoutBadge ? ' <span class="admin-workout-label">💪 운동방</span>' : ''}${member.accountLocked ? ' <span class="tag warning">잠금</span>' : ''}</strong><small>${summary}</small></div><div class="admin-buttons">${workoutControl}${lockControl}${petControls}${member.isSelf ? '' : `<button class="danger-button admin-delete-account" data-action="admin-delete-account" data-user-id="${member.userId}" type="button">계정 삭제</button>`}</div></article>`;
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
  const support = currentSupportSettings();
  const members = adminMembersHtml(admin);
  const activeBungs = (admin.activeBungs ?? []).map((bung) => `<article class="admin-bung"><div><strong>${esc(bung.title)}</strong><small>${esc(bung.hostDisplayName)} · ${bung.status === 'live' ? '진행 중' : '모집 중'} · ${Number(bung.attendeeCount || 0)}명 · 개설 ${points(bung.stakePoints)}</small></div><button class="danger-button" data-action="admin-force-bung" data-id="${esc(bung.id)}" data-name="${esc(bung.title)}" type="button">벙 강제취소</button></article>`).join('');
  const auditLogs = (admin.auditLogs ?? []).map((entry) => {
    let detail = '';
    if (entry.action === 'account_delete') detail = `${esc(entry.adminDisplayName)} → ${esc(entry.targetDisplayName)} 계정 삭제`;
    else if (entry.action === 'account_lock') detail = `${esc(entry.adminDisplayName)} → ${esc(entry.targetDisplayName)} ${esc(entry.detail || '계정 잠금 변경')}`;
    else if (entry.action === 'bung_force_cancel') detail = `${esc(entry.adminDisplayName)} → ${esc(entry.targetDisplayName)} 벙 강제취소`;
    else if (entry.action === 'workout_badge') detail = `${esc(entry.adminDisplayName)} → ${esc(entry.targetDisplayName)} ${esc(entry.detail || '💪 운동방 뱃지 변경')}`;
    else if (entry.action === 'state_reset') detail = `${esc(entry.adminDisplayName)} → ${esc(entry.targetDisplayName)} 상태 초기화`;
    else if (entry.action === 'omok_clear_ended') detail = `${esc(entry.adminDisplayName)} → 종료된 오목방 비우기`;
    else if (entry.action === 'block_battle_clear_ended') detail = `${esc(entry.adminDisplayName)} → 종료된 테트리스대전 방 비우기`;
    else if (entry.action === 'support_settings') detail = `${esc(entry.adminDisplayName)} → 후원 배너 설정 변경`;
    else if (entry.action === 'kick') detail = `${esc(entry.adminDisplayName)} → ${esc(entry.targetDisplayName)} 강퇴`;
    else detail = `${esc(entry.adminDisplayName)} → ${esc(entry.targetDisplayName)} ${Number(entry.delta) >= 0 ? '지급' : '회수'} ${points(Math.abs(Number(entry.delta) || 0))}`;
    const balance = entry.action === 'point_adjust' && Number.isFinite(Number(entry.before)) && Number.isFinite(Number(entry.after)) ? ` · ${points(entry.before)} → ${points(entry.after)}` : '';
    const extra = entry.detail ? ` · ${esc(entry.detail)}` : '';
    return `<article class="admin-audit"><div><strong>${detail}</strong><small>${dateText(entry.createdAt)}${balance}${extra}</small></div></article>`;
  }).join('');
  openModal(`${modalHeader('운영자 관리', `내 User ID: ${admin.userId}`)}<div class="admin-top"><button class="ghost wide" data-action="admin-refresh" type="button">회원 목록 새로고침</button><button class="soft-button wide" data-action="admin-clear-ended-omok" type="button">종료된 오목방 비우기 (${Number(admin.endedOmokRooms || 0)})</button><button class="soft-button wide" data-action="admin-clear-ended-block-battle" type="button">종료된 테트리스방 비우기 (${Number(admin.endedBlockBattleRooms || 0)})</button><button class="soft-button wide" data-action="admin-clear-ended-davinci" type="button">종료된 다빈치방 비우기 (${Number(admin.endedDavinciRooms || 0)})</button></div><h3>후원 설정</h3><p class="helper">상단 후원 배너와 후원 팝업에 같은 문구가 표시됩니다. 저장하면 접속 중인 사용자에게도 반영됩니다.</p><form id="admin-support-form" class="admin-support-form"><label>후원 문구<textarea id="admin-support-message" name="message" maxlength="${SUPPORT_MESSAGE_MAX_LENGTH}" required>${esc(support.message)}</textarea></label><div class="admin-support-row"><label class="admin-support-toggle"><input name="enabled" type="checkbox" ${support.enabled ? 'checked' : ''}>상단 후원 배너 표시</label><span id="admin-support-count" class="admin-support-count">${[...support.message].length}/${SUPPORT_MESSAGE_MAX_LENGTH}</span></div><button class="primary wide" type="submit">후원 설정 저장</button></form><h3>회원 관리</h3><p class="helper">회원별 계정을 잠그거나 해제하고 💪 운동방 뱃지를 부여·해제할 수 있습니다. 계정 잠금 시 기존 로그인도 즉시 종료되며 잠금 해제 전까지 다시 로그인할 수 없습니다. 포인트+ / 포인트-로 회원 포인트를 직접 지급하거나 회수할 수 있습니다. 포인트는 0P 아래로 내려가지 않습니다. 계정 삭제는 회원가입 정보와 모든 세대 레고 데이터를 제거하며 복구할 수 없습니다.</p><div id="admin-member-list" class="admin-list">${members}</div><h3>벙 관리</h3><p class="helper">벙주가 마감을 하지 않은 벙을 정리하는 기능입니다. 강제취소하면 개설 포인트는 반환되지 않고 참가·개최 레고력과 오늘의 레고력도 지급되지 않습니다.</p><div class="admin-list">${activeBungs || '<div class="empty">강제취소할 진행 중 벙이 없습니다.</div>'}</div><h3>대전방 관리</h3><p class="helper">오목·테트리스대전·다빈치코드 모두 종료된 방만 비우며 대기·진행 중인 방과 이미 정산된 승패·포인트 기록은 건드리지 않습니다. 대기방은 10분 동안 시작되지 않으면 자동 정리됩니다.</p><h3>운영 기록</h3><p class="helper">후원 설정, 포인트 지급·회수, 운동방 뱃지 변경, 계정 잠금·해제, 계정 삭제, 강퇴, 상태 초기화, 벙·오목·테트리스대전·다빈치코드 방 정리 기록을 최근 100개까지 표시합니다.</p><div class="admin-list">${auditLogs || '<div class="empty">아직 운영 기록이 없습니다.</div>'}</div>`, { type: 'admin' });
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
  } else if (gameId === 'minesweeper') {
    const difficulty = challenge.difficulty === 'hard' ? '어려움' : '보통';
    const elapsedMs = Math.max(0, Number(result?.elapsedMs ?? challenge.elapsedMs) || 0);
    const cleared = Boolean(result?.cleared || challenge.status === 'cleared');
    const abandoned = Boolean(result?.abandoned || challenge.status === 'abandoned');
    const bestKey = challenge.difficulty === 'hard' ? 'minesweeperHardBestMs' : 'minesweeperNormalBestMs';
    const best = Math.max(0, Number(app.data?.dashboard?.pet?.records?.[bestKey] || 0));
    headline = abandoned ? '게임을 포기했습니다' : cleared ? `${difficulty} 클리어!` : '지뢰를 밟았습니다';
    rows = `<div><span>난이도</span><strong>${difficulty}</strong></div><div><span>기록</span><strong>${elapsedMs ? minesweeperTimeText(elapsedMs) : '-'}</strong></div><div><span>획득 포인트</span><strong>+${reward.toLocaleString('ko-KR')}P</strong></div><div><span>이번 시즌 최고</span><strong>${best ? minesweeperTimeText(best) : '-'}</strong></div>`;
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
  const restartDifficulty = gameId === 'minesweeper' ? ` data-difficulty="${esc(challenge.difficulty === 'hard' ? 'hard' : 'normal')}"` : '';
  openModal(`${modalHeader(gameName, headline)}<div class="mini-result-card"><h3>${headline}</h3><div class="mini-result-grid">${rows}</div>${result?.detail ? `<p>${esc(result.detail)}</p>` : ''}<div class="button-row"><button class="primary" data-action="restart-mini" data-id="${esc(gameId)}"${restartDifficulty} type="button">다시 하기</button><button class="ghost" data-action="close-modal" type="button">닫기</button></div></div>`, { type: 'miniResult', gameId });
}

async function tick() {
  if (!app.data) return;
  updateLoudspeakerShopState();
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
  const omokRoom = currentOmokRoom();
  const omokCountdown = $('#omok-countdown');
  if (omokCountdown && omokRoom?.status === 'playing' && omokRoom.turnStartedAt) {
    const deadline = new Date(omokRoom.turnStartedAt).getTime() + Number(app.data.omok.turnSeconds || 30) * 1000;
    const remaining = deadline - serverAlignedNow(app.data.omok.serverTime);
    omokCountdown.textContent = `${Math.max(0, Math.ceil(remaining / 1000))}초`;
    if (remaining <= 0 && Date.now() - app.omokLastRefreshAt > 1200) {
      app.omokLastRefreshAt = Date.now();
      loadBootstrap({ silent: true });
    }
  }
  const davinciRoom = currentDavinciRoom();
  const davinciCountdown = $('#davinci-countdown');
  if (davinciCountdown && davinciRoom?.status === 'playing' && davinciRoom.deadlineAt) {
    const remaining = new Date(davinciRoom.deadlineAt).getTime() - serverAlignedNow(app.data?.davinci?.serverTime || app.data?.serverTime);
    davinciCountdown.textContent = `${Math.max(0, Math.ceil(remaining / 1000))}초`;
    if (remaining <= 0 && Date.now() - (app.davinciLastRefreshAt || 0) > 1200) {
      app.davinciLastRefreshAt = Date.now();
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
  const seasonCountdown = $('#game-season-countdown');
  if (seasonCountdown) {
    const nextText = gameSeasonCountdownText(app.data.rankings?.gameSeason?.endsAt);
    if (seasonCountdown.textContent !== nextText) seasonCountdown.textContent = nextText;
  }
  const territoryCountdown = $('#territory-countdown');
  if (territoryCountdown) territoryCountdown.textContent = durationText(new Date(app.data.territory.endsAt).getTime() - serverAlignedNow(app.data.territory.serverTime || app.data.serverTime));
}

async function handleAction(button, event = null) {
  const action = button.dataset.action;
  const idValue = button.dataset.id;
  if (action === 'close-modal') {
    const activeMine = app.modal?.type === 'mini' && app.modal?.gameId === 'minesweeper' ? app.data?.activeMiniChallenge : null;
    if (activeMine?.gameId === 'minesweeper') {
      if (activeMine.startedAt && !confirm('게임을 나가면 포기 처리됩니다. 나갈까요?')) return;
      abandonMinesweeperSilently();
    }
    return closeModal();
  }
  if (action === 'home') return switchMainTab('home');
  if (action === 'notifications') return openNotifications();
  if (action === 'show-online') return openOnlineModal();
  if (action === 'body-guide') return openBodyGuide(Number(button.dataset.body));
  if (action === 'edit-status-message') return openStatusMessageEditor();
  if (action === 'open-support') return openSupportModal();
  if (action === 'open-shop') return openShop();
  if (action === 'open-food') return openFoodShop();
  if (action === 'buy-shop') return buyShopItem(idValue);
  if (action === 'buy-loudspeaker') return buyLoudspeaker();
  if (action === 'buy-flex') return buyFlexItem(idValue);
  if (action === 'toggle-residents') return renderResidentRegion(!app.residentsExpanded);
  if (action === 'show-fishing-rewards') return openFishingRewards();
  if (action === 'profile') return openProfile(idValue);
  if (action === 'logout') return logout(true);
  if (action === 'work') return perform('/api/actions/work');
  if (action === 'rest') return perform('/api/actions/rest');
  if (action === 'cook') return perform('/api/actions/cook');
  if (action === 'eat') return performIdempotent('/api/actions/eat', { foodId: idValue }, `food:${idValue}`);
  if (action === 'start-fishing') return perform('/api/fishing/start');
  if (action === 'resume-mini') return openMiniGame(app.data.activeMiniChallenge);
  if (action === 'start-minesweeper') return startMinesweeper(button.dataset.value === 'hard' ? 'hard' : 'normal');
  if (action === 'minesweeper-cell') {
    if (shouldSuppressMinesweeperSyntheticClick(button, event)) return;
    return submitMinesweeperAction('reveal', button.dataset.row, button.dataset.col);
  }
  if (action === 'minesweeper-abandon') return abandonMinesweeperExplicit();
  if (action === 'minesweeper-rank-tab') {
    app.minesweeperRankTab = button.dataset.value === 'hard' ? 'hard' : 'normal';
    markTabDirty('home');
    return render();
  }
  if (action === 'start-mini' || action === 'restart-mini') {
    if (idValue === 'oddEven') return openOddEvenBet();
    if (idValue === 'minesweeper') {
      if (action === 'restart-mini') return startMinesweeper(button.dataset.difficulty === 'hard' ? 'hard' : 'normal');
      return openMinesweeperDifficulty();
    }
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
  if (action === 'request-mating') { if (confirm('교미 신청을 보낼까요?')) return perform('/api/social/action', { targetPetId: idValue, action: 'requestMating' }); return; }
  if (action === 'accept-mating') return perform('/api/social/action', { targetPetId: idValue, requestId: button.dataset.requestId, action: 'acceptMating' });
  if (action === 'reject-mating') return perform('/api/social/action', { targetPetId: idValue, requestId: button.dataset.requestId, action: 'rejectMating' });
  if (action === 'create-bung') return openCreateBung();
  if (action === 'show-recent-bungs') return openRecentBungs();
  if (action === 'open-bung') return openBung(idValue);
  if (action === 'join-bung') return perform(`/api/bungs/${idValue}/join`, {});
  if (action === 'leave-bung') return perform(`/api/bungs/${idValue}/leave`, {});
  if (action === 'start-bung') return perform(`/api/bungs/${idValue}/start`, {});
  if (action === 'end-bung') { if (confirm('벙을 끝내고 참가자 보상을 지급할까요?')) return perform(`/api/bungs/${idValue}/end`, {}); return; }
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
  if (action === 'davinci-create') return openCreateDavinci();
  if (action === 'davinci-open') { app.davinciLobbyForced = false; app.davinciRoomId = idValue; app.davinciGuessTarget = null; markTabDirty('games'); render(); return; }
  if (action === 'davinci-back') { app.davinciRoomId = null; app.davinciLobbyForced = true; app.davinciGuessTarget = null; markTabDirty('games'); render(); return; }
  if (action === 'davinci-join') {
    const result = await perform(`/api/davinci/rooms/${encodeURIComponent(idValue)}/join`, {});
    if (result?.ok) { app.davinciLobbyForced = false; app.davinciRoomId = result.roomId || idValue; app.davinciGuessTarget = null; markTabDirty('games'); render(); }
    return result;
  }
  if (action === 'davinci-ready') return perform(`/api/davinci/rooms/${encodeURIComponent(idValue)}/ready`, { ready: button.dataset.ready === 'true' });
  if (action === 'davinci-start') return perform(`/api/davinci/rooms/${encodeURIComponent(idValue)}/start`, {});
  if (action === 'davinci-spectate') {
    const result = await perform(`/api/davinci/rooms/${encodeURIComponent(idValue)}/spectate`, {});
    if (result?.ok) { app.davinciLobbyForced = false; app.davinciRoomId = result.roomId || idValue; app.davinciGuessTarget = null; markTabDirty('games'); render(); }
    return result;
  }
  if (action === 'davinci-spectate-leave') {
    const result = await perform(`/api/davinci/rooms/${encodeURIComponent(idValue)}/spectate/leave`, {});
    if (result?.ok) { app.davinciRoomId = null; app.davinciLobbyForced = true; app.davinciGuessTarget = null; markTabDirty('games'); render(); }
    return result;
  }
  if (action === 'davinci-leave') {
    const room = currentDavinciRoom();
    if (room?.status === 'playing' && !confirm('게임 중 나가면 즉시 포기 처리되며 판돈은 반환되지 않습니다. 나갈까요?')) return;
    const result = await perform(`/api/davinci/rooms/${encodeURIComponent(idValue)}/leave`, {});
    if (result?.ok) { app.davinciRoomId = null; app.davinciLobbyForced = true; app.davinciGuessTarget = null; markTabDirty('games'); render(); }
    return result;
  }
  if (action === 'davinci-rematch') return perform(`/api/davinci/rooms/${encodeURIComponent(idValue)}/rematch`, {});
  if (action === 'davinci-joker-position') {
    const room = currentDavinciRoom();
    if (!room) return;
    return perform(`/api/davinci/rooms/${encodeURIComponent(room.id)}/joker`, { position: Number(button.dataset.position) });
  }
  if (action === 'davinci-rps') {
    const room = currentDavinciRoom();
    if (!room) return;
    return perform(`/api/davinci/rooms/${encodeURIComponent(room.id)}/rps`, { choice: button.dataset.value }, null, 'POST', { toastDuration: 700, toastType: 'game-start' });
  }
  if (action === 'davinci-order') {
    const room = currentDavinciRoom();
    if (!room) return;
    return perform(`/api/davinci/rooms/${encodeURIComponent(room.id)}/order`, { choice: button.dataset.value });
  }
  if (action === 'davinci-target') {
    app.davinciGuessTarget = { targetPetId: button.dataset.targetPet, tileId: button.dataset.tileId, color: button.dataset.color };
    markTabDirty('games'); render(); return;
  }
  if (action === 'davinci-target-cancel') { app.davinciGuessTarget = null; markTabDirty('games'); render(); return; }
  if (action === 'davinci-guess') {
    const room = currentDavinciRoom();
    const target = app.davinciGuessTarget;
    if (!room || !target) return;
    const actionId = crypto.randomUUID?.() || `davinci-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    app.davinciGuessTarget = null;
    return perform(`/api/davinci/rooms/${encodeURIComponent(room.id)}/guess`, { targetPetId: target.targetPetId, tileId: target.tileId, guess: button.dataset.value, actionId }, null, 'POST', { toastDuration: 900, toastType: 'game-start' });
  }
  if (action === 'davinci-decision') {
    const room = currentDavinciRoom();
    if (!room) return;
    return perform(`/api/davinci/rooms/${encodeURIComponent(room.id)}/decision`, { decision: button.dataset.value });
  }
  if (action === 'davinci-penalty') {
    const room = currentDavinciRoom();
    if (!room) return;
    return perform(`/api/davinci/rooms/${encodeURIComponent(room.id)}/penalty`, { tileId: button.dataset.tileId });
  }
  if (action === 'davinci-reaction') return perform(`/api/davinci/rooms/${encodeURIComponent(idValue)}/reaction`, { type: button.dataset.reaction }, null, 'POST', { toastResult: false, preserveControls: true });
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
  if (action === 'admin-account-lock') {
    const targetUserId = String(button.dataset.userId || '');
    if (!targetUserId) return;
    const enabled = button.dataset.enabled === 'true';
    const targetName = String(button.dataset.name || '이 회원');
    const question = enabled
      ? `${targetName} 계정을 잠글까요? 현재 로그인도 즉시 종료되고 잠금 해제 전까지 로그인할 수 없습니다.`
      : `${targetName} 계정 잠금을 해제할까요? 해제 후에는 다시 로그인할 수 있습니다.`;
    if (!confirm(question)) return;
    return perform('/api/admin/account-lock', { targetUserId, enabled });
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
  if (action === 'admin-clear-ended-block-battle') return perform('/api/admin/block-battle/clear-ended', {});
  if (action === 'admin-clear-ended-davinci') return perform('/api/admin/davinci/clear-ended', {});
}

function switchMainTab(tabName, { smooth = false } = {}) {
  if (!MAIN_TABS.includes(tabName)) return;
  const changed = app.tab !== tabName;
  if (app.modal) closeModal();

  // 실시간 방 상태가 이미 도착했다면 requestAnimationFrame을 기다리지 않는다.
  // 같은 게임 탭을 다시 누른 경우에도 직전 로비 DOM이 남아 있으면 즉시 교체한다.
  const realtimeGameOpen = tabName === 'games' && Boolean(app.data && (currentOmokRoom() || currentBlockBattleRoom() || currentDavinciRoom()));

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
  const room = app.data ? currentBlockBattleRoom() : null;
  if (app.tab === 'games' && room?.viewerRole === 'player' && room.status === 'playing') return;
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
  const supportInput = event.target.closest?.('#admin-support-message');
  if (supportInput) {
    const chars = [...supportInput.value];
    if (chars.length > SUPPORT_MESSAGE_MAX_LENGTH) supportInput.value = chars.slice(0, SUPPORT_MESSAGE_MAX_LENGTH).join('');
    const count = $('#admin-support-count');
    if (count) count.textContent = `${[...supportInput.value].length}/${SUPPORT_MESSAGE_MAX_LENGTH}`;
  }
  const statusInput = event.target.closest?.('#status-message-input');
  if (statusInput) {
    const maxLength = Math.max(1, Number(app.data?.catalog?.statusMessageMaxLength) || 20);
    const count = $('#status-message-count');
    if (count) count.textContent = `${[...statusInput.value].length}/${maxLength}`;
  }
  const loudspeakerInput = event.target.closest?.('#loudspeaker-message-input');
  if (loudspeakerInput) {
    const maxLength = Math.max(1, Number(loudspeakerInput.dataset.maxLength) || 30);
    const chars = [...loudspeakerInput.value];
    // 한글 IME 조합 중에는 브라우저 조합 문자열을 강제로 잘라내지 않는다.
    if (!app.loudspeakerComposing && chars.length > maxLength) loudspeakerInput.value = chars.slice(0, maxLength).join('');
    app.loudspeakerDraft = loudspeakerInput.value;
    const count = $('#loudspeaker-message-count');
    if (count) count.textContent = `${Math.min([...loudspeakerInput.value].length, maxLength)}/${maxLength}`;
  }
});


document.addEventListener('compositionstart', (event) => {
  if (event.target.closest?.('#loudspeaker-message-input')) {
    app.loudspeakerEditing = true;
    app.loudspeakerComposing = true;
  }
});

document.addEventListener('compositionend', (event) => {
  const input = event.target.closest?.('#loudspeaker-message-input');
  if (!input) return;
  app.loudspeakerComposing = false;
  const maxLength = Math.max(1, Number(input.dataset.maxLength) || 30);
  const chars = [...input.value];
  if (chars.length > maxLength) input.value = chars.slice(0, maxLength).join('');
  app.loudspeakerDraft = input.value;
  const count = $('#loudspeaker-message-count');
  if (count) count.textContent = `${[...input.value].length}/${maxLength}`;
});

document.addEventListener('focusin', (event) => {
  if (event.target.closest?.('#loudspeaker-message-input')) app.loudspeakerEditing = true;
});

document.addEventListener('focusout', (event) => {
  if (event.target.closest?.('#loudspeaker-message-input') && !app.loudspeakerComposing) app.loudspeakerEditing = false;
});

document.addEventListener('pointerdown', (event) => {
  if (event.target.closest?.('#loudspeaker-message-input')) app.loudspeakerEditing = true;
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
}, { passive: false });
document.addEventListener('pointerup', (event) => stopBlockBattleHold('pointer', event.pointerId), { passive: true });
document.addEventListener('pointercancel', (event) => stopBlockBattleHold('pointer', event.pointerId), { passive: true });
document.addEventListener('lostpointercapture', (event) => stopBlockBattleHold('pointer', event.pointerId), { passive: true });
window.addEventListener('blur', () => stopBlockBattleHold());

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
  if (form.id === 'admin-support-form') {
    const message = [...String(data.message ?? '').replace(/\s+/g, ' ').trim()].slice(0, SUPPORT_MESSAGE_MAX_LENGTH).join('');
    if (!message) { toast('후원 문구를 입력해주세요.', 'error'); return; }
    return perform('/api/admin/support-settings', { message, enabled: Boolean(form.elements.enabled?.checked) });
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
  if (form.id === 'number-game-form') { const challenge = app.data.activeMiniChallenge ? structuredClone(app.data.activeMiniChallenge) : null; const result = await perform('/api/minigames/finish', { challengeId: challenge?.id, value: data.guess }, null, 'POST', { renderMode: 'number' }); if (result?.finished) openMiniResult(result, challenge); return; }
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
    const preset = String(data.preset ?? '100');
    const stakePoints = preset === 'custom' ? Number(data.customStake) : Number(preset);
    const result = await perform('/api/block-battle/rooms', { stakePoints });
    if (result?.ok) {
      app.blockBattleLobbyForced = false;
      app.blockBattleRoomId = result.roomId;
      closeModal();
      markTabDirty('games');
      render();
    }
    return;
  }
  if (form.id === 'davinci-create-form') {
    const preset = String(data.preset ?? '100');
    const stakePoints = preset === 'custom' ? Number(data.customStake) : Number(preset);
    const result = await perform('/api/davinci/rooms', { stakePoints });
    if (result?.ok) {
      app.davinciLobbyForced = false;
      app.davinciRoomId = result.roomId;
      app.davinciGuessTarget = null;
      closeModal();
      markTabDirty('games');
      render();
    }
    return;
  }
  if (form.id === 'bung-create-form') {
    const result = await performIdempotent('/api/bungs', { title: data.title, stakePoints: Number(data.stakePoints) }, 'bung:create');
    if (result?.ok) closeModal();
  }
});

$$('[data-auth-tab]').forEach((button) => button.addEventListener('click', () => {
  $$('[data-auth-tab]').forEach((item) => item.classList.toggle('active', item === button));
  $('#login-form').classList.toggle('hidden', button.dataset.authTab !== 'login');
  $('#register-form').classList.toggle('hidden', button.dataset.authTab !== 'register');
}));

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && app.modal) {
    if (app.modal?.type === 'mini' && app.modal?.gameId === 'minesweeper' && app.data?.activeMiniChallenge?.gameId === 'minesweeper') {
      const challenge = app.data.activeMiniChallenge;
      if (challenge.startedAt && !confirm('게임을 나가면 포기 처리됩니다. 나갈까요?')) return;
      abandonMinesweeperSilently();
    }
    closeModal();
    return;
  }
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

const MINESWEEPER_LONG_PRESS_MS = 400;
const MINESWEEPER_MOVE_CANCEL_PX = 18;
let minesweeperPointerGesture = null;
let minesweeperSuppressClickKey = '';
let minesweeperSuppressClickUntil = 0;
let minesweeperLastTouchPointerAt = 0;

function minesweeperCellKey(cell) {
  if (!cell) return '';
  return `${cell.dataset.row ?? ''}:${cell.dataset.col ?? ''}`;
}

function activeMinesweeperCellFromEvent(event) {
  const cell = event.target.closest?.('.minesweeper-cell[data-action="minesweeper-cell"]');
  if (!cell || cell.disabled || app.data?.activeMiniChallenge?.gameId !== 'minesweeper' || app.modal?.gameId !== 'minesweeper') return null;
  return cell;
}

function suppressMinesweeperSyntheticClick(cell, durationMs = 1200) {
  minesweeperSuppressClickKey = minesweeperCellKey(cell);
  minesweeperSuppressClickUntil = Date.now() + durationMs;
}

function shouldSuppressMinesweeperSyntheticClick(button, event = null) {
  if (event?.detail === 0) return false; // 키보드 Enter/Space 접근성은 그대로 허용한다.
  const key = minesweeperCellKey(button);
  if (!key || key !== minesweeperSuppressClickKey || Date.now() > minesweeperSuppressClickUntil) return false;
  minesweeperSuppressClickKey = '';
  minesweeperSuppressClickUntil = 0;
  event?.preventDefault?.();
  return true;
}

function cancelMinesweeperPointerGesture(pointerId = null) {
  const gesture = minesweeperPointerGesture;
  if (!gesture || (pointerId != null && gesture.pointerId !== pointerId)) return;
  clearTimeout(gesture.timer);
  try {
    if (gesture.cell?.hasPointerCapture?.(gesture.pointerId)) gesture.cell.releasePointerCapture(gesture.pointerId);
  } catch {}
  minesweeperPointerGesture = null;
}

function beginMinesweeperPointerGesture(event) {
  if (event.isPrimary === false || !['touch', 'pen'].includes(event.pointerType)) return;
  const cell = activeMinesweeperCellFromEvent(event);
  if (!cell) return;
  event.preventDefault();
  cancelMinesweeperPointerGesture();
  minesweeperLastTouchPointerAt = Date.now();
  const gesture = {
    pointerId: event.pointerId,
    cell,
    row: cell.dataset.row,
    col: cell.dataset.col,
    startX: Number(event.clientX) || 0,
    startY: Number(event.clientY) || 0,
    moved: false,
    longPressed: false,
    timer: null
  };
  minesweeperPointerGesture = gesture;
  try { cell.setPointerCapture?.(event.pointerId); } catch {}
  gesture.timer = setTimeout(() => {
    if (minesweeperPointerGesture !== gesture || gesture.moved || gesture.longPressed) return;
    gesture.longPressed = true;
    suppressMinesweeperSyntheticClick(cell);
    submitMinesweeperAction('flag', gesture.row, gesture.col);
  }, MINESWEEPER_LONG_PRESS_MS);
}

function moveMinesweeperPointerGesture(event) {
  const gesture = minesweeperPointerGesture;
  if (!gesture || gesture.pointerId !== event.pointerId) return;
  event.preventDefault();
  const dx = (Number(event.clientX) || 0) - gesture.startX;
  const dy = (Number(event.clientY) || 0) - gesture.startY;
  if (Math.hypot(dx, dy) <= MINESWEEPER_MOVE_CANCEL_PX) return;
  gesture.moved = true;
  clearTimeout(gesture.timer);
}

function finishMinesweeperPointerGesture(event) {
  const gesture = minesweeperPointerGesture;
  if (!gesture || gesture.pointerId !== event.pointerId) return;
  event.preventDefault();
  clearTimeout(gesture.timer);
  suppressMinesweeperSyntheticClick(gesture.cell);
  const shouldReveal = !gesture.longPressed && !gesture.moved;
  const { row, col } = gesture;
  cancelMinesweeperPointerGesture(event.pointerId);
  if (shouldReveal) submitMinesweeperAction('reveal', row, col);
}

document.addEventListener('pointerdown', beginMinesweeperPointerGesture, { passive: false });
document.addEventListener('pointermove', moveMinesweeperPointerGesture, { passive: false });
document.addEventListener('pointerup', finishMinesweeperPointerGesture, { passive: false });
document.addEventListener('pointercancel', (event) => cancelMinesweeperPointerGesture(event.pointerId));

document.addEventListener('contextmenu', (event) => {
  const cell = activeMinesweeperCellFromEvent(event);
  if (!cell) return;
  event.preventDefault();
  // 모바일/펜의 길게 누르기에서 브라우저가 contextmenu를 추가 발생시키더라도
  // 깃발이 두 번 토글되지 않게 한다. 마우스 우클릭만 여기서 처리한다.
  if (Date.now() - minesweeperLastTouchPointerAt < 1600) return;
  submitMinesweeperAction('flag', cell.dataset.row, cell.dataset.col);
});

function syncGameViewportLayout() {
  if (app.appleModalActive) requestAnimationFrame(() => {
    syncAppleGameLayout();
    syncBlockGameLayout();
    syncMinesweeperGameLayout();
  });
}
window.visualViewport?.addEventListener('resize', syncGameViewportLayout);
window.visualViewport?.addEventListener('scroll', syncGameViewportLayout);
window.addEventListener('resize', syncGameViewportLayout);
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
  if (document.hidden) {
    stopBlockBattleHold();
    app.blockBattlePredictedGravity = null;
    syncBlockBattleGravity();
    return;
  }
  // 백그라운드 동안 서버 fallback이 진행됐을 수 있으므로 오래된 로컬 판에서 tick을
  // 먼저 재개하지 않는다. 최신 서버 상태를 받은 뒤 낙하 타이머를 다시 시작한다.
  if (app.token && navigator.onLine) {
    app.blockBattlePredictedGravity = null;
    loadBootstrap({ silent: true }).finally(syncBlockBattleGravity);
  } else syncBlockBattleGravity();
});
window.addEventListener('pageshow', (event) => {
  if (event.persisted && app.token && navigator.onLine) loadBootstrap({ silent: true });
});
app.tickTimer = setInterval(tick, 1_000);
app.reconcileTimer = setInterval(() => {
  if (app.token && !document.hidden && navigator.onLine && app.ws?.readyState === WebSocket.OPEN && !app.busy) loadBootstrap({ silent: true });
}, 60_000);
if (app.token) loadBootstrap(); else showAuth();
navigator.serviceWorker?.register?.('/sw.js?v=69202')?.catch(() => {});
