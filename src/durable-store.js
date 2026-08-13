import { initialTerritory, normalizeTerritory } from './game/territory.js';
import { normalizeAppleChallenge } from './game/apple-game.js';
import { normalizeBlockChallenge } from './game/block-game.js';
import { initialOmok, normalizeOmok } from './game/omok.js';
import { initialBlockBattle, normalizeBlockBattle } from './game/block-battle.js';
import { normalizeGameRankingSeason } from './game/ranking-season.js';
import { LOUDSPEAKER_MAX_LENGTH } from './game/constants.js';

const STATE_MANIFEST_KEY = 'state-manifest';
const STATE_CHUNK_PREFIX = 'state-chunk-';
const BLOCK_BATTLE_STATE_KEY = 'block-battle-state';
const CHUNK_CHARACTERS = 400_000;


function blockBattleSnapshot(state) {
  return {
    revision: Math.max(0, Math.floor(Number(state?.meta?.revision) || 0)),
    blockBattle: structuredClone(state?.blockBattle ?? initialBlockBattle()),
    updatedAt: new Date().toISOString()
  };
}

function applyBlockBattleSnapshot(state, snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || !snapshot.blockBattle) return state;
  state.blockBattle = normalizeBlockBattle(structuredClone(snapshot.blockBattle), state);
  state.meta.revision = Math.max(
    Math.max(0, Math.floor(Number(state.meta?.revision) || 0)),
    Math.max(0, Math.floor(Number(snapshot.revision) || 0))
  );
  return state;
}

function normalizeIsoDate(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : fallback;
}

export function initialState() {
  const date = new Date();
  return {
    meta: { version: 24, revision: 0, createdAt: date.toISOString(), updatedAt: date.toISOString() },
    users: {},
    pets: {},
    relationships: {},
    bungs: {},
    requests: {},
    miniGameChallenges: {},
    shopOperations: {},
    territoryOperations: {},
    adminPointOperations: {},
    adminAuditLogs: [],
    pokes: {},
    publicEvents: [],
    loudspeaker: null,
    omok: initialOmok(),
    blockBattle: initialBlockBattle(),
    territory: initialTerritory(date),
    gameRankingSeason: normalizeGameRankingSeason(null, date)
  };
}

function removeLegacyRealtimeAndNicknameState(state) {
  const removedGame = state?.liarGame && typeof state.liarGame === 'object' ? state.liarGame : null;
  if (removedGame) {
    for (const player of Object.values(removedGame.players ?? {})) {
      if (!player || player.forfeited) continue;
      const pet = state.pets?.[String(player.petId ?? '')];
      if (!pet?.alive) continue;
      const reserve = Math.max(0, Math.floor(Number(player.escrowRemaining) || 0));
      const current = Math.max(0, Math.floor(Number(player.currentRoundStake) || 0));
      const refund = reserve + current;
      if (!refund) continue;
      pet.stats = pet.stats && typeof pet.stats === 'object' ? pet.stats : {};
      pet.records = pet.records && typeof pet.records === 'object' ? pet.records : {};
      pet.stats.points = Math.max(0, Math.floor(Number(pet.stats.points) || 0)) + refund;
      pet.records.pointsSpent = Math.max(0, Math.floor(Number(pet.records.pointsSpent) || 0) - refund);
    }
  }
  delete state.liarGame;
  for (const user of Object.values(state.users ?? {})) if (user && typeof user === 'object') delete user.temporaryNickname;
}

