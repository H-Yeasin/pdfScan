import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Matrix } from '../../../services/pdf/rotation';
import type { PdfSession } from '../../../services/pdf/pdfSession';
import {
  firstFrom,
  NO_HITS,
  ordinalOf,
  scanFind,
  scanOrder,
  stepCursor,
  totalHits,
  type FindCursor,
  type FindHits,
  type FindPosition,
  type PageHits,
} from '../../../services/reader/findCursor';
import { buildPageIndex, findInPage, normalizeQuery, type PageIndex } from '../../../services/reader/findIndex';
import { mapRect, spaceToShown, type UnitRect } from '../../../services/reader/pageSpace';
import type { SurfacePage } from '../../../services/reader/surfacePages';
import type { LibraryPage, OcrBounding } from '../../../types/models';
import { loadPageWords } from './pageWords';

// Typing waits this long before a search starts.
const FIND_DEBOUNCE_MS = 150;
// While pages are still being read, the results on screen are refreshed this often at most.
const PUBLISH_MS = 200;
// A long run of pages that need no native call (stored words) hands the JS thread back this
// often, so typing and scrolling stay live.
const SLICE_MS = 12;
// Pages whose word boxes are kept between queries. Every page's text is kept (a few kB each), so
// a page without the query is passed over without reading its words again.
const INDEX_CACHE_PAGES = 48;

// What the top bar shows: the place of the match Find is on (0: none yet), how many were found,
// and whether pages are still being read ("3 of 27+").
export type SurfaceFindStatus = { current: number; total: number; scanning: boolean };

type Results = { hits: FindHits; done: boolean };
const IDLE: Results = { hits: NO_HITS, done: true };
const SEARCHING: Results = { hits: NO_HITS, done: false };

type IndexedPage = { index: PageIndex; toShown: Matrix };
const NO_WORDS: IndexedPage = { index: { text: '', spans: [] }, toShown: [1, 0, 0, 1, 0, 0] };

type Options = {
  // What to find; '' with Find closed.
  query: string;
  // The library page a search result opened Find on: the first match shown is the first from its
  // top. null: from where reading is.
  from: number | null;
  pages: readonly SurfacePage[];
  // The library pages behind `pages` (a scan's, an imported PDF's), for their stored words.
  docPages: readonly LibraryPage[] | undefined;
  session: PdfSession | null;
  // The surface's first view is in place.
  ready: boolean;
  position: () => FindPosition | null;
  // Brings a rectangle of a page (fractions of the page as shown) into view.
  reveal: (page: number, rect: UnitRect) => void;
  // null when there is no query.
  onStatus?: (status: SurfaceFindStatus | null) => void;
};

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function toUnit(rect: OcrBounding): UnitRect {
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
}

export function unionOf(rects: readonly UnitRect[]): UnitRect {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of rects) {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.width);
    y1 = Math.max(y1, r.y + r.height);
  }
  return rects.length ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : { x: 0, y: 0, width: 0, height: 0 };
}

