import { File } from 'expo-file-system';
import { isPdfLevel } from '../documents/formatCapabilities';
import { extractPages, rearrangePages } from '../pdf/pdfOps';
import { buildPdfFromPages, pageSizeOfPdf, toSourcePage } from '../pdf/pdfService';
import { normalizeRotation } from '../pdf/rotation';
import type { LibraryDocument, LibraryPage, PageRotation } from '../../types/models';
import { createId } from '../../utils/id';
import { copyPageInto, fullyIndexed, pageFiles } from './libraryOperations';
import { cleanTemporaryCache, getDocumentDir } from './libraryFiles';

// §7 R3, "Edit pages" on a saved document: the student's changes are a draft (PageEdit) until
// Save. Pages are referred to by id throughout, so bookmarks, annotations and search hits keep
// pointing at the right page whatever moves; a deleted page takes its own with it
// (library/UPDATE_FILE drops them).

export type PageEdit = {
  // The pages kept, in their new order.
  order: string[];
  // Each page's turn, clockwise (absent = 0).
  rotation: Record<string, PageRotation>;
};

export function startEdit(doc: LibraryDocument): PageEdit {
  const rotation: Record<string, PageRotation> = {};
  for (const page of doc.pages) if (page.rotation) rotation[page.id] = page.rotation;
  return { order: doc.pages.map((p) => p.id), rotation };
}

// --- Draft changes (pure) ---

export function rotatePages(edit: PageEdit, ids: readonly string[], by = 90): PageEdit {
  const rotation = { ...edit.rotation };
  for (const id of ids) {
    const next = normalizeRotation((rotation[id] ?? 0) + by);
    if (next) rotation[id] = next;
    else delete rotation[id];
  }
  return { ...edit, rotation };
}

export function removePages(edit: PageEdit, ids: readonly string[]): PageEdit {
  return { ...edit, order: edit.order.filter((id) => !ids.includes(id)) };
}

