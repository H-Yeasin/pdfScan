import { Directory, File, Paths } from 'expo-file-system';
import { moveReplacing } from '../files/atomicWrite';
import { applySignatureToPdf, buildPdfFromPages, encodingForQuality, pageSizeOfPdf, toSourcePage } from '../pdf/pdfService';
import { mergePdfs, splitPdf, stampImage } from '../pdf/pdfOps';
import { buildRasterPdf } from '../pdf/rasterPdf';
import { isPdfLevel } from '../documents/formatCapabilities';
import { signatureDraw, type SignaturePlacement } from '../signature/signaturePlacement';
import { copySignatureFiles } from '../signature/signatureRows';
import { downscaleAndCompressPage } from '../enhance/enhanceService';
import { exportPreset, THUMB_JPEG_Q, THUMB_MAX_DIM } from '../capture/imageSpec';
import { cleanTemporaryCache, getDocumentDir } from './libraryFiles';
import { readTextPrefix } from '../documents/txtService';
import { extractDocxText } from '../documents/docxService';
import type { Annotation, ExternalFileDocument, LibraryDocument, LibraryPage } from '../../types/models';
import { createId } from '../../utils/id';
import { EXTENSION_BY_FORMAT } from '../../utils/docFormat';
import { t } from '../../i18n';

function copyIfPresent(uri: string | undefined, dest: File): string | undefined {
  if (!uri) return undefined;
  const source = new File(uri);
  if (!source.exists) return undefined;
  if (dest.exists) dest.delete();
  source.copySync(dest);
  return dest.uri;
}

// Copies one page's master (+ display copy and thumbnail, when present) into another document's
// directory - byte-for-byte, so merging/splitting never costs image quality. Files are named by
// position (page_N.jpg) in a new document; `byId` names them by page id instead, for a document
// that already has files (an append, §7 R3), whose positions no longer match its file names.
// `keepId` (merge, split: the source document goes away) keeps the page's id, so its bookmarks
// and annotations follow it to the new document (library/REPLACE_FILES); a copy that leaves the
// source in place (an exam pack, an append, an extract) needs a new one.
export function copyPageInto(
  page: LibraryPage,
  dir: Directory,
  pageNumber: number,
  options: { keepId?: boolean; byId?: boolean } = {}
): LibraryPage {
  const id = options.keepId ? page.id : createId('page');
  const name = (kind: string) => new File(dir, options.byId ? `${kind}_${id}.jpg` : `${kind}_${pageNumber}.jpg`);
  return {
    ...page,
    id,
    fileUri: copyIfPresent(page.fileUri, name('page')) ?? '',
    displayUri: copyIfPresent(page.displayUri, name('display')),
    thumbUri: copyIfPresent(page.thumbUri, name('thumb')),
  };
}

// The files a page row owns (master, display copy, thumbnail), for deleting a removed page.
export function pageFiles(page: LibraryPage): string[] {
  return [page.fileUri, page.displayUri, page.thumbUri].filter((uri): uri is string => !!uri);
}

export function tempPdf(): File {
  const dir = new Directory(Paths.cache, 'pdf-ops');
  if (!dir.exists) dir.create({ intermediates: true });
  return new File(dir, `${createId('tmp')}.pdf`);
}

// A scan's pages as a PDF with one page per library page, for a PDF-level merge: its own
// document.pdf when that is already laid out so, otherwise a standard rebuild from the masters
// into the cache. §18 W17: neither holds the document's marks or signatures. Those are rows,
// which follow their pages by id into the merged document and are drawn there.
export async function standardPdfOf(doc: LibraryDocument): Promise<{ uri: string; temp: boolean }> {
  const ownIsStandard = (doc.pdfLayout ?? 'standard') === 'standard' && !doc.coverKind;
  if (doc.pdfUri && ownIsStandard && new File(doc.pdfUri).exists) return { uri: doc.pdfUri, temp: false };
  const pageSize = await pageSizeOfPdf(doc.pdfUri);
  const built = await buildPdfFromPages(
    doc.id,
    doc.pages.map(toSourcePage),
    'as-is',
    undefined,
    'standard',
    pageSize,
    { dest: tempPdf() }
  );
  return { uri: built.uri, temp: true };
}

