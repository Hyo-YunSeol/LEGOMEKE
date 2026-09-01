import { cloneBlockBattleVisualPlayer, reconcileBlockBattleVisual } from './block-battle-visual-state.js';
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
  omokSetupPointerSuppressUntil: 0,
  blockBattleRoomId: null,
  sichuanRoomId: null,
  sichuanLobbyForced: false,
  sichuanSelectedIndex: null,
  // Pair requests are serialized in the background, but input is never locked while a request is in flight.
  // pendingPairs are overlaid on top of the latest server board so realtime/HTTP updates cannot resurrect
  // a locally removed pair before that queued request has been acknowledged.
  sichuanActionInFlight: false,
  sichuanPairQueue: [],
  sichuanPendingPairs: [],
  sichuanPairSending: false,
  sichuanPointerSuppressUntil: 0,
  sichuanLastRefreshAt: 0,
  sichuanServerSyncedAt: monotonicNow(),
  legodokuRoomId: null,
  legodokuLobbyForced: false,
  legodokuActionInFlight: false,
  legodokuCellQueue: [],
  legodokuMarksKey: '',
  legodokuMarks: new Set(),
  legodokuPointer: null,
  legodokuPointerSuppressUntil: 0,
  legodokuLastRefreshAt: 0,
  legodokuServerSyncedAt: monotonicNow(),
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
  blockBattlePredictedLock: null,
  // 1:1 테트리스의 내 화면은 서버 snapshot과 분리된 단일 visual state만 그린다.
  // 서버 push가 떨어지는 블록을 되감거나 지우지 못하게 하는 핵심 상태다.
  blockBattleVisualSelf: null,
  blockBattlePaintSelfOnce: false,
  blockBattleLockQueued: false,
  // Space는 물리 keydown 1회당 hardDrop 1회만 허용한다. 다음 블록으로 예약하지 않는다.
  blockBattleKeyboardSuppressClickUntil: 0,
  blockBattleHoldDelay: null,
  blockBattleHoldTimer: null,
  blockBattleHold: null,
  blockBattleRenderFrame: 0,
  blockBattleNeedsLayout: false,
  blockBattleViewportFrame: 0,
  blockBattleRecoveryTimer: null,
  blockBattleLastErrorKey: '',
  blockBattleLastErrorAt: 0,
  singleTetrisState: null,
  singleTetrisGravityTimer: null,
  singleTetrisClockTimer: null,
  singleTetrisHoldDelay: null,
  singleTetrisHoldTimer: null,
  singleTetrisHold: null,
  singleTetrisFinishRetryTimer: null,
  gameResultScrollY: null,
  dismissedGameResults: new Set((() => { try { const parsed = JSON.parse(sessionStorage.getItem('lego_dismissed_game_results') || '[]'); return Array.isArray(parsed) ? parsed : []; } catch { return []; } })()),
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
  appleLayoutFrame: 0,
  appleModalActive: false,
  singleTetrisModalActive: false,
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
const dateOnlyText = (value) => value ? new Date(value).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }) : '-';
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
  // The modal root is position:fixed. Applying visualViewport.offsetTop again can double-shift
  // the sheet on mobile browsers, so only the visible height is used for sizing.
  document.documentElement.style.setProperty('--visual-viewport-height', `${height}px`);
  document.documentElement.style.setProperty('--visual-viewport-top', '0px');
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

function setSingleTetrisModalMode(active) {
  app.singleTetrisModalActive = Boolean(active);
  document.body.classList.toggle('single-tetris-playing', app.singleTetrisModalActive);
  $('#modal-root')?.classList.toggle('single-tetris-modal-root', app.singleTetrisModalActive);
  if (app.singleTetrisModalActive) updateVisualViewportVars();
}

function setAppleGameModalMode(active) {
  $('#modal-root')?.classList.toggle('apple-game-modal-root', Boolean(active));
}

function currentSupportSettings() {
  const raw = app.data?.support && typeof app.data.support === 'object' ? app.data.support : {};
  const message = [...String(raw.message ?? DEFAULT_SUPPORT_MESSAGE).replace(/\s+/g, ' ').trim()].slice(0, SUPPORT_MESSAGE_MAX_LENGTH).join('');
  return { enabled: raw.enabled !== false, message: message || DEFAULT_SUPPORT_MESSAGE };
}

function supportBannerShouldHide() {
  if (!app.data || app.modal) return true;
  if (app.tab !== 'games') return false;
  return Boolean(currentOmokRoom() || currentBlockBattleRoom() || currentSichuanRoom() || currentLegodokuRoom());
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
  const previousSichuanRooms = new Map((app.data?.sichuan?.rooms || []).map((room) => [room.id, room]));
  const previousBattleKey = (app.data?.blockBattle?.rooms || [])
    .map((room) => `${room.id}:${room.matchId}:${room.stateVersion}:${room.status}:${room.spectatorCount}`).join('|');
  const nextBattleKey = (next?.blockBattle?.rooms || [])
    .map((room) => `${room.id}:${room.matchId}:${room.stateVersion}:${room.status}:${room.spectatorCount}`).join('|');
  const changed = !app.data || revision !== app.revision || previousBattleKey !== nextBattleKey;
  app.data = next;
  // WebSocket으로 이미 더 최신 사천성 판을 받은 뒤 늦게 도착한 bootstrap이 패를 되살리거나
  // 선택 위치를 흔들지 못하게 같은 matchId에서는 stateVersion이 낮은 방 상태를 버린다.
  for (let index = 0; index < (app.data?.sichuan?.rooms || []).length; index += 1) {
    const room = app.data.sichuan.rooms[index];
    const previous = previousSichuanRooms.get(room.id);
    const sameMatch = Boolean(previous?.matchId && previous.matchId === room.matchId);
    const sameSpectatorStream = Boolean(previous && previous.viewerRole === 'spectator' && room.viewerRole === 'spectator' && previous.status === 'playing' && room.status === 'playing');
    if ((sameMatch || sameSpectatorStream) && Number(room.stateVersion || 0) < Number(previous.stateVersion || 0)) app.data.sichuan.rooms[index] = previous;
  }
  app.revision = revision;
  app.bootstrapSyncedAt = monotonicNow();
  app.blockBattleServerSyncedAt = app.bootstrapSyncedAt;
  app.sichuanServerSyncedAt = app.bootstrapSyncedAt;
  preloadSichuanTiles();
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
    const acknowledged = acknowledgeBlockBattleBatch(room);
    const safeVisualReconcile = acknowledged && app.blockBattlePendingBatches.length === 0 && app.blockBattleInputBuffer.length === 0;
    const visualKey = `${room.id}:${room.matchId}:${room.selfPetId || ''}`;
    const visualBefore = app.blockBattleVisualSelf?.key === visualKey ? app.blockBattleVisualSelf.player : null;
    const beforePieceCount = Number(visualBefore?.pieces || 0);
    const beforeActiveType = String(visualBefore?.active?.type || '');
    const beforeBoardKey = safeVisualReconcile ? JSON.stringify(visualBefore?.board ?? null) : '';
    const visualAfter = blockBattleVisualSelf(room, { force: safeVisualReconcile });
    if (safeVisualReconcile && visualAfter && (
      Number(visualAfter.pieces || 0) !== beforePieceCount
      || String(visualAfter.active?.type || '') !== beforeActiveType
      || JSON.stringify(visualAfter.board ?? null) !== beforeBoardKey
    )) app.blockBattlePaintSelfOnce = true;
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
  stopSingleTetrisTimers();
  clearTimeout(app.singleTetrisFinishRetryTimer);
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
  app.singleTetrisState = null;
  app.gameResultScrollY = null;
  document.body.classList.remove('game-result-open');
  document.body.style.top = '';
  app.blockBattleRoomId = null;
  app.sichuanRoomId = null;
  app.sichuanLobbyForced = false;
  app.sichuanSelectedIndex = null;
  app.sichuanActionInFlight = false;
  app.sichuanPairQueue = [];
  app.sichuanPendingPairs = [];
  app.sichuanPairSending = false;
  app.sichuanPointerSuppressUntil = 0;
  app.sichuanLastRefreshAt = 0;
  app.sichuanServerSyncedAt = monotonicNow();
  app.legodokuRoomId = null;
  app.legodokuLobbyForced = false;
  app.legodokuActionInFlight = false;
  app.legodokuCellQueue = [];
  app.legodokuMarksKey = '';
  app.legodokuMarks = new Set();
  app.legodokuPointer = null;
  app.legodokuPointerSuppressUntil = 0;
  app.legodokuLastRefreshAt = 0;
  app.legodokuServerSyncedAt = monotonicNow();
  app.blockBattleLobbyForced = false;
  app.blockBattleInputBuffer = [];
  app.blockBattlePendingBatches = [];
  app.blockBattleSending = false;
  app.blockBattleServerVersions = new Map();
  app.blockBattleGravityTimer = null;
  app.blockBattleGravityKey = null;
  app.blockBattlePredictedGravity = null;
  app.blockBattlePredictedLock = null;
  app.blockBattleVisualSelf = null;
  app.blockBattlePaintSelfOnce = false;
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
    if (!hadData && (currentOmokRoom() || currentBlockBattleRoom() || currentSichuanRoom())) {
      app.tab = 'games';
      app.omokLobbyForced = false;
      app.blockBattleLobbyForced = false;
      app.sichuanLobbyForced = false;
      app.legodokuLobbyForced = false;
      markTabDirty('games');
    } else if (!hadData && currentLegodokuRoom()) {
      app.tab = 'games';
      app.legodokuLobbyForced = false;
      markTabDirty('games');
    }
    showApp();
    const appleOnlyUpdated = renderMode === 'apple' && refreshAppleMiniOnly();
    const blockOnlyUpdated = renderMode === 'block' && refreshBlockMiniOnly();
    const minesweeperOnlyUpdated = (renderMode === 'minesweeper' || (renderMode === 'full' && app.modal?.type === 'mini' && app.modal?.gameId === 'minesweeper')) && refreshMinesweeperMiniOnly();
    const numberInputProtected = renderMode === 'full' && numberGuessInputIsActive() && refreshNumberMiniOnly();
    const liveBlockBattleRoom = app.tab === 'games' ? currentBlockBattleRoom() : null;
    const paintBlockBattleSelf = Boolean(liveBlockBattleRoom?.status === 'playing' && app.blockBattlePaintSelfOnce);
    if (paintBlockBattleSelf) app.blockBattlePaintSelfOnce = false;
    const blockBattleLivePatched = Boolean(liveBlockBattleRoom?.status === 'playing' && patchBlockBattleDynamic(liveBlockBattleRoom, { paintSelf: paintBlockBattleSelf }));
    const liveSichuanRoom = app.tab === 'games' ? currentSichuanRoom() : null;
    const sichuanLivePatched = Boolean(liveSichuanRoom?.status === 'playing' && patchSichuanLiveRoom(liveSichuanRoom));
    const liveLegodokuRoom = app.tab === 'games' ? currentLegodokuRoom() : null;
    const legodokuLivePatched = Boolean(liveLegodokuRoom?.status === 'playing' && patchLegodokuLiveRoom(liveLegodokuRoom));
    // 실시간 판을 플레이 중일 때 generic bootstrap은 데이터만 동기화하고 게임 DOM은 절대 교체하지 않는다.
    // 특히 1:1 테트리스는 presence/벙/다른 게임 refresh 때 200셀 판이 통째로 삭제·재생성되며
    // 블록이 사라졌다 나타나고 이전 프레임 잔상이 남는 원인이 됐다.
    if (numberInputProtected || blockBattleLivePatched || sichuanLivePatched || legodokuLivePatched) markTabDirty('games');
    if (!appleOnlyUpdated && !blockOnlyUpdated && !minesweeperOnlyUpdated && !numberInputProtected && !blockBattleLivePatched && !sichuanLivePatched && !legodokuLivePatched) {
      render();
      const keepSingleTetrisResult = app.modal?.type === 'mini' && app.modal?.gameId === 'tetrisSingle' && app.singleTetrisState?.ended;
      if (app.modal && dataChanged && !keepSingleTetrisResult) refreshModal();
    } else if (blockBattleLivePatched || sichuanLivePatched || legodokuLivePatched) {
      updateAppChrome();
      if (blockBattleLivePatched) syncBlockBattleGravity();
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
      } else if (payload.type === 'sichuan-state') {
        applySichuanRoomState(payload);
      } else if (payload.type === 'legodoku-state') {
        applyLegodokuRoomState(payload);
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
    if (!document.hidden && navigator.onLine) {
      const room = currentSichuanRoom() || currentLegodokuRoom();
      loadBootstrap({ silent: true, renderMode: room?.status === 'playing' ? 'games-live' : 'full' });
    }
  }, 5_000);
}

function modalHeader(title, description = '') {
  return `<header class="modal-head"><div><h2>${esc(title)}</h2>${description ? `<p>${esc(description)}</p>` : ''}</div><button class="icon-button" data-action="close-modal" type="button" aria-label="닫기">✕</button></header>`;
}

function appleModalHeader(title, description = '') {
  return `<header class="modal-head apple-modal-head"><div><h2>${esc(title)}</h2>${description ? `<p>${esc(description)}</p>` : ''}</div><div class="apple-modal-head-actions"><button class="ghost apple-header-abandon" data-action="abandon-mini" type="button">포기</button><button class="icon-button" data-action="close-modal" type="button" aria-label="닫기">✕</button></div></header>`;
}

function openSupportModal() {
  const support = currentSupportSettings();
  openModal(`${modalHeader('💛 LEGO LIFE 후원하기')}<div class="support-modal-card"><div class="support-heart">🧱💛</div><p>${esc(support.message)}</p><a class="support-kakaopay-link" href="${SUPPORT_LINK}" target="_blank" rel="noopener noreferrer">카카오페이로 작은 힘 보태기</a><small>후원은 자유입니다 💛</small></div>`, { type: 'support' });
}

function openModal(html, descriptor = {}) {
  if (descriptor.type !== 'mini') cleanupAppleBoardUi();
  const singleTetrisMode = descriptor.type === 'mini' && descriptor.gameId === 'tetrisSingle';
  const appleGameMode = descriptor.type === 'mini' && descriptor.gameId === 'apple';
  setAppleModalMode(descriptor.type === 'mini' && ['apple', 'block', 'minesweeper', 'tetrisSingle'].includes(descriptor.gameId));
  setAppleGameModalMode(appleGameMode);
  setSingleTetrisModalMode(singleTetrisMode);
  app.modal = descriptor;
  $('#modal-content').innerHTML = html;
  $('#modal-root').classList.remove('hidden');
  $('#modal-root').setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => $('#modal-root').classList.add('open'));
  syncSupportBanner();
}

