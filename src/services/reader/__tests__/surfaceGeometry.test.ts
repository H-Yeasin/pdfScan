import {
  anchorOf,
  clampView,
  clampZoom,
  currentPage,
  DOUBLE_TAP_ZOOM,
  doubleTapView,
  MAX_ZOOM,
  pageAtY,
  pageBox,
  pagedSnap,
  revealRect,
  screenToContent,
  scrollRange,
  surfaceLayout,
  viewForAnchor,
  viewForPage,
  visiblePages,
} from '../surfaceGeometry';
import { pageAtProgress, progressAtThumb, scrollProgress, showsFastScroll, thumbTop, thumbTrack, viewAtProgress } from '../fastScroll';

// A portrait page, a landscape one (a turned scan), and a tall receipt.
const pages = [
  { shownW: 1000, shownH: 1400 },
  { shownW: 1400, shownH: 1000 },
  { shownW: 500, shownH: 2000 },
];
const viewport = { width: 400, height: 800 };
const bars = { top: 56, bottom: 64, left: 0, right: 0 };

describe('§18 W8 surface layout', () => {
  it('fit width: every page as wide as the screen, whatever its shape', () => {
    const layout = surfaceLayout(pages, { viewport, fit: 'width', gap: 10 });
    expect(layout.width).toBe(400);
    expect(layout.widths).toEqual([400, 400, 400]);
    expect(layout.lefts).toEqual([0, 0, 0]);
    expect(layout.heights[0]).toBeCloseTo(560);
    expect(layout.heights[1]).toBeCloseTo(285.714, 2);
    expect(layout.heights[2]).toBeCloseTo(1600);
    expect(layout.tops[0]).toBe(10);
    expect(layout.tops[1]).toBeCloseTo(580);
    expect(layout.total).toBeCloseTo(layout.tops[2] + 1600 + 10);
    expect(layout.slots).toBeUndefined();
  });

  it('fit page: the whole page inside the visible band, centred', () => {
    const layout = surfaceLayout(pages, { viewport, insets: bars, fit: 'page', gap: 10 });
    // The band is 800 - 56 - 64 = 680 high; a page gets 660 of it.
    expect(pageBox(layout, 0)).toEqual({ x: 0, y: 10, width: 400, height: 560 });
    // The landscape page already fits: it keeps the full width.
    expect(layout.widths[1]).toBe(400);
    // The receipt is cut down to the band and sits in the middle.
    expect(layout.heights[2]).toBe(660);
    expect(layout.widths[2]).toBeCloseTo(165);
    expect(layout.lefts[2]).toBeCloseTo(117.5);
  });

  it('side insets narrow the content, not the pages’ shapes', () => {
    const layout = surfaceLayout(pages, { viewport: { width: 800, height: 400 }, insets: { top: 0, bottom: 0, left: 48, right: 0 }, fit: 'width', gap: 10 });
    expect(layout.width).toBe(752);
    expect(layout.heights[0]).toBeCloseTo(752 * 1.4);
  });

  it('paged: a stretch per page, at least as high as the band', () => {
    const layout = surfaceLayout(pages, { viewport, insets: bars, fit: 'width', gap: 10, paged: true });
    // 560 high in a 680 band: centred in its stretch.
    expect(layout.slots).toEqual([0, 680, 1360, 1360 + 1620]);
    expect(layout.tops[0]).toBe(60);
    // The receipt at full width is higher than the band: its stretch is the page plus its gaps.
    expect(layout.tops[2]).toBe(1370);
    expect(layout.total).toBe(2980);
  });
});

