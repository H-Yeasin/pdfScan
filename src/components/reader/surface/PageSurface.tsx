import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Alert, Keyboard, Linking, PixelRatio, StyleSheet, View, type AccessibilityActionInfo } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { useT } from '../../../i18n/useT';
import { useBackHandler } from '../../../navigation/useBackHandler';
import { useScreenRole } from '../../../navigation/screenRole';
import { isPdfLevel } from '../../../services/documents/formatCapabilities';
import type { NativePdfErrorCode } from '../../../services/documents/readerPosition';
import type { ReaderSubject } from '../../../services/documents/readerTools';
import { nightPalette, READING_SPACING_PX, type ReadingSettings } from '../../../services/documents/readingSettings';
import type { PdfLink } from '../../../services/pdf/pdfNative';
import { DAY_PAPER, nightColor, skiaNightMatrix } from '../../../services/reader/darkMatrix';
import { FAST_SCROLL_HIDE_MS, showsFastScroll } from '../../../services/reader/fastScroll';
import { hasReadingTaps, panMode, type SurfaceTool } from '../../../services/reader/gestureArbiter';
import { LINK_SLOP, linkAt, linkTarget, shownUrl, tapOnPage } from '../../../services/reader/links';
import { currentSection, flattenOutline, type OutlineEntry } from '../../../services/reader/outline';
import { openPageCache, prunePageCache } from '../../../services/reader/pageCache';
import { boxToSpace, mapRect, spaceScale, spaceToShown, type UnitRect } from '../../../services/reader/pageSpace';
import { holdReader } from '../../../services/reader/readerHold';
import { isFastFling, memoryWindow, planRenders, type PageRange } from '../../../services/reader/renderPlan';
import { selectionMenuItems, type Band, type SelectionMenuItem } from '../../../services/reader/selection';
import { anchorOf, currentPage, pageBox, visiblePages, type ContentInsets, type ContentRect, type SurfaceLayout, type SurfaceView } from '../../../services/reader/surfaceGeometry';
import { surfacePagesFor } from '../../../services/reader/surfacePages';
import { bottomRightBox, placedSignature } from '../../../services/signature/signaturePlacement';
import { useAppDispatch } from '../../../store/AppStateContext';
import { useTheme } from '../../../theme';
import type { Annotation, OcrBounding, PageRotation } from '../../../types/models';
import { FastScroller } from './FastScroller';
import { MarkHeader, MarkToolbar } from './MarkToolbar';
import { PagePill } from './PagePill';
import { SelectBar, SelectionMenu } from './SelectionMenu';
import { SignBar } from './SignBar';
import { SurfaceOverlay, type MarkOutlines, type NightInk, type SurfaceFlash } from './SurfaceOverlay';
import { SurfacePageView } from './SurfacePageView';
import { useMarkTool, type MarkTextTool } from './useMarkTool';
import { usePdfSession } from './usePdfSession';
import { useSelectionActions } from './useSelectionActions';
import { useRenderQueue } from './useRenderQueue';
import { useSurfaceFind, unionOf, type SurfaceFindStatus } from './useSurfaceFind';
import { useSurfaceGestures } from './useSurfaceGestures';
import { useSurfaceSelection } from './useSurfaceSelection';
import { useSurfaceView } from './useSurfaceView';

export type PageSurfaceHandle = {
  // A library page (0-based): its top at the top of the visible band, at the present zoom.
  goToIndex: (index: number) => void;
  // §18 W11: a library page's text ('' for none): a scan's OCR text, a PDF page's own.
  pageText: (index: number) => Promise<string>;
  // §18 W12: Find's next (1) or previous (-1) match, around the ends.
  findStep: (by: 1 | -1) => void;
  // A mark on a library page, shown for a moment and scrolled into view: its boxes in the page's
  // own space (SurfacePage.space, what marks are stored in).
  flash: (index: number, rects: readonly OcrBounding[]) => void;
};

