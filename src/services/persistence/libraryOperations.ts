import { Directory, File, Paths } from 'expo-file-system';
import { applySignatureToPdf, buildPdfFromPages, encodingForQuality, pageSizeOfPdf } from '../pdf/pdfService';
import { mergePdfs, splitPdf, stampImage } from '../pdf/pdfOps';
import { buildRasterPdf } from '../pdf/rasterPdf';
import { isPdfLevel } from '../documents/formatCapabilities';
import { writeAnnotations } from '../annotations/pdfAnnotations';
import { downscaleAndCompressPage } from '../enhance/enhanceService';
import { exportPreset, THUMB_JPEG_Q, THUMB_MAX_DIM } from '../capture/imageSpec';
import { cleanTemporaryCache, getDocumentDir } from './libraryFiles';
import { buildSearchHaystack } from '../search/searchService';
import { readTextWithEncodingFallback } from '../documents/txtService';
import { extractDocxText } from '../documents/docxService';
import type { Annotation, ExternalFileDocument, LibraryDocument, LibraryPage } from '../../types/models';
import { createId } from '../../utils/id';
import { EXTENSION_BY_FORMAT } from '../../utils/docFormat';
import { t } from '../../i18n';

const buildHaystack = buildSearchHaystack;

function copyIfPresent(uri: string | undefined, dest: File): string | undefined {
  if (!uri) return undefined;
  const source = new File(uri);
  if (!source.exists) return undefined;
  if (dest.exists) dest.delete();
  source.copySync(dest);
  return dest.uri;
}

// Copies one page's master (+ display copy and thumbnail, when present) into another document's
// directory as page N - byte-for-byte, so merging/splitting never costs image quality.
// `keepId` (merge, split: the source document goes away) keeps the page's id, so its bookmarks
// and annotations follow it to the new document (library/REPLACE_FILES); a copy that leaves the
// source in place (an exam pack) needs a new one.
export function copyPageInto(page: LibraryPage, dir: Directory, pageNumber: number, options: { keepId?: boolean } = {}): LibraryPage {
  return {
    ...page,
    id: options.keepId ? page.id : createId('page'),
    fileUri: copyIfPresent(page.fileUri, new File(dir, `page_${pageNumber}.jpg`)) ?? '',
    displayUri: copyIfPresent(page.displayUri, new File(dir, `display_${pageNumber}.jpg`)),
    thumbUri: copyIfPresent(page.thumbUri, new File(dir, `thumb_${pageNumber}.jpg`)),
  };
}

// Annotations a rebuild writes into a standard, coverless document.pdf (§5 T4).
function annotationsHook(pages: LibraryPage[], pageSize: Awaited<ReturnType<typeof pageSizeOfPdf>>, annotations: readonly Annotation[]) {
  return annotations.length
    ? (pdf: Parameters<typeof writeAnnotations>[0]) =>
        writeAnnotations(pdf, { pages, coverKind: undefined, pdfLayout: 'standard', pdfPageSize: pageSize }, annotations)
    : undefined;
}

function tempPdf(): File {
  const dir = new Directory(Paths.cache, 'pdf-ops');
  if (!dir.exists) dir.create({ intermediates: true });
  return new File(dir, `${createId('tmp')}.pdf`);
}

// A scan's pages as a PDF with one page per library page, for a PDF-level merge: its own
// document.pdf when that is already laid out so (it then also carries a signature burned in by
// Sign, and its annotations), otherwise a standard rebuild from the masters into the cache.
async function standardPdfOf(doc: LibraryDocument, annotations: readonly Annotation[]): Promise<{ uri: string; temp: boolean }> {
  const ownIsStandard = (doc.pdfLayout ?? 'standard') === 'standard' && !doc.coverKind;
  if (doc.pdfUri && ownIsStandard && new File(doc.pdfUri).exists) return { uri: doc.pdfUri, temp: false };
  const pageSize = await pageSizeOfPdf(doc.pdfUri);
  const built = await buildPdfFromPages(
    doc.id,
    doc.pages.map((p) => ({ uri: p.fileUri, width: p.width, height: p.height, ocr: p.ocr, layout: p.layout })),
    'as-is',
    undefined,
    'standard',
    pageSize,
    { dest: tempPdf(), beforeSave: annotationsHook(doc.pages, pageSize, annotations) }
  );
  return { uri: built.uri, temp: true };
}