// §18 W12 (A7): Find on the page surface. The pages' words are searched here (services/reader/
// findIndex), one page at a time from the reading position on and around to it again, and the
// matches are kept in fractions of each shown page, so the overlay draws them and `reveal` scrolls
// to them whatever the zoom, fit or turn. A new query, closing Find and leaving the surface each
// retire the search in flight (a generation token, checked between pages).
export function useSurfaceFind({ query, from, pages, docPages, session, ready, position, reveal, onStatus }: Options) {
  const [results, setResults] = useState<Results>(IDLE);
  const [cursor, setCursor] = useState<FindCursor | null>(null);
  // What the search and the step buttons read: the newest, whatever render they were made in.
  const live = useRef({ pages, docPages, session, position, reveal, onStatus });
  live.current = { pages, docPages, session, position, reveal, onStatus };
  const hitsNow = useRef<FindHits>(NO_HITS);
  const cursorNow = useRef<FindCursor | null>(null);
  const origin = useRef<FindPosition>({ page: 0, fy: 0 });
  const generation = useRef(0);

  // Per set of pages (the surface is mounted again for another file or password; a page re-read
  // by OCR or the indexer changes the set).
  const cache = useRef<{ pages: readonly SurfacePage[]; texts: Map<number, string>; indexes: Map<number, IndexedPage> } | null>(null);

  const show = useCallback((hits: FindHits, to: FindCursor | null) => {
    cursorNow.current = to;
    setCursor(to);
    const rects = to ? hits.get(to.page)?.[to.n] : undefined;
    if (to && rects) live.current.reveal(to.page, unionOf(rects));
  }, []);

  const q = normalizeQuery(query);
  const count = pages.length;
  useEffect(() => {
    generation.current += 1;
    const mine = generation.current;
    hitsNow.current = NO_HITS;
    cursorNow.current = null;
    setCursor(null);
    if (!q) {
      setResults(IDLE);
      return;
    }
    // Before the pages are known (the file still opening) the answer isn't "no matches" yet.
    setResults(SEARCHING);
    if (!ready || !count) return;

    // A page's words (pageWords.loadPageWords) and how their boxes land on the shown page.
    const load = async (index: number): Promise<IndexedPage> => {
      const { pages: all, docPages: stored, session: pdf } = live.current;
      const words = await loadPageWords(all[index], stored?.[index], pdf);
      return words.tokens.length ? { index: buildPageIndex(words.tokens), toShown: spaceToShown(words.space) } : NO_WORDS;
    };

    if (cache.current?.pages !== live.current.pages) cache.current = { pages: live.current.pages, texts: new Map(), indexes: new Map() };
    const { texts, indexes } = cache.current;
    let sliceStart = Date.now();
    const matchesOf = async (index: number): Promise<PageHits> => {
      if (Date.now() - sliceStart > SLICE_MS) {
        await tick();
        sliceStart = Date.now();
      }
      const known = texts.get(index);
      if (known !== undefined && !known.includes(q)) return [];
      let entry = indexes.get(index);
      if (!entry) {
        entry = await load(index);
        texts.set(index, entry.index.text);
        indexes.set(index, entry);
        // The oldest goes first (a Map keeps the order its keys were added in).
        if (indexes.size > INDEX_CACHE_PAGES) indexes.delete(indexes.keys().next().value as number);
      }
      const { index: words, toShown } = entry;
      return findInPage(words, q).map((match) => match.rects.map((rect) => toUnit(mapRect(toShown, rect))));
    };

    const timer = setTimeout(() => {
      const at = from !== null ? { page: from, fy: 0 } : (live.current.position() ?? { page: 0, fy: 0 });
      origin.current = at;
      const order = scanOrder(at.page, count);
      // The pages from the position to the end. Past them the search is on the pages before the
      // position, in order: with no match after the position, the first one found there is the
      // document's first, and Find starts from it.
      const forward = count - order[0];
      const found = new Map<number, PageHits>();
      let published = 0;
      let dirty = false;
      const publish = (done: boolean, wrap: boolean) => {
        const hits: FindHits = new Map(found);
        hitsNow.current = hits;
        published = Date.now();
        dirty = false;
        setResults({ hits, done });
        if (!cursorNow.current) {
          const first = firstFrom(hits, at, wrap);
          if (first) show(hits, first);
        }
      };
      scanFind<PageHits[number]>({
        order,
        matchesOf,
        isStale: () => mine !== generation.current,
        onPage: (page, matches, done) => {
          if (matches.length) {
            found.set(page, matches);
            dirty = true;
          }
          // The first match is shown at once; after that the list fills in at a steady pace.
          if (dirty && (!cursorNow.current || Date.now() - published > PUBLISH_MS)) publish(false, done > forward);
        },
      })
        .then((finished) => {
          if (finished) publish(true, true);
        })
        .catch(() => undefined);
    }, FIND_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      generation.current += 1;
    };
  }, [q, from, ready, count, session, show]);

  // Next / previous, around the ends. Before the first match is chosen it chooses it.
  const step = useCallback(
    (by: 1 | -1) => {
      const hits = hitsNow.current;
      const to = cursorNow.current ? stepCursor(hits, cursorNow.current, by) : firstFrom(hits, origin.current, true);
      if (to) show(hits, to);
    },
    [show]
  );

  const active = !!q;
  const total = useMemo(() => totalHits(results.hits), [results.hits]);
  const current = useMemo(() => ordinalOf(results.hits, cursor), [results.hits, cursor]);
  const scanning = !results.done;
  useEffect(() => {
    live.current.onStatus?.(active ? { current, total, scanning } : null);
  }, [active, current, total, scanning]);
  // The surface is mounted again when the file is rewritten: the bar's count doesn't outlive it.
  useEffect(() => () => live.current.onStatus?.(null), []);

  return { hits: results.hits, cursor, step };
}