function normalizeState(parsed) {
  const base = initialState();
  const previousVersion = Math.max(0, Math.floor(Number(parsed?.meta?.version) || 0));
  const state = { ...base, ...(parsed ?? {}) };
  for (const key of ['users', 'pets', 'relationships', 'bungs', 'requests', 'miniGameChallenges', 'shopOperations', 'territoryOperations', 'pokes', 'adminPointOperations']) {
    if (!state[key] || typeof state[key] !== 'object' || Array.isArray(state[key])) state[key] = {};
  }
  delete state.rumors;
  delete state.offspring;

  if (previousVersion < 10) {
    state.miniGameChallenges = {};
    state.bungs = {};
  }
  if (previousVersion < 11) {
    for (const [challengeId, challenge] of Object.entries(state.miniGameChallenges)) {
      if (challenge?.gameId !== 'oddEven' || challenge.completed) continue;
      const stake = Math.max(0, Math.floor(Number(challenge.stake) || 0));
      const pet = state.pets?.[challenge.petId];
      if (pet?.alive && stake > 0) {
        pet.stats ??= {};
        pet.records ??= {};
        pet.stats.points = Math.max(0, Math.floor(Number(pet.stats.points) || 0)) + stake;
        pet.records.pointsSpent = Math.max(0, Math.floor(Number(pet.records.pointsSpent) || 0) - stake);
      }
      delete state.miniGameChallenges[challengeId];
    }
  }
  for (const [challengeId, challenge] of Object.entries(state.miniGameChallenges)) {
    if (!challenge || !['oddEven', 'reaction', 'number', 'apple', 'block'].includes(challenge.gameId)) {
      delete state.miniGameChallenges[challengeId];
      continue;
    }
    if (challenge.gameId === 'apple') {
      state.miniGameChallenges[challengeId] = normalizeAppleChallenge(challenge);
      continue;
    }
    if (challenge.gameId === 'block') {
      state.miniGameChallenges[challengeId] = normalizeBlockChallenge(challenge);
      continue;
    }
    if (challenge.gameId === 'oddEven') {
      const legacyStake = Number(challenge.stake);
      challenge.stake = Number.isSafeInteger(legacyStake) && legacyStake >= 10 && legacyStake % 10 === 0 ? legacyStake : 10;
      challenge.streak = Math.max(0, Math.min(3, Math.floor(Number(challenge.streak) || 0)));
      const payoutPercent = { 1: 130, 2: 160, 3: 200 }[challenge.streak] ?? 0;
      challenge.pendingPayout = payoutPercent ? Math.floor(challenge.stake * payoutPercent / 100) : 0;
    }
  }

  const rawLoudspeaker = state.loudspeaker && typeof state.loudspeaker === 'object' && !Array.isArray(state.loudspeaker) ? state.loudspeaker : null;
  const loudspeakerStartedAt = new Date(rawLoudspeaker?.startedAt ?? '').getTime();
  const loudspeakerExpiresAt = new Date(rawLoudspeaker?.expiresAt ?? '').getTime();
  const loudspeakerMessage = String(rawLoudspeaker?.message ?? '').replace(/\s+/g, ' ').trim();
  const loudspeakerDisplayName = String(rawLoudspeaker?.displayName ?? '').trim();
  state.loudspeaker = rawLoudspeaker
    && Number.isFinite(loudspeakerStartedAt)
    && Number.isFinite(loudspeakerExpiresAt)
    && loudspeakerExpiresAt > Date.now()
    && loudspeakerMessage
    && loudspeakerDisplayName
    ? {
      id: String(rawLoudspeaker.id ?? ''),
      userId: String(rawLoudspeaker.userId ?? ''),
      petId: String(rawLoudspeaker.petId ?? ''),
      displayName: loudspeakerDisplayName.slice(0, 40),
      message: [...loudspeakerMessage].slice(0, LOUDSPEAKER_MAX_LENGTH).join(''),
      startedAt: new Date(loudspeakerStartedAt).toISOString(),
      expiresAt: new Date(loudspeakerExpiresAt).toISOString()
    }
    : null;

  state.publicEvents = Array.isArray(state.publicEvents)
    ? state.publicEvents.filter((event) => {
      if (!event || typeof event !== 'object' || Array.isArray(event)) return false;
      const text = String(event.text ?? '').trim();
      if (!text) return false;
      if (String(event.type ?? '') === 'liar') return false;
      if (['새끼레고', '비벙', '호감표현', '고백했습니다', '연락했습니다', '소문', '원 획득', '월급', '대출', '빚'].some((word) => text.includes(word))) return false;
      event.id = String(event.id || `legacy-event-${Math.random().toString(36).slice(2)}`);
      event.text = text.slice(0, 300);
      event.type = String(event.type || 'info').slice(0, 30);
      event.createdAt = normalizeIsoDate(event.createdAt, new Date().toISOString());
      return true;
    }).slice(0, 10)
    : [];

  for (const [userId, user] of Object.entries(state.users)) {
    if (!user || typeof user !== 'object' || Array.isArray(user)) {
      delete state.users[userId];
      continue;
    }
    user.id = String(user.id || userId);
    user.nickname = String(user.nickname || '레고').trim().slice(0, 12) || '레고';
    user.generation = Math.max(1, Math.floor(Number(user.generation) || 1));
    user.role = 'user';
    user.workoutBadge = Boolean(user.workoutBadge);
    delete user.temporaryNickname;
    user.notifications = Array.isArray(user.notifications)
      ? user.notifications.filter((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
        const text = String(item.text ?? '').trim();
        if (!text) return false;
        if (item.type === 'liar') return false;
        if (item.type === 'cosmetic-expiry') return false;
        if (['새끼레고', '비벙', '호감표현', '고백했습니다', '연락했습니다', '소문'].some((word) => text.includes(word))) return false;
        item.id = String(item.id || `legacy-noti-${Math.random().toString(36).slice(2)}`);
        item.text = text.slice(0, 300);
        item.read = Boolean(item.read);
        item.createdAt = normalizeIsoDate(item.createdAt, new Date().toISOString());
        return true;
      }).slice(0, 100)
      : [];
  }

  for (const [petId, pet] of Object.entries(state.pets)) {
    if (!pet || typeof pet !== 'object' || Array.isArray(pet)) {
      delete state.pets[petId];
      continue;
    }
    pet.id = String(pet.id || petId);
    pet.coupleStartedAt = normalizeIsoDate(pet.coupleStartedAt);
    delete pet.inventory;
    delete pet.rumorListenCredits;
    delete pet.heardRumorIds;
    delete pet.cosmetics;
    delete pet.cosmeticExpiryNotices;
  }

  for (const user of Object.values(state.users)) {
    const pet = state.pets?.[user?.currentPetId];
    if (!pet?.alive) continue;
    const generation = Math.max(1, Math.floor(Number(pet.generation || user.generation) || 1));
    pet.displayName = generation <= 1 ? `${user.nickname}레고` : `${user.nickname}레고${generation}`;
  }

  for (const pet of Object.values(state.pets)) {
    if (!pet?.partnerPetId) {
      pet.coupleStartedAt = null;
      continue;
    }
    const partner = state.pets[pet.partnerPetId];
    if (!partner?.alive || partner.partnerPetId !== pet.id) {
      pet.partnerPetId = null;
      pet.coupleStartedAt = null;
      continue;
    }
    const relation = state.relationships[[pet.id, partner.id].sort().join('__')];
    const candidates = [pet.coupleStartedAt, partner.coupleStartedAt, relation?.matchedAt]
      .filter(Boolean).map((value) => new Date(value).getTime()).filter(Number.isFinite);
    const startedAt = new Date(candidates.length ? Math.min(...candidates) : Date.now()).toISOString();
    pet.coupleStartedAt = startedAt;
    partner.coupleStartedAt = startedAt;
  }

  for (const [relationId, relation] of Object.entries(state.relationships)) {
    if (!relation || typeof relation !== 'object' || Array.isArray(relation)) {
      delete state.relationships[relationId];
      continue;
    }
    const petIds = Array.isArray(relation.petIds) ? [...new Set(relation.petIds.map(String))].sort() : relationId.split('__').sort();
    if (petIds.length !== 2 || !state.pets[petIds[0]] || !state.pets[petIds[1]]) {
      delete state.relationships[relationId];
      continue;
    }
    const key = petIds.join('__');
    const cleaned = {
      id: key,
      petIds,
      matchedAt: normalizeIsoDate(relation.matchedAt),
      lastBreakupAt: normalizeIsoDate(relation.lastBreakupAt),
      createdAt: normalizeIsoDate(relation.createdAt, new Date().toISOString()),
      updatedAt: normalizeIsoDate(relation.updatedAt, new Date().toISOString())
    };
    if (key !== relationId) delete state.relationships[relationId];
    state.relationships[key] = cleaned;
  }

  for (const [requestId, request] of Object.entries(state.requests)) {
    if (!request || typeof request !== 'object' || Array.isArray(request) || !['match', 'mating'].includes(request.type)) {
      delete state.requests[requestId];
      continue;
    }
    request.id = String(request.id || requestId);
    request.status = ['pending', 'accepted', 'rejected', 'cancelled'].includes(request.status) ? request.status : 'cancelled';
  }

  for (const [pairId, pair] of Object.entries(state.pokes)) {
    if (!pair || typeof pair !== 'object' || Array.isArray(pair) || !Array.isArray(pair.petIds) || pair.petIds.length !== 2) {
      delete state.pokes[pairId];
      continue;
    }
    const petIds = [...new Set(pair.petIds.map(String))].sort();
    if (petIds.length !== 2 || !state.pets[petIds[0]] || !state.pets[petIds[1]]) {
      delete state.pokes[pairId];
      continue;
    }
    const key = petIds.join('__');
    pair.id = key;
    pair.petIds = petIds;
    pair.counts = pair.counts && typeof pair.counts === 'object' && !Array.isArray(pair.counts) ? pair.counts : {};
    for (const petId of petIds) pair.counts[petId] = Math.max(0, Math.floor(Number(pair.counts[petId]) || 0));
    pair.total = pair.counts[petIds[0]] + pair.counts[petIds[1]];
    pair.lastActorPetId = petIds.includes(pair.lastActorPetId) ? pair.lastActorPetId : null;
    pair.createdAt = normalizeIsoDate(pair.createdAt, new Date().toISOString());
    pair.updatedAt = normalizeIsoDate(pair.updatedAt, pair.createdAt);
    if (key !== pairId) delete state.pokes[pairId];
    state.pokes[key] = pair;
  }

  for (const [bungId, bung] of Object.entries(state.bungs)) {
    if (!bung || typeof bung !== 'object' || Array.isArray(bung)) {
      delete state.bungs[bungId];
      continue;
    }
    bung.id = String(bung.id || bungId);
    bung.title = String(bung.title || '벙').trim().slice(0, 40) || '벙';
    bung.stakePoints = Math.max(500, Math.floor(Number(bung.stakePoints) || 500));
    bung.status = ['open', 'live', 'ended', 'cancelled'].includes(bung.status) ? bung.status : 'cancelled';
    bung.attendees = bung.attendees && typeof bung.attendees === 'object' && !Array.isArray(bung.attendees) ? bung.attendees : {};
    delete bung.chat;
    delete bung.impressions;
    delete bung.type;
    delete bung.cost;
    delete bung.purpose;
  }

  for (const [operationId, operation] of Object.entries(state.adminPointOperations)) {
    if (!operation || typeof operation !== 'object' || Array.isArray(operation)) {
      delete state.adminPointOperations[operationId];
      continue;
    }
    const delta = Number(operation.delta);
    const before = Number(operation.before);
    const after = Number(operation.after);
    if (!Number.isSafeInteger(delta) || delta === 0 || !Number.isSafeInteger(before) || before < 0 || !Number.isSafeInteger(after) || after < 0) {
      delete state.adminPointOperations[operationId];
      continue;
    }
    operation.id = String(operation.id || operationId);
    operation.adminUserId = String(operation.adminUserId || '');
    operation.targetPetId = String(operation.targetPetId || '');
    operation.delta = delta;
    operation.before = before;
    operation.after = after;
    operation.createdAt = normalizeIsoDate(operation.createdAt, new Date().toISOString());
  }

  for (const [operationId, operation] of Object.entries(state.shopOperations)) {
    if (!operation || typeof operation !== 'object' || Array.isArray(operation) || operation.itemId === 'nickname24h') {
      delete state.shopOperations[operationId];
      continue;
    }
    const createdAt = normalizeIsoDate(operation.createdAt);
    if (!createdAt || !operation.userId || !operation.petId || !operation.itemId || !operation.result || typeof operation.result !== 'object') {
      delete state.shopOperations[operationId];
      continue;
    }
    operation.id = String(operation.id || operationId);
    operation.userId = String(operation.userId);
    operation.petId = String(operation.petId);
    operation.itemId = String(operation.itemId);
    operation.createdAt = createdAt;
  }

  for (const [operationId, operation] of Object.entries(state.territoryOperations)) {
    if (!operation || typeof operation !== 'object' || Array.isArray(operation)) {
      delete state.territoryOperations[operationId];
      continue;
    }
    const createdAt = normalizeIsoDate(operation.createdAt);
    if (!createdAt || !operation.userId || !operation.petId || !operation.result || typeof operation.result !== 'object') {
      delete state.territoryOperations[operationId];
      continue;
    }
    operation.id = String(operation.id || operationId);
    operation.userId = String(operation.userId);
    operation.petId = String(operation.petId);
    operation.createdAt = createdAt;
  }


  state.adminAuditLogs = Array.isArray(state.adminAuditLogs)
    ? state.adminAuditLogs.filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry)
      && !String(entry.action ?? '').startsWith('liar') && !String(entry.detail ?? '').includes('라이어게임')).map((entry) => {
      const allowedActions = ['point_adjust', 'account_delete', 'bung_force_cancel', 'workout_badge', 'state_reset', 'omok_clear_ended'];
      const action = allowedActions.includes(entry.action) ? entry.action : 'point_adjust';
      return {
        id: String(entry.id || `admin-audit-${Math.random().toString(36).slice(2)}`),
        action,
        adminUserId: String(entry.adminUserId || ''),
        adminDisplayName: String(entry.adminDisplayName || '운영자').slice(0, 30),
        targetUserId: String(entry.targetUserId || ''),
        targetPetId: entry.targetPetId ? String(entry.targetPetId) : null,
        targetDisplayName: String(entry.targetDisplayName || '회원').slice(0, 30),
        delta: Number.isSafeInteger(Number(entry.delta)) ? Number(entry.delta) : null,
        before: Number.isSafeInteger(Number(entry.before)) ? Math.max(0, Number(entry.before)) : null,
        after: Number.isSafeInteger(Number(entry.after)) ? Math.max(0, Number(entry.after)) : null,
        detail: typeof entry.detail === 'string' ? entry.detail.slice(0, 200) : null,
        createdAt: normalizeIsoDate(entry.createdAt, new Date().toISOString())
      };
    }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 200)
    : [];

  removeLegacyRealtimeAndNicknameState(state);
  state.omok = normalizeOmok(state.omok, state);
  state.blockBattle = normalizeBlockBattle(state.blockBattle, state);
  state.territory = normalizeTerritory(state.territory, state);
  state.gameRankingSeason = normalizeGameRankingSeason(state.gameRankingSeason, new Date());
  state.meta = { ...base.meta, ...(state.meta ?? {}), version: 24, revision: Math.max(0, Math.floor(Number(state.meta?.revision) || 0)) };
  return state;
}