export function stubPage(): LibraryPage {
  return { id: createId('page'), fileUri: '', width: 850, height: 1100 };
}

// Whether every page of an imported PDF has been read (R1). A document made from parts that
// weren't is left for the indexer, which fills in only the pages missing a thumbnail.
export function fullyIndexed(doc: LibraryDocument): boolean {
  return !isPdfLevel(doc) || doc.indexState === 'done';
}

// What a combine of documents (merge, §7 R3 append) produces for the target document.
type Combined = Pick<LibraryDocument, 'pages' | 'pdfUri' | 'sizeBytes' | 'sourceKind' | 'indexedAt' | 'indexState' | 'pdfLayout' | 'pdfPageSize'>;

// The pages of `parts`, in order, as document `documentId`'s pages and document.pdf. A part that
// is that document itself (an append) keeps its rows and files where they are; every other part's
// pages are copied in (keeping their ids when `keepIds`: the source goes away).
// §18 W17 (A9): no rebuild here writes marks into document.pdf; `annotations` only says which
// signature PNGs come along.
// All scans → rebuilt from the masters. Any imported PDF among them (§7 R2) → combined as PDFs
// (pdfOps.mergePdfs): imported pages are copied untouched, keeping their text and quality; a scan
// contributes its standard PDF (standardPdfOf); the result is a PDF-level document.
async function combineInto(
  documentId: string,
  parts: readonly { doc: LibraryDocument; keepIds: boolean }[],
  annotations: readonly Annotation[]
): Promise<Combined> {
  const dir = getDocumentDir(documentId);
  const rowFor = (doc: LibraryDocument, row: LibraryPage, keepIds: boolean, n: number) =>
    doc.id === documentId ? row : copyPageInto(row, dir, n, { keepId: keepIds, byId: true });
  // §18 W16: a part that goes away takes its rows along (keepIds), and a signature row's PNG is
  // a file of its document: it comes too.
  for (const { doc, keepIds } of parts) {
    if (keepIds && doc.id !== documentId) copySignatureFiles(annotations.filter((a) => a.documentId === doc.id), documentId);
  }

  if (parts.some((part) => isPdfLevel(part.doc))) {
    const sources: { uri: string; temp: boolean }[] = [];
    for (const { doc } of parts) {
      if (isPdfLevel(doc)) {
        if (!doc.pdfUri) throw new Error(`combineInto: ${doc.id} has no PDF`);
        sources.push({ uri: doc.pdfUri, temp: false });
      } else {
        sources.push(await standardPdfOf(doc));
      }
    }
    // mergePdfs reads every source before writing, so the target's own document.pdf can be both.
    let merged;
    try {
      merged = await mergePdfs(sources, new File(dir, 'document.pdf'));
    } finally {
      cleanTemporaryCache(sources.filter((s) => s.temp).map((s) => s.uri));
    }
    // Page rows line up with the pages each source actually gave (an imported PDF saved before
    // it was indexed may have fewer rows than pages).
    const pages: LibraryPage[] = [];
    parts.forEach(({ doc, keepIds }, d) => {
      for (let i = 0; i < merged.pagesPerSource[d]; i++) {
        const row = doc.pages[i];
        pages.push(row ? rowFor(doc, row, keepIds, pages.length + 1) : stubPage());
      }
    });
    const indexed = parts.every(({ doc }, d) => fullyIndexed(doc) && doc.pages.length >= merged.pagesPerSource[d]);
    return {
      pages,
      pdfUri: merged.uri,
      sizeBytes: merged.sizeBytes,
      sourceKind: 'imported_pdf',
      indexedAt: indexed ? Date.now() : undefined,
      indexState: indexed ? 'done' : undefined,
      pdfLayout: 'standard',
      pdfPageSize: undefined,
    };
  }

  const pages: LibraryPage[] = [];
  for (const { doc, keepIds } of parts) {
    for (const row of doc.pages) pages.push(rowFor(doc, row, keepIds, pages.length + 1));
  }
  // Rebuilds keep the paper size (A4 or Letter) the document was saved with; a combine takes the
  // first document's.
  const pageSize = await pageSizeOfPdf(parts[0]?.doc.pdfUri);
  const pdfResult = await buildPdfFromPages(documentId, pages.map(toSourcePage), 'as-is', undefined, 'standard', pageSize);
  return { pages, pdfUri: pdfResult.uri, sizeBytes: pdfResult.sizeBytes, pdfLayout: 'standard', pdfPageSize: pageSize };
}