describe('§18 W8 view', () => {
  const layout = surfaceLayout(pages, { viewport, insets: bars, fit: 'width', gap: 10 });

  it('clamps inside the insets', () => {
    // The start: the content begins under the top bar, not under the screen's edge.
    expect(clampView(layout, { scale: 1, tx: 30, ty: 500 }, viewport, bars)).toEqual({ scale: 1, tx: 0, ty: 56 });
    // The end: the content's end at the bottom bar's top edge.
    const end = clampView(layout, { scale: 1, tx: 0, ty: -99999 }, viewport, bars);
    expect(end.ty).toBeCloseTo(800 - 64 - layout.total);
    // Zoomed: sideways as far as the zoomed width, and the insets are not zoomed.
    const zoomed = clampView(layout, { scale: 2, tx: -5000, ty: 500 }, viewport, bars);
    expect(zoomed).toEqual({ scale: 2, tx: -400, ty: 56 });
    expect(clampView(layout, { scale: 0.4, tx: 0, ty: 0 }, viewport, bars).scale).toBe(1);
    expect(clampZoom(9)).toBe(MAX_ZOOM);
    expect(clampZoom(0.2)).toBe(1);
  });

  it('a document shorter than the band stays at its start', () => {
    const short = surfaceLayout([{ shownW: 1400, shownH: 1000 }], { viewport, insets: bars, fit: 'width', gap: 10 });
    expect(scrollRange(short, 1, viewport, bars)).toEqual({ minTx: 0, maxTx: 0, minTy: 56, maxTy: 56 });
    expect(clampView(short, { scale: 1, tx: 0, ty: -300 }, viewport, bars).ty).toBe(56);
  });

  it('the current page is the one at the middle of the band', () => {
    // The band's middle is at 56 + 340 = 396. At the start that is on page 1.
    expect(currentPage(layout, { scale: 1, tx: 0, ty: 56 }, 800, bars)).toBe(0);
    // Page 2's top (580) just above the band's middle: 396 - 580 = -184.
    expect(currentPage(layout, { scale: 1, tx: 0, ty: -185 }, 800, bars)).toBe(1);
    expect(currentPage(layout, { scale: 1, tx: 0, ty: -183 }, 800, bars)).toBe(0);
    // Without the bars the middle is 400: the same view is a page further on.
    expect(currentPage(layout, { scale: 1, tx: 0, ty: -183 }, 800)).toBe(1);
  });

  it('finds the page under a point in a long document', () => {
    const long = surfaceLayout(Array.from({ length: 301 }, () => pages[0]), { viewport, fit: 'width', gap: 10 });
    expect(pageAtY(long, -50)).toBe(0);
    expect(pageAtY(long, long.tops[150])).toBe(150);
    expect(pageAtY(long, long.tops[150] - 1)).toBe(149);
    expect(pageAtY(long, 1e9)).toBe(300);
  });

  it('lists the pages on screen', () => {
    expect(visiblePages(layout, { scale: 1, tx: 0, ty: 56 }, viewport)).toEqual({ first: 0, last: 1 });
    // Page 1 ends at 570: scrolled to 575, the gap under it is at the top edge.
    expect(visiblePages(layout, { scale: 1, tx: 0, ty: -575 }, viewport)).toEqual({ first: 1, last: 2 });
    // Zoomed into the middle of the receipt.
    expect(visiblePages(layout, { scale: 4, tx: 0, ty: -4 * 1500 }, viewport)).toEqual({ first: 2, last: 2 });
    expect(visiblePages(surfaceLayout([], { viewport, fit: 'width', gap: 10 }), { scale: 1, tx: 0, ty: 0 }, viewport)).toEqual({ first: 0, last: -1 });
  });

  it('jumps to a page: its top under the top bar', () => {
    expect(viewForPage(layout, 1, { scale: 1, tx: 0, ty: 0 }, viewport, bars).ty).toBeCloseTo(56 - 580);
    expect(viewForPage(layout, 1, { scale: 2, tx: -100, ty: 0 }, viewport, bars)).toEqual({ scale: 2, tx: -100, ty: 56 - 1160 });
    expect(viewForPage(layout, 99, { scale: 1, tx: 0, ty: 0 }, viewport, bars).ty).toBeCloseTo(56 - layout.tops[2]);
  });

  it('double tap zooms in about the finger and back out', () => {
    const start = { scale: 1, tx: 0, ty: -300 };
    const zoomedIn = doubleTapView(layout, start, 300, 500, viewport, bars);
    expect(zoomedIn.scale).toBe(DOUBLE_TAP_ZOOM);
    // The content under the finger stays under it.
    const before = screenToContent(start, 300, 500);
    const after = screenToContent(zoomedIn, 300, 500);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    const out = doubleTapView(layout, zoomedIn, 300, 500, viewport, bars);
    expect(out.scale).toBe(1);
    expect(out.tx).toBe(0);
    expect(out.ty).toBeCloseTo(-300);
    // Near a corner the zoom is clamped onto the page.
    expect(doubleTapView(layout, { scale: 1, tx: 0, ty: 56 }, 0, 56, viewport, bars)).toEqual({ scale: DOUBLE_TAP_ZOOM, tx: 0, ty: 56 });
  });

  it('reveals a rectangle into the band, moving as little as it can', () => {
    const view = { scale: 1, tx: 0, ty: -300 };
    // Already between the bars: the very same view.
    expect(revealRect(layout, view, { x: 100, y: 500, width: 80, height: 20 }, viewport, bars)).toBe(view);
    // Under the top bar (screen y 0): down to the margin below it.
    expect(revealRect(layout, view, { x: 100, y: 300, width: 80, height: 20 }, viewport, bars).ty).toBe(-300 + 56 + 24);
    // Under the bottom bar: its bottom edge up to the margin above it.
    const below = revealRect(layout, view, { x: 100, y: 1200, width: 80, height: 20 }, viewport, bars);
    expect(1220 + below.ty).toBe(800 - 64 - 24);
    // Zoomed, off to the right.
    const side = revealRect(layout, { scale: 2, tx: 0, ty: -600 }, { x: 300, y: 500, width: 40, height: 20 }, viewport, bars);
    expect(340 * 2 + side.tx).toBe(400 - 24);
    // At the document's start the margin can't be had: nothing moves.
    const top = { scale: 1, tx: 0, ty: 56 };
    expect(revealRect(layout, top, { x: 0, y: 12, width: 80, height: 20 }, viewport, bars)).toBe(top);
  });
});

