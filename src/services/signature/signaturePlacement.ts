import { libraryIdxFor, pdfPageFor, pdfRectFor } from '../documents/pageMap';
import type { SignatureDraw } from '../pdf/pdfService';
import { boxMatrix, normalizeRotation, turnedSize } from '../pdf/rotation';
import type { LibraryDocument, OcrBounding } from '../../types/models';

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

// The library pages shown on one PDF page (1-based), in reading order: one, or the two columns of
// a 2-in-1 sheet. Empty when that PDF page has no library page (an imported PDF whose pages aren't
// all listed yet): libraryIdxFor clamps to the nearest page, and signing a neighbour would be the
// wrong-page bug again.
export function signTargets(doc: Pick<LibraryDocument, 'pages' | 'coverKind' | 'pdfLayout'>, pdfPage: number): number[] {
  const columns = [libraryIdxFor(doc, pdfPage, 0), libraryIdxFor(doc, pdfPage, 1)];
  return columns.filter((idx, i) => columns.indexOf(idx) === i && !!doc.pages[idx] && pdfPageFor(doc, idx).page === pdfPage);
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
