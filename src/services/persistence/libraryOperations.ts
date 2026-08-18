import { File } from 'expo-file-system';
import { applySignatureToPdf, buildPdfFromPages } from '../pdf/pdfService';
import { compressPage } from '../enhance/enhanceService';
import { getDocumentDir, deleteDocumentFiles } from './libraryFiles';
import { deleteScannedDocument } from './dbService';
import type { ExternalPdfDocument, LibraryDocument, LibraryPage, OcrScript } from '../../types/models';
import { createId } from '../../utils/id';

function buildHaystack(name: string, pages: LibraryPage[]): string {
  return [name, ...pages.map((p) => p.ocr?.text ?? '')].join(' ').toLowerCase();
}

// Merged output lands unfiled/flat regardless of the source docs' courseFolder, mirroring the
// existing precedent for folderId (already dropped below) - a merge combining docs from different
// courses has no single obviously-correct destination, so it isn't silently assigned one.
export async function mergeDocuments(docs: LibraryDocument[], ocrScript: OcrScript): Promise<LibraryDocument> {
  const documentId = createId('doc');
  const dir = getDocumentDir(documentId);

  const mergedPages: LibraryPage[] = [];
  let pageIndex = 0;
  for (const doc of docs) {
    for (const page of doc.pages) {
      pageIndex += 1;
      const dest = new File(dir, `page_${pageIndex}.jpg`);
      new File(page.fileUri).copy(dest);
      mergedPages.push({ id: createId('page'), fileUri: dest.uri, width: page.width, height: page.height, ocr: page.ocr });
    }
  }

  const pdfResult = await buildPdfFromPages(
    documentId,
    mergedPages.map((p) => ({ uri: p.fileUri, width: p.width, height: p.height, ocr: p.ocr })),
    5,
    undefined,
    ocrScript
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
  };
}

// Split output lands unfiled/flat too, same rationale as mergeDocuments above.
export async function splitDocument(doc: LibraryDocument, ocrScript: OcrScript): Promise<LibraryDocument[]> {
  const results: LibraryDocument[] = [];

  for (let i = 0; i < doc.pages.length; i++) {
    const source = doc.pages[i];
    const documentId = createId('doc');
    const dir = getDocumentDir(documentId);
    const dest = new File(dir, 'page_1.jpg');
    new File(source.fileUri).copy(dest);

    const page: LibraryPage = { id: createId('page'), fileUri: dest.uri, width: source.width, height: source.height, ocr: source.ocr };
    const name = `${doc.name}_p${i + 1}`;

    // Always rebuilds a document.pdf, regardless of doc.format - the unified reader needs a real
    // PDF for every library document (see DeliverScreen.tsx's matching change).
    const pdfResult = await buildPdfFromPages(
      documentId,
      [{ uri: dest.uri, width: source.width, height: source.height, ocr: source.ocr }],
      5,
      undefined,
      ocrScript
    );
    const pdfUri: string = pdfResult.uri;
    const sizeBytes = doc.format === 'PDF' ? pdfResult.sizeBytes : dest.size ?? 0;

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
    });
  }

  return results;
}

// In-place operation on an already-saved doc - resolves the directory from doc.courseFolder
// (never a live/current UI value) so a course-routed document's recompressed pages land back in
// the SAME directory it already lives in, not a freshly-recomputed flat one.
export async function compressDocument(doc: LibraryDocument, ocrScript: OcrScript, quality = 2): Promise<LibraryDocument> {
  const dir = getDocumentDir(doc.id, doc.courseFolder);
  const compressQuality = 0.2 + (quality - 1) * 0.2;

  const pages: LibraryPage[] = [];
  let sizeBytes = 0;
  for (let i = 0; i < doc.pages.length; i++) {
    const compressed = await compressPage(doc.pages[i].fileUri, compressQuality);
    const dest = new File(dir, `page_${i + 1}.jpg`);
    if (dest.exists) dest.delete();
    new File(compressed.uri).move(dest);
    sizeBytes += dest.size ?? 0;
    pages.push({ ...doc.pages[i], fileUri: dest.uri });
  }

  // Always rebuilds document.pdf, regardless of doc.format - see splitDocument's matching comment.
  const pdfResult = await buildPdfFromPages(
    doc.id,
    pages.map((p) => ({ uri: p.fileUri, width: p.width, height: p.height, ocr: p.ocr })),
    quality,
    undefined,
    ocrScript,
    doc.courseFolder
  );
  const pdfUri: string = pdfResult.uri;
  if (doc.format === 'PDF') sizeBytes = pdfResult.sizeBytes;

  // Rebuilds by feeding doc.pages (including any former cover raster at index 0) straight through
  // buildPdfFromPages with academicConfig: undefined - a cover page is never re-emitted via
  // buildCoverPage here, so page 0 becomes a plain fit-to-margin-box content page same as every
  // other page. coverKind must be cleared to match, or applySignatureToDocument would wrongly
  // treat a rebuilt PDF's page 0 as an unfit, full-page template cover.
  return { ...doc, pages, pdfUri, sizeBytes, coverKind: undefined };
}