// §18 W11 (A14): what a screen reader offers on a page. Named actions with labels, shown in its
// actions menu: React Native has no standard "scroll forward" action for a plain view.
type PageAction = 'next' | 'previous' | 'zoomIn' | 'zoomOut' | 'readText';
const PAGE_ZOOM_STEP = 1.5;
// The page come to rest on is said after this long without another movement.
const ANNOUNCE_AFTER_MS = 600;
const NO_LINKS: PdfLink[] = [];
// How long a mark picked in the Notes panel stays lit.
const FLASH_MS = 1600;
const NO_MARKS: readonly Annotation[] = [];
const NO_PAGE_MARKS: ReadonlyMap<number, readonly Annotation[]> = new Map();
const NO_OUTLINES: MarkOutlines = { text: false, signature: false };
// The Mark palette's and the Sign bar's height before they are measured (two rows; one).
const MARK_BAR_ESTIMATE = 132;
const SIGN_BAR_ESTIMATE = 64;

// §18 W16: the signature the Reader wants placed, and the library page it goes on.
export type SurfaceSignRequest = { uri: string; aspectRatio: number; idx: number };
export type PlacedSignature = { box: OcrBounding; turn: PageRotation };

type PageSurfaceProps = {
  subject: ReaderSubject;
  // `document.pdf`, or the outside file. Opened only for what is read through pdfium (an imported
  // or merged PDF, an outside file); a scan reads from its page images and may have no PDF yet.
  pdfUri: string | undefined;
  // §18 W17: the file may still hold marks an older build wrote into it (annotations/cleanBases):
  // its pages are drawn without the file's annotations, or ours would show twice.
  plainPages?: boolean;
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
  // §18 W12: what Find looks for ('' with Find closed), the library page a search result opened
  // it on (null: from where reading is), and what the top bar shows of it.
  findQuery?: string;
  findFrom?: number | null;
  onFindStatus?: (status: SurfaceFindStatus | null) => void;
  // §18 W13: the "Select text" tool is on (a tap selects a word, and its bar shows), and its
  // Done. A long press selects a word with or without it.
  selecting?: boolean;
  onSelectDone?: () => void;
  // The document's marks and signatures (the library's rows). §18 W15: all of them are drawn
  // here, live; nothing of them is in the page images.
  marks?: readonly Annotation[];
  // §18 W15: the Mark tool is on (its bars replace the Reader's), its Text tool's gate, and Done.
  marking?: boolean;
  markText?: MarkTextTool;
  onMarkDone?: () => void;
  // §18 W16 (A10): a signature to place on a library page (null: not signing), and its ways out:
  // placed (the box in the page's own space), cancelled, or drawn again.
  signing?: SurfaceSignRequest | null;
  onSignPlaced?: (idx: number, placed: PlacedSignature) => void;
  onSignCancel?: () => void;
  onSignRedraw?: () => void;
  // The file can't be opened (usePdfSession.sessionErrorCode).
  onError: (code: NativePdfErrorCode) => void;
};

type Windows = { images: PageRange; thumbs: PageRange };

function sameRange(a: PageRange, b: PageRange): boolean {
  return a.first === b.first && a.last === b.last;
}

