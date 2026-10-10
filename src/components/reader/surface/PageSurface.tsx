import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { PixelRatio, StyleSheet, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { useT } from '../../../i18n/useT';
import { useScreenRole } from '../../../navigation/screenRole';
import { isPdfLevel } from '../../../services/documents/formatCapabilities';
import type { ReaderSubject } from '../../../services/documents/readerTools';
import { nightPalette, READING_SPACING_PX, type ReadingSettings } from '../../../services/documents/readingSettings';
import { DAY_PAPER } from '../../../services/reader/darkMatrix';
import { FAST_SCROLL_HIDE_MS, showsFastScroll } from '../../../services/reader/fastScroll';
import { openPageCache, prunePageCache } from '../../../services/reader/pageCache';
import { holdReader } from '../../../services/reader/readerHold';
import { isFastFling, memoryWindow, planRenders, type PageRange } from '../../../services/reader/renderPlan';
import { currentPage, pageBox, visiblePages, type ContentInsets, type SurfaceView } from '../../../services/reader/surfaceGeometry';
import { surfacePagesFor } from '../../../services/reader/surfacePages';
import { useTheme } from '../../../theme';
import { FastScroller } from './FastScroller';
import { PagePill } from './PagePill';
import { SurfacePageView } from './SurfacePageView';
import { usePdfSession } from './usePdfSession';
import { useRenderQueue } from './useRenderQueue';
import { useSurfaceGestures } from './useSurfaceGestures';
import { useSurfaceView } from './useSurfaceView';

export type PageSurfaceHandle = {
  // A library page (0-based): its top at the top of the visible band, at the present zoom.
  goToIndex: (index: number) => void;
};

type PageSurfaceProps = {
  subject: ReaderSubject;
  // `document.pdf`, or the outside file. Opened only for what is read through pdfium (an imported
  // or merged PDF, an outside file); a scan reads from its page images.
  pdfUri: string;
  // The cache folder's owner: the document's id, or the outside file's uri.
  owner: string;
  password?: string;
  reading: ReadingSettings;
  // What covers the surface's edges with the bars shown: their measured heights and the safe area.
  insets: ContentInsets;
  // The safe area alone at the bottom, where the page pill rests with the bars away.
  safeBottom: number;
  // useReaderChrome: the bars' progress (1 shown), and its scroll rule (a worklet).
  chrome: SharedValue<number>;
  onScroll: (dy: number, atStart: boolean, atEnd: boolean) => void;
  // The library page to open on (0-based). Read once.
  initialIndex: number;
  // The pages are known and the first view is in place.
  onLoad: (pageCount: number) => void;
  onPage: (index: number) => void;
  onTap: () => void;
  // The file can't be opened (usePdfSession.sessionErrorMessage's words).
  onError: (message: string) => void;
};

type Windows = { images: PageRange; thumbs: PageRange };

function sameRange(a: PageRange, b: PageRange): boolean {
  return a.first === b.first && a.last === b.last;
}

// §18 W10: the page surface, read-only. PDFs and scans as one column of pages on a single layer
// that zooms and scrolls on the UI thread (useSurfaceView, useSurfaceGestures); each page is
// plain images, rendered into the page cache by pdfium or the image decoder as the view comes to
// rest (renderPlan → useRenderQueue). Night pages are redrawn dark, not dimmed. Behind the
// `reader_surface` switch until W17; Find, selection, marks and signatures arrive in W12–W16.
export const PageSurface = forwardRef<PageSurfaceHandle, PageSurfaceProps>(function PageSurface(
  { subject, pdfUri, owner, password, reading, insets, safeBottom, chrome, onScroll, initialIndex, onLoad, onPage, onTap, onError },
  ref
) {
  const { tokens } = useTheme();
  const { t } = useT();
  const doc = subject.doc;
  const fromPdf = !doc || isPdfLevel(doc);
  const session = usePdfSession(fromPdf ? pdfUri : null, password, onError);
  // One folder per state of the file. This component is mounted again when the file is rewritten
  // (ReaderDocumentView keys it on the reload), so the folder is chosen once.
  const [cache] = useState(() => openPageCache(owner, fromPdf ? pdfUri : undefined));
  const palette = nightPalette(reading);
  const queue = useRenderQueue({ cache, session, palette });
  const { images, want, night, epoch } = queue;

  // Saving the page being read hands over a new document object each time; the pages are the
  // same array until one of them really changes.
  const docPages = doc?.pages;
  const docFormat = doc?.format;
  const docSource = doc?.sourceKind;
  const pages = useMemo(
    () => surfacePagesFor(subject, session ?? undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [docPages, docFormat, docSource, subject.external, session]
  );

  const onViewRef = useRef<(view: SurfaceView, settled: boolean) => void>(() => undefined);
  const onView = useCallback((view: SurfaceView, settled: boolean) => onViewRef.current(view, settled), []);
  const surface = useSurfaceView({
    pages,
    fit: reading.fit,
    gap: READING_SPACING_PX[reading.spacing],
    paged: reading.layout === 'paged',
    insets,
    initialIndex,
    onView,
    onScroll,
  });
  const { layout, viewport, ready, motion, goToIndex } = surface;

  const [windows, setWindows] = useState<Windows | null>(null);
  const [current, setCurrent] = useState(initialIndex);
  // The pill and the thumb: on while the pages move, off a moment after they rest.
  const [aids, setAids] = useState(false);
  const [thumbHeld, setThumbHeld] = useState(false);
  const aidsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (aidsTimer.current) clearTimeout(aidsTimer.current);
    },
    []
  );

  // The last view heard of, to tell how fast and which way the pages are going.
  const lastView = useRef<{ at: number; ty: number; scale: number; direction: number } | null>(null);
  onViewRef.current = (view, settled) => {
    const g = surface.geometry.current;
    const count = g ? Math.min(pages.length, g.layout.tops.length) : 0;
    if (!g || !count) return;
    const at = Date.now();
    const last = lastView.current;
    const steady = !!last && last.scale === view.scale;
    const dy = steady ? last.ty - view.ty : 0;
    const dt = last ? at - last.at : 0;
    // Screen pixels a second, between two reports of a movement still going.
    const speed = !settled && dt > 0 && dt < 400 ? (Math.abs(dy) / dt) * 1000 : 0;
    const direction = dy !== 0 ? Math.sign(dy) : (last?.direction ?? 0);
    lastView.current = { at, ty: view.ty, scale: view.scale, direction };

    const visible = visiblePages(g.layout, view, g.viewport);
    const next = memoryWindow({ first: visible.first, last: Math.min(visible.last, count - 1) }, count, view.scale);
    setWindows((prev) => (prev && sameRange(prev.images, next.images) && sameRange(prev.thumbs, next.thumbs) ? prev : next));
    setCurrent(Math.min(currentPage(g.layout, view, g.viewport.height, g.insets), count - 1));
    want(planRenders({ pages, layout: g.layout, view, viewport: g.viewport, insets: g.insets, pixelRatio: PixelRatio.get(), direction, fast: isFastFling(speed), night }));

    if (aidsTimer.current) clearTimeout(aidsTimer.current);
    aidsTimer.current = null;
    if (settled) {
      // Decoded images are the Reader's memory: only the pages around the view keep theirs.
      images.trim(next.images);
      aidsTimer.current = setTimeout(() => setAids(false), FAST_SCROLL_HIDE_MS);
    } else {
      setAids(true);
    }
  };

  // The queue was rebuilt (the session opened, night switched) or the pages changed: ask again.
  useEffect(() => {
    if (ready) onViewRef.current(surface.view.current, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, epoch, pages, layout]);

  // A cached file vanished under a page (the system cleared the cache): render it again, once.
  const lost = useRef(new Set<number>());
  const onLost = useCallback(
    (page: number) => {
      if (lost.current.has(page)) return;
      lost.current.add(page);
      images.forget(page);
      onViewRef.current(surface.view.current, true);
    },
    [images, surface.view]
  );

  const handlers = useRef({ onLoad, onPage });
  handlers.current = { onLoad, onPage };
  const pageCount = pages.length;
  useEffect(() => {
    if (ready && pageCount) handlers.current.onLoad(pageCount);
  }, [ready, pageCount]);
  useEffect(() => {
    if (ready) handlers.current.onPage(current);
  }, [ready, current]);

  useImperativeHandle(ref, () => ({ goToIndex }), [goToIndex]);

  // The indexer waits while this surface is the one on screen (services/reader/readerHold).
  const active = useScreenRole() === 'active';
  useEffect(() => (active ? holdReader() : undefined), [active]);
  // Closing the Reader is when the cache is trimmed: nothing is waiting for it then.
  useEffect(
    () => () => {
      setTimeout(prunePageCache, 0);
    },
    []
  );

  const gesture = useSurfaceGestures({ layout, viewport, insets, motion, onTap });
  const { scale, tx, ty } = motion;
  const layerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  const paper = palette ? palette.paper : DAY_PAPER;
  // At night the pages and what is around them are one colour; a faint line keeps them apart.
  const edge = palette ? `${palette.ink}33` : undefined;
  const label = t('reader.pageIndicator', { page: current + 1, count: pageCount });
  const mounted: number[] = [];
  if (layout && windows) {
    for (let i = windows.thumbs.first; i <= Math.min(windows.thumbs.last, pageCount - 1, layout.tops.length - 1); i += 1) mounted.push(i);
  }
  const onStep = useCallback((by: 1 | -1) => goToIndex(current + by), [goToIndex, current]);

  return (
    <View style={[styles.container, { backgroundColor: palette ? palette.paper : tokens.surface2 }]} onLayout={surface.onLayout}>
      <GestureDetector gesture={gesture}>
        <View style={styles.viewport} collapsable={false}>
          {/* Nothing but the background until the opening view is in place: no frame of page 1. */}
          {layout && ready ? (
            <Animated.View style={[styles.layer, { width: layout.width, height: layout.total }, layerStyle]}>
              {mounted.map((index) => {
                const page = pages[index];
                const box = pageBox(layout, index);
                return (
                  <SurfacePageView
                    key={page.id}
                    page={page}
                    x={box.x}
                    y={box.y}
                    width={box.width}
                    height={box.height}
                    images={images}
                    live={!!windows && index >= windows.images.first && index <= windows.images.last}
                    night={!!palette}
                    paper={paper}
                    edge={edge}
                    onLost={onLost}
                  />
                );
              })}
            </Animated.View>
          ) : null}
        </View>
      </GestureDetector>

      {ready && pageCount ? (
        <PagePill label={label} visible={aids && !thumbHeld} barHeight={insets.bottom} safeBottom={safeBottom} chrome={chrome} />
      ) : null}
      {ready && layout && viewport && showsFastScroll(pageCount) ? (
        <FastScroller
          layout={layout}
          viewport={viewport}
          insets={insets}
          motion={motion}
          visible={aids || thumbHeld}
          label={label}
          page={current + 1}
          pageCount={pageCount}
          onStep={onStep}
          onHold={setThumbHeld}
        />
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  viewport: { flex: 1, overflow: 'hidden' },
  layer: {
    position: 'absolute',
    left: 0,
    top: 0,
    // The transform zooms about the top-left corner: screen = content × scale + translate.
    transformOrigin: [0, 0, 0],
  },
});
