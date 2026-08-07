import { DurableJsonStore } from './durable-store.js';
import {
  getOrCreateSecret, hashPin, verifyPin, createToken, verifyToken,
  normalizeNickname, validateNickname, validatePin
} from './auth-worker.js';
import { id } from './lib/ids.js';
import {
  FOODS, MINI_GAMES, FISHING_REWARDS, ACTIONS_PER_DAY, ACTION_COOLDOWN_MINUTES,
  MINI_GAMES_PER_DAY, FISHING_PER_DAY, GAME_DAY_HOURS, GAME_DAY_RESET_HOURS_KST, BODY_STAGES, STATUS_MESSAGE_MAX_LENGTH,
  BREAK_WARNING_MAX, BREAK_INACTIVITY_HOURS, BUNG_MIN_STAKE, BUNG_MIN_PLAYERS, BUNG_MAX_PLAYERS,
  ODD_EVEN_MIN_STAKE, ODD_EVEN_STAKE_STEP, ODD_EVEN_PAYOUT_PERCENT
} from './game/constants.js';
import {
  createPet, privateDashboard, publicProfile, visibleBungs, recentEndedBungs, listRelationships,
  pendingRequestsFor, currentPetForUser, applyDailyReset, applyHungerPenalty,
  applyInactivityConsequence, markPetActive, nextInactivityCheckAt,
  workAction, restAction, exerciseAction, eatAction, updateStatusMessage,
  createBung, joinBung, leaveBung, startBung, finishBung,
  socialAction, addNotification, addPublicEvent, pokePet, rankingsView,
  refreshTopPokeNews, startMiniGame, finishMiniGame, stopMiniGame, selectAppleGame, settleExpiredMiniGames,
  startFishing, claimFishing, publishFishingNews,
  ensurePetSchema, endLifeAndRestart, restartBrokenPet, nextHungerPenaltyAt
} from './game/engine.js';
import {
  advanceLiarGame, consumeLiarPublicEvent, forceEndLiarGame, liarAddChat,
  deleteLiarChat, liarGameView, liarGuess, liarJoin, liarKick, liarLeave,
  liarNextAlarmAt, liarReset, liarSetConnected, liarSpectate, liarStopSpectating, liarStart, liarToggleReady,
  liarUpdateSettings, liarVote, LIAR_BET_OPTIONS, LIAR_DISCUSSION_OPTIONS, LIAR_PLAYER_OPTIONS
} from './game/liar-game.js';
import {
  claimTerritory, processTerritorySeason, territoryNextAlarmAt, territoryView, clearPetTerritory
} from './game/territory.js';
import {
  createOmokRoom, joinOmokRoom, leaveOmokRoom, leaveOmokSpectator, omokNextAlarmAt, omokSetConnected, omokView,
  playOmokMove, processOmokTimers, removePetFromOmok, requestOmokRematch, spectateOmokRoom, OMOK_TURN_SECONDS
} from './game/omok.js';

const APP_VERSION = '6.4.5-final';
const ADMIN_POINT_ADJUST_MAX = 1_000_000_000;
const MAX_BODY_BYTES = 200_000;

function securityHeaders(headers = new Headers()) {
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'same-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' wss:; base-uri 'self'; form-action 'self'");
  return headers;
}

function jsonResponse(data, status = 200) {
  const headers = securityHeaders(new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }));
  return new Response(JSON.stringify(data), { status, headers });
}

function errorResponse(message, status = 400) {
  return jsonResponse({ ok: false, message }, status);
}

async function readJson(request) {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > MAX_BODY_BYTES) throw new Error('요청 내용이 너무 큽니다.');
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) throw new Error('요청 내용이 너무 큽니다.');
  if (!text) return {};
  try { return JSON.parse(text); } catch { throw new Error('JSON 형식이 올바르지 않습니다.'); }
}

function matchPath(pathname, pattern) {
  const names = [];
  const regex = new RegExp(`^${pattern.replace(/:[^/]+/g, (segment) => { names.push(segment.slice(1)); return '([^/]+)'; })}$`);
  const match = pathname.match(regex);
  return match ? Object.fromEntries(names.map((name, index) => [name, decodeURIComponent(match[index + 1])])) : null;
}

function extractToken(request, url) {
  const header = request.headers.get('authorization');
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return url.searchParams.get('token');
}

