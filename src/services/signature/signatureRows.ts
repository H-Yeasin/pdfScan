import { Directory, File, Paths } from 'expo-file-system';
import { uprightTurn } from '../annotations/marks';
import { canMarkPage, isPdfLevel } from '../documents/formatCapabilities';
import { invert, mapRect, pixelSpace, spaceToShown } from '../reader/pageSpace';
import type { Annotation, LibraryDocument, OcrBounding, PageRotation } from '../../types/models';
import { createId } from '../../utils/id';

// §18 W16 (A10): a signature on a page is an annotation row (`kind: 'signature'`), like a mark:
// where it sits (the page's own space, the one marks are stored in) and the name of its PNG. The
// PNG is a copy of the reusable signature, made when it is placed and kept in the document's
// folder, so drawing a new signature later never changes a document that is already signed, and
// a backup of the document carries it. The page's master is never touched (AGENTS.md), so the
// signature survives every rebuild, and can be moved or erased like a mark.

export type SignatureData = { box: OcrBounding; file: string; turn?: PageRotation };
export type SignatureRow = Annotation & { kind: 'signature'; data: SignatureData };

export function isSignature(a: Annotation): a is SignatureRow {
  return a.kind === 'signature' && 'file' in a.data;
}

// Only this shape is ever read: the name comes from a row, and a row may come from a backup
// someone else made.
const FILE_NAME = /^sig_[A-Za-z0-9_-]+\.png$/;

export function signatureFileName(id: string): string {
  return `sig_${id.replace(/[^A-Za-z0-9_-]/g, '')}.png`;
}

function documentDir(documentId: string): Directory {
  return new Directory(Paths.document, 'library', documentId);
}

// A row's PNG, or null for a name that isn't one of ours. The file may not exist.
export function signatureFile(row: Pick<Annotation, 'documentId' | 'data'>): File | null {
  const name = 'file' in row.data ? row.data.file : '';
  return FILE_NAME.test(name) ? new File(documentDir(row.documentId), name) : null;
}

export function signatureUri(row: Pick<Annotation, 'documentId' | 'data'>): string | undefined {
  const file = signatureFile(row);
  return file?.exists ? file.uri : undefined;
}

// A signature on library page `pageIdx`: copies `sourceUri` (the saved signature) into the
// document's folder and returns the row to add (`library/ADD_ANNOTATION`). null for a page the
// document doesn't have.
export function createSignatureRow(
  doc: Pick<LibraryDocument, 'id' | 'pages'>,
  pageIdx: number,
  sourceUri: string,
  placed: { box: OcrBounding; turn: PageRotation },
  now: number = Date.now()
): SignatureRow | null {
  const page = doc.pages[pageIdx];
  if (!page) return null;
  const id = createId('annot');
  const file = signatureFileName(id);
  const dir = documentDir(doc.id);
  if (!dir.exists) dir.create({ intermediates: true });
  const dest = new File(dir, file);
  if (dest.exists) dest.delete();
  new File(sourceUri).copySync(dest);
  return { id, documentId: doc.id, pageId: page.id, kind: 'signature', color: '', data: { box: placed.box, file, ...(placed.turn ? { turn: placed.turn } : {}) }, createdAt: now, updatedAt: now };
}

// Rows that move to another document with their pages (merge, split: the reducer's followPages)
// or are copied there (an exam pack) need their PNGs in that document's folder too. A missing
// source is skipped: the row then draws nothing, like any mark whose data can't be read.
export function copySignatureFiles(rows: readonly Annotation[], toDocumentId: string): void {
  for (const row of rows) {
    if (!isSignature(row) || row.documentId === toDocumentId) continue;
    const source = signatureFile(row);
    if (!source?.exists) continue;
    const dir = documentDir(toDocumentId);
    if (!dir.exists) dir.create({ intermediates: true });
    const dest = new File(dir, source.name);
    if (!dest.exists) source.copySync(dest);
  }
}

// Deletes the signature PNGs in a document's folder that no row uses any more (erased, and the
// undo that could bring them back is gone). Best-effort.
export function pruneSignatureFiles(documentId: string, annotations: readonly Annotation[]): void {
  try {
    const dir = documentDir(documentId);
    if (!dir.exists) return;
    const used = new Set(annotations.filter((a) => a.documentId === documentId && isSignature(a)).map((a) => (a.data as SignatureData).file));
    for (const entry of dir.list()) {
      if (entry instanceof File && FILE_NAME.test(entry.name) && !used.has(entry.name)) entry.delete();
    }
  } catch (error) {
    console.warn('pruneSignatureFiles: could not tidy', documentId, error);
  }
}

// A signature placed on a picture of a library page, outside the Reader (the Library signs page 1
// on SignaturePlacementOverlay): `placement` is in that picture's pixels, top-left origin. For a
// scan the picture is the page's master, which is the space its rows are kept in. For an imported
// page it is the page rendered as it is shown now (`shown`: the picture's size), so the box goes
// back through the page's turn into the pixels it was indexed in. null where a row has no space
// to be kept in: a page not indexed yet, or a scan's page inside a merged PDF (its place on the
// PDF page is only known with the file open); the caller then signs the old way.
export function signatureOnPicture(
  doc: Pick<LibraryDocument, 'pages' | 'sourceKind'>,
  pageIdx: number,
  placement: { originX: number; originY: number; width: number; height: number },
  shown?: { width: number; height: number }
): { box: OcrBounding; turn: PageRotation } | null {
  const page = doc.pages[pageIdx];
  if (!page) return null;
  const box = { left: placement.originX, top: placement.originY, width: placement.width, height: placement.height };
  if (!isPdfLevel(doc)) return { box, turn: 0 };
  if (page.fileUri || !canMarkPage(page) || !shown || shown.width <= 0 || shown.height <= 0) return null;
  const space = pixelSpace('indexed', page);
  const fractions = { left: box.left / shown.width, top: box.top / shown.height, width: box.width / shown.width, height: box.height / shown.height };
  return { box: mapRect(invert(spaceToShown(space)), fractions), turn: uprightTurn(space.turn) };
}
