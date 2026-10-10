import {
  averageHeight,
  buildTxtIndex,
  chunkAt,
  chunkHasMatch,
  chunkOf,
  chunkSegments,
  chunkTop,
  findAll,
  firstMatchAfter,
  fractionInChunk,
  lowerSameLength,
  TXT_FIND_MAX,
} from '../txtIndex';

describe('buildTxtIndex', () => {
  it('cuts the text into chunks that end on a line break', () => {
    const index = buildTxtIndex('alpha\nbeta\ngamma\ndelta', 12);
    expect(index.chunks).toEqual(['alpha\nbeta\n', 'gamma\ndelta']);
    expect(index.offsets).toEqual([0, 11, 22]);
    expect(index.chunks.join('')).toBe('alpha\nbeta\ngamma\ndelta');
  });

  it('cuts a line longer than a chunk, but never through a character', () => {
    const index = buildTxtIndex('ab😀cd', 3);
    expect(index.chunks).toEqual(['ab', '😀c', 'd']);
    expect(index.chunks.join('')).toBe('ab😀cd');
  });

  it('gives an empty file one empty chunk', () => {
    expect(buildTxtIndex('')).toEqual({ chunks: [''], offsets: [0, 0], lower: '' });
  });

  it('lower-cases once, character for character', () => {
    expect(buildTxtIndex('The THE').lower).toBe('the the');
    // İ lower-cases to two characters: it is left alone so the offsets still agree.
    const text = 'İstanbul IS';
    expect(lowerSameLength(text)).toHaveLength(text.length);
    expect(lowerSameLength(text).endsWith('stanbul is')).toBe(true);
  });
});

describe('findAll', () => {
  const index = buildTxtIndex('The cat. the CAT, THE end.\nAnother the.', 10);

  it('finds every match whatever its case, in order', () => {
    expect(findAll(index, 'the').matches.map((m) => m.start)).toEqual([0, 9, 18, 30, 35]);
    expect(findAll(index, '  CAT ').matches).toEqual([
      { start: 4, end: 7 },
      { start: 13, end: 16 },
    ]);
  });

  it('finds nothing for an empty query', () => {
    expect(findAll(index, '   ')).toEqual({ matches: [], partial: false });
  });

  it('finds a match that lies across two chunks', () => {
    const split = buildTxtIndex('aaaa needle bbbb', 7);
    expect(split.chunks).toEqual(['aaaa ne', 'edle bb', 'bb']);
    expect(findAll(split, 'needle').matches).toEqual([{ start: 5, end: 11 }]);
  });

  it('does not count overlapping matches twice', () => {
    expect(findAll(buildTxtIndex('aaaa'), 'aa').matches).toHaveLength(2);
  });

  it('stops at the cap and says there are more', () => {
    const many = buildTxtIndex('x '.repeat(50));
    expect(findAll(many, 'x', 10)).toMatchObject({ partial: true, matches: { length: 10 } });
    expect(findAll(many, 'x', 50)).toMatchObject({ partial: false, matches: { length: 50 } });
    expect(TXT_FIND_MAX).toBe(10_000);
  });
});

describe('chunkSegments', () => {
  const index = buildTxtIndex('aaaa needle bbbb needle', 7);
  const { matches } = findAll(index, 'needle');

  it('draws a match in both of the chunks it crosses', () => {
    expect(chunkSegments(index, 0, matches, -1)).toEqual([
      { text: 'aaaa ', hit: 'none' },
      { text: 'ne', hit: 'match' },
    ]);
    expect(chunkSegments(index, 1, matches, 0)).toEqual([
      { text: 'edle', hit: 'current' },
      { text: ' bb', hit: 'none' },
    ]);
  });

  it('marks the current match and leaves the rest of the chunk plain', () => {
    const one = buildTxtIndex('one two one');
    const found = findAll(one, 'one').matches;
    expect(chunkSegments(one, 0, found, 1)).toEqual([
      { text: 'one', hit: 'match' },
      { text: ' two ', hit: 'none' },
      { text: 'one', hit: 'current' },
    ]);
    expect(chunkSegments(one, 0, [], -1)).toEqual([{ text: 'one two one', hit: 'none' }]);
  });

  it('knows which chunks have a match at all', () => {
    expect(index.chunks).toEqual(['aaaa ne', 'edle bb', 'bb need', 'le']);
    expect(index.chunks.map((_, i) => chunkHasMatch(index, i, matches))).toEqual([true, true, true, true]);
    expect(index.chunks.map((_, i) => chunkHasMatch(index, i, findAll(index, 'aaaa').matches))).toEqual([true, false, false, false]);
    expect(chunkHasMatch(index, 0, [])).toBe(false);
  });
});

describe('places', () => {
  const index = buildTxtIndex('alpha\nbeta\ngamma\ndelta', 12);

  it('finds the chunk of a character', () => {
    expect(chunkOf(index, 0)).toBe(0);
    expect(chunkOf(index, 10)).toBe(0);
    expect(chunkOf(index, 11)).toBe(1);
    expect(chunkOf(index, 999)).toBe(1);
    expect(fractionInChunk(index, 1, 11)).toBe(0);
    expect(fractionInChunk(index, 1, 16.5)).toBe(0.5);
  });

  it('finds the first match from an offset', () => {
    const matches = [
      { start: 2, end: 5 },
      { start: 9, end: 12 },
    ];
    expect(firstMatchAfter(matches, 0)).toBe(0);
    expect(firstMatchAfter(matches, 4)).toBe(0);
    expect(firstMatchAfter(matches, 5)).toBe(1);
    expect(firstMatchAfter(matches, 12)).toBe(2);
  });

  it('places chunks by their measured heights, the rest by the average', () => {
    const heights = [100, undefined, 300, undefined];
    expect(averageHeight(heights, 50)).toBe(200);
    expect(averageHeight([], 50)).toBe(50);
    expect(chunkTop(heights, 0, 50)).toBe(0);
    expect(chunkTop(heights, 3, 50)).toBe(100 + 200 + 300);
    expect(chunkAt(heights, 4, 0, 50)).toEqual({ chunk: 0, fy: 0 });
    expect(chunkAt(heights, 4, 150, 50)).toEqual({ chunk: 1, fy: 0.25 });
    expect(chunkAt(heights, 4, 450, 50)).toEqual({ chunk: 2, fy: 0.5 });
    // Past the end, and before the start (a banner above the text).
    expect(chunkAt(heights, 4, 5000, 50)).toEqual({ chunk: 3, fy: 1 });
    expect(chunkAt(heights, 4, -40, 50)).toEqual({ chunk: 0, fy: 0 });
  });
});