// Merged output lands in the source docs' course only when they all share one; a merge combining
// docs from different courses has no single obviously-correct destination, so it goes to Unsorted.
// Pages keep their ids (see copyPageInto), so bookmarks and annotations follow them.
export async function mergeDocuments(docs: LibraryDocument[], annotations: readonly Annotation[] = []): Promise<LibraryDocument> {
  const documentId = createId('doc');
  const name = `Merged_${docs.length}_files`;
  const combined = await combineInto(
    documentId,
    docs.map((doc) => ({ doc, keepIds: true })),
    annotations
  );
  return {
    id: documentId,
    name,
    format: 'PDF',
    mode: 'doc',
    createdAt: Date.now(),
    star: false,
    tag: 'PDF',
    locked: false,
    courseId: docs.every((d) => d.courseId === docs[0].courseId) ? docs[0].courseId : undefined,
    ...combined,
  };
}

// §7 R3 "Add pages": `sources`' pages (copied; the sources stay) go at the end of `target`, which
// keeps its id, its pages' ids and everything that points at them. A later rebuild (compress,
// sign) may drop a former cover's special placement, so the cover is cleared like a rebuild does.
export async function appendDocuments(target: LibraryDocument, sources: readonly LibraryDocument[]): Promise<LibraryDocument> {
  // The target's rows stay with its pages; the sources' rows stay with the sources.
  const combined = await combineInto(target.id, [{ doc: target, keepIds: true }, ...sources.map((doc) => ({ doc, keepIds: false }))], []);
  return { ...target, ...combined, coverKind: undefined };
}

// One document per page. Split output stays in the source document's course; pages keep their
// ids. §7 R2: an imported PDF is split as a PDF (pdfOps.splitPdf), each page copied untouched.
export async function splitDocument(doc: LibraryDocument, annotations: readonly Annotation[] = []): Promise<LibraryDocument[]> {
  if (isPdfLevel(doc)) {
    if (!doc.pdfUri) throw new Error(`splitDocument: ${doc.id} has no PDF`);
    const ids: string[] = [];
    const files = await splitPdf(doc.pdfUri, (i) => {
      ids[i] = createId('doc');
      return new File(getDocumentDir(ids[i]), 'document.pdf');
    });
    return files.map((file, i): LibraryDocument => {
      const row = doc.pages[i];
      const page = row ? copyPageInto(row, getDocumentDir(ids[i]), 1, { keepId: true }) : stubPage();
      if (row) copySignatureFiles(annotations.filter((a) => a.documentId === doc.id && a.pageId === row.id), ids[i]);
      const name = `${doc.name}_p${i + 1}`;
      const indexed = !!page.thumbUri;
      return {
        id: ids[i],
        name,
        format: 'PDF',
        mode: doc.mode,
        pages: [page],
        pdfUri: file.uri,
        sizeBytes: file.sizeBytes,
        createdAt: Date.now(),
        star: false,
        tag: doc.tag,
        locked: false,
        courseId: doc.courseId,
        docType: doc.docType,
        sourceKind: 'imported_pdf',
        pdfLayout: 'standard',
        indexedAt: indexed ? Date.now() : undefined,
        indexState: indexed ? 'done' : undefined,
      };
    });
  }

  const results: LibraryDocument[] = [];
  const pageSize = await pageSizeOfPdf(doc.pdfUri);

  for (let i = 0; i < doc.pages.length; i++) {
    const source = doc.pages[i];
    const documentId = createId('doc');
    const dir = getDocumentDir(documentId);
    const page = copyPageInto(source, dir, 1, { keepId: true });
    // §18 W16: the page's signature rows follow it; their PNGs come along.
    copySignatureFiles(annotations.filter((a) => a.documentId === doc.id && a.pageId === source.id), documentId);
    const name = `${doc.name}_p${i + 1}`;

    // Always rebuilds a document.pdf, regardless of doc.format - the unified reader needs a real
    // PDF for every library document (see DeliverScreen.tsx's matching change).
    const pdfResult = await buildPdfFromPages(documentId, [toSourcePage(page)], 'as-is', undefined, 'standard', pageSize);
    const pdfUri: string = pdfResult.uri;
    const sizeBytes = doc.format === 'PDF' ? pdfResult.sizeBytes : new File(page.fileUri).size ?? 0;

    results.push({
      id: documentId,
      name,
      format: doc.format,
      mode: doc.mode,
      pages: [page],
      pdfUri,
      sizeBytes,
      createdAt: Date.now(),
      star: false,
      tag: doc.tag,
      locked: false,
      courseId: doc.courseId,
      docType: doc.docType,
      pdfLayout: 'standard',
      pdfPageSize: pageSize,
    });
  }

  return results;
}

