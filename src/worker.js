import { DurableJsonStore } from './durable-store.js';
import {
  getOrCreateSecret, hashPin, verifyPin, createToken, verifyToken,
  normalizeNickname, validateNickname, validatePin
} from './auth-worker.js';
import { id } from './lib/ids.js';
import {
  FOODS, MINI_GAMES, FISHING_REWARDS, ACTIONS_PER_DAY, ACTION_COOLDOWN_MINUTES,
  MINI_GAMES_PER_DAY, FISHING_PER_DAY, GAME_DAY_HOURS, GAME_DAY_RESET_HOURS_KST, BODY_STAGES, STATUS_MESSAGE_MAX_LENGTH, STATUS_MESSAGE_ADMIN_MAX_LENGTH,
  SHOP_ITEMS, FLEX_ITEMS,
  BUNG_MIN_STAKE, BUNG_MIN_PLAYERS, BUNG_MAX_PLAYERS,
  ODD_EVEN_MIN_STAKE, ODD_EVEN_STAKE_STEP, ODD_EVEN_PAYOUT_PERCENT, TERRITORY_STEAL_COST
} from './game/constants.js';
import {
  createPet, privateDashboard, publicProfile, visibleBungs, recentEndedBungs, listRelationships,
  pendingRequestsFor, sentRequestsFor, currentPetForUser, applyDailyReset, applyHungerPenalty,
  workAction, restAction, exerciseAction, eatAction, updateStatusMessage,
  createBung, joinBung, leaveBung, startBung, finishBung, forceCancelBung, processBungTimers, bungNextAlarmAt,
  socialAction, expireSocialRequests, socialRequestNextAlarmAt, addNotification, addPublicEvent, pokePet, rankingsView,
  refreshTopPokeNews, startMiniGame, finishMiniGame, stopMiniGame, selectAppleGame, requestAppleNewBoardGame, selectBlockGame, settleExpiredMiniGames,
  startFishing, claimFishing, publishFishingNews,
  ensurePetSchema, endLifeAndRestart, nextHungerPenaltyAt,
  purchaseShopItem, loudspeakerView
} from './game/engine.js';
import {
  claimTerritory, processTerritorySeason, territoryNextAlarmAt, territoryView, clearPetTerritory
} from './game/territory.js';
import {
  clearEndedOmokRooms, createOmokRoom, joinOmokRoom, leaveOmokRoom, leaveOmokSpectator, omokNextAlarmAt, omokSetConnected, omokView,
  playOmokMove, processOmokTimers, removePetFromOmok, requestOmokRematch, spectateOmokRoom, OMOK_TURN_SECONDS
} from './game/omok.js';
import {
  BLOCK_BATTLE_STAKES, blockBattleNextAlarmAt, blockBattleRankings, blockBattleRoomView, blockBattleSetConnected, blockBattleView, clearEndedBlockBattleRooms,
  createBlockBattleRoom, joinBlockBattleRoom, leaveBlockBattleRoom, leaveBlockBattleSpectator,
  playBlockBattleActions, processBlockBattleTimers, removePetFromBlockBattle,
  requestBlockBattleRematch, spectateBlockBattleRoom
} from './game/block-battle.js';

import { processGameRankingSeason } from './game/ranking-season.js';
import { nextGameRankingSeasonAt } from './lib/time.js';

