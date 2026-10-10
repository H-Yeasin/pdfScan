import { firstFrom, NO_HITS, ordinalOf, scanFind, scanOrder, stepCursor, totalHits, type FindHits, type PageHits } from '../findCursor';

// A match as one box whose top is `y` down the page.
const at = (...ys: number[]): PageHits => ys.map((y) => [{ x: 0.1, y, width: 0.2, height: 0.02 }]);
const hits = (entries: Record<number, PageHits>): FindHits => new Map(Object.entries(entries).map(([page, matches]) => [Number(page), matches]));

describe('scanOrder', () => {
  it('goes from the position to the end, then from the start', () => {
    expect(scanOrder(2, 5)).toEqual([2, 3, 4, 0, 1]);
    expect(scanOrder(0, 3)).toEqual([0, 1, 2]);
  });

  it('keeps the start inside the document', () => {
    expect(scanOrder(9, 3)).toEqual([2, 0, 1]);
    expect(scanOrder(-1, 2)).toEqual([0, 1]);
    expect(scanOrder(0, 0)).toEqual([]);
  });
});

describe('firstFrom', () => {
  const found = hits({ 1: at(0.2), 3: at(0.1, 0.5, 0.9), 6: at(0.3) });

  it('takes the first match not above the reading position on its page', () => {
    expect(firstFrom(found, { page: 3, fy: 0 }, false)).toEqual({ page: 3, n: 0 });
    expect(firstFrom(found, { page: 3, fy: 0.3 }, false)).toEqual({ page: 3, n: 1 });
    // A match the position cuts through still counts: part of it is on screen.
    expect(firstFrom(found, { page: 3, fy: 0.51 }, false)).toEqual({ page: 3, n: 1 });
  });

  it('goes on to a later page when the rest of the page has none', () => {
    expect(firstFrom(found, { page: 3, fy: 0.95 }, false)).toEqual({ page: 6, n: 0 });
    expect(firstFrom(found, { page: 4, fy: 0 }, false)).toEqual({ page: 6, n: 0 });
  });

  it('wraps to the first match only once the pages before the position are in', () => {
    expect(firstFrom(found, { page: 7, fy: 0 }, false)).toBeNull();
    expect(firstFrom(found, { page: 7, fy: 0 }, true)).toEqual({ page: 1, n: 0 });
    expect(firstFrom(NO_HITS, { page: 0, fy: 0 }, true)).toBeNull();
  });
});

describe('stepCursor', () => {
  const found = hits({ 1: at(0.2), 3: at(0.1, 0.5), 6: at(0.3) });

  it('moves within a page, then to the next page with a match', () => {
    expect(stepCursor(found, { page: 3, n: 0 }, 1)).toEqual({ page: 3, n: 1 });
    expect(stepCursor(found, { page: 3, n: 1 }, 1)).toEqual({ page: 6, n: 0 });
    expect(stepCursor(found, { page: 3, n: 0 }, -1)).toEqual({ page: 1, n: 0 });
    expect(stepCursor(found, { page: 6, n: 0 }, -1)).toEqual({ page: 3, n: 1 });
  });

  it('wraps around both ends', () => {
    expect(stepCursor(found, { page: 6, n: 0 }, 1)).toEqual({ page: 1, n: 0 });
    expect(stepCursor(found, { page: 1, n: 0 }, -1)).toEqual({ page: 6, n: 0 });
  });

  it('stays on a lone match and has nowhere to go without any', () => {
    const one = hits({ 4: at(0.5) });
    expect(stepCursor(one, { page: 4, n: 0 }, 1)).toEqual({ page: 4, n: 0 });
    expect(stepCursor(one, { page: 4, n: 0 }, -1)).toEqual({ page: 4, n: 0 });
    expect(stepCursor(NO_HITS, { page: 4, n: 0 }, 1)).toBeNull();
  });
});

describe('counts', () => {
  it('counts every match and places the cursor among them', () => {
    const found = hits({ 1: at(0.2), 3: at(0.1, 0.5), 6: at(0.3) });
    expect(totalHits(found)).toBe(4);
    expect(ordinalOf(found, { page: 1, n: 0 })).toBe(1);
    expect(ordinalOf(found, { page: 3, n: 1 })).toBe(3);
    expect(ordinalOf(found, { page: 6, n: 0 })).toBe(4);
    expect(ordinalOf(found, null)).toBe(0);
  });

  it('counts what is found so far while pages are still being read', () => {
    // Searching from page 3: pages 3 and 6 are in, page 1 is not yet.
    const partial = hits({ 3: at(0.1, 0.5), 6: at(0.3) });
    expect(totalHits(partial)).toBe(3);
    expect(ordinalOf(partial, { page: 3, n: 0 })).toBe(1);
    // Page 1 arrives: the same match is now the second, whatever order the pages came in.
    const whole = new Map(partial).set(1, at(0.2));
    expect(totalHits(whole)).toBe(4);
    expect(ordinalOf(whole, { page: 3, n: 0 })).toBe(2);
  });
});

describe('scanFind', () => {
  it('reads the pages in order, one at a time, and reports each', async () => {
    const seen: [number, string[], number][] = [];
    let running = 0;
    const finished = await scanFind<string>({
      order: [2, 0, 1],
      matchesOf: async (page) => {
        running += 1;
        expect(running).toBe(1);
        await Promise.resolve();
        running -= 1;
        return page === 0 ? ['a', 'b'] : [];
      },
      isStale: () => false,
      onPage: (page, matches, done) => seen.push([page, [...matches], done]),
    });
    expect(finished).toBe(true);
    expect(seen).toEqual([
      [2, [], 1],
      [0, ['a', 'b'], 2],
      [1, [], 3],
    ]);
  });

  it('stops when a newer search overtakes it and reports nothing more', async () => {
    let generation = 1;
    const mine = generation;
    const seen: number[] = [];
    const finished = await scanFind<string>({
      order: [0, 1, 2, 3],
      matchesOf: async (page) => {
        // The query changes while page 1 is being read.
        if (page === 1) generation += 1;
        return ['x'];
      },
      isStale: () => mine !== generation,
      onPage: (page) => seen.push(page),
    });
    expect(finished).toBe(false);
    expect(seen).toEqual([0]);
  });

  it('reads nothing when it is stale from the start', async () => {
    const matchesOf = jest.fn(() => ['x']);
    expect(await scanFind({ order: [0, 1], matchesOf, isStale: () => true, onPage: () => undefined })).toBe(false);
    expect(matchesOf).not.toHaveBeenCalled();
  });

  it('takes a page that cannot be read as one without matches', async () => {
    const seen: [number, number][] = [];
    const finished = await scanFind<string>({
      order: [0, 1],
      matchesOf: (page) => {
        if (page === 0) throw new Error('unreadable');
        return ['x'];
      },
      isStale: () => false,
      onPage: (page, matches) => seen.push([page, matches.length]),
    });
    expect(finished).toBe(true);
    expect(seen).toEqual([
      [0, 0],
      [1, 1],
    ]);
  });
});
