import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { cancelAnimation, runOnJS, useAnimatedReaction, useSharedValue, type SharedValue } from 'react-native-reanimated';
import {
  anchorOf,
  clampView,
  clampZoom,
  currentPage,
  revealRect,
  scrollRange,
  surfaceLayout,
  viewForAnchor,
  viewForPage,
  visiblePages,
  zoomAbout,
  type ContentInsets,
  type ContentRect,
  type Size,
  type SurfaceFit,
  type SurfaceLayout,
  type SurfaceView,
} from '../../../services/reader/surfaceGeometry';

// §18 W10: the surface's zoom and position. Three shared values move the page layer on the UI
// thread (screen = content × scale + t); React hears about it only when it has something to do:
// the set of pages on screen changed (`onView(view, false)`), or the movement ended
// (`onView(view, true)`: time to render what is there).

export type SurfaceGeometry = { layout: SurfaceLayout; viewport: Size; insets: ContentInsets };

export type SurfaceMotion = {
  scale: SharedValue<number>;
  tx: SharedValue<number>;
  ty: SharedValue<number>;
  // A gesture or its fling is moving the view. Only then does the UI thread report.
  moving: SharedValue<boolean>;
  // Worklet: the movement is over.
  settled: () => void;
};

type Options = {
  // Only the pages' shapes matter here.
  pages: readonly { shownW: number; shownH: number }[];
  fit: SurfaceFit;
  gap: number;
  paged: boolean;
  insets: ContentInsets;
  // The page to open on, and how far down it (0..1; §18 W19). Read once, when the first layout
  // exists.
  initialIndex: number;
  initialFy?: number;
  onView: (view: SurfaceView, settled: boolean) => void;
  // Worklet (useReaderChrome's `scrolled`): the finger scrolled by `dy` screen pixels.
  onScroll: (dy: number, atStart: boolean, atEnd: boolean) => void;
};

// What the UI thread watches for: the pages on screen and the one being read, as one number.
function pagesKey(first: number, last: number, current: number): number {
  'worklet';
  return (first * 131072 + last) * 131072 + current;
}

