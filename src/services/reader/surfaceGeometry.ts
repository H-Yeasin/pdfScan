import type { LibraryPage } from '../../types/models';

// §18 W8: the geometry of the page surface, kept pure so it can be tested without rendering. It
// grew out of Mark mode's column (§12 D3, annotations/markMode.ts, which re-exports the column's
// functions from here until W18): pages one under the other in unzoomed "content" coordinates,
// and one view (zoom + position) for the whole layer.
//
// The bars' insets are not part of the content. A layout starts at content (0, 0); the view's
// range is what keeps the first page below the top bar and the last one above the bottom bar
// (`scrollRange`). So showing or hiding a bar never moves a page, and zooming never zooms padding.
//
// The functions marked 'worklet' also run on the UI thread, inside the gestures.

export type Size = { width: number; height: number };
export type ContentRect = { x: number; y: number; width: number; height: number };

// What covers the surface's edges: the measured bars plus the safe area (§18 A11).
export type ContentInsets = { top: number; bottom: number; left: number; right: number };
export const NO_INSETS: ContentInsets = { top: 0, bottom: 0, left: 0, right: 0 };

export const MAX_ZOOM = 6;
export const DOUBLE_TAP_ZOOM = 2.5;
// Paged layout: a fling this fast (px/s) turns the page, and so does dragging the next page over
// this share of the visible band.
export const PAGE_FLING = 600;
export const PAGE_TURN_SHARE = 0.5;
// The room kept around something scrolled into view (a Find match, a selection).
export const REVEAL_MARGIN = 24;

// Every page's box in content coordinates. `width` is the content's width: a page narrower than
// it (fit page) sits centred, at `lefts[i]` with `widths[i]`; without those every page is `width`
// wide (Mark mode's column). `slots` exists only in the paged layout: `slots[i]` to `slots[i + 1]`
// is page i's own screen-high stretch, and the page is centred in it.
export type ColumnLayout = { width: number; tops: number[]; heights: number[]; total: number; lefts?: number[]; widths?: number[]; slots?: number[] };
export type SurfaceLayout = ColumnLayout & { lefts: number[]; widths: number[] };

// Zoom and position of the layer: a content point (x, y) shows at (x * scale + tx, y * scale + ty).
export type ColumnView = { scale: number; tx: number; ty: number };
export type SurfaceView = ColumnView;

// The column: every page at the column's width, one under the other with `gap` between them.
export function columnLayout(pages: readonly Pick<LibraryPage, 'width' | 'height'>[], width: number, gap: number): ColumnLayout {
  const tops: number[] = [];
  const heights: number[] = [];
  let y = gap;
  for (const page of pages) {
    const height = (width * Math.max(1, page.height)) / Math.max(1, page.width);
    tops.push(y);
    heights.push(height);
    y += height + gap;
  }
  return { width, tops, heights, total: y };
}

export type SurfaceFit = 'width' | 'page';
export type SurfaceLayoutOptions = {
  viewport: Size;
  insets?: ContentInsets;
  // 'width': every page as wide as the screen, whatever its shape. 'page': the whole page in the
  // visible band (a landscape page among portrait ones still fills the width).
  fit: SurfaceFit;
  gap: number;
  // One page at a time: each page gets a stretch at least as high as the band.
  paged?: boolean;
};

// The surface's layout, from the pages' shown sizes (their turn already applied; only the shape
// matters). Pages of different shapes each get their own box.
export function surfaceLayout(pages: readonly { shownW: number; shownH: number }[], options: SurfaceLayoutOptions): SurfaceLayout {
  const { viewport, fit, gap } = options;
  const insets = options.insets ?? NO_INSETS;
  const width = Math.max(1, viewport.width - insets.left - insets.right);
  const band = Math.max(1, viewport.height - insets.top - insets.bottom);
  const room = Math.max(1, band - gap * 2);
  const tops: number[] = [];
  const heights: number[] = [];
  const lefts: number[] = [];
  const widths: number[] = [];
  const slots: number[] = [];
  let y = options.paged ? 0 : gap;
  for (const page of pages) {
    const aspect = Math.max(1, page.shownH) / Math.max(1, page.shownW);
    let w = width;
    let h = width * aspect;
    if (fit === 'page' && h > room) {
      h = room;
      w = room / aspect;
    }
    lefts.push((width - w) / 2);
    widths.push(w);
    heights.push(h);
    if (options.paged) {
      // A page higher than the band (fit width) keeps its gaps and scrolls inside its stretch.
      const slot = Math.max(band, h + gap * 2);
      slots.push(y);
      tops.push(y + (slot - h) / 2);
      y += slot;
    } else {
      tops.push(y);
      y += h + gap;
    }
  }
  if (!options.paged) return { width, tops, heights, lefts, widths, total: y };
  slots.push(y);
  return { width, tops, heights, lefts, widths, slots, total: y };
}