function requestIp(request) {
  return request.headers.get('CF-Connecting-IP') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

export class LegoGameRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.store = new DurableJsonStore(ctx.storage);
    this.secret = null;
    this.authAttempts = new Map();
    this.operationQueue = Promise.resolve();
    this.ctx.blockConcurrencyWhile(async () => {
      this.secret = await getOrCreateSecret(this.ctx.storage);
      await this.store.load();
    });
  }

  runExclusive(task) {
    const run = this.operationQueue.then(task, task);
    this.operationQueue = run.catch(() => undefined);
    return run;
  }

  async fetch(request) {
    return this.runExclusive(() => this.handleFetch(request));
  }

  configuredAdminIds() {
    return new Set(String(this.env?.ADMIN_USER_IDS ?? '').split(',').map((value) => value.trim()).filter(Boolean));
  }

  isAdminUser(user) {
    return Boolean(user && this.configuredAdminIds().has(user.id));
  }

  appendAdminAudit(state, user, entry, date = new Date()) {
    state.adminAuditLogs = Array.isArray(state.adminAuditLogs) ? state.adminAuditLogs : [];
    const adminPet = user ? state.pets?.[user.currentPetId] : null;
    state.adminAuditLogs.unshift({
      id: id('adminlog'),
      action: entry.action,
      adminUserId: user?.id ?? '',
      adminDisplayName: adminPet?.displayName || user?.nickname || '운영자',
      targetUserId: entry.targetUserId ?? '',
      targetPetId: entry.targetPetId ?? null,
      targetDisplayName: entry.targetDisplayName || '회원',
      delta: Number.isSafeInteger(entry.delta) ? entry.delta : null,
      before: Number.isSafeInteger(entry.before) ? entry.before : null,
      after: Number.isSafeInteger(entry.after) ? entry.after : null,
      createdAt: date.toISOString()
    });
    state.adminAuditLogs = state.adminAuditLogs.slice(0, 200);
  }

  adminView(state, user) {
    const isAdmin = this.isAdminUser(user);
    return {
      isAdmin,
      userId: user?.id ?? null,
      members: isAdmin ? Object.values(state.users).map((member) => {
        // 회원 목록은 현재 가입 계정(state.users)을 기준으로 만든다.
        // 과거에 같은 닉네임의 계정이 삭제됐더라도 새 userId로 재가입한 계정은 반드시 다시 표시한다.
        const ownedAlivePets = Object.values(state.pets ?? {})
          .filter((candidate) => candidate?.userId === member.id && candidate?.alive)
          .sort((a, b) => new Date(b.createdAt ?? 0) - new Date(a.createdAt ?? 0));
        const currentPet = state.pets?.[member.currentPetId];
        const pet = currentPet?.alive && currentPet.userId === member.id ? currentPet : (ownedAlivePets[0] ?? null);
        if (!pet) {
          return {
            userId: member.id,
            petId: null,
            displayName: `${member.nickname} (레고 없음)`,
            warnings: 0,
            warningTotal: 0,
            breakWarnings: 0,
            broken: false,
            points: 0,
            level: 0,
            online: this.isOnline(state, member.id),
            isSelf: member.id === user?.id,
            hasActivePet: false,
            createdAt: member.createdAt ?? null
          };
        }
        ensurePetSchema(pet);
        const dashboard = pet.id === member.currentPetId ? privateDashboard(state, member.id) : null;
        return {
          userId: member.id,
          petId: pet.id,
          displayName: pet.displayName,
          warnings: pet.warnings,
          warningTotal: pet.records?.warnings ?? 0,
          breakWarnings: pet.integrity?.breakWarnings ?? 0,
          broken: Boolean(pet.integrity?.broken),
          points: pet.stats.points,
          level: dashboard?.pet?.stats?.level ?? pet.records?.maxLevel ?? 1,
          online: this.isOnline(state, member.id),
          isSelf: member.id === user?.id,
          hasActivePet: true,
          createdAt: member.createdAt ?? null
        };
      }).sort((a, b) => a.displayName.localeCompare(b.displayName, 'ko') || String(a.userId).localeCompare(String(b.userId))) : [],
      liarChats: isAdmin ? (state.liarGame?.messages ?? []).filter((message) => message.type === 'chat').slice(-100).reverse().map((message) => ({ id: message.id, displayName: message.displayName, text: message.text, createdAt: message.createdAt })) : [],
      auditLogs: isAdmin ? (state.adminAuditLogs ?? []).slice(0, 100).map((entry) => ({ ...entry })) : []
    };
  }

  processPendingNews(state) {
    const event = consumeLiarPublicEvent(state);
    if (!event?.text) return false;
    addPublicEvent(state, event.text, 'liar', event.petIds ?? []);
    return true;
  }

  disconnectUserSockets(userId) {
    for (const socket of this.ctx.getWebSockets()) {
      try {
        if (socket.deserializeAttachment()?.userId !== userId) continue;
        socket.close(4001, 'account deleted');
      } catch { /* ignore */ }
    }
  }

  deleteUserAccountState(state, targetUserId, date = new Date()) {
    const targetUser = state.users?.[targetUserId];
    if (!targetUser) return { ok: false, message: '삭제할 회원 계정을 찾을 수 없습니다.' };
    const targetPets = Object.values(state.pets ?? {}).filter((pet) => pet?.userId === targetUserId);
    const petIds = new Set(targetPets.map((pet) => pet.id));
    const activeLiarPlayer = [...petIds].some((petId) => Boolean(state.liarGame?.players?.[petId]));
    if (activeLiarPlayer && !['waiting', 'game_over'].includes(state.liarGame?.phase)) forceEndLiarGame(state, date);

    for (const pet of targetPets) {
      if (pet.partnerPetId) {
        const partner = state.pets?.[pet.partnerPetId];
        if (partner?.alive && partner.partnerPetId === pet.id) {
          partner.partnerPetId = null;
          partner.coupleStartedAt = null;
          addNotification(state, partner.userId, `${pet.displayName} 계정이 운영자에 의해 삭제되어 커플 관계가 종료되었습니다.`, 'relationship', {}, date);
        }
      }
      liarSetConnected(state, pet.id, false, date);
      if (state.liarGame?.spectators?.[pet.id]) delete state.liarGame.spectators[pet.id];
      removePetFromOmok(state, pet.id, date);
      clearPetTerritory(state, pet.id);
    }

    for (const [requestId, request] of Object.entries(state.requests ?? {})) {
      if (petIds.has(request?.fromPetId) || petIds.has(request?.toPetId)) delete state.requests[requestId];
    }
    for (const [relationId, relation] of Object.entries(state.relationships ?? {})) {
      if (relation?.petIds?.some((petId) => petIds.has(petId))) delete state.relationships[relationId];
    }
    for (const [pairId, pair] of Object.entries(state.pokes ?? {})) {
      if (pair?.petIds?.some((petId) => petIds.has(petId))) delete state.pokes[pairId];
    }
    for (const [challengeId, challenge] of Object.entries(state.miniGameChallenges ?? {})) {
      if (petIds.has(challenge?.petId)) delete state.miniGameChallenges[challengeId];
    }
    for (const bung of Object.values(state.bungs ?? {})) {
      if (!bung || typeof bung !== 'object') continue;
      for (const petId of petIds) if (bung.attendees?.[petId]) delete bung.attendees[petId];
      if (petIds.has(bung.hostPetId) && ['open', 'live'].includes(bung.status)) {
        bung.status = 'cancelled';
        bung.endedAt = date.toISOString();
      }
    }
    if (state.liarGame?.messages) state.liarGame.messages = state.liarGame.messages.filter((message) => !petIds.has(message?.petId));
    state.publicEvents = Array.isArray(state.publicEvents)
      ? state.publicEvents.filter((event) => !event?.petIds?.some((petId) => petIds.has(petId)))
      : [];
    for (const member of Object.values(state.users ?? {})) {
      if (!member || member.id === targetUserId || !Array.isArray(member.notifications)) continue;
      member.notifications = member.notifications.filter((notification) => !petIds.has(notification?.payload?.petId));
    }
    for (const [operationId, operation] of Object.entries(state.adminPointOperations ?? {})) {
      if (operation?.adminUserId === targetUserId || petIds.has(operation?.targetPetId)) delete state.adminPointOperations[operationId];
    }
    for (const petId of petIds) delete state.pets[petId];
    delete state.users[targetUserId];
    refreshTopPokeNews(state, date);
    return { ok: true, nickname: targetUser.nickname, removedPetCount: petIds.size };
  }

  async processTimeState(state, date = new Date()) {
    let changed = false;
    for (const userId of Object.keys(state.users ?? {})) {
      const pet = currentPetForUser(state, userId);
      if (!pet?.alive) continue;
      ensurePetSchema(pet, date);
      const reset = applyDailyReset(pet, date, state);
      const hunger = applyHungerPenalty(pet, date);
      const news = publishFishingNews(state, pet, date);
      const inactivity = applyInactivityConsequence(state, pet, date);
      if (reset.changed || hunger.changed || news || inactivity.changed) changed = true;
    }
    const expiredMini = settleExpiredMiniGames(state, date);
    const territory = processTerritorySeason(state, date);
    const liar = advanceLiarGame(state, date);
    const omok = processOmokTimers(state, date);
    const liarNews = this.processPendingNews(state);
    if (expiredMini.changed || territory.changed || liar.changed || omok.changed || liarNews) changed = true;
    const pokeNewsBefore = JSON.stringify((state.publicEvents ?? []).find((event) => event.type === 'poke-top') ?? null);
    refreshTopPokeNews(state, date);
    const pokeNewsAfter = JSON.stringify((state.publicEvents ?? []).find((event) => event.type === 'poke-top') ?? null);
    if (pokeNewsBefore !== pokeNewsAfter) changed = true;
    return { changed };
  }

  async scheduleNextAlarm(state) {
    const storage = this.ctx?.storage;
    if (!storage || typeof storage.setAlarm !== 'function') return;
    const candidates = [];
    const liarAt = liarNextAlarmAt(state);
    const territoryAt = territoryNextAlarmAt(state);
    const omokAt = omokNextAlarmAt(state);
    if (liarAt) candidates.push(new Date(liarAt).getTime());
    if (territoryAt) candidates.push(new Date(territoryAt).getTime());
    if (omokAt) candidates.push(new Date(omokAt).getTime());
    for (const challenge of Object.values(state.miniGameChallenges ?? {})) {
      if (challenge?.gameId === 'apple' && !challenge.completed && challenge.expiresAt) candidates.push(new Date(challenge.expiresAt).getTime());
    }
    for (const pet of Object.values(state.pets ?? {})) {
      if (!pet?.alive) continue;
      ensurePetSchema(pet);
      if (pet.daily.fishing?.readyAt) candidates.push(new Date(pet.daily.fishing.readyAt).getTime());
      const hungerAt = nextHungerPenaltyAt(pet);
      if (hungerAt) candidates.push(new Date(hungerAt).getTime());
      const inactivityAt = nextInactivityCheckAt(pet);
      if (inactivityAt) candidates.push(new Date(inactivityAt).getTime());
    }
    const valid = candidates.filter((value) => Number.isFinite(value) && value > 0);
    if (!valid.length) {
      if (typeof storage.deleteAlarm === 'function') await storage.deleteAlarm();
      return;
    }
    await storage.setAlarm(Math.max(Math.min(...valid), Date.now() + 1_000));
  }

  async authenticate(request, url, state) {
    const payload = await verifyToken(extractToken(request, url), this.secret);
    if (!payload) return null;
    const user = state.users[payload.uid];
    if (!user || (user.sessionVersion ?? 1) !== payload.sv) return null;
    return { userId: user.id };
  }

  isAuthRateLimited(request) {
    const key = requestIp(request);
    const now = Date.now();
    const entry = this.authAttempts.get(key) ?? { count: 0, resetAt: now + 10 * 60_000 };
    if (entry.resetAt < now) { entry.count = 0; entry.resetAt = now + 10 * 60_000; }
    entry.count += 1;
    this.authAttempts.set(key, entry);
    return entry.count > 40;
  }

  websocketUserIds() {
    const ids = new Set();
    for (const socket of this.ctx.getWebSockets()) {
      try { const attachment = socket.deserializeAttachment(); if (attachment?.userId) ids.add(attachment.userId); } catch { /* ignore */ }
    }
    return ids;
  }

  onlineUserIds(state) {
    const ids = this.websocketUserIds();
    const activeAfter = Date.now() - 2 * 60_000;
    for (const user of Object.values(state.users ?? {})) if (user.lastSeenAt && new Date(user.lastSeenAt).getTime() >= activeAfter) ids.add(user.id);
    return ids;
  }

  isOnline(state, userId) {
    return this.onlineUserIds(state).has(userId);
  }

  onlineProfiles(state, viewerPetId) {
    return [...this.onlineUserIds(state)].map((userId) => state.users[userId]).filter(Boolean)
      .map((user) => publicProfile(state, user.currentPetId, viewerPetId, true)).filter(Boolean)
      .sort((a, b) => a.displayName.localeCompare(b.displayName, 'ko'));
  }

  bootstrapFromState(state, userId) {
    const user = state.users[userId];
    const pet = user ? state.pets[user.currentPetId] : null;
    if (!user || !pet) return null;
    const online = this.onlineProfiles(state, pet.id);
    return {
      revision: Math.max(0, Math.floor(Number(state.meta?.revision) || 0)),
      serverTime: Date.now(),
      dashboard: privateDashboard(state, userId),
      activeMiniChallenge: (() => {
        const challenge = Object.values(state.miniGameChallenges ?? {}).find((item) => item.petId === pet.id && !item.completed && new Date(item.expiresAt).getTime() > Date.now());
        if (!challenge) return null;
        const view = { ...challenge };
        delete view.target;
        delete view.appleProcessedRequestIds;
        return view;
      })(),
      selfPublicProfile: publicProfile(state, pet.id, pet.id, true),
      online,
      onlineCount: online.length,
      bungs: visibleBungs(state, pet.id),
      recentBungs: recentEndedBungs(state, 10),
      relationships: listRelationships(state, pet.id),
      requests: pendingRequestsFor(state, pet.id),
      notifications: (user.notifications ?? []).slice(0, 40),
      publicEvents: (state.publicEvents ?? []).slice(0, 10),
      rankings: rankingsView(state, pet.id),
      liarGame: liarGameView(state, pet.id),
      omok: omokView(state, pet.id),
      territory: territoryView(state, pet.id),
      admin: this.adminView(state, user),
      history: Object.values(state.pets).filter((item) => item.userId === userId && !item.alive)
        .sort((a, b) => new Date(b.endedAt) - new Date(a.endedAt))
        .map((item) => ({ id: item.id, displayName: item.displayName, generation: item.generation, createdAt: item.createdAt, endedAt: item.endedAt, endReason: item.endReason, endDetail: item.endDetail, stats: item.stats, records: item.records })),
      catalog: {
        foods: Object.values(FOODS), miniGames: Object.values(MINI_GAMES), fishingRewards: FISHING_REWARDS.map(({ id: rewardId, label, reward }) => ({ id: rewardId, label, reward })),
        actionsPerDay: ACTIONS_PER_DAY, actionCooldownMinutes: ACTION_COOLDOWN_MINUTES,
        miniGamesPerDay: MINI_GAMES_PER_DAY, fishingPerDay: FISHING_PER_DAY,
        gameDayHours: GAME_DAY_HOURS, gameDayResetHoursKst: [...GAME_DAY_RESET_HOURS_KST], breakWarningMax: BREAK_WARNING_MAX, breakInactivityHours: BREAK_INACTIVITY_HOURS,
        bungMinStake: BUNG_MIN_STAKE, bungMinPlayers: BUNG_MIN_PLAYERS, bungMaxPlayers: BUNG_MAX_PLAYERS,
        oddEven: {
          minStake: ODD_EVEN_MIN_STAKE, stakeStep: ODD_EVEN_STAKE_STEP,
          payoutPercent: { ...ODD_EVEN_PAYOUT_PERCENT }
        },
        liarBetOptions: LIAR_BET_OPTIONS, liarDiscussionOptions: LIAR_DISCUSSION_OPTIONS, liarPlayerOptions: LIAR_PLAYER_OPTIONS,
        omok: { maxRooms: 3, turnSeconds: OMOK_TURN_SECONDS, stakes: [100, 500, 1000, 2000, 3000, 4000, 5000] },
        bodyStages: BODY_STAGES.map((stage) => ({ ...stage, max: Number.isFinite(stage.max) ? stage.max : null })),
        statusMessageMaxLength: STATUS_MESSAGE_MAX_LENGTH
      }
    };
  }

  async mutateForUser(state, userId, mutator, date = new Date()) {
    const user = state.users[userId];
    const pet = user ? state.pets[user.currentPetId] : null;
    if (!user || !pet) return { ok: false, status: 401, message: '사용자를 찾을 수 없습니다.' };
    await this.processTimeState(state, date);
    const current = currentPetForUser(state, userId);
    if (current?.integrity?.broken) {
      user.lastSeenAt = date.toISOString();
      markPetActive(current, date);
      await this.store.save(state);
      await this.scheduleNextAlarm(state);
      return { ok: false, status: 409, message: '레고가 부숴졌습니다. 다음 세대 레고로 다시 시작해주세요.', bootstrap: this.bootstrapFromState(state, userId) };
    }
    user.lastSeenAt = date.toISOString();
    markPetActive(current, date);
    const result = mutator(state, user, current, date) ?? { ok: true };
    await this.processTimeState(state, date);
    await this.store.save(state);
    await this.scheduleNextAlarm(state);
    return { ...result, bootstrap: this.bootstrapFromState(state, userId) };
  }

  broadcastRefresh(reason = 'update', userIds = null) {
    const target = userIds ? new Set(userIds) : null;
    const payload = JSON.stringify({ type: 'refresh', reason, at: Date.now() });
    for (const socket of this.ctx.getWebSockets()) {
      try { const attachment = socket.deserializeAttachment(); if (!target || target.has(attachment?.userId)) socket.send(payload); } catch { /* ignore */ }
    }
  }

  async acceptWebSocket(request, url, state) {
    const auth = await this.authenticate(request, url, state);
    if (!auth) return errorResponse('로그인이 필요합니다.', 401);
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return errorResponse('WebSocket 연결이 필요합니다.', 426);
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ userId: auth.userId });
    const user = state.users[auth.userId];
    if (user) {
      const connectedAt = new Date();
      await this.processTimeState(state, connectedAt);
      user.lastSeenAt = connectedAt.toISOString();
      const pet = state.pets[user.currentPetId];
      if (pet) {
        markPetActive(pet, connectedAt);
        if (!pet.integrity?.broken) {
          liarSetConnected(state, pet.id, true, connectedAt);
          omokSetConnected(state, pet.id, true);
        }
      }
      await this.store.save(state);
      await this.scheduleNextAlarm(state);
    }
    server.send(JSON.stringify({ type: 'connected', at: Date.now() }));
    this.broadcastRefresh('presence');
    return new Response(null, { status: 101, webSocket: client });
  }

  async handleFetch(request) {
    try {
      const url = new URL(request.url);
      const state = await this.store.load();
      const pathname = url.pathname;
      const date = new Date();
      const timeResult = await this.processTimeState(state, date);
      if (timeResult.changed) { await this.store.save(state); await this.scheduleNextAlarm(state); }

      if (request.method === 'GET' && pathname === '/api/health') return jsonResponse({ ok: true, version: APP_VERSION, storage: 'Cloudflare Durable Object' });
      if (request.method === 'GET' && pathname === '/api/ws') return this.acceptWebSocket(request, url, state);

      if (request.method === 'POST' && pathname === '/api/auth/register') {
        if (this.isAuthRateLimited(request)) return errorResponse('로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.', 429);
        const body = await readJson(request);
        const nickname = normalizeNickname(body.nickname);
        const error = validateNickname(nickname) || validatePin(body.pin);
        if (error) return errorResponse(error, 400);
        if (Object.values(state.users).some((user) => String(user.nickname).toLowerCase() === nickname.toLowerCase())) return errorResponse('이미 사용 중인 닉네임입니다.', 409);
        const userId = id('user');
        const pinData = await hashPin(body.pin, this.secret);
        const user = { id: userId, nickname, pinSalt: pinData.salt, pinHash: pinData.hash, generation: 1, currentPetId: null, sessionVersion: 1, role: 'user', notifications: [], createdAt: date.toISOString(), lastSeenAt: date.toISOString() };
        const pet = createPet(user, 1, date);
        user.currentPetId = pet.id;
        state.users[userId] = user;
        state.pets[pet.id] = pet;
        addPublicEvent(state, `${pet.displayName}이 레고방에 처음 들어왔습니다.`, 'join', [pet.id], date);
        await this.store.save(state);
        await this.scheduleNextAlarm(state);
        const token = await createToken(user, this.secret);
        this.broadcastRefresh('register');
        return jsonResponse({ ok: true, token }, 201);
      }

      if (request.method === 'POST' && pathname === '/api/auth/login') {
        if (this.isAuthRateLimited(request)) return errorResponse('로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.', 429);
        const body = await readJson(request);
        const nickname = normalizeNickname(body.nickname);
        const user = Object.values(state.users).find((item) => item.nickname.toLowerCase() === nickname.toLowerCase());
        if (!user || !(await verifyPin(body.pin, user.pinSalt, user.pinHash, this.secret))) return errorResponse('닉네임 또는 PIN이 올바르지 않습니다.', 401);
        user.lastSeenAt = date.toISOString();
        const loginPet = state.pets[user.currentPetId];
        if (loginPet) markPetActive(loginPet, date);
        await this.store.save(state);
        return jsonResponse({ ok: true, token: await createToken(user, this.secret) });
      }

      const auth = await this.authenticate(request, url, state);
      if (!auth) return errorResponse('로그인이 필요합니다.', 401);

      if (request.method === 'GET' && pathname === '/api/bootstrap') {
        const user = state.users[auth.userId];
        if (!user) return errorResponse('사용자를 찾을 수 없습니다.', 401);
        const current = state.pets[user.currentPetId];
        const shouldTouch = !Number.isFinite(new Date(user.lastSeenAt ?? '').getTime()) || date.getTime() - new Date(user.lastSeenAt).getTime() >= 60_000 || Boolean(current?.integrity?.inactivityWarned);
        if (shouldTouch) {
          user.lastSeenAt = date.toISOString();
          if (current) markPetActive(current, date);
          await this.store.save(state);
        }
        return jsonResponse({ ok: true, bootstrap: this.bootstrapFromState(state, auth.userId) });
      }

      const profileMatch = matchPath(pathname, '/api/profiles/:petId');
      if (request.method === 'GET' && profileMatch) {
        const viewer = currentPetForUser(state, auth.userId);
        const target = state.pets[profileMatch.petId];
        const profile = target ? publicProfile(state, target.id, viewer?.id, this.isOnline(state, target.userId)) : null;
        return profile ? jsonResponse({ ok: true, profile }) : errorResponse('레고를 찾을 수 없습니다.', 404);
      }

      if (request.method === 'POST' && pathname === '/api/profile/status-message') {
        const body = await readJson(request);
        const result = await this.mutateForUser(state, auth.userId, (_state, _user, pet) => updateStatusMessage(pet, body.statusMessage), date);
        this.broadcastRefresh('profile');
        return jsonResponse(result, result.ok ? 200 : 400);
      }

      if (request.method === 'POST' && pathname === '/api/life/restart') {
        const result = restartBrokenPet(state, auth.userId, date);
        if (!result.ok) return jsonResponse({ ...result, bootstrap: this.bootstrapFromState(state, auth.userId) }, 400);
        const user = state.users[auth.userId];
        if (user) {
          user.lastSeenAt = date.toISOString();
          const fresh = state.pets[user.currentPetId];
          if (fresh) markPetActive(fresh, date);
        }
        await this.store.save(state);
        await this.scheduleNextAlarm(state);
        this.broadcastRefresh('restart');
        return jsonResponse({ ...result, bootstrap: this.bootstrapFromState(state, auth.userId) });
      }

      const routes = {
        '/api/actions/work': (gameState, _user, pet, now) => workAction(pet, now),
        '/api/actions/rest': (gameState, _user, pet, now) => restAction(pet, now),
        '/api/actions/exercise': (gameState, _user, pet, now) => exerciseAction(pet, now)
      };
      if (request.method === 'POST' && routes[pathname]) {
        const result = await this.mutateForUser(state, auth.userId, routes[pathname], date);
        this.broadcastRefresh('action');
        return jsonResponse(result, result.ok ? 200 : 400);
      }

      if (request.method === 'POST' && pathname === '/api/actions/eat') {
        const body = await readJson(request);
        const result = await this.mutateForUser(state, auth.userId, (_state, _user, pet, now) => eatAction(pet, body.foodId, now), date);
        this.broadcastRefresh('food');
        return jsonResponse(result, result.ok ? 200 : 400);
      }

      if (request.method === 'POST' && pathname === '/api/minigames/start') {
        const body = await readJson(request);
        const result = await this.mutateForUser(state, auth.userId, (gameState, _user, pet, now) => startMiniGame(gameState, pet, body.gameId, now, { stakePoints: body.stakePoints }), date);
        this.broadcastRefresh('minigame', [auth.userId]);
        return jsonResponse(result, result.ok ? 200 : 400);
      }
      if (request.method === 'POST' && pathname === '/api/minigames/finish') {
        const body = await readJson(request);
        const result = await this.mutateForUser(state, auth.userId, (gameState, _user, pet, now) => finishMiniGame(gameState, pet, body.challengeId, body.value, now), date);
        this.broadcastRefresh('minigame', [auth.userId]);
        return jsonResponse(result, result.ok ? 200 : 400);
      }
      if (request.method === 'POST' && pathname === '/api/minigames/apple/select') {
        const body = await readJson(request);
        const result = await this.mutateForUser(state, auth.userId, (gameState, _user, pet, now) => selectAppleGame(gameState, pet, body.challengeId, {
          startRow: body.startRow, startCol: body.startCol, endRow: body.endRow, endCol: body.endCol
        }, body.requestId, now), date);
        this.broadcastRefresh('apple', [auth.userId]);
        return jsonResponse(result, result.ok ? 200 : 400);
      }

      if (request.method === 'POST' && pathname === '/api/minigames/stop') {
        const body = await readJson(request);
        const result = await this.mutateForUser(state, auth.userId, (gameState, _user, pet, now) => stopMiniGame(gameState, pet, body.challengeId, now), date);
        this.broadcastRefresh('minigame', [auth.userId]);
        return jsonResponse(result, result.ok ? 200 : 400);
      }

      if (request.method === 'POST' && pathname === '/api/fishing/start') {
        const result = await this.mutateForUser(state, auth.userId, (_state, _user, pet, now) => startFishing(pet, now), date);
        this.broadcastRefresh('fishing', [auth.userId]);
        return jsonResponse(result, result.ok ? 200 : 400);
      }
      if (request.method === 'POST' && pathname === '/api/fishing/claim') {
        const result = await this.mutateForUser(state, auth.userId, (_state, _user, pet, now) => claimFishing(pet, now), date);
        this.broadcastRefresh('fishing', [auth.userId]);
        return jsonResponse(result, result.ok ? 200 : 400);
      }

      if (request.method === 'POST' && pathname === '/api/bungs') {
        const body = await readJson(request);
        const result = await this.mutateForUser(state, auth.userId, (gameState, _user, pet, now) => createBung(gameState, pet, body, now), date);
        this.broadcastRefresh('bung');
        return jsonResponse(result, result.ok ? 201 : 400);
      }
      const bungJoin = matchPath(pathname, '/api/bungs/:bungId/join');
      if (request.method === 'POST' && bungJoin) {
        const result = await this.mutateForUser(state, auth.userId, (gameState, _user, pet, now) => joinBung(gameState, pet, gameState.bungs[bungJoin.bungId], now), date);
        this.broadcastRefresh('bung');
        return jsonResponse(result, result.ok ? 200 : 400);
      }
      const bungLeave = matchPath(pathname, '/api/bungs/:bungId/leave');
      if (request.method === 'POST' && bungLeave) {
        const result = await this.mutateForUser(state, auth.userId, (gameState, _user, pet, now) => leaveBung(gameState, pet, gameState.bungs[bungLeave.bungId], now), date);
        this.broadcastRefresh('bung');
        return jsonResponse(result, result.ok ? 200 : 400);
      }
      const bungStart = matchPath(pathname, '/api/bungs/:bungId/start');
      if (request.method === 'POST' && bungStart) {
        const result = await this.mutateForUser(state, auth.userId, (gameState, _user, pet, now) => startBung(gameState, pet, gameState.bungs[bungStart.bungId], now), date);
        this.broadcastRefresh('bung');
        return jsonResponse(result, result.ok ? 200 : 400);
      }
      const bungEnd = matchPath(pathname, '/api/bungs/:bungId/end');
      if (request.method === 'POST' && bungEnd) {
        const result = await this.mutateForUser(state, auth.userId, (gameState, _user, pet, now) => finishBung(gameState, pet, gameState.bungs[bungEnd.bungId], now), date);
        this.broadcastRefresh('bung');
        return jsonResponse(result, result.ok ? 200 : 400);
      }

      if (request.method === 'POST' && pathname === '/api/social/poke') {
        const body = await readJson(request);
        const result = await this.mutateForUser(state, auth.userId, (gameState, _user, pet) => pokePet(gameState, pet, gameState.pets[body.targetPetId]), date);
        this.broadcastRefresh('poke');
        return jsonResponse(result, result.ok ? 200 : 400);
      }
      if (request.method === 'POST' && pathname === '/api/social/action') {
        const body = await readJson(request);
        const result = await this.mutateForUser(state, auth.userId, (gameState, _user, pet, now) => socialAction(gameState, pet, gameState.pets[body.targetPetId], body.action, { requestId: body.requestId }, now), date);
        this.broadcastRefresh('social');
        return jsonResponse(result, result.ok ? 200 : 400);
      }

      const liarRoutes = {
        '/api/liar/join': (gameState, pet, body, now) => liarJoin(gameState, pet, now),
        '/api/liar/spectate': (gameState, pet, body, now) => liarSpectate(gameState, pet, now),
        '/api/liar/spectate/leave': (gameState, pet, body, now) => liarStopSpectating(gameState, pet, now),
        '/api/liar/leave': (gameState, pet, body, now) => liarLeave(gameState, pet, now),
        '/api/liar/ready': (gameState, pet, body, now) => liarToggleReady(gameState, pet, now),
        '/api/liar/settings': (gameState, pet, body, now) => liarUpdateSettings(gameState, pet, body, now),
        '/api/liar/start': (gameState, pet, body, now) => liarStart(gameState, pet, now),
        '/api/liar/chat': (gameState, pet, body, now) => liarAddChat(gameState, pet, body.text, now),
        '/api/liar/vote': (gameState, pet, body, now) => liarVote(gameState, pet, String(body.targetPetId ?? ''), now),
        '/api/liar/guess': (gameState, pet, body, now) => liarGuess(gameState, pet, body.guess, now),
        '/api/liar/reset': (gameState, pet, body, now) => liarReset(gameState, pet, now),
        '/api/liar/kick': (gameState, pet, body, now) => liarKick(gameState, pet, String(body.targetPetId ?? ''), now)
      };
      if (request.method === 'POST' && liarRoutes[pathname]) {
        const body = await readJson(request);
        const result = await this.mutateForUser(state, auth.userId, (gameState, _user, pet, now) => liarRoutes[pathname](gameState, pet, body, now), date);
        this.broadcastRefresh(pathname === '/api/liar/chat' ? 'liar-chat' : 'liar');
        return jsonResponse(result, result.ok ? 200 : 400);
      }

      if (request.method === 'POST' && pathname === '/api/omok/rooms') {
        const body = await readJson(request);
        const result = await this.mutateForUser(state, auth.userId, (gameState, _user, pet, now) => createOmokRoom(gameState, pet, body.stakePoints, now), date);
        this.broadcastRefresh('omok');
        return jsonResponse(result, result.ok ? 201 : 400);
      }
      const omokJoin = matchPath(pathname, '/api/omok/rooms/:roomId/join');
      const omokSpectate = matchPath(pathname, '/api/omok/rooms/:roomId/spectate');
      const omokSpectateLeave = matchPath(pathname, '/api/omok/rooms/:roomId/spectate/leave');
      const omokLeave = matchPath(pathname, '/api/omok/rooms/:roomId/leave');
      const omokMove = matchPath(pathname, '/api/omok/rooms/:roomId/move');
      const omokRematch = matchPath(pathname, '/api/omok/rooms/:roomId/rematch');
      if (request.method === 'POST' && (omokJoin || omokSpectate || omokSpectateLeave || omokLeave || omokMove || omokRematch)) {
        const body = await readJson(request);
        const route = omokJoin ? 'join' : omokSpectate ? 'spectate' : omokSpectateLeave ? 'spectate-leave' : omokLeave ? 'leave' : omokMove ? 'move' : 'rematch';
        const roomId = (omokJoin || omokSpectate || omokSpectateLeave || omokLeave || omokMove || omokRematch).roomId;
        const result = await this.mutateForUser(state, auth.userId, (gameState, _user, pet, now) => {
          if (route === 'join') return joinOmokRoom(gameState, pet, roomId, now);
          if (route === 'spectate') return spectateOmokRoom(gameState, pet, roomId, now);
          if (route === 'spectate-leave') return leaveOmokSpectator(gameState, pet, roomId, now);
          if (route === 'leave') return leaveOmokRoom(gameState, pet, roomId, now);
          if (route === 'move') return playOmokMove(gameState, pet, roomId, body.row, body.col, body.requestId, now);
          return requestOmokRematch(gameState, pet, roomId, now);
        }, date);
        this.broadcastRefresh('omok');
        return jsonResponse(result, result.ok ? 200 : 400);
      }

      if (request.method === 'POST' && pathname === '/api/territory/claim') {
        const body = await readJson(request);
        const result = await this.mutateForUser(state, auth.userId, (gameState, _user, pet, now) => claimTerritory(gameState, pet, body.row, body.col, now), date);
        this.broadcastRefresh('territory');
        return jsonResponse(result, result.ok ? 200 : 400);
      }

      const adminDeleteUser = matchPath(pathname, '/api/admin/users/:userId');
      if (request.method === 'DELETE' && adminDeleteUser) {
        const user = state.users[auth.userId];
        if (!this.isAdminUser(user)) return errorResponse('운영자 권한이 필요합니다.', 403);
        const targetUserId = String(adminDeleteUser.userId ?? '').trim();
        if (!targetUserId) return errorResponse('삭제할 회원을 지정해주세요.', 400);
        if (targetUserId === auth.userId) return errorResponse('운영자 본인 계정은 삭제할 수 없습니다.', 400);
        const targetUser = state.users[targetUserId];
        if (!targetUser) return errorResponse('삭제할 회원 계정을 찾을 수 없습니다.', 404);
        const outcome = this.deleteUserAccountState(state, targetUserId, date);
        if (!outcome.ok) return errorResponse(outcome.message, 400);
        this.appendAdminAudit(state, user, { action: 'account_delete', targetUserId, targetDisplayName: outcome.nickname }, date);
        await this.processTimeState(state, date);
        await this.store.save(state);
        await this.scheduleNextAlarm(state);
        this.disconnectUserSockets(targetUserId);
        this.broadcastRefresh('admin-account-delete');
        return jsonResponse({ ok: true, message: `${outcome.nickname} 계정을 완전히 삭제했습니다.`, removedPetCount: outcome.removedPetCount, bootstrap: this.bootstrapFromState(state, auth.userId) });
      }

      const adminLiarChat = matchPath(pathname, '/api/admin/liar/chat/:chatId');
      if (request.method === 'DELETE' && adminLiarChat) {
        const user = state.users[auth.userId];
        if (!this.isAdminUser(user)) return errorResponse('운영자 권한이 필요합니다.', 403);
        const outcome = deleteLiarChat(state, adminLiarChat.chatId);
        if (!outcome.ok) return errorResponse(outcome.message, 404);
        await this.store.save(state);
        this.broadcastRefresh('admin');
        return jsonResponse({ ...outcome, bootstrap: this.bootstrapFromState(state, auth.userId) });
      }
      if (request.method === 'POST' && pathname === '/api/admin/points') {
        const user = state.users[auth.userId];
        if (!this.isAdminUser(user)) return errorResponse('운영자 권한이 필요합니다.', 403);
        const body = await readJson(request);
        const requestId = String(body.requestId ?? '').trim();
        if (!/^[A-Za-z0-9._:-]{8,120}$/.test(requestId)) return errorResponse('유효한 요청 ID가 필요합니다.', 400);

        state.adminPointOperations ??= {};
        const previous = state.adminPointOperations[requestId];
        if (previous) {
          if (previous.adminUserId !== auth.userId) return errorResponse('이미 사용된 요청 ID입니다.', 409);
          return jsonResponse({
            ok: true,
            duplicate: true,
            message: '이미 처리된 포인트 조정 요청입니다.',
            operation: { ...previous },
            bootstrap: this.bootstrapFromState(state, auth.userId)
          });
        }

        const target = state.pets[String(body.targetPetId ?? '')];
        if (!target?.alive) return errorResponse('대상 레고를 찾을 수 없습니다.', 404);
        ensurePetSchema(target);
        const delta = Number(body.delta);
        if (!Number.isSafeInteger(delta) || delta === 0 || Math.abs(delta) > ADMIN_POINT_ADJUST_MAX) {
          return errorResponse(`포인트 조정값은 1~${ADMIN_POINT_ADJUST_MAX.toLocaleString('ko-KR')}P 범위의 정수여야 합니다.`, 400);
        }
        const before = target.stats.points;
        const after = before + delta;
        if (!Number.isSafeInteger(after) || after < 0) return errorResponse(`대상의 보유 포인트(${before}P)보다 많이 회수할 수 없습니다.`, 400);

        target.stats.points = after;
        target.records.maxPoints = Math.max(Number(target.records.maxPoints) || 0, after);
        const operation = {
          id: requestId,
          adminUserId: auth.userId,
          targetPetId: target.id,
          delta,
          before,
          after,
          createdAt: date.toISOString()
        };
        state.adminPointOperations[requestId] = operation;
        this.appendAdminAudit(state, user, { action: 'point_adjust', targetUserId: target.userId, targetPetId: target.id, targetDisplayName: target.displayName, delta, before, after }, date);
        const amount = Math.abs(delta);
        addNotification(
          state,
          target.userId,
          delta > 0 ? `운영자가 ${amount.toLocaleString('ko-KR')}P를 지급했습니다.` : `운영자가 ${amount.toLocaleString('ko-KR')}P를 회수했습니다.`,
          'info'
        );
        await this.store.save(state);
        this.broadcastRefresh('admin');
        return jsonResponse({
          ok: true,
          message: delta > 0 ? `${target.displayName}에게 ${amount.toLocaleString('ko-KR')}P를 지급했습니다.` : `${target.displayName}에게서 ${amount.toLocaleString('ko-KR')}P를 회수했습니다.`,
          operation,
          bootstrap: this.bootstrapFromState(state, auth.userId)
        });
      }
      if (request.method === 'POST' && pathname === '/api/admin/warnings') {
        const user = state.users[auth.userId];
        if (!this.isAdminUser(user)) return errorResponse('운영자 권한이 필요합니다.', 403);
        const body = await readJson(request);
        const target = state.pets[String(body.targetPetId ?? '')];
        if (!target?.alive) return errorResponse('대상 레고를 찾을 수 없습니다.', 404);
        ensurePetSchema(target);
        const delta = Number(body.delta) < 0 ? -1 : 1;
        target.warnings = Math.max(0, target.warnings + delta);
        if (delta > 0) target.records.warnings += 1;
        addNotification(state, target.userId, delta > 0 ? '운영자가 경고 1회를 부여했습니다.' : '운영자가 경고 1회를 취소했습니다.', delta > 0 ? 'warning' : 'info', { popup: delta > 0, warnings: target.warnings });
        await this.store.save(state);
        this.broadcastRefresh('admin');
        return jsonResponse({ ok: true, message: delta > 0 ? '경고를 부여했습니다.' : '경고를 취소했습니다.', bootstrap: this.bootstrapFromState(state, auth.userId) });
      }
      if (request.method === 'POST' && pathname === '/api/admin/kick') {
        const user = state.users[auth.userId];
        if (!this.isAdminUser(user)) return errorResponse('운영자 권한이 필요합니다.', 403);
        const body = await readJson(request);
        const target = state.pets[String(body.targetPetId ?? '')];
        if (!target?.alive) return errorResponse('대상 레고를 찾을 수 없습니다.', 404);
        if (target.userId === auth.userId) return errorResponse('운영자 본인은 강퇴할 수 없습니다.', 400);
        const result = endLifeAndRestart(state, target.userId, '강퇴', '운영자 조치');
        await this.store.save(state);
        this.broadcastRefresh('admin');
        return jsonResponse({ ok: true, message: `${target.displayName}을 강퇴 처리했습니다.`, result, bootstrap: this.bootstrapFromState(state, auth.userId) });
      }
      if (request.method === 'POST' && pathname === '/api/admin/reset-user') {
        const user = state.users[auth.userId];
        if (!this.isAdminUser(user)) return errorResponse('운영자 권한이 필요합니다.', 403);
        const body = await readJson(request);
        const target = state.pets[String(body.targetPetId ?? '')];
        if (!target?.alive) return errorResponse('대상 레고를 찾을 수 없습니다.', 404);
        ensurePetSchema(target);
        target.daily.actionsLeft = ACTIONS_PER_DAY;
        target.daily.nextActionAt = null;
        target.daily.miniGamesPlayed = 0;
        target.daily.fishingPlayed = 0;
        target.daily.fishing = null;
        for (const [challengeId, challenge] of Object.entries(state.miniGameChallenges)) if (challenge.petId === target.id) delete state.miniGameChallenges[challengeId];
        for (const request of Object.values(state.requests)) if (request.status === 'pending' && (request.fromPetId === target.id || request.toPetId === target.id)) request.status = 'cancelled';
        clearPetTerritory(state, target.id);
        if (state.liarGame?.players?.[target.id]) state.liarGame.players[target.id].connected = false;
        if (state.liarGame?.spectators?.[target.id]) delete state.liarGame.spectators[target.id];
        removePetFromOmok(state, target.id, date);
        addNotification(state, target.userId, '운영자가 비정상 게임 상태를 초기화했습니다.', 'info');
        await this.store.save(state);
        this.broadcastRefresh('admin');
        return jsonResponse({ ok: true, message: '대상의 비정상 진행 상태를 초기화했습니다.', bootstrap: this.bootstrapFromState(state, auth.userId) });
      }
      if (request.method === 'POST' && pathname === '/api/admin/liar/force-end') {
        const user = state.users[auth.userId];
        if (!this.isAdminUser(user)) return errorResponse('운영자 권한이 필요합니다.', 403);
        const outcome = forceEndLiarGame(state);
        await this.store.save(state);
        await this.scheduleNextAlarm(state);
        this.broadcastRefresh('admin');
        return jsonResponse({ ...outcome, bootstrap: this.bootstrapFromState(state, auth.userId) });
      }

      if (request.method === 'POST' && pathname === '/api/notifications/read') {
        const body = await readJson(request);
        const user = state.users[auth.userId];
        for (const notification of user.notifications ?? []) if (!body.id || notification.id === body.id) notification.read = true;
        await this.store.save(state);
        return jsonResponse({ ok: true, bootstrap: this.bootstrapFromState(state, auth.userId) });
      }
      if (request.method === 'POST' && pathname === '/api/account/logout-all') {
        const user = state.users[auth.userId];
        user.sessionVersion = (user.sessionVersion ?? 1) + 1;
        await this.store.save(state);
        return jsonResponse({ ok: true });
      }
      return errorResponse('API 경로를 찾을 수 없습니다.', 404);
    } catch (error) {
      console.error('LegoGameRoom error', error);
      return errorResponse(error?.message || '서버 처리 중 오류가 발생했습니다.', 500);
    }
  }

  async webSocketMessage(socket, message) {
    try {
      const text = typeof message === 'string' ? message : new TextDecoder().decode(message);
      const data = JSON.parse(text);
      if (data.type === 'ping') socket.send(JSON.stringify({ type: 'pong', at: Date.now() }));
    } catch { socket.send(JSON.stringify({ type: 'error', message: '메시지 형식이 올바르지 않습니다.' })); }
  }

  async markSocketDisconnected(socket) {
    let userId = null;
    try { userId = socket.deserializeAttachment()?.userId ?? null; } catch { /* ignore */ }
    if (!userId) return;
    const stillConnected = this.ctx.getWebSockets().some((candidate) => {
      if (candidate === socket) return false;
      try { return candidate.deserializeAttachment()?.userId === userId; } catch { return false; }
    });
    if (stillConnected) return;
    const state = await this.store.load();
    const user = state.users[userId];
    const pet = user ? state.pets[user.currentPetId] : null;
    if (!pet) return;
    const liarChanged = liarSetConnected(state, pet.id, false);
    const omokChanged = omokSetConnected(state, pet.id, false);
    if (liarChanged.changed || omokChanged.changed) {
      await this.processTimeState(state);
      await this.store.save(state);
      await this.scheduleNextAlarm(state);
    }
  }

  async handleWebSocketClose(socket, code, reason) {
    try { socket.close(code, reason); } catch { /* ignore */ }
    await this.markSocketDisconnected(socket);
    this.broadcastRefresh('presence');
  }

  async webSocketClose(socket, code, reason) {
    return this.runExclusive(() => this.handleWebSocketClose(socket, code, reason));
  }

  async handleWebSocketError(socket) {
    await this.markSocketDisconnected(socket);
    this.broadcastRefresh('presence');
  }

  async webSocketError(socket) {
    return this.runExclusive(() => this.handleWebSocketError(socket));
  }

  async handleAlarm() {
    const state = await this.store.load();
    await this.processTimeState(state, new Date());
    await this.store.save(state);
    await this.scheduleNextAlarm(state);
    this.broadcastRefresh('timer');
  }

  async alarm() {
    return this.runExclusive(() => this.handleAlarm());
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/healthz') return jsonResponse({ ok: true, version: APP_VERSION, platform: 'Cloudflare Workers' });
      if (url.pathname.startsWith('/api/')) {
        if (!env?.GAME_ROOM) return errorResponse('서버 저장소 연결 설정을 찾을 수 없습니다. Cloudflare Durable Object 바인딩을 확인해주세요.', 503);
        const objectId = env.GAME_ROOM.idFromName('lego-life-global-room');
        return await env.GAME_ROOM.get(objectId).fetch(request);
      }
      if (!env?.ASSETS) return new Response('Static asset binding is unavailable.', { status: 503, headers: securityHeaders(new Headers({ 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' })) });
      const asset = await env.ASSETS.fetch(request);
      const headers = new Headers(asset.headers);
      securityHeaders(headers);
      if (url.pathname === '/' || url.pathname.endsWith('.html') || url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname === '/sw.js') headers.set('Cache-Control', 'no-cache');
      return new Response(asset.body, { status: asset.status, statusText: asset.statusText, headers });
    } catch (error) {
      console.error('Worker entry error', error);
      if (url.pathname.startsWith('/api/') || url.pathname === '/healthz') {
        return errorResponse(error?.message || 'Cloudflare 서버 연결 중 오류가 발생했습니다.', 500);
      }
      return new Response('서비스를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.', { status: 500, headers: securityHeaders(new Headers({ 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' })) });
    }
  }
};