// §18 W10: the page surface, read-only. PDFs and scans as one column of pages on a single layer
// that zooms and scrolls on the UI thread (useSurfaceView, useSurfaceGestures); each page is
// plain images, rendered into the page cache by pdfium or the image decoder as the view comes to
// rest (renderPlan → useRenderQueue). Night pages are redrawn dark, not dimmed. Since §18 W17 it
// is the Reader's only viewer for PDFs and scans.
// §18 W11: a tap is routed here (a PDF link under it jumps, or asks before leaving the app; else
// it is the Reader's), the outline is read for the Contents tab and the thumb's bubble, and each
// page is an element a screen reader can name, turn, zoom and read.
// §18 W12: Find (useSurfaceFind) and the Notes panel's flash, drawn on SurfaceOverlay.
// §18 W13: selection on the page (useSurfaceSelection): a long press takes a word, two handles
// move its ends, SelectionMenu floats by it.
// §18 W15: Mark mode on the same pages (useMarkTool; gestureArbiter says what a finger does), with
// every mark drawn live by SurfaceOverlay. §18 W16: a signature is placed on the page itself.
// Neither changes this component's identity, so zoom and position survive every tool.
export const PageSurface = forwardRef<PageSurfaceHandle, PageSurfaceProps>(function PageSurface(
  {
    subject,
    pdfUri,
    plainPages = false,
    owner,
    password,
    reading,
    insets: barInsets,
    safeBottom,
    chrome,
    onScroll,
    initialIndex,
    onLoad,
    onPage,
    onTap,
    onOutline,
    onReadText,
    findQuery = '',
    findFrom = null,
    onFindStatus,
    selecting = false,
    onSelectDone,
    marks = NO_MARKS,
    marking = false,
    markText,
    onMarkDone,
    signing = null,
    onSignPlaced,
    onSignCancel,
    onSignRedraw,
    onError,
  },
  ref
) {
  const { tokens } = useTheme();
  const { t } = useT();
  const dispatch = useAppDispatch();
  // A5: what the surface is doing. The same pages either way.
  const tool: SurfaceTool = signing ? 'sign' : marking ? 'mark' : selecting ? 'select' : 'read';
  // The Mark palette and the Sign bar stand where the Reader's bottom bar was and are taller:
  // the last page ends above them, as it does above the bar.
  const [toolBar, setToolBar] = useState(0);
  const toolBarHeight = tool === 'mark' ? toolBar || MARK_BAR_ESTIMATE + safeBottom : tool === 'sign' ? toolBar || SIGN_BAR_ESTIMATE + safeBottom : 0;
  useEffect(() => {
    if (tool !== 'mark' && tool !== 'sign') setToolBar(0);
  }, [tool]);
  const insets = useMemo<ContentInsets>(
    () => (toolBarHeight > barInsets.bottom ? { ...barInsets, bottom: toolBarHeight } : barInsets),
    [barInsets, toolBarHeight]
  );
  const doc = subject.doc;
  const fromPdf = !doc || isPdfLevel(doc);
  const session = usePdfSession(fromPdf && pdfUri ? pdfUri : null, password, onError);
  // One folder per state of the file. This component is mounted again when the file is rewritten
  // (ReaderDocumentView keys it on the reload, which also follows `plainPages`), so the folder is chosen once.
  const [cache] = useState(() => openPageCache(owner, fromPdf ? pdfUri : undefined, undefined, fromPdf && plainPages ? 'plain' : ''));
  const palette = nightPalette(reading);
  const queue = useRenderQueue({ cache, session, palette, annotations: !plainPages });
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
  const { layout, viewport, ready, motion, goToIndex, reveal, zoomBy } = surface;

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

  // §18 W12: a rectangle of a page (fractions of the page as shown) into the visible band. While
  // Find is typed in, the keyboard covers more of the bottom than the bar does: whatever of this
  // view lies under it counts as covered (nothing when the window shrinks for the keyboard).
  const keyboardTop = useRef<number | null>(null);
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', (e) => {
      keyboardTop.current = e.endCoordinates.screenY;
    });
    const hidden = Keyboard.addListener('keyboardDidHide', () => {
      keyboardTop.current = null;
    });
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);
  const revealOnPage = useCallback(
    (index: number, rect: UnitRect) => {
      const g = surface.geometry.current;
      if (!g || index < 0 || index >= g.layout.tops.length) return;
      const box = pageBox(g.layout, index);
      const cover = keyboardTop.current === null ? 0 : Math.max(0, g.viewport.height - keyboardTop.current);
      reveal({ x: box.x + rect.x * box.width, y: box.y + rect.y * box.height, width: rect.width * box.width, height: rect.height * box.height }, cover);
    },
    [surface.geometry, reveal]
  );
  // Where reading is, for Find's first match: the top of the visible band.
  const findPosition = useCallback(() => {
    const g = surface.geometry.current;
    if (!g) return null;
    const anchor = anchorOf(g.layout, surface.view.current, g.insets);
    return { page: anchor.page, fy: anchor.fy };
  }, [surface.geometry, surface.view]);
  const find = useSurfaceFind({
    query: findQuery,
    from: findFrom,
    pages,
    docPages,
    session,
    ready,
    position: findPosition,
    reveal: revealOnPage,
    onStatus: onFindStatus,
  });
  const { step: findStep } = find;

  const [flashed, setFlashed] = useState<SurfaceFlash | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    []
  );
  const flash = useCallback(
    (index: number, rects: readonly OcrBounding[]) => {
      const page = pages[index];
      if (!page || !rects.length) return;
      const toShown = spaceToShown(page.space);
      const shown = rects.map((rect) => {
        const r = mapRect(toShown, rect);
        return { x: r.left, y: r.top, width: r.width, height: r.height };
      });
      if (flashTimer.current) clearTimeout(flashTimer.current);
      setFlashed({ index, rects: shown });
      revealOnPage(index, unionOf(shown));
      flashTimer.current = setTimeout(() => setFlashed(null), FLASH_MS);
    },
    [pages, revealOnPage]
  );
  useImperativeHandle(ref, () => ({ goToIndex, pageText, findStep, flash }), [goToIndex, pageText, findStep, flash]);

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

  // §18 W13 (A8): the selection, and what its menu does (useSelectionActions).
  const selection = useSurfaceSelection({ pages, docPages, session, layout, geometry: surface.geometry, view: surface.view, selecting, current });
  const { selection: selected, tokens: selectedWords, drawn, empty, clear: clearSelection, tap: selectionTap, selectAll } = selection;
  const actions = useSelectionActions(doc);
  // Leaving the tool closes what it selected; Back closes a selection before anything else.
  useEffect(() => {
    if (!selecting) clearSelection();
  }, [selecting, clearSelection]);
  useBackHandler(clearSelection, !!selected || !!empty);
  // A selection belongs to reading: Mark and Sign start without one.
  useEffect(() => {
    if (tool === 'mark' || tool === 'sign') clearSelection();
  }, [tool, clearSelection]);
  const onMenuPick = useCallback(
    (item: SelectionMenuItem) => {
      switch (item) {
        case 'copy':
          void actions.copy(selectedWords).catch(() => undefined);
          return clearSelection();
        case 'share':
          return actions.share(selectedWords);
        case 'highlight':
        case 'underline': {
          // The row is in the store, and the overlay draws it from there at once.
          if (selected && actions.mark(item, selected.pageId, selectedWords)) clearSelection();
          return;
        }
        case 'selectAll':
          return selectAll();
        case 'runOcr': {
          const at = empty;
          if (at) void actions.rerunOcr(at.page).then(clearSelection, clearSelection);
          return;
        }
      }
    },
    [actions, selected, selectedWords, empty, clearSelection, selectAll]
  );
  const external = !doc;
  const menuPage = selected ? pages[selected.page] : empty ? pages[empty.page] : undefined;
  const menuOwn = selected ? docPages?.[selected.page] : empty ? docPages?.[empty.page] : undefined;
  const menuItems = useMemo(
    () => (menuPage ? selectionMenuItems({ selected: !!selected, canMark: menuPage.canMark, external, canOcr: !!menuOwn?.fileUri }) : []),
    [menuPage, menuOwn, selected, external]
  );
  const menuAnchor = useMemo(() => (drawn ? drawn.bounds : empty ? { x: empty.x, y: empty.y, width: 0, height: 0 } : null), [drawn, empty]);
  // A long press on a page with no text and no image to read it from: say so, there is no menu.
  useEffect(() => {
    if (!empty || menuItems.length) return;
    dispatch({ type: 'ui/SHOW_SNACK', msg: t('reader.select.none') });
    clearSelection();
  }, [empty, menuItems, dispatch, t, clearSelection]);
  const band = useMemo<Band | null>(
    () => (viewport ? { left: insets.left, top: insets.top, right: viewport.width - insets.right, bottom: viewport.height - insets.bottom } : null),
    [viewport, insets]
  );

  // §18 W15 (A6): the document's rows by library page, as the overlay draws them and the Mark
  // tools hit-test them. A row whose page is gone is left out.
  const marksByPage = useMemo<ReadonlyMap<number, readonly Annotation[]>>(() => {
    if (!marks.length) return NO_PAGE_MARKS;
    const indexOf = new Map(pages.map((page, index) => [page.id, index]));
    const out = new Map<number, Annotation[]>();
    for (const mark of marks) {
      const index = indexOf.get(mark.pageId);
      if (index === undefined) continue;
      const rows = out.get(index);
      if (rows) rows.push(mark);
      else out.set(index, [mark]);
    }
    return out.size ? out : NO_PAGE_MARKS;
  }, [marks, pages]);

  // §18 W15 (A5): the Mark tools. The stroke being drawn lives in these shared values: the
  // gesture writes them, the overlay draws from them, and React hears only of the finished mark.
  const ink = useSharedValue<number[]>([]);
  const inkId = useSharedValue(0);
  const inkWidth = useSharedValue(1);
  // Marks lie over the page, not in its picture: on a night page the ink-like ones are shown the
  // way the page's own ink is (darkMatrix).
  const nightInk = useMemo<NightInk | null>(
    () => (palette ? { color: (hex: string) => nightColor(hex, palette), matrix: skiaNightMatrix(palette) } : null),
    [palette]
  );
  const mark = useMarkTool({
    active: marking,
    doc,
    pages,
    docPages,
    marks: marksByPage,
    prefs: reading.mark,
    geometry: surface.geometry,
    view: surface.view,
    textTool: markText,
    nightInk: nightInk?.color ?? null,
    ink,
    inkId,
  });
  const { tap: markTap, stroke: markStroke, drag: markDrag } = mark;
  // Content units per unit of each page's own space: a stroke's width under the finger.
  const inkScales = useMemo(
    () => (layout ? pages.map((page, index) => (index < layout.tops.length ? spaceScale(pageBox(layout, index), page.space) : 1)) : NO_SCALES),
    [pages, layout]
  );
  const mode = panMode(tool, mark.tool);
  const liveInk = useMemo(
    () => (mode === 'draw' ? { points: ink, width: inkWidth, color: mark.inkStyle.color, opacity: mark.inkStyle.opacity } : null),
    [mode, ink, inkWidth, mark.inkStyle]
  );
  const outlines = useMemo<MarkOutlines>(
    () => (tool === 'mark' && mode === 'drag' ? { text: mark.tool === 'text', signature: true } : NO_OUTLINES),
    [tool, mode, mark.tool]
  );

  // §18 W16 (A10): the signature being placed, a box on the page in content coordinates that the
  // gesture moves and resizes on the UI thread. It starts at the page's bottom-right corner; a
  // new layout (the bar measured, a turn of the phone) keeps it where it was on the page.
  const signBox = useSharedValue<ContentRect | null>(null);
  const signUri = signing?.uri;
  const signIdx = signing?.idx ?? -1;
  const signRatio = signing?.aspectRatio ?? 0;
  const signedOn = useRef<{ key: string; layout: SurfaceLayout } | null>(null);
  useEffect(() => {
    if (!signUri || !layout || signIdx < 0 || signIdx >= layout.tops.length) {
      signedOn.current = null;
      signBox.value = null;
      return;
    }
    const key = `${signUri}:${signIdx}`;
    const page = pageBox(layout, signIdx);
    const prev = signedOn.current;
    const box = signBox.value;
    signedOn.current = { key, layout };
    if (prev?.key === key && box) {
      if (prev.layout === layout) return;
      const old = pageBox(prev.layout, signIdx);
      const k = page.width / Math.max(1, old.width);
      signBox.value = { x: page.x + (box.x - old.x) * k, y: page.y + (box.y - old.y) * k, width: box.width * k, height: box.height * k };
      return;
    }
    const start = bottomRightBox(page, signRatio);
    signBox.value = start;
    reveal(start);
  }, [signUri, signIdx, signRatio, layout, signBox, reveal]);
  const signBottomRight = useCallback(() => {
    const g = surface.geometry.current;
    if (!g || signIdx < 0 || signIdx >= g.layout.tops.length) return;
    const start = bottomRightBox(pageBox(g.layout, signIdx), signRatio);
    signBox.value = start;
    reveal(start);
  }, [surface.geometry, signIdx, signRatio, signBox, reveal]);
  const signPlace = useCallback(() => {
    const g = surface.geometry.current;
    const box = signBox.value;
    const page = pages[signIdx];
    if (!g || !box || !page || signIdx >= g.layout.tops.length) return;
    // An imported page that isn't indexed has no space of its own to keep the box in.
    if (!page.canMark) {
      dispatch({ type: 'ui/SHOW_SNACK', msg: t('reader.mark.pageNotReady') });
      return;
    }
    const toSpace = boxToSpace(pageBox(g.layout, signIdx), page.space);
    onSignPlaced?.(signIdx, placedSignature(box, (rect) => mapRect(toSpace, rect), page.space.turn));
  }, [surface.geometry, signBox, pages, signIdx, dispatch, t, onSignPlaced]);
  const signingOverlay = useMemo(() => (signUri ? { box: signBox, uri: signUri } : null), [signUri, signBox]);

  // A5's tap routing: an open selection first (the tap closes it, or in the Select tool picks a
  // word), then a link under the finger, else the Reader's tap (the bars).
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    []
  );
  const onSurfaceTap = useCallback(
    (x: number, y: number) => {
      // A Mark tool's tap is its own; the signature is placed by its buttons.
      if (tool === 'mark') return markTap(x, y);
      if (tool === 'sign') return;
      if (selectionTap(x, y)) return;
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
    [tool, markTap, selectionTap, surface.geometry, surface.view, pages, linksOf, goToIndex, askLink]
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

  const gesture = useSurfaceGestures({
    layout,
    viewport,
    insets,
    motion,
    onTap: onSurfaceTap,
    onLongPress: selection.longPress,
    handles: selection.handles,
    onHandle: selection.onHandle,
    mode,
    readingTaps: hasReadingTaps(tool),
    ink,
    inkId,
    inkWidth,
    inkTool: mark.inkStyle.width,
    inkScales,
    onStroke: markStroke,
    onMarkDrag: markDrag,
    signBox,
    signPage: signIdx,
  });
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
  // The Reader's own aids make room for a tool's bars.
  const tooled = tool === 'mark' || tool === 'sign';

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

      {/* Mounted only while there is something to draw: an empty canvas still costs a layer. */}
      {layout && ready && (find.hits.size > 0 || flashed || marksByPage.size > 0 || drawn || tooled) ? (
        <SurfaceOverlay
          layout={layout}
          motion={motion}
          pages={mounted}
          surfacePages={pages}
          hits={find.hits}
          cursor={find.cursor}
          flash={flashed}
          marks={marksByPage}
          moved={mark.moved}
          outlines={outlines}
          outlineColor={tokens.accent}
          selected={drawn}
          ink={liveInk}
          signing={signingOverlay}
          night={nightInk}
        />
      ) : null}

      {/* Away while a handle is dragged: the words under it are what is being looked at. */}
      {ready && band && menuAnchor && menuItems.length > 0 && !selection.dragging ? (
        <SelectionMenu items={menuItems} anchor={menuAnchor} motion={motion} band={band} busy={actions.rerunning ? 'runOcr' : null} onPick={onMenuPick} />
      ) : null}
      {ready && selecting ? (
        <SelectBar
          hasText={selection.currentHasText}
          canOcr={!!docPages?.[current]?.fileUri}
          rerunning={actions.rerunning}
          bottom={insets.bottom}
          onRunOcr={() => void actions.rerunOcr(current).catch(() => undefined)}
          onDone={() => onSelectDone?.()}
        />
      ) : null}

      {ready && pageCount ? (
        <PagePill label={label} visible={aids && !thumbHeld} barHeight={insets.bottom} safeBottom={safeBottom} chrome={chrome} />
      ) : null}
      {/* Not beside a Mark tool: a stroke along the right edge would land on the thumb. */}
      {ready && layout && viewport && showsFastScroll(pageCount) && !tooled ? (
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

      {ready && tool === 'mark' ? (
        <>
          <MarkHeader
            title={t('reader.mark.pageOf', { page: current + 1, total: pageCount })}
            canUndo={mark.canUndo}
            canRedo={mark.canRedo}
            onUndo={mark.undo}
            onRedo={mark.redo}
            onDone={() => onMarkDone?.()}
          />
          <MarkToolbar tool={mark.tool} prefs={reading.mark} onPickTool={mark.pickTool} onPrefs={mark.setPrefs} textPro={markText?.pro ?? false} onHeight={setToolBar} />
        </>
      ) : null}
      {mark.modals}
      {ready && tool === 'sign' ? (
        <SignBar onCancel={() => onSignCancel?.()} onRedraw={onSignRedraw} onBottomRight={signBottomRight} onPlace={signPlace} onHeight={setToolBar} />
      ) : null}
    </View>
  );
});

const NO_SCALES: number[] = [];

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
