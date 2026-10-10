import { clampView, currentPage, scrollRange, NO_INSETS, type ColumnLayout, type ColumnView, type ContentInsets, type Size } from './surfaceGeometry';

// §18 W8 (A11): the fast scroller's thumb, as numbers. It rides the right edge of the visible
// band; its place is how far the document is scrolled, and dragging it scrolls the same way back.
// Pure, and worklets: the thumb follows the scroll on the UI thread.

// Fewer pages than this are quicker to scroll than to aim at.
export const FAST_SCROLL_MIN_PAGES = 8;
// It fades this long after the last scroll.
export const FAST_SCROLL_HIDE_MS = 1200;
export const FAST_SCROLL_THUMB = 48;
// Off the screen's edge, where the predictive Back swipe starts.
export const FAST_SCROLL_EDGE = 12;
const TRACK_PAD = 8;

export function showsFastScroll(pageCount: number): boolean {
  return pageCount >= FAST_SCROLL_MIN_PAGES;
}

// Where the thumb's top edge may be: from `top` over `length` screen pixels.
export function thumbTrack(viewport: Size, insets: ContentInsets = NO_INSETS): { top: number; length: number } {
  'worklet';
  const top = insets.top + TRACK_PAD;
  return { top, length: Math.max(0, viewport.height - insets.bottom - TRACK_PAD - FAST_SCROLL_THUMB - top) };
}

// How far down the document the view is, 0 at its start to 1 at its end.
export function scrollProgress(layout: ColumnLayout, view: ColumnView, viewport: Size, insets: ContentInsets = NO_INSETS): number {
  'worklet';
  const range = scrollRange(layout, view.scale, viewport, insets);
  const span = range.maxTy - range.minTy;
  return span > 0 ? Math.min(1, Math.max(0, (range.maxTy - view.ty) / span)) : 0;
}

export function thumbTop(progress: number, track: { top: number; length: number }): number {
  'worklet';
  return track.top + progress * track.length;
}

// The thumb dragged so its top edge is at screen y.
export function progressAtThumb(y: number, track: { top: number; length: number }): number {
  'worklet';
  return track.length > 0 ? Math.min(1, Math.max(0, (y - track.top) / track.length)) : 0;
}

// The view at a progress, keeping the zoom and the sideways position.
export function viewAtProgress(layout: ColumnLayout, view: ColumnView, progress: number, viewport: Size, insets: ContentInsets = NO_INSETS): ColumnView {
  'worklet';
  const range = scrollRange(layout, view.scale, viewport, insets);
  return clampView(layout, { scale: view.scale, tx: view.tx, ty: range.maxTy - progress * (range.maxTy - range.minTy) }, viewport, insets);
}

// The page the bubble names while dragging: the one the view at that progress would be on.
export function pageAtProgress(layout: ColumnLayout, view: ColumnView, progress: number, viewport: Size, insets: ContentInsets = NO_INSETS): number {
  'worklet';
  return currentPage(layout, viewAtProgress(layout, view, progress, viewport, insets), viewport.height, insets);
}
