import type { DocFormat, LibraryDocument } from '../../types/models';
import { MIME_BY_FORMAT } from '../../utils/docFormat';
import { isPdfNativeAvailable } from '../pdf/pdfNative';

// Formats read page by page through the PDF engine: everything the scan pipeline produces, plus
// PDFs promoted via promoteExternalToLibrary. Merge/Split/Compress/Sign/Submit work on these -
// from the page masters for scans, at the PDF level for imported PDFs (§7 R2); every other format
// has pages: [] (or one text page) and its own viewer instead.
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

// §7 R2: an imported PDF (or a merge that contains one) is edited as a PDF - pages copied or
// turned with pdf-lib - because its pages have no master images (fileUri '').
export function isPdfLevel(doc: Pick<LibraryDocument, 'sourceKind'>): boolean {
  return doc.sourceKind === 'imported_pdf';
}

// The PDF needs a password (found by R1's indexing): no page tools; it still opens in the Reader.
export function isPasswordProtected(doc: Pick<LibraryDocument, 'indexState'>): boolean {
  return doc.indexState === 'encrypted';
}

// Merge, Split, Compress: any PDF/JPG document that isn't password-protected.
export function canUsePageTools(doc: LibraryDocument): boolean {
  return isPageRasterFormat(doc.format) && !isPasswordProtected(doc);
}

// Sign. A scan is signed on its master; an imported PDF on a page rendered on demand, which
// needs modules/pdf-native in this build.
export function canSign(doc: LibraryDocument): boolean {
  return canUsePageTools(doc) && (!isPdfLevel(doc) || isPdfNativeAvailable());
}

// Submit (§4): a scan rebuilds from its masters; an imported PDF is sent as it is (with the
// preset's cover and footer added), rasterized only to fit a size limit.
export function canSubmit(doc: LibraryDocument): boolean {
  return canSign(doc) && doc.pages.length > 0;
}

// Tools that draw on or copy a page's master image: select/copy text, annotate (T3/T4), exam
// packs (T6). Not for PDF-level documents, whose pages have no master.
export function hasPageMasters(doc: LibraryDocument): boolean {
  return isPageRasterFormat(doc.format) && !isPdfLevel(doc) && doc.pages.length > 0;
}

export function canFindInDoc(format: DocFormat): boolean {
  return IN_READER_FIND_FORMATS.includes(format);
}