describe('§18 W8 anchor', () => {
  const portrait = { width: 400, height: 800 };
  const landscape = { width: 800, height: 400 };
  const pInsets = { top: 56, bottom: 64, left: 0, right: 0 };
  // Landscape: shorter bars, and the 3-button bar on the side.
  const lInsets = { top: 48, bottom: 0, left: 0, right: 48 };
  const many = Array.from({ length: 40 }, (_, i) => pages[i % pages.length]);
  const lay = (viewportOf: typeof portrait, insets: typeof pInsets) => surfaceLayout(many, { viewport: viewportOf, insets, fit: 'width', gap: 10 });

  it('names the point under the top bar', () => {
    const layout = lay(portrait, pInsets);
    const anchor = anchorOf(layout, { scale: 1, tx: 0, ty: 56 - (layout.tops[4] + 140) }, pInsets);
    expect(anchor.page).toBe(4);
    expect(anchor.fy).toBeCloseTo(140 / layout.heights[4]);
    expect(anchor.fx).toBeCloseTo(0);
    expect(anchor.dy).toBeUndefined();
  });

  it('round-trips portrait → landscape → portrait within a pixel', () => {
    const a = lay(portrait, pInsets);
    const b = lay(landscape, lInsets);
    const views = [
      { scale: 1, tx: 0, ty: 56 - (a.tops[17] + 300) },
      // Zoomed 2× and panned sideways.
      { scale: 2, tx: -260, ty: 56 - (a.tops[9] + 123.4) * 2 },
      // In the gap under a page.
      { scale: 1, tx: 0, ty: 56 - (a.tops[6] - 4) },
      // The very start.
      { scale: 1, tx: 0, ty: 56 },
    ];
    for (const view of views) {
      const turned = viewForAnchor(b, anchorOf(a, view, pInsets), view.scale, landscape, lInsets);
      const back = viewForAnchor(a, anchorOf(b, turned, lInsets), view.scale, portrait, pInsets);
      expect(Math.abs(back.ty - view.ty)).toBeLessThan(1);
      expect(Math.abs(back.tx - view.tx)).toBeLessThan(1);
      // The same page is at the top in both.
      expect(anchorOf(b, turned, lInsets).page).toBe(anchorOf(a, view, pInsets).page);
    }
  });

  it('survives a change of fit', () => {
    const width = lay(portrait, pInsets);
    const page = surfaceLayout(many, { viewport: portrait, insets: pInsets, fit: 'page', gap: 10 });
    // Half way down the receipt, which fit page makes much smaller.
    const anchor = anchorOf(width, { scale: 1, tx: 0, ty: 56 - (width.tops[2] + 800) }, pInsets);
    const next = viewForAnchor(page, anchor, 1, portrait, pInsets);
    expect(anchorOf(page, next, pInsets).page).toBe(2);
    expect(anchorOf(page, next, pInsets).fy).toBeCloseTo(0.5);
    expect(next.tx).toBe(0);
  });
});

