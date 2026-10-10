import { fnv1a, hashKey } from '../hash';

describe('§18 W9 hash', () => {
  it('is FNV-1a (32 bits, two bytes per UTF-16 unit)', () => {
    expect(fnv1a('')).toBe(0x811c9dc5);
    // 'a' as the bytes 61 00.
    let expected = Math.imul(0x811c9dc5 ^ 0x61, 0x01000193);
    expected = Math.imul(expected ^ 0x00, 0x01000193) >>> 0;
    expect(fnv1a('a')).toBe(expected);
  });

  it('gives the same 16 hex characters every time, and others for other text', () => {
    const key = hashKey('file:///data/library/doc_1/document.pdf|1234|1700000000000');
    expect(key).toMatch(/^[0-9a-f]{16}$/);
    expect(hashKey('file:///data/library/doc_1/document.pdf|1234|1700000000000')).toBe(key);
    expect(hashKey('file:///data/library/doc_1/document.pdf|1235|1700000000000')).not.toBe(key);
    expect(hashKey('বাংলা')).not.toBe(hashKey('বাংল'));
  });

  it('does not collide over a few thousand similar names', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5000; i += 1) seen.add(hashKey(`file:///library/doc_${i}/page_${i % 7}.jpg`));
    expect(seen.size).toBe(5000);
  });
});
