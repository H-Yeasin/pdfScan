import { findCountLabel } from '../FindBar';
import { steppedIndex, viewerFindCount } from '../viewers/useViewerFind';

const t = ((key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key)) as Parameters<typeof findCountLabel>[2];

describe('steppedIndex', () => {
  it('steps through the matches and goes round at the ends', () => {
    expect(steppedIndex(0, 1, 3)).toBe(1);
    expect(steppedIndex(2, 1, 3)).toBe(0);
    expect(steppedIndex(0, -1, 3)).toBe(2);
  });
  it('starts at the first match going forward, the last going back', () => {
    expect(steppedIndex(-1, 1, 3)).toBe(0);
    expect(steppedIndex(-1, -1, 3)).toBe(2);
  });
  it('has nowhere to go without matches', () => {
    expect(steppedIndex(0, 1, 0)).toBe(-1);
  });
});

describe('viewerFindCount', () => {
  it('reads as "3 of 27" in the Find bar, like the page surface', () => {
    expect(findCountLabel('the', viewerFindCount({ count: 27, index: 2 }), t)).toBe('reader.findCount:{"n":3,"total":"27"}');
  });
  it('says when the viewer stopped counting at its cap', () => {
    expect(findCountLabel('the', viewerFindCount({ count: 10000, index: 0, partial: true }), t)).toBe('reader.findCount:{"n":1,"total":"10000+"}');
  });
  it('says "No matches" when there are none', () => {
    expect(findCountLabel('zebra', viewerFindCount({ count: 0, index: -1 }), t)).toBe('reader.findNone');
    expect(findCountLabel('  ', viewerFindCount({ count: 0, index: -1 }), t)).toBe('');
  });
});