function pruneState(state) {
  const now = Date.now();
  state.publicEvents = Array.isArray(state.publicEvents) ? state.publicEvents.filter(Boolean).slice(0, 10) : [];
  for (const user of Object.values(state.users ?? {})) if (user && typeof user === 'object') user.notifications = Array.isArray(user.notifications) ? user.notifications.filter(Boolean).slice(0, 100) : [];

  const completedBungs = Object.values(state.bungs ?? {})
    .filter((bung) => bung && !['open', 'live'].includes(bung.status))
    .sort((a, b) => new Date(b.endedAt ?? b.createdAt) - new Date(a.endedAt ?? a.createdAt));
  const keepCompleted = new Set(completedBungs.slice(0, 180).map((bung) => bung.id));
  for (const [bungId, bung] of Object.entries(state.bungs ?? {})) {
    if (!bung || (!['open', 'live'].includes(bung.status) && !keepCompleted.has(bungId))) delete state.bungs[bungId];
    else {
      delete bung.chat;
      delete bung.impressions;
    }
  }

  for (const [challengeId, challenge] of Object.entries(state.miniGameChallenges ?? {})) {
    const created = new Date(challenge?.createdAt ?? 0).getTime();
    const keepActiveBlock = challenge?.gameId === 'block' && challenge.completed !== true;
    if (!challenge || !Number.isFinite(created) || (!keepActiveBlock && now - created > 24 * 60 * 60_000)) delete state.miniGameChallenges[challengeId];
  }
  const adminPointOperations = Object.values(state.adminPointOperations ?? {})
    .filter(Boolean)
    .sort((a, b) => new Date(b.createdAt ?? 0) - new Date(a.createdAt ?? 0))
    .slice(0, 200);
  state.adminPointOperations = Object.fromEntries(adminPointOperations.map((operation) => [operation.id, operation]));
  const shopOperations = Object.values(state.shopOperations ?? {})
    .filter((operation) => operation && now - new Date(operation.createdAt ?? 0).getTime() <= 30 * 24 * 60 * 60_000)
    .sort((a, b) => new Date(b.createdAt ?? 0) - new Date(a.createdAt ?? 0))
    .slice(0, 1_000);
  state.shopOperations = Object.fromEntries(shopOperations.map((operation) => [operation.id, operation]));
  const territoryOperations = Object.values(state.territoryOperations ?? {})
    .filter((operation) => operation && now - new Date(operation.createdAt ?? 0).getTime() <= 7 * 24 * 60 * 60_000)
    .sort((a, b) => new Date(b.createdAt ?? 0) - new Date(a.createdAt ?? 0))
    .slice(0, 1_000);
  state.territoryOperations = Object.fromEntries(territoryOperations.map((operation) => [operation.id, operation]));
  state.adminAuditLogs = Array.isArray(state.adminAuditLogs) ? state.adminAuditLogs.filter(Boolean).sort((a, b) => new Date(b.createdAt ?? 0) - new Date(a.createdAt ?? 0)).slice(0, 200) : [];
  state.meta.updatedAt = new Date().toISOString();
}

