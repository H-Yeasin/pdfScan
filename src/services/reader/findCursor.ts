import type { UnitRect } from './pageSpace';

// §18 W12 (A7): Find's results across a document, and the match it is on. The search goes page by
// page from where reading is to the end, then from the start (`scanOrder`), so the first results
// are the ones nearest the reader and "3 of 27+" can be shown while the rest is still read.
// Pure, so the order, the wrap and the counts are tested without a surface.

// One page's matches in reading order; each match is its boxes (one per line it runs over) in
// fractions of the page as shown.
export type PageHits = readonly (readonly UnitRect[])[];
// Only pages with a match have an entry. Keyed by the surface's page index.
export type FindHits = ReadonlyMap<number, PageHits>;
export const NO_HITS: FindHits = new Map();

// The match Find is on: the `n`th of `page`. Not a place in the whole list: pages before it may
// still be unread, so that number moves while the search runs.
export type FindCursor = { page: number; n: number };

// Where reading is: `fy` down page `page` (surfaceGeometry.anchorOf).
export type FindPosition = { page: number; fy: number };

// The pages in the order they are searched: from `start` to the end, then the ones before it.
export function scanOrder(start: number, count: number): number[] {
  const from = Math.max(0, Math.min(start, count - 1));
  const order: number[] = [];
  for (let i = 0; i < count; i += 1) order.push((from + i) % count);
  return order;
}

function pagesOf(hits: FindHits): number[] {
  return [...hits.keys()].sort((a, b) => a - b);
}

function bottom(rects: readonly UnitRect[]): number {
  let max = 0;
  for (const r of rects) max = Math.max(max, r.y + r.height);
  return max;
}

// The first match at or after the reading position: on its page the first that isn't wholly above
// it, else the first of a later page. With none there, `wrap` gives the document's first match;
// without it null (the pages before the position are still being read: wait for a later page).
export function firstFrom(hits: FindHits, position: FindPosition, wrap: boolean): FindCursor | null {
  const pages = pagesOf(hits);
  for (const page of pages) {
    if (page < position.page) continue;
    if (page > position.page) return { page, n: 0 };
    const n = hits.get(page)!.findIndex((rects) => bottom(rects) > position.fy);
    if (n >= 0) return { page, n };
  }
  return wrap && pages.length ? { page: pages[0], n: 0 } : null;
}

// The next (or previous) match, around the ends. null with no matches. A cursor whose match is
// gone (never, while a search only adds) steps from where it would stand.
export function stepCursor(hits: FindHits, cursor: FindCursor, by: 1 | -1): FindCursor | null {
  const pages = pagesOf(hits);
  if (!pages.length) return null;
  const here = hits.get(cursor.page);
  if (here) {
    const n = cursor.n + by;
    if (n >= 0 && n < here.length) return { page: cursor.page, n };
  }
  if (by > 0) {
    const page = pages.find((p) => p > cursor.page) ?? pages[0];
    return { page, n: 0 };
  }
  // The nearest page before this one, else the last page (the wrap).
  let page = pages[pages.length - 1];
  for (const p of pages) {
    if (p < cursor.page) page = p;
    else break;
  }
  return { page, n: hits.get(page)!.length - 1 };
}

export function totalHits(hits: FindHits): number {
  let total = 0;
  for (const matches of hits.values()) total += matches.length;
  return total;
}

// The cursor's place among the matches found so far, from 1 ("3 of 27"); 0 without a cursor.
export function ordinalOf(hits: FindHits, cursor: FindCursor | null): number {
  if (!cursor || !hits.has(cursor.page)) return 0;
  let before = 0;
  for (const [page, matches] of hits) if (page < cursor.page) before += matches.length;
  return before + cursor.n + 1;
}

export type FindScan<M> = {
  // scanOrder's pages.
  order: readonly number[];
  // A page's matches. A page that can't be read has none.
  matchesOf: (page: number) => Promise<readonly M[]> | readonly M[];
  // A newer query, a closed Find or a gone surface: asked after every page, and the search stops.
  isStale: () => boolean;
  // After each page, `done` pages into `order` (1 for the first).
  onPage: (page: number, matches: readonly M[], done: number) => void;
};

// Reads the pages one at a time (memory, and the PDF engine does one thing at a time anyway).
// True when every page was read; false when the search was overtaken, and nothing was reported
// for the page it was on.
export async function scanFind<M>({ order, matchesOf, isStale, onPage }: FindScan<M>): Promise<boolean> {
  for (let i = 0; i < order.length; i += 1) {
    if (isStale()) return false;
    let matches: readonly M[] = [];
    try {
      matches = await matchesOf(order[i]);
    } catch {
      matches = [];
    }
    if (isStale()) return false;
    onPage(order[i], matches, i + 1);
  }
  return !isStale();
}