function closeModal() {
  stopSingleTetrisTimers();
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
  setSingleTetrisModalMode(false);
  setAppleGameModalMode(false);
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
  if (descriptor.type === 'bodyAdvancement') return openBodyAdvancement();
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
  if (descriptor.type === 'omokCreate' || descriptor.type === 'blockBattleCreate' || descriptor.type === 'sichuanCreate') return;
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
    let result;
    try {
      result = await api(path, { method, body: method === 'GET' || method === 'DELETE' ? undefined : JSON.stringify(body) });
    } catch (error) {
      // 서버 응답 자체를 받지 못한 경우에만 호출자에게 미확정(null)으로 돌려준다.
      // idempotent 요청은 이때만 같은 requestId를 보존해 안전하게 재시도한다.
      toast(error.message, 'error');
      return null;
    }

    try {
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
    } catch (error) {
      // 서버 처리가 이미 성공/거절로 확정된 뒤의 DOM 렌더 오류를 네트워크 실패로 오인하면
      // 같은 requestId가 다음 '새 구매'까지 남아 반복구매가 중복요청으로 막힐 수 있다.
      console.error('UI refresh after confirmed request failed', error);
      toast('요청 처리는 완료됐지만 화면 갱신에 실패했습니다. 상태를 다시 불러옵니다.', 'error', 2200);
      setTimeout(() => { if (app.token) loadBootstrap({ silent: true }); }, 0);
    }
    return result;
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
  // busy 상태에서 requestId부터 만들어 두면 실제 요청을 보내지 않았는데도 다음 클릭이
  // 이전 요청으로 오인될 수 있다. 먼저 입력을 명확히 거부하고 requestId는 전송 직전에만 만든다.
  if (app.busy) {
    toast('이전 요청을 처리 중입니다. 완료 후 다시 눌러주세요.', 'error', 1800);
    return null;
  }
  const safeKey = String(operationKey || 'operation');
  const requestId = operationRequestId(safeKey);
  const result = await perform(path, { ...body, requestId }, successMessage, method, options);
  // 응답을 받았다는 것은 성공/서버 거절 모두 요청 결과가 확정됐다는 뜻이다.
  // 네트워크 자체가 끊겨 결과를 모르는 경우(null)에만 같은 ID를 남겨 다음 시도가 안전한 재조회가 되게 한다.
  if (result) app.pendingOperationIds.delete(safeKey);
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
function visualStageForProfile(profile = {}) {
  const selected = profile?.bodyAdvancement?.selected;
  if (selected?.assetKey) return { key:`adv-${selected.key}`, assetKey:selected.assetKey, label:selected.label, activityHungerCost:profile?.bodyStage?.activityHungerCost ?? 7, advancement:true };
  return profile?.bodyStage || stageForBody(profile?.stats?.body);
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
  return `<img class="${className}" src="/flex/${esc(flexItem.assetKey)}.svg?v=6101231" alt="${esc(flexItem.name)}" draggable="false">`;
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
  const src = `/pets/${esc(stage.assetKey || stage.key)}.svg?v=6101231`;
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
  const bodyStage = pet.bodyStage || stageForBody(pet.stats.body);
  const stage = visualStageForProfile(pet);
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
      <div class="hero-main">${avatar(stage, { flexItem: pet.flexItem })}<div class="hero-copy"><span class="eyebrow"><button class="body-stage-link" data-action="body-guide" data-body="${pet.stats.body}" type="button">${esc(stage.label)}</button> · ${pet.generation}세대</span><h1>${levelBadgeHtml(pet)}<span class="flex-display-name">${esc(pet.displayName)}</span>${seasonBadgesHtml(pet)}</h1><div class="status-message-row"><span class="status-message-text ${pet.statusMessage ? '' : 'muted'}">${esc(pet.statusMessage || '상태메시지 없음')}</span><button class="status-edit-button" data-action="edit-status-message" type="button" >수정</button></div><p class="system-status">${esc(pet.status)}</p><div class="hero-tags"><span>Lv.${pet.stats.level}</span>${pet.bodyAdvancement?.unlocked ? `<button class="advancement-chip" data-action="body-advancement" type="button">${pet.bodyAdvancement.selected ? `✨ ${esc(pet.bodyAdvancement.selected.label)}` : '✨ 전직 가능'}</button>` : ''}<span>레고력 ${pet.stats.legoPower}</span><span>${esc(pet.coupleLabel || (pet.partnerPetId ? `${pet.partnerDisplayName || '상대'}와 커플 D+${pet.coupleDay}` : '솔로'))}</span></div></div></div>
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
  const apple = rankRows(rankings.apple ?? [], (item) => `${Number(item.score || 0).toLocaleString('ko-KR')}점`);
  const singleTetris = rankRows(rankings.singleTetris ?? [], (item) => `${Number(item.score || 0).toLocaleString('ko-KR')}점`);
  const omok = rankRows(rankings.omok ?? [], (item) => `${item.wins}승 ${item.draws}무 ${item.losses}패`);
  const blockBattle = rankRows(rankings.blockBattle?.top ?? [], (item) => `${item.wins}승 ${item.losses}패`);
  const sichuan = rankRows(rankings.sichuan?.top ?? [], (item) => `${item.wins}승 ${item.draws}무 ${item.losses}패`);
  const legodoku = rankRows(rankings.legodoku?.top ?? [], (item) => `${item.wins}승 ${item.draws}무 ${item.losses}패`);
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
  return `<section class="section ranking-section">${sectionHeading('레고방 순위', '포인트·레벨·체형도감과 게임 TOP 5')}<div class="rank-tabs-grid"><article class="rank-card"><h3>포인트 TOP 5</h3>${rankRows(rankings.points, (item) => points(item.points))}</article><article class="rank-card"><h3>레벨 TOP 5</h3>${rankRows(rankings.levels, (item) => `Lv.${item.level} · ${item.legoPower}`)}</article><article class="rank-card"><h3>체형도감 TOP 5</h3>${rankRows(rankings.bodyStages ?? [], (item) => `${Number(item.stageLevel || 0)}단계 · ${esc(item.stageLabel || '-')}`)}</article></div><div class="game-ranking-heading"><strong>게임 순위</strong><div class="game-ranking-meta"><small>모든 게임 순위는 3일 시즌 · 동시에 초기화</small><b id="game-season-countdown">${gameSeasonCountdownText(rankings.gameSeason?.endsAt)}</b></div></div><div class="game-rank-grid personal-game-rank-grid">${mineCard}<article class="rank-card"><h3>🍎 사과게임 TOP 5</h3>${apple}${myRank(myGameRanks.apple, (item) => `${Number(item.score || 0).toLocaleString('ko-KR')}점`)}</article><article class="rank-card"><h3>🧱 싱글 테트리스 TOP 5</h3>${singleTetris}${myRank(myGameRanks.singleTetris, (item) => `${Number(item.score || 0).toLocaleString('ko-KR')}점`)}</article></div><div class="battle-game-rank-grid"><article class="rank-card"><h3>⚫ 오목 TOP 5</h3>${omok}${myRank(myGameRanks.omok, (item) => `${item.wins}승 ${item.draws}무 ${item.losses}패`)}</article><article class="rank-card"><h3>🧱 테트리스 TOP 5</h3>${blockBattle}${myRank(rankings.blockBattle?.mine, (item) => `${item.wins}승 ${item.losses}패`)}</article><article class="rank-card"><h3>🀄 사천성 TOP 5</h3>${sichuan}${myRank(rankings.sichuan?.mine, (item) => `${item.wins}승 ${item.draws}무 ${item.losses}패`)}</article><article class="rank-card"><h3>🧩 레고도쿠 TOP 5</h3>${legodoku}${myRank(rankings.legodoku?.mine, (item) => `${item.wins}승 ${item.draws}무 ${item.losses}패`)}</article></div><div class="relation-ranking-more">${relationToggle}${relationRows}</div></section>`;
}

function newsList() {
  const events = app.data.publicEvents ?? [];
  return events.length ? `<div class="news-list">${events.map((event) => `<article><span class="news-dot ${esc(event.type)}"></span><div><p>${esc(event.text)}</p><small>${dateText(event.createdAt)}</small></div></article>`).join('')}</div>` : '<div class="empty">아직 레고방 소식이 없습니다.</div>';
}

function miniGameIcon(gameId) {
  return ({ oddEven: '🌓', apple: '🍎', minesweeper: '💣', block: '🧱', tetrisSingle: '🧱' })[gameId] || '🎮';
}

function gamesView() {
  const games = app.data.catalog.miniGames;
  const active = app.data.activeMiniChallenge;
  const activeGame = active ? games.find((game) => game.id === active.gameId) : null;
  const resume = active
    ? `<div class="active-game-banner"><div><strong>${esc(activeGame?.name || '개인게임')} 진행 중</strong><small>${active.gameId === 'minesweeper' ? '게임 화면을 나가면 포기 처리됩니다.' : active.gameId === 'tetrisSingle' ? '2분 제한시간은 화면을 벗어나도 계속 흐릅니다.' : '새로고침해도 이어서 할 수 있습니다.'}</small></div><button class="primary" data-action="resume-mini" type="button">${active.gameId === 'minesweeper' ? '게임으로 돌아가기' : '이어하기'}</button></div>`
    : '';
  return `
    <section class="page-title"><span class="eyebrow">포인트 게임</span><h1>게임</h1></section>
    <section class="section personal-game-wrap">${sectionHeading('포인트 개인게임', `이번 게임 하루 ${app.data.dashboard.pet.daily.miniGamesPlayed}/${app.data.dashboard.pet.daily.miniGamesLimit || app.data.catalog.miniGamesPerDay}회`)}${resume}<div class="game-grid">${games.map((game) => `<article class="game-card"><div class="game-icon">${miniGameIcon(game.id)}</div><h3>${esc(game.name)}</h3><p>${esc(game.description)}</p><button class="primary wide" data-action="${active?.gameId === game.id ? 'resume-mini' : 'start-mini'}" data-id="${game.id}" type="button" ${active && active.gameId !== game.id ? 'disabled' : ''}>${active?.gameId === game.id ? (game.id === 'minesweeper' ? '게임으로' : '이어하기') : '시작'}</button></article>`).join('')}</div></section>
    <div class="game-category-heading"><span>단체게임</span></div>
    <section class="section omok-wrap">${omokSection()}</section>
    <section class="section block-battle-wrap">${blockBattleSection()}</section>
    <section class="section sichuan-wrap">${sichuanSection()}</section>
    <section class="section legodoku-wrap">${legodokuSection()}</section>
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

function battleUsageText() {
  const daily = app.data?.dashboard?.pet?.daily || {};
  const used = Math.max(0, Number(daily.battlePlayed || 0));
  const limit = Math.max(30, Number(daily.battleLimit || 30));
  return `대전 ${used}/${limit}회`;
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
  const rooms = (omok?.rooms ?? []).filter((room) => room.status !== 'ended');
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
  return `${sectionHeading('오목게임', battleUsageText(), `<button class="primary" data-action="omok-create" type="button" ${canCreate ? '' : 'disabled'}>방 만들기</button>`)}<div class="omok-lobby-list">${cards}</div>`;
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


function gameResultKey(game, room) {
  return `${game}:${room?.id || 'room'}:${room?.matchId || room?.endedAt || room?.status || 'ended'}`;
}

function persistDismissedGameResults() {
  try { sessionStorage.setItem('lego_dismissed_game_results', JSON.stringify([...app.dismissedGameResults].slice(-80))); } catch { /* storage unavailable */ }
}

function resultReasonLine(room, selfId, winnerName) {
  const reason = String(room?.resultReason || '').trim();
  if (!reason) return '';
  const winnerIsMe = Boolean(selfId && room?.winnerPetId === selfId);
  const lost = Boolean(selfId && room?.winnerPetId && room.winnerPetId !== selfId);
  if (/시간|초과/.test(reason)) {
    if (winnerIsMe) return '상대방의 시간이 초과되었습니다.';
    if (lost) return '시간초과로 게임이 종료되었습니다. 상대방의 승리로 처리되었습니다.';
  }
  if (/이탈|나갔|접속|재접속/.test(reason)) {
    if (winnerIsMe) return '상대방이 게임에서 나갔습니다.';
    if (lost) return '게임에서 이탈해 상대방의 승리로 처리되었습니다.';
  }
  if (/기권|포기/.test(reason)) {
    if (winnerIsMe) return '상대방이 게임을 포기했습니다.';
    if (lost) return '게임을 포기했습니다. 상대방의 승리로 처리되었습니다.';
  }
  return reason;
}

function commonBattleResultOverlay(game, room, { totalPot = 0 } = {}) {
  if (!room || room.status !== 'ended') return '';
  const key = gameResultKey(game, room);
  if (app.dismissedGameResults.has(key)) return '';
  const selfId = app.data?.dashboard?.pet?.id || '';
  const role = room.viewerRole || 'none';
  const isPlayer = role === 'player';
  const isSpectator = role === 'spectator';
  const isDraw = room.result === 'draw' || (!room.winnerPetId && /무승부/.test(String(room.resultReason || '')));
  let winnerName = '';
  winnerName = room.players?.[room.winnerPetId]?.displayName
    || (room.winnerPetId === room.black?.petId ? room.black?.displayName : '')
    || (room.winnerPetId === room.white?.petId ? room.white?.displayName : '')
    || (room.winnerPetId === room.host?.petId ? room.host?.displayName : '')
    || (room.winnerPetId === room.guest?.petId ? room.guest?.displayName : '')
    || '승자';
  const won = Boolean(isPlayer && room.winnerPetId && room.winnerPetId === selfId);
  const title = isDraw ? '🤝 무승부' : isSpectator ? '🏆 게임 종료' : won ? '🏆 승리!' : '게임 종료';
  const main = isDraw ? '게임이 무승부로 종료되었습니다.' : `${esc(winnerName)} 승리`;
  const reason = isDraw ? '' : resultReasonLine(room, isPlayer ? selfId : '', winnerName);
  const reward = won && Number(totalPot) > 0 ? `<div class="common-result-reward"><span>획득 포인트</span><strong>+${Number(totalPot).toLocaleString('ko-KR')}P</strong></div>` : '';
  const titleId = `game-result-title-${String(game || 'battle').replace(/[^A-Za-z0-9_-]/g, '-')}`;
  return `<div class="common-game-result-overlay" data-result-key="${esc(key)}" role="dialog" aria-modal="true" aria-labelledby="${esc(titleId)}"><div class="common-game-result-card"><h2 id="${esc(titleId)}">${title}</h2><strong class="common-result-main">${main}</strong>${reason ? `<p>${esc(reason)}</p>` : ''}${reward}<button class="primary wide" data-action="battle-result-confirm" data-game="${esc(game)}" data-id="${esc(room.id || '')}" data-key="${esc(key)}" data-role="${esc(role)}" type="button">확인</button></div></div>`;
}

function syncGameResultScrollLock() {
  const open = Boolean(document.querySelector('.common-game-result-overlay, .single-tetris-result-overlay'));
  if (open && app.gameResultScrollY == null) {
    app.gameResultScrollY = window.scrollY || window.pageYOffset || 0;
    document.body.classList.add('game-result-open');
    document.body.style.top = `-${app.gameResultScrollY}px`;
  } else if (!open && app.gameResultScrollY != null) {
    const y = app.gameResultScrollY;
    app.gameResultScrollY = null;
    document.body.classList.remove('game-result-open');
    document.body.style.top = '';
    window.scrollTo(0, y);
  }
}

async function dismissBattleResult(game, roomId, key, viewerRole = 'none') {
  // 결과창의 확인은 단순 UI 닫기가 아니다. 서버 방에서도 실제 퇴장 처리한 뒤에만
  // 로비로 복귀한다. 네트워크 오류가 나면 결과창을 유지해 다시 확인할 수 있게 한다.
  const basePath = ({
    omok: '/api/omok/rooms',
    blockBattle: '/api/block-battle/rooms',
    sichuan: '/api/sichuan/rooms',
    legodoku: '/api/legodoku/rooms'
  })[game];
  if (basePath && roomId && (viewerRole === 'player' || viewerRole === 'spectator')) {
    const suffix = viewerRole === 'spectator' ? '/spectate/leave' : '/leave';
    const result = await perform(`${basePath}/${encodeURIComponent(roomId)}${suffix}`, {}, null, 'POST', {
      toastResult: false,
      preserveControls: true
    });
    if (!result?.ok) return false;
  }
  if (key) { app.dismissedGameResults.add(key); persistDismissedGameResults(); }
  if (game === 'omok') { app.omokRoomId = null; app.omokLobbyForced = true; }
  if (game === 'blockBattle') { app.blockBattleRoomId = null; app.blockBattleLobbyForced = true; resetBlockBattleInputQueue(); }
  if (game === 'sichuan') { resetSichuanInputQueue(); app.sichuanRoomId = null; app.sichuanLobbyForced = true; app.sichuanSelectedIndex = null; }
  if (game === 'legodoku') { resetLegodokuPointer(); app.legodokuRoomId = null; app.legodokuLobbyForced = true; app.legodokuMarksKey = ''; app.legodokuMarks = new Set(); }
  markTabDirty('games');
  render();
  requestAnimationFrame(syncGameResultScrollLock);
  return true;
}

function omokRoomView(room) {
  const isPlayer = room.viewerRole === 'player';
  const isSpectator = room.viewerRole === 'spectator';
  const board = room.board.map((line, row) => line.map((cell, col) => { const last = room.lastMove && Number(room.lastMove.row) === row && Number(room.lastMove.col) === col; return `<button class="omok-cell ${cell || ''} ${last ? 'last-move' : ''}" data-action="omok-move" data-row="${row}" data-col="${col}" type="button" ${!isPlayer || room.status !== 'playing' || room.phase !== 'turn' || !room.isMyTurn || cell ? 'disabled' : ''} aria-label="${row + 1}행 ${col + 1}열${last ? ' · 마지막 수' : ''}">${cell === 'black' ? '<span class="omok-stone black"></span>' : cell === 'white' ? '<span class="omok-stone white"></span>' : ''}${last ? '<i class="last-move-mark"></i>' : ''}</button>`; }).join('')).join('');
  const turnName = room.currentTurnPetId === room.black?.petId ? room.black?.displayName : room.currentTurnPetId === room.white?.petId ? room.white?.displayName : '-';
  const emoji = { rock: '✊', paper: '✋', scissors: '✌️' };
  const label = { rock: '바위', paper: '보', scissors: '가위' };
  let pregame = '';
  if (room.status === 'playing' && room.phase === 'rps') {
    const mine = room.rpsChoices?.[app.data.dashboard.pet.id];
    const controls = isPlayer ? (mine ? `<div class="battle-selected">${emoji[mine]} ${label[mine]} 선택 완료 · 상대를 기다리는 중</div>` : `<div class="battle-rps-buttons"><button data-action="omok-rps" data-value="scissors" type="button">✌️<small>가위</small></button><button data-action="omok-rps" data-value="rock" type="button">✊<small>바위</small></button><button data-action="omok-rps" data-value="paper" type="button">✋<small>보</small></button></div>`) : '<p class="helper centered">가위바위보 결과를 기다리는 중입니다.</p>';
    pregame = `<div class="battle-action-card"><strong>가위바위보 · ${Number(room.rpsRound || 1)}라운드</strong><p>승자가 흑돌 또는 백돌을 선택합니다.</p>${controls}</div>`;
  } else if (room.status === 'playing' && room.phase === 'colorChoice') {
    const winnerName = room.rpsWinnerPetId === room.host?.petId ? room.host?.displayName : room.guest?.displayName;
    pregame = room.rpsWinnerPetId === app.data.dashboard.pet.id ? `<div class="battle-action-card"><strong>🏆 ${esc(winnerName || '')} 승리!</strong><p>원하는 돌을 선택하세요. 흑돌이 선공입니다.</p><div class="button-row"><button class="primary" data-action="omok-color" data-value="black" type="button">⚫ 흑돌</button><button class="soft-button" data-action="omok-color" data-value="white" type="button">⚪ 백돌</button></div></div>` : `<div class="battle-action-card"><strong>🏆 ${esc(winnerName || '')} 승리</strong><p>흑돌·백돌 선택을 기다리는 중입니다.</p></div>`;
  }
  const rematch = room.status === 'ended' && isPlayer ? `<button class="primary" data-action="omok-rematch" data-id="${room.id}" type="button">${room.rematchRequestedByMe ? '재대결 수락 대기 중' : '재대결'}</button>` : '';
  const leave = isSpectator ? `<button class="ghost" data-action="omok-spectate-leave" data-id="${room.id}" type="button">관전 나가기</button>` : isPlayer ? `<button class="ghost" data-action="omok-leave" data-id="${room.id}" type="button">${room.status === 'playing' ? '기권하고 나가기' : '나가기'}</button>` : `<button class="ghost" data-action="omok-back" type="button">로비로</button>`;
  const playArea = room.status === 'waiting' ? `<div class="omok-wait"><strong>${esc(room.host?.displayName || '')}</strong><p>상대를 기다리는 중입니다.</p></div>` : room.status === 'playing' && room.phase !== 'turn' ? `<div class="omok-status-line"><span>게임 준비 <b>${room.phase === 'rps' ? '가위바위보' : '돌 선택'}</b></span><span>남은 시간 <b id="omok-countdown">10초</b></span><span>관전자 ${room.spectatorCount}명</span></div>${pregame}` : `<div class="omok-status-line"><span>현재 차례 <b>${esc(turnName || '-')}</b></span><span>남은 시간 <b id="omok-countdown">${room.status === 'playing' ? '30초' : '-'}</b></span><span>관전자 ${room.spectatorCount}명</span></div><div class="omok-board-stage"><div class="omok-board" role="grid">${board}</div>${spectatorBurstLayer(room.reactions || [], 'omok')}</div>`;
  return `${sectionHeading('오목게임', `${room.roomNumber}번방 · ${omokStatusLabel(room.status)}`, '<button class="text-button" data-action="omok-back" type="button">로비 보기</button>')}<div class="omok-game-head"><div><span class="omok-stone black small"></span><strong>${esc(room.black?.displayName || '흑 미정')}</strong></div><div class="omok-pot"><small>판돈</small><b>${points(room.stakePoints)}</b></div><div><span class="omok-stone white small"></span><strong>${esc(room.white?.displayName || '백 미정')}</strong></div></div>${playArea}<div class="button-row">${rematch}${leave}</div>${isSpectator ? `${spectatorReactionBar('omok', room.id, room.reactions || [], true)}<p class="helper">관전자는 착수·판돈 변경·재대결 등 게임 입력을 할 수 없습니다.</p>` : isPlayer ? spectatorReactionBar('omok', room.id, room.reactions || [], true) : ''}${commonBattleResultOverlay('omok', room, { totalPot: Number(room.stakePoints || 0) * 2 })}`;
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


const SINGLE_TETRIS_WIDTH = 10;
const SINGLE_TETRIS_HEIGHT = 20;
const SINGLE_TETRIS_GRAVITY_MS = BLOCK_BATTLE_GRAVITY_MS;
const SINGLE_TETRIS_SCORE = Object.freeze({ 1: 1, 2: 3, 3: 5, 4: 8 });
const SINGLE_TETRIS_STORAGE_KEY = 'lego_single_tetris_state_v2';

function singleTetrisEmptyBoard() {
  return Array.from({ length: SINGLE_TETRIS_HEIGHT }, () => Array(SINGLE_TETRIS_WIDTH).fill(null));
}

function singleTetrisShuffleBag() {
  const bag = Object.keys(LOCAL_TETROMINO_SHAPES);
  for (let index = bag.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [bag[index], bag[swap]] = [bag[swap], bag[index]];
  }
  return bag;
}

function singleTetrisFillQueue(state) {
  while (state.queue.length < 14) state.queue.push(...singleTetrisShuffleBag());
}

function singleTetrisSpawn(state) {
  singleTetrisFillQueue(state);
  const type = state.queue.shift();
  state.active = { type, rotation: 0, row: 0, col: 3 };
  singleTetrisFillQueue(state);
  return !singleTetrisCollision(state, state.active);
}

function singleTetrisCollision(state, piece) {
  // 싱글과 대전이 같은 10×20 충돌 판정을 공유해 조작 감각/벽 판정이 갈라지지 않게 한다.
  return blockBattleLocalCollision(state, piece);
}

function createSingleTetrisState(challenge) {
  const state = {
    challengeId: challenge.id,
    expiresAt: challenge.expiresAt,
    board: singleTetrisEmptyBoard(), queue: [], active: null,
    score: 0, lines: 0, lineClearCounts: { 1: 0, 2: 0, 3: 0, 4: 0 },
    ended: false, ending: false, result: null, endReason: null
  };
  singleTetrisSpawn(state);
  return state;
}

function saveSingleTetrisState() {
  const state = app.singleTetrisState;
  try {
    if (!state || state.ended) localStorage.removeItem(SINGLE_TETRIS_STORAGE_KEY);
    else localStorage.setItem(SINGLE_TETRIS_STORAGE_KEY, JSON.stringify(state));
  } catch { /* storage unavailable */ }
}

function restoreSingleTetrisState(challenge) {
  try {
    const raw = JSON.parse(localStorage.getItem(SINGLE_TETRIS_STORAGE_KEY) || 'null');
    if (raw?.challengeId !== challenge.id || !Array.isArray(raw.board) || raw.board.length !== 20 || !Array.isArray(raw.queue)) return null;
    raw.expiresAt = challenge.expiresAt;
    // v6.10.4: 싱글도 대전과 동일하게 새 블록은 0행에서 즉시 보인다.
    // 과거/비정상 저장값이 음수 행을 들고 있어도 화면 밖에서 늦게 등장하지 않도록 방어한다.
    if (raw.active && Number(raw.active.row) < 0) raw.active.row = 0;
    raw.ended = false; raw.ending = false; raw.result = null;
    raw.lineClearCounts = { 1: Number(raw.lineClearCounts?.[1] || 0), 2: Number(raw.lineClearCounts?.[2] || 0), 3: Number(raw.lineClearCounts?.[3] || 0), 4: Number(raw.lineClearCounts?.[4] || 0) };
    return raw;
  } catch { return null; }
}

function singleTetrisTimeLeftMs() {
  const state = app.singleTetrisState;
  const end = new Date(state?.expiresAt || '').getTime();
  // PC/휴대폰 벽시계가 서버보다 빠르거나 느려도 화면 타이머와 서버 판정이 어긋나지 않게
  // bootstrap 수신 시각을 기준으로 한 서버 정렬 시계를 사용한다.
  return Number.isFinite(end) ? Math.max(0, end - serverAlignedNow(app.data?.serverTime)) : 0;
}

function singleTetrisTimeText(ms = singleTetrisTimeLeftMs()) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function singleTetrisNextHtml(type) {
  const occupied = new Set((LOCAL_TETROMINO_SHAPES[type]?.[0] || []).map(([x,y]) => `${x}:${y}`));
  return `<div class="single-tetris-next-grid" aria-label="NEXT ${esc(type || '')}">${Array.from({ length: 16 }, (_, index) => { const x=index%4,y=Math.floor(index/4); return `<span class="${occupied.has(`${x}:${y}`) ? `piece-${esc(type)}` : ''}"></span>`; }).join('')}</div>`;
}

function singleTetrisBoardHtml(state) {
  const board = state.board.map((row) => [...row]);
  const active = state.active;
  const shape = active && LOCAL_TETROMINO_SHAPES[active.type]?.[Number(active.rotation) || 0];
  if (shape) for (const [x,y] of shape) { const row=Number(active.row)+y,col=Number(active.col)+x; if (row>=0&&row<20&&col>=0&&col<10) board[row][col]=active.type; }
  return `<div id="single-tetris-board" class="block-battle-board single-tetris-board" role="grid" aria-label="싱글 테트리스 10열 20행">${board.flatMap((row) => row.map((cell) => `<span class="block-battle-cell${cell ? ` piece-${esc(cell)}` : ''}"></span>`)).join('')}</div>`;
}

function singleTetrisResultOverlay(state) {
  const result = state?.result;
  if (!state?.ended || !result) return '';
  return `<div class="single-tetris-result-overlay" role="dialog" aria-modal="true" aria-labelledby="single-result-title"><div class="common-game-result-card single-result-card"><h2 id="single-result-title">🧱 테트리스 종료</h2><div class="single-result-grid"><div><span>최종 점수</span><strong>${Number(result.score || 0)}점</strong></div><div><span>제거한 줄</span><strong>${Number(result.lines || 0)}줄</strong></div><div><span>획득 포인트</span><strong>+${Number(result.reward || 0).toLocaleString('ko-KR')}P</strong></div><div><span>최고 기록</span><strong>${Number(result.bestScore || 0)}점</strong></div></div><div class="button-row"><button class="primary" data-action="single-tetris-restart" type="button">다시하기</button><button class="ghost" data-action="single-tetris-exit" type="button">나가기</button></div></div></div>`;
}

function singleTetrisGameHtml(challenge) {
  let state = app.singleTetrisState;
  if (!state || state.challengeId !== challenge.id) {
    state = restoreSingleTetrisState(challenge) || createSingleTetrisState(challenge);
    app.singleTetrisState = state;
    saveSingleTetrisState();
  }
  return `<div class="single-tetris-game"><div class="mini-abandon-controls single-tetris-abandon-controls"><button class="ghost mini-abandon-button" data-action="single-tetris-abandon" type="button" ${state.ending || state.ended ? 'disabled' : ''}>포기하기</button></div><div class="single-tetris-hud"><div><small>남은 시간</small><strong id="single-tetris-time">${singleTetrisTimeText()}</strong></div><div><small>점수</small><strong id="single-tetris-score">${state.score}점</strong></div><div><small>제거</small><strong id="single-tetris-lines">${state.lines}줄</strong></div><div class="single-next"><small>NEXT</small><div id="single-tetris-next" data-next-type="${esc(state.queue[0] || '')}">${singleTetrisNextHtml(state.queue[0])}</div></div></div><p class="helper single-tetris-rule">2분 · 속도 고정 · 1/2/3/4줄 = 1/3/5/8점 · 1점=1P · 일시정지 없음</p><div class="single-tetris-stage">${singleTetrisBoardHtml(state)}</div><div class="block-battle-controls single-tetris-controls" aria-label="싱글 테트리스 조작"><button data-action="single-tetris-control" data-value="left" type="button">←<small>왼쪽</small></button><button data-action="single-tetris-control" data-value="rotate" type="button">↻<small>회전</small></button><button data-action="single-tetris-control" data-value="right" type="button">→<small>오른쪽</small></button><button data-action="single-tetris-control" data-value="softDrop" type="button">↓<small>내리기</small></button><button class="hard-drop" data-action="single-tetris-control" data-value="hardDrop" type="button">⇩<small>바로 내리기</small></button></div><p class="helper centered single-tetris-keyboard-help">키보드: ← → 이동 · ↑ 회전 · ↓ 내리기 · Space 바로 내리기</p>${singleTetrisResultOverlay(state)}</div>`;
}

function paintSingleTetris() {
  const state = app.singleTetrisState;
  const board = $('#single-tetris-board');
  if (!state || !board || board.children.length !== 200) return;
  const activeCells = new Map();
  const shape = state.active && LOCAL_TETROMINO_SHAPES[state.active.type]?.[Number(state.active.rotation) || 0];
  if (shape) for (const [x,y] of shape) { const row=Number(state.active.row)+y,col=Number(state.active.col)+x; if(row>=0&&row<20&&col>=0&&col<10) activeCells.set(row*10+col,state.active.type); }
  // PC에서도 낙하 때 200셀 className을 매번 전부 갈아끼우지 않고 실제로 바뀐 셀만 갱신한다.
  // Chromium/Windows의 반복 style invalidation으로 생기는 한 프레임 반짝임을 줄인다.
  const cache = board.__singleTetrisPaintCache || (board.__singleTetrisPaintCache = Array.from(board.children, (cell) => cell.className));
  for (let index=0; index<200; index+=1) {
    const row=Math.floor(index/10), col=index%10;
    const type=activeCells.get(index) || state.board[row][col] || null;
    const className=`block-battle-cell${type ? ` piece-${type}` : ''}`;
    if (cache[index] !== className) {
      board.children[index].className=className;
      cache[index]=className;
    }
  }
  const score=$('#single-tetris-score'); if(score && score.textContent!==`${state.score}점`) score.textContent=`${state.score}점`;
  const lines=$('#single-tetris-lines'); if(lines && lines.textContent!==`${state.lines}줄`) lines.textContent=`${state.lines}줄`;
  const time=$('#single-tetris-time'); const timeText=singleTetrisTimeText(); if(time && time.textContent!==timeText) time.textContent=timeText;
  const next=$('#single-tetris-next'); const nextType=String(state.queue[0]||''); if(next && next.dataset.nextType!==nextType){ next.dataset.nextType=nextType; next.innerHTML=singleTetrisNextHtml(nextType); }
  saveSingleTetrisState();
}

function singleTetrisClearLines(state) {
  const kept = state.board.filter((row) => row.some((cell) => !cell));
  const cleared = SINGLE_TETRIS_HEIGHT - kept.length;
  while (kept.length < SINGLE_TETRIS_HEIGHT) kept.unshift(Array(SINGLE_TETRIS_WIDTH).fill(null));
  state.board = kept;
  if (cleared > 0) {
    const bounded = Math.min(4, cleared);
    state.lines += cleared;
    state.score += SINGLE_TETRIS_SCORE[bounded] || 0;
    state.lineClearCounts[bounded] = Number(state.lineClearCounts[bounded] || 0) + 1;
  }
}

function singleTetrisLock(state) {
  const active=state.active, shape=active && LOCAL_TETROMINO_SHAPES[active.type]?.[Number(active.rotation)||0];
  if (!active || !shape) return false;
  let aboveTop=false;
  for (const [x,y] of shape) {
    const row=Number(active.row)+y,col=Number(active.col)+x;
    if (row < 0) { aboveTop=true; continue; }
    if(row<SINGLE_TETRIS_HEIGHT&&col>=0&&col<SINGLE_TETRIS_WIDTH) state.board[row][col]=active.type;
  }
  if (aboveTop) { finishSingleTetris('gameover'); return false; }
  singleTetrisClearLines(state);
  if (!singleTetrisSpawn(state)) { finishSingleTetris('gameover'); return false; }
  return true;
}

function singleTetrisApply(action) {
  const state=app.singleTetrisState;
  if (!state || state.ended || state.ending || singleTetrisTimeLeftMs() <= 0) { if(state && !state.ended && !state.ending) finishSingleTetris('timeout'); return false; }
  if (!state.active) return false;
  if (action === 'left' || action === 'right') {
    const candidate={...state.active,col:state.active.col+(action==='left'?-1:1)};
    if(!singleTetrisCollision(state,candidate)) state.active=candidate; else return false;
  } else if (action === 'rotate') {
    const base=(Number(state.active.rotation)||0); let rotated=null;
    for (const kick of [0,-1,1,-2,2]) { const c={...state.active,rotation:(base+1)%4,col:state.active.col+kick}; if(!singleTetrisCollision(state,c)){rotated=c;break;} }
    if(!rotated) return false; state.active=rotated;
  } else if (action === 'softDrop' || action === 'tick') {
    const candidate={...state.active,row:state.active.row+1};
    if(!singleTetrisCollision(state,candidate)) state.active=candidate; else singleTetrisLock(state);
  } else if (action === 'hardDrop') {
    let candidate={...state.active};
    while(!singleTetrisCollision(state,{...candidate,row:candidate.row+1})) candidate.row+=1;
    state.active=candidate; singleTetrisLock(state);
  } else return false;
  paintSingleTetris();
  return true;
}

function stopSingleTetrisTimers() {
  clearTimeout(app.singleTetrisGravityTimer); app.singleTetrisGravityTimer=null;
  clearInterval(app.singleTetrisClockTimer); app.singleTetrisClockTimer=null;
  clearTimeout(app.singleTetrisHoldDelay); clearInterval(app.singleTetrisHoldTimer); app.singleTetrisHoldDelay=null; app.singleTetrisHoldTimer=null; app.singleTetrisHold=null;
}

function startSingleTetrisTimers() {
  stopSingleTetrisTimers();
  const tickGravity=()=>{ const state=app.singleTetrisState; if(!state||state.ended||state.ending) return; if(singleTetrisTimeLeftMs()<=0){finishSingleTetris('timeout');return;} singleTetrisApply('tick'); if(!state.ended&&!state.ending) app.singleTetrisGravityTimer=setTimeout(tickGravity,SINGLE_TETRIS_GRAVITY_MS); };
  app.singleTetrisGravityTimer=setTimeout(tickGravity,SINGLE_TETRIS_GRAVITY_MS);
  app.singleTetrisClockTimer=setInterval(()=>{ const state=app.singleTetrisState; if(!state||state.ended||state.ending) return; const time=$('#single-tetris-time'); if(time) time.textContent=singleTetrisTimeText(); if(singleTetrisTimeLeftMs()<=0) finishSingleTetris('timeout'); },250);
}

async function finishSingleTetris(reason) {
  const state=app.singleTetrisState;
  if(!state || state.ended || state.ending) return;
  state.ending=true; state.endReason=reason; stopSingleTetrisTimers(); saveSingleTetrisState();
  try {
    const result=await api('/api/minigames/finish',{method:'POST',body:JSON.stringify({challengeId:state.challengeId,endReason:reason,lineClearCounts:state.lineClearCounts})});
    if(result.bootstrap) applyBootstrap(result.bootstrap);
    if(result.ok===false) throw new Error(result.message||'싱글 테트리스 정산 실패');
    state.ending=false; state.ended=true; state.result={score:Number(result.score??state.score),lines:Number(result.lines??state.lines),reward:Number(result.reward??state.score),bestScore:Number(result.bestScore??Math.max(state.score,app.data?.dashboard?.pet?.records?.singleTetrisBestScore||0))};
    try { localStorage.removeItem(SINGLE_TETRIS_STORAGE_KEY); } catch {}
    const game=$('.single-tetris-game'); if(game){ const old=game.querySelector('.single-tetris-result-overlay'); old?.remove(); game.insertAdjacentHTML('beforeend',singleTetrisResultOverlay(state)); }
    requestAnimationFrame(syncGameResultScrollLock);
  } catch(error) {
    const message = String(error?.message || '싱글 테트리스 정산 실패');
    const earlyTimeout = reason === 'timeout' && message.includes('아직 싱글 테트리스 제한시간이 남아 있습니다.');
    if (earlyTimeout) {
      // 드물게 탭 복귀/절전 직후 오래된 bootstrap 시각으로 먼저 0초가 계산된 경우에는
      // 오류 토스트와 10초짜리 정지 상태를 만들지 않고 서버 시각만 다시 맞춘 뒤 정상 타이머로 복귀한다.
      state.ending = false;
      try { await loadBootstrap({ silent: true }); } catch { /* 다음 짧은 재시도에서 다시 동기화 */ }
      if (app.singleTetrisState !== state || state.ended) return;
      const remaining = singleTetrisTimeLeftMs();
      const time = $('#single-tetris-time');
      if (time) time.textContent = singleTetrisTimeText(remaining);
      if (remaining > 0) {
        saveSingleTetrisState();
        startSingleTetrisTimers();
        return;
      }
      clearTimeout(app.singleTetrisFinishRetryTimer);
      app.singleTetrisFinishRetryTimer = setTimeout(() => {
        if (app.singleTetrisState === state && !state.ended) finishSingleTetris(reason);
      }, 250);
      return;
    }
    // 실제 통신 오류에서는 종료된 판을 고정해 중복 점수 변경을 막고 제한적으로 재시도한다.
    state.ending=true; toast(message,'error');
    clearTimeout(app.singleTetrisFinishRetryTimer);
    app.singleTetrisFinishRetryTimer=setTimeout(()=>{ if(app.singleTetrisState===state && !state.ended){ state.ending=false; finishSingleTetris(reason); } },1500);
  }
}

async function abandonSingleTetris() {
  const state=app.singleTetrisState;
  if(!state || state.ended || state.ending) return;
  if(!confirm('게임을 포기하시겠습니까?\n포기하면 점수·랭킹·포인트는 기록되지 않고 사용한 개인게임 횟수는 복구되지 않습니다.')) return;
  state.ending=true; stopSingleTetrisTimers();
  try {
    const result=await api('/api/minigames/stop',{method:'POST',body:JSON.stringify({challengeId:state.challengeId})});
    if(result.bootstrap) applyBootstrap(result.bootstrap);
    if(!result.ok) throw new Error(result.message||'포기 처리에 실패했습니다.');
    try { localStorage.removeItem(SINGLE_TETRIS_STORAGE_KEY); } catch {}
    app.singleTetrisState=null; closeModal(); await loadBootstrap({silent:true}); toast('싱글 테트리스를 포기했습니다.','success',1800);
  } catch(error){ state.ending=false; startSingleTetrisTimers(); toast(error.message,'error'); }
}

function startSingleTetrisHold(action,{sourceType='pointer',sourceId=null,repeatDelay=BLOCK_BATTLE_POINTER_REPEAT_DELAY_MS}={}) {
  stopSingleTetrisHold();
  singleTetrisApply(action);
  if(!BLOCK_BATTLE_REPEATABLE_ACTIONS.has(action)) return;
  app.singleTetrisHold={sourceType,sourceId,action};
  app.singleTetrisHoldDelay=setTimeout(()=>{ if(!app.singleTetrisHold) return; app.singleTetrisHoldTimer=setInterval(()=>singleTetrisApply(action),BLOCK_BATTLE_REPEAT_INTERVAL_MS); },repeatDelay);
}

function stopSingleTetrisHold(sourceType=null,sourceId=null) {
  if(sourceType && app.singleTetrisHold && (app.singleTetrisHold.sourceType!==sourceType || (sourceId!=null&&app.singleTetrisHold.sourceId!==sourceId))) return;
  clearTimeout(app.singleTetrisHoldDelay); clearInterval(app.singleTetrisHoldTimer); app.singleTetrisHoldDelay=null; app.singleTetrisHoldTimer=null; app.singleTetrisHold=null;
}


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
  const rooms = (battle?.rooms ?? []).filter((room) => room.status !== 'ended');
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
  return `${sectionHeading('테트리스대전', battleUsageText(), `<button class="primary" data-action="block-battle-create" type="button" ${canCreate ? '' : 'disabled'}>방 만들기</button>`)}<div class="block-battle-lobby-list">${cards}</div>`;
}

function blockBattleVisualSelf(room = currentBlockBattleRoom(), { force = false } = {}) {
  if (!room || room.viewerRole !== 'player' || !room.selfPetId) {
    app.blockBattleVisualSelf = null;
    return null;
  }
  const serverPlayer = room.players?.[room.selfPetId];
  if (!serverPlayer) return null;
  const key = `${room.id}:${room.matchId}:${room.selfPetId}`;
  app.blockBattleVisualSelf = reconcileBlockBattleVisual(app.blockBattleVisualSelf, serverPlayer, key, {
    force,
    lockPending: blockBattleAwaitingLock()
  });
  return app.blockBattleVisualSelf?.player ?? null;
}

function blockBattleSelfForRender(room, fallback = null) {
  return room?.viewerRole === 'player' ? (blockBattleVisualSelf(room) || fallback) : fallback;
}

function blockBattleCompositeBoard(player) {
  // 싱글 테트리스와 같은 방식으로 고정 board와 현재 낙하 블록을 하나의 10×20 화면으로 합친다.
  // 1:1 전용 absolute/GPU active 레이어를 없애 Windows Chromium에서 낙하 블록 레이어가
  // 재합성되는 순간 사라졌다 나타나는 현상을 피한다. 실제 서버 board 데이터는 수정하지 않는다.
  const board = Array.from({ length: 20 }, (_, rowIndex) =>
    Array.from({ length: 10 }, (_, colIndex) => player.board?.[rowIndex]?.[colIndex] ?? null));
  const active = player?.active;
  const rotation = Number(active?.rotation) || 0;
  const shape = active && LOCAL_TETROMINO_SHAPES[active.type]?.[rotation];
  const baseRow = Number(active?.row);
  const baseCol = Number(active?.col);
  if (!shape || !Number.isFinite(baseRow) || !Number.isFinite(baseCol)) return board;
  for (const [x, y] of shape) {
    const row = baseRow + y;
    const col = baseCol + x;
    if (row >= 0 && row < 20 && col >= 0 && col < 10) board[row][col] = active.type;
  }
  return board;
}

function blockBattleBoardHtml(player, { compact = false } = {}) {
  if (!player) return '';
  const board = blockBattleCompositeBoard(player);
  return `<div class="block-battle-board ${compact ? 'compact' : ''}" data-block-player="${esc(player.petId)}" role="grid" aria-label="${esc(player.displayName)}의 10열 20행 테트리스 판">${board.flatMap((row, rowIndex) => row.map((cell, colIndex) => `<span class="block-battle-cell${cell ? ` piece-${esc(cell)}` : ''}" data-row="${rowIndex}" data-col="${colIndex}"></span>`)).join('')}</div>`;
}

function blockBattleNextPreviewHtml(player) {
  const type = player?.next?.[0];
  return `<div class="block-battle-next" data-block-next data-next-type="${esc(type || '')}"><small>NEXT</small>${singleTetrisNextHtml(type)}</div>`;
}

function blockBattlePlayerPanel(player, { mine = false, compact = false } = {}) {
  if (!player) return '<div class="empty">플레이어 정보 없음</div>';
  const connection = player.connected ? '' : `<span class="tag warning">재접속 대기</span>`;
  const headMeta = mine ? `${blockBattleNextPreviewHtml(player)}${connection}` : connection;
  return `<article class="block-battle-player ${mine ? 'mine' : ''} ${compact ? 'compact' : ''}" data-block-panel="${esc(player.petId)}"><header><div><strong>${esc(player.displayName)}</strong>${mine ? '<small>내 게임판</small>' : ''}</div><div class="block-battle-player-head-meta">${headMeta}</div></header>${blockBattleBoardHtml(player, { compact })}<div class="block-battle-stats"><span>제거 <b data-block-stat="lines">${Number(player.lines || 0)}줄</b></span><span>공격 <b data-block-stat="attackSent">${Number(player.attackSent || 0)}줄</b></span><span>대기 방해 <b data-block-stat="pendingGarbage">${Number(player.pendingGarbage || 0)}줄</b></span></div></article>`;
}

function blockBattleRoomView(room) {
  const isPlayer = room.viewerRole === 'player';
  const isSpectator = room.viewerRole === 'spectator';
  const serverSelf = isPlayer ? room.players?.[room.selfPetId] : room.players?.[room.host?.petId];
  const self = isPlayer ? blockBattleSelfForRender(room, serverSelf) : serverSelf;
  const opponent = isPlayer ? room.players?.[room.opponentPetId] : room.players?.[room.guest?.petId];
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
    : `<div class="block-battle-stage" data-block-room-key="${esc(`${room.id}:${room.matchId}`)}"><div class="block-battle-burst-slot" data-block-burst-slot>${spectatorBurstLayer(room.reactions || [], 'blockBattle')}</div><div class="block-battle-attack-slot" data-block-attack-slot>${attackNotice}</div><div class="block-battle-versus">${blockBattlePlayerPanel(self, { mine: isPlayer })}<div class="block-battle-vs"><b>VS</b><span data-block-speed>속도 고정</span><span data-block-spectators>관전자 ${Number(room.spectatorCount || 0)}명</span></div>${blockBattlePlayerPanel(opponent, { compact: true })}</div></div>`;
  return `${sectionHeading('테트리스대전', `${room.roomNumber}번방 · 판돈 ${points(room.stakePoints)} · ${blockBattleStatusLabel(room.status)}`, '<button class="text-button" data-action="block-battle-back" type="button">로비 보기</button>')}${reconnecting}${boards}${controls}<div class="button-row">${rematch}${leave}</div>${isSpectator ? `${spectatorReactionBar('block-battle', room.id, room.reactions || [], true)}<p class="helper">관전자는 블록 조작·판돈·재대결에 참여할 수 없습니다.</p>` : isPlayer ? spectatorReactionBar('block-battle', room.id, room.reactions || [], true, true) : ''}${commonBattleResultOverlay('blockBattle', room, { totalPot: Number(room.stakePoints || 0) * 2 })}`;
}

function blockBattleSection() {
  const room = currentBlockBattleRoom();
  return room ? blockBattleRoomView(room) : blockBattleLobby();
}

function legodokuStatusLabel(status) {
  return ({ waiting: '대기중', playing: '게임중', ended: '종료' })[status] || status;
}

function legodokuServerNow() {
  const base = Number(app.data?.legodoku?.serverTime || app.data?.serverTime || Date.now());
  return base + (monotonicNow() - app.legodokuServerSyncedAt);
}

function currentLegodokuRoom() {
  if (app.legodokuLobbyForced) return null;
  const rooms = app.data?.legodoku?.rooms ?? [];
  let room = rooms.find((item) => item.id === app.legodokuRoomId);
  if (!room) room = rooms.find((item) => item.viewerRole === 'player' || item.viewerRole === 'spectator');
  if (room) app.legodokuRoomId = room.id;
  return room ?? null;
}

function legodokuMarksStorageKey(room) {
  if (!room?.id || !room?.matchId || room.viewerRole !== 'player' || !room.selfPetId) return '';
  return `lego_legodoku_marks:${room.id}:${room.matchId}:${room.selfPetId}`;
}

function syncLegodokuMarks(room = currentLegodokuRoom()) {
  const key = legodokuMarksStorageKey(room);
  if (key !== app.legodokuMarksKey) {
    app.legodokuMarksKey = key;
    app.legodokuMarks = new Set();
    if (key) {
      try {
        const raw = JSON.parse(localStorage.getItem(key) || '[]');
        for (const value of Array.isArray(raw) ? raw : []) {
          const index = Number(value);
          if (Number.isInteger(index) && index >= 0 && index < 64) app.legodokuMarks.add(index);
        }
      } catch { /* storage unavailable */ }
    }
  }
  const self = room?.players?.[room?.selfPetId];
  for (const index of self?.confirmed ?? []) app.legodokuMarks.delete(Number(index));
  return app.legodokuMarks;
}

function persistLegodokuMarks() {
  if (!app.legodokuMarksKey) return;
  try { localStorage.setItem(app.legodokuMarksKey, JSON.stringify([...app.legodokuMarks].sort((a, b) => a - b))); } catch { /* storage unavailable */ }
}

function legodokuSetMark(indexValue, mode, { persist = false } = {}) {
  const index = Number(indexValue);
  const room = currentLegodokuRoom();
  const self = room?.players?.[room?.selfPetId];
  if (!Number.isInteger(index) || index < 0 || index >= 64 || !room || room.viewerRole !== 'player' || room.status !== 'playing') return false;
  if ((self?.confirmed ?? []).includes(index)) return false;
  syncLegodokuMarks(room);
  if (mode === 'erase') app.legodokuMarks.delete(index);
  else app.legodokuMarks.add(index);
  const cell = document.querySelector(`.legodoku-cell[data-index="${index}"]`);
  if (cell) {
    const marked = app.legodokuMarks.has(index);
    cell.classList.toggle('marked', marked);
    const mark = cell.querySelector('[data-legodoku-mark]');
    if (mark) mark.textContent = marked ? '×' : '';
    cell.setAttribute('aria-label', `${Number(cell.dataset.row || 0) + 1}행 ${Number(cell.dataset.col || 0) + 1}열${marked ? ' · X 표시' : ''}`);
  }
  if (persist) persistLegodokuMarks();
  return true;
}

function legodokuLobby() {
  const game = app.data?.legodoku;
  const rooms = (game?.rooms ?? []).filter((room) => room.status !== 'ended');
  const byNumber = new Map(rooms.map((room) => [room.roomNumber, room]));
  const cards = Array.from({ length: game?.maxRooms || 3 }, (_, index) => {
    const room = byNumber.get(index + 1);
    if (!room) return `<article class="legodoku-lobby-card empty-room"><div><strong>${index + 1}번방</strong><small>비어있음</small></div></article>`;
    const versus = room.guest ? `${esc(room.host?.displayName || '-')} VS ${esc(room.guest?.displayName || '-')}` : esc(room.host?.displayName || '-');
    let action = '';
    if (room.viewerRole !== 'none') action = `<button class="soft-button" data-action="legodoku-open" data-id="${room.id}" type="button">열기</button>`;
    else if (room.status === 'waiting') action = `<button class="primary" data-action="legodoku-join" data-id="${room.id}" type="button">참가</button>`;
    else if (room.status === 'playing') action = `<button class="soft-button" data-action="legodoku-spectate" data-id="${room.id}" type="button">관전</button>`;
    else action = `<button class="ghost" data-action="legodoku-open" data-id="${room.id}" type="button">결과</button>`;
    return `<article class="legodoku-lobby-card"><div><strong>${room.roomNumber}번방 · ${versus}</strong><small>판돈 ${points(room.stakePoints)} · ${legodokuStatusLabel(room.status)}</small></div>${action}</article>`;
  }).join('');
  const canCreate = rooms.length < (game?.maxRooms || 3);
  return `${sectionHeading('레고도쿠', battleUsageText(), `<button class="primary" data-action="legodoku-create" type="button" ${canCreate ? '' : 'disabled'}>방 만들기</button>`)}<div class="legodoku-lobby-list">${cards}</div><p class="helper centered">8×8 · 행/열/색 영역마다 레고 1개 · 레고끼리 대각선으로 붙을 수 없습니다.</p>`;
}

function legodokuProgressHtml(player, { mine = false } = {}) {
  const found = Math.max(0, Math.min(8, Number(player?.foundCount || 0)));
  const mistakes = Math.max(0, Math.min(3, Number(player?.mistakes || 0)));
  return `<div class="legodoku-progress ${mine ? 'mine' : ''}" data-legodoku-pet-id="${esc(player?.petId || '')}"><div class="legodoku-progress-title"><strong>${esc(player?.displayName || '-')}</strong>${mine ? '<small>내 진행</small>' : ''}</div><div class="legodoku-progress-track"><i data-legodoku-progress-track style="width:${found * 12.5}%"></i></div><div class="legodoku-progress-values"><b data-legodoku-progress-found>${found}/8</b><span data-legodoku-progress-mistakes>실수 ${mistakes}/3</span></div></div>`;
}

function legodokuBoardHtml(room, { interactive = false, revealSolution = false } = {}) {
  const regions = Array.isArray(room?.puzzle?.regions) ? room.puzzle.regions : [];
  if (regions.length !== 64) return '<div class="empty">문제를 준비하고 있습니다.</div>';
  const self = room.viewerRole === 'player' ? room.players?.[room.selfPetId] : null;
  const confirmed = new Set((self?.confirmed ?? []).map(Number));
  const solution = new Set(revealSolution ? (room.puzzle?.solution ?? []).map(Number) : []);
  const marks = interactive ? syncLegodokuMarks(room) : new Set();
  const edgeClass = (index) => {
    const row = Math.floor(index / 8), col = index % 8, region = regions[index];
    const classes = [];
    if (row === 0 || regions[index - 8] !== region) classes.push('edge-top');
    if (row === 7 || regions[index + 8] !== region) classes.push('edge-bottom');
    if (col === 0 || regions[index - 1] !== region) classes.push('edge-left');
    if (col === 7 || regions[index + 1] !== region) classes.push('edge-right');
    return classes.join(' ');
  };
  return `<div class="legodoku-board${interactive ? ' interactive' : ''}" role="grid" aria-rowcount="8" aria-colcount="8" data-legodoku-board>${regions.map((region, index) => {
    const row = Math.floor(index / 8), col = index % 8;
    const hasHead = confirmed.has(index) || solution.has(index);
    const marked = !hasHead && marks.has(index);
    const classes = `legodoku-cell region-${Number(region) % 8} ${edgeClass(index)}${hasHead ? ' confirmed' : ''}${marked ? ' marked' : ''}`;
    const label = `${row + 1}행 ${col + 1}열${hasHead ? ' · 레고' : marked ? ' · X 표시' : ''}`;
    return `<button class="${classes}" data-action="legodoku-cell" data-index="${index}" data-row="${row}" data-col="${col}" type="button" ${interactive && !hasHead ? '' : 'disabled'} role="gridcell" aria-label="${label}">${hasHead ? '<img class="legodoku-head" src="/legodoku/bi-tteop-head.svg?v=6101231" alt="" draggable="false">' : ''}<span class="legodoku-x" data-legodoku-mark>${marked ? '×' : ''}</span></button>`;
  }).join('')}</div>`;
}

function legodokuRoomView(room) {
  const isPlayer = room.viewerRole === 'player';
  const isSpectator = room.viewerRole === 'spectator';
  const self = isPlayer ? room.players?.[room.selfPetId] : null;
  const opponent = isPlayer ? room.players?.[room.opponentPetId] : null;
  const hostPlayer = room.players?.[room.host?.petId];
  const guestPlayer = room.players?.[room.guest?.petId];
  const timer = room.status === 'playing' ? '<b id="legodoku-countdown">3:00</b>' : '<b>--:--</b>';
  let stage = '';
  if (room.status === 'waiting') {
    stage = `<div class="omok-wait"><strong>${esc(room.host?.displayName || '')}</strong><p>같은 레고도쿠 문제로 대결할 상대를 기다리는 중입니다.</p></div>`;
  } else if (room.status === 'ended') {
    const left = isPlayer ? self : hostPlayer;
    const right = isPlayer ? opponent : guestPlayer;
    stage = `<div class="legodoku-match-head">${legodokuProgressHtml(left, { mine: isPlayer })}<div class="legodoku-match-center"><span>게임 종료</span><b>${esc(room.puzzle?.difficulty || '중')} 난이도</b><small>관전자 ${Number(room.spectatorCount || 0)}명</small></div>${legodokuProgressHtml(right)}</div><div class="legodoku-board-stage"><div class="legodoku-solution-label">정답 공개</div>${legodokuBoardHtml(room, { revealSolution: true })}</div>`;
  } else if (isPlayer) {
    stage = `<div class="legodoku-match-head">${legodokuProgressHtml(self, { mine: true })}<div class="legodoku-match-center"><span>남은 시간</span>${timer}<small>관전자 ${Number(room.spectatorCount || 0)}명</small></div>${legodokuProgressHtml(opponent)}</div><div class="legodoku-input-guide" aria-label="레고도쿠 조작 방법"><span><b>레고 놓기</b> 한 번 탭</span><span><b>X 표시</b> 빈칸을 꾹 누른 채 드래그</span><span><b>X 지우기</b> X에서 꾹 누른 채 드래그</span></div><div class="legodoku-board-stage">${legodokuBoardHtml(room, { interactive: true })}<div class="legodoku-feedback-layer" aria-live="polite"></div>${spectatorBurstLayer(room.reactions || [], 'legodoku')}</div>`;
  } else if (isSpectator) {
    stage = `<div class="legodoku-match-head">${legodokuProgressHtml(hostPlayer)}<div class="legodoku-match-center"><span>남은 시간</span>${timer}<small>관전자 ${Number(room.spectatorCount || 0)}명</small></div>${legodokuProgressHtml(guestPlayer)}</div><div class="legodoku-spectator-private"><strong>🔒 경기 중 위치 비공개</strong><p>공정한 대전을 위해 양쪽 레고 위치는 종료 전까지 공개되지 않습니다.</p></div>${spectatorBurstLayer(room.reactions || [], 'legodoku')}`;
  } else {
    stage = `<div class="legodoku-match-head">${legodokuProgressHtml(hostPlayer)}<div class="legodoku-match-center"><span>남은 시간</span>${timer}<small>관전자 ${Number(room.spectatorCount || 0)}명</small></div>${legodokuProgressHtml(guestPlayer)}</div>`;
  }
  const rematch = isPlayer && room.status === 'ended' ? `<button class="primary" data-action="legodoku-rematch" data-id="${room.id}" type="button">${room.rematchRequestedByMe ? '재대결 수락 대기 중' : '재대결'}</button>` : '';
  const leave = isSpectator
    ? `<button class="ghost" data-action="legodoku-spectate-leave" data-id="${room.id}" type="button">관전 나가기</button>`
    : isPlayer ? `<button class="ghost" data-action="legodoku-leave" data-id="${room.id}" type="button">${room.status === 'playing' ? '기권하고 나가기' : '나가기'}</button>` : '<button class="ghost" data-action="legodoku-back" type="button">로비로</button>';
  const reaction = isSpectator ? `${spectatorReactionBar('legodoku', room.id, room.reactions || [], true)}<p class="helper">관전자는 진행도만 볼 수 있으며 게임 입력에는 참여할 수 없습니다.</p>` : isPlayer ? spectatorReactionBar('legodoku', room.id, room.reactions || [], true, true) : '';
  const info = room.status === 'waiting' ? '문제는 대전 시작 시 생성' : `난이도 ${esc(room.puzzle?.difficulty || '중')}`;
  const body = `${sectionHeading('레고도쿠', `${room.roomNumber}번방 · ${info} · 판돈 ${points(room.stakePoints)} · ${legodokuStatusLabel(room.status)}`, '<button class="text-button" data-action="legodoku-back" type="button">로비 보기</button>')}${stage}<div class="button-row">${rematch}${leave}</div>${reaction}${commonBattleResultOverlay('legodoku', room, { totalPot: Number(room.stakePoints || 0) * 2 })}`;
  return `<div class="legodoku-room-view" data-legodoku-room-id="${esc(room.id || '')}" data-legodoku-match-id="${esc(room.matchId || '')}" data-legodoku-status="${esc(room.status || '')}" data-legodoku-role="${esc(room.viewerRole || 'none')}">${body}</div>`;
}

function legodokuSection() {
  const room = currentLegodokuRoom();
  return room ? legodokuRoomView(room) : legodokuLobby();
}

function patchLegodokuMarksDom(room = currentLegodokuRoom()) {
  if (!room || room.viewerRole !== 'player') return false;
  const marks = syncLegodokuMarks(room);
  const confirmed = new Set((room.players?.[room.selfPetId]?.confirmed ?? []).map(Number));
  document.querySelectorAll('.legodoku-cell[data-index]').forEach((cell) => {
    const index = Number(cell.dataset.index);
    const hasHead = confirmed.has(index);
    if (hasHead) {
      marks.delete(index);
      cell.classList.add('confirmed');
      cell.classList.remove('marked');
      cell.disabled = true;
      const mark = cell.querySelector('[data-legodoku-mark]');
      if (mark) mark.textContent = '';
      if (!cell.querySelector('.legodoku-head')) cell.insertAdjacentHTML('afterbegin', '<img class="legodoku-head" src="/legodoku/bi-tteop-head.svg?v=6101231" alt="" draggable="false">');
      const row = Number(cell.dataset.row) + 1, col = Number(cell.dataset.col) + 1;
      cell.setAttribute('aria-label', `${row}행 ${col}열 · 레고`);
      return;
    }
    const marked = marks.has(index);
    cell.classList.toggle('marked', marked);
    const mark = cell.querySelector('[data-legodoku-mark]');
    if (mark) mark.textContent = marked ? '×' : '';
    const row = Number(cell.dataset.row) + 1, col = Number(cell.dataset.col) + 1;
    cell.setAttribute('aria-label', `${row}행 ${col}열${marked ? ' · X 표시' : ''}`);
  });
  persistLegodokuMarks();
  return true;
}

function patchLegodokuLiveRoom(room) {
  if (!room || room.status !== 'playing') return false;
  const root = document.querySelector('.legodoku-room-view');
  if (!root || root.dataset.legodokuRoomId !== String(room.id || '') || root.dataset.legodokuMatchId !== String(room.matchId || '') || root.dataset.legodokuStatus !== 'playing' || root.dataset.legodokuRole !== String(room.viewerRole || 'none')) return false;
  for (const player of Object.values(room.players || {})) {
    const panel = [...root.querySelectorAll('.legodoku-progress[data-legodoku-pet-id]')].find((node) => node.dataset.legodokuPetId === String(player?.petId || ''));
    if (!panel) continue;
    const found = Math.max(0, Math.min(8, Number(player?.foundCount || 0)));
    const mistakes = Math.max(0, Math.min(3, Number(player?.mistakes || 0)));
    const track = panel.querySelector('[data-legodoku-progress-track]');
    const foundNode = panel.querySelector('[data-legodoku-progress-found]');
    const mistakeNode = panel.querySelector('[data-legodoku-progress-mistakes]');
    if (track) track.style.width = `${found * 12.5}%`;
    if (foundNode) foundNode.textContent = `${found}/8`;
    if (mistakeNode) mistakeNode.textContent = `실수 ${mistakes}/3`;
  }
  if (room.viewerRole === 'player') patchLegodokuMarksDom(room);
  updateLegodokuCountdown(room);
  return true;
}

function renderLegodokuRegion() {
  const region = $('.legodoku-wrap');
  if (!region) { markTabDirty('games'); return false; }
  region.innerHTML = legodokuSection();
  const room = currentLegodokuRoom();
  if (room?.status === 'playing') updateLegodokuCountdown(room);
  syncSupportBanner();
  requestAnimationFrame(syncGameResultScrollLock);
  return true;
}

function updateLegodokuCountdown(room = currentLegodokuRoom()) {
  const countdown = $('#legodoku-countdown');
  if (!countdown || room?.status !== 'playing' || !room.deadlineAt) return false;
  const remaining = new Date(room.deadlineAt).getTime() - legodokuServerNow();
  const seconds = Math.max(0, Math.ceil(remaining / 1000));
  const text = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  if (countdown.textContent !== text) countdown.textContent = text;
  return true;
}

function applyLegodokuRoomState(payload) {
  const room = payload?.room;
  if (!room || !app.data?.legodoku) return false;
  const rooms = app.data.legodoku.rooms ??= [];
  const index = rooms.findIndex((item) => item.id === room.id);
  const previous = index >= 0 ? rooms[index] : null;
  const waitingViewerAutoExit = Boolean(previous?.status === 'waiting' && previous.viewerRole === 'none'
    && room.status === 'playing' && room.viewerRole === 'none' && app.legodokuRoomId === room.id);
  const sameStream = Boolean(previous && previous.status === room.status && (previous.matchId === room.matchId || room.viewerRole === 'spectator'));
  if (sameStream && Number(room.stateVersion || 0) < Number(previous?.stateVersion || 0)) return false;
  if (index >= 0) rooms[index] = room;
  else rooms.push(room);
  app.data.legodoku.serverTime = Number(payload.serverTime || room.serverTime || Date.now());
  app.legodokuServerSyncedAt = monotonicNow();
  if (previous?.matchId !== room.matchId) {
    app.legodokuCellQueue = [];
    app.legodokuMarksKey = '';
    app.legodokuMarks = new Set();
  }
  if (waitingViewerAutoExit) {
    resetLegodokuPointer();
    app.legodokuRoomId = null;
    app.legodokuLobbyForced = true;
    if (app.tab === 'games') renderLegodokuRegion(); else markTabDirty('games');
    return true;
  }
  app.legodokuLobbyForced = false;
  app.legodokuRoomId = room.id;
  if (room.status !== 'playing') resetLegodokuPointer();
  if (app.tab === 'games') {
    if (!patchLegodokuLiveRoom(room)) renderLegodokuRegion();
  } else markTabDirty('games');
  return true;
}

function flashLegodokuWrong(index) {
  const cell = document.querySelector(`.legodoku-cell[data-index="${Number(index)}"]`);
  const layer = $('.legodoku-feedback-layer');
  if (!cell || !layer) return;
  cell.classList.add('wrong');
  const layerRect = layer.getBoundingClientRect();
  const cellRect = cell.getBoundingClientRect();
  const note = document.createElement('div');
  note.className = 'legodoku-wrong-note';
  note.textContent = '여기 아닙니다';
  if (layerRect) {
    note.style.left = `${cellRect.left - layerRect.left + cellRect.width / 2}px`;
    note.style.top = `${cellRect.top - layerRect.top + cellRect.height / 2}px`;
  }
  layer.appendChild(note);
  setTimeout(() => { cell.classList.remove('wrong'); note.remove(); }, 850);
}

function queueLegodokuCell(indexValue) {
  const room = currentLegodokuRoom();
  const index = Number(indexValue);
  if (!room || room.viewerRole !== 'player' || room.status !== 'playing' || !room.matchId || !Number.isInteger(index) || index < 0 || index >= 64) return null;
  const self = room.players?.[room.selfPetId];
  if ((self?.confirmed ?? []).includes(index)) return null;
  const actionId = crypto.randomUUID?.() || `legodoku-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  app.legodokuCellQueue.push({ roomId: room.id, matchId: room.matchId, index, actionId });
  flushLegodokuCellQueue();
  return actionId;
}

async function flushLegodokuCellQueue() {
  if (app.legodokuActionInFlight) return;
  while (app.legodokuCellQueue.length) {
    const queued = app.legodokuCellQueue.shift();
    const room = currentLegodokuRoom();
    if (!room || room.viewerRole !== 'player' || room.status !== 'playing' || room.id !== queued.roomId || room.matchId !== queued.matchId) continue;
    if ((room.players?.[room.selfPetId]?.confirmed ?? []).includes(queued.index)) continue;
    app.legodokuActionInFlight = true;
    try {
      const result = await api(`/api/legodoku/rooms/${encodeURIComponent(queued.roomId)}/cell`, {
        method: 'POST', body: JSON.stringify({ matchId: queued.matchId, index: queued.index, actionId: queued.actionId })
      });
      const activeRoom = currentLegodokuRoom();
      if (activeRoom?.id === queued.roomId && activeRoom?.matchId === queued.matchId) {
        syncLegodokuMarks(activeRoom);
        if (result.correct === false) app.legodokuMarks.add(queued.index);
        else if (result.correct === true) app.legodokuMarks.delete(queued.index);
        persistLegodokuMarks();
      }
      if (result.room) applyLegodokuRoomState({ room: result.room, serverTime: result.serverTime });
      if (result.correct === false) requestAnimationFrame(() => flashLegodokuWrong(queued.index));
      if (!result.ok && result.message) toast(result.message, 'error');
      if (result.finished || result.terminal || result.stale) app.legodokuCellQueue = [];
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      app.legodokuActionInFlight = false;
    }
  }
}

function submitLegodokuCell(indexValue) {
  return queueLegodokuCell(indexValue);
}

function resetLegodokuPointer() {
  app.legodokuPointer = null;
}

function sichuanStatusLabel(status) {
  return ({ waiting: '대기중', playing: '게임중', ended: '종료' })[status] || status;
}

function sichuanServerNow() {
  const base = Number(app.data?.sichuan?.serverTime || app.data?.serverTime || Date.now());
  return base + (monotonicNow() - app.sichuanServerSyncedAt);
}

function currentSichuanRoom() {
  if (app.sichuanLobbyForced) return null;
  const rooms = app.data?.sichuan?.rooms ?? [];
  let room = rooms.find((item) => item.id === app.sichuanRoomId);
  if (!room) room = rooms.find((item) => item.viewerRole === 'player' || item.viewerRole === 'spectator');
  if (room) app.sichuanRoomId = room.id;
  return room ?? null;
}

function sichuanLobby() {
  const game = app.data?.sichuan;
  const rooms = (game?.rooms ?? []).filter((room) => room.status !== 'ended');
  const byNumber = new Map(rooms.map((room) => [room.roomNumber, room]));
  const cards = Array.from({ length: game?.maxRooms || 3 }, (_, index) => {
    const room = byNumber.get(index + 1);
    if (!room) return `<article class="sichuan-lobby-card empty-room"><div><strong>${index + 1}번방</strong><small>비어있음</small></div></article>`;
    const versus = room.guest ? `${esc(room.host?.displayName || '-')} VS ${esc(room.guest?.displayName || '-')}` : esc(room.host?.displayName || '-');
    let action = '';
    if (room.viewerRole !== 'none') action = `<button class="soft-button" data-action="sichuan-open" data-id="${room.id}" type="button">열기</button>`;
    else if (room.status === 'waiting') action = `<button class="primary" data-action="sichuan-join" data-id="${room.id}" type="button">참가</button>`;
    else if (room.status === 'playing') action = `<button class="soft-button" data-action="sichuan-spectate" data-id="${room.id}" type="button">관전</button>`;
    else action = `<button class="ghost" data-action="sichuan-open" data-id="${room.id}" type="button">결과</button>`;
    return `<article class="sichuan-lobby-card"><div><strong>${room.roomNumber}번방 · ${versus}</strong><small>판돈 ${points(room.stakePoints)} · ${sichuanStatusLabel(room.status)}</small></div>${action}</article>`;
  }).join('');
  const canCreate = rooms.length < (game?.maxRooms || 3);
  return `${sectionHeading('사천성대전', battleUsageText(), `<button class="primary" data-action="sichuan-create" type="button" ${canCreate ? '' : 'disabled'}>방 만들기</button>`)}<div class="sichuan-lobby-list">${cards}</div>`;
}

function sichuanTheme(room = currentSichuanRoom()) {
  const game = app.data?.sichuan ?? {};
  const themes = Array.isArray(game.themes) ? game.themes : [];
  const wanted = String(room?.themeKey || '');
  return themes.find((theme) => theme.key === wanted)
    ?? themes[0]
    ?? { key: 'life', label: '생활·먹거리', tiles: game.tiles ?? [] };
}

function sichuanTileMap(room = currentSichuanRoom()) {
  return new Map((sichuanTheme(room).tiles ?? []).map((tile) => [tile.id, tile]));
}

const sichuanPreloadedAssets = new Set();

function sichuanTileAssetSrc(tile) {
  if (!tile?.src) return '';
  return `${tile.src}${tile.src.includes('?') ? '&' : '?'}v=6101231`;
}

function preloadSichuanTiles() {
  if (typeof Image !== 'function') return;
  const game = app.data?.sichuan ?? {};
  const themes = Array.isArray(game.themes) && game.themes.length ? game.themes : [{ tiles: game.tiles ?? [] }];
  for (const theme of themes) for (const tile of theme.tiles ?? []) {
    const src = sichuanTileAssetSrc(tile);
    if (!src || sichuanPreloadedAssets.has(src)) continue;
    sichuanPreloadedAssets.add(src);
    const image = new Image();
    image.decoding = 'async';
    image.src = src;
  }
}

function sichuanPendingPairsFor(room = currentSichuanRoom()) {
  if (!room?.id || !room?.matchId) return [];
  return app.sichuanPendingPairs.filter((item) => item.roomId === room.id && item.matchId === room.matchId);
}

function resetSichuanInputQueue({ roomId = null, matchId = null } = {}) {
  const matches = (item) => (!roomId || item.roomId === roomId) && (!matchId || item.matchId === matchId);
  app.sichuanPairQueue = app.sichuanPairQueue.filter((item) => !matches(item));
  app.sichuanPendingPairs = app.sichuanPendingPairs.filter((item) => !matches(item));
  app.sichuanSelectedIndex = null;
  app.sichuanActionInFlight = app.sichuanPairSending;
}

function sichuanEffectiveBoard(player, room = currentSichuanRoom()) {
  const board = Array.from({ length: 80 }, (_, index) => player?.board?.[index] ?? null);
  if (!room || room.viewerRole !== 'player' || String(player?.petId || '') !== String(room.selfPetId || '')) return board;
  for (const pending of sichuanPendingPairsFor(room)) {
    if (Number.isInteger(pending.first)) board[pending.first] = null;
    if (Number.isInteger(pending.second)) board[pending.second] = null;
  }
  return board;
}

function sichuanEffectiveRemovedCount(player, room = currentSichuanRoom()) {
  const serverBoard = Array.from({ length: 80 }, (_, index) => player?.board?.[index] ?? null);
  let removed = Math.max(0, Math.min(80, Number(player?.removedCount || 0)));
  if (!room || room.viewerRole !== 'player' || String(player?.petId || '') !== String(room.selfPetId || '')) return removed;
  const pendingIndexes = new Set();
  for (const pending of sichuanPendingPairsFor(room)) {
    if (Number.isInteger(pending.first) && serverBoard[pending.first]) pendingIndexes.add(pending.first);
    if (Number.isInteger(pending.second) && serverBoard[pending.second]) pendingIndexes.add(pending.second);
  }
  return Math.min(80, removed + pendingIndexes.size);
}

// Browser-side precheck mirrors src/game/sichuan.js:canConnectSichuan exactly.
// This lets a valid pair disappear immediately without waiting for a network round trip.
function canConnectSichuanClient(board, firstValue, secondValue) {
  const first = Number(firstValue), second = Number(secondValue);
  if (!Number.isInteger(first) || !Number.isInteger(second) || first < 0 || first >= 80 || second < 0 || second >= 80 || first === second) return false;
  const tile = board?.[first];
  if (!tile || tile !== board?.[second]) return false;
  const rows = 8, cols = 10, height = rows + 2, width = cols + 2;
  const occupied = Array.from({ length: height }, () => Array(width).fill(false));
  const padded = (index) => ({ row: Math.floor(index / cols) + 1, col: (index % cols) + 1 });
  for (let index = 0; index < 80; index += 1) {
    if (!board[index]) continue;
    const point = padded(index);
    occupied[point.row][point.col] = true;
  }
  const start = padded(first), target = padded(second);
  occupied[start.row][start.col] = false;
  occupied[target.row][target.col] = false;
  const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const queue = [], best = new Map();
  for (let direction = 0; direction < directions.length; direction += 1) {
    const [dr, dc] = directions[direction];
    const row = start.row + dr, col = start.col + dc;
    if (row < 0 || row >= height || col < 0 || col >= width) continue;
    if (occupied[row][col] && (row !== target.row || col !== target.col)) continue;
    queue.push({ row, col, direction, turns: 0 });
    best.set(`${row}:${col}:${direction}`, 0);
  }
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    if (current.row === target.row && current.col === target.col) return true;
    for (let direction = 0; direction < directions.length; direction += 1) {
      const turns = current.turns + (direction === current.direction ? 0 : 1);
      if (turns > 2) continue;
      const [dr, dc] = directions[direction];
      const row = current.row + dr, col = current.col + dc;
      if (row < 0 || row >= height || col < 0 || col >= width) continue;
      if (occupied[row][col] && (row !== target.row || col !== target.col)) continue;
      const key = `${row}:${col}:${direction}`;
      if ((best.get(key) ?? 99) <= turns) continue;
      best.set(key, turns);
      queue.push({ row, col, direction, turns });
    }
  }
  return false;
}

