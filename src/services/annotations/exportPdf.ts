import { Directory, File, Paths } from 'expo-file-system';
import { isPageRasterFormat, isPdfLevel } from '../documents/formatCapabilities';
import { writeFileReplacing } from '../files/atomicWrite';
import { fileStamp } from '../reader/pageCache';
import type { Annotation, LibraryDocument } from '../../types/models';
import { hashKey } from '../../utils/hash';

// §18 W14 (A9): the PDF that leaves the app. The Reader draws a document's marks and signatures
// live from their rows; `document.pdf` is not where they live (since W17 it never holds them). So
// whatever hands the PDF to someone else (share, print, export, a device folder, a submission,
// a backup's readable copy) asks here for a copy with the rows written in as real PDF annotations.
//
// The copy is `<cache>/export/<docId>-<fingerprint>.pdf`. The fingerprint names the state of the
// file and of the rows, so sharing the same document again is instant, and anything that changes
// either gives a new name. Writing is idempotent: marks an older build left in `document.pdf`
// are taken out first (removeOurAnnotations), so nothing is ever there twice.
//
// pdf-lib and the annotation writer are loaded when a copy is really built: this file is reached
// from the share and backup code, some of which is loaded at boot (AGENTS.md, §16 G3).

const EXPORT_DIR = 'export';

type ExportedDoc = Pick<LibraryDocument, 'id' | 'pages' | 'pdfUri' | 'coverKind' | 'pdfLayout' | 'pdfPageSize' | 'sourceKind' | 'format' | 'sizeBytes'>;

export function exportDir(): Directory {
  return new Directory(Paths.cache, EXPORT_DIR);
}

// The rows of `doc` that have a page in it: what a copy of it carries.
export function exportedRows(doc: Pick<LibraryDocument, 'id' | 'pages'>, annotations: readonly Annotation[]): Annotation[] {
  const pages = new Set(doc.pages.map((p) => p.id));
  return annotations.filter((a) => a.documentId === doc.id && pages.has(a.pageId));
}

// Changes when the file does (its size and modified time: pageCache.fileStamp) or when a row is
// added, removed or edited (the ids and each one's `updatedAt`).
export function exportFingerprint(doc: Pick<LibraryDocument, 'pdfUri'>, rows: readonly Annotation[]): string {
  const marks = rows
    .map((a) => `${a.id}:${a.updatedAt}`)
    .sort()
    .join(',');
  return hashKey(`${doc.pdfUri ? fileStamp(doc.pdfUri) : ''}|${marks}`);
}

function exportFile(doc: Pick<LibraryDocument, 'id' | 'pdfUri'>, rows: readonly Annotation[]): File {
  return new File(exportDir(), `${hashKey(doc.id)}-${exportFingerprint(doc, rows)}.pdf`);
}

// The same document's copies for older states: gone once a new one is being made.
function dropOlderCopies(docId: string, keep: File): void {
  const dir = exportDir();
  if (!dir.exists) return;
  const prefix = `${hashKey(docId)}-`;
  for (const entry of dir.list()) {
    if (!(entry instanceof File) || !entry.name.startsWith(prefix) || entry.name === keep.name) continue;
    try {
      entry.delete();
    } catch {
      // The cache is best-effort.
    }
  }
}

// Copies of other documents stay for their next share, newest first, up to this much.
export const EXPORT_CACHE_MAX_BYTES = 150 * 1024 * 1024;

function trimExportCopies(keep: File): void {
  try {
    const copies = exportDir()
      .list()
      .filter((entry): entry is File => entry instanceof File && entry.name !== keep.name)
      .map((file) => ({ file, at: file.lastModified ?? 0, bytes: file.size ?? 0 }))
      .sort((a, b) => b.at - a.at);
    let total = keep.size ?? 0;
    for (const copy of copies) {
      total += copy.bytes;
      if (total > EXPORT_CACHE_MAX_BYTES) copy.file.delete();
    }
  } catch {
    // The cache is best-effort.
  }
}

// §18 W17: a scan is read from its page images, so one saved before every document got a
// `document.pdf` (pdfService.ensureDocumentPdf) is given its PDF here, when one is first asked
// for. The store isn't told: until something rebuilds the document, the next export builds it
// again.
async function withPdf(doc: ExportedDoc): Promise<ExportedDoc> {
  if (doc.pdfUri || isPdfLevel(doc) || !isPageRasterFormat(doc.format) || doc.pages.length === 0) return doc;
  const { ensureDocumentPdfOnce } = require('../pdf/pdfService') as typeof import('../pdf/pdfService');
  return ensureDocumentPdfOnce(doc);
}

// The document's PDF with its rows written in: `document.pdf` itself when it has none (nothing
// to add), else the cached copy, built now if this state has none yet. undefined: the document
// has no PDF. A file the rows can't be written into (encrypted, damaged) is handed over as it is
// rather than not at all: the rows stay in the app either way.
export async function annotatedPdfFor(source: ExportedDoc, annotations: readonly Annotation[]): Promise<string | undefined> {
  const doc = await withPdf(source);
  const base = doc.pdfUri;
  if (!base) return undefined;
  const rows = exportedRows(doc, annotations);
  if (rows.length === 0) return base;
  const dest = exportFile(doc, rows);
  if (dest.exists && (dest.size ?? 0) > 0) return dest.uri;
  try {
    const { loadPdf } = require('../pdf/pdfOps') as typeof import('../pdf/pdfOps');
    const { removeOurAnnotations, writeMarks } = require('./pdfAnnotations') as typeof import('./pdfAnnotations');
    const pdfDoc = await loadPdf(base);
    removeOurAnnotations(pdfDoc);
    await writeMarks(pdfDoc, doc, rows);
    const bytes = await pdfDoc.save();
    dropOlderCopies(doc.id, dest);
    writeFileReplacing(dest, bytes);
    trimExportCopies(dest);
    return dest.uri;
  } catch (error) {
    console.warn('annotatedPdfFor: the marks could not be written; handing over the file without them', error);
    return base;
  }
}

// §18 W14: a PDF that came back from a backup's readable copy has our annotations written in.
//  - 'remove': its rows came back too (a full restore), so the file gives them up, like any
//    `document.pdf`;
//  - 'release': it came back alone (a "PDFs only" backup): they stay, as the file's own.
// In place; the file is only rewritten when it held any. Returns how many. Throws for a file
// pdf-lib can't open.
export async function settleOurAnnotations(uri: string, how: 'remove' | 'release'): Promise<number> {
  const file = new File(uri);
  if (!file.exists) return 0;
  const { loadPdf } = require('../pdf/pdfOps') as typeof import('../pdf/pdfOps');
  const { releaseOurAnnotations, removeOurAnnotations } = require('./pdfAnnotations') as typeof import('./pdfAnnotations');
  const pdfDoc = await loadPdf(uri);
  const count = how === 'remove' ? removeOurAnnotations(pdfDoc) : releaseOurAnnotations(pdfDoc);
  if (count > 0) writeFileReplacing(file, await pdfDoc.save());
  return count;
}
