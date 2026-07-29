import { File } from 'expo-file-system';
import { applySignatureToPdf, buildPdfFromPages } from '../pdf/pdfService';
import { compressPage } from '../enhance/enhanceService';
import { getDocumentDir, deleteDocumentFiles } from './libraryFiles';
import { deleteScannedDocument } from './dbService';
import type { LibraryDocument, LibraryPage } from '../../types/models';
import { createId } from '../../utils/id';

function buildHaystack(name: string, pages: LibraryPage[]): string {
  return [name, ...pages.map((p) => p.ocr?.text ?? '')].join(' ').toLowerCase();
}

export async function mergeDocuments(docs: LibraryDocument[]): Promise<LibraryDocument> {
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
    5
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

export async function splitDocument(doc: LibraryDocument): Promise<LibraryDocument[]> {
  const results: LibraryDocument[] = [];

  for (let i = 0; i < doc.pages.length; i++) {
    const source = doc.pages[i];
    const documentId = createId('doc');
    const dir = getDocumentDir(documentId);
    const dest = new File(dir, 'page_1.jpg');
    new File(source.fileUri).copy(dest);

    const page: LibraryPage = { id: createId('page'), fileUri: dest.uri, width: source.width, height: source.height, ocr: source.ocr };
    const name = `${doc.name}_p${i + 1}`;

    let pdfUri: string | undefined;
    let sizeBytes = dest.size ?? 0;
    if (doc.format === 'PDF') {
      const pdfResult = await buildPdfFromPages(
        documentId,
        [{ uri: dest.uri, width: source.width, height: source.height, ocr: source.ocr }],
        5
      );
      pdfUri = pdfResult.uri;
      sizeBytes = pdfResult.sizeBytes;
    }

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

export async function compressDocument(doc: LibraryDocument, quality = 2): Promise<LibraryDocument> {
  const dir = getDocumentDir(doc.id);
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

  let pdfUri = doc.pdfUri;
  if (doc.format === 'PDF') {
    const pdfResult = await buildPdfFromPages(
      doc.id,
      pages.map((p) => ({ uri: p.fileUri, width: p.width, height: p.height, ocr: p.ocr })),
      quality
    );
    pdfUri = pdfResult.uri;
    sizeBytes = pdfResult.sizeBytes;
  }

  return { ...doc, pages, pdfUri, sizeBytes };
}

export function deleteDocuments(ids: string[]): void {
  ids.forEach(deleteDocumentFiles);
  ids.forEach((id) => deleteScannedDocument(id).catch((e) => console.warn('dbService delete failed', id, e)));
}

// Replaces one page's image with a signed (flattened) version, in place, and rebuilds the
// PDF if the document is PDF-format so the signature survives into the exported file.
export async function applySignedPage(
  doc: LibraryDocument,
  pageIndex: number,
  flattenedUri: string
): Promise<LibraryDocument> {
  const dir = getDocumentDir(doc.id);
  const dest = new File(dir, `page_${pageIndex + 1}.jpg`);
  if (dest.exists) dest.delete();
  new File(flattenedUri).move(dest);

  const pages = doc.pages.map((page, i) => (i === pageIndex ? { ...page, fileUri: dest.uri } : page));

  let pdfUri = doc.pdfUri;
  let sizeBytes = doc.sizeBytes;
  if (doc.format === 'PDF') {
    const pdfResult = await buildPdfFromPages(
      doc.id,
      pages.map((p) => ({ uri: p.fileUri, width: p.width, height: p.height, ocr: p.ocr })),
      5
    );
    pdfUri = pdfResult.uri;
    sizeBytes = pdfResult.sizeBytes;
  }

  return { ...doc, pages, pdfUri, sizeBytes };
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

  const pdfResult = await applySignatureToPdf(doc.id, doc.pdfUri, pageIndex, page.width, signatureUri, placement);
  return { ...doc, pdfUri: pdfResult.uri, sizeBytes: pdfResult.sizeBytes };
}