function sichuanBoardHtml(player, { interactive = false, compact = false } = {}) {
  const tiles = sichuanTileMap();
  const board = sichuanEffectiveBoard(player);
  const petId = String(player?.petId || '');
  return `<div class="sichuan-board ${compact ? 'compact' : ''}" data-sichuan-pet-id="${esc(petId)}" role="grid" aria-rowcount="8" aria-colcount="10" aria-label="${esc(player?.displayName || '플레이어')} 사천성 판">${board.map((tileId, index) => {
    // Every slot owns a fixed 8x10 coordinate. The element itself is kept for the
    // entire match so a removed pair never forces the other 78 images to be rebuilt.
    const row = Math.floor(index / 10) + 1;
    const column = (index % 10) + 1;
    const position = `--sichuan-left:${(column - 1) * 10}%;--sichuan-top:${(row - 1) * 12.5}%`;
    const tile = tileId ? tiles.get(tileId) : null;
    const selected = !compact && Number(app.sichuanSelectedIndex) === index;
    const tileSrc = sichuanTileAssetSrc(tile);
    const classes = `sichuan-cell${tileId ? '' : ' sichuan-empty-cell'}${selected ? ' selected' : ''}`;
    const label = tileId ? `${tile?.label || tileId}${selected ? ' 선택됨' : ''}` : '빈 칸';
    const content = tileId ? `<img src="${esc(tileSrc)}" alt="" draggable="false" loading="eager" decoding="async"><span>${esc(tile?.label || '')}</span>` : '';
    return `<button class="${classes}" data-action="sichuan-tile" data-index="${index}" data-tile="${tileId ? esc(tileId) : ''}" data-sichuan-slot="${index}" type="button" ${tileId && interactive ? '' : 'disabled'} role="gridcell" aria-rowindex="${row}" aria-colindex="${column}" aria-label="${esc(label)}" ${tileId ? '' : 'aria-hidden="true" tabindex="-1"'} style="${position}">${content}</button>`;
  }).join('')}</div>`;
}

