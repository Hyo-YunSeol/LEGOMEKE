const PARTICLES = {
  '이/가': ['이', '가'],
  '을/를': ['을', '를'],
  '은/는': ['은', '는'],
  '과/와': ['과', '와']
};

function hasFinalConsonant(text) {
  const value = String(text ?? '').trim();
  if (!value) return false;
  const code = value.charCodeAt(value.length - 1);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0;
  const last = value.at(-1);
  if (/\d/.test(last)) return ['0', '1', '3', '6', '7', '8'].includes(last);
  return false;
}

export function withJosa(word, pair) {
  const particles = PARTICLES[pair];
  if (!particles) return String(word ?? '');
  return `${word}${hasFinalConsonant(word) ? particles[0] : particles[1]}`;
}