export class DurableJsonStore {
  constructor(storage) {
    this.storage = storage;
    this.cache = null;
    this.manifest = null;
  }

  async load() {
    if (this.cache) return this.cache;
    const [manifest, battleSnapshot] = await Promise.all([
      this.storage.get(STATE_MANIFEST_KEY),
      this.storage.get(BLOCK_BATTLE_STATE_KEY)
    ]);
    if (!manifest || !Number.isInteger(manifest.chunks) || manifest.chunks < 1) {
      this.cache = initialState();
      await this.save(this.cache);
      return this.cache;
    }
    const keys = Array.from({ length: manifest.chunks }, (_, index) => `${STATE_CHUNK_PREFIX}${index}`);
    const values = await this.storage.get(keys);
    const json = keys.map((key) => values.get(key) ?? '').join('');
    try {
      const parsed = JSON.parse(json);
      const storedVersion = Math.max(0, Math.floor(Number(parsed?.meta?.version) || 0));
      const storedTerritoryVersion = Math.max(0, Math.floor(Number(parsed?.territory?.version) || 0));
      const storedTerritorySize = Math.max(0, Math.floor(Number(parsed?.territory?.size) || 0));
      const storedTerritoryJson = JSON.stringify(parsed?.territory ?? null);
      const removedFeatureStatePresent = Boolean(parsed?.liarGame)
        || Object.values(parsed?.users ?? {}).some((user) => Boolean(user?.temporaryNickname))
        || Object.values(parsed?.shopOperations ?? {}).some((operation) => operation?.itemId === 'nickname24h')
        || (parsed?.publicEvents ?? []).some((event) => event?.type === 'liar')
        || Object.values(parsed?.users ?? {}).some((user) => (user?.notifications ?? []).some((item) => item?.type === 'liar'))
        || (parsed?.adminAuditLogs ?? []).some((entry) => String(entry?.action ?? '').startsWith('liar') || String(entry?.detail ?? '').includes('라이어게임'));
      this.cache = applyBlockBattleSnapshot(normalizeState(parsed), battleSnapshot);
      this.manifest = manifest;
      const territoryRecovered = storedTerritoryJson !== JSON.stringify(this.cache.territory ?? null);
      if (storedVersion !== 24 || storedTerritoryVersion < 6 || storedTerritorySize !== 5 || territoryRecovered || removedFeatureStatePresent) await this.save(this.cache);
    } catch {
      await this.storage.put(`broken-state-${Date.now()}`, json.slice(0, 1_800_000));
      this.cache = initialState();
      await this.save(this.cache);
    }
    return this.cache;
  }