function sichuanProgressHtml(player, { mine = false } = {}) {
  const removed = sichuanEffectiveRemovedCount(player);
  const remaining = Math.max(0, 80 - removed);
  return `<div class="sichuan-progress ${mine ? 'mine' : ''}" data-sichuan-pet-id="${esc(player?.petId || '')}"><div><strong>${esc(player?.displayName || '-')}</strong>${mine ? '<small>내 진행</small>' : ''}</div><div class="sichuan-progress-track"><i style="width:${(removed / 80) * 100}%"></i></div><b data-sichuan-remaining>${remaining}개 남음</b></div>`;
}

function sichuanRoomView(room) {
  const isPlayer = room.viewerRole === 'player';
  const isSpectator = room.viewerRole === 'spectator';
  const self = isPlayer ? room.players?.[room.selfPetId] : null;
  const opponent = isPlayer ? room.players?.[room.opponentPetId] : null;
  const hostPlayer = room.players?.[room.host?.petId];
  const guestPlayer = room.players?.[room.guest?.petId];
  const interactive = Boolean(isPlayer && room.status === 'playing' && self);
  const timer = room.status === 'playing' ? '<b id="sichuan-countdown">--:--</b>' : '<b>--:--</b>';
  let stage = '';
  if (room.status === 'waiting') {
    stage = `<div class="omok-wait"><strong>${esc(room.host?.displayName || '')}</strong><p>같은 판으로 대결할 상대를 기다리는 중입니다.</p></div>`;
  } else if (isSpectator) {
    stage = `<div class="sichuan-spectator-stage"><article><header>${sichuanProgressHtml(hostPlayer)}</header>${sichuanBoardHtml(hostPlayer, { compact: true })}</article><div class="sichuan-vs-badge">VS</div><article><header>${sichuanProgressHtml(guestPlayer)}</header>${sichuanBoardHtml(guestPlayer, { compact: true })}</article>${spectatorBurstLayer(room.reactions || [], 'sichuan')}</div>`;
  } else if (isPlayer) {
    stage = `<div class="sichuan-match-head">${sichuanProgressHtml(self, { mine: true })}<div class="sichuan-match-center"><span>남은 시간</span>${timer}<small data-sichuan-spectator-count>관전자 ${Number(room.spectatorCount || 0)}명</small></div>${sichuanProgressHtml(opponent)}</div><div class="sichuan-board-stage">${sichuanBoardHtml(self, { interactive })}${spectatorBurstLayer(room.reactions || [], 'sichuan')}</div><p class="helper centered">같은 그림 두 개를 선택하세요. 최대 두 번 꺾어 연결할 수 있으며 판 바깥쪽 경로도 허용됩니다.</p>`;
  } else {
    stage = `<div class="sichuan-match-head">${sichuanProgressHtml(hostPlayer)}<div class="sichuan-match-center"><span>남은 시간</span>${timer}<small data-sichuan-spectator-count>관전자 ${Number(room.spectatorCount || 0)}명</small></div>${sichuanProgressHtml(guestPlayer)}</div>`;
  }
  const rematch = isPlayer && room.status === 'ended' ? `<button class="primary" data-action="sichuan-rematch" data-id="${room.id}" type="button">${room.rematchRequestedByMe ? '재대결 수락 대기 중' : '재대결'}</button>` : '';
  const leave = isSpectator
    ? `<button class="ghost" data-action="sichuan-spectate-leave" data-id="${room.id}" type="button">관전 나가기</button>`
    : isPlayer ? `<button class="ghost" data-action="sichuan-leave" data-id="${room.id}" type="button">${room.status === 'playing' ? '기권하고 나가기' : '나가기'}</button>` : '<button class="ghost" data-action="sichuan-back" type="button">로비로</button>';
  const reaction = isSpectator ? `${spectatorReactionBar('sichuan', room.id, room.reactions || [], true)}<p class="helper">관전자는 패 선택·판돈·재대결에 참여할 수 없습니다.</p>` : isPlayer ? spectatorReactionBar('sichuan', room.id, room.reactions || [], true, true) : '';
  const theme = sichuanTheme(room);
  const themeText = room.status === 'waiting' ? '테마는 시작 시 랜덤' : `테마 ${theme.label}`;
  const body = `${sectionHeading('사천성대전', `${room.roomNumber}번방 · ${themeText} · 판돈 ${points(room.stakePoints)} · ${sichuanStatusLabel(room.status)}`, '<button class="text-button" data-action="sichuan-back" type="button">로비 보기</button>')}${stage}<div class="button-row">${rematch}${leave}</div>${reaction}${commonBattleResultOverlay('sichuan', room, { totalPot: Number(room.stakePoints || 0) * 2 })}`;
  return `<div class="sichuan-room-view" data-sichuan-room-id="${esc(room.id || '')}" data-sichuan-match-id="${esc(room.matchId || '')}" data-sichuan-status="${esc(room.status || '')}" data-sichuan-role="${esc(room.viewerRole || 'none')}" data-sichuan-state-version="${Number(room.stateVersion || 0)}">${body}</div>`;
}

function sichuanSection() {
  const room = currentSichuanRoom();
  return room ? sichuanRoomView(room) : sichuanLobby();
}

function renderSichuanRegion() {
  const region = $('.sichuan-wrap');
  if (!region) { markTabDirty('games'); return false; }
  preloadSichuanTiles();
  region.innerHTML = sichuanSection();
  const room = currentSichuanRoom();
  if (room?.status === 'playing') updateSichuanCountdown(room);
  syncSupportBanner();
  requestAnimationFrame(syncGameResultScrollLock);
  return true;
}

function findSichuanNodeByPet(selector, petId) {
  const wanted = String(petId || '');
  return $$(selector).find((node) => String(node.dataset.sichuanPetId || '') === wanted) || null;
}

