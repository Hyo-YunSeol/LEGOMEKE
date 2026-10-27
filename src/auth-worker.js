const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value) {
  const normalized = String(value).replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function utf8ToBase64Url(value) {
  return bytesToBase64Url(encoder.encode(value));
}

function base64UrlToUtf8(value) {
  return decoder.decode(base64UrlToBytes(value));
}

function hex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function randomHex(byteLength = 24) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return hex(bytes);
}

function safeEqual(a, b) {
  const left = encoder.encode(String(a));
  const right = encoder.encode(String(b));
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

async function hmacHex(secret, value) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return hex(new Uint8Array(signature));
}

async function hmacBase64Url(secret, value) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return bytesToBase64Url(new Uint8Array(signature));
}

export async function getOrCreateSecret(storage) {
  let secret = await storage.get('auth-secret');
  if (typeof secret === 'string' && secret.length >= 32) return secret;
  secret = randomHex(48);
  await storage.put('auth-secret', secret);
  return secret;
}

export async function hashPin(pin, secret, salt = randomHex(16)) {
  const hash = await hmacHex(secret, `${salt}:${String(pin)}`);
  return { salt, hash };
}

export async function verifyPin(pin, salt, expectedHash, secret) {
  const actual = await hmacHex(secret, `${salt}:${String(pin)}`);
  return safeEqual(actual, expectedHash);
}

export async function createToken(user, secret, maxAgeSeconds = 60 * 60 * 24 * 30) {
  const payload = {
    uid: user.id,
    sv: user.sessionVersion ?? 1,
    exp: Math.floor(Date.now() / 1000) + maxAgeSeconds
  };
  const encoded = utf8ToBase64Url(JSON.stringify(payload));
  const signature = await hmacBase64Url(secret, encoded);
  return `${encoded}.${signature}`;
}

export async function verifyToken(token, secret) {
  if (!token || !String(token).includes('.')) return null;
  const [encoded, signature] = String(token).split('.');
  const expected = await hmacBase64Url(secret, encoded);
  if (!safeEqual(signature, expected)) return null;
  try {
    const payload = JSON.parse(base64UrlToUtf8(encoded));
    if (!payload.uid || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function normalizeNickname(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

export function validateNickname(value) {
  const nickname = normalizeNickname(value);
  if (nickname.length < 2 || nickname.length > 12) return '닉네임은 2~12자로 입력해주세요.';
  if (!/^[가-힣a-zA-Z0-9 _-]+$/.test(nickname)) return '닉네임에는 한글, 영문, 숫자, 공백, _, -만 사용할 수 있습니다.';
  return null;
}

export function validatePin(pin) {
  const text = String(pin ?? '');
  if (!/^\d{4,12}$/.test(text)) return 'PIN은 숫자 4~12자리로 입력해주세요.';
  return null;
}
