import { NOTE_ICON } from '../annotations/hitTest';
import { TEXT_LINE_HEIGHT } from '../annotations/markMode';
import { isRectMark, markLine, turnedContentSize, turnedQuad } from '../annotations/marks';
import { annotationColor, NOTE_COLOR, PEN_COLORS } from '../annotations/palette';
import type { Matrix } from '../pdf/rotation';
import type { Annotation, OcrBounding, PageRotation } from '../../types/models';

// §18 W15 (A6): what the page surface draws for a mark, pure. Every shape is in the page's own
// space (the one the mark is stored in: PageSpace); the overlay draws a page's shapes under that
// page's matrix, so turned pages, merged scans and any zoom need nothing here. One row gives one
// or more shapes; the overlay knows how to draw each `type` and nothing about marks.

export type MarkShape =
  // A highlight's box, or an underline's or strike's thin line. `alpha` 1 draws it solid.
  | { type: 'rect'; key: string; rect: OcrBounding; color: string; alpha: number }
  // A pen stroke, as an SVG path of its points.
  | { type: 'stroke'; key: string; path: string; color: string; width: number }
  // A pen stroke of one point: a dot.
  | { type: 'dot'; key: string; x: number; y: number; r: number; color: string }
  // A note's icon.
  | { type: 'note'; key: string; rect: OcrBounding; radius: number; fill: string; edge: string; edgeWidth: number }
  // A typed text box. `frame` takes the text's own upright frame (origin its top-left corner,
  // `width` × `height`) into the space, turned as the box says; `lines` are placed in that frame,
  // each by the top of its line. `box` is the box around it, for an outline.
  | { type: 'text'; key: string; id: string; box: OcrBounding; frame: Matrix; width: number; height: number; size: number; color: string; lines: { text: string; top: number }[] }
  // A signature: its PNG's name in the document's folder. `frame` takes the unit square (the
  // image) into the space.
  | { type: 'signature'; key: string; id: string; documentId: string; file: string; box: OcrBounding; frame: Matrix };

export type MarkShapeOptions = {
  // How see-through a highlight is (overlayPalette: weaker on dark pages).
  highlightAlpha: number;
  // A box being dragged (a text box, a signature): drawn where it is now.
  moved?: { id: string; box: OcrBounding } | null;
  // On a night page: what an ink colour is shown in (darkMatrix.nightColor), so a black pen
  // doesn't vanish on dark paper. Pen, underline, strike and typed text; a highlight and a
  // note's icon keep theirs.
  ink?: (color: string) => string;
};

const NOTE_RADIUS = 8;
const NOTE_EDGE = 3;

// The matrix that takes content of `size` (top-left origin) into `box`, turned by `turn`.
export function turnedFrame(box: OcrBounding, turn: PageRotation | undefined, size: { width: number; height: number }): Matrix {
  const { tl, tr, bl } = turnedQuad(box, turn);
  const w = Math.max(size.width, 1e-6);
  const h = Math.max(size.height, 1e-6);
  return [(tr.x - tl.x) / w, (tr.y - tl.y) / w, (bl.x - tl.x) / h, (bl.y - tl.y) / h, tl.x, tl.y];
}

function strokePath(points: readonly [number, number][]): string {
  return points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${round(x)} ${round(y)}`).join(' ');
}

// Two decimals: a path string is parsed on every draw of a new mark, and master pixels need no more.
function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export function markShapes(a: Annotation, options: MarkShapeOptions): MarkShape[] {
  const d = a.data;
  const own = annotationColor(a.color);
  const color = a.kind === 'highlight' || !options.ink ? own : options.ink(own);
  if ('rects' in d) {
    if (!isRectMark(a.kind)) return [];
    const kind = a.kind;
    return d.rects.map((rect, i) => ({
      type: 'rect',
      key: `${a.id}:${i}`,
      rect: kind === 'highlight' ? rect : markLine(kind, rect),
      color,
      alpha: kind === 'highlight' ? options.highlightAlpha : 1,
    }));
  }
  if ('strokes' in d) {
    return d.strokes.flatMap((stroke, i): MarkShape[] => {
      if (stroke.length === 0) return [];
      if (stroke.length === 1) return [{ type: 'dot', key: `${a.id}:${i}`, x: stroke[0][0], y: stroke[0][1], r: d.width / 2, color }];
      return [{ type: 'stroke', key: `${a.id}:${i}`, path: strokePath(stroke), color, width: d.width }];
    });
  }
  const moved = options.moved?.id === a.id ? options.moved.box : null;
  if ('file' in d) {
    const box = moved ?? d.box;
    return [{ type: 'signature', key: a.id, id: a.id, documentId: a.documentId, file: d.file, box, frame: turnedFrame(box, d.turn, { width: 1, height: 1 }) }];
  }
  if ('size' in d) {
    const box = moved ?? d.box;
    const frameSize = turnedContentSize(box, d.turn);
    const lines = (a.text ?? '').split('\n').map((text, i) => ({ text, top: i * d.size * TEXT_LINE_HEIGHT }));
    return [{ type: 'text', key: a.id, id: a.id, box, frame: turnedFrame(box, d.turn, frameSize), ...frameSize, size: d.size, color, lines }];
  }
  if ('x' in d) {
    return [
      {
        type: 'note',
        key: a.id,
        rect: { left: d.x - NOTE_ICON / 2, top: d.y - NOTE_ICON / 2, width: NOTE_ICON, height: NOTE_ICON },
        radius: NOTE_RADIUS,
        fill: NOTE_COLOR,
        edge: PEN_COLORS.black,
        edgeWidth: NOTE_EDGE,
      },
    ];
  }
  return [];
}

// A page's shapes are built once per state of its rows: the key says when that changes.
export function shapesKey(rows: readonly Annotation[]): string {
  return rows.map((a) => `${a.id}:${a.updatedAt}`).join('|');
}
