import { linkAt, linkTarget, LINK_SLOP, safeLinkUrl, shownUrl, tapOnPage } from '../links';
import type { ColumnLayout } from '../surfaceGeometry';

const link = (left: number, top: number, width: number, height: number, extra: { uri?: string; page?: number } = {}) => ({ left, top, width, height, ...extra });

describe('linkAt', () => {
  const a = link(100, 100, 80, 12, { page: 3 });
  const b = link(100, 130, 80, 12, { page: 4 });

  it('finds the link under the point', () => {
    expect(linkAt([a, b], 120, 105)).toBe(a);
    expect(linkAt([a, b], 180, 142)).toBe(b);
    expect(linkAt([a, b], 50, 50)).toBeNull();
  });

  it('takes a tap just outside a link, up to the slop and no further', () => {
    expect(linkAt([a], 120, 112 + 5, 6)).toBe(a);
    expect(linkAt([a], 120, 112 + 7, 6)).toBeNull();
    // Off a corner the distance is the diagonal one.
    expect(linkAt([a], 100 - 5, 100 - 5, 6)).toBeNull();
    expect(linkAt([a], 100 - 4, 100 - 4, 6)).toBe(a);
    expect(linkAt([a], 120, 112 + 5)).toBeNull();
  });

  it('between two links picks the nearer, and a link under the point over a near one', () => {
    // 6 below a, 12 above b.
    expect(linkAt([a, b], 120, 118, 20)).toBe(a);
    expect(linkAt([a, b], 120, 126, 20)).toBe(b);
    expect(linkAt([a, b], 120, 131, 20)).toBe(b);
  });

  it('picks the smaller of two links that hold the point', () => {
    const whole = link(0, 0, 500, 500, { page: 1 });
    const word = link(100, 100, 40, 12, { page: 2 });
    expect(linkAt([whole, word], 110, 105)).toBe(word);
    expect(linkAt([word, whole], 110, 105)).toBe(word);
    expect(linkAt([whole, word], 300, 300)).toBe(whole);
  });

  it('ignores a link with no area', () => {
    expect(linkAt([link(100, 100, 0, 12, { page: 1 })], 100, 105, 10)).toBeNull();
  });
});

describe('safeLinkUrl', () => {
  it('allows the web, mail and phone', () => {
    expect(safeLinkUrl('https://example.com/a?b=1#c')).toBe('https://example.com/a?b=1#c');
    expect(safeLinkUrl('HTTP://Example.com')).toBe('HTTP://Example.com');
    expect(safeLinkUrl('mailto:someone@example.com')).toBe('mailto:someone@example.com');
    expect(safeLinkUrl('tel:+8801000000000')).toBe('tel:+8801000000000');
  });

  it('refuses every other scheme', () => {
    for (const uri of ['file:///sdcard/a.pdf', 'content://media/1', 'javascript:alert(1)', 'intent://scan/#Intent;end', 'market://details?id=x', 'data:text/html,hi', 'pdfscan://open', 'sms:123']) {
      expect(safeLinkUrl(uri)).toBeNull();
    }
  });

  it('does not let spaces or control characters hide a scheme', () => {
    expect(safeLinkUrl(' java\nscript:alert(1)')).toBeNull();
    expect(safeLinkUrl('\tjavascript:alert(1)')).toBeNull();
    expect(safeLinkUrl('  https://example.com/a b ')).toBe('https://example.com/ab');
  });

  it('reads "www." as the web and refuses what has no address', () => {
    expect(safeLinkUrl('www.example.com/page')).toBe('https://www.example.com/page');
    expect(safeLinkUrl('chapter2.pdf')).toBeNull();
    expect(safeLinkUrl('../notes/a.pdf')).toBeNull();
    expect(safeLinkUrl('https:')).toBeNull();
    expect(safeLinkUrl('')).toBeNull();
    expect(safeLinkUrl(undefined)).toBeNull();
  });
});

describe('linkTarget', () => {
  it('jumps to a page of the file', () => {
    expect(linkTarget(link(0, 0, 10, 10, { page: 0 }), 12)).toEqual({ kind: 'page', page: 0 });
    expect(linkTarget(link(0, 0, 10, 10, { page: 11, uri: 'https://example.com' }), 12)).toEqual({ kind: 'page', page: 11 });
  });

  it('offers the address when the page is not in the file', () => {
    expect(linkTarget(link(0, 0, 10, 10, { page: 12, uri: 'https://example.com' }), 12)).toEqual({ kind: 'url', url: 'https://example.com' });
    expect(linkTarget(link(0, 0, 10, 10, { uri: 'https://example.com' }), 12)).toEqual({ kind: 'url', url: 'https://example.com' });
  });

  it('is nothing for a link that goes nowhere allowed', () => {
    expect(linkTarget(link(0, 0, 10, 10, { page: -1 }), 12)).toBeNull();
    expect(linkTarget(link(0, 0, 10, 10, { uri: 'file:///x' }), 12)).toBeNull();
    expect(linkTarget(link(0, 0, 10, 10), 12)).toBeNull();
  });
});

describe('shownUrl', () => {
  it('shows an address whole unless it is very long', () => {
    expect(shownUrl('https://example.com')).toBe('https://example.com');
    const long = `https://example.com/${'a'.repeat(400)}`;
    expect(shownUrl(long).length).toBe(241);
    expect(shownUrl(long).endsWith('…')).toBe(true);
  });
});

describe('tapOnPage', () => {
  // Two 300 × 400 pages, 20 apart, in a 320 wide column (10 either side).
  const layout: ColumnLayout = { width: 320, tops: [0, 420], heights: [400, 400], lefts: [10, 10], widths: [300, 300], total: 820 };

  it('gives the page and the point on it as fractions', () => {
    expect(tapOnPage(layout, { scale: 1, tx: 0, ty: 0 }, 160, 200)).toEqual({ index: 0, fx: 0.5, fy: 0.5, width: 300 });
    expect(tapOnPage(layout, { scale: 1, tx: 0, ty: -420 }, 10, 0)).toEqual({ index: 1, fx: 0, fy: 0, width: 300 });
  });

  it('follows the zoom and the scroll', () => {
    // Zoomed 2×, scrolled so content (85, 520) is at the screen's (70, 40).
    const hit = tapOnPage(layout, { scale: 2, tx: -100, ty: -1000 }, 70, 40);
    expect(hit).toEqual({ index: 1, fx: 0.25, fy: 0.25, width: 600 });
  });

  it('reports a touch off the page as outside 0–1, for the slop to judge', () => {
    const gap = tapOnPage(layout, { scale: 1, tx: 0, ty: 0 }, 160, 410);
    expect(gap?.index).toBe(0);
    expect(gap?.fy).toBeGreaterThan(1);
    expect(tapOnPage(layout, { scale: 1, tx: 0, ty: 0 }, 4, 200)?.fx).toBeLessThan(0);
  });

  it('has no page in an empty document', () => {
    expect(tapOnPage({ width: 320, tops: [], heights: [], total: 0 }, { scale: 1, tx: 0, ty: 0 }, 10, 10)).toBeNull();
  });

  it('keeps the slop a finger-sized thing', () => {
    expect(LINK_SLOP).toBeGreaterThanOrEqual(6);
    expect(LINK_SLOP).toBeLessThanOrEqual(16);
  });
});
