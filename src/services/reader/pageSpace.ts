import type { Matrix } from '../pdf/rotation';
import type { OcrBounding, PageRotation } from '../../types/models';
import type { ContentRect } from './surfaceGeometry';

// §18 W8: the coordinate space a page's overlay data is measured in (marks, OCR and PDF word
// boxes, signatures), and how it lands on the page as the surface shows it. Three things differ
// between the kinds of pages:
//  - the unit: a scan's master pixels, an imported page's indexed pixels (R1), or PDF points;
//  - the turn: the data stays in the unturned page (§7 R3), the surface shows the page turned;
//  - a placement: a scan page merged into a PDF is an image fit inside the PDF page's margins, so
//    its master pixels cover only part of the page.
// Every space has its origin top-left and y down, like OCR boxes. One matrix per page then takes
// any of it to the screen (`overlayMatrix`), and its inverse takes a touch back.
//
// No pdf-lib here (the `Matrix` import is a type): this is used while drawing.

export type SpaceUnit = 'master' | 'indexed' | 'points';

// A rectangle in fractions of a page (0–1, top-left origin).
export type UnitRect = { x: number; y: number; width: number; height: number };

export type PageSpace = {
  unit: SpaceUnit;
  // The space's own size: a point (width, height) is its bottom-right corner.
  width: number;
  height: number;
  // Clockwise, from the space to the page as shown.
  turn: PageRotation;
  // The part of the unturned page the space covers. Undefined: all of it.
  placement?: UnitRect;
};

// Pixels of the whole (unturned) page: a scan's master, or an imported page as indexed.
export function pixelSpace(unit: 'master' | 'indexed', page: { width: number; height: number; rotation?: PageRotation }): PageSpace {
  return { unit, width: Math.max(1, page.width), height: Math.max(1, page.height), turn: page.rotation ?? 0 };
}

// The page as shown, in points: what pdfium reports for words and links (already turned).
export function pointsSpace(shown: { width: number; height: number }): PageSpace {
  return { unit: 'points', width: Math.max(1, shown.width), height: Math.max(1, shown.height), turn: 0 };
}

// `after` applied to the result of `first`.
export function multiply(after: Matrix, first: Matrix): Matrix {
  return [
    after[0] * first[0] + after[2] * first[1],
    after[1] * first[0] + after[3] * first[1],
    after[0] * first[2] + after[2] * first[3],
    after[1] * first[2] + after[3] * first[3],
    after[0] * first[4] + after[2] * first[5] + after[4],
    after[1] * first[4] + after[3] * first[5] + after[5],
  ];
}

export function invert(m: Matrix): Matrix {
  const det = m[0] * m[3] - m[1] * m[2] || 1;
  const a = m[3] / det;
  const b = -m[1] / det;
  const c = -m[2] / det;
  const d = m[0] / det;
  return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])];
}

export function mapPoint(m: Matrix, x: number, y: number): { x: number; y: number } {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

// A box through a matrix: the box around its turned corners.
export function mapRect(m: Matrix, rect: OcrBounding): OcrBounding {
  const a = mapPoint(m, rect.left, rect.top);
  const b = mapPoint(m, rect.left + rect.width, rect.top + rect.height);
  return { left: Math.min(a.x, b.x), top: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
}

// The unturned page (fractions) → the page as shown (fractions), a clockwise turn: the unturned
// top-left corner ends up top-right after a quarter turn.
function turnMatrix(turn: PageRotation): Matrix {
  switch (turn) {
    case 90:
      return [0, 1, -1, 0, 1, 0];
    case 180:
      return [-1, 0, 0, -1, 1, 1];
    case 270:
      return [0, -1, 1, 0, 0, 1];
    default:
      return [1, 0, 0, 1, 0, 0];
  }
}

// The space → fractions of the page as shown.
export function spaceToShown(space: PageSpace): Matrix {
  const part = space.placement ?? { x: 0, y: 0, width: 1, height: 1 };
  const toPage: Matrix = [part.width / space.width, 0, 0, part.height / space.height, part.x, part.y];
  return multiply(turnMatrix(space.turn), toPage);
}

// The space → the page's box (content coordinates when the box is the layout's; a box at (0, 0)
// gives coordinates inside a page view). Skia draws a page's overlays under this.
export function overlayMatrix(box: ContentRect, space: PageSpace): Matrix {
  return multiply([box.width, 0, 0, box.height, box.x, box.y], spaceToShown(space));
}

// The other way, for a touch: a point in the page's box → the space.
export function boxToSpace(box: ContentRect, space: PageSpace): Matrix {
  return invert(overlayMatrix(box, space));
}

// How long one unit of the space is in the box (a stroke's width, a text size). Turns swap the
// axes but a page keeps its shape, so one number does.
export function spaceScale(box: ContentRect, space: PageSpace): number {
  const m = overlayMatrix(box, space);
  return Math.hypot(m[0], m[1]);
}

// Row-major 3×3, as Skia's Matrix takes it.
export function matrix3(m: Matrix): number[] {
  return [m[0], m[2], m[4], m[1], m[3], m[5], 0, 0, 1];
}