function patchSichuanProgress(player, { mine = false } = {}) {
  if (!player) return false;
  const node = findSichuanNodeByPet('.sichuan-progress', player.petId);
  if (!node) return false;
  node.classList.toggle('mine', Boolean(mine));
  const removed = sichuanEffectiveRemovedCount(player);
  const track = node.querySelector('.sichuan-progress-track i');
  if (track) track.style.width = `${(removed / 80) * 100}%`;
  const remaining = node.querySelector('[data-sichuan-remaining]');
  if (remaining) remaining.textContent = `${Math.max(0, 80 - removed)}개 남음`;
  const name = node.querySelector('strong');
  if (name && name.textContent !== String(player.displayName || '-')) name.textContent = String(player.displayName || '-');
  return true;
}

function patchSichuanBoard(player, { interactive = false, compact = false } = {}) {
  if (!player) return false;
  const boardNode = findSichuanNodeByPet('.sichuan-board', player.petId);
  if (!boardNode) return false;
  const tiles = sichuanTileMap();
  const board = sichuanEffectiveBoard(player);
  const cells = boardNode.querySelectorAll('.sichuan-cell[data-index]');
  if (cells.length !== 80) return false;
  for (let index = 0; index < 80; index += 1) {
    const cell = cells[index];
    if (!cell || Number(cell.dataset.index) !== index) return false;
    const tileId = board[index];
    const currentTileId = cell.dataset.tile || null;
    const selected = !compact && Number(app.sichuanSelectedIndex) === index && Boolean(tileId);
    cell.classList.toggle('sichuan-empty-cell', !tileId);
    cell.classList.toggle('selected', selected);
    const shouldDisable = !tileId || !interactive;
    if (cell.disabled !== shouldDisable) cell.disabled = shouldDisable;
    if (!tileId) {
      cell.dataset.tile = '';
      cell.setAttribute('aria-hidden', 'true');
      cell.setAttribute('tabindex', '-1');
      cell.setAttribute('aria-label', '빈 칸');
      if (cell.childNodes.length) cell.replaceChildren();
      continue;
    }
    cell.removeAttribute('aria-hidden');
    cell.removeAttribute('tabindex');
    const tile = tiles.get(tileId);
    const label = `${tile?.label || tileId}${selected ? ' 선택됨' : ''}`;
    cell.setAttribute('aria-label', label);
    // The important part: unchanged tiles keep their existing <img> node. Only the
    // two slots whose tile value actually changed are touched after a successful pair.
    if (currentTileId !== tileId || !cell.querySelector('img')) {
      const src = sichuanTileAssetSrc(tile);
      cell.dataset.tile = tileId;
      cell.replaceChildren();
      if (src) {
        const image = document.createElement('img');
        image.src = src;
        image.alt = '';
        image.draggable = false;
        image.loading = 'eager';
        image.decoding = 'async';
        const hiddenLabel = document.createElement('span');
        hiddenLabel.textContent = tile?.label || '';
        cell.append(image, hiddenLabel);
      }
    }
  }
  return true;
}

function patchSichuanReactions(room) {
  const target = $('.sichuan-board-stage') || $('.sichuan-spectator-stage');
  if (!target) return;
  const existing = target.querySelector('.spectator-burst-layer.sichuan-bursts');
  const next = spectatorBurstLayer(room?.reactions || [], 'sichuan');
  if (!next) { existing?.remove(); }
  else if (existing) existing.outerHTML = next;
  else target.insertAdjacentHTML('beforeend', next);
  const live = $('.sichuan-room-view .spectator-reactions .reaction-live');
  if (live) {
    const reactions = room?.reactions || [];
    live.classList.toggle('empty-live', reactions.length === 0);
    live.innerHTML = spectatorReactionLiveContent(reactions, '공감을 보내보세요.');
  }
}

function updateSichuanCountdown(room = currentSichuanRoom()) {
  const countdown = $('#sichuan-countdown');
  if (!countdown || room?.status !== 'playing' || !room.deadlineAt) return false;
  const remaining = new Date(room.deadlineAt).getTime() - sichuanServerNow();
  const seconds = Math.max(0, Math.ceil(remaining / 1000));
  const text = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  if (countdown.textContent !== text) countdown.textContent = text;
  return true;
}

function patchSichuanLiveRoom(room) {
  if (!room || app.tab !== 'games' || room.status !== 'playing') return false;
  const root = $('.sichuan-wrap .sichuan-room-view');
  if (!root) return false;
  if (String(root.dataset.sichuanRoomId || '') !== String(room.id || '')) return false;
  if (String(root.dataset.sichuanStatus || '') !== 'playing') return false;
  if (String(root.dataset.sichuanRole || '') !== String(room.viewerRole || 'none')) return false;
  // Players receive a matchId, so a rematch must rebuild the room once. Spectators do
  // not receive matchId by design and are guarded by status/stateVersion instead.
  if (room.viewerRole === 'player' && String(root.dataset.sichuanMatchId || '') !== String(room.matchId || '')) return false;

  const isPlayer = room.viewerRole === 'player';
  const isSpectator = room.viewerRole === 'spectator';
  if (isPlayer) {
    const self = room.players?.[room.selfPetId];
    const opponent = room.players?.[room.opponentPetId];
    if (!patchSichuanProgress(self, { mine: true }) || !patchSichuanProgress(opponent)) return false;
    if (!patchSichuanBoard(self, { interactive: true })) return false;
  } else if (isSpectator) {
    const host = room.players?.[room.host?.petId];
    const guest = room.players?.[room.guest?.petId];
    if (!patchSichuanProgress(host) || !patchSichuanProgress(guest)) return false;
    if (!patchSichuanBoard(host, { compact: true }) || !patchSichuanBoard(guest, { compact: true })) return false;
  } else {
    return false;
  }

  const spectatorCount = root.querySelector('[data-sichuan-spectator-count]');
  if (spectatorCount) spectatorCount.textContent = `관전자 ${Number(room.spectatorCount || 0)}명`;
  root.dataset.sichuanStateVersion = String(Number(room.stateVersion || 0));
  patchSichuanReactions(room);
  updateSichuanCountdown(room);
  requestAnimationFrame(syncGameResultScrollLock);
  return true;
}

function applySichuanRoomState(payload) {
  const room = payload?.room;
  if (!room || !app.data?.sichuan) return false;
  const rooms = app.data.sichuan.rooms ??= [];
  const index = rooms.findIndex((item) => item.id === room.id);
  const previous = index >= 0 ? rooms[index] : null;
  const sameMatch = Boolean(previous?.matchId && previous.matchId === room.matchId);
  const sameSpectatorStream = Boolean(previous && previous.viewerRole === 'spectator' && room.viewerRole === 'spectator' && previous.status === 'playing' && room.status === 'playing');
  if (previous?.matchId && previous.matchId !== room.matchId) resetSichuanInputQueue({ roomId: room.id, matchId: previous.matchId });
  if (room.status !== 'playing') resetSichuanInputQueue({ roomId: room.id, matchId: room.matchId });
  if ((sameMatch || sameSpectatorStream) && Number(room.stateVersion || 0) < Number(previous?.stateVersion || 0)) return false;
  if (index >= 0) rooms[index] = room;
  else rooms.push(room);
  app.data.sichuan.serverTime = Number(payload.serverTime || room.serverTime || Date.now());
  app.sichuanServerSyncedAt = monotonicNow();
  if (!sameMatch || room.status !== 'playing') app.sichuanSelectedIndex = null;
  if (!app.sichuanLobbyForced) app.sichuanRoomId = room.id;
  preloadSichuanTiles();
  if (app.tab === 'games') {
    if (!patchSichuanLiveRoom(room)) renderSichuanRegion();
    else markTabDirty('games');
  } else markTabDirty('games');
  updateAppChrome();
  return true;
}

function flashSichuanPair(indices = []) {
  const cells = indices.map((index) => $(`.sichuan-cell[data-index="${Number(index)}"]`)).filter(Boolean);
  cells.forEach((cell) => cell.classList.add('invalid'));
  setTimeout(() => cells.forEach((cell) => cell.classList.remove('invalid')), 220);
}

function removeSichuanPendingPair(actionId) {
  const index = app.sichuanPendingPairs.findIndex((item) => item.actionId === actionId);
  if (index >= 0) app.sichuanPendingPairs.splice(index, 1);
}