const APP_VERSION = '6.9.0-final';
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
    this.liveReactions = { omok: new Map(), blockBattle: new Map() };
    this.reactionRateLimits = new Map();
    this.ctx.blockConcurrencyWhile(async () => {
      this.secret = await getOrCreateSecret(this.ctx.storage);
      const state = await this.store.load();
      const socketUsers = this.websocketUserIds();
      const date = new Date();
      let battleConnectionChanged = false;
      for (const room of Object.values(state.blockBattle?.rooms ?? {})) {
        if (room?.status !== 'playing') continue;
        for (const player of Object.values(room.players ?? {})) {
          if (player?.connected && !socketUsers.has(player.userId)) {
            const disconnected = blockBattleSetConnected(state, player.petId, false, date);
            battleConnectionChanged ||= disconnected.changed;
          }
        }
      }
      if (battleConnectionChanged) {
        await this.store.saveBlockBattle(state);
        await this.scheduleNextAlarm(state);
      }
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

  cleanLiveReactions(date = new Date()) {
    const now = date.getTime();
    for (const scope of ['omok', 'blockBattle']) {
      for (const [roomId, items] of this.liveReactions[scope].entries()) {
        const active = items.filter((item) => item.expiresAt > now);
        if (active.length) this.liveReactions[scope].set(roomId, active);
        else this.liveReactions[scope].delete(roomId);
      }
    }
    for (const [key, at] of this.reactionRateLimits.entries()) if (now - at > 60_000) this.reactionRateLimits.delete(key);
  }

  liveReactionView(scope, roomId = null, date = new Date()) {
    this.cleanLiveReactions(date);
    const items = this.liveReactions[scope]?.get(roomId) ?? [];
    return items.map(({ id: reactionId, petId, displayName, type, emoji, label, createdAt, expiresAt }) => ({ reactionId, petId, displayName, type, emoji, label, createdAt, expiresAt }));
  }

  addSpectatorReaction(scope, roomId, pet, typeValue, date = new Date()) {
    const reactions = {
      funny: { emoji: '😂', label: '웃겨요' },
      sad: { emoji: '😢', label: '슬퍼요' },
      angry: { emoji: '😡', label: '화나요' },
      sleepy: { emoji: '😴', label: '졸려요' },
      cringe: { emoji: '🥵', label: '짜쳐요' }
    };
    const type = String(typeValue ?? '');
    const reaction = reactions[type];
    if (!reaction) return { ok: false, message: '지원하지 않는 관전 리액션입니다.' };
    const key = `${scope}:${roomId ?? 'main'}:${pet.id}`;
    const lastAt = Number(this.reactionRateLimits.get(key) || 0);
    if (date.getTime() - lastAt < 1_000) return { ok: false, status: 429, message: '리액션은 1초에 한 번 보낼 수 있습니다.' };
    this.reactionRateLimits.set(key, date.getTime());
    const item = { id: id('reaction'), petId: pet.id, displayName: pet.displayName, type, ...reaction, createdAt: date.toISOString(), expiresAt: date.getTime() + 2_000 };
    this.liveReactions[scope].set(roomId, [...(this.liveReactions[scope].get(roomId) ?? []), item].slice(-12));
    return { ok: true, reaction: item };
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
      detail: typeof entry.detail === 'string' ? entry.detail.slice(0, 200) : null,
      createdAt: date.toISOString()
    });
    state.adminAuditLogs = state.adminAuditLogs.slice(0, 200);
  }

  adminView(state, user, onlineIds = this.onlineUserIds(state)) {
    const isAdmin = this.isAdminUser(user);
    return {
      isAdmin,
      userId: user?.id ?? null,
      members: isAdmin ? Object.values(state.users).map((member) => {
        const ownedAlivePets = Object.values(state.pets ?? {})
          .filter((candidate) => candidate?.userId === member.id && candidate?.alive)
          .sort((a, b) => new Date(b.createdAt ?? 0) - new Date(a.createdAt ?? 0));
        const currentPet = state.pets?.[member.currentPetId];
        const pet = currentPet?.alive && currentPet.userId === member.id ? currentPet : (ownedAlivePets[0] ?? null);
        if (!pet) {
          return {
            userId: member.id, petId: null, displayName: `${member.nickname} (레고 없음)`, points: 0, level: 0,
            online: onlineIds.has(member.id), isSelf: member.id === user?.id, hasActivePet: false,
            workoutBadge: Boolean(member.workoutBadge), createdAt: member.createdAt ?? null
          };
        }
        ensurePetSchema(pet);
        const dashboard = pet.id === member.currentPetId ? privateDashboard(state, member.id) : null;
        return {
          userId: member.id, petId: pet.id, displayName: pet.displayName,
          points: pet.stats.points, level: dashboard?.pet?.stats?.level ?? pet.records?.maxLevel ?? 1,
          online: onlineIds.has(member.id), isSelf: member.id === user?.id, hasActivePet: true,
          workoutBadge: Boolean(member.workoutBadge), createdAt: member.createdAt ?? null
        };
      }).sort((a, b) => a.displayName.localeCompare(b.displayName, 'ko') || String(a.userId).localeCompare(String(b.userId))) : [],
      activeBungs: isAdmin ? Object.values(state.bungs ?? {})
        .filter((bung) => bung && ['open', 'live'].includes(bung.status))
        .sort((a, b) => new Date(a.createdAt ?? 0) - new Date(b.createdAt ?? 0))
        .map((bung) => ({
          id: bung.id, title: bung.title, status: bung.status, stakePoints: Math.max(0, Math.floor(Number(bung.stakePoints) || 0)),
          hostPetId: bung.hostPetId, hostDisplayName: state.pets?.[bung.hostPetId]?.displayName ?? '사라진 레고',
          attendeeCount: Object.values(bung.attendees ?? {}).filter((entry) => entry?.status !== 'left').length, createdAt: bung.createdAt
        })) : [],
      endedOmokRooms: isAdmin ? Object.values(state.omok?.rooms ?? {}).filter((room) => room?.status === 'ended' && room?.settled).length : 0,
      endedBlockBattleRooms: isAdmin ? Object.values(state.blockBattle?.rooms ?? {}).filter((room) => room?.status === 'ended' && room?.settled).length : 0,
      auditLogs: isAdmin ? (state.adminAuditLogs ?? []).slice(0, 100).map((entry) => ({ ...entry })) : []
    };
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

    for (const pet of targetPets) {
      if (pet.partnerPetId) {
        const partner = state.pets?.[pet.partnerPetId];
        if (partner?.alive && partner.partnerPetId === pet.id) {
          partner.partnerPetId = null;
          partner.coupleStartedAt = null;
          addNotification(state, partner.userId, `${pet.displayName} 계정이 운영자에 의해 삭제되어 커플 관계가 종료되었습니다.`, 'relationship', {}, date);
        }
      }
      removePetFromOmok(state, pet.id, date);
      removePetFromBlockBattle(state, pet.id, date);
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
    for (const [operationId, operation] of Object.entries(state.shopOperations ?? {})) {
      if (operation?.userId === targetUserId || petIds.has(operation?.petId)) delete state.shopOperations[operationId];
    }
    for (const key of ['foodOperations', 'bungOperations']) {
      for (const [operationId, operation] of Object.entries(state[key] ?? {})) if (operation?.userId === targetUserId || petIds.has(operation?.petId)) delete state[key][operationId];
    }
    for (const [operationId, operation] of Object.entries(state.territoryOperations ?? {})) {
      if (operation?.userId === targetUserId || petIds.has(operation?.petId)) delete state.territoryOperations[operationId];
    }
    if (state.loudspeaker?.userId === targetUserId || petIds.has(state.loudspeaker?.petId)) state.loudspeaker = null;
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
      const beforeEffects = JSON.stringify(pet.effects ?? null);
      const beforeFlexItem = JSON.stringify(pet.flexItem ?? null);
      ensurePetSchema(pet, date);
      const reset = applyDailyReset(pet, date, state);
      const hunger = applyHungerPenalty(pet, date);
      const news = publishFishingNews(state, pet, date);
      if (beforeEffects !== JSON.stringify(pet.effects ?? null) || beforeFlexItem !== JSON.stringify(pet.flexItem ?? null) || reset.changed || hunger.changed || news) changed = true;
    }
    const expiredMini = settleExpiredMiniGames(state, date);
    const socialRequests = expireSocialRequests(state, date);
    const bungs = processBungTimers(state, date);
    const gameSeason = processGameRankingSeason(state, date);
    for (const event of [...gameSeason.events].reverse()) addPublicEvent(state, event.text, event.type, event.petIds, date);
    if (gameSeason.changed) {
      const labels = { reaction: '⚡ 번개반응', apple: '🍎 사과게임', omok: '⚫ 오목' };
      for (const [key, awards] of Object.entries(gameSeason.awards ?? {})) {
        for (const award of awards ?? []) {
          const winner = state.pets?.[award.petId];
          if (!winner?.alive) continue;
          const champion = award.rank === 1 ? ` · 다음 시즌 동안 ${key === 'reaction' ? '⚡왕' : key === 'apple' ? '🍎왕' : '⚫오목왕'} 뱃지 획득` : '';
          addNotification(state, winner.userId, `${labels[key] || '게임'} 시즌 ${award.rank}위! ${award.prize}P 지급${champion}`, 'game-season', { game: key, rank: award.rank, prize: award.prize }, date);
        }
      }
    }
    const territory = processTerritorySeason(state, date);
    const omok = processOmokTimers(state, date);
    if (expiredMini.changed || socialRequests.changed || bungs.changed || gameSeason.changed || territory.changed || omok.changed) changed = true;
    let nonBattleChanged = changed;
    const blockBattle = processBlockBattleTimers(state, date);
    if (blockBattle.changed) changed = true;
    const pokeNewsBefore = JSON.stringify((state.publicEvents ?? []).find((event) => event.type === 'poke-top') ?? null);
    refreshTopPokeNews(state, date);
    const pokeNewsAfter = JSON.stringify((state.publicEvents ?? []).find((event) => event.type === 'poke-top') ?? null);
    if (pokeNewsBefore !== pokeNewsAfter) { changed = true; nonBattleChanged = true; }
    return { changed, nonBattleChanged, blockBattleChanged: blockBattle.changed, blockBattleSettled: blockBattle.settled };
  }

  async scheduleNextAlarm(state) {
    const storage = this.ctx?.storage;
    if (!storage || typeof storage.setAlarm !== 'function') return;
    const candidates = [];
    const territoryAt = territoryNextAlarmAt(state);
    const omokAt = omokNextAlarmAt(state);
    const blockBattleAt = blockBattleNextAlarmAt(state);
    const socialRequestAt = socialRequestNextAlarmAt(state);
    const bungAt = bungNextAlarmAt(state);
    const rankingSeasonAt = nextGameRankingSeasonAt(new Date());
    if (territoryAt) candidates.push(new Date(territoryAt).getTime());
    if (omokAt) candidates.push(new Date(omokAt).getTime());
    if (blockBattleAt) candidates.push(new Date(blockBattleAt).getTime());
    if (socialRequestAt) candidates.push(new Date(socialRequestAt).getTime());
    if (bungAt) candidates.push(new Date(bungAt).getTime());
    if (rankingSeasonAt) candidates.push(new Date(rankingSeasonAt).getTime());
    for (const challenge of Object.values(state.miniGameChallenges ?? {})) {
      if (challenge && challenge.gameId !== 'block' && !challenge.completed && challenge.expiresAt) candidates.push(new Date(challenge.expiresAt).getTime());
    }
    for (const pet of Object.values(state.pets ?? {})) {
      if (!pet?.alive) continue;
      ensurePetSchema(pet);
      if (pet.daily.fishing?.readyAt) candidates.push(new Date(pet.daily.fishing.readyAt).getTime());
      if (pet.effects?.staminaFullUntil) candidates.push(new Date(pet.effects.staminaFullUntil).getTime());
      if (pet.effects?.hungerFullUntil) candidates.push(new Date(pet.effects.hungerFullUntil).getTime());
      if (pet.flexItem?.expiresAt) candidates.push(new Date(pet.flexItem.expiresAt).getTime());
      const hungerAt = nextHungerPenaltyAt(pet);
      if (hungerAt) candidates.push(new Date(hungerAt).getTime());
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

  onlineProfiles(state, viewerPetId, onlineIds = this.onlineUserIds(state)) {
    return [...onlineIds].map((userId) => state.users[userId]).filter(Boolean)
      .map((member) => publicProfile(state, member.currentPetId, viewerPetId, true)).filter(Boolean)
      .sort((a, b) => a.displayName.localeCompare(b.displayName, 'ko'));
  }

  bootstrapFromState(state, userId) {
    const user = state.users[userId];
    const pet = user ? state.pets[user.currentPetId] : null;
    if (!user || !pet) return null;
    const onlineIds = this.onlineUserIds(state);
    const online = this.onlineProfiles(state, pet.id, onlineIds);
    return {
      revision: Math.max(0, Math.floor(Number(state.meta?.revision) || 0)),
      serverTime: Date.now(),
      dashboard: privateDashboard(state, userId),
      activeMiniChallenge: (() => {
        const challenge = Object.values(state.miniGameChallenges ?? {}).find((item) => item.petId === pet.id && !item.completed && (item.gameId === 'block' || new Date(item.expiresAt).getTime() > Date.now()));
        if (!challenge) return null;
        const view = { ...challenge };
        delete view.target;
        delete view.appleProcessedRequestIds;
        delete view.appleRefreshRequestIds;
        delete view.blockProcessedRequestIds;
        return view;
      })(),
      selfPublicProfile: publicProfile(state, pet.id, pet.id, true),
      online,
      onlineCount: online.length,
      residents: Object.values(state.users ?? {}).map((member) => publicProfile(state, member.currentPetId, pet.id, onlineIds.has(member.id))).filter(Boolean).sort((a, b) => a.displayName.localeCompare(b.displayName, 'ko')),
      bungs: visibleBungs(state, pet.id),
      recentBungs: recentEndedBungs(state, 10),
      relationships: listRelationships(state, pet.id),
      requests: pendingRequestsFor(state, pet.id),
      sentRequests: sentRequestsFor(state, pet.id),
      notifications: (user.notifications ?? []).filter((item) => !['break','break-warning','warning'].includes(item?.type) && !/(?:파손|부서|경고)/.test(String(item?.text ?? ''))).slice(0, 40),
      publicEvents: (state.publicEvents ?? []).filter((event) => !/경고/.test(String(event?.text ?? ''))).slice(0, 10),
      rankings: { ...rankingsView(state, pet.id), blockBattle: blockBattleRankings(state, pet.id) },
      omok: (() => { const view = omokView(state, pet.id); for (const room of view.rooms) room.reactions = this.liveReactionView('omok', room.id); return view; })(),
      blockBattle: (() => { const view = blockBattleView(state, pet.id); for (const room of view.rooms) room.reactions = this.liveReactionView('blockBattle', room.id); return view; })(),
      territory: territoryView(state, pet.id),
      loudspeaker: loudspeakerView(state),
      admin: this.adminView(state, user, onlineIds),
      catalog: {
        foods: Object.values(FOODS), shopItems: Object.values(SHOP_ITEMS), flexItems: Object.values(FLEX_ITEMS), miniGames: Object.values(MINI_GAMES), fishingRewards: FISHING_REWARDS.map(({ id: rewardId, label, reward }) => ({ id: rewardId, label, reward })),
        actionsPerDay: ACTIONS_PER_DAY, actionCooldownMinutes: ACTION_COOLDOWN_MINUTES,
        miniGamesPerDay: MINI_GAMES_PER_DAY, fishingPerDay: FISHING_PER_DAY,
        gameDayHours: GAME_DAY_HOURS, gameDayResetHoursKst: [...GAME_DAY_RESET_HOURS_KST],
        bungMinStake: BUNG_MIN_STAKE, bungMinPlayers: BUNG_MIN_PLAYERS, bungMaxPlayers: BUNG_MAX_PLAYERS,
        oddEven: { minStake: ODD_EVEN_MIN_STAKE, stakeStep: ODD_EVEN_STAKE_STEP, payoutPercent: { ...ODD_EVEN_PAYOUT_PERCENT } },
        omok: { maxRooms: 3, turnSeconds: OMOK_TURN_SECONDS, stakes: [100, 500, 1000, 2000, 3000, 4000, 5000] },
        blockBattle: { maxRooms: 3, stakes: [...BLOCK_BATTLE_STAKES], width: 10, height: 20 },
        territoryStealCost: TERRITORY_STEAL_COST,
        bodyStages: BODY_STAGES.map((stage) => ({ ...stage, max: Number.isFinite(stage.max) ? stage.max : null })),
        statusMessageMaxLength: this.isAdminUser(user) ? STATUS_MESSAGE_ADMIN_MAX_LENGTH : STATUS_MESSAGE_MAX_LENGTH
      }
    };
  }


  async mutateForUser(state, userId, mutator, date = new Date()) {
    const user = state.users[userId];
    const pet = user ? state.pets[user.currentPetId] : null;
    if (!user || !pet) return { ok: false, status: 401, message: '사용자를 찾을 수 없습니다.' };
    const current = currentPetForUser(state, userId);
    user.lastSeenAt = date.toISOString();
    const result = mutator(state, user, current, date) ?? { ok: true };
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

  broadcastLoudspeaker(loudspeaker) {
    if (!loudspeaker) return;
    const payload = JSON.stringify({ type: 'loudspeaker', loudspeaker });
    for (const socket of this.ctx.getWebSockets()) {
      try { socket.send(payload); } catch { /* ignore disconnected socket */ }
    }
  }

  sendBlockBattleState(state, roomId) {
    const targetRoom = state.blockBattle?.rooms?.[roomId];
    if (!targetRoom) return;
    const audiencePetIds = new Set([
      targetRoom.hostPetId,
      targetRoom.guestPetId,
      ...Object.keys(targetRoom.spectators ?? {})
    ].filter(Boolean));
    const date = new Date();
    const serverTime = date.getTime();
    const reactions = this.liveReactionView('blockBattle', roomId, date);
    const payloadCache = new Map();
    for (const socket of this.ctx.getWebSockets()) {
      try {
        const userId = socket.deserializeAttachment()?.userId;
        const user = state.users?.[userId];
        const pet = user ? state.pets?.[user.currentPetId] : null;
        // 모든 접속자의 전체 3개 방 뷰를 매 입력마다 만들지 않는다. 이 방의 선수와
        // 관전자에게만 해당 방 하나를 직렬화해 후반 입력 지연과 서버 CPU 사용을 막는다.
        if (!pet?.alive || !audiencePetIds.has(pet.id)) continue;
        // 관전자에게 공개되는 내용은 모두 같으므로 관전자 수만큼 10×20 두 판을
        // 다시 정규화·직렬화하지 않고 한 번 만든 안전한 공개 payload를 재사용한다.
        const cacheKey = [targetRoom.hostPetId, targetRoom.guestPetId].includes(pet.id) ? pet.id : 'spectator';
        let payload = payloadCache.get(cacheKey);
        if (!payload) {
          const room = blockBattleRoomView(state, roomId, pet.id, date);
          if (!room) continue;
          room.reactions = reactions;
          payload = JSON.stringify({ type: 'block-battle-state', room, serverTime });
          payloadCache.set(cacheKey, payload);
        }
        socket.send(payload);
      } catch { /* ignore disconnected socket */ }
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
        omokSetConnected(state, pet.id, true);
        blockBattleSetConnected(state, pet.id, true, connectedAt);
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
      const realtimeBlockInput = request.method === 'POST' && /^\/api\/block-battle\/rooms\/[^/]+\/input$/u.test(pathname);
      const deferredTimePath = realtimeBlockInput || (request.method === 'GET' && ['/api/health', '/api/ws'].includes(pathname));
      // 실시간 테트리스 입력은 아래 전용 경로가 해당 방의 중력·재접속만 처리한다.
      // WebSocket 연결도 acceptWebSocket이 한 번만 처리하므로 공통 전체 순회를 중복하지 않는다.
      if (!deferredTimePath) {
        const timeResult = await this.processTimeState(state, date);
        if (timeResult.changed) { await this.store.save(state); await this.scheduleNextAlarm(state); }
      }

      if (request.method === 'GET' && pathname === '/api/health') return jsonResponse({ ok: true, version: APP_VERSION, storage: 'Cloudflare Durable Object' });
      if (request.method === 'GET' && pathname === '/api/ws') return this.acceptWebSocket(request, url, state);

      if (request.method === 'POST' && pathname === '/api/auth/register') {
        if (this.isAuthRateLimited(request)) return errorResponse('로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.', 429);
        const body = await readJson(request);
        const nickname = normalizeNickname(body.nickname);
        const error = validateNickname(nickname) || validatePin(body.pin);
        if (error) return errorResponse(error, 400);
        const normalizedNickname = nickname.toLocaleLowerCase('ko');
        const duplicateNickname = Object.values(state.users).some((user) => String(user.nickname).toLocaleLowerCase('ko') === normalizedNickname);
        if (duplicateNickname) return errorResponse('이미 사용 중인 닉네임입니다.', 409);
        const userId = id('user');
        const pinData = await hashPin(body.pin, this.secret);
        const user = { id: userId, nickname, pinSalt: pinData.salt, pinHash: pinData.hash, generation: 1, currentPetId: null, sessionVersion: 1, role: 'user', workoutBadge: false, notifications: [], createdAt: date.toISOString(), lastSeenAt: date.toISOString() };
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
        await this.store.save(state);
        return jsonResponse({ ok: true, token: await createToken(user, this.secret) });
      }

      const auth = await this.authenticate(request, url, state);
      if (!auth) return errorResponse('로그인이 필요합니다.', 401);

      if (request.method === 'GET' && pathname === '/api/bootstrap') {
        const user = state.users[auth.userId];
        if (!user) return errorResponse('사용자를 찾을 수 없습니다.', 401);
        const shouldTouch = !Number.isFinite(new Date(user.lastSeenAt ?? '').getTime()) || date.getTime() - new Date(user.lastSeenAt).getTime() >= 60_000;
        if (shouldTouch) {
          user.lastSeenAt = date.toISOString();
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
        const user = state.users[auth.userId];
        const maxLength = this.isAdminUser(user) ? STATUS_MESSAGE_ADMIN_MAX_LENGTH : STATUS_MESSAGE_MAX_LENGTH;
        const result = await this.mutateForUser(state, auth.userId, (_state, _user, pet) => updateStatusMessage(pet, body.statusMessage, maxLength), date);
        this.broadcastRefresh('profile');
        return jsonResponse(result, result.ok ? 200 : 400);
      }

      const routes = {
        '/api/actions/work': (gameState, _user, pet, now) => workAction(pet, now),
        '/api/actions/rest': (gameState, _user, pet, now) => restAction(pet, now),
        '/api/actions/exercise': (gameState, _user, pet, now) => exerciseAction(pet, now)
      };
      if (request.method === 'POST' && routes[pathname]) {
        const result = await this.mutateForUser(state, auth.userId, routes[pathname], date);
        this.broadcastRefresh('action', [auth.userId]);
        return jsonResponse(result, result.ok ? 200 : 400);
      }

      if (request.method === 'POST' && pathname === '/api/actions/eat') {
        const body = await readJson(request);
        const requestId = String(body.requestId ?? '').trim();
        if (!/^[A-Za-z0-9._:-]{8,120}$/.test(requestId)) return errorResponse('유효한 요청 ID가 필요합니다.', 400);
        state.foodOperations ??= {};
        const previous = state.foodOperations[requestId];
        if (previous) {
          if (previous.userId !== auth.userId) return errorResponse('이미 사용된 요청 ID입니다.', 409);
          return jsonResponse({ ...structuredClone(previous.result), duplicate: true, bootstrap: this.bootstrapFromState(state, auth.userId) });
        }
        const result = await this.mutateForUser(state, auth.userId, (gameState, _user, pet, now) => {
          const outcome = eatAction(pet, body.foodId, now);
          if (outcome.ok) gameState.foodOperations[requestId] = { id: requestId, userId: auth.userId, petId: pet.id, createdAt: now.toISOString(), result: structuredClone(outcome) };
          return outcome;
        }, date);
        this.broadcastRefresh('food', [auth.userId]);
        return jsonResponse(result, result.ok ? 200 : 400);
      }

      if (request.method === 'POST' && pathname === '/api/shop/purchase') {
        const body = await readJson(request);
        const result = await this.mutateForUser(state, auth.userId, (gameState, user, pet, now) => purchaseShopItem(
          gameState,
          user,
          pet,
          body.itemId,
          { nickname: body.nickname, message: body.message },
          body.requestId,
          now
        ), date);
        if (result.ok && result.loudspeaker && !result.duplicate) this.broadcastLoudspeaker(result.loudspeaker);
        this.broadcastRefresh(result.globalRefresh ? 'shop-global' : 'shop', result.globalRefresh ? null : [auth.userId]);
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
        const result = await this.mutateForUser(state, auth.userId, (gameState, _user, pet, now) => finishMiniGame(gameState, pet, body.challengeId, body.value, now, {
          clientReactionMs: body.clientReactionMs,
          clientClickedAt: body.clientClickedAt
        }), date);
        this.broadcastRefresh('minigame', [auth.userId]);
        return jsonResponse(result, result.ok ? 200 : 400);
      }
      if (request.method === 'POST' && pathname === '/api/minigames/apple/select') {
        const body = await readJson(request);
        const result = await this.mutateForUser(state, auth.userId, (gameState, _user, pet, now) => selectAppleGame(gameState, pet, body.challengeId, {
          startRow: body.startRow, startCol: body.startCol, endRow: body.endRow, endCol: body.endCol, boardGeneration: body.boardGeneration
        }, body.requestId, now), date);
        this.broadcastRefresh('apple', [auth.userId]);
        return jsonResponse(result, result.ok ? 200 : 400);
      }

      if (request.method === 'POST' && pathname === '/api/minigames/apple/new-board') {
        const body = await readJson(request);
        const result = await this.mutateForUser(state, auth.userId, (gameState, _user, pet, now) => requestAppleNewBoardGame(gameState, pet, body.challengeId, body.requestId, now), date);
        this.broadcastRefresh('apple', [auth.userId]);
        return jsonResponse(result, result.ok ? 200 : 400);
      }

      if (request.method === 'POST' && pathname === '/api/minigames/block/select') {
        const body = await readJson(request);
        const result = await this.mutateForUser(state, auth.userId, (gameState, _user, pet, now) => selectBlockGame(gameState, pet, body.challengeId, {
          row: body.row, col: body.col, boardVersion: body.boardVersion
        }, body.requestId, now), date);
        this.broadcastRefresh('block', [auth.userId]);
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
        const targetUserId = state.pets?.[body.targetPetId]?.userId;
        this.broadcastRefresh('poke', [auth.userId, targetUserId].filter(Boolean));
        return jsonResponse(result, result.ok ? 200 : 400);
      }
      if (request.method === 'POST' && pathname === '/api/social/action') {
        const body = await readJson(request);
        const result = await this.mutateForUser(state, auth.userId, (gameState, _user, pet, now) => socialAction(gameState, pet, gameState.pets[body.targetPetId], body.action, { requestId: body.requestId }, now), date);
        const targetUserId = state.pets?.[body.targetPetId]?.userId;
        this.broadcastRefresh('social', [auth.userId, targetUserId].filter(Boolean));
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
          if (route === 'join') {
            const roomBefore = gameState.omok?.rooms?.[roomId];
            const hostPetId = roomBefore?.hostPetId ?? null;
            const hadGuest = Boolean(roomBefore?.guestPetId);
            const joined = joinOmokRoom(gameState, pet, roomId, now);
            if (joined.ok && !hadGuest && hostPetId && hostPetId !== pet.id) {
              const host = gameState.pets?.[hostPetId];
              if (host?.alive) addNotification(gameState, host.userId, `⚫ ${pet.displayName}이 오목 대전에 들어왔습니다.`, 'omok-opponent', { roomId, petId: pet.id }, now);
            }
            return joined;
          }
          if (route === 'spectate') return spectateOmokRoom(gameState, pet, roomId, now);
          if (route === 'spectate-leave') return leaveOmokSpectator(gameState, pet, roomId, now);
          if (route === 'leave') return leaveOmokRoom(gameState, pet, roomId, now);
          if (route === 'move') return playOmokMove(gameState, pet, roomId, body.row, body.col, body.requestId, now);
          return requestOmokRematch(gameState, pet, roomId, now);
        }, date);
        this.broadcastRefresh('omok');
        return jsonResponse(result, result.ok ? 200 : 400);
      }

      if (request.method === 'POST' && pathname === '/api/block-battle/rooms') {
        const body = await readJson(request);
        const result = await this.mutateForUser(state, auth.userId, (gameState, _user, pet, now) => createBlockBattleRoom(gameState, pet, body.stakePoints, now), date);
        this.broadcastRefresh('block-battle-lobby');
        return jsonResponse(result, result.ok ? 201 : 400);
      }
      const blockJoin = matchPath(pathname, '/api/block-battle/rooms/:roomId/join');
      const blockSpectate = matchPath(pathname, '/api/block-battle/rooms/:roomId/spectate');
      const blockSpectateLeave = matchPath(pathname, '/api/block-battle/rooms/:roomId/spectate/leave');
      const blockLeave = matchPath(pathname, '/api/block-battle/rooms/:roomId/leave');
      const blockInput = matchPath(pathname, '/api/block-battle/rooms/:roomId/input');
      const blockRematch = matchPath(pathname, '/api/block-battle/rooms/:roomId/rematch');
      if (request.method === 'POST' && blockInput) {
        const body = await readJson(request);
        const user = state.users[auth.userId];
        const pet = user ? currentPetForUser(state, auth.userId) : null;
        if (!user || !pet?.alive) return errorResponse('사용자를 찾을 수 없습니다.', 401);

        // 실시간 조작은 전체 회원의 배고픔·상점·영토·랭킹 상태를 두 번 순회하는
        // mutateForUser 경로를 타지 않는다. 해당 테트리스 방의 시간과 입력만 직렬 처리한다.
        const timed = processBlockBattleTimers(state, date);
        const connection = blockBattleSetConnected(state, pet.id, true, date);
        const result = playBlockBattleActions(state, pet, blockInput.roomId, body, date);
        const shouldPersist = timed.changed || connection.changed || (result.ok && !result.duplicate);
        const requiresFullSave = timed.settled || result.finished;
        if (shouldPersist) {
          if (requiresFullSave) await this.store.save(state);
          else await this.store.saveBlockBattle(state);
        }
        // 정상 입력마다 Durable Object 알람을 다시 등록하면 후반 입력이 알람 저장에
        // 막힌다. 재접속 상태가 바뀌거나 정산된 경우에만 다음 알람을 다시 계산한다.
        if (connection.changed || requiresFullSave) await this.scheduleNextAlarm(state);
        this.sendBlockBattleState(state, blockInput.roomId);
        if (requiresFullSave) this.broadcastRefresh('block-battle-lobby');
        const liveView = blockBattleView(state, pet.id, date);
        const expectedDiscard = Boolean(result.discarded || result.stale || result.paused || result.terminal);
        return jsonResponse({ ...result, blockBattle: liveView }, result.ok || expectedDiscard ? 200 : 400);
      }
      if (request.method === 'POST' && (blockJoin || blockSpectate || blockSpectateLeave || blockLeave || blockRematch)) {
        const body = await readJson(request);
        const matched = blockJoin || blockSpectate || blockSpectateLeave || blockLeave || blockRematch;
        const roomId = matched.roomId;
        const route = blockJoin ? 'join' : blockSpectate ? 'spectate' : blockSpectateLeave ? 'spectate-leave' : blockLeave ? 'leave' : 'rematch';
        const result = await this.mutateForUser(state, auth.userId, (gameState, _user, pet, now) => {
          if (route === 'join') return joinBlockBattleRoom(gameState, pet, roomId, now);
          if (route === 'spectate') return spectateBlockBattleRoom(gameState, pet, roomId, now);
          if (route === 'spectate-leave') return leaveBlockBattleSpectator(gameState, pet, roomId, now);
          if (route === 'leave') return leaveBlockBattleRoom(gameState, pet, roomId, now);
          return requestBlockBattleRematch(gameState, pet, roomId, now);
        }, date);
        this.sendBlockBattleState(state, roomId);
        this.broadcastRefresh('block-battle-lobby');
        const currentPet = currentPetForUser(state, auth.userId);
        const liveView = currentPet ? blockBattleView(state, currentPet.id) : null;
        return jsonResponse({ ...result, blockBattle: liveView }, result.ok ? 200 : 400);
      }


      const omokReaction = matchPath(pathname, '/api/omok/rooms/:roomId/reaction');
      if (request.method === 'POST' && omokReaction) {
        const body = await readJson(request);
        const pet = currentPetForUser(state, auth.userId);
        const room = state.omok?.rooms?.[omokReaction.roomId];
        const spectator = pet ? room?.spectators?.[pet.id] : null;
        if (!pet?.alive || room?.status !== 'playing' || !spectator?.connected || [room?.hostPetId, room?.guestPetId].includes(pet.id)) return errorResponse('오목 관전자만 리액션을 보낼 수 있습니다.', 403);
        const result = this.addSpectatorReaction('omok', room.id, pet, body.type, date);
        if (!result.ok) return errorResponse(result.message, result.status || 400);
        this.broadcastRefresh('spectator-reaction');
        return jsonResponse({ ok: true, reaction: result.reaction, bootstrap: this.bootstrapFromState(state, auth.userId) });
      }

      const blockBattleReaction = matchPath(pathname, '/api/block-battle/rooms/:roomId/reaction');
      if (request.method === 'POST' && blockBattleReaction) {
        const body = await readJson(request);
        const pet = currentPetForUser(state, auth.userId);
        const room = state.blockBattle?.rooms?.[blockBattleReaction.roomId];
        const spectator = pet ? room?.spectators?.[pet.id] : null;
        if (!pet?.alive || room?.status !== 'playing' || !spectator?.connected || [room?.hostPetId, room?.guestPetId].includes(pet.id)) return errorResponse('테트리스대전 관전자만 리액션을 보낼 수 있습니다.', 403);
        const result = this.addSpectatorReaction('blockBattle', room.id, pet, body.type, date);
        if (!result.ok) return errorResponse(result.message, result.status || 400);
        this.sendBlockBattleState(state, room.id);
        const liveView = blockBattleView(state, pet.id, date);
        const liveRoom = liveView.rooms.find((item) => item.id === room.id);
        if (liveRoom) liveRoom.reactions = this.liveReactionView('blockBattle', room.id, date);
        return jsonResponse({ ok: true, reaction: result.reaction, blockBattle: liveView });
      }

      if (request.method === 'POST' && pathname === '/api/territory/claim') {
        const body = await readJson(request);
        const result = await this.mutateForUser(state, auth.userId, (gameState, _user, pet, now) => {
          const requestId = String(body.requestId ?? '').trim();
          gameState.territoryOperations ??= {};
          if (requestId && /^[A-Za-z0-9._:-]{8,120}$/.test(requestId)) {
            const previous = gameState.territoryOperations[requestId];
            if (previous) {
              if (previous.userId !== auth.userId || previous.petId !== pet.id) return { ok: false, message: '이미 다른 영토 요청에 사용된 요청 ID입니다.' };
              return { ...structuredClone(previous.result), duplicate: true };
            }
          }
          const row = Math.floor(Number(body.row));
          const col = Math.floor(Number(body.col));
          const currentCell = gameState.territory?.cells?.[`${row}:${col}`] ?? null;
          const hasExpectedOwner = Object.prototype.hasOwnProperty.call(body, 'expectedOwnerPetId');
          const expectedOwnerPetId = body.expectedOwnerPetId == null ? null : String(body.expectedOwnerPetId);
          const expectedSeasonId = body.seasonId == null ? null : String(body.seasonId);
          let claimed;
          if (expectedSeasonId && expectedSeasonId !== gameState.territory?.seasonId) {
            claimed = { ok: false, stale: true, message: '영토전 회차가 바뀌었습니다. 새 지도를 불러온 뒤 다시 선택해주세요.' };
          } else if (hasExpectedOwner && (currentCell?.ownerPetId ?? null) !== expectedOwnerPetId) {
            claimed = { ok: false, stale: true, message: '방금 이 칸의 소유자가 바뀌었습니다. 최신 지도를 확인해주세요.' };
          } else {
            claimed = claimTerritory(gameState, pet, row, col, now);
          }
          if (claimed.ok && claimed.stolenFromPetId) {
            const victim = gameState.pets?.[claimed.stolenFromPetId];
            if (victim?.alive && victim.id !== pet.id) addNotification(gameState, victim.userId, `🗺️ ${pet.displayName}이 내 영토 (${Number(claimed.row) + 1}, ${Number(claimed.col) + 1})를 탈취했습니다.`, 'territory-stolen', { petId: pet.id, row: claimed.row, col: claimed.col }, now);
          }
          if (requestId && /^[A-Za-z0-9._:-]{8,120}$/.test(requestId)) {
            gameState.territoryOperations[requestId] = {
              id: requestId,
              userId: auth.userId,
              petId: pet.id,
              result: structuredClone(claimed),
              createdAt: now.toISOString()
            };
          }
          return claimed;
        }, date);
        this.broadcastRefresh('territory', result.ok ? null : [auth.userId]);
        // 규칙상 거절은 화면에 이유를 표시하는 정상 게임 결과이므로 HTTP 오류로 만들지 않는다.
        return jsonResponse(result, result.status === 401 ? 401 : 200);
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
        await this.store.save(state);
        await this.scheduleNextAlarm(state);
        this.disconnectUserSockets(targetUserId);
        this.broadcastRefresh('admin-account-delete');
        return jsonResponse({ ok: true, message: `${outcome.nickname} 계정을 완전히 삭제했습니다.`, removedPetCount: outcome.removedPetCount, bootstrap: this.bootstrapFromState(state, auth.userId) });
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
      if (request.method === 'POST' && pathname === '/api/admin/workout-badge') {
        const user = state.users[auth.userId];
        if (!this.isAdminUser(user)) return errorResponse('운영자 권한이 필요합니다.', 403);
        const body = await readJson(request);
        const targetUserId = String(body.targetUserId ?? '').trim();
        const targetUser = state.users[targetUserId];
        if (!targetUser) return errorResponse('대상 회원을 찾을 수 없습니다.', 404);
        const enabled = Boolean(body.enabled);
        targetUser.workoutBadge = enabled;
        const targetPet = state.pets?.[targetUser.currentPetId];
        this.appendAdminAudit(state, user, {
          action: 'workout_badge',
          targetUserId: targetUser.id,
          targetPetId: targetPet?.id ?? null,
          targetDisplayName: targetPet?.displayName || targetUser.nickname,
          detail: enabled ? '💪 운동방 뱃지 부여' : '💪 운동방 뱃지 해제'
        }, date);
        await this.store.save(state);
        this.broadcastRefresh('workout-badge');
        return jsonResponse({
          ok: true,
          message: enabled ? `${targetPet?.displayName || targetUser.nickname}에게 💪 운동방 뱃지를 부여했습니다.` : `${targetPet?.displayName || targetUser.nickname}의 💪 운동방 뱃지를 해제했습니다.`,
          bootstrap: this.bootstrapFromState(state, auth.userId)
        });
      }

      if (request.method === 'POST' && pathname === '/api/admin/kick') {
        const user = state.users[auth.userId];
        if (!this.isAdminUser(user)) return errorResponse('운영자 권한이 필요합니다.', 403);
        const body = await readJson(request);
        const target = state.pets[String(body.targetPetId ?? '')];
        if (!target?.alive) return errorResponse('대상 레고를 찾을 수 없습니다.', 404);
        if (target.userId === auth.userId) return errorResponse('운영자 본인은 강퇴할 수 없습니다.', 400);
        removePetFromOmok(state, target.id, date);
        removePetFromBlockBattle(state, target.id, date);
        const targetSnapshot = { userId: target.userId, petId: target.id, displayName: target.displayName };
        const result = endLifeAndRestart(state, target.userId, '강퇴', '운영자 조치', date);
        this.appendAdminAudit(state, user, { action: 'kick', targetUserId: targetSnapshot.userId, targetPetId: targetSnapshot.petId, targetDisplayName: targetSnapshot.displayName, detail: '운영자 강퇴 · 새 세대로 초기화' }, date);
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
        removePetFromOmok(state, target.id, date);
        removePetFromBlockBattle(state, target.id, date);
        this.appendAdminAudit(state, user, {
          action: 'state_reset', targetUserId: target.userId, targetPetId: target.id, targetDisplayName: target.displayName,
          detail: '비정상 진행 상태 초기화'
        }, date);
        addNotification(state, target.userId, '운영자가 비정상 게임 상태를 초기화했습니다.', 'info');
        await this.store.save(state);
        this.broadcastRefresh('admin');
        return jsonResponse({ ok: true, message: '대상의 비정상 진행 상태를 초기화했습니다.', bootstrap: this.bootstrapFromState(state, auth.userId) });
      }

      if (request.method === 'POST' && pathname === '/api/admin/omok/clear-ended') {
        const user = state.users[auth.userId];
        if (!this.isAdminUser(user)) return errorResponse('운영자 권한이 필요합니다.', 403);
        const outcome = clearEndedOmokRooms(state);
        this.appendAdminAudit(state, user, {
          action: 'omok_clear_ended', targetDisplayName: '종료된 오목방', detail: `${outcome.cleared}개 정리`
        }, date);
        await this.store.save(state);
        this.broadcastRefresh('omok');
        return jsonResponse({ ...outcome, bootstrap: this.bootstrapFromState(state, auth.userId) });
      }
      if (request.method === 'POST' && pathname === '/api/admin/block-battle/clear-ended') {
        const user = state.users[auth.userId];
        if (!this.isAdminUser(user)) return errorResponse('운영자 권한이 필요합니다.', 403);
        const outcome = clearEndedBlockBattleRooms(state, date);
        this.appendAdminAudit(state, user, { action: 'block_battle_clear_ended', targetDisplayName: '종료된 테트리스대전 방', detail: `${outcome.cleared}개 정리` }, date);
        await this.store.save(state);
        this.broadcastRefresh('block-battle');
        return jsonResponse({ ...outcome, bootstrap: this.bootstrapFromState(state, auth.userId) });
      }
      const adminForceBung = matchPath(pathname, '/api/admin/bungs/:bungId/force-cancel');
      if (request.method === 'POST' && adminForceBung) {
        const user = state.users[auth.userId];
        if (!this.isAdminUser(user)) return errorResponse('운영자 권한이 필요합니다.', 403);
        const outcome = forceCancelBung(state, adminForceBung.bungId, date);
        if (!outcome.ok) return errorResponse(outcome.message, 404);
        this.appendAdminAudit(state, user, {
          action: 'bung_force_cancel',
          targetPetId: outcome.bung.hostPetId,
          targetDisplayName: outcome.bung.title,
          detail: `방장 ${outcome.bung.hostDisplayName} · ${outcome.bung.attendeeCount}명 · 개설 ${outcome.bung.stakePoints}P · 반환/보상 없음`
        }, date);
        await this.store.save(state);
        await this.scheduleNextAlarm(state);
        this.broadcastRefresh('bung');
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

  async handleWebSocketMessage(socket, message) {
    try {
      const text = typeof message === 'string' ? message : new TextDecoder().decode(message);
      const data = JSON.parse(text);
      if (data.type === 'ping') {
        socket.send(JSON.stringify({ type: 'pong', at: Date.now() }));
        return;
      }
      if (data.type !== 'block-battle-input') return;
      const userId = socket.deserializeAttachment()?.userId;
      const state = await this.store.load();
      const pet = currentPetForUser(state, userId);
      if (!pet?.alive) {
        socket.send(JSON.stringify({ type: 'block-battle-error', message: '사용자를 찾을 수 없습니다.' }));
        return;
      }
      const date = new Date();
      // 한 번의 좌우/회전 입력 때문에 전체 회원과 다른 게임의 시간 상태를 훑지 않는다.
      // 테트리스 중력·재접속 만료만 먼저 따라잡고 해당 방 입력을 바로 처리한다.
      const timed = processBlockBattleTimers(state, date);
      const result = playBlockBattleActions(state, pet, String(data.roomId || ''), data, date);
      if (timed.changed || (result.ok && !result.duplicate)) {
        const requiresFullSave = timed.settled || result.finished;
        if (requiresFullSave) await this.store.save(state);
        else await this.store.saveBlockBattle(state);
        if (requiresFullSave) await this.scheduleNextAlarm(state);
      }
      if (!result.ok) socket.send(JSON.stringify({
        type: 'block-battle-error', roomId: data.roomId,
        requestId: String(data.requestId || ''), matchId: String(data.matchId || ''), ...result
      }));
      this.sendBlockBattleState(state, String(data.roomId || ''));
      if (result.finished) this.broadcastRefresh('block-battle-lobby');
    } catch { socket.send(JSON.stringify({ type: 'error', message: '메시지 형식이 올바르지 않습니다.' })); }
  }

  async webSocketMessage(socket, message) {
    return this.runExclusive(() => this.handleWebSocketMessage(socket, message));
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
    const omokChanged = omokSetConnected(state, pet.id, false);
    const blockBattleChanged = blockBattleSetConnected(state, pet.id, false);
    if (omokChanged.changed || blockBattleChanged.changed) {
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
    const result = await this.processTimeState(state, new Date());
    if (result.changed) {
      if (result.nonBattleChanged || result.blockBattleSettled) await this.store.save(state);
      else await this.store.saveBlockBattle(state);
    }
    await this.scheduleNextAlarm(state);
    if (result.blockBattleChanged) {
      for (const room of Object.values(state.blockBattle?.rooms ?? {})) if (room?.status === 'playing' || room?.status === 'ended') this.sendBlockBattleState(state, room.id);
    }
    if (result.nonBattleChanged) this.broadcastRefresh('timer');
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