export function useSurfaceView({ pages, fit, gap, paged, insets, initialIndex, initialFy = 0, onView, onScroll }: Options) {
  const [viewport, setViewport] = useState<Size | null>(null);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setViewport((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
  }, []);

  const layout = useMemo(
    () => (viewport && pages.length ? surfaceLayout(pages, { viewport, insets, fit, gap, paged }) : null),
    [pages, viewport, insets, fit, gap, paged]
  );

  const scale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const moving = useSharedValue(false);

  // The view as React last heard it: exact at rest, a little behind during a fling.
  const view = useRef<SurfaceView>({ scale: 1, tx: 0, ty: 0 });
  const geometry = useRef<SurfaceGeometry | null>(null);
  const [ready, setReady] = useState(false);

  const listener = useRef(onView);
  listener.current = onView;
  const emit = useCallback((s: number, x: number, y: number, settled: boolean) => {
    view.current = { scale: s, tx: x, ty: y };
    listener.current(view.current, settled);
  }, []);

  // Puts the view somewhere at once (no animation), and says so.
  const place = useCallback(
    (to: SurfaceView) => {
      cancelAnimation(scale);
      cancelAnimation(tx);
      cancelAnimation(ty);
      scale.value = to.scale;
      tx.value = to.tx;
      ty.value = to.ty;
      moving.value = false;
      emit(to.scale, to.tx, to.ty, true);
    },
    [scale, tx, ty, moving, emit]
  );

  // §18 A12: the first view is worked out before any page paints, so the document opens where it
  // was left with no frame of page 1. Afterwards, whatever changes the layout (the bars measured,
  // another fit or gap, paged on or off, a rotation, pages added by the indexer) keeps the point
  // at the top of the visible band where it was.
  useLayoutEffect(() => {
    if (!layout || !viewport) return;
    const prev = geometry.current;
    geometry.current = { layout, viewport, insets };
    if (!prev) {
      // Page by page a page is shown whole; in a scroll the saved point of it goes to the top.
      if (initialFy > 0 && !layout.slots) place(viewForAnchor(layout, { page: initialIndex, fx: 0, fy: initialFy }, 1, viewport, insets));
      else place(viewForPage(layout, initialIndex, { scale: 1, tx: insets.left, ty: insets.top }, viewport, insets));
      setReady(true);
      return;
    }
    const now = view.current;
    // Page by page and not zoomed in: the page being read, centred in its stretch.
    if (layout.slots && now.scale <= 1.01) {
      const page = currentPage(prev.layout, now, prev.viewport.height, prev.insets);
      place(viewForPage(layout, page, { scale: 1, tx: insets.left, ty: insets.top }, viewport, insets));
      return;
    }
    place(viewForAnchor(layout, anchorOf(prev.layout, now, prev.insets), now.scale, viewport, insets));
    // `initialIndex` is the opening page only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, viewport, insets, place]);

  const goToIndex = useCallback(
    (index: number) => {
      const g = geometry.current;
      if (g) place(viewForPage(g.layout, index, view.current, g.viewport, g.insets));
    },
    [place]
  );

  // §18 W12: brings a content rectangle (a Find match, a flashed mark) into the visible band,
  // moving as little as it can and not at all when it is there. `bottomCover` is what covers the
  // bottom beyond the bar (the keyboard while Find is typed in).
  const reveal = useCallback(
    (rect: ContentRect, bottomCover = 0) => {
      const g = geometry.current;
      if (!g) return;
      const insets = bottomCover > g.insets.bottom ? { ...g.insets, bottom: bottomCover } : g.insets;
      const to = revealRect(g.layout, view.current, rect, g.viewport, insets);
      if (to !== view.current) place(to);
    },
    [place]
  );

  // §18 W11: a zoom step without a pinch (a screen reader's "Zoom in" / "Zoom out"), about the
  // middle of the visible band.
  const zoomBy = useCallback(
    (factor: number) => {
      const g = geometry.current;
      if (!g) return;
      const now = view.current;
      const x = (g.insets.left + g.viewport.width - g.insets.right) / 2;
      const y = (g.insets.top + g.viewport.height - g.insets.bottom) / 2;
      const to = clampView(g.layout, zoomAbout(now, clampZoom(now.scale * factor), x, y), g.viewport, g.insets);
      // Zoomed back out page by page: onto the page, not between two.
      if (g.layout.slots && to.scale <= 1.01) place(viewForPage(g.layout, currentPage(g.layout, now, g.viewport.height, g.insets), to, g.viewport, g.insets));
      else place(to);
    },
    [place]
  );

  const settled = useCallback(() => {
    'worklet';
    moving.value = false;
    runOnJS(emit)(scale.value, tx.value, ty.value, true);
  }, [moving, scale, tx, ty, emit]);

  useAnimatedReaction(
    () => {
      if (!layout || !viewport) return -1;
      const now = { scale: scale.value, tx: tx.value, ty: ty.value };
      const shown = visiblePages(layout, now, viewport);
      return pagesKey(shown.first, shown.last, currentPage(layout, now, viewport.height, insets));
    },
    (key, prev) => {
      if (key >= 0 && prev !== null && key !== prev && moving.value) runOnJS(emit)(scale.value, tx.value, ty.value, false);
    },
    [layout, viewport, insets]
  );

  // A movement that never leaves its pages still says that it began: the page pill and the thumb
  // show for any scroll.
  useAnimatedReaction(
    () => moving.value,
    (now, prev) => {
      if (now && prev === false) runOnJS(emit)(scale.value, tx.value, ty.value, false);
    },
    [emit]
  );

  // The bars follow the finger's scroll (services/reader/chromeState), not a zoom: a pinch moves
  // `ty` too, by far more than any scroll.
  const lastScale = useSharedValue(1);
  useAnimatedReaction(
    () => ty.value,
    (now, prev) => {
      if (prev === null || !layout || !viewport || !moving.value) return;
      if (scale.value !== lastScale.value) {
        lastScale.value = scale.value;
        return;
      }
      const range = scrollRange(layout, scale.value, viewport, insets);
      onScroll(prev - now, now >= range.maxTy - 0.5, now <= range.minTy + 0.5);
    },
    [layout, viewport, insets, onScroll]
  );

  const motion = useMemo<SurfaceMotion>(() => ({ scale, tx, ty, moving, settled }), [scale, tx, ty, moving, settled]);
  return { onLayout, viewport, layout, ready, motion, view, geometry, goToIndex, reveal, zoomBy };
}