function enqueueSichuanPair(room, first, second) {
  if (!room?.id || !room?.matchId || room.status !== 'playing' || room.viewerRole !== 'player') return null;
  const board = sichuanEffectiveBoard(room.players?.[room.selfPetId], room);
  if (!canConnectSichuanClient(board, first, second)) return null;
  const actionId = crypto.randomUUID?.() || `sichuan-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const item = { roomId: room.id, matchId: room.matchId, first, second, actionId };
  app.sichuanPendingPairs.push(item);
  app.sichuanPairQueue.push(item);
  app.sichuanSelectedIndex = null;
  // Immediate local paint: the two cells disappear now; networking happens in the background.
  patchSichuanLiveRoom(room);
  queueMicrotask(drainSichuanPairQueue);
  return item;
}

async function drainSichuanPairQueue() {
  if (app.sichuanPairSending) return;
  const item = app.sichuanPairQueue.shift();
  if (!item) { app.sichuanActionInFlight = false; return; }
  const room = currentSichuanRoom();
  if (!room || room.id !== item.roomId || room.matchId !== item.matchId || room.status !== 'playing' || room.viewerRole !== 'player') {
    removeSichuanPendingPair(item.actionId);
    queueMicrotask(drainSichuanPairQueue);
    return;
  }
  app.sichuanPairSending = true;
  app.sichuanActionInFlight = true; // diagnostic only; never used to disable the board.
  let result = null;
  try {
    result = await api(`/api/sichuan/rooms/${encodeURIComponent(item.roomId)}/pair`, {
      method: 'POST', body: JSON.stringify({ matchId: item.matchId, first: item.first, second: item.second, actionId: item.actionId })
    });
    if (result.room) applySichuanRoomState({ room: result.room, serverTime: result.serverTime });
    if (result.ok && result.removed === false) flashSichuanPair([item.first, item.second]);
  } catch (error) {
    toast(error.message, 'error');
    // Reconcile from the server after a transport error; idempotent actionId prevents a retry/double-removal race.
    loadBootstrap({ silent: true, renderMode: 'games-live' });
  } finally {
    removeSichuanPendingPair(item.actionId);
    app.sichuanPairSending = false;
    app.sichuanActionInFlight = false;
    const latest = currentSichuanRoom();
    if (latest?.id === item.roomId && latest?.matchId === item.matchId && latest.status === 'playing') patchSichuanLiveRoom(latest);
    queueMicrotask(drainSichuanPairQueue);
  }
  return result;
}

function submitSichuanPair(room, first, second) {
  return enqueueSichuanPair(room, first, second);
}

function blockBattleBoardNode(playerId, root = document) {
  const id = String(playerId || '');
  return [...root.querySelectorAll('.block-battle-board')].find((item) => item.dataset.blockPlayer === id) ?? null;
}

function paintBlockBattleBoard(player, root = document, { activeOnly = false, preserveActiveOnMissing = false } = {}) {
  const board = blockBattleBoardNode(player?.petId, root);
  if (!board) return false;
  const cells = [...board.children].filter((cell) => cell.classList.contains('block-battle-cell'));
  if (cells.length !== 200) return false;

  // 싱글 테트리스와 동일하게 화면용 composite board를 만든 뒤 실제로 달라진 셀 class만 바꾼다.
  // activeOnly/preserveActiveOnMissing 인자는 기존 호출부 호환을 위해 유지하지만 별도 active DOM 레이어는 없다.
  const visual = blockBattleCompositeBoard(player);
  const cache = board.__blockBattlePaintCache || (board.__blockBattlePaintCache = Array.from(cells, (cell) => cell.className));
  for (let index = 0; index < 200; index += 1) {
    const row = Math.floor(index / 10);
    const col = index % 10;
    const type = visual[row]?.[col] ?? null;
    const className = `block-battle-cell${type ? ` piece-${type}` : ''}`;
    if (cache[index] !== className) {
      cells[index].className = className;
      cache[index] = className;
    }
  }
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

function blockBattleLiveDomMatches(room, root = document) {
  if (!room || room.status !== 'playing') return false;
  const stage = root.querySelector?.('.block-battle-stage[data-block-room-key]');
  const expectedKey = `${room.id}:${room.matchId}`;
  if (!stage || stage.dataset.blockRoomKey !== expectedKey) return false;
  if (room.viewerRole === 'player' && room.selfPetId && !blockBattleBoardNode(room.selfPetId, stage)) return false;
  return true;
}

function patchBlockBattleDynamic(room, { paintSelf = false } = {}) {
  const region = $('.block-battle-wrap');
  if (!region || !room || room.status === 'waiting') return false;
  // 보호용 부분 갱신은 반드시 현재 DOM이 같은 room/match의 실제 플레이판일 때만 허용한다.
  // 로비/이전 매치 DOM에 patch 성공으로 오판하면 새 판을 렌더하지 못하므로 match key와 내 보드 존재를 검증한다.
  if (room.status === 'playing' && !blockBattleLiveDomMatches(room, region)) return false;
  for (const serverPlayer of Object.values(room.players || {})) {
    const isSelf = room.status === 'playing' && room.viewerRole === 'player'
      && String(serverPlayer.petId) === String(room.selfPetId);
    const player = isSelf ? (blockBattleVisualSelf(room) || serverPlayer) : serverPlayer;
    const preserveActiveOnMissing = isSelf;
    // 내 보드는 로컬 입력 경로가 유일하게 그린다. 서버 push는 상대 보드/HUD만 갱신해
    // 네트워크 snapshot이 낙하 중 active 셀을 한 프레임이라도 덮어쓰지 못하게 한다.
    if (!isSelf || paintSelf) paintBlockBattleBoard(player, region, { preserveActiveOnMissing });
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
    const nextNode = panel.querySelector('[data-block-next]');
    const nextType = String(player.next?.[0] || '');
    if (nextNode && nextNode.dataset.nextType !== nextType) {
      nextNode.dataset.nextType = nextType;
      nextNode.innerHTML = `<small>NEXT</small>${singleTetrisNextHtml(nextType)}`;
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
  const player = blockBattleVisualSelf(room) || room?.players?.[room.selfPetId];
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

function blockBattlePredictedLockActive(room = currentBlockBattleRoom()) {
  const prediction = app.blockBattlePredictedLock;
  return Boolean(prediction && room && prediction.roomId === room.id && prediction.matchId === room.matchId);
}

function blockBattleApplyPredictedGarbage(board, holes) {
  const nextBoard = board.map((row) => [...row]);
  for (const rawHole of holes) {
    const hole = Number(rawHole);
    if (!Number.isInteger(hole) || hole < 0 || hole >= 10 || nextBoard[0]?.some(Boolean)) return null;
    nextBoard.shift();
    nextBoard.push(Array.from({ length: 10 }, (_, col) => col === hole ? null : 'G'));
  }
  return nextBoard;
}

function previewBlockBattleLock(room = currentBlockBattleRoom(), { paint = true, mark = true } = {}) {
  const player = blockBattleVisualSelf(room) || room?.players?.[room.selfPetId];
  const active = player?.active;
  const shape = active && LOCAL_TETROMINO_SHAPES[active.type]?.[Number(active.rotation) || 0];
  const nextType = player?.next?.[0];
  if (!player || !shape || !LOCAL_TETROMINO_SHAPES[nextType] || !Array.isArray(player.board)) return false;

  const board = player.board.map((row) => [...row]);
  for (const [x, y] of shape) {
    const row = Number(active.row) + y;
    const col = Number(active.col) + x;
    if (row < 0 || row >= 20 || col < 0 || col >= 10 || board[row]?.[col]) return false;
    board[row][col] = active.type;
  }
  const kept = board.filter((row) => row.some((cell) => !cell));
  const cleared = 20 - kept.length;
  while (kept.length < 20) kept.unshift(Array(10).fill(null));

  const attackByLines = { 1: 0, 2: 1, 3: 2, 4: 4 };
  let attack = Number(attackByLines[cleared] || 0);
  let pendingGarbage = Math.max(0, Number(player.pendingGarbage || 0));
  let pendingGarbageHoles = Array.isArray(player.pendingGarbageHoles)
    ? player.pendingGarbageHoles.map(Number).filter((hole) => Number.isInteger(hole) && hole >= 0 && hole < 10).slice(0, pendingGarbage)
    : [];
  const cancelled = Math.min(pendingGarbage, attack);
  pendingGarbage -= cancelled;
  if (cancelled > 0) pendingGarbageHoles = pendingGarbageHoles.slice(cancelled);
  attack -= cancelled;

  // 서버가 공격을 받는 순간 구멍 위치까지 미리 확정해 내려준다. 따라서 공격을 보내지 못하고
  // 대기 방해줄을 실제로 받는 lock에서는 ACK를 기다리지 않고 서버와 동일한 방해줄을 즉시 그린다.
  // 로컬 board와 authoritative board가 처음부터 같아져 ACK 순간 화면 교체/반짝임이 발생하지 않는다.
  let predictedBoard = kept;
  if (attack <= 0 && pendingGarbage > 0) {
    const incoming = Math.min(8, pendingGarbage);
    if (pendingGarbageHoles.length < incoming) return false;
    const withGarbage = blockBattleApplyPredictedGarbage(predictedBoard, pendingGarbageHoles.slice(0, incoming));
    if (!withGarbage) return false;
    predictedBoard = withGarbage;
    pendingGarbage -= incoming;
    pendingGarbageHoles = pendingGarbageHoles.slice(incoming);
  }

  const nextActive = { type: nextType, rotation: 0, row: 0, col: 3 };
  const testPlayer = { ...player, board: predictedBoard, active: nextActive };
  if (blockBattleLocalCollision(testPlayer, nextActive)) return false;

  player.board = predictedBoard;
  player.lines = Number(player.lines || 0) + cleared;
  player.pieces = Number(player.pieces || 0) + 1;
  player.pendingGarbage = pendingGarbage;
  player.pendingGarbageHoles = pendingGarbageHoles;
  player.active = nextActive;
  player.next = player.next.slice(1);
  if (mark) app.blockBattlePredictedLock = { roomId: room.id, matchId: room.matchId };
  if (paint) patchBlockBattleDynamic(room, { paintSelf: true });
  return true;
}

function previewBlockBattleInput(action, { room = currentBlockBattleRoom(), paint = true } = {}) {
  const player = blockBattleVisualSelf(room) || room?.players?.[room.selfPetId];
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
  if (paint && changed) paintBlockBattleBoard(player, document, { activeOnly: true, preserveActiveOnMissing: true });
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
  app.blockBattlePredictedLock = null;
  app.blockBattleVisualSelf = null;
  app.blockBattlePaintSelfOnce = false;
  app.blockBattleLockQueued = false;
  stopBlockBattleHold();
}

function acknowledgeBlockBattleBatch(room) {
  const requestId = String(room?.lastProcessedRequestId || '');
  if (!requestId) return false;
  const index = app.blockBattlePendingBatches.findIndex((batch) => batch.message.requestId === requestId);
  if (index < 0) return false;
  const acknowledged = app.blockBattlePendingBatches.splice(0, index + 1);
  for (const batch of acknowledged) clearTimeout(batch.retryTimer);
  if (acknowledged.some((batch) => batch.expectsLock)) app.blockBattlePredictedLock = null;
  app.blockBattleSending = app.blockBattlePendingBatches.length > 0;
  return true;
}

function replayBlockBattlePendingInputs(room, { paint = true } = {}) {
  if (!room || room.viewerRole !== 'player' || room.status !== 'playing') return;
  // v6.10.11: pending input은 visualSelf에 입력 순간 정확히 한 번만 적용된다.
  // 서버 snapshot이 올 때마다 pending을 다시 replay하면 left/right/tick이 중복 적용되어
  // 블록이 순간 이동하거나 이전/새 위치가 번갈아 보이는 잔상이 생긴다.
  // authoritative room은 절대 로컬 입력으로 수정하지 않고 ACK/판정용으로만 유지한다.
  if (paint) paintBlockBattleBoard(blockBattleVisualSelf(room) || room.players?.[room.selfPetId], document, { preserveActiveOnMissing: true });
}

function syncBlockBattleGravity() {
  const room = currentBlockBattleRoom();
  const active = app.tab === 'games' && !document.hidden && navigator.onLine
    && room?.viewerRole === 'player' && room.status === 'playing'
    && Object.values(room.players || {}).every((player) => player.connected);
  // 싱글 테트리스처럼 한 match에 로컬 중력 타이머 하나만 둔다.
  // 서버 gravityDueAt/push 시각을 key에 넣으면 매 snapshot마다 timeout이 취소/재등록되어
  // tick이 겹치거나 건너뛰는 경로가 생기므로 match key만 사용한다.
  const key = active ? `${room.id}:${room.matchId}` : null;
  if (app.blockBattleGravityKey === key && app.blockBattleGravityTimer) return;
  clearTimeout(app.blockBattleGravityTimer);
  app.blockBattleGravityTimer = null;
  app.blockBattleGravityKey = key;
  if (!active) return;

  const run = () => {
    app.blockBattleGravityTimer = null;
    const current = currentBlockBattleRoom();
    const currentKey = current?.viewerRole === 'player' && current.status === 'playing'
      ? `${current.id}:${current.matchId}` : null;
    if (app.blockBattleGravityKey !== key || currentKey !== key || document.hidden || app.tab !== 'games') return;
    queueBlockBattleInput('tick');
    // 입력 ACK/push와 무관하게 정확히 한 개의 로컬 중력 timer만 이어간다.
    if (app.blockBattleGravityKey === key) app.blockBattleGravityTimer = setTimeout(run, BLOCK_BATTLE_GRAVITY_MS);
  };
  app.blockBattleGravityTimer = setTimeout(run, BLOCK_BATTLE_GRAVITY_MS);
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
  requestAnimationFrame(syncGameResultScrollLock);
  return true;
}

function scheduleBlockBattleDomUpdate(needsLayout = false, { paintSelf = false } = {}) {
  app.blockBattleNeedsLayout ||= Boolean(needsLayout);
  app.blockBattlePaintSelfOnce ||= Boolean(paintSelf);
  if (app.tab !== 'games') { markTabDirty('games'); return; }
  if (app.blockBattleRenderFrame) return;
  app.blockBattleRenderFrame = requestAnimationFrame(() => {
    app.blockBattleRenderFrame = 0;
    const layout = app.blockBattleNeedsLayout;
    const paintSelf = Boolean(app.blockBattlePaintSelfOnce);
    app.blockBattleNeedsLayout = false;
    app.blockBattlePaintSelfOnce = false;
    const room = currentBlockBattleRoom();
    if (app.tab !== 'games') return markTabDirty('games');
    if (layout) renderBlockBattleRegion();
    else if (room) patchBlockBattleDynamic(room, { paintSelf });
  });
}

function blockBattleActiveIsRenderable(active) {
  const rotation = Number(active?.rotation) || 0;
  return Boolean(active && LOCAL_TETROMINO_SHAPES[active.type]?.[rotation]
    && Number.isFinite(Number(active.row)) && Number.isFinite(Number(active.col)));
}

function preserveBlockBattleActiveContinuity(previous, room) {
  if (!previous || !room || previous.matchId !== room.matchId || room.status !== 'playing'
    || room.viewerRole !== 'player' || !room.selfPetId) return false;
  const previousPlayer = previous.players?.[room.selfPetId];
  const incomingPlayer = room.players?.[room.selfPetId];
  if (!incomingPlayer || blockBattleActiveIsRenderable(incomingPlayer.active)
    || !blockBattleActiveIsRenderable(previousPlayer?.active)) return false;
  // playing 상태에서 서버 active가 일시적으로 빠진 snapshot은 화면만 깨뜨릴 수 있으므로
  // 직전의 유효 active를 보존한다. authoritative active가 다시 오면 즉시 그 값으로 교체된다.
  incomingPlayer.active = { ...previousPlayer.active };
  return true;
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
  // playing snapshot의 active가 일시 누락되더라도 한 프레임 빈 보드를 그리지 않는다.
  preserveBlockBattleActiveContinuity(previous, room);
  const incomingVersion = Math.max(0, Number(room.stateVersion) || 0);
  const acceptedVersion = sameMatch ? Math.max(0, Number(app.blockBattleServerVersions.get(room.id)) || 0) : 0;
  if (sameMatch && incomingVersion < acceptedVersion) return false;
  const hasPendingForRoom = app.blockBattlePendingBatches.some((batch) => batch.message.roomId === room.id);
  if (!sameMatch && (room.viewerRole === 'player' || hasPendingForRoom)) {
    resetBlockBattleInputQueue();
  }
  app.blockBattleServerVersions.set(room.id, incomingVersion);
  const acknowledged = acknowledgeBlockBattleBatch(room);
  if (index >= 0) rooms[index] = room;
  else rooms.push(room);
  // authoritative 상태는 저장하되 visualSelf는 평소 서버 push로 덮지 않는다.
  // 내가 보낸 입력이 모두 ACK된 안전한 순간에만 서버와 완전히 맞춰 잘못된 로컬 입력도 교정한다.
  const safeVisualReconcile = acknowledged && app.blockBattlePendingBatches.length === 0 && app.blockBattleInputBuffer.length === 0;
  const visualBefore = room.viewerRole === 'player' ? blockBattleVisualSelf(room) : null;
  const beforePieceCount = Number(visualBefore?.pieces || 0);
  const beforeActiveType = String(visualBefore?.active?.type || '');
  const beforeBoardKey = safeVisualReconcile ? JSON.stringify(visualBefore?.board ?? null) : '';
  const visualAfter = blockBattleVisualSelf(room, { force: safeVisualReconcile });
  // 정상 ACK에서는 active 객체/위치를 그대로 유지한다. 다만 서버가 고정 board를 실제로
  // 교정한 경우에는 같은 active를 얹은 상태로 내 보드만 정확히 한 번 다시 그린다.
  const serverSelfPaintNeeded = Boolean(safeVisualReconcile && visualAfter && (
    Number(visualAfter.pieces || 0) !== beforePieceCount
    || String(visualAfter.active?.type || '') !== beforeActiveType
    || JSON.stringify(visualAfter.board ?? null) !== beforeBoardKey
  ));
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
  scheduleBlockBattleDomUpdate(needsLayout, { paintSelf: serverSelfPaintNeeded });
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
      app.blockBattlePredictedLock = null;
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

  // lock 결과를 화면용 visualSelf에서 먼저 예측한 경우 다음 블록의 좌우/회전을 즉시 허용한다.
  // 서버 ACK는 실제 board/방해줄/공격 결과를 뒤에서 확정·교정하는 용도로만 사용한다.
  const awaitingLock = blockBattleAwaitingLock();
  const predictedLock = blockBattlePredictedLockActive(room);
  if (awaitingLock && !predictedLock) return false;

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

  // 모든 조작은 서버 객체가 아니라 visualSelf에 한 번만 즉시 반영한다.
  // 서버 snapshot은 같은 블록이 떨어지는 동안 이 visual 위치를 덮어쓰지 않는다.
  const willLock = action === 'hardDrop'
    || (['softDrop', 'tick'].includes(action) && blockBattleVerticalWouldLock(room));
  // 한 번에 lock 하나만 서버보다 앞서 예측한다. 이전 hardDrop이 확정되기 전의 추가 Space는
  // 다음 블록에 예약하지 않는다. 물리 keydown 1회가 현재 블록 hardDrop 1회만 만들도록 보장한다.
  if (awaitingLock && predictedLock && willLock) return false;

  // lock 예측 중 patchBlockBattleDynamic()이 visualSelf를 다시 읽어도 서버의 이전 piece로
  // 되돌리지 않도록 먼저 lock pending을 표시한다. 이 플래그는 서버 전송 batch의 expectsLock으로 이어진다.
  if (willLock) app.blockBattleLockQueued = true;

  if (!awaitingHardDrop || predictedLock) {
    const changed = previewBlockBattleInput(action);
    if (!changed && ['left', 'right', 'rotate'].includes(action)) return false;
  }
  // 자동 tick도 싱글처럼 visualSelf에서 즉시 한 칸만 움직인다. 이 객체는 app.data의 서버 snapshot과
  // 분리되어 있으므로 상대 push/ACK/bootstrap이 도착해도 같은 블록이 위로 되감기거나 사라지지 않는다.

  // 바닥에 닿는 hardDrop/softDrop/tick은 서버 왕복을 기다리지 않고 화면용 visualSelf에서
  // lock + 줄삭제 + 다음 블록 생성까지 같은 이벤트 안에서 끝낸다. authoritative 서버 상태는 그대로이며
  // 서버와 동일한 방해줄 구멍까지 예측하므로 ACK는 판정 확정만 하고 같은 화면은 그대로 유지한다.
  if (willLock) previewBlockBattleLock(room, { paint: true, mark: true });

  app.blockBattleInputBuffer.push(action);

  // 낙하 입력은 지연 배치하지 않는다. 좌우/회전도 한 프레임 안쪽(8ms)으로만 묶어
  // 서버 확정이 로컬 표시를 빠르게 따라오게 하면서 과도한 요청만 최소한으로 합친다.
  if (BLOCK_BATTLE_VERTICAL_ACTIONS.has(action)
    || app.blockBattleInputBuffer.length >= BLOCK_BATTLE_MAX_UNCONFIRMED_ACTIONS) {
    flushBlockBattleInputs();
  } else if (!app.blockBattleFlushTimer) {
    app.blockBattleFlushTimer = setTimeout(flushBlockBattleInputs, 8);
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
  const goldenStatus = '<b>👑 황금영토는 종료 후 공개됩니다. 공동 1위일 경우 황금영토를 가진 사람이 최종 우승합니다.</b>';
  const nextUpgrade = territory.my?.nextUpgrade;
  const territoryLimitHint = nextUpgrade
    ? `현재 Lv.${territory.my.level}은 최대 ${territory.my.limit}칸 · Lv.${nextUpgrade.level}부터 ${nextUpgrade.limit}칸`
    : `현재 Lv.${territory.my.level} · 최대 보유 한도 ${territory.my.limit}칸`;
  const last = territory.lastResult;
  const territoryHistory = (Array.isArray(territory.history) && territory.history.length ? territory.history : (last ? [last] : [])).slice(0, 4);
  const territoryHistoryHtml = territoryHistory.length
    ? `<div class="territory-end-history"><b>최근 종료</b><div>${territoryHistory.map((item) => `<span>제${Number(item.seasonNumber) || '-'}회 · ${dateText(item.endedAt)}</span>`).join('')}</div></div>`
    : '';
  const reentryNotice = battleUnlocked && Number(territory.my?.owned || 0) === 0
    ? `<div class="warning-box">⚔️ 현재 내 영토가 없습니다. 빈칸이 있으면 무료로 새 본진을 세울 수 있고, 맵이 꽉 찼다면 상대의 일반 영토를 눌러 ${Number(app.data?.catalog?.territoryStealCost || 50)}P로 빼앗아 🏠 새 본진을 세울 수 있습니다. 상대 본진은 항상 보호됩니다.</div>`
    : '';
  const previousResult = last?.goldenCell
    ? `<section class="section territory-result-section">${sectionHeading(`제${last.seasonNumber}회 결과`, '종료된 시즌의 황금 영토는 이제 공개됩니다.')}<div class="territory-last-result"><div><small>종료 시각</small><strong>${dateText(last.endedAt) || '-'}</strong></div><div><small>우승</small><strong>${last.winnerDisplayName ? `${esc(last.winnerDisplayName)} · ${points(last.reward || 0)}` : '보상 대상 없음'}</strong></div><div><small>황금 영토</small><strong>${Number(last.goldenCell.row) + 1}행 ${Number(last.goldenCell.col) + 1}열</strong></div><div><small>종료 시점 소유</small><strong>${last.goldenOwnerDisplayName ? esc(last.goldenOwnerDisplayName) : '빈 땅'}</strong></div></div>${territoryHistoryHtml}</section>`
    : (territoryHistoryHtml ? `<section class="section territory-result-section">${territoryHistoryHtml}</section>` : '');
  return `<section class="page-title"><span class="eyebrow">6시간 시즌</span><h1>제${territory.seasonNumber}회 레고 영토전</h1><p>본진을 지키면서 주변 8칸으로 땅을 넓히고 상대 영토를 빼앗는 게임입니다.</p></section>${previousResult}<section class="section territory-summary"><div class="metric-grid">${compactMetric('남은 시간', '비공개')}${compactMetric('내 레벨', `Lv.${territory.my.level}`)}${compactMetric('내 영토', `${territory.my.owned}/${territory.my.limit}`)}${compactMetric('현재 순위', territory.my.rank ? `${territory.my.rank}위` : '-')}</div><div class="territory-next-reset"><strong>종료 시각 비공개 · 각 6시간 구간 안에서 한 번 랜덤 종료됩니다.</strong></div><div class="territory-limit-strip"><span>${esc(territoryLimitHint)}</span><button class="soft-button" data-action="territory-limits" type="button">ⓘ 레벨별 한도</button></div><div class="territory-golden-status">${goldenStatus}</div><div class="territory-golden-status"><b>${battleUnlocked ? '⚔️ 전면전 진행 중 · 일반 영토 탈취 가능 · 본진은 항상 보호' : `🛡️ 본진은 항상 보호 · ${territory.cells.length}/${mapSize * mapSize}칸 점유`}</b></div>${reentryNotice}<div class="territory-rule"><b>안내:</b> 영토전은 한국시간 기준 00~06시, 06~12시, 12~18시, 18~24시 각 구간에서 정확히 한 번 랜덤한 시각에 종료됩니다. 정확한 종료 시각은 공개되지 않습니다.</div><div class="territory-rule"><b>룰:</b> 빈 땅 점령은 무료, 상대 땅 탈취는 50P입니다. 🏠 본진은 전면전 여부와 관계없이 항상 보호되며 누구도 빼앗거나 이동·포기할 수 없습니다. 맵 25칸이 한 번이라도 모두 차면 ⚔️ 전면전이 열리고 이후에는 일반 영토만 탈취할 수 있습니다. 신규 참가자나 영토가 0칸이 된 사람도 빈칸 또는 상대의 일반 영토를 통해 다시 참가할 수 있습니다. 보유 한도가 꽉 차면 빈 땅 추가 점령은 막히지만, 상대의 일반 영토는 50P를 내고 내 가장 오래된 일반 영토 한 칸을 옮기는 방식으로 계속 탈취할 수 있습니다.</div></section><section class="section territory-section">${sectionHeading('공용 맵', `${mapSize} × ${mapSize}`)}<div class="territory-scroll"><div class="territory-map" role="grid" aria-label="${mapSize}행 ${mapSize}열 레고 영토전 맵">${rows}</div></div><p class="helper centered">회색칸은 빈 땅, 색깔 닉네임은 소유자입니다. 🏠 본진은 전면전에서도 항상 보호되며 탈취·이동·포기할 수 없습니다. 황금영토는 종료 후 공개됩니다.</p></section><section class="section">${sectionHeading('현재 순위', '단독 1위 5,000P · 공동 1위는 황금영토로 결정')}<div class="rank-list">${ranking}</div></section>`;
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
  const stage = visualStageForProfile(profile);
  return `<button class="profile-mini${flexProfileClass(profile)}" data-action="profile" data-id="${profile.id}" type="button">${workoutBadgeHtml(profile, { compact: true })}${seasonBadgesHtml(profile)}${avatar(stage, { mini: true, flexItem: profile.flexItem })}<strong>${levelBadgeHtml(profile)}<span class="flex-display-name">${esc(profile.displayName)}</span></strong>${profile.statusMessage ? `<span class="profile-status-message">${esc(profile.statusMessage)}</span>` : ''}<small>${profile.online ? '🟢 ' : ''}Lv.${profile.stats.level} · ${points(profile.stats.points)}</small></button>`;
}

function kingHistoryText(history = {}) {
  const defs = [
    ['apple','🍎 사과왕'], ['singleTetris','🧱 싱글테트리스왕'], ['omok','⚫ 오목왕'],
    ['blockBattle','🧱 테트리스왕'], ['sichuan','🀄 사천성왕'],
    ['minesweeperNormal','💥 지뢰왕'], ['minesweeperHard','💣 지뢰왕고수']
  ];
  const labels = defs.filter(([key]) => Boolean(history?.[key])).map(([, label]) => label);
  return labels.length ? labels.join(' · ') : '아직 없음';
}

function recordsView() {
  const pet = app.data.dashboard.pet;
  const records = pet.records;
  const couple = pet.partnerPetId ? (pet.coupleLabel || `${pet.partnerDisplayName || '상대'}와 커플`) : '솔로';
  const activeTitles = Array.isArray(pet.seasonBadges) && pet.seasonBadges.length
    ? pet.seasonBadges.map((badge) => badge.label).join(' · ') : '없음';
  const flex = pet.flexItem?.name || '없음';
  return `<section class="page-title"><span class="eyebrow">기록</span><h1>${esc(pet.displayName)}의 기록</h1><p>승패 로그 대신 이 레고의 생활·성장 기록만 간단히 남깁니다.</p></section><section class="section"><div class="record-grid">${compactMetric('탄생일', dateOnlyText(pet.createdAt))}${compactMetric('생존', `${records.days}게임일`)}${compactMetric('최고 몸집', `${records.maxBody}`)}${compactMetric('최고 포인트', points(records.maxPoints))}${compactMetric('현재 커플', couple)}${compactMetric('현재 왕 칭호', activeTitles)}${compactMetric('현재 장식', flex)}${compactMetric('왕 경력', kingHistoryText(pet.kingHistory))}</div></section>${app.data.admin.isAdmin ? `<section class="section admin-callout"><div><h2>운영자 관리</h2><p>포인트 지급·회수, 강퇴, 계정 삭제, 상태 초기화와 진행 중 벙·오목·테트리스대전·사천성대전·레고도쿠 방 관리를 할 수 있습니다.</p></div><button class="primary" data-action="open-admin" type="button">관리 열기</button></section>` : ''}<section class="section"><button class="danger-button wide" data-action="logout" type="button">모든 기기에서 로그아웃</button></section>`;
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
  // 최종 방어선: 어떤 호출자가 force:true로 renderTab('games')를 직접 호출하더라도
  // 같은 1:1 테트리스 매치의 살아 있는 200셀 DOM은 절대 innerHTML로 교체하지 않는다.
  // 탭 전환/새 매치처럼 DOM key가 다를 때만 아래의 정상 전체 렌더를 허용한다.
  if (tab === 'games' && alreadyRendered) {
    const liveBlockBattleRoom = currentBlockBattleRoom();
    if (liveBlockBattleRoom?.status === 'playing'
      && blockBattleLiveDomMatches(liveBlockBattleRoom, pane)
      && patchBlockBattleDynamic(liveBlockBattleRoom, { paintSelf: false })) {
      pane.dataset.revision = String(app.revision);
      updateAppChrome();
      syncBlockBattleGravity();
      return;
    }
  }
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
        syncGameResultScrollLock();
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
    if (tab === 'games' && pane.dataset.rendered === 'true') {
      const liveBlockBattleRoom = currentBlockBattleRoom();
      if (liveBlockBattleRoom?.status === 'playing' && patchBlockBattleDynamic(liveBlockBattleRoom, { paintSelf: false })) {
        // 예약된 generic tab render도 진행 중인 1:1 테트리스 DOM을 교체하지 못하게 막는다.
        updateAppChrome();
        syncBlockBattleGravity();
        return;
      }
      const liveSichuanRoom = currentSichuanRoom();
      if (liveSichuanRoom?.status === 'playing' && patchSichuanLiveRoom(liveSichuanRoom)) {
        updateAppChrome();
        return;
      }
    }
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
  // 실시간 1:1 테트리스/사천성 플레이 중에는 generic bootstrap/render가 게임판 DOM을
  // 통째로 교체하지 못한다. 데이터는 최신으로 받고 실제 판은 증분 patch만 수행한다.
  const liveBlockBattleRoom = app.tab === 'games' ? currentBlockBattleRoom() : null;
  if (pane.dataset.rendered === 'true' && app.dirtyTabs.has('games') && liveBlockBattleRoom?.status === 'playing' && patchBlockBattleDynamic(liveBlockBattleRoom, { paintSelf: false })) {
    syncBlockBattleGravity();
    requestAnimationFrame(syncGameResultScrollLock);
    return;
  }
  const liveSichuanRoom = app.tab === 'games' ? currentSichuanRoom() : null;
  if (pane.dataset.rendered === 'true' && app.dirtyTabs.has('games') && liveSichuanRoom?.status === 'playing' && patchSichuanLiveRoom(liveSichuanRoom)) {
    requestAnimationFrame(syncGameResultScrollLock);
    return;
  }
  if (pane.dataset.rendered !== 'true') renderTab(app.tab, { force: true });
  else if (app.dirtyTabs.has(app.tab)) scheduleTabRender(app.tab);
  requestAnimationFrame(syncGameResultScrollLock);
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
  const stages = bodyStages();
  const current = stageForBody(body);
  const currentIndex = Math.max(0, stages.findIndex((stage) => stage.key === current.key));
  const next = stages[currentIndex + 1] || null;
  const remaining = next ? Math.max(0, Number(next.min) - Math.round(body)) : 0;
  const progressText = next
    ? `🔥 다음 진화 <b>${esc(next.label)}</b>까지 몸집 <b>+${remaining}</b> · ${next.min} 달성하면 바로 진화`
    : `🏆 최종 기본 체형 <b>${esc(current.label)}</b> 달성 · 레비아탄 도달 시 전직 체형 11종을 선택할 수 있습니다.`;
  const cards = stages.map((stage, index) => {
    const life = lifeHungerCostsForStage(stage);
    const nextStage = stages[index + 1] || null;
    const evolution = nextStage ? `<small class="body-evolution-hint">→ 몸집 ${nextStage.min} 달성 시 <b>${esc(nextStage.label)}</b> 진화</small>` : '<small class="body-evolution-hint final">★ 레비아탄 달성 시 전직 체형 11종 해금</small>';
    const currentHint = stage.key === current.key && next ? `<b class="body-next-now">다음 진화까지 +${remaining}</b>` : stage.key === current.key ? '<b class="body-next-now">현재 최종 기본 단계</b>' : '';
    return `<article class="body-guide-card ${stage.key === current.key ? 'current' : ''}"><span class="body-guide-step">${index + 1}단계</span>${avatar(stage, { mini: true })}<div><strong>${esc(stage.label)}</strong><small>몸집 ${esc(bodyRangeLabel(stage))}</small>${evolution}<small>게임·교미·영토 포만감 -${Math.max(1, Number(stage.activityHungerCost) || 1)}</small><small>생활: 일 -${life.work} · 쉬기 -${life.rest} · 요리 포만감 +50 · 체력 -10</small>${currentHint}</div></article>`;
  }).join('');
  openModal(`${modalHeader('레고 체형 도감', `현재 몸집 ${Number.isFinite(body) ? Math.round(body) : '-'} · ${current.label}`)}<div class="body-growth-callout">${progressText}</div><div class="body-guide-list">${cards}</div>`, { type: 'bodyGuide', body });
}


function openBodyAdvancement() {
  const pet = app.data?.dashboard?.pet;
  const state = pet?.bodyAdvancement || {};
  if (!state.unlocked) {
    toast(`레비아탄레고(몸집 ${state.requiredBody || app.data?.catalog?.bodyAdvancementBody || 8750})에 도달하면 전직이 해금됩니다.`, 'error');
    return;
  }
  const options = [...(app.data?.catalog?.bodyAdvancements ?? [])].sort((a,b) => Number(a.order||0)-Number(b.order||0));
  const selectedKey = state.selected?.key || '';
  const cards = options.map((item) => {
    const selected = item.key === selectedKey;
    const stage = { key:`adv-${item.key}`, assetKey:item.assetKey, label:item.label, activityHungerCost:7 };
    return `<article class="advancement-card ${selected ? 'selected' : ''}">${avatar(stage,{mini:true})}<div><strong>${esc(item.label)}</strong><p>${esc(item.description)}</p></div><button class="${selected ? 'ghost' : 'primary'}" data-action="select-body-advancement" data-value="${esc(item.key)}" type="button">${selected ? '현재 체형' : '전직하기'}</button></article>`;
  }).join('');
  const baseButton = selectedKey ? '<button class="ghost wide advancement-reset" data-action="select-body-advancement" data-value="leviathan" type="button">레비아탄 기본 체형으로 돌아가기</button>' : '';
  openModal(`${modalHeader('레비아탄 전직','능력치 변화 없이 원하는 체형을 선택합니다.')}<div class="advancement-current">${state.selected ? `현재 <b>${esc(state.selected.label)}</b>` : '<b>전직 체형을 골라주세요.</b>'}</div><div class="advancement-grid">${cards}</div>${baseButton}`, { type:'bodyAdvancement' });
}

async function selectBodyAdvancement(key) {
  const result = await perform('/api/profile/body-advancement', { key }, null, 'POST', { toastDuration:2200 });
  if (result?.ok) openBodyAdvancement();
  return result;
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
  const pet = app.data.dashboard.pet;
  const level = Number(pet.stats.level) || 1;
  const energyDrink = foods.find((food) => food.category === 'energy');
  const byTier = new Map();
  for (const food of foods.filter((item) => item.category === 'gain' || item.category === 'diet')) {
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
  const energy = energyDrink ? `<article class="energy-drink-card"><div><span>⚡ 긴급 체력 회복</span><strong>${esc(energyDrink.name)}</strong><small>현재 체력 ${Number(pet.stats.stamina || 0)} / 100 · 즉시 체력 +${Number(energyDrink.stamina || 0)}</small><p>${esc(energyDrink.description || '')}</p></div><button class="primary" data-action="eat" data-id="${esc(energyDrink.id)}" type="button" ${Number(pet.stats.stamina || 0) >= 100 ? 'disabled' : ''}>${Number(pet.stats.stamina || 0) >= 100 ? '체력 가득' : points(energyDrink.price)}</button></article>` : '';
  const rows = [...byTier.entries()].sort((a, b) => a[0] - b[0]).map(([, row]) => `<div class="food-tier-row">${card(row.gain)}${card(row.diet)}</div>`).join('');
  openModal(`${modalHeader('음식 먹이기', `현재 Lv.${level} · 보유 포인트 ${points(pet.stats.points)}`)}${energy}<div class="food-column-heads"><b>살찌는 음식</b><b>다이어트 음식</b></div><div class="food-matrix">${rows}</div><p class="helper centered">같은 단계의 살찌는 음식과 다이어트 음식은 같은 가격입니다. 몸집 방향만 골라 먹으면 됩니다.</p>`, { type: 'food' });
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
  if (item.id === 'miniGame20' && Number(shop.miniGameBonus) > 0) return `이번 게임 하루 추가 +${shop.miniGameBonus}회 · 총 ${shop.miniGamesLimit}회`;
  if (item.id === 'battle20') return `이번 게임 하루 ${Number(shop.battlePlayed || 0)}/${Number(shop.battleLimit || 30)}회 사용 · 추가 +${Number(shop.battleBonus || 0)}회`;
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
  const flexItems = [...(app.data?.catalog?.flexItems ?? [])].filter((item) => !item.retired).sort((a, b) => Number(a.requiredLevel || 0) - Number(b.requiredLevel || 0) || Number(a.order || 0) - Number(b.order || 0));
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
  openModal(`${modalHeader('상점', `보유 포인트 ${points(app.data.dashboard.pet.stats.points)}`)}<h3 class="shop-section-title">기능 상품</h3><div class="shop-grid">${cards}</div><p class="helper centered">구매와 지급은 서버에서 한 번만 처리됩니다. 횟수권과 복권은 한국시간 00·06·12·18시 초기화 기준입니다.</p><div class="shop-section-divider"></div><h3 class="shop-section-title">플렉스 아이템</h3><p class="helper">5레벨마다 새 장비 5종 해금 · 능력치 효과 없음 · 24시간 장착</p>${activeCard}${flexSections}`, { type: 'shop' });
  updateLoudspeakerShopState();
}


async function buyShopItem(itemId, extra = {}) {
  // 같은 클릭의 통신 재시도에는 같은 ID를 쓰되, 서버 응답이 확정된 순간 performIdempotent가
  // 키를 폐기하므로 다음 실제 구매 클릭은 항상 새로운 requestId를 받는다.
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
  const rules = app.data?.catalog?.oddEven ?? { minStake: 10, stakeStep: 10, payoutPercent: { 1: 150, 2: 300, 3: 600 } };
  const minStake = Math.max(1, Math.floor(Number(rules.minStake) || 10));
  const stakeStep = Math.max(1, Math.floor(Number(rules.stakeStep) || 10));
  const payoutPercent = rules.payoutPercent ?? { 1: 150, 2: 300, 3: 600 };
  const maxStake = balance;
  const disabled = maxStake < minStake ? 'disabled' : '';
  openModal(`${modalHeader('홀짝 배팅', `보유 포인트 ${points(balance)}`)}<form id="odd-even-bet-form" class="stack-form odd-even-bet-form"><label>걸 포인트<input id="odd-even-stake" name="stakePoints" type="number" inputmode="numeric" min="${minStake}" max="${maxStake}" step="${stakeStep}" placeholder="${minStake}~${maxStake}P · ${stakeStep}P 단위" autocomplete="off" required ${disabled}></label><div class="odd-even-preview"><div><span>1연승 정산</span><strong id="odd-even-payout-1">-</strong></div><div><span>2연승 정산</span><strong id="odd-even-payout-2">-</strong></div><div><span>3연승 정산</span><strong id="odd-even-payout-3">-</strong></div></div><p class="warning-box">보유 포인트 안에서 ${minStake}P 이상을 ${stakeStep}P 단위로 원하는 만큼 걸 수 있습니다. 시작할 때 판돈이 차감되고, 실패하면 전액을 잃습니다. 1연승은 1.5배, 2연승은 3배, 3연승은 6배를 총 지급합니다.</p><button class="primary wide" type="submit" ${disabled}>배팅 시작</button></form>`, { type: 'oddEvenBet' });
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
  const fixedNodes = [
    $('.minesweeper-controls', game), $('.minesweeper-hud', game),
    $('.minesweeper-rules', game), $('.minesweeper-helper', game)
  ];
  const fixedHeight = fixedNodes.reduce((sum, node) => sum + miniGameOuterHeight(node), 0);
  const boardStyle = getComputedStyle(board);
  const boardMargins = (parseFloat(boardStyle.marginTop) || 0) + (parseFloat(boardStyle.marginBottom) || 0);
  const availableHeight = Math.max(1, game.clientHeight - fixedHeight - boardMargins - 4);
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
  requestAnimationFrame(syncMinesweeperGameLayout);
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
  const fixedNodes = [
    $('.block-controls', game), $('.block-hud', game), $('.block-rules', game),
    $('.block-helper', game), $('.block-reward-guide', game)
  ];
  const fixedHeight = fixedNodes.reduce((sum, node) => sum + miniGameOuterHeight(node), 0);
  const boardStyle = getComputedStyle(board);
  const boardMargins = (parseFloat(boardStyle.marginTop) || 0) + (parseFloat(boardStyle.marginBottom) || 0);
  const availableHeight = Math.max(1, game.clientHeight - fixedHeight - boardMargins - 4);
  const availableWidth = Math.max(1, game.clientWidth);
  const width = Math.max(1, Math.floor(Math.min(500, availableWidth, availableHeight * (10 / 12))));
  board.style.width = `${width}px`;
  board.style.height = `${Math.floor(width * 1.2)}px`;
}

function miniGameOuterHeight(node) {
  if (!node) return 0;
  const style = getComputedStyle(node);
  return (node.offsetHeight || 0) + (parseFloat(style.marginTop) || 0) + (parseFloat(style.marginBottom) || 0);
}

function syncSingleTetrisLayout() {
  if (!app.singleTetrisModalActive || app.modal?.gameId !== 'tetrisSingle') return;
  updateVisualViewportVars();
  const modal = $('#modal-content');
  const game = $('.single-tetris-game', modal ?? document);
  const stage = $('.single-tetris-stage', game ?? document);
  const board = $('#single-tetris-board', game ?? document);
  if (!modal || !game || !stage || !board) return;

  const fixedNodes = [
    $('.single-tetris-abandon-controls', game),
    $('.single-tetris-hud', game),
    $('.single-tetris-rule', game),
    $('.single-tetris-controls', game),
    $('.single-tetris-keyboard-help', game)
  ];
  const fixedHeight = fixedNodes.reduce((sum, node) => sum + miniGameOuterHeight(node), 0);
  const gameStyle = getComputedStyle(game);
  const gamePadding = (parseFloat(gameStyle.paddingTop) || 0) + (parseFloat(gameStyle.paddingBottom) || 0);
  const desktopSplit = Boolean(window.matchMedia?.('(min-width: 760px) and (min-height: 720px)').matches);
  const availableHeight = desktopSplit
    ? Math.max(1, stage.clientHeight || game.clientHeight - gamePadding)
    : Math.max(1, game.clientHeight - gamePadding - fixedHeight - 8);
  const availableWidth = Math.max(1, Math.min(game.clientWidth, stage.clientWidth || game.clientWidth));
  const coarsePointer = Boolean(window.matchMedia?.('(pointer: coarse)').matches);
  const cap = desktopSplit ? 460 : (coarsePointer ? 390 : 420);
  const boardWidth = Math.max(1, Math.floor(Math.min(cap, availableWidth, availableHeight / 2)));
  board.style.width = `${boardWidth}px`;
  board.style.height = `${boardWidth * 2}px`;
}

function openMiniGame(challenge) {
  if (!challenge) return closeModal();
  cleanupAppleBoardUi();
  let content = '';
  if (challenge.gameId === 'oddEven') content = `<div class="mini-center"><div class="game-icon big">🌓</div><h3>${challenge.streak ? `${challenge.streak}연승 중` : '홀일까 짝일까?'}</h3><p>${points(challenge.stake)}는 시작할 때 이미 걸었습니다. 틀리면 전액을 잃습니다.</p><div class="button-row"><button class="primary" data-action="finish-mini" data-value="odd" type="button">홀</button><button class="primary" data-action="finish-mini" data-value="even" type="button">짝</button></div>${challenge.streak > 0 ? `<button class="soft-button wide" data-action="stop-mini" type="button">그만하고 ${points(challenge.pendingPayout)}</button>` : ''}</div>`;
  if (challenge.gameId === 'reaction') content = `<div id="reaction-stage" class="mini-center reaction-stage waiting"><div class="game-icon big">⚡</div><h3 id="reaction-title">아직 누르지 마세요</h3><p id="reaction-guide">PC는 마우스를 버튼 위에 올려두고 <b>초록색으로 바뀌는 순간</b> 클릭하세요.</p><button id="reaction-button" class="reaction-trigger-button" data-action="finish-mini" data-value="1" type="button"><span>대기</span><small>초록색이 되면 클릭!</small></button></div>`;
  if (challenge.gameId === 'number') content = `<div class="mini-center"><div class="game-icon big">🔢</div><h3>1부터 100 사이 숫자</h3><p id="number-attempts">${challenge.attempts || 0}/${challenge.maxAttempts || 5}회 사용</p><form id="number-game-form" class="number-form"><input name="guess" type="number" inputmode="numeric" min="1" max="100" placeholder="숫자를 입력하세요" autocomplete="off" required><button class="primary" type="submit">확인</button></form><p id="number-game-hint" class="helper centered" aria-live="polite"></p><div id="number-guess-history" class="guess-history ${challenge.guesses?.length ? '' : 'hidden'}">입력: ${(challenge.guesses ?? []).join(', ')}</div></div>`;
  if (challenge.gameId === 'apple') content = `<div class="apple-game"><div class="apple-hud"><div><small>남은 시간</small><strong id="apple-countdown">${appleTimeText(challenge)}</strong></div><div><small>게임 점수</small><strong id="apple-score">${Number(challenge.appleScore || 0).toLocaleString('ko-KR')}점</strong></div><div><small>획득 예정</small><strong id="apple-pending">${points(challenge.applePendingPoints || 0)}</strong></div></div><p class="helper apple-rules">사각형 합 10이면 제거 · 2개 +5P · 3개 이상 +6P</p><div id="apple-refresh-region" class="apple-refresh-region">${appleRefreshOfferHtml(challenge)}</div><div id="apple-board-stage" class="apple-board-stage"><div id="apple-board" class="apple-board" aria-label="사과게임 10 곱하기 10 숫자판">${appleBoardHtml(challenge)}</div></div><div class="apple-bottom-ui"><div id="apple-selection-info" class="apple-selection-info">드래그해서 숫자를 선택하세요.</div></div></div>`;
  if (challenge.gameId === 'minesweeper') {
    app.minesweeperSessionActive = true;
    const elapsed = challenge.startedAt ? Math.max(0, serverAlignedNow(app.data?.serverTime) - new Date(challenge.startedAt).getTime()) : 0;
    content = `<div class="minesweeper-game ${challenge.difficulty === 'hard' ? 'hard' : 'normal'}"><div class="mini-abandon-controls minesweeper-controls"><button class="ghost mini-abandon-button minesweeper-abandon-button" data-action="minesweeper-abandon" type="button">포기하기</button></div><div class="minesweeper-hud"><div><small>시간</small><strong id="minesweeper-timer">${minesweeperTimeText(elapsed)}</strong></div><div><small>깃발</small><strong id="minesweeper-flags">${Number(challenge.flagCount || 0)}/${Number(challenge.mines || 0)}</strong></div><div><small>안전칸</small><strong id="minesweeper-opened">${Number(challenge.revealedSafeCount || 0)}/${Number(challenge.safeCellCount || 0)}</strong></div></div><p class="helper minesweeper-rules">안전칸을 모두 열면 클리어 · 첫 클릭과 주변 8칸은 지뢰 없음</p><div id="minesweeper-board" class="minesweeper-board" style="--mine-cols:${Number(challenge.cols || 10)}" role="grid" aria-label="지뢰찾기 ${Number(challenge.rows || 10)}행 ${Number(challenge.cols || 10)}열">${minesweeperBoardHtml(challenge)}</div><p id="minesweeper-helper" class="minesweeper-helper">${challenge.startedAt ? 'PC: 좌클릭 열기 · 우클릭 깃발 / 모바일: 짧게 터치 열기 · 길게 누르기 깃발' : '첫 칸을 짧게 터치해 열면 시간이 시작되고 개인게임 1회가 차감됩니다.'}</p></div>`;
  }
  if (challenge.gameId === 'tetrisSingle') content = singleTetrisGameHtml(challenge);
  if (challenge.gameId === 'block') content = `<div class="block-game"><div class="mini-abandon-controls block-controls"><button id="block-stop-button" class="ghost mini-abandon-button" data-action="abandon-mini" type="button">포기하기</button></div><div class="block-hud"><div><small>남은 블록</small><strong id="block-remaining">${Number(challenge.blockRemainingCount || 0)}개</strong></div><div><small>제거 가능 그룹</small><strong id="block-groups">${Number(challenge.blockAvailableGroups || 0)}개</strong></div><div><small>획득 예정</small><strong id="block-pending">${points(challenge.blockPendingPoints || 0)}</strong></div></div><p class="helper block-rules">같은 색 2개 이상 클릭 · 상하좌우만 연결 · 시간제한 없음</p><div id="block-board" class="block-board" role="grid" aria-label="블록게임 12행 10열 색상판">${blockBoardHtml(challenge)}</div><p id="block-helper" class="block-helper" aria-live="polite">제거한 자리 위의 블록만 아래로 바로 내려옵니다. 좌우로는 움직이지 않습니다.</p><p class="block-reward-guide"><b>포인트</b> 2개 5P · 3개 9P · 4개 13P · 5개 18P · 6개 23P · 7개 29P · 8개 35P · 9개 42P · 10~12개 52P · 13~15개 65P · 16개+ 80P · ALL CLEAR +100P</p></div>`;
  const miniName = app.data.catalog.miniGames.find((game) => game.id === challenge.gameId)?.name || '미니게임';
  const miniDescription = challenge.gameId === 'minesweeper' ? `${challenge.difficultyLabel || (challenge.difficulty === 'hard' ? '어려움' : '보통')} · ${Number(challenge.rows || 0)}×${Number(challenge.cols || 0)} · 지뢰 ${Number(challenge.mines || 0)}개` : '';
  const miniHeader = challenge.gameId === 'apple' ? appleModalHeader(miniName, miniDescription) : modalHeader(miniName, miniDescription);
  openModal(`${miniHeader}${content}`, { type: 'mini', gameId: challenge.gameId });
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
    if (challenge.gameId === 'tetrisSingle') { paintSingleTetris(); syncSingleTetrisLayout(); startSingleTetrisTimers(); }
    if (challenge.gameId === 'minesweeper') { syncMinesweeperGameLayout(); startMinesweeperClock(); }
  });
}

function cleanupAppleBoardUi() {
  if (app.appleBoardUi?.moveFrame) cancelAnimationFrame(app.appleBoardUi.moveFrame);
  app.appleBoardUi?.abortController?.abort();
  app.appleBoardUi = null;
  if (app.appleLayoutFrame) cancelAnimationFrame(app.appleLayoutFrame);
  app.appleLayoutFrame = 0;
  document.body.classList.remove('apple-dragging');
}

function syncAppleGameLayout() {
  if (!app.appleModalActive || app.modal?.gameId !== 'apple') return;
  updateVisualViewportVars();
  if (app.appleLayoutFrame) cancelAnimationFrame(app.appleLayoutFrame);
  app.appleLayoutFrame = requestAnimationFrame(() => {
    app.appleLayoutFrame = 0;
    const modal = $('#modal-content');
    const game = $('.apple-game', modal ?? document);
    const stage = $('#apple-board-stage', game ?? document);
    const board = $('#apple-board', game ?? document);
    if (!modal || !game || !stage || !board) return;

    // PC는 CSS의 고정된 최대 520px 정사각형을 그대로 사용한다.
    // 게임판 자신의 크기를 관찰하거나 stage 높이를 다시 입력값으로 쓰지 않아
    // width/height -> flex/scrollbar -> width/height의 피드백 진동이 생기지 않는다.
    const compactViewport = window.matchMedia?.('(max-width: 700px), (pointer: coarse)')?.matches;
    if (!compactViewport) {
      board.style.removeProperty('width');
      board.style.removeProperty('height');
      return;
    }

    // 모바일은 stage 자체 높이가 아니라, 게임 컨테이너의 안정된 높이에서
    // HUD/규칙/새판 UI 등 고정 형제의 높이만 한 번 빼서 판 크기를 계산한다.
    const stageStyle = getComputedStyle(stage);
    const horizontalPadding = (parseFloat(stageStyle.paddingLeft) || 0) + (parseFloat(stageStyle.paddingRight) || 0);
    const verticalPadding = (parseFloat(stageStyle.paddingTop) || 0) + (parseFloat(stageStyle.paddingBottom) || 0);
    let fixedHeight = 0;
    for (const child of game.children) {
      if (child === stage || getComputedStyle(child).display === 'none') continue;
      const style = getComputedStyle(child);
      fixedHeight += child.getBoundingClientRect().height + (parseFloat(style.marginTop) || 0) + (parseFloat(style.marginBottom) || 0);
    }
    const availableWidth = Math.max(120, Math.floor(game.clientWidth - horizontalPadding));
    const availableHeight = Math.max(120, Math.floor(game.clientHeight - fixedHeight - verticalPadding - 4));
    const size = Math.max(120, Math.floor(Math.min(520, availableWidth, availableHeight)));
    if (board.style.width !== `${size}px`) board.style.width = `${size}px`;
    if (board.style.height !== `${size}px`) board.style.height = `${size}px`;
  });
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
  // PC에서는 게임 중 판 크기를 다시 계산하지 않는다. 모바일/터치 화면에서만 UI 높이 변화에 맞춘다.
  if (window.matchMedia?.('(max-width: 700px), (pointer: coarse)')?.matches) requestAnimationFrame(syncAppleGameLayout);
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
  if (stop) stop.textContent = '포기하기';
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
  openModal(`${modalHeader('오목방 만들기', `보유 포인트 ${points(balance)}`)}<form id="omok-create-form" class="stack-form"><label>판돈<select name="preset" id="omok-stake-preset"><option value="100">100P</option><option value="500">500P</option><option value="1000">1,000P</option><option value="2000">2,000P</option><option value="3000">3,000P</option><option value="custom">직접 입력</option></select></label><label id="omok-custom-stake-wrap" class="hidden">직접 입력<input name="customStake" type="number" inputmode="numeric" min="1000" step="1000" placeholder="4,000 / 5,000 / ..."></label><button class="primary wide" type="submit">방 만들기</button></form>`, { type: 'omokCreate' });
  requestAnimationFrame(() => {
    const preset = $('#omok-stake-preset');
    preset?.addEventListener('change', () => $('#omok-custom-stake-wrap')?.classList.toggle('hidden', preset.value !== 'custom'));
  });
}

function openCreateBlockBattle() {
  const balance = Math.max(0, Number(app.data?.dashboard?.pet?.stats?.points) || 0);
  const presets = app.data?.blockBattle?.stakes?.length ? app.data.blockBattle.stakes : [100, 500, 1000, 2000, 3000];
  const options = presets.map((stake) => `<option value="${stake}">${Number(stake).toLocaleString('ko-KR')}P</option>`).join('');
  openModal(`${modalHeader('테트리스대전 방 만들기', `보유 포인트 ${points(balance)}`)}<form id="block-battle-create-form" class="stack-form"><label>판돈<select name="preset" id="block-battle-stake-preset">${options}<option value="custom">직접 입력</option></select></label><label id="block-battle-custom-stake-wrap" class="hidden">직접 입력<input name="customStake" type="number" inputmode="numeric" min="1000" step="1000" placeholder="4,000 / 5,000 / ..."></label><button class="primary wide" type="submit">방 만들기</button></form>`, { type: 'blockBattleCreate' });
  requestAnimationFrame(() => {
    const preset = $('#block-battle-stake-preset');
    preset?.addEventListener('change', () => $('#block-battle-custom-stake-wrap')?.classList.toggle('hidden', preset.value !== 'custom'));
  });
}

function openCreateSichuan() {
  const balance = Math.max(0, Number(app.data?.dashboard?.pet?.stats?.points) || 0);
  const presets = app.data?.sichuan?.stakes?.length ? app.data.sichuan.stakes : [100, 500, 1000, 2000, 3000];
  const options = presets.map((stake) => `<option value="${stake}">${Number(stake).toLocaleString('ko-KR')}P</option>`).join('');
  openModal(`${modalHeader('사천성대전 방 만들기', `보유 포인트 ${points(balance)}`)}<form id="sichuan-create-form" class="stack-form"><label>판돈<select name="preset" id="sichuan-stake-preset">${options}<option value="custom">직접 입력</option></select></label><label id="sichuan-custom-stake-wrap" class="hidden">직접 입력<input name="customStake" type="number" inputmode="numeric" min="1000" step="1000" placeholder="4,000 / 5,000 / ..."></label><button class="primary wide" type="submit">방 만들기</button></form>`, { type: 'sichuanCreate' });
  requestAnimationFrame(() => {
    const preset = $('#sichuan-stake-preset');
    preset?.addEventListener('change', () => $('#sichuan-custom-stake-wrap')?.classList.toggle('hidden', preset.value !== 'custom'));
  });
}

function openCreateLegodoku() {
  const balance = Math.max(0, Number(app.data?.dashboard?.pet?.stats?.points) || 0);
  const presets = app.data?.legodoku?.stakes?.length ? app.data.legodoku.stakes : [100, 500, 1000, 2000, 3000];
  const options = presets.map((stake) => `<option value="${stake}">${Number(stake).toLocaleString('ko-KR')}P</option>`).join('');
  openModal(`${modalHeader('레고도쿠 방 만들기', `보유 포인트 ${points(balance)}`)}<form id="legodoku-create-form" class="stack-form"><label>판돈<select name="preset" id="legodoku-stake-preset">${options}<option value="custom">직접 입력</option></select></label><label id="legodoku-custom-stake-wrap" class="hidden">직접 입력<input name="customStake" type="number" inputmode="numeric" min="1000" step="1000" placeholder="4,000 / 5,000 / ..."></label><p class="helper">8×8 동일 문제 · 3분 · 오답 3회 패배 · 중~중상 난이도</p><button class="primary wide" type="submit">방 만들기</button></form>`, { type: 'legodokuCreate' });
  requestAnimationFrame(() => {
    const preset = $('#legodoku-stake-preset');
    preset?.addEventListener('change', () => $('#legodoku-custom-stake-wrap')?.classList.toggle('hidden', preset.value !== 'custom'));
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
    const pinControl = member.isSelf ? '' : `<button class="soft-button" data-action="admin-pin-reset" data-user-id="${esc(member.userId)}" data-name="${esc(member.displayName)}" type="button">🔑 PIN 변경</button>`;
    return `<article class="admin-member${member.accountLocked ? ' account-locked' : ''}" data-admin-user-id="${esc(member.userId)}"><div><strong>${esc(member.displayName)}${member.isSelf ? ' <span class="admin-self-badge">내 계정</span>' : ''}${member.workoutBadge ? ' <span class="admin-workout-label">💪 운동방</span>' : ''}${member.accountLocked ? ' <span class="tag warning">잠금</span>' : ''}</strong><small>${summary}</small></div><div class="admin-buttons">${workoutControl}${lockControl}${pinControl}${petControls}${member.isSelf ? '' : `<button class="danger-button admin-delete-account" data-action="admin-delete-account" data-user-id="${member.userId}" type="button">계정 삭제</button>`}</div></article>`;
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
    else if (entry.action === 'pin_reset') detail = `${esc(entry.adminDisplayName)} → ${esc(entry.targetDisplayName)} PIN 변경`;
    else if (entry.action === 'bung_force_cancel') detail = `${esc(entry.adminDisplayName)} → ${esc(entry.targetDisplayName)} 벙 강제취소`;
    else if (entry.action === 'workout_badge') detail = `${esc(entry.adminDisplayName)} → ${esc(entry.targetDisplayName)} ${esc(entry.detail || '💪 운동방 뱃지 변경')}`;
    else if (entry.action === 'state_reset') detail = `${esc(entry.adminDisplayName)} → ${esc(entry.targetDisplayName)} 상태 초기화`;
    else if (entry.action === 'omok_clear_ended') detail = `${esc(entry.adminDisplayName)} → 종료된 오목방 비우기`;
    else if (entry.action === 'block_battle_clear_ended') detail = `${esc(entry.adminDisplayName)} → 종료된 테트리스대전 방 비우기`;
    else if (entry.action === 'sichuan_clear_ended') detail = `${esc(entry.adminDisplayName)} → 종료된 사천성대전 방 비우기`;
    else if (entry.action === 'support_settings') detail = `${esc(entry.adminDisplayName)} → 후원 배너 설정 변경`;
    else if (entry.action === 'kick') detail = `${esc(entry.adminDisplayName)} → ${esc(entry.targetDisplayName)} 강퇴`;
    else detail = `${esc(entry.adminDisplayName)} → ${esc(entry.targetDisplayName)} ${Number(entry.delta) >= 0 ? '지급' : '회수'} ${points(Math.abs(Number(entry.delta) || 0))}`;
    const balance = entry.action === 'point_adjust' && Number.isFinite(Number(entry.before)) && Number.isFinite(Number(entry.after)) ? ` · ${points(entry.before)} → ${points(entry.after)}` : '';
    const extra = entry.detail ? ` · ${esc(entry.detail)}` : '';
    return `<article class="admin-audit"><div><strong>${detail}</strong><small>${dateText(entry.createdAt)}${balance}${extra}</small></div></article>`;
  }).join('');
  openModal(`${modalHeader('운영자 관리', `내 User ID: ${admin.userId}`)}<div class="admin-top"><button class="ghost wide" data-action="admin-refresh" type="button">회원 목록 새로고침</button><button class="soft-button wide" data-action="admin-clear-ended-omok" type="button">종료된 오목방 비우기 (${Number(admin.endedOmokRooms || 0)})</button><button class="soft-button wide" data-action="admin-clear-ended-block-battle" type="button">종료된 테트리스방 비우기 (${Number(admin.endedBlockBattleRooms || 0)})</button><button class="soft-button wide" data-action="admin-clear-ended-sichuan" type="button">종료된 사천성방 비우기 (${Number(admin.endedSichuanRooms || 0)})</button><button class="soft-button wide" data-action="admin-clear-ended-legodoku" type="button">종료된 레고도쿠방 비우기 (${Number(admin.endedLegodokuRooms || 0)})</button></div><h3>후원 설정</h3><p class="helper">상단 후원 배너와 후원 팝업에 같은 문구가 표시됩니다. 저장하면 접속 중인 사용자에게도 반영됩니다.</p><form id="admin-support-form" class="admin-support-form"><label>후원 문구<textarea id="admin-support-message" name="message" maxlength="${SUPPORT_MESSAGE_MAX_LENGTH}" required>${esc(support.message)}</textarea></label><div class="admin-support-row"><label class="admin-support-toggle"><input name="enabled" type="checkbox" ${support.enabled ? 'checked' : ''}>상단 후원 배너 표시</label><span id="admin-support-count" class="admin-support-count">${[...support.message].length}/${SUPPORT_MESSAGE_MAX_LENGTH}</span></div><button class="primary wide" type="submit">후원 설정 저장</button></form><h3>회원 관리</h3><p class="helper">회원별 계정을 잠그거나 해제하고, 새 PIN으로 변경하거나 💪 운동방 뱃지를 부여·해제할 수 있습니다. PIN 변경 시 해당 회원의 기존 로그인은 모두 종료됩니다. 계정 잠금 시 기존 로그인도 즉시 종료되며 잠금 해제 전까지 다시 로그인할 수 없습니다. 포인트+ / 포인트-로 회원 포인트를 직접 지급하거나 회수할 수 있습니다. 포인트는 0P 아래로 내려가지 않습니다. 계정 삭제는 회원가입 정보와 모든 세대 레고 데이터를 제거하며 복구할 수 없습니다.</p><div id="admin-member-list" class="admin-list">${members}</div><h3>벙 관리</h3><p class="helper">벙주가 마감을 하지 않은 벙을 정리하는 기능입니다. 강제취소하면 개설 포인트는 반환되지 않고 참가·개최 레고력과 오늘의 레고력도 지급되지 않습니다.</p><div class="admin-list">${activeBungs || '<div class="empty">강제취소할 진행 중 벙이 없습니다.</div>'}</div><h3>대전방 관리</h3><p class="helper">오목·테트리스대전·사천성대전·레고도쿠 모두 종료된 방만 비우며 대기·진행 중인 방과 이미 정산된 승패·포인트 기록은 건드리지 않습니다. 대기방은 10분 동안 시작되지 않으면 자동 정리됩니다.</p><h3>운영 기록</h3><p class="helper">후원 설정, 포인트 지급·회수, 운동방 뱃지 변경, 계정 잠금·해제, PIN 변경, 계정 삭제, 강퇴, 상태 초기화, 벙·오목·테트리스대전·사천성대전·레고도쿠 방 정리 기록을 최근 100개까지 표시합니다.</p><div class="admin-list">${auditLogs || '<div class="empty">아직 운영 기록이 없습니다.</div>'}</div>`, { type: 'admin' });
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
    if (result?.stopped || result?.abandoned) headline = '게임을 포기했습니다';
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
    headline = allClear ? 'ALL CLEAR!' : (result?.stopped || result?.abandoned) ? '게임을 포기했습니다' : '게임 종료';
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
  if (omokCountdown && omokRoom?.status === 'playing') {
    const seconds = omokRoom.phase === 'rps' ? Number(app.data.omok.rpsSeconds || 10) : omokRoom.phase === 'colorChoice' ? Number(app.data.omok.colorChoiceSeconds || 10) : Number(app.data.omok.turnSeconds || 30);
    const startedAt = omokRoom.phase === 'turn' ? omokRoom.turnStartedAt : omokRoom.phaseStartedAt;
    const deadline = new Date(startedAt).getTime() + seconds * 1000;
    const remaining = deadline - serverAlignedNow(app.data.omok.serverTime);
    omokCountdown.textContent = `${Math.max(0, Math.ceil(remaining / 1000))}초`;
    if (remaining <= 0 && Date.now() - app.omokLastRefreshAt > 1200) {
      app.omokLastRefreshAt = Date.now();
      loadBootstrap({ silent: true });
    }
  }
  const sichuanRoom = currentSichuanRoom();
  const sichuanCountdown = $('#sichuan-countdown');
  if (sichuanCountdown && sichuanRoom?.status === 'playing' && sichuanRoom.deadlineAt) {
    const remaining = new Date(sichuanRoom.deadlineAt).getTime() - sichuanServerNow();
    updateSichuanCountdown(sichuanRoom);
    if (remaining <= 0 && Date.now() - (app.sichuanLastRefreshAt || 0) > 1200) {
      app.sichuanLastRefreshAt = Date.now();
      loadBootstrap({ silent: true, renderMode: 'games-live' });
    }
  }
  const legodokuRoom = currentLegodokuRoom();
  const legodokuCountdown = $('#legodoku-countdown');
  if (legodokuCountdown && legodokuRoom?.status === 'playing' && legodokuRoom.deadlineAt) {
    const remaining = new Date(legodokuRoom.deadlineAt).getTime() - legodokuServerNow();
    updateLegodokuCountdown(legodokuRoom);
    if (remaining <= 0 && Date.now() - (app.legodokuLastRefreshAt || 0) > 1200) {
      app.legodokuLastRefreshAt = Date.now();
      loadBootstrap({ silent: true, renderMode: 'games-live' });
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
}

async function handleAction(button, event = null) {
  const action = button.dataset.action;
  const idValue = button.dataset.id;
  if (action === 'close-modal') {
    const activeSingle = app.modal?.type === 'mini' && app.modal?.gameId === 'tetrisSingle' ? app.data?.activeMiniChallenge : null;
    if (activeSingle?.gameId === 'tetrisSingle' && app.singleTetrisState && !app.singleTetrisState.ended) return abandonSingleTetris();
    const activeMine = app.modal?.type === 'mini' && app.modal?.gameId === 'minesweeper' ? app.data?.activeMiniChallenge : null;
    if (activeMine?.gameId === 'minesweeper') {
      if (activeMine.startedAt && !confirm('게임을 나가면 포기 처리됩니다. 나갈까요?')) return;
      abandonMinesweeperSilently();
    }
    return closeModal();
  }
  if (action === 'battle-result-confirm') return dismissBattleResult(button.dataset.game, idValue, button.dataset.key, button.dataset.role || 'none');
  if (action === 'single-tetris-control') { if (event && event.detail !== 0 && 'PointerEvent' in window) return; return singleTetrisApply(button.dataset.value); }
  if (action === 'single-tetris-abandon') return abandonSingleTetris();
  if (action === 'single-tetris-exit') { stopSingleTetrisTimers(); app.singleTetrisState=null; closeModal(); requestAnimationFrame(syncGameResultScrollLock); await loadBootstrap({silent:true}); return; }
  if (action === 'single-tetris-restart') { stopSingleTetrisTimers(); app.singleTetrisState=null; closeModal(); requestAnimationFrame(syncGameResultScrollLock); await loadBootstrap({silent:true}); const result=await perform('/api/minigames/start',{gameId:'tetrisSingle'},null,'POST',{toastResult:false}); if(result?.bootstrap?.activeMiniChallenge) openMiniGame(result.bootstrap.activeMiniChallenge); return; }
  if (action === 'home') return switchMainTab('home');
  if (action === 'notifications') return openNotifications();
  if (action === 'show-online') return openOnlineModal();
  if (action === 'body-guide') return openBodyGuide(Number(button.dataset.body));
  if (action === 'body-advancement') return openBodyAdvancement();
  if (action === 'select-body-advancement') return selectBodyAdvancement(button.dataset.value || idValue);
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
    const result = await perform('/api/minigames/start', { gameId: idValue }, null, 'POST', idValue === 'tetrisSingle'
      ? { toastResult: false }
      : { toastDuration: ['reaction', 'number'].includes(idValue) ? 700 : 3400, toastType: ['reaction', 'number'].includes(idValue) ? 'game-start' : null });
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
  if (action === 'abandon-mini') {
    const challenge = app.data.activeMiniChallenge ? structuredClone(app.data.activeMiniChallenge) : null;
    if (!challenge || !['apple', 'block'].includes(challenge.gameId)) return null;
    const gameName = challenge.gameId === 'apple' ? '사과게임' : '블록게임';
    if (!confirm(`${gameName}을 포기할까요? 현재까지 획득한 포인트는 정산되며 사용한 개인게임 횟수는 돌아오지 않습니다.`)) return null;
    const previousBest = Number(app.data?.dashboard?.pet?.records?.appleBestScore || 0);
    const result = await perform('/api/minigames/stop', { challengeId: challenge.id });
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
    if (window.matchMedia?.('(max-width: 700px), (pointer: coarse)')?.matches) requestAnimationFrame(syncAppleGameLayout);
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
  if (action === 'omok-rps') { const room = currentOmokRoom(); if (!room || room.viewerRole !== 'player' || room.status !== 'playing' || room.phase !== 'rps') return; return perform(`/api/omok/rooms/${encodeURIComponent(room.id)}/rps`, { choice: button.dataset.value }, null, 'POST', { toastDuration: 700, toastType: 'game-start', preserveControls: true }); }
  if (action === 'omok-color') { const room = currentOmokRoom(); if (!room || room.viewerRole !== 'player' || room.status !== 'playing' || room.phase !== 'colorChoice') return; return perform(`/api/omok/rooms/${encodeURIComponent(room.id)}/color`, { color: button.dataset.value }, null, 'POST', { preserveControls: true }); }
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
    // 포인터는 pointerdown에서 처리한다. Space keydown 직후 브라우저가 만드는 detail=0 click도
    // 같은 hardDrop을 한 번 더 넣지 않도록 짧게 차단한다.
    if (event && event.detail !== 0 && 'PointerEvent' in window) return;
    if (event?.detail === 0 && Date.now() <= Number(app.blockBattleKeyboardSuppressClickUntil || 0)) return;
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
  if (action === 'legodoku-create') return openCreateLegodoku();
  if (action === 'legodoku-open') { resetLegodokuPointer(); app.legodokuCellQueue = []; app.legodokuLobbyForced = false; app.legodokuRoomId = idValue; renderLegodokuRegion(); return; }
  if (action === 'legodoku-back') { resetLegodokuPointer(); app.legodokuCellQueue = []; app.legodokuRoomId = null; app.legodokuLobbyForced = true; renderLegodokuRegion(); return; }
  if (action === 'legodoku-join') {
    const result = await perform(`/api/legodoku/rooms/${encodeURIComponent(idValue)}/join`, {}, null, 'POST', { toastDuration: 900, toastType: 'game-start' });
    if (result?.ok) { app.legodokuLobbyForced = false; app.legodokuRoomId = result.roomId || idValue; app.legodokuMarksKey = ''; app.legodokuMarks = new Set(); renderLegodokuRegion(); }
    return result;
  }
  if (action === 'legodoku-spectate') {
    const result = await perform(`/api/legodoku/rooms/${encodeURIComponent(idValue)}/spectate`, {});
    if (result?.ok) { app.legodokuLobbyForced = false; app.legodokuRoomId = result.roomId || idValue; renderLegodokuRegion(); }
    return result;
  }
  if (action === 'legodoku-spectate-leave') {
    const result = await perform(`/api/legodoku/rooms/${encodeURIComponent(idValue)}/spectate/leave`, {});
    if (result?.ok) { app.legodokuRoomId = null; app.legodokuLobbyForced = true; renderLegodokuRegion(); }
    return result;
  }
  if (action === 'legodoku-leave') {
    const room = currentLegodokuRoom();
    if (room?.status === 'playing' && !confirm('게임 중 나가면 즉시 기권패 처리되고 판돈은 상대에게 지급됩니다. 나갈까요?')) return;
    const result = await perform(`/api/legodoku/rooms/${encodeURIComponent(idValue)}/leave`, {});
    if (result?.ok) { app.legodokuRoomId = null; app.legodokuLobbyForced = true; app.legodokuMarksKey = ''; app.legodokuMarks = new Set(); renderLegodokuRegion(); }
    return result;
  }
  if (action === 'legodoku-rematch') {
    const result = await perform(`/api/legodoku/rooms/${encodeURIComponent(idValue)}/rematch`, {}, null, 'POST', { toastDuration: 1000, toastType: 'game-start' });
    if (result?.ok) { app.legodokuLobbyForced = false; app.legodokuRoomId = idValue; app.legodokuMarksKey = ''; app.legodokuMarks = new Set(); renderLegodokuRegion(); }
    return result;
  }
  if (action === 'legodoku-reaction') {
    try { return await api(`/api/legodoku/rooms/${encodeURIComponent(idValue)}/reaction`, { method: 'POST', body: JSON.stringify({ type: button.dataset.reaction }) }); }
    catch (error) { toast(error.message, 'error'); return null; }
  }
  if (action === 'legodoku-cell') {
    if (event && Date.now() <= Number(app.legodokuPointerSuppressUntil || 0) && event.detail !== 0) return;
    return submitLegodokuCell(Number(button.dataset.index));
  }
  if (action === 'sichuan-create') return openCreateSichuan();
  if (action === 'sichuan-open') { resetSichuanInputQueue(); app.sichuanLobbyForced = false; app.sichuanRoomId = idValue; app.sichuanSelectedIndex = null; renderSichuanRegion(); return; }
  if (action === 'sichuan-back') { resetSichuanInputQueue(); app.sichuanRoomId = null; app.sichuanLobbyForced = true; app.sichuanSelectedIndex = null; renderSichuanRegion(); return; }
  if (action === 'sichuan-join') {
    const result = await perform(`/api/sichuan/rooms/${encodeURIComponent(idValue)}/join`, {}, null, 'POST', { toastDuration: 900, toastType: 'game-start' });
    if (result?.ok) { app.sichuanLobbyForced = false; app.sichuanRoomId = result.roomId || idValue; app.sichuanSelectedIndex = null; renderSichuanRegion(); }
    return result;
  }
  if (action === 'sichuan-spectate') {
    const result = await perform(`/api/sichuan/rooms/${encodeURIComponent(idValue)}/spectate`, {});
    if (result?.ok) { app.sichuanLobbyForced = false; app.sichuanRoomId = result.roomId || idValue; app.sichuanSelectedIndex = null; renderSichuanRegion(); }
    return result;
  }
  if (action === 'sichuan-spectate-leave') {
    const result = await perform(`/api/sichuan/rooms/${encodeURIComponent(idValue)}/spectate/leave`, {});
    if (result?.ok) { app.sichuanRoomId = null; app.sichuanLobbyForced = true; app.sichuanSelectedIndex = null; renderSichuanRegion(); }
    return result;
  }
  if (action === 'sichuan-leave') {
    const room = currentSichuanRoom();
    if (room?.status === 'playing' && !confirm('게임 중 나가면 즉시 기권패 처리되고 판돈은 상대에게 지급됩니다. 나갈까요?')) return;
    const result = await perform(`/api/sichuan/rooms/${encodeURIComponent(idValue)}/leave`, {});
    if (result?.ok) { app.sichuanRoomId = null; app.sichuanLobbyForced = true; app.sichuanSelectedIndex = null; renderSichuanRegion(); }
    return result;
  }
  if (action === 'sichuan-rematch') {
    app.sichuanSelectedIndex = null;
    const result = await perform(`/api/sichuan/rooms/${encodeURIComponent(idValue)}/rematch`, {}, null, 'POST', { toastDuration: 1000, toastType: 'game-start' });
    if (result?.ok) { app.sichuanLobbyForced = false; app.sichuanRoomId = idValue; renderSichuanRegion(); }
    return result;
  }
  if (action === 'sichuan-reaction') {
    try {
      return await api(`/api/sichuan/rooms/${encodeURIComponent(idValue)}/reaction`, {
        method: 'POST', body: JSON.stringify({ type: button.dataset.reaction })
      });
    } catch (error) { toast(error.message, 'error'); return null; }
  }
  if (action === 'sichuan-tile') {
    const room = currentSichuanRoom();
    if (!room || room.viewerRole !== 'player' || room.status !== 'playing') return;
    const index = Number(button.dataset.index);
    const self = room.players?.[room.selfPetId];
    const effectiveBoard = sichuanEffectiveBoard(self, room);
    const tileId = effectiveBoard[index];
    if (!Number.isInteger(index) || index < 0 || index >= 80 || !tileId) return;
    const first = app.sichuanSelectedIndex;
    if (!Number.isInteger(first)) {
      app.sichuanSelectedIndex = index;
      button.classList.add('selected');
      return;
    }
    if (first === index) {
      app.sichuanSelectedIndex = null;
      button.classList.remove('selected');
      return;
    }
    const firstTileId = effectiveBoard[first];
    if (!firstTileId || firstTileId !== tileId) {
      const firstCell = $(`.sichuan-cell[data-index="${first}"]`);
      firstCell?.classList.remove('selected');
      firstCell?.classList.add('invalid');
      button.classList.add('invalid');
      app.sichuanSelectedIndex = null;
      setTimeout(() => { firstCell?.classList.remove('invalid'); button.classList.remove('invalid'); }, 220);
      return;
    }
    if (!canConnectSichuanClient(effectiveBoard, first, index)) {
      const firstCell = $(`.sichuan-cell[data-index="${first}"]`);
      firstCell?.classList.remove('selected');
      app.sichuanSelectedIndex = null;
      flashSichuanPair([first, index]);
      return;
    }
    button.classList.add('selected');
    return submitSichuanPair(room, first, index);
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
  if (action === 'admin-pin-reset') {
    const targetUserId = String(button.dataset.userId || '');
    if (!targetUserId) return;
    const targetName = String(button.dataset.name || '이 회원');
    const raw = prompt(`${targetName}의 새 PIN을 입력하세요.\n숫자 4~12자리`, '');
    if (raw === null) return;
    const pin = String(raw).trim();
    if (!/^\d{4,12}$/.test(pin)) {
      toast('PIN은 숫자 4~12자리로 입력해주세요.', 'error');
      return;
    }
    if (!confirm(`${targetName}의 PIN을 변경할까요?\n기존 로그인은 모두 종료됩니다.`)) return;
    return perform('/api/admin/pin-reset', { targetUserId, pin });
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
  if (action === 'admin-clear-ended-sichuan') return perform('/api/admin/sichuan/clear-ended', {});
  if (action === 'admin-clear-ended-legodoku') return perform('/api/admin/legodoku/clear-ended', {});
}

function switchMainTab(tabName, { smooth = false } = {}) {
  if (!MAIN_TABS.includes(tabName)) return;
  const changed = app.tab !== tabName;
  if (app.modal) closeModal();

  // 실시간 방 상태가 이미 도착했다면 requestAnimationFrame을 기다리지 않는다.
  // 같은 게임 탭을 다시 누른 경우에도 직전 로비 DOM이 남아 있으면 즉시 교체한다.
  const realtimeGameOpen = tabName === 'games' && Boolean(app.data && (currentOmokRoom() || currentBlockBattleRoom() || currentSichuanRoom()));

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
  if (!button || app.singleTetrisModalActive) return;
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
  if (button) {
    const action = button.dataset.action;
    if ((action === 'omok-rps' || action === 'omok-color') && event.detail !== 0 && Date.now() <= app.omokSetupPointerSuppressUntil) {
      event.preventDefault();
      return;
    }
    if (action === 'sichuan-tile' && event.detail !== 0 && Date.now() <= app.sichuanPointerSuppressUntil) {
      event.preventDefault();
      return;
    }
    handleAction(button, event);
  }
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
  const legodokuCell = event.target.closest?.('[data-action="legodoku-cell"]');
  if (legodokuCell && !legodokuCell.disabled && event.isPrimary !== false && (event.pointerType !== 'mouse' || event.button === 0)) {
    const room = currentLegodokuRoom();
    if (room?.viewerRole === 'player' && room.status === 'playing') {
      event.preventDefault();
      const index = Number(legodokuCell.dataset.index);
      syncLegodokuMarks(room);
      app.legodokuPointer = {
        pointerId: event.pointerId,
        roomId: room.id,
        matchId: room.matchId,
        startIndex: index,
        lastIndex: index,
        startX: Number(event.clientX || 0),
        startY: Number(event.clientY || 0),
        dragging: false,
        mode: app.legodokuMarks.has(index) ? 'erase' : 'mark'
      };
      try { legodokuCell.setPointerCapture?.(event.pointerId); } catch { /* unsupported */ }
      return;
    }
  }
  const sichuanTileButton = event.target.closest?.('[data-action="sichuan-tile"]');
  if (sichuanTileButton && event.isPrimary !== false && event.pointerType === 'mouse' && event.button === 0) {
    // PC mouse input is handled on pointerdown instead of waiting for pointerup/click.
    // The following synthetic click is suppressed so one physical press can never select twice.
    event.preventDefault();
    app.sichuanPointerSuppressUntil = Date.now() + 800;
    handleAction(sichuanTileButton, event);
    return;
  }
  const omokSetupButton = event.target.closest?.('[data-action="omok-rps"], [data-action="omok-color"]');
  if (omokSetupButton && event.isPrimary !== false && (event.pointerType !== 'mouse' || event.button === 0)) {
    // 모바일에서 버튼 DOM이 실시간 갱신으로 pointerup/click 전에 교체돼도 선택이 씹히지 않게
    // 가장 빠른 pointerdown 한 경로에서 즉시 전송하고 뒤따르는 합성 click은 한 번만 억제한다.
    event.preventDefault();
    app.omokSetupPointerSuppressUntil = Date.now() + 1200;
    handleAction(omokSetupButton, event);
    return;
  }
  const singleControl = event.target.closest?.('[data-action="single-tetris-control"]');
  if (singleControl && event.isPrimary !== false && (event.pointerType !== 'mouse' || event.button === 0)) {
    event.preventDefault();
    try { singleControl.setPointerCapture?.(event.pointerId); } catch { /* unsupported */ }
    startSingleTetrisHold(singleControl.dataset.value, { sourceType:'pointer', sourceId:event.pointerId, repeatDelay:BLOCK_BATTLE_POINTER_REPEAT_DELAY_MS });
    return;
  }
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
document.addEventListener('pointermove', (event) => {
  const pointer = app.legodokuPointer;
  if (!pointer || pointer.pointerId !== event.pointerId) return;
  const room = currentLegodokuRoom();
  if (!room || room.id !== pointer.roomId || room.matchId !== pointer.matchId || room.status !== 'playing') { resetLegodokuPointer(); return; }
  const dx = Number(event.clientX || 0) - pointer.startX;
  const dy = Number(event.clientY || 0) - pointer.startY;
  if (!pointer.dragging && Math.hypot(dx, dy) >= 8) {
    pointer.dragging = true;
    legodokuSetMark(pointer.startIndex, pointer.mode);
  }
  if (!pointer.dragging) return;
  event.preventDefault();
  const hit = document.elementFromPoint(Number(event.clientX || 0), Number(event.clientY || 0))?.closest?.('.legodoku-cell[data-index]');
  const index = Number(hit?.dataset?.index);
  if (!hit || !Number.isInteger(index) || index === pointer.lastIndex) return;
  pointer.lastIndex = index;
  legodokuSetMark(index, pointer.mode);
}, { passive: false });

document.addEventListener('pointerup', (event) => {
  stopSingleTetrisHold('pointer', event.pointerId);
  stopBlockBattleHold('pointer', event.pointerId);
  const pointer = app.legodokuPointer;
  if (!pointer || pointer.pointerId !== event.pointerId) return;
  event.preventDefault();
  app.legodokuPointerSuppressUntil = Date.now() + 800;
  if (pointer.dragging) persistLegodokuMarks();
  else submitLegodokuCell(pointer.startIndex);
  resetLegodokuPointer();
  if (pointer.dragging) patchLegodokuLiveRoom(currentLegodokuRoom());
}, { passive: false });
document.addEventListener('pointercancel', (event) => { stopSingleTetrisHold('pointer', event.pointerId); stopBlockBattleHold('pointer', event.pointerId); if (app.legodokuPointer?.pointerId === event.pointerId) { persistLegodokuMarks(); resetLegodokuPointer(); } }, { passive: true });
document.addEventListener('lostpointercapture', (event) => { stopSingleTetrisHold('pointer', event.pointerId); stopBlockBattleHold('pointer', event.pointerId); }, { passive: true });
window.addEventListener('blur', () => { stopSingleTetrisHold(); stopBlockBattleHold(); persistLegodokuMarks(); resetLegodokuPointer(); });

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
  if (form.id === 'legodoku-create-form') {
    const preset = String(data.preset ?? '100');
    const stakePoints = preset === 'custom' ? Number(data.customStake) : Number(preset);
    const result = await perform('/api/legodoku/rooms', { stakePoints });
    if (result?.ok) {
      app.legodokuLobbyForced = false;
      app.legodokuRoomId = result.roomId;
      app.legodokuMarksKey = '';
      app.legodokuMarks = new Set();
      closeModal();
      markTabDirty('games');
      render();
    }
    return;
  }
  if (form.id === 'sichuan-create-form') {
    const preset = String(data.preset ?? '100');
    const stakePoints = preset === 'custom' ? Number(data.customStake) : Number(preset);
    const result = await perform('/api/sichuan/rooms', { stakePoints });
    if (result?.ok) {
      app.sichuanLobbyForced = false;
      app.sichuanRoomId = result.roomId;
      app.sichuanSelectedIndex = null;
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

function tetrisKeyboardAction(event) {
  const byKey = ({ ArrowLeft:'left', ArrowRight:'right', ArrowUp:'rotate', ArrowDown:'softDrop', ' ':'hardDrop', Spacebar:'hardDrop' })[event?.key];
  if (byKey) return byKey;
  // 일부 WebView/PWA/키보드 조합은 Space에서 key 값이 비정상이어도 code='Space'는 유지한다.
  return ({ ArrowLeft:'left', ArrowRight:'right', ArrowUp:'rotate', ArrowDown:'softDrop', Space:'hardDrop' })[event?.code] || null;
}

document.addEventListener('keydown', (event) => {
  if (app.modal?.type === 'mini' && app.modal?.gameId === 'tetrisSingle' && app.singleTetrisState && !app.singleTetrisState.ended) {
    if (event.key === 'Escape') { event.preventDefault(); abandonSingleTetris(); return; }
    if (event.ctrlKey || event.altKey || event.metaKey || event.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    const action = tetrisKeyboardAction(event);
    if (!action) return;
    event.preventDefault();
    if (event.repeat) return;
    startSingleTetrisHold(action,{sourceType:'keyboard',sourceId:event.code||event.key,repeatDelay:BLOCK_BATTLE_KEYBOARD_REPEAT_DELAY_MS});
    return;
  }
  if (event.key === 'Escape' && app.modal) {
    if (app.modal?.type === 'mini' && app.modal?.gameId === 'minesweeper' && app.data?.activeMiniChallenge?.gameId === 'minesweeper') {
      const challenge = app.data.activeMiniChallenge;
      if (challenge.startedAt && !confirm('게임을 나가면 포기 처리됩니다. 나갈까요?')) return;
      abandonMinesweeperSilently();
    }
    closeModal();
    return;
  }
  if (document.querySelector('.common-game-result-overlay')) return;
  if (app.modal || app.tab !== 'games' || event.ctrlKey || event.altKey || event.metaKey || event.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
  const room = currentBlockBattleRoom();
  if (!room || room.viewerRole !== 'player' || room.status !== 'playing') return;
  const action = tetrisKeyboardAction(event);
  if (!action) return;
  event.preventDefault();
  if (event.repeat) return;
  if (action === 'hardDrop') app.blockBattleKeyboardSuppressClickUntil = Date.now() + 450;
  startBlockBattleHold(action, {
    sourceType: 'keyboard', sourceId: event.code || event.key,
    repeatDelay: BLOCK_BATTLE_KEYBOARD_REPEAT_DELAY_MS
  });
});
document.addEventListener('keyup', (event) => {
  stopSingleTetrisHold('keyboard', event.code || event.key);
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
    syncSingleTetrisLayout();
  });
}
window.visualViewport?.addEventListener('resize', syncGameViewportLayout);
window.visualViewport?.addEventListener('scroll', syncGameViewportLayout);
window.addEventListener('resize', syncGameViewportLayout);
window.addEventListener('orientationchange', syncGameViewportLayout);
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
    // 백그라운드 동안 서버 fallback이 진행됐을 수 있으므로 복귀 시에만 visual을 버리고 authoritative 상태로 재시작한다.
    app.blockBattleVisualSelf = null;
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
navigator.serviceWorker?.register?.('/sw.js?v=6101231')?.catch(() => {});