// §7 R2: Compress for an imported PDF. Its pages have no masters, so the only way to make it
// smaller is to turn its pages into images at the requested quality (rasterPdf; the text stays
// searchable through the invisible text layer). Kept only if the result really is smaller - a
// text PDF often isn't - and the original is replaced, so the caller says what happened.
export async function compressImportedPdf(
  doc: LibraryDocument,
  quality = 2
): Promise<{ doc: LibraryDocument; smaller: boolean }> {
  if (!doc.pdfUri) throw new Error(`compressImportedPdf: ${doc.id} has no PDF`);
  const temp = tempPdf();
  // Read now: moving the file re-points `temp` at its new place.
  const tempUri = temp.uri;
  try {
    const built = await buildRasterPdf(doc.pdfUri, doc.pages, exportPreset(quality), { dest: temp });
    if (built.sizeBytes >= (new File(doc.pdfUri).size ?? doc.sizeBytes)) return { doc, smaller: false };
    const dest = new File(getDocumentDir(doc.id), 'document.pdf');
    moveReplacing(temp, dest);
    return { doc: { ...doc, pdfUri: dest.uri, sizeBytes: dest.size ?? built.sizeBytes }, smaller: true };
  } finally {
    cleanTemporaryCache([tempUri]);
  }
}

// Rebuilds only document.pdf, from the untouched library masters, at the requested export
// quality. Page images are never overwritten, so compressing is reversible: compress again at a
// higher quality and the detail is still there.
export async function compressDocument(doc: LibraryDocument, quality = 2): Promise<LibraryDocument> {
  const pageSize = await pageSizeOfPdf(doc.pdfUri);
  // Always rebuilds document.pdf, regardless of doc.format - see splitDocument's matching comment.
  // §18 W17: without the document's marks; they are rows, written into what leaves the app.
  const pdfResult = await buildPdfFromPages(doc.id, doc.pages.map(toSourcePage), encodingForQuality(quality), undefined, 'standard', pageSize);
  const sizeBytes = doc.format === 'PDF' ? pdfResult.sizeBytes : doc.sizeBytes;

  // Rebuilds by feeding doc.pages (including any former cover raster at index 0) straight through
  // buildPdfFromPages with academicConfig: undefined - a cover page is never re-emitted via
  // buildCoverPage here, so page 0 becomes a plain fit-to-margin-box content page same as every
  // other page. coverKind must be cleared to match, or applySignatureToDocument would wrongly
  // treat a rebuilt PDF's page 0 as an unfit, full-page template cover.
  return { ...doc, pdfUri: pdfResult.uri, sizeBytes, coverKind: undefined, pdfLayout: 'standard', pdfPageSize: pageSize };
}

