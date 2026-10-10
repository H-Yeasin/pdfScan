import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Alert, Linking, PixelRatio, StyleSheet, View, type AccessibilityActionInfo } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { useT } from '../../../i18n/useT';
import { useScreenRole } from '../../../navigation/screenRole';
import { isPdfLevel } from '../../../services/documents/formatCapabilities';
import type { ReaderSubject } from '../../../services/documents/readerTools';
import { nightPalette, READING_SPACING_PX, type ReadingSettings } from '../../../services/documents/readingSettings';
import type { PdfLink } from '../../../services/pdf/pdfNative';
import { DAY_PAPER } from '../../../services/reader/darkMatrix';
import { FAST_SCROLL_HIDE_MS, showsFastScroll } from '../../../services/reader/fastScroll';
import { LINK_SLOP, linkAt, linkTarget, shownUrl, tapOnPage } from '../../../services/reader/links';
import { currentSection, flattenOutline, type OutlineEntry } from '../../../services/reader/outline';
import { openPageCache, prunePageCache } from '../../../services/reader/pageCache';
import { holdReader } from '../../../services/reader/readerHold';
import { isFastFling, memoryWindow, planRenders, type PageRange } from '../../../services/reader/renderPlan';
import { currentPage, pageBox, visiblePages, type ContentInsets, type SurfaceView } from '../../../services/reader/surfaceGeometry';
import { surfacePagesFor } from '../../../services/reader/surfacePages';
import { useAppDispatch } from '../../../store/AppStateContext';
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
  // §18 W11: a library page's text ('' for none): a scan's OCR text, a PDF page's own.
  pageText: (index: number) => Promise<string>;
};

