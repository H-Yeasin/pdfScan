import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useSharedValue } from 'react-native-reanimated';
import { wordRects } from '../../../services/annotations/snap';
import type { PdfSession } from '../../../services/pdf/pdfSession';
import { tapOnPage } from '../../../services/reader/links';
import { boxToSpace, mapPoint, mapRect, overlayMatrix, spaceScale } from '../../../services/reader/pageSpace';
import {
  dragHandle,
  HANDLE_NUDGE,
  handlePoints,
  rangeOf,
  selectAll as wholePage,
  tokensIn,
  WORD_SLOP,
  wordNear,
  type HandlePoints,
  type SelectionHandle,
  type SelectionRange,
} from '../../../services/reader/selection';
import { pageBox, screenToContent, type ContentRect, type SurfaceLayout, type SurfaceView } from '../../../services/reader/surfaceGeometry';
import type { SurfacePage } from '../../../services/reader/surfacePages';
import { tokenAt } from '../../../services/study/textSelection';
import type { LibraryPage, OcrBounding } from '../../../types/models';
import { loadPageWords, type PageWords } from './pageWords';
import type { HandleDrag } from './useSurfaceGestures';
import type { SurfaceGeometry } from './useSurfaceView';

// The words selected on library page `page`: a run of that page's tokens (`words`, kept from when
// the selection was made, so it reads the same whatever the store does meanwhile).
export type SurfaceSelection = { page: number; pageId: string; words: PageWords; range: SelectionRange };
// A long press on a page that has no words: where, in content coordinates.
export type EmptyPress = { page: number; x: number; y: number };

type Options = {
  pages: readonly SurfacePage[];
  // The library pages behind `pages`, for their stored words.
  docPages: readonly LibraryPage[] | undefined;
  session: PdfSession | null;
  layout: SurfaceLayout | null;
  geometry: RefObject<SurfaceGeometry | null>;
  // The view as React last heard it (exact at rest): what a tap is placed with.
  view: RefObject<SurfaceView>;
  // The "Select text" tool is on: a tap selects the word under it. `current`: the page being
  // read, whose lack of text the tool's bar reports.
  selecting: boolean;
  current: number;
};

function toContent(rect: OcrBounding): ContentRect {
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
}