// Replaces one page's image with a signed (flattened) version, in place, and rebuilds the
// PDF if the document is PDF-format so the signature survives into the exported file.
export async function applySignedPage(doc: LibraryDocument, pageIndex: number, flattenedUri: string): Promise<LibraryDocument> {
  const dir = getDocumentDir(doc.id);
  const old = doc.pages[pageIndex];
  // New file names (not page_N): since §7 R3 a page's position no longer matches its file names,
  // and page_N may belong to another page. The page's old files go.
  const stamp = createId('signed');
  const dest = new File(dir, `page_${stamp}.jpg`);
  new File(flattenedUri).moveSync(dest);

  // The old display copy and thumbnail show the unsigned page - regenerate the thumbnail and drop
  // the display copy (the viewer falls back to the signed master).
  const thumbSource = await downscaleAndCompressPage(dest.uri, THUMB_MAX_DIM, THUMB_JPEG_Q);
  const thumb = new File(dir, `thumb_${stamp}.jpg`);
  new File(thumbSource.uri).moveSync(thumb);
  if (old) cleanTemporaryCache(pageFiles(old).filter((uri) => uri !== dest.uri && uri !== thumb.uri));

  const pages = doc.pages.map((page, i) =>
    i === pageIndex ? { ...page, fileUri: dest.uri, thumbUri: thumb.uri, displayUri: undefined } : page
  );
  const pageSize = await pageSizeOfPdf(doc.pdfUri);

  // Always rebuilds document.pdf, regardless of doc.format - see splitDocument's matching comment.
  const pdfResult = await buildPdfFromPages(doc.id, pages.map(toSourcePage), 'as-is', undefined, 'standard', pageSize);
  const pdfUri: string = pdfResult.uri;
  const sizeBytes = doc.format === 'PDF' ? pdfResult.sizeBytes : doc.sizeBytes;

  // Same rebuild-demotes-the-cover reasoning as compressDocument above - clear coverKind so a
  // later applySignatureToDocument call doesn't misjudge page 0's placement.
  return { ...doc, pages, pdfUri, sizeBytes, coverKind: undefined, pdfLayout: 'standard', pdfPageSize: pageSize };
}

// Promotes an ephemerally-opened external file (§4 of the PDF-reader plan) into a real, permanent
// library document. Branches by format:
//  - PDF: addPdfFileToLibrary, with the page count from the import probe. Thumbnails and text
//    come afterwards from the background indexer (§7 R1, store/useImportedPdfIndexing →
//    documents/importedPdfIndex) - so saving stays instant even for a 300-page file.
//  - CSV/TXT: a single synthetic page whose ocr.text holds the whole file's decoded text, reusing
//    the existing OCR-text search plumbing (searchService, dbService's FTS indexing) for free.
//  - DOCX (§7 R5): the same single synthetic page, holding the document's text from mammoth.
//    Best-effort: if it can't be read, the file is still added and found by name.
//  - XLSX/XLS: no text extraction - pages stays empty and search is filename-only (title-LIKE
//    search still finds it).
export async function promoteExternalToLibrary(ext: ExternalFileDocument): Promise<LibraryDocument> {
  const name = ext.name.trim() || t('library.importedFile');

  if (ext.format === 'PDF') return addPdfFileToLibrary(ext.uri, name, ext.pageCount);

  const documentId = createId('doc');
  const dir = getDocumentDir(documentId);
  const dest = new File(dir, `document${EXTENSION_BY_FORMAT[ext.format]}`);
  new File(ext.uri).copySync(dest);

  const text = await (async () => {
    // §18 W4: the first 4 MB (TXT_MAX_BYTES), like the preview; more would only slow search down.
    if (ext.format === 'CSV' || ext.format === 'TXT') return (await readTextPrefix(dest.uri)).text;
    if (ext.format !== 'DOCX') return undefined;
    try {
      return await extractDocxText(dest.uri);
    } catch (error) {
      console.warn('promoteExternalToLibrary: DOCX text extraction failed', error);
      return undefined;
    }
  })();
  if (text !== undefined) {
    const pages: LibraryPage[] = [
      { id: createId('page'), fileUri: '', width: 850, height: 1100, ocr: { text, blocks: [] } },
    ];
    return {
      id: documentId,
      name,
      format: ext.format,
      mode: 'doc',
      pages,
      contentUri: dest.uri,
      sizeBytes: dest.size ?? 0,
      createdAt: Date.now(),
      star: false,
      tag: ext.format,
      locked: false,
    };
  }

  return {
    id: documentId,
    name,
    format: ext.format,
    mode: 'doc',
    pages: [],
    contentUri: dest.uri,
    sizeBytes: dest.size ?? 0,
    createdAt: Date.now(),
    star: false,
    tag: ext.format,
    locked: false,
  };
}