// Moves the selected pages one place earlier (-1) or later (+1), as a group, keeping their order.
// Pages already at the edge stay.
export function movePages(edit: PageEdit, ids: readonly string[], step: -1 | 1): PageEdit {
  const order = [...edit.order];
  const indexes = order.map((id, i) => (ids.includes(id) ? i : -1)).filter((i) => i >= 0);
  const walk = step < 0 ? indexes : [...indexes].reverse();
  for (const i of walk) {
    const j = i + step;
    if (j < 0 || j >= order.length || ids.includes(order[j])) continue;
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { ...edit, order };
}

// The document's pages as the draft has them.
export function editedPages(doc: LibraryDocument, edit: PageEdit): LibraryPage[] {
  const byId = new Map(doc.pages.map((p) => [p.id, p]));
  return edit.order
    .map((id) => byId.get(id))
    .filter((p): p is LibraryPage => !!p)
    .map((p) => ({ ...p, rotation: edit.rotation[p.id] || undefined }));
}

export function isEdited(doc: LibraryDocument, edit: PageEdit): boolean {
  if (edit.order.length !== doc.pages.length || edit.order.some((id, i) => doc.pages[i].id !== id)) return true;
  return doc.pages.some((p) => (p.rotation ?? 0) !== (edit.rotation[p.id] ?? 0));
}

// --- Saving ---

// Writes the draft: a scan's document.pdf is rebuilt from its masters with the new order and
// turns (/Rotate - nothing re-encoded); an imported PDF's pages are rearranged and turned with
// pdf-lib, untouched otherwise. Removed pages' files are deleted once the new PDF is written.
// An imported PDF must be fully indexed first: its page rows are what say which PDF page is which.
// §18 W17: marks and signatures are rows on pages (by id), so they follow whatever moves and
// nothing of them is written here. A scan needs no document.pdf to begin with: it gets one.
export async function savePageEdit(doc: LibraryDocument, edit: PageEdit): Promise<LibraryDocument> {
  if (isPdfLevel(doc) && !doc.pdfUri) throw new Error(`savePageEdit: ${doc.id} has no PDF`);
  const pages = editedPages(doc, edit);
  if (pages.length === 0) throw new RangeError('A document needs at least one page');
  const kept = new Set(pages.map((p) => p.id));
  const removed = doc.pages.filter((p) => !kept.has(p.id));
  const dest = new File(getDocumentDir(doc.id), 'document.pdf');

  let next: LibraryDocument;
  if (isPdfLevel(doc)) {
    if (!fullyIndexed(doc)) throw new PagesNotReadyError();
    const indexOf = new Map(doc.pages.map((p, i) => [p.id, i]));
    const turnBy = pages.map((p) => (p.rotation ?? 0) - (doc.pages[indexOf.get(p.id)!].rotation ?? 0));
    const result = await rearrangePages(doc.pdfUri!, pages.map((p) => indexOf.get(p.id)!), turnBy, dest);
    next = { ...doc, pages, pdfUri: result.uri, sizeBytes: result.sizeBytes };
  } else {
    const pageSize = await pageSizeOfPdf(doc.pdfUri);
    const result = await buildPdfFromPages(doc.id, pages.map(toSourcePage), 'as-is', undefined, 'standard', pageSize, { dest });
    // A rebuild lays every page out as a plain content page (see compressDocument), so a cover
    // is a cover no longer.
    next = {
      ...doc,
      pages,
      pdfUri: result.uri,
      sizeBytes: doc.format === 'PDF' ? result.sizeBytes : doc.sizeBytes,
      coverKind: undefined,
      pdfLayout: 'standard',
      pdfPageSize: pageSize,
    };
  }
  cleanTemporaryCache(removed.flatMap(pageFiles));
  return next;
}

// An imported PDF still being read (R1): Edit pages waits until every page has its row.
export class PagesNotReadyError extends Error {
  constructor() {
    super("This PDF's pages are still being read");
    this.name = 'PagesNotReadyError';
  }
}

// "Extract": the chosen pages (in document order) as a new document in the same course. The
// source keeps them; the copies get new ids. Imported pages are copied as PDF pages, untouched.
export async function extractToNewDocument(doc: LibraryDocument, pageIds: readonly string[]): Promise<LibraryDocument> {
  if (!doc.pdfUri) throw new Error(`extractToNewDocument: ${doc.id} has no PDF`);
  const picked = doc.pages.map((page, index) => ({ page, index })).filter(({ page }) => pageIds.includes(page.id));
  if (picked.length === 0) throw new RangeError('Nothing to extract');
  const documentId = createId('doc');
  const dir = getDocumentDir(documentId);
  const pages = picked.map(({ page }, i) => copyPageInto(page, dir, i + 1));
  const numbers = picked.map(({ index }) => index + 1);
  const name = `${doc.name}_p${numbers.length > 4 ? `${numbers[0]}-${numbers[numbers.length - 1]}` : numbers.join('_')}`;
  const base: LibraryDocument = {
    id: documentId,
    name,
    format: doc.format,
    mode: doc.mode,
    pages,
    sizeBytes: 0,
    createdAt: Date.now(),
    star: false,
    tag: doc.tag,
    locked: false,
    courseId: doc.courseId,
    docType: doc.docType,
    pdfLayout: 'standard',
  };

  if (isPdfLevel(doc)) {
    if (!fullyIndexed(doc)) throw new PagesNotReadyError();
    // The pages carry their current /Rotate with them, which is what their rows' turns describe.
    const result = await extractPages(doc.pdfUri, picked.map(({ index }) => index), new File(dir, 'document.pdf'));
    return { ...base, pdfUri: result.uri, sizeBytes: result.sizeBytes, sourceKind: 'imported_pdf', indexedAt: Date.now(), indexState: 'done' };
  }
  const pageSize = await pageSizeOfPdf(doc.pdfUri);
  const result = await buildPdfFromPages(documentId, pages.map(toSourcePage), 'as-is', undefined, 'standard', pageSize);
  // A JPG document's size is its images' (as splitDocument counts it).
  const sizeBytes = doc.format === 'PDF' ? result.sizeBytes : pages.reduce((sum, p) => sum + (new File(p.fileUri).size ?? 0), 0);
  return { ...base, pdfUri: result.uri, sizeBytes, pdfPageSize: pageSize };
}
