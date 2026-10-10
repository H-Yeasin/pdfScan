import type { LibraryPage, OcrBounding } from '../../types/models';
import { HIGHLIGHT_COLORS, PEN_COLORS, PEN_WIDTHS } from './palette';

// §12 D3 Mark mode: the remembered tool, and the geometry of the page column (MarkView), kept pure
// so it can be tested without rendering.

// §12 D10: 'text', a typed text box, is the one Pro tool (through D1's gate, `pdfForms`).
export type MarkTool = 'highlight' | 'underline' | 'strike' | 'pen' | 'note' | 'text' | 'eraser' | 'hand';
export const MARK_TOOLS: readonly MarkTool[] = ['highlight', 'underline', 'strike', 'pen', 'note', 'text', 'eraser', 'hand'];

export type HighlightColor = keyof typeof HIGHLIGHT_COLORS;
export type PenColor = keyof typeof PEN_COLORS;
export type PenWidth = keyof typeof PEN_WIDTHS;

// §12 D10: text box sizes, as a share of the page's width, so a box reads the same on a 2400 px
// scan and on an imported page indexed at another size (on A4: about 10, 13 and 18 pt).
export const TEXT_SIZES = { small: 1 / 60, medium: 1 / 45, large: 1 / 32 } as const;
export type TextSize = keyof typeof TEXT_SIZES;

// The last tool and colours, so Mark mode opens the way the student left it. Underline and strike
// share one colour (from the pen's: a yellow line under black text barely shows).
export type MarkPrefs = {
  tool: MarkTool;
  highlightColor: HighlightColor;
  lineColor: PenColor;
  penColor: PenColor;
  penWidth: PenWidth;
  textColor: PenColor;
  textSize: TextSize;
};

export const DEFAULT_MARK: MarkPrefs = {
  tool: 'highlight',
  highlightColor: 'yellow',
  lineColor: 'red',
  penColor: 'black',
  penWidth: 'thin',
  textColor: 'black',
  textSize: 'medium',
};

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
    textColor: pick(pens, r.textColor, DEFAULT_MARK.textColor),
    textSize: pick(Object.keys(TEXT_SIZES) as TextSize[], r.textSize, DEFAULT_MARK.textSize),
  };
}

// --- §12 D10 text boxes (master pixels) ---

export const TEXT_LINE_HEIGHT = 1.2;
// Room around the text for the finger (moving, editing) and so a glyph's overhang isn't cut.
const TEXT_PAD = 0.15;

export function textSizeFor(page: Pick<LibraryPage, 'width'>, size: TextSize): number {
  return Math.max(8, page.width * TEXT_SIZES[size]);
}

// The box a text takes with its top-left corner at (x, y), kept on the page where it fits.
// `measure` gives one line's width at a size (visibleText.measureText in the app).
export function textBoxAt(
  page: Pick<LibraryPage, 'width' | 'height'>,
  text: string,
  at: { x: number; y: number },
  size: number,
  measure: (line: string, size: number) => number
): OcrBounding {
  const lines = text.split('\n');
  const width = Math.max(size, ...lines.map((l) => measure(l, size))) + size * TEXT_PAD;
  const height = lines.length * size * TEXT_LINE_HEIGHT;
  return {
    left: Math.max(0, Math.min(at.x, page.width - width)),
    top: Math.max(0, Math.min(at.y, page.height - height)),
    width,
    height,
  };
}

// A box moved by (dx, dy), kept on the page.
export function moveBox(page: Pick<LibraryPage, 'width' | 'height'>, box: OcrBounding, dx: number, dy: number): OcrBounding {
  return {
    ...box,
    left: Math.max(0, Math.min(box.left + dx, page.width - box.width)),
    top: Math.max(0, Math.min(box.top + dy, page.height - box.height)),
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

// The column's geometry (every page at the column's width, one under the other, zoomed and moved
// as one layer) moved to services/reader/surfaceGeometry.ts in §18 W8, where the page surface
// builds on it. Re-exported here so MarkView keeps working until the surface replaces it (W18).
export {
  clampView,
  columnLayout,
  contentToMaster,
  currentPage,
  pageAtY,
  screenToContent,
  viewForPage,
  zoomAbout,
  type ColumnLayout,
  type ColumnView,
} from '../reader/surfaceGeometry';