// Dead code: no screen imports this today (LibraryScreen/ReaderScreen call deleteDocumentFiles
// directly per already-in-scope doc objects). Left as-is rather than "fixed" for consistency,
// since nothing exercises this path.
export function deleteDocuments(ids: string[]): void {
  ids.forEach((id) => deleteDocumentFiles(id));
  ids.forEach((id) => deleteScannedDocument(id).catch((e) => console.warn('dbService delete failed', id, e)));
}

// Replaces one page's image with a signed (flattened) version, in place, and rebuilds the
// PDF if the document is PDF-format so the signature survives into the exported file.
export async function applySignedPage(
  doc: LibraryDocument,
  pageIndex: number,
  flattenedUri: string,
  ocrScript: OcrScript
): Promise<LibraryDocument> {
  const dir = getDocumentDir(doc.id, doc.courseFolder);
  const dest = new File(dir, `page_${pageIndex + 1}.jpg`);
  if (dest.exists) dest.delete();
  new File(flattenedUri).move(dest);

  const pages = doc.pages.map((page, i) => (i === pageIndex ? { ...page, fileUri: dest.uri } : page));

  // Always rebuilds document.pdf, regardless of doc.format - see splitDocument's matching comment.
  const pdfResult = await buildPdfFromPages(
    doc.id,
    pages.map((p) => ({ uri: p.fileUri, width: p.width, height: p.height, ocr: p.ocr })),
    5,
    undefined,
    ocrScript,
    doc.courseFolder
  );
  const pdfUri: string = pdfResult.uri;
  const sizeBytes = doc.format === 'PDF' ? pdfResult.sizeBytes : doc.sizeBytes;

  // Same rebuild-demotes-the-cover reasoning as compressDocument above - clear coverKind so a
  // later applySignatureToDocument call doesn't misjudge page 0's placement.
  return { ...doc, pages, pdfUri, sizeBytes, coverKind: undefined };
}

// Promotes an ephemerally-opened external PDF (§4 of the PDF-reader plan) into a real, permanent
// library document. Deliberately does NOT rasterize every page into LibraryPage[] the way a scan
// does - there's no general PDF-rasterization path in this app (pdf-lib can't do it, and doing it
// page-by-page via the reader engine would be slow for a large import) - so `pages` is a synthetic
// stub array sized to match the probed page count purely so FileRow's "N pages" meta text reads
// correctly; every entry's fileUri is '' (renders as a blank cover thumbnail, not a broken image).
export async function promoteExternalToLibrary(ext: ExternalPdfDocument): Promise<LibraryDocument> {
  const documentId = createId('doc');
  const dir = getDocumentDir(documentId);
  const dest = new File(dir, 'document.pdf');
  new File(ext.uri).copy(dest);

  const pageCount = ext.pageCount && ext.pageCount > 0 ? ext.pageCount : 1;
  const pages: LibraryPage[] = Array.from({ length: pageCount }, () => ({
    id: createId('page'),
    fileUri: '',
    width: 850,
    height: 1100,
  }));

  const name = ext.name.trim() || 'Imported PDF';
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
    // No text-extraction pipeline exists for arbitrary imports - filename-only searchability at
    // the library level is an accepted MVP gap (dbService's title-LIKE search still finds it).
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
  const pdfResult = await applySignatureToPdf(
    doc.id,
    doc.pdfUri,
    pageIndex,
    page.width,
    page.height,
    !isTemplateCover,
    signatureUri,
    placement,
    doc.courseFolder
  );
  return { ...doc, pdfUri: pdfResult.uri, sizeBytes: pdfResult.sizeBytes };
}