// §18 W11 (A14): what a screen reader offers on a page. Named actions with labels, shown in its
// actions menu: React Native has no standard "scroll forward" action for a plain view.
type PageAction = 'next' | 'previous' | 'zoomIn' | 'zoomOut' | 'readText';
const PAGE_ZOOM_STEP = 1.5;
// The page come to rest on is said after this long without another movement.
const ANNOUNCE_AFTER_MS = 600;
const NO_LINKS: PdfLink[] = [];

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
  // A tap that was not on a link.
  onTap: () => void;
  // §18 W11: the PDF's contents, flattened ([] when it has none, and again when this unmounts).
  onOutline?: (entries: OutlineEntry[]) => void;
  // A screen reader's "Read page text" on a library page.
  onReadText: (index: number) => void;
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
// §18 W11: a tap is routed here (a PDF link under it jumps, or asks before leaving the app; else
// it is the Reader's), the outline is read for the Contents tab and the thumb's bubble, and each
// page is an element a screen reader can name, turn, zoom and read.
export const PageSurface = forwardRef<PageSurfaceHandle, PageSurfaceProps>(function PageSurface(
  { subject, pdfUri, owner, password, reading, insets, safeBottom, chrome, onScroll, initialIndex, onLoad, onPage, onTap, onOutline, onReadText, onError },
  ref
) {
  const { tokens } = useTheme();
  const { t } = useT();
  const dispatch = useAppDispatch();
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
  const { layout, viewport, ready, motion, goToIndex, zoomBy } = surface;

  const [windows, setWindows] = useState<Windows | null>(null);
  const [current, setCurrent] = useState(initialIndex);
  // The pill and the thumb: on while the pages move, off a moment after they rest.
  const [aids, setAids] = useState(false);
  const [thumbHeld, setThumbHeld] = useState(false);
  const aidsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The page last said to a screen reader (null before the opening view), and the wait to say
  // the next one.
  const said = useRef<number | null>(null);
  const sayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (aidsTimer.current) clearTimeout(aidsTimer.current);
      if (sayTimer.current) clearTimeout(sayTimer.current);
    },
    []
  );

  const handlers = useRef({ onLoad, onPage, onTap, onOutline, onReadText });
  handlers.current = { onLoad, onPage, onTap, onOutline, onReadText };

  // §18 W11: the outline, read once the session is open.
  const [outline, setOutline] = useState<OutlineEntry[]>([]);
  useEffect(() => {
    if (!session?.hasOutline) return;
    let cancelled = false;
    session
      .outline()
      .then((items) => {
        if (cancelled) return;
        const entries = flattenOutline(items, session.pageCount);
        setOutline(entries);
        handlers.current.onOutline?.(entries);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      // The file may be rewritten without its outline (the surface is mounted again for it).
      handlers.current.onOutline?.([]);
    };
  }, [session]);

  // §18 W11: a PDF page's links, read once per page as it comes to rest on screen, so a tap
  // finds them there. A page that fails to give its links has none.
  const links = useRef(new Map<number, PdfLink[] | Promise<PdfLink[]>>());
  const linksOf = useCallback(
    (index: number): PdfLink[] | Promise<PdfLink[]> => {
      const page = pages[index];
      if (!session || !page || page.source.kind !== 'pdf') return NO_LINKS;
      const known = links.current.get(index);
      if (known) return known;
      const loading = session
        .pageLinks(page.source.page)
        .catch(() => NO_LINKS)
        .then((found) => {
          links.current.set(index, found);
          return found;
        });
      links.current.set(index, loading);
      return loading;
    },
    [session, pages]
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
    const onPageNow = Math.min(currentPage(g.layout, view, g.viewport.height, g.insets), count - 1);
    setCurrent(onPageNow);
    want(planRenders({ pages, layout: g.layout, view, viewport: g.viewport, insets: g.insets, pixelRatio: PixelRatio.get(), direction, fast: isFastFling(speed), night }));

    if (aidsTimer.current) clearTimeout(aidsTimer.current);
    aidsTimer.current = null;
    if (sayTimer.current) clearTimeout(sayTimer.current);
    sayTimer.current = null;
    if (settled) {
      for (let i = visible.first; i <= Math.min(visible.last, count - 1); i += 1) void linksOf(i);
      // A14: the page come to rest on is announced (not the one the document opens on: the top
      // bar has it). Waiting a moment keeps a run of short scrolls to one announcement.
      if (said.current === null) said.current = onPageNow;
      else if (said.current !== onPageNow) {
        sayTimer.current = setTimeout(() => {
          said.current = onPageNow;
          AccessibilityInfo.announceForAccessibility(t('a11y.pageOf', { n: onPageNow + 1, total: count }));
        }, ANNOUNCE_AFTER_MS);
      }
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

  const pageCount = pages.length;
  useEffect(() => {
    if (ready && pageCount) handlers.current.onLoad(pageCount);
  }, [ready, pageCount]);
  useEffect(() => {
    if (ready) handlers.current.onPage(current);
  }, [ready, current]);

  const pageText = useCallback(
    async (index: number) => {
      const page = pages[index];
      if (!page) return '';
      const stored = page.words === 'ocr' ? (doc?.pages[index]?.ocr?.text ?? '') : '';
      if (stored.trim() || !session || page.source.kind !== 'pdf') return stored;
      return (await session.pageText(page.source.page)).text;
    },
    [pages, doc, session]
  );
  useImperativeHandle(ref, () => ({ goToIndex, pageText }), [goToIndex, pageText]);

  // §18 W11: a link out of the app is never followed on the tap: the address is shown first.
  const askLink = useCallback(
    (url: string) => {
      Alert.alert(
        t('reader.link.title'),
        shownUrl(url),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('reader.link.copy'),
            onPress: () => {
              Clipboard.setStringAsync(url)
                .then(() => dispatch({ type: 'ui/SHOW_SNACK', msg: t('reader.link.copied') }))
                .catch(() => undefined);
            },
          },
          {
            text: t('reader.link.open'),
            onPress: () => {
              Linking.openURL(url).catch(() => dispatch({ type: 'ui/SHOW_SNACK', msg: t('reader.link.cantOpen') }));
            },
          },
        ],
        { cancelable: true }
      );
    },
    [t, dispatch]
  );

  // A5's tap routing, as far as the surface has it: a link under the finger, else the Reader's
  // tap (the bars). W13 puts an open selection first.
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    []
  );
  const onSurfaceTap = useCallback(
    (x: number, y: number) => {
      const g = surface.geometry.current;
      const hit = g ? tapOnPage(g.layout, surface.view.current, x, y) : null;
      const page = hit ? pages[hit.index] : undefined;
      if (!hit || !page || page.source.kind !== 'pdf') {
        handlers.current.onTap();
        return;
      }
      // Links are in the page's shown points, like the page's own size.
      const { pointsW, pointsH } = page.source;
      const route = (found: readonly PdfLink[]) => {
        const link = linkAt(found, hit.fx * pointsW, hit.fy * pointsH, (LINK_SLOP / hit.width) * pointsW);
        const target = link ? linkTarget(link, pages.length) : null;
        if (!target) handlers.current.onTap();
        else if (target.kind === 'page') goToIndex(target.page);
        else askLink(target.url);
      };
      const found = linksOf(hit.index);
      if (Array.isArray(found)) route(found);
      else {
        found.then((loaded) => {
          if (alive.current) route(loaded);
        });
      }
    },
    [surface.geometry, surface.view, pages, linksOf, goToIndex, askLink]
  );

  const step = useCallback((index: number) => goToIndex(Math.max(0, Math.min(pages.length - 1, index))), [goToIndex, pages.length]);
  const pageActions = useMemo<AccessibilityActionInfo[]>(
    () =>
      (['next', 'previous', 'zoomIn', 'zoomOut', 'readText'] satisfies PageAction[]).map((name) => ({ name, label: t(`reader.pageActions.${name}`) })),
    [t]
  );
  const onPageAction = useCallback(
    (index: number, action: string) => {
      switch (action as PageAction) {
        case 'next':
          return step(index + 1);
        case 'previous':
          return step(index - 1);
        case 'zoomIn':
          return zoomBy(PAGE_ZOOM_STEP);
        case 'zoomOut':
          return zoomBy(1 / PAGE_ZOOM_STEP);
        case 'readText':
          return handlers.current.onReadText(index);
      }
    },
    [step, zoomBy]
  );

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

  const gesture = useSurfaceGestures({ layout, viewport, insets, motion, onTap: onSurfaceTap });
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
  const onStep = useCallback((by: 1 | -1) => step(current + by), [step, current]);

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
                    label={t('a11y.pageOf', { n: index + 1, total: pageCount })}
                    actions={pageActions}
                    onAction={onPageAction}
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
          section={currentSection(outline, current)?.title}
          value={t('a11y.pageOf', { n: current + 1, total: pageCount })}
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
