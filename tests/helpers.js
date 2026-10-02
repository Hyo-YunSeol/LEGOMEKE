import assert from 'node:assert/strict';
import { createPet } from '../src/game/engine.js';
import { initialState } from '../src/durable-store.js';
import { LegoGameRoom } from '../src/worker.js';

export class MemoryStorage {
  constructor(shared = new Map()) {
    this.map = shared;
    this.alarm = null;
  }

  async get(key) {
    if (Array.isArray(key)) {
      return new Map(key.filter((item) => this.map.has(item)).map((item) => [item, structuredClone(this.map.get(item))]));
    }
    return this.map.has(key) ? structuredClone(this.map.get(key)) : undefined;
  }

  async put(key, value) {
    if (key && typeof key === 'object' && !Array.isArray(key) && value === undefined) {
      for (const [entryKey, entryValue] of Object.entries(key)) this.map.set(entryKey, structuredClone(entryValue));
      return;
    }
    this.map.set(key, structuredClone(value));
  }

  async delete(key) {
    if (Array.isArray(key)) {
      for (const item of key) this.map.delete(item);
    } else this.map.delete(key);
  }

  async setAlarm(value) {
    const timestamp = value instanceof Date ? value.getTime() : Number(value);
    if (!Number.isFinite(timestamp) || timestamp <= 0) throw new Error('setAlarm() cannot be called with an alarm time <= 0');
    this.alarm = timestamp;
  }

  async deleteAlarm() { this.alarm = null; }
  async getAlarm() { return this.alarm; }
}

export class MockContext {
  constructor(shared = new Map()) {
    this.storage = new MemoryStorage(shared);
    this.sockets = [];
    this.ready = Promise.resolve();
  }

  blockConcurrencyWhile(callback) {
    this.ready = Promise.resolve().then(callback);
    return this.ready;
  }

  getWebSockets() { return this.sockets; }
  acceptWebSocket(socket) { this.sockets.push(socket); }
}

export async function createRoom(shared = new Map(), env = {}) {
  const ctx = new MockContext(shared);
  const room = new LegoGameRoom(ctx, env);
  await ctx.ready;
  return { room, ctx, shared };
}

export async function responseJson(response) {
  return { response, data: await response.json() };
}

export async function register(room, nickname, pin = '1234') {
  const { response, data } = await responseJson(await room.fetch(new Request('https://game.test/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nickname, pin })
  })));
  assert.equal(response.status, 201, JSON.stringify(data));
  assert.equal(data.ok, true);
  return data.token;
}

export function authRequest(path, token, options = {}) {
  return new Request(`https://game.test${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      ...(options.headers ?? {})
    }
  });
}

export function stateWithUsers(names = [['u1', '윤설'], ['u2', '민균']], date = new Date('2026-08-06T00:00:00.000Z')) {
  const state = initialState();
  for (const [userId, nickname] of names) {
    const user = {
      id: userId,
      nickname,
      generation: 1,
      currentPetId: null,
      sessionVersion: 1,
      notifications: [],
      createdAt: date.toISOString(),
      lastSeenAt: date.toISOString()
    };
    const pet = createPet(user, 1, date);
    user.currentPetId = pet.id;
    state.users[userId] = user;
    state.pets[pet.id] = pet;
  }
  return state;
}
