import { concatTransformationMatrix, popGraphicsState, pushGraphicsState, type PDFPage } from 'pdf-lib';
import type { PageRotation } from '../../types/models';

// §7 R3: turning a page by a quarter turn without re-encoding it. Two tools:
//  - a standard page gets the PDF's own /Rotate (the viewer turns it), so nothing is redrawn;
//  - where a page can't be turned on its own (one column of a 2-in-1 sheet), or where something
//    must be drawn upright on a turned page (a footer, a rasterized page's text layer), drawing
//    goes through a transformation matrix instead. Still no pixel is re-encoded.
// Rotations are clockwise, as the page is shown, like /Rotate.

// [a b c d e f] as PDF's `cm`: x' = a·x + c·y + e, y' = b·x + d·y + f.
export type Matrix = [number, number, number, number, number, number];

export function normalizeRotation(angle: number): PageRotation {
  const r = ((Math.round(angle / 90) * 90) % 360 + 360) % 360;
  return r as PageRotation;
}

export function isSideways(rotation: number | undefined): boolean {
  return rotation === 90 || rotation === 270;
}

// The size of something width × height once turned.
export function turnedSize(width: number, height: number, rotation: number | undefined): { width: number; height: number } {
  return isSideways(rotation) ? { width: height, height: width } : { width, height };
}

// Maps an unturned drawing - origin bottom-left, y up, its size the box's size turned back - into
// `box` turned clockwise by `rotation`. Draw at (0, 0) with the unturned size under this matrix.
export function boxMatrix(box: { x: number; y: number; width: number; height: number }, rotation: number | undefined): Matrix {
  // The unturned drawing's own size.
  const local = turnedSize(box.width, box.height, rotation);
  switch (normalizeRotation(rotation ?? 0)) {
    case 90:
      // Its bottom-left corner ends up top-left.
      return [0, -1, 1, 0, box.x, box.y + local.width];
    case 180:
      return [-1, 0, 0, -1, box.x + local.width, box.y + local.height];
    case 270:
      // Its bottom-left corner ends up bottom-right.
      return [0, 1, -1, 0, box.x + local.height, box.y];
    default:
      return [1, 0, 0, 1, box.x, box.y];
  }
}

// Maps the page as shown (a viewer has applied /Rotate; origin bottom-left, y up) to the page's
// own unrotated space, where everything is drawn. pageWidth/pageHeight: the unrotated media box.
export function shownSpaceMatrix(pageWidth: number, pageHeight: number, rotate: number): Matrix {
  switch (normalizeRotation(rotate)) {
    case 90:
      return [0, 1, -1, 0, pageWidth, 0];
    case 180:
      return [-1, 0, 0, -1, pageWidth, pageHeight];
    case 270:
      return [0, -1, 1, 0, 0, pageHeight];
    default:
      return [1, 0, 0, 1, 0, 0];
  }
}

export function applyMatrix(m: Matrix, x: number, y: number): { x: number; y: number } {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

// A rectangle through a matrix: the box around its four turned corners.
export function transformRect(m: Matrix, rect: { x: number; y: number; width: number; height: number }) {
  const corners = [
    applyMatrix(m, rect.x, rect.y),
    applyMatrix(m, rect.x + rect.width, rect.y),
    applyMatrix(m, rect.x, rect.y + rect.height),
    applyMatrix(m, rect.x + rect.width, rect.y + rect.height),
  ];
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}

// Runs `draw` with the page's drawing transformed by `m` (q … Q, so nothing leaks out).
export async function withMatrix(page: PDFPage, m: Matrix, draw: () => void | Promise<void>): Promise<void> {
  const identity = m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && m[4] === 0 && m[5] === 0;
  if (identity) return draw();
  page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...m));
  try {
    await draw();
  } finally {
    page.pushOperators(popGraphicsState());
  }
}

// The page's size as shown, and the matrix to draw in that space (for upright stamps).
export function shownSpace(page: PDFPage): { width: number; height: number; matrix: Matrix } {
  const box = page.getMediaBox();
  const rotate = page.getRotation().angle;
  const shown = turnedSize(box.width, box.height, normalizeRotation(rotate));
  const m = shownSpaceMatrix(box.width, box.height, rotate);
  // A media box that doesn't start at 0,0 moves everything by its origin.
  return { ...shown, matrix: [m[0], m[1], m[2], m[3], m[4] + box.x, m[5] + box.y] };
}
