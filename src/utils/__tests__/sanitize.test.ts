import { sanitizeFileName, sanitizeFolderSegment } from '../sanitize';

describe('sanitizeFolderSegment', () => {
  it('lowercases and collapses whitespace', () => {
    expect(sanitizeFolderSegment('  CS   101 ')).toBe('cs 101');
  });

  it('neutralizes path traversal and separators', () => {
    expect(sanitizeFolderSegment('../../etc/passwd')).toBe('etc passwd');
    expect(sanitizeFolderSegment('a\\b/c')).toBe('a b c');
  });

  it('drops reserved and control characters', () => {
    expect(sanitizeFolderSegment('Math<>:"|?*\u0007 2')).toBe('math 2');
  });

  it("returns '' when nothing safe survives", () => {
    expect(sanitizeFolderSegment('..')).toBe('');
    expect(sanitizeFolderSegment('///')).toBe('');
  });

  it('caps the length at 60 characters', () => {
    expect(sanitizeFolderSegment('x'.repeat(100))).toHaveLength(60);
  });
});

describe('sanitizeFileName', () => {
  it('keeps the case and the separators a student uses', () => {
    expect(sanitizeFileName('2021331045_Rahim_CSE101_HW3')).toBe('2021331045_Rahim_CSE101_HW3');
    expect(sanitizeFileName('Lab 2 - Ohm law')).toBe('Lab 2 - Ohm law');
  });

  it('drops characters upload forms and file systems reject', () => {
    expect(sanitizeFileName('a/b\\c:d*e?f"g<h>i|j')).toBe('a-b-cdefghij');
    expect(sanitizeFileName('x\u0007y')).toBe('xy');
  });

  it('trims dots and spaces at the edges, and caps the length at 80', () => {
    expect(sanitizeFileName('  ..name.. ')).toBe('name');
    expect(sanitizeFileName('x'.repeat(100))).toHaveLength(80);
  });

  it("returns '' when nothing safe survives", () => {
    expect(sanitizeFileName('???')).toBe('');
  });
});
