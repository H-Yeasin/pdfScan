import type { DocFormat, LibraryDocument } from '../../types/models';
import { MIME_BY_FORMAT } from '../../utils/docFormat';

// Formats with real rasterized page images (LibraryPage[] with a real fileUri) - everything the
// scan pipeline produces, plus PDFs promoted via promoteExternalToLibrary. Merge/Split/Compress/
// Sign all operate on doc.pages by rebuilding a PDF from page images, so they only make sense for
// this set; every other format has pages: [] and its own native viewer instead.
export const PAGE_RASTER_FORMATS: DocFormat[] = ['PDF', 'JPG'];

// Formats whose reader mounts a local "Find" (substring scan over already-in-memory text/rows)
// rather than react-native-pdf-jsi's searchTextDirect, which is PDF-only.
export const IN_READER_FIND_FORMATS: DocFormat[] = ['PDF', 'CSV', 'TXT'];

// §7 R5: the formats a file from outside the app can be opened as - exactly the ones the Reader
// has a viewer for (PDF engine, TxtView, SheetView, DocxView). The in-app picker and app.json's
// "Open with" intent filters offer these and nothing else.
export const OPENABLE_FORMATS: readonly DocFormat[] = ['PDF', 'TXT', 'CSV', 'XLSX', 'XLS', 'DOCX'];

// Some Android file providers label CSV with an older MIME type.
const PICKER_MIME_ALIASES = ['text/comma-separated-values'];

export const PICKER_MIME_TYPES: readonly string[] = [...OPENABLE_FORMATS.map((format) => MIME_BY_FORMAT[format]), ...PICKER_MIME_ALIASES];

export function isPageRasterFormat(format: DocFormat): boolean {
  return PAGE_RASTER_FORMATS.includes(format);
}

// Sign (both the PDF composite-overlay flow and the JPG flatten-modal flow) needs real page
// images to draw onto. Imported PDFs (sourceKind: 'imported_pdf') are excluded too - their pages
// are synthetic blank-thumbnail stubs, not real images (see promoteExternalToLibrary).
export function canSign(doc: LibraryDocument): boolean {
  return isPageRasterFormat(doc.format) && doc.sourceKind !== 'imported_pdf';
}

// Submit (§4) rebuilds the PDF from the page masters, so it needs the same real page images.
export function canSubmit(doc: LibraryDocument): boolean {
  return canSign(doc) && doc.pages.length > 0;
}

export function canFindInDoc(format: DocFormat): boolean {
  return IN_READER_FIND_FORMATS.includes(format);
}
