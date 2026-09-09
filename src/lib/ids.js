function randomHex(byteLength = 8) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function id(prefix = 'id') {
  return `${prefix}_${randomHex(8)}`;
}

export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function chance(probability) {
  return Math.random() < probability;
}
