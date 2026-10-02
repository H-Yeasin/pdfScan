import { Directory, File } from 'expo-file-system';
import { applySignatureToPdf, buildPdfFromPages, encodingForQuality, pageSizeOfPdf } from '../pdf/pdfService';
import { writeAnnotations } from '../annotations/pdfAnnotations';
import { downscaleAndCompressPage } from '../enhance/enhanceService';
import { THUMB_JPEG_Q, THUMB_MAX_DIM } from '../capture/imageSpec';
import { getDocumentDir } from './libraryFiles';
import { buildSearchHaystack } from '../search/searchService';
import { readTextWithEncodingFallback } from '../documents/txtService';
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
export function copyPageInto(page: LibraryPage, dir: Directory, pageNumber: number): LibraryPage {
  return {
    ...page,
    id: createId('page'),
    fileUri: copyIfPresent(page.fileUri, new File(dir, `page_${pageNumber}.jpg`)) ?? '',
    displayUri: copyIfPresent(page.displayUri, new File(dir, `display_${pageNumber}.jpg`)),
    thumbUri: copyIfPresent(page.thumbUri, new File(dir, `thumb_${pageNumber}.jpg`)),
  };
}

// Merged output lands in the source docs' course only when they all share one; a merge combining
// docs from different courses has no single obviously-correct destination, so it goes to Unsorted.
export async function mergeDocuments(docs: LibraryDocument[]): Promise<LibraryDocument> {
  const documentId = createId('doc');
  const dir = getDocumentDir(documentId);

  const mergedPages: LibraryPage[] = [];
  for (const doc of docs) {
    for (const page of doc.pages) mergedPages.push(copyPageInto(page, dir, mergedPages.length + 1));
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
    pageSize
  );

  const name = `Merged_${docs.length}_files`;
  return {
    id: documentId,
    name,
    format: 'PDF',
    mode: 'doc',
    pages: mergedPages,
    pdfUri: pdfResult.uri,
    sizeBytes: pdfResult.sizeBytes,
    createdAt: Date.now(),
    star: false,
    tag: 'PDF',
    locked: false,
    searchHaystack: buildHaystack(name, mergedPages),
    courseId: docs.every((d) => d.courseId === docs[0].courseId) ? docs[0].courseId : undefined,
    pdfLayout: 'standard',
    pdfPageSize: pageSize,
  };
}

// Split output stays in the source document's course.
export async function splitDocument(doc: LibraryDocument): Promise<LibraryDocument[]> {
  const results: LibraryDocument[] = [];
  const pageSize = await pageSizeOfPdf(doc.pdfUri);

  for (let i = 0; i < doc.pages.length; i++) {
    const source = doc.pages[i];
    const documentId = createId('doc');
    const dir = getDocumentDir(documentId);
    const page = copyPageInto(source, dir, 1);
    const name = `${doc.name}_p${i + 1}`;

    // Always rebuilds a document.pdf, regardless of doc.format - the unified reader needs a real
    // PDF for every library document (see DeliverScreen.tsx's matching change).
    const pdfResult = await buildPdfFromPages(
      documentId,
      [{ uri: page.fileUri, width: page.width, height: page.height, ocr: page.ocr, layout: page.layout }],
      'as-is',
      undefined,
      'standard',
      pageSize
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
      pdfLayout: 'standard',
      pdfPageSize: pageSize,
    });
  }

  return results;
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
//  - PDF: deliberately does NOT rasterize every page into LibraryPage[] the way a scan does -
//    there's no general PDF-rasterization path in this app (pdf-lib can't do it, and doing it
//    page-by-page via the reader engine would be slow for a large import) - so `pages` is a
//    synthetic stub array sized to match the probed page count purely so FileRow's "N pages" meta
//    text reads correctly; every entry's fileUri is '' (renders a fallback icon, not a broken image).
//  - CSV/TXT: a single synthetic page whose ocr.text holds the whole file's decoded text, reusing
//    the existing OCR-text search plumbing (buildHaystack, dbService's FTS indexing) for free.
//  - DOCX/DOC/XLSX/XLS: no text-extraction pipeline exists for these - pages stays empty and search
//    is filename-only, the same accepted MVP gap as the PDF path above (title-LIKE search still
//    finds it).
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

  if (ext.format === 'CSV' || ext.format === 'TXT') {
    const { text } = await readTextWithEncodingFallback(dest.uri);
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
  placement: { originX: number; originY: number; width: number; height: number }
): Promise<LibraryDocument> {
  if (doc.format !== 'PDF' || !doc.pdfUri) {
    throw new Error('applySignatureToDocument: only supported for compiled PDF documents');
  }
  const page = doc.pages[pageIndex];
  if (!page) throw new Error(`applySignatureToDocument: page ${pageIndex} not found`);

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