function stubPage(): LibraryPage {
  return { id: createId('page'), fileUri: '', width: 850, height: 1100 };
}

// Whether every page of an imported PDF has been read (R1). A document made from parts that
// weren't is left for the indexer, which fills in only the pages missing a thumbnail.
function fullyIndexed(doc: LibraryDocument): boolean {
  return !isPdfLevel(doc) || doc.indexState === 'done';
}

// Merged output lands in the source docs' course only when they all share one; a merge combining
// docs from different courses has no single obviously-correct destination, so it goes to Unsorted.
// Pages keep their ids (see copyPageInto), so bookmarks and annotations follow them.
// §7 R2: all scans → rebuilt from the masters, as before. Any imported PDF among them → merged
// as PDFs (pdfOps.mergePdfs): the imported pages are copied untouched, keeping their text and
// quality, and the result is a PDF-level document itself.
export async function mergeDocuments(docs: LibraryDocument[], annotations: readonly Annotation[] = []): Promise<LibraryDocument> {
  const documentId = createId('doc');
  const dir = getDocumentDir(documentId);
  const name = `Merged_${docs.length}_files`;
  const courseId = docs.every((d) => d.courseId === docs[0].courseId) ? docs[0].courseId : undefined;
  const base = {
    id: documentId,
    name,
    format: 'PDF' as const,
    mode: 'doc' as const,
    createdAt: Date.now(),
    star: false,
    tag: 'PDF',
    locked: false,
    courseId,
    pdfLayout: 'standard' as const,
  };

  if (docs.some(isPdfLevel)) {
    const sources: { uri: string; temp: boolean }[] = [];
    for (const doc of docs) {
      if (isPdfLevel(doc)) {
        if (!doc.pdfUri) throw new Error(`mergeDocuments: ${doc.id} has no PDF`);
        sources.push({ uri: doc.pdfUri, temp: false });
      } else {
        sources.push(await standardPdfOf(doc, annotations.filter((a) => a.documentId === doc.id)));
      }
    }
    let merged;
    try {
      merged = await mergePdfs(sources, new File(dir, 'document.pdf'));
    } finally {
      cleanTemporaryCache(sources.filter((s) => s.temp).map((s) => s.uri));
    }
    // Page rows line up with the pages each source actually gave (an imported PDF saved before
    // it was indexed may have fewer rows than pages).
    const pages: LibraryPage[] = [];
    docs.forEach((doc, d) => {
      for (let i = 0; i < merged.pagesPerSource[d]; i++) {
        const row = doc.pages[i];
        pages.push(row ? copyPageInto(row, dir, pages.length + 1, { keepId: true }) : stubPage());
      }
    });
    const indexed = docs.every(fullyIndexed) && docs.every((doc, d) => doc.pages.length >= merged.pagesPerSource[d]);
    return {
      ...base,
      pages,
      pdfUri: merged.uri,
      sizeBytes: merged.sizeBytes,
      searchHaystack: buildHaystack(name, pages),
      sourceKind: 'imported_pdf',
      indexedAt: indexed ? Date.now() : undefined,
      indexState: indexed ? 'done' : undefined,
    };
  }

  const mergedPages: LibraryPage[] = [];
  for (const doc of docs) {
    for (const page of doc.pages) mergedPages.push(copyPageInto(page, dir, mergedPages.length + 1, { keepId: true }));
  }

  // Rebuilds keep the paper size (A4 or Letter) the document was saved with; a merge takes the
  // first document's.
  const pageSize = await pageSizeOfPdf(docs[0]?.pdfUri);
  const pdfResult = await buildPdfFromPages(
    documentId,
    mergedPages.map((p) => ({ uri: p.fileUri, width: p.width, height: p.height, ocr: p.ocr, layout: p.layout })),
    'as-is',
    undefined,
    'standard',
    pageSize,
    { beforeSave: annotationsHook(mergedPages, pageSize, annotations) }
  );

  return {
    ...base,
    pages: mergedPages,
    pdfUri: pdfResult.uri,
    sizeBytes: pdfResult.sizeBytes,
    searchHaystack: buildHaystack(name, mergedPages),
    pdfPageSize: pageSize,
  };
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
        searchHaystack: buildHaystack(name, [page]),
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
    const name = `${doc.name}_p${i + 1}`;

    // Always rebuilds a document.pdf, regardless of doc.format - the unified reader needs a real
    // PDF for every library document (see DeliverScreen.tsx's matching change).
    const pdfResult = await buildPdfFromPages(
      documentId,
      [{ uri: page.fileUri, width: page.width, height: page.height, ocr: page.ocr, layout: page.layout }],
      'as-is',
      undefined,
      'standard',
      pageSize,
      { beforeSave: annotationsHook([page], pageSize, annotations) }
    );
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
      searchHaystack: buildHaystack(name, [page]),
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
    if (dest.exists) dest.delete();
    temp.moveSync(dest);
    return { doc: { ...doc, pdfUri: dest.uri, sizeBytes: dest.size ?? built.sizeBytes }, smaller: true };
  } finally {
    cleanTemporaryCache([tempUri]);
  }
}