export function pageBox(layout: ColumnLayout, idx: number): ContentRect {
  'worklet';
  return {
    x: layout.lefts ? layout.lefts[idx] : 0,
    y: layout.tops[idx],
    width: layout.widths ? layout.widths[idx] : layout.width,
    height: layout.heights[idx],
  };
}

// The page whose box holds content y, or the nearest one (a point in a gap belongs to the page
// above it; above the first page, the first). A binary search: a long PDF asks this every frame.
export function pageAtY(layout: ColumnLayout, y: number): number {
  'worklet';
  let lo = 0;
  let hi = layout.tops.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (layout.tops[mid] <= y) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

// The page on screen: the one at the middle of the visible band (the viewport without the bars).
export function currentPage(layout: ColumnLayout, view: ColumnView, viewportHeight: number, insets: ContentInsets = NO_INSETS): number {
  'worklet';
  const middle = (insets.top + viewportHeight - insets.bottom) / 2;
  return pageAtY(layout, (middle - view.ty) / view.scale);
}

// The pages with any part on screen (under a bar counts: the bars are see-through while they
// slide). `last < first` only for a document with no pages.
export function visiblePages(layout: ColumnLayout, view: ColumnView, viewport: Size): { first: number; last: number } {
  'worklet';
  const count = layout.tops.length;
  if (!count) return { first: 0, last: -1 };
  const top = -view.ty / view.scale;
  const bottom = (viewport.height - view.ty) / view.scale;
  let first = pageAtY(layout, top);
  // The top edge is in the gap under `first`: the next page is the first one showing.
  if (layout.tops[first] + layout.heights[first] <= top && first < count - 1 && layout.tops[first + 1] < bottom) first += 1;
  let last = pageAtY(layout, bottom);
  if (last > first && layout.tops[last] >= bottom) last -= 1;
  return { first, last: Math.max(first, last) };
}

// A touch on screen → content coordinates.
export function screenToContent(view: ColumnView, x: number, y: number): { x: number; y: number } {
  'worklet';
  return { x: (x - view.tx) / view.scale, y: (y - view.ty) / view.scale };
}

// A content point → master pixels on page `idx` of a column (outside its box when the finger has
// left it; snapping and drawing cope with that). The surface goes through pageSpace's matrices
// instead, which also know turns and placements.
export function contentToMaster(layout: ColumnLayout, page: Pick<LibraryPage, 'width' | 'height'>, idx: number, x: number, y: number) {
  const k = page.width / layout.width;
  return { x: x * k, y: (y - layout.tops[idx]) * k };
}

export function clampZoom(scale: number): number {
  'worklet';
  return Math.min(MAX_ZOOM, Math.max(1, scale));
}

// How far the layer may move at a zoom: `max` shows the content's start just inside the insets,
// `min` its end. Content smaller than the band stays at its start.
export function scrollRange(layout: ColumnLayout, scale: number, viewport: Size, insets: ContentInsets = NO_INSETS) {
  'worklet';
  const maxTx = insets.left;
  const maxTy = insets.top;
  return {
    minTx: Math.min(maxTx, viewport.width - insets.right - layout.width * scale),
    maxTx,
    minTy: Math.min(maxTy, viewport.height - insets.bottom - layout.total * scale),
    maxTy,
  };
}

// Keeps the content on screen: no scrolling past either end, no sideways drift when not zoomed in.
export function clampView(layout: ColumnLayout, view: ColumnView, viewport: Size, insets: ContentInsets = NO_INSETS): ColumnView {
  'worklet';
  const scale = Math.max(1, view.scale);
  const range = scrollRange(layout, scale, viewport, insets);
  return { scale, tx: Math.min(range.maxTx, Math.max(range.minTx, view.tx)), ty: Math.min(range.maxTy, Math.max(range.minTy, view.ty)) };
}

// The view that shows page `idx` at the top of the visible band (at the current zoom), clamped.
// In the paged layout that is the top of the page's stretch, so the page sits centred.
export function viewForPage(layout: ColumnLayout, idx: number, view: ColumnView, viewport: Size, insets: ContentInsets = NO_INSETS): ColumnView {
  'worklet';
  const at = Math.max(0, Math.min(idx, layout.tops.length - 1));
  const top = (layout.slots ? layout.slots[at] : layout.tops[at]) ?? 0;
  return clampView(layout, { scale: view.scale, tx: view.tx, ty: insets.top - top * view.scale }, viewport, insets);
}

// Zooming about a focal point (a pinch's centre) keeps the content under it in place.
export function zoomAbout(view: ColumnView, nextScale: number, focalX: number, focalY: number): ColumnView {
  'worklet';
  const ratio = nextScale / view.scale;
  return { scale: nextScale, tx: focalX - (focalX - view.tx) * ratio, ty: focalY - (focalY - view.ty) * ratio };
}

// A double tap: in to DOUBLE_TAP_ZOOM about the finger, or back out when already zoomed.
export function doubleTapView(layout: ColumnLayout, view: ColumnView, x: number, y: number, viewport: Size, insets: ContentInsets = NO_INSETS): ColumnView {
  'worklet';
  const next = view.scale > 1.05 ? 1 : DOUBLE_TAP_ZOOM;
  return clampView(layout, zoomAbout(view, next, x, y), viewport, insets);
}

// Where reading is, in a form that outlives the layout (a rotation, another fit or gap, the next
// launch): the point at the visible band's top-left corner as fractions of its page. A point in
// the gap around a page is kept as the nearest edge plus `dy` content pixels, not as a fraction
// past the edge: the gap doesn't grow with the page, so a fraction would land on another page
// once the pages are bigger.
export type SurfaceAnchor = { page: number; fx: number; fy: number; dy?: number };

export function anchorOf(layout: ColumnLayout, view: ColumnView, insets: ContentInsets = NO_INSETS): SurfaceAnchor {
  'worklet';
  if (!layout.tops.length) return { page: 0, fx: 0, fy: 0 };
  const at = screenToContent(view, insets.left, insets.top);
  const page = pageAtY(layout, at.y);
  const box = pageBox(layout, page);
  const fx = (at.x - box.x) / box.width;
  if (at.y < box.y) return { page, fx, fy: 0, dy: at.y - box.y };
  if (at.y > box.y + box.height) return { page, fx, fy: 1, dy: at.y - box.y - box.height };
  return { page, fx, fy: (at.y - box.y) / box.height };
}

export function viewForAnchor(layout: ColumnLayout, anchor: SurfaceAnchor, scale: number, viewport: Size, insets: ContentInsets = NO_INSETS): ColumnView {
  'worklet';
  if (!layout.tops.length) return clampView(layout, { scale, tx: insets.left, ty: insets.top }, viewport, insets);
  const box = pageBox(layout, Math.max(0, Math.min(anchor.page, layout.tops.length - 1)));
  const x = box.x + anchor.fx * box.width;
  const y = box.y + anchor.fy * box.height + (anchor.dy ?? 0);
  return clampView(layout, { scale, tx: insets.left - x * scale, ty: insets.top - y * scale }, viewport, insets);
}

// Paged layout: where a finished drag or fling settles. `from` is the page the gesture began on,
// so one swipe turns one page at most. null: the page's stretch still covers the band (a tall or
// zoomed page being read), so the scroll is free.
export function pagedSnap(
  layout: ColumnLayout,
  view: ColumnView,
  viewport: Size,
  velocityY: number,
  from: number,
  insets: ContentInsets = NO_INSETS
): { page: number; ty: number } | null {
  'worklet';
  const slots = layout.slots;
  if (!slots || slots.length < 2) return null;
  const count = slots.length - 1;
  const page = Math.max(0, Math.min(from, count - 1));
  const bandTop = insets.top;
  const bandBottom = viewport.height - insets.bottom;
  const turnAt = (bandBottom - bandTop) * PAGE_TURN_SHARE;
  const top = slots[page] * view.scale + view.ty;
  const bottom = slots[page + 1] * view.scale + view.ty;
  // Forward lands on the next page's start, back on the previous page's end.
  if (bottom < bandBottom - 0.5) {
    const forward = page < count - 1 && (velocityY < -PAGE_FLING || bandBottom - bottom > turnAt);
    return forward ? { page: page + 1, ty: bandTop - slots[page + 1] * view.scale } : { page, ty: bandBottom - slots[page + 1] * view.scale };
  }
  if (top > bandTop + 0.5) {
    const back = page > 0 && (velocityY > PAGE_FLING || top - bandTop > turnAt);
    return back ? { page: page - 1, ty: bandBottom - slots[page] * view.scale } : { page, ty: bandTop - slots[page] * view.scale };
  }
  return null;
}

// The view that brings a content rectangle into the visible band, moving as little as possible.
// The same `view` object comes back when it's already there. Something bigger than the band shows
// its start.
export function revealRect(
  layout: ColumnLayout,
  view: ColumnView,
  rect: ContentRect,
  viewport: Size,
  insets: ContentInsets = NO_INSETS,
  margin: number = REVEAL_MARGIN
): ColumnView {
  'worklet';
  const left = insets.left + margin;
  const top = insets.top + margin;
  const right = viewport.width - insets.right - margin;
  const bottom = viewport.height - insets.bottom - margin;
  const x0 = rect.x * view.scale + view.tx;
  const x1 = x0 + rect.width * view.scale;
  const y0 = rect.y * view.scale + view.ty;
  const y1 = y0 + rect.height * view.scale;
  let dx = 0;
  let dy = 0;
  if (x1 - x0 > right - left || x0 < left) dx = left - x0;
  else if (x1 > right) dx = right - x1;
  if (y1 - y0 > bottom - top || y0 < top) dy = top - y0;
  else if (y1 > bottom) dy = bottom - y1;
  if (!dx && !dy) return view;
  const next = clampView(layout, { scale: view.scale, tx: view.tx + dx, ty: view.ty + dy }, viewport, insets);
  // Near an edge the margin can't be had: the clamp puts the view back where it was.
  return next.tx === view.tx && next.ty === view.ty ? view : next;
}
