import { imagePlacement, pageDimensions, type PageSlot } from '../pdf/pdfService';
import type { LibraryDocument, OcrBounding } from '../../types/models';

// §5 T1: one page index everyone agrees on. Search results, bookmarks, annotations and exam packs
// refer to library pages (doc.pages[i]); this maps them onto document.pdf as the builder laid it
// out (pdfService.buildPdfFromPages): a cover page, if any, is PDF page 1 on its own; standard
// puts one library page per PDF page; 2-in-1 puts two content pages side by side per sheet.

type MappedDoc = Pick<LibraryDocument, 'pages' | 'coverKind' | 'pdfLayout' | 'pdfPageSize'>;

export type PdfPageRef = { page: number; slot: PageSlot };

function coverCount(doc: Pick<LibraryDocument, 'coverKind'>): number {
  return doc.coverKind ? 1 : 0;
}

// Library page index (0-based) → PDF page (1-based) and where on it.
export function pdfPageFor(doc: Pick<LibraryDocument, 'coverKind' | 'pdfLayout'>, libraryIdx: number): PdfPageRef {
  const covers = coverCount(doc);
  if (libraryIdx < covers) return { page: 1, slot: 'full' };
  const contentIdx = libraryIdx - covers;
  if (doc.pdfLayout === '2_in_1') return { page: covers + Math.floor(contentIdx / 2) + 1, slot: contentIdx % 2 === 0 ? 'left' : 'right' };
  return { page: covers + contentIdx + 1, slot: 'full' };
}

// The number of pages document.pdf has for this document.
export function pdfPageCount(doc: Pick<LibraryDocument, 'pages' | 'coverKind' | 'pdfLayout'>): number {
  const covers = coverCount(doc);
  const content = Math.max(0, doc.pages.length - covers);
  return covers + (doc.pdfLayout === '2_in_1' ? Math.ceil(content / 2) : content);
}

// The reverse, for a tap: PDF page (1-based) → library page index. On a 2-in-1 sheet,
// `xFraction` (0 at the left edge, 1 at the right) picks the column; the left one by default.
// Out-of-range pages clamp to the nearest library page.
export function libraryIdxFor(doc: Pick<LibraryDocument, 'pages' | 'coverKind' | 'pdfLayout'>, pdfPage: number, xFraction = 0): number {
  const last = Math.max(0, doc.pages.length - 1);
  const covers = coverCount(doc);
  if (covers && pdfPage <= 1) return 0;
  const sheet = Math.max(0, pdfPage - 1 - covers);
  const idx = doc.pdfLayout === '2_in_1' ? covers + sheet * 2 + (xFraction >= 0.5 ? 1 : 0) : covers + sheet;
  return Math.min(Math.max(0, idx), last);
}

// A PDF-space rectangle: points, origin bottom-left, as pdf-lib and PDF annotations use.
export type PdfRect = { page: number; x: number; y: number; width: number; height: number };

// Where a rectangle on a library page's master image (master pixels, top-left origin, like OCR
// boxes) lands in document.pdf. A template cover is a full-page drawing, not a placed image, so it
// scales to the whole page. null for a page that doesn't exist.
export function pdfRectFor(doc: MappedDoc, libraryIdx: number, rect: OcrBounding): PdfRect | null {
  const page = doc.pages[libraryIdx];
  if (!page) return null;
  const ref = pdfPageFor(doc, libraryIdx);
  const dims = pageDimensions(doc.pdfPageSize ?? 'A4');
  const placement =
    doc.coverKind === 'template' && libraryIdx === 0
      ? { origin: { x: 0, y: 0 }, width: dims.width, height: dims.height, scale: dims.width / page.width }
      : imagePlacement(page.width, page.height, ref.slot, dims, page.layout);
  return {
    page: ref.page,
    x: placement.origin.x + rect.left * placement.scale,
    y: placement.origin.y + placement.height - (rect.top + rect.height) * placement.scale,
    width: rect.width * placement.scale,
    height: rect.height * placement.scale,
  };
}