describe('§18 W8 paged snap', () => {
  const layout = surfaceLayout(pages, { viewport, insets: bars, fit: 'width', gap: 10, paged: true });
  // Page 1 in place: its stretch's top under the top bar.
  const home = { scale: 1, tx: 0, ty: 56 };

  it('does nothing in the continuous layout, or while the page covers the band', () => {
    expect(pagedSnap(surfaceLayout(pages, { viewport, fit: 'width', gap: 10 }), home, viewport, -2000, 0)).toBeNull();
    expect(pagedSnap(layout, home, viewport, 0, 0, bars)).toBeNull();
    // Inside the tall receipt's stretch.
    expect(pagedSnap(layout, { scale: 1, tx: 0, ty: 56 - 1360 - 400 }, viewport, -2000, 2, bars)).toBeNull();
  });

  it('a short drag comes back, a long one or a fling turns the page', () => {
    expect(pagedSnap(layout, { ...home, ty: 56 - 100 }, viewport, 0, 0, bars)).toEqual({ page: 0, ty: 56 });
    expect(pagedSnap(layout, { ...home, ty: 56 - 400 }, viewport, 0, 0, bars)).toEqual({ page: 1, ty: 56 - 680 });
    expect(pagedSnap(layout, { ...home, ty: 56 - 100 }, viewport, -900, 0, bars)).toEqual({ page: 1, ty: 56 - 680 });
  });

  it('one swipe turns one page, and the ends hold', () => {
    // Flung far past page 2 from page 1: still only to page 2.
    expect(pagedSnap(layout, { ...home, ty: 56 - 1500 }, viewport, -5000, 0, bars)?.page).toBe(1);
    expect(pagedSnap(layout, { ...home, ty: 56 + 80 }, viewport, 3000, 0, bars)).toEqual({ page: 0, ty: 56 });
  });

  it('going back lands on the previous page’s end', () => {
    // From the receipt's start, pulled down: page 2's stretch ends at the bottom bar.
    const snap = pagedSnap(layout, { scale: 1, tx: 0, ty: 56 - 1360 + 100 }, viewport, 900, 2, bars);
    expect(snap).toEqual({ page: 1, ty: 800 - 64 - 1360 });
    // The receipt's own end, pushed a little past: back to its end.
    expect(pagedSnap(layout, { scale: 1, tx: 0, ty: 800 - 64 - 2980 - 50 }, viewport, 0, 2, bars)).toEqual({ page: 2, ty: 800 - 64 - 2980 });
  });
});

describe('§18 W8 fast scroller', () => {
  const many = Array.from({ length: 300 }, () => pages[0]);
  const layout = surfaceLayout(many, { viewport, insets: bars, fit: 'width', gap: 10 });

  it('shows for long documents only', () => {
    expect(showsFastScroll(7)).toBe(false);
    expect(showsFastScroll(8)).toBe(true);
  });

  it('the thumb follows the scroll between the bars', () => {
    const track = thumbTrack(viewport, bars);
    expect(track).toEqual({ top: 64, length: 800 - 64 - 8 - 48 - 64 });
    const range = scrollRange(layout, 1, viewport, bars);
    expect(scrollProgress(layout, { scale: 1, tx: 0, ty: range.maxTy }, viewport, bars)).toBe(0);
    expect(scrollProgress(layout, { scale: 1, tx: 0, ty: range.minTy }, viewport, bars)).toBe(1);
    expect(thumbTop(0, track)).toBe(64);
    expect(thumbTop(1, track)).toBe(64 + track.length);
    // Nothing to scroll: it stays at the top.
    const short = surfaceLayout([pages[1]], { viewport, insets: bars, fit: 'width', gap: 10 });
    expect(scrollProgress(short, { scale: 1, tx: 0, ty: 56 }, viewport, bars)).toBe(0);
  });

  it('dragging the thumb scrolls back the same way', () => {
    const track = thumbTrack(viewport, bars);
    expect(progressAtThumb(-50, track)).toBe(0);
    expect(progressAtThumb(9999, track)).toBe(1);
    const progress = progressAtThumb(thumbTop(0.4, track), track);
    expect(progress).toBeCloseTo(0.4);
    const view = viewAtProgress(layout, { scale: 1, tx: 0, ty: 56 }, progress, viewport, bars);
    expect(scrollProgress(layout, view, viewport, bars)).toBeCloseTo(0.4);
    expect(pageAtProgress(layout, view, 0, viewport, bars)).toBe(0);
    expect(pageAtProgress(layout, view, 1, viewport, bars)).toBe(299);
    // 40% of the way down 300 equal pages.
    expect(pageAtProgress(layout, view, 0.4, viewport, bars)).toBe(120);
  });
});