function unionOf(rects: readonly ContentRect[]): ContentRect {
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
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

// §18 W13 (A8): the selection on the page surface. One page per selection. A long press takes a
// word (services/reader/selection); the handles then move its ends, each read from where the
// handle's tip is, not the finger that hangs under it. Everything is kept as tokens of the page
// and turned into content rectangles only to draw, so the selection follows any zoom, fit or turn
// for free.
export function useSurfaceSelection({ pages, docPages, session, layout, geometry, view, selecting, current }: Options) {
  const [selection, setSelection] = useState<SurfaceSelection | null>(null);
  const [empty, setEmpty] = useState<EmptyPress | null>(null);
  const [dragging, setDragging] = useState(false);
  const live = useRef({ pages, docPages, session, selection, empty, selecting });
  live.current = { pages, docPages, session, selection, empty, selecting };
  // Only the newest press's words are used: a page's text may take a moment to read.
  const request = useRef(0);

  // A page's words, read once per set of pages (a page re-read by OCR changes the set).
  const cache = useRef<{ pages: readonly SurfacePage[]; words: Map<number, Promise<PageWords>> } | null>(null);
  const wordsOf = useCallback((index: number): Promise<PageWords> => {
    const { pages: all, docPages: stored, session: pdf } = live.current;
    if (cache.current?.pages !== all) cache.current = { pages: all, words: new Map() };
    const { words } = cache.current;
    let loading = words.get(index);
    if (!loading) {
      loading = loadPageWords(all[index], stored?.[index], pdf);
      words.set(index, loading);
      // A read that failed is tried again by the next press.
      loading.catch(() => words.delete(index));
    }
    return loading;
  }, []);

  const clear = useCallback(() => {
    request.current += 1;
    setSelection(null);
    setEmpty(null);
    setDragging(false);
  }, []);

  // The pages changed under the selection (pages edited, another file's rows): it goes.
  const selectedId = selection ? pages[selection.page]?.id : undefined;
  useEffect(() => {
    if (selection && selectedId !== selection.pageId) clear();
  }, [selection, selectedId, clear]);
  useEffect(() => {
    if (empty && empty.page >= pages.length) setEmpty(null);
  }, [empty, pages.length]);

  // The word at a point of the viewport. `strict`: a long press, which also notes a page with
  // nothing to select; a tap in the Select tool just selects or clears.
  const pick = useCallback(
    (x: number, y: number, at: SurfaceView, strict: boolean) => {
      const g = geometry.current;
      const hit = g ? tapOnPage(g.layout, at, x, y) : null;
      if (!g || !hit || hit.fx < 0 || hit.fx > 1 || hit.fy < 0 || hit.fy > 1) {
        if (!strict) clear();
        return;
      }
      request.current += 1;
      const mine = request.current;
      const page = live.current.pages[hit.index];
      wordsOf(hit.index)
        .then((words) => {
          if (mine !== request.current || live.current.pages[hit.index] !== page) return;
          const point = screenToContent(at, x, y);
          if (!words.tokens.length) {
            setSelection(null);
            setEmpty(strict ? { page: hit.index, x: point.x, y: point.y } : null);
            return;
          }
          const box = pageBox(g.layout, hit.index);
          const p = mapPoint(boxToSpace(box, words.space), point.x, point.y);
          const word = wordNear(words.tokens, p.x, p.y, WORD_SLOP / (at.scale * spaceScale(box, words.space)));
          setEmpty(null);
          if (word) setSelection({ page: hit.index, pageId: page.id, words, range: rangeOf(word) });
          else if (!strict) setSelection(null);
        })
        .catch(() => undefined);
    },
    [geometry, wordsOf, clear]
  );

  const longPress = useCallback((x: number, y: number, scale: number, tx: number, ty: number) => pick(x, y, { scale, tx, ty }, true), [pick]);

  // A5's tap routing, first rule: with a selection (or the menu of a page without text) open,
  // the tap closes it; in the Select tool it selects the word under it instead. true: the tap
  // was the selection's.
  const tap = useCallback(
    (x: number, y: number): boolean => {
      const { selection: open, empty: menu, selecting: tool } = live.current;
      if (tool) {
        pick(x, y, view.current, false);
        return true;
      }
      if (!open && !menu) return false;
      clear();
      return true;
    },
    [pick, clear, view]
  );

  // The handle in the hand (it changes when the two cross), and how far the finger is from the
  // handle's tip, so the tip doesn't jump to the finger when the drag begins.
  const held = useRef<{ handle: SelectionHandle; dx: number; dy: number } | null>(null);
  const tips = useRef<HandlePoints | null>(null);
  const onHandle = useCallback(
    (phase: HandleDrag, handle: SelectionHandle, x: number, y: number, scale: number, tx: number, ty: number) => {
      const open = live.current.selection;
      const g = geometry.current;
      if (phase === 'drop' || !open || !g) {
        held.current = null;
        setDragging(false);
        return;
      }
      if (phase === 'grab' || !held.current) {
        const tip = tips.current?.[handle];
        held.current = { handle, dx: tip ? x - (tip.x * scale + tx) : 0, dy: tip ? y - (tip.y * scale + ty) : 0 };
        setDragging(true);
        if (phase === 'grab') return;
      }
      const grip = held.current;
      const box = pageBox(g.layout, open.page);
      const point = screenToContent({ scale, tx, ty }, x - grip.dx, y - grip.dy - HANDLE_NUDGE);
      const p = mapPoint(boxToSpace(box, open.words.space), point.x, point.y);
      const token = tokenAt(open.words.tokens, p.x, p.y);
      if (!token) return;
      const moved = dragHandle(open.range, grip.handle, token.order);
      grip.handle = moved.handle;
      if (moved.range !== open.range) setSelection({ ...open, range: moved.range });
    },
    [geometry]
  );

  const selectAll = useCallback(() => {
    const open = live.current.selection;
    const range = open ? wholePage(open.words.tokens) : null;
    if (open && range) setSelection({ ...open, range });
  }, []);

  // What is drawn and what the menu sits by, in content coordinates.
  const tokens = useMemo(() => (selection ? tokensIn(selection.words.tokens, selection.range) : []), [selection]);
  const drawn = useMemo(() => {
    if (!selection || !layout || !tokens.length || selection.page >= layout.tops.length) return null;
    const toBox = overlayMatrix(pageBox(layout, selection.page), selection.words.space);
    // One box per line, like the mark a highlight of it would be.
    const rects = wordRects(tokens).rects.map((rect) => toContent(mapRect(toBox, rect)));
    const handles = handlePoints(toContent(mapRect(toBox, tokens[0].bounding)), toContent(mapRect(toBox, tokens[tokens.length - 1].bounding)));
    return { rects, handles, bounds: unionOf(rects) };
  }, [selection, layout, tokens]);

  // The gesture worklet hit-tests the handles against this.
  const handles = useSharedValue<HandlePoints | null>(null);
  const points = drawn?.handles ?? null;
  tips.current = points;
  useEffect(() => {
    handles.value = points;
  }, [points, handles]);

  // The Select tool's bar says when the page being read has nothing to select.
  const [textOn, setTextOn] = useState<{ page: number; pages: readonly SurfacePage[]; has: boolean } | null>(null);
  useEffect(() => {
    if (!selecting || current >= pages.length) return;
    let cancelled = false;
    wordsOf(current)
      .then((words) => {
        if (!cancelled) setTextOn({ page: current, pages, has: words.tokens.length > 0 });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [selecting, current, pages, wordsOf]);
  // null: not known (yet).
  const currentHasText = selecting && textOn && textOn.page === current && textOn.pages === pages ? textOn.has : null;

  return { selection, tokens, drawn, empty, dragging, handles, currentHasText, longPress, tap, onHandle, selectAll, clear };
}
