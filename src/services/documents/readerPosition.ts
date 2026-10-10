// §7 R4: where the Reader opens a document, and the "go to page" box. Pages are PDF pages,
// 1-based, as the Reader counts them.
import type { ScreenRole } from '../../navigation/screenRole';
import type { DocFormat, LibraryDocument, PagePosition, ReaderPosition, ViewerPosition } from '../../types/models';
import { libraryIdxFor, pdfPageCount, pdfPageFor } from './pageMap';

type PositionDoc = Pick<LibraryDocument, 'pages' | 'coverKind' | 'pdfLayout'>;

// §18 W5: the page the viewer is opened on (its `initialPage`), known before the PDF has loaded,
// so there's no page-1 frame and no jump after it: the page of a search hit or a bookmark being
// opened (§5 T2/T5; that wins), else where the student left off. undefined: page 1. A saved page
// past the end (pages deleted since, §7 R3) isn't known here; the viewer opens at its last page.
export function openingPage(lastPage: number | undefined, targetPage?: number | null): number | undefined {
  const page = Math.round(targetPage || lastPage || 1);
  return page > 1 ? page : undefined;
}

// §18 W5: the document a Reader instance shows. The store holds one open document
// (reader.readerId / reader.external), and since §16 G2 a Reader can stay mounted while it isn't
// on screen (under Pro or a cover's options, or sliding away). Only the active one follows the
// store; any other keeps what it showed when it last was active, so it never loads a document
// nobody is looking at. null: it has never been active, and renders nothing.
export function heldSubject<T>(role: ScreenRole, current: T, held: T | null): T | null {
  return role === 'active' ? current : held;
}

// §18 W5: the PDF page to show after Edit pages rewrote document.pdf, so reordering, turning or
// deleting pages doesn't throw the student back to page 1: the page that holds the library page
// they were on (found by its id). When that page was deleted: the nearest page after it that was
// kept, else the nearest before it.
export function pdfPageAfterEdit(oldDoc: PositionDoc, newDoc: PositionDoc, pdfPage: number): number {
  const from = libraryIdxFor(oldDoc, pdfPage);
  const kept = new Map(newDoc.pages.map((p, i) => [p.id, i]));
  const candidates = [...oldDoc.pages.slice(from), ...oldDoc.pages.slice(0, from).reverse()];
  const id = candidates.find((p) => kept.has(p.id))?.id;
  if (id === undefined) return Math.min(Math.max(1, pdfPage), Math.max(1, pdfPageCount(newDoc)));
  return pdfPageFor(newDoc, kept.get(id)!).page;
}

// §18 W5: the numbers the top bar shows, "12 / 40". Library pages, like the page strip, the
// bookmarks and the notes panel, not PDF pages: after a cover or on a 2-in-1 sheet the two differ
// (`first`–`last` are the two pages of a sheet). `library: false`: PDF pages as the viewer counts
// them, for a file from outside and for a document whose page list doesn't match its PDF yet (an
// imported PDF before the indexer has counted it).
export type PageLabel = { first: number; last: number; count: number; library: boolean };

export function pageLabel(doc: PositionDoc | undefined, pdfPage: number, pdfCount: number): PageLabel {
  if (!doc || doc.pages.length === 0 || pdfPageCount(doc) !== pdfCount) {
    return { first: pdfPage, last: pdfPage, count: pdfCount, library: false };
  }
  return { first: libraryIdxFor(doc, pdfPage, 0) + 1, last: libraryIdxFor(doc, pdfPage, 1) + 1, count: doc.pages.length, library: true };
}

// A typed page number: whole digits only (spaces around them are fine), between 1 and the page
// count. null for anything else, so the box can say "no such page" instead of jumping somewhere
// unexpected.
export function parseJumpInput(text: string, pageCount: number): number | null {
  const trimmed = text.trim();
  if (!/^\d{1,6}$/.test(trimmed)) return null;
  const page = Number(trimmed);
  return page >= 1 && page <= pageCount ? page : null;
}

// §18 W18: why the page surface couldn't open a PDF, as its pdfium session says it
// (surface/usePdfSession.sessionErrorCode): the file wants a password (none given, or the wrong
// one), or it can't be read at all.
export type NativePdfErrorCode = 'password' | 'failed';

// What that means for the Reader. 'damaged': no password can help - "Can't open this file".
export type PdfLoadProblem = 'password' | 'damaged';

export function classifyNativePdfError(code: NativePdfErrorCode | undefined): PdfLoadProblem {
  return code === 'password' ? 'password' : 'damaged';
}

// §18 W19: the saved position's reading and writing (JSON, checked) is in positionCodec.ts, which
// the library's load and the store import at boot; this file pulls in the page map (and with it
// the PDF builder), so it stays off the boot path. Re-exported here for the Reader's code.
export { decodePosition, encodePosition, normalizePosition, remapPositionPage, samePosition } from './positionCodec';

// Where the page surface opens a document that was read before: the library page (0-based) and how
// far down it. The page is found by its id, so a reorder, a deleted page or a cover added since
// doesn't move the student; without one (or when that page is gone) the index stands in, kept
// inside the document. undefined: no saved page position (the caller falls back on `lastPage`).
export function resumeSpot(doc: Pick<LibraryDocument, 'pages'> | undefined, position: ReaderPosition | undefined): { index: number; fy: number } | undefined {
  if (position?.kind !== 'page') return undefined;
  const byId = position.pageId && doc ? doc.pages.findIndex((p) => p.id === position.pageId) : -1;
  if (byId >= 0) return { index: byId, fy: position.fy };
  // An index past the end is left to the surface, which opens on its last page.
  return { index: position.index, fy: position.pageId ? 0 : position.fy };
}

// What the surface reports, as the position to save.
export function pagePosition(doc: Pick<LibraryDocument, 'pages'> | undefined, index: number, fy: number): PagePosition {
  const pageId = doc?.pages[index]?.id;
  const at = { index: Math.max(0, Math.floor(index)), fy: Math.min(1, Math.max(0, fy)) };
  return pageId ? { kind: 'page', pageId, ...at } : { kind: 'page', ...at };
}

// The saved position as the format's own viewer takes it: only one of that viewer's kind (a file
// whose format changed under the same row, or a position from the surface, starts at the top).
const VIEWER_KIND: Partial<Record<DocFormat, ViewerPosition['kind']>> = { TXT: 'txt', CSV: 'sheet', XLSX: 'sheet', XLS: 'sheet', DOCX: 'docx' };

export function viewerPositionFor(format: DocFormat | undefined, position: ReaderPosition | undefined): ViewerPosition | undefined {
  if (!format || !position || position.kind === 'page') return undefined;
  return VIEWER_KIND[format] === position.kind ? position : undefined;
}