  async save(state) {
    state.meta ??= {};
    state.meta.revision = Math.max(0, Math.floor(Number(state.meta.revision) || 0)) + 1;
    pruneState(state);
    const json = JSON.stringify(state);
    const chunks = [];
    for (let offset = 0; offset < json.length; offset += CHUNK_CHARACTERS) chunks.push(json.slice(offset, offset + CHUNK_CHARACTERS));
    if (!chunks.length) chunks.push('{}');
    const previousChunks = this.manifest?.chunks ?? 0;
    const entries = {};
    chunks.forEach((chunk, index) => { entries[`${STATE_CHUNK_PREFIX}${index}`] = chunk; });
    const manifest = { chunks: chunks.length, characters: json.length, updatedAt: new Date().toISOString() };
    entries[STATE_MANIFEST_KEY] = manifest;
    entries[BLOCK_BATTLE_STATE_KEY] = blockBattleSnapshot(state);
    await this.storage.put(entries);
    if (previousChunks > chunks.length) {
      const stale = Array.from({ length: previousChunks - chunks.length }, (_, index) => `${STATE_CHUNK_PREFIX}${index + chunks.length}`);
      await this.storage.delete(stale);
    }
    this.cache = state;
    this.manifest = manifest;
  }


  async saveBlockBattle(state) {
    state.meta ??= {};
    state.meta.revision = Math.max(0, Math.floor(Number(state.meta.revision) || 0)) + 1;
    state.meta.updatedAt = new Date().toISOString();
    state.blockBattle = normalizeBlockBattle(state.blockBattle, state);
    await this.storage.put(BLOCK_BATTLE_STATE_KEY, blockBattleSnapshot(state));
    this.cache = state;
  }
}
