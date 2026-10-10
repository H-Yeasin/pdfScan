import { uprightTurn } from '../annotations/marks';
import { pdfPageFor, pdfRectFor } from '../documents/pageMap';
import type { SignatureDraw } from '../pdf/pdfService';
import { boxMatrix, normalizeRotation, turnedSize } from '../pdf/rotation';
import type { LibraryDocument, OcrBounding, PageRotation } from '../../types/models';

// §18 W1: where a signature goes in document.pdf. A signature is placed on a library page's
// master (SignaturePlacementOverlay), but the Reader shows PDF pages, and the two only line up
// for a plain standard document: a cover takes PDF page 1, a 2-in-1 sheet holds two library
// pages, and a turned column is drawn turned. So the placement goes through the page map (§5 T1,
// documents/pageMap.ts), the same way marks and OCR boxes do, instead of its own maths.

type PlacedDoc = Pick<LibraryDocument, 'pages' | 'coverKind' | 'pdfLayout' | 'pdfPageSize'>;

// A signature on a page's master: master pixels, top-left origin (SignaturePlacementOverlay's
// onConfirm, the same convention as SessionPage.cropRect).
export type SignaturePlacement = { originX: number; originY: number; width: number; height: number };

function placementBounding(placement: SignaturePlacement): OcrBounding {
  return { left: placement.originX, top: placement.originY, width: placement.width, height: placement.height };
}

// Where pdf-lib draws the signature placed on library page `libraryIdx`: the PDF page, the corner
// the image's own bottom-left lands on, its own size in points, and its turn. null for a page
// that doesn't exist.
export function signatureDraw(doc: PlacedDoc, libraryIdx: number, placement: SignaturePlacement): SignatureDraw | null {
  const page = doc.pages[libraryIdx];
  const rect = pdfRectFor(doc, libraryIdx, placementBounding(placement));
  if (!page || !rect) return null;
  // Only a 2-in-1 column is drawn turned (pdfService.drawTwoUpColumn), and the signature turns
  // with it, so it stays where it was put on the page. A standard page turns through /Rotate,
  // which turns everything drawn on it, the signature included.
  const turn = pdfPageFor(doc, libraryIdx).slot === 'full' ? 0 : normalizeRotation(page.rotation ?? 0);
  // `rect` is the box around the turned signature. boxMatrix puts an unturned drawing into such a
  // box: its translation is where the drawing's bottom-left corner ends up.
  const matrix = boxMatrix(rect, turn);
  const own = turnedSize(rect.width, rect.height, turn);
  return {
    pageIndex: rect.page - 1,
    x: matrix[4],
    y: matrix[5],
    width: own.width,
    height: own.height,
    // The page is turned clockwise; pdf-lib's angle is counter-clockwise.
    rotate: (360 - turn) % 360,
  };
}

// --- §18 W16 (A10): placing a signature on the page surface ---
// While it is being placed the signature is a box on the page as shown (content coordinates, the
// surface's own: upright on screen whatever the page's turn), moved and resized on the UI thread.
// Only when it is placed does it become a row in the page's own space (`placedSignature`).

type Box = { x: number; y: number; width: number; height: number };

// How much of the page's width a new signature takes, its margin from the corner, and the
// smallest it may be made (shares of the page's width).
const DEFAULT_SHARE = 0.34;
const CORNER_MARGIN = 0.06;
const MAX_HEIGHT_SHARE = 0.3;
export const MIN_SIGNATURE_SHARE = 0.08;
// How near a touch must be to the box's bottom-right corner to resize it (screen pixels), and
// how far outside the box a touch still moves it.
export const SIGN_HANDLE_HIT = 28;
export const SIGN_BOX_SLOP = 8;

// Where a signature of `aspectRatio` (width / height) starts: the bottom-right corner of the
// page (`page`: its box as shown), where a signature usually goes.
export function bottomRightBox(page: Box, aspectRatio: number): Box {
  const ratio = aspectRatio > 0 ? aspectRatio : 2;
  let width = page.width * DEFAULT_SHARE;
  let height = width / ratio;
  const maxHeight = page.height * MAX_HEIGHT_SHARE;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * ratio;
  }
  const margin = page.width * CORNER_MARGIN;
  return { x: page.x + Math.max(0, page.width - width - margin), y: page.y + Math.max(0, page.height - height - margin), width, height };
}

// The box moved by (dx, dy), kept on the page. Runs in the gesture worklet.
export function moveSignatureBox(page: Box, box: Box, dx: number, dy: number): Box {
  'worklet';
  return {
    x: Math.max(page.x, Math.min(box.x + dx, page.x + page.width - box.width)),
    y: Math.max(page.y, Math.min(box.y + dy, page.y + page.height - box.height)),
    width: box.width,
    height: box.height,
  };
}

// The box resized by its bottom-right handle dragged by (dx, dy): the top-left corner stays, the
// shape is kept, and it stays on the page and no smaller than the minimum.
export function resizeSignatureBox(page: Box, box: Box, dx: number, dy: number): Box {
  'worklet';
  const ratio = box.width / Math.max(1, box.height);
  // The drag's two directions are one size: the bigger pull wins.
  const wanted = Math.max(box.width + dx, (box.height + dy) * ratio);
  const most = Math.min(page.x + page.width - box.x, (page.y + page.height - box.y) * ratio);
  const least = Math.min(most, page.width * MIN_SIGNATURE_SHARE);
  const width = Math.max(least, Math.min(wanted, most));
  return { x: box.x, y: box.y, width, height: width / ratio };
}

// What a touch at (x, y) (content coordinates) takes hold of: the resize handle at the box's
// bottom-right corner, the box itself, or nothing (the page scrolls). `reach` and `slop` are in
// content units (the screen sizes above over the zoom). Runs in the gesture worklet.
export function signatureGrip(box: Box | null, x: number, y: number, reach: number, slop: number): 'resize' | 'move' | null {
  'worklet';
  if (!box) return null;
  if (Math.hypot(x - (box.x + box.width), y - (box.y + box.height)) <= reach) return 'resize';
  const inside = x >= box.x - slop && x <= box.x + box.width + slop && y >= box.y - slop && y <= box.y + box.height + slop;
  return inside ? 'move' : null;
}

// A placed box (content coordinates) as a signature row's data: the box in the page's own space
// (`toSpace`: pageSpace.boxToSpace of the page's box), and the turn that keeps the image upright
// on the page as it is shown now (`spaceTurn`: PageSpace.turn; marks.uprightTurn).
export function placedSignature(
  box: Box,
  toSpace: (rect: OcrBounding) => OcrBounding,
  spaceTurn: PageRotation
): { box: OcrBounding; turn: PageRotation } {
  return { box: toSpace({ left: box.x, top: box.y, width: box.width, height: box.height }), turn: uprightTurn(spaceTurn) };
}
