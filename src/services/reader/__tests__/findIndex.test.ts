import { buildPageIndex, findInPage, normalizeFindText, normalizeQuery, type FindToken } from '../findIndex';

// A word 10 px a letter, on line `line` of block `block`.
const word = (text: string, left: number, line = 0, block = 0): FindToken => ({
  text,
  bounding: { left, top: block * 200 + line * 20, width: text.length * 10, height: 12 },
  block,
  line,
});

describe('normalizeFindText', () => {
  it('folds case', () => {
    expect(normalizeFindText('PhotoSynthesis')).toBe('photosynthesis');
  });

  it('opens ligatures and other compatibility forms (NFKC)', () => {
    expect(normalizeFindText('ﬁnal ofﬂine')).toBe('final offline');
    expect(normalizeFindText('ＡＢＣ１')).toBe('abc1');
  });

  it('drops soft hyphens', () => {
    expect(normalizeFindText('photo­synthesis')).toBe('photosynthesis');
  });

  it('reads any run of white space, line breaks included, as one space', () => {
    expect(normalizeFindText('cell\n wall\t\tof  a plant')).toBe('cell wall of a plant');
  });

  it('trims a query and finds nothing in an empty one', () => {
    expect(normalizeQuery('  The  Cell ')).toBe('the cell');
    expect(normalizeQuery(' \n ')).toBe('');
  });
});

describe('buildPageIndex', () => {
  it('joins the words with one space and maps each back', () => {
    const index = buildPageIndex([word('The', 0), word('Cell', 40), word('wall', 0, 1)]);
    expect(index.text).toBe('the cell wall');
    expect(index.spans.map((s) => [s.start, s.length, s.line])).toEqual([
      [0, 3, 0],
      [4, 4, 0],
      [9, 4, 1],
    ]);
  });

  it('leaves out words with nothing to find, and numbers lines across blocks', () => {
    const index = buildPageIndex([word('a', 0, 0, 0), word(' ­ ', 20, 0, 0), word('b', 0, 0, 1), word('c', 20, 0, 1)]);
    expect(index.text).toBe('a b c');
    expect(index.spans.map((s) => s.line)).toEqual([0, 1, 1]);
  });

  it('keeps a line that is one token (a page read before word boxes) whole', () => {
    const index = buildPageIndex([{ text: 'The  quick\nfox', bounding: { left: 0, top: 0, width: 130, height: 12 }, block: 0, line: 0 }]);
    expect(index.text).toBe('the quick fox');
    expect(index.spans).toHaveLength(1);
  });
});

describe('findInPage', () => {
  const page = buildPageIndex([word('The', 0), word('plant', 40), word('cell', 100), word('wall', 0, 1), word('is', 50, 1), word('the', 80, 1), word('ﬁrst', 120, 1)]);

  it('finds every occurrence, whatever the case, in reading order', () => {
    const matches = findInPage(page, 'THE');
    expect(matches.map((m) => m.start)).toEqual([0, 23]);
    expect(matches[0].rects).toEqual([{ left: 0, top: 0, width: 30, height: 12 }]);
    expect(matches[1].rects).toEqual([{ left: 80, top: 20, width: 30, height: 12 }]);
  });

  it('covers several words of a line with one box', () => {
    const [match] = findInPage(page, 'plant cell');
    expect(match.rects).toEqual([{ left: 40, top: 0, width: 100, height: 12 }]);
  });

  it('follows a phrase over a line break: one box per line', () => {
    const [match] = findInPage(page, 'cell  wall is');
    expect(match.rects).toEqual([
      { left: 100, top: 0, width: 40, height: 12 },
      { left: 0, top: 20, width: 70, height: 12 },
    ]);
  });

  it('gives a part of a word its share of the box', () => {
    // "lan" of "plant": letters 1–3 of 5, 10 px each.
    expect(findInPage(page, 'lan')[0].rects).toEqual([{ left: 50, top: 0, width: 30, height: 12 }]);
    // The end of one word and the start of the next.
    expect(findInPage(page, 'nt ce')[0].rects).toEqual([{ left: 70, top: 0, width: 50, height: 12 }]);
  });

  it('finds a ligature by its letters, over the ligature\'s box', () => {
    // "ﬁrst" is four glyphs (40 px) and five letters once opened.
    const [match] = findInPage(page, 'first');
    expect(match.rects).toEqual([{ left: 120, top: 20, width: 40, height: 12 }]);
    expect(findInPage(page, 'fi')[0].rects[0].width).toBeCloseTo(16);
  });

  it('does not count overlapping matches twice', () => {
    expect(findInPage(buildPageIndex([word('aaaa', 0)]), 'aa')).toHaveLength(2);
  });

  it('finds nothing for an empty query or a missing word', () => {
    expect(findInPage(page, '   ')).toEqual([]);
    expect(findInPage(page, 'chloroplast')).toEqual([]);
    expect(findInPage(buildPageIndex([]), 'the')).toEqual([]);
  });
});
