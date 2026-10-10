// §18 W9: FNV-1a, for names that must be the same on every launch (cache folders and files). Not
// for anything secret: it is fast and well spread, nothing more.

const OFFSET = 0x811c9dc5;
const PRIME = 0x01000193;

// 32 bits over the string's UTF-16 code units, each fed as two bytes.
export function fnv1a(text: string, seed: number = OFFSET): number {
  let hash = seed >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    const unit = text.charCodeAt(i);
    hash = Math.imul(hash ^ (unit & 0xff), PRIME);
    hash = Math.imul(hash ^ (unit >>> 8), PRIME);
  }
  return hash >>> 0;
}

function hex(value: number): string {
  return value.toString(16).padStart(8, '0');
}

// 16 hex characters: two passes with different seeds. 32 bits alone would let two files of a big
// library share a name now and then, and a shared name here means showing the wrong page.
export function hashKey(text: string): string {
  const first = fnv1a(text);
  return hex(first) + hex(fnv1a(text, first ^ 0x9e3779b9));
}