// A PDF file (from outside, or one the app just made: §12 D5's Office → PDF) as a new imported
// library document. The file is copied as-is into library/<docId>/document.pdf, with one
// placeholder page per PDF page (`pageCount`, when known; the indexer corrects it) so FileRow's
// "N pages" reads correctly. Thumbnails and text come afterwards from the background indexer
// (§7 R1), which picks up any imported PDF whose indexedAt is unset.
export function addPdfFileToLibrary(uri: string, name: string, pageCount?: number): LibraryDocument {
  const documentId = createId('doc');
  const dir = getDocumentDir(documentId);
  const dest = new File(dir, 'document.pdf');
  try {
    new File(uri).copySync(dest);
  } catch (e) {
    // Nothing half-written stays in library/.
    if (dir.exists) dir.delete();
    throw e;
  }

  const count = pageCount && pageCount > 0 ? pageCount : 1;
  const pages: LibraryPage[] = Array.from({ length: count }, () => ({
    id: createId('page'),
    fileUri: '',
    width: 850,
    height: 1100,
  }));

  return {
    id: documentId,
    name,
    format: 'PDF',
    mode: 'doc',
    sourceKind: 'imported_pdf',
    // Its pages are the PDF's pages, one each, no cover (documents/pageMap).
    pdfLayout: 'standard',
    pages,
    pdfUri: dest.uri,
    sizeBytes: dest.size ?? 0,
    createdAt: Date.now(),
    star: false,
    tag: 'PDF',
    locked: false,
  };
}

// Burns a captured signature onto one page of the document's compiled PDF, in place. Unlike
// applySignedPage, doc.pages is untouched — only the compiled document.pdf binary changes, so
// only pdfUri/sizeBytes are patched. The on-screen page preview (which renders doc.pages[i]
// directly) will not reflect the signature; only an exported/shared/printed copy will.
// `pageIndex` is a library page (doc.pages), not a PDF page: on a 2-in-1 sheet or after a cover
// the two differ (§18 W1), and `placement` is in that page's master pixels. The signature file is
// only read; a caller that passes a temporary one cleans it up (cleanTemporaryCache).
export async function applySignatureToDocument(
  doc: LibraryDocument,
  pageIndex: number,
  signatureUri: string,
  placement: SignaturePlacement,
  // §7 R2, PDF-level documents: the size of the page image the signature was placed on (the page
  // rendered on demand), since `placement` is in its pixels.
  shownSize?: { width: number; height: number }
): Promise<LibraryDocument> {
  if (doc.format !== 'PDF' || !doc.pdfUri) {
    throw new Error('applySignatureToDocument: only supported for compiled PDF documents');
  }
  const page = doc.pages[pageIndex];
  if (!page) throw new Error(`applySignatureToDocument: page ${pageIndex} not found`);

  if (isPdfLevel(doc)) {
    // The page fills its own PDF page, so the placement is a fraction of it; pdfOps maps that
    // through the page's own size and /Rotate.
    const size = shownSize ?? { width: page.width, height: page.height };
    const rect = {
      x: placement.originX / size.width,
      y: placement.originY / size.height,
      width: placement.width / size.width,
      height: placement.height / size.height,
    };
    // The signature file is the saved, reusable one (savedSignatureStorage); it stays.
    const result = await stampImage(doc.pdfUri, pageIndex, signatureUri, rect, new File(getDocumentDir(doc.id), 'document.pdf'));
    return { ...doc, pdfUri: result.uri, sizeBytes: result.sizeBytes };
  }

  // A scan: the page map says which PDF page holds this library page and where on it (a cover in
  // front, a template cover filling its page, a 2-in-1 column, a turned column, a true-size ID
  // page), the same way marks get there. That replaces the fit-to-margin-box maths this had of
  // its own, which only knew standard pages.
  const draw = signatureDraw(doc, pageIndex, placement);
  if (!draw) throw new Error(`applySignatureToDocument: page ${pageIndex} has no place in the PDF`);
  const pdfResult = await applySignatureToPdf(doc.id, doc.pdfUri, signatureUri, draw);
  return { ...doc, pdfUri: pdfResult.uri, sizeBytes: pdfResult.sizeBytes };
}
