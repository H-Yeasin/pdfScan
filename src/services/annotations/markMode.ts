import type { LibraryPage } from '../../types/models';
import { HIGHLIGHT_COLORS, PEN_COLORS, PEN_WIDTHS } from './palette';

// §12 D3 Mark mode: the remembered tool, and the geometry of the page column (MarkView), kept pure
// so it can be tested without rendering.

export type MarkTool = 'highlight' | 'underline' | 'strike' | 'pen' | 'note' | 'eraser' | 'hand';
export const MARK_TOOLS: readonly MarkTool[] = ['highlight', 'underline', 'strike', 'pen', 'note', 'eraser', 'hand'];

export type HighlightColor = keyof typeof HIGHLIGHT_COLORS;
export type PenColor = keyof typeof PEN_COLORS;
export type PenWidth = keyof typeof PEN_WIDTHS;

// The last tool and colours, so Mark mode opens the way the student left it. Underline and strike
// share one colour (from the pen's: a yellow line under black text barely shows).
export type MarkPrefs = {
  tool: MarkTool;
  highlightColor: HighlightColor;
  lineColor: PenColor;
  penColor: PenColor;
  penWidth: PenWidth;
};

export const DEFAULT_MARK: MarkPrefs = { tool: 'highlight', highlightColor: 'yellow', lineColor: 'red', penColor: 'black', penWidth: 'thin' };

function pick<T extends string>(options: readonly T[], value: unknown, fallback: T): T {
  return options.includes(value as T) ? (value as T) : fallback;
}

export function normalizeMark(raw: unknown): MarkPrefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof MarkPrefs, unknown>>;
  const highlights = Object.keys(HIGHLIGHT_COLORS) as HighlightColor[];
  const pens = Object.keys(PEN_COLORS) as PenColor[];
  return {
    tool: pick(MARK_TOOLS, r.tool, DEFAULT_MARK.tool),
    highlightColor: pick(highlights, r.highlightColor, DEFAULT_MARK.highlightColor),
    lineColor: pick(pens, r.lineColor, DEFAULT_MARK.lineColor),
    penColor: pick(pens, r.penColor, DEFAULT_MARK.penColor),
    penWidth: pick(Object.keys(PEN_WIDTHS) as PenWidth[], r.penWidth, DEFAULT_MARK.penWidth),
  };
}

// Tools that draw with one finger (the rest tap, or scroll).
export function isDrawingTool(tool: MarkTool): tool is 'highlight' | 'underline' | 'strike' | 'pen' {
  return tool === 'highlight' || tool === 'underline' || tool === 'strike' || tool === 'pen';
}

// The pages kept in memory around the one on screen: the current page ±radius. A page image
// (a 2400 px master, or a PDF page rendered on demand) is big, so the rest are empty boxes.
export function markWindow(current: number, count: number, radius = 1): number[] {
  const out: number[] = [];
  for (let i = Math.max(0, current - radius); i <= Math.min(count - 1, current + radius); i++) out.push(i);
  return out;
}

// The column: every page at the column's width, one under the other with `gap` between them, in
// unzoomed content coordinates (the layer is then zoomed and moved as a whole).
export type ColumnLayout = { width: number; tops: number[]; heights: number[]; total: number };

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

// The functions marked 'worklet' also run on the UI thread, inside MarkView's gestures.

// Zoom and position of the layer: a content point (x, y) shows at (x * scale + tx, y * scale + ty).
export type ColumnView = { scale: number; tx: number; ty: number };

// The page whose box holds content y, or the nearest one (a point in a gap belongs to the page
// above it; above the first page, the first).
export function pageAtY(layout: ColumnLayout, y: number): number {
  'worklet';
  let idx = 0;
  for (let i = 0; i < layout.tops.length; i++) if (layout.tops[i] <= y) idx = i;
  return idx;
}

// The page on screen: the one at the viewport's middle.
export function currentPage(layout: ColumnLayout, view: ColumnView, viewportHeight: number): number {
  'worklet';
  return pageAtY(layout, (viewportHeight / 2 - view.ty) / view.scale);
}

// A touch on screen → content coordinates.
export function screenToContent(view: ColumnView, x: number, y: number): { x: number; y: number } {
  'worklet';
  return { x: (x - view.tx) / view.scale, y: (y - view.ty) / view.scale };
}

// A content point → master pixels on page `idx` (outside its box when the finger has left it;
// snapping and drawing cope with that).
export function contentToMaster(layout: ColumnLayout, page: Pick<LibraryPage, 'width' | 'height'>, idx: number, x: number, y: number) {
  const k = page.width / layout.width;
  return { x: x * k, y: (y - layout.tops[idx]) * k };
}

// Keeps the column on screen: no scrolling past either end, no sideways drift when not zoomed in.
export function clampView(layout: ColumnLayout, view: ColumnView, viewport: { width: number; height: number }): ColumnView {
  'worklet';
  const scale = Math.max(1, view.scale);
  const minTx = viewport.width - layout.width * scale;
  const minTy = Math.min(0, viewport.height - layout.total * scale);
  return { scale, tx: Math.min(0, Math.max(minTx, view.tx)), ty: Math.min(0, Math.max(minTy, view.ty)) };
}

// The view that shows page `idx` at the top of the screen (at the current zoom), clamped.
export function viewForPage(layout: ColumnLayout, idx: number, view: ColumnView, viewport: { width: number; height: number }): ColumnView {
  const top = layout.tops[Math.max(0, Math.min(idx, layout.tops.length - 1))] ?? 0;
  return clampView(layout, { ...view, ty: -top * view.scale }, viewport);
}

// Zooming about a focal point (a pinch's centre) keeps the content under it in place.
export function zoomAbout(view: ColumnView, nextScale: number, focalX: number, focalY: number): ColumnView {
  'worklet';
  const ratio = nextScale / view.scale;
  return { scale: nextScale, tx: focalX - (focalX - view.tx) * ratio, ty: focalY - (focalY - view.ty) * ratio };
}