// Rebuilds only document.pdf, from the untouched library masters, at the requested export
// quality. Page images are never overwritten, so compressing is reversible: compress again at a
// higher quality and the detail is still there.
export async function compressDocument(doc: LibraryDocument, quality = 2, annotations: readonly Annotation[] = []): Promise<LibraryDocument> {
  const pageSize = await pageSizeOfPdf(doc.pdfUri);
  // §5 T4: the rebuilt PDF gets the document's annotations again (laid out as rebuilt: standard,
  // no separate cover).
  const mapped = { pages: doc.pages, coverKind: undefined, pdfLayout: 'standard' as const, pdfPageSize: pageSize };
  // Always rebuilds document.pdf, regardless of doc.format - see splitDocument's matching comment.
  const pdfResult = await buildPdfFromPages(
    doc.id,
    doc.pages.map((p) => ({ uri: p.fileUri, width: p.width, height: p.height, ocr: p.ocr, layout: p.layout })),
    encodingForQuality(quality),
    undefined,
    'standard',
    pageSize,
    { beforeSave: (pdf) => writeAnnotations(pdf, mapped, annotations) }
  );
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
export async function applySignedPage(
  doc: LibraryDocument,
  pageIndex: number,
  flattenedUri: string,
  annotations: readonly Annotation[] = []
): Promise<LibraryDocument> {
  const dir = getDocumentDir(doc.id);
  const dest = new File(dir, `page_${pageIndex + 1}.jpg`);
  if (dest.exists) dest.delete();
  new File(flattenedUri).moveSync(dest);

  // The old display copy and thumbnail show the unsigned page - regenerate the thumbnail and drop
  // the display copy (the viewer falls back to the signed master).
  const thumbSource = await downscaleAndCompressPage(dest.uri, THUMB_MAX_DIM, THUMB_JPEG_Q);
  const thumb = new File(dir, `thumb_${pageIndex + 1}.jpg`);
  if (thumb.exists) thumb.delete();
  new File(thumbSource.uri).moveSync(thumb);
  const staleDisplay = new File(dir, `display_${pageIndex + 1}.jpg`);
  if (staleDisplay.exists) staleDisplay.delete();

  const pages = doc.pages.map((page, i) =>
    i === pageIndex ? { ...page, fileUri: dest.uri, thumbUri: thumb.uri, displayUri: undefined } : page
  );
  const pageSize = await pageSizeOfPdf(doc.pdfUri);

  // Always rebuilds document.pdf, regardless of doc.format - see splitDocument's matching comment.
  const pdfResult = await buildPdfFromPages(
    doc.id,
    pages.map((p) => ({ uri: p.fileUri, width: p.width, height: p.height, ocr: p.ocr, layout: p.layout })),
    'as-is',
    undefined,
    'standard',
    pageSize,
    {
      beforeSave: (pdf) =>
        writeAnnotations(pdf, { pages, coverKind: undefined, pdfLayout: 'standard', pdfPageSize: pageSize }, annotations),
    }
  );
  const pdfUri: string = pdfResult.uri;
  const sizeBytes = doc.format === 'PDF' ? pdfResult.sizeBytes : doc.sizeBytes;

  // Same rebuild-demotes-the-cover reasoning as compressDocument above - clear coverKind so a
  // later applySignatureToDocument call doesn't misjudge page 0's placement.
  return { ...doc, pages, pdfUri, sizeBytes, coverKind: undefined, pdfLayout: 'standard', pdfPageSize: pageSize };
}

// Promotes an ephemerally-opened external file (§4 of the PDF-reader plan) into a real, permanent
// library document. Branches by format:
//  - PDF: copied as-is, with one placeholder page per PDF page (sized from the import probe) so
//    FileRow's "N pages" reads correctly. Thumbnails and text come afterwards from the background
//    indexer (§7 R1, store/useImportedPdfIndexing → documents/importedPdfIndex), which picks up
//    any imported PDF whose indexedAt is unset - so saving stays instant even for a 300-page file.
//  - CSV/TXT: a single synthetic page whose ocr.text holds the whole file's decoded text, reusing
//    the existing OCR-text search plumbing (buildHaystack, dbService's FTS indexing) for free.
//  - DOCX (§7 R5): the same single synthetic page, holding the document's text from mammoth.
//    Best-effort: if it can't be read, the file is still added and found by name.
//  - XLSX/XLS: no text extraction - pages stays empty and search is filename-only (title-LIKE
//    search still finds it).
export async function promoteExternalToLibrary(ext: ExternalFileDocument): Promise<LibraryDocument> {
  const documentId = createId('doc');
  const dir = getDocumentDir(documentId);
  const name = ext.name.trim() || t('library.importedFile');

  if (ext.format === 'PDF') {
    const dest = new File(dir, 'document.pdf');
    new File(ext.uri).copySync(dest);

    const pageCount = ext.pageCount && ext.pageCount > 0 ? ext.pageCount : 1;
    const pages: LibraryPage[] = Array.from({ length: pageCount }, () => ({
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
      searchHaystack: name.toLowerCase(),
    };
  }

  const dest = new File(dir, `document${EXTENSION_BY_FORMAT[ext.format]}`);
  new File(ext.uri).copySync(dest);

  const text = await (async () => {
    if (ext.format === 'CSV' || ext.format === 'TXT') return (await readTextWithEncodingFallback(dest.uri)).text;
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
      searchHaystack: buildHaystack(name, pages),
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
    searchHaystack: name.toLowerCase(),
  };
}

// Burns a captured signature onto one page of the document's compiled PDF, in place. Unlike
// applySignedPage, doc.pages is untouched — only the compiled document.pdf binary changes, so
// only pdfUri/sizeBytes are patched. The on-screen page preview (which renders doc.pages[i]
// directly) will not reflect the signature; only an exported/shared/printed copy will.
export async function applySignatureToDocument(
  doc: LibraryDocument,
  pageIndex: number,
  signatureUri: string,
  placement: { originX: number; originY: number; width: number; height: number },
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

  // Only a template cover (text-only, no placed image) skips the fit-to-margin-box placement math
  // - every other page, including page 0 when there's no cover or an imported-image cover, was
  // built with its image fit inside CONTENT_MARGIN_PT. See coverKind's doc comment in models.ts.
  const isTemplateCover = pageIndex === 0 && doc.coverKind === 'template';
  // A full-page (true-size ID card) image fills the sheet just like a template cover does.
  const fillsPage = isTemplateCover || page.layout === 'fullPage';
  const pdfResult = await applySignatureToPdf(
    doc.id,
    doc.pdfUri,
    pageIndex,
    page.width,
    page.height,
    !fillsPage,
    signatureUri,
    placement
  );
  return { ...doc, pdfUri: pdfResult.uri, sizeBytes: pdfResult.sizeBytes };
}
