import { sanitizeFolderSegment } from '../sanitize';

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
