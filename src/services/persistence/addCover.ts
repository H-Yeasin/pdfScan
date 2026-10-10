import { Directory, File } from 'expo-file-system';
import { moveReplacing } from '../files/atomicWrite';
import { buildPdfFromPages, decoratePdf, inspectPdf, pageDimensions, toSourcePage, type AcademicConfig, type PageSizeId } from '../pdf/pdfService';
import { renderCoverPageImage } from '../pdf/academicRasterService';
import { extractPages, loadPdf, savePdf } from '../pdf/pdfOps';
import { renderPage } from '../pdf/pdfNative';
import { isPdfLevel } from '../documents/formatCapabilities';
import { pdfPageCount } from '../documents/pageMap';
import { writeAnnotations } from '../annotations/pdfAnnotations';
import { downscaleAndCompressPage } from '../enhance/enhanceService';
import { MASTER_MAX_DIM, THUMB_JPEG_Q, THUMB_MAX_DIM } from '../capture/imageSpec';
import { cleanTemporaryCache, getDocumentDir } from './libraryFiles';
import { copyPageInto, pageFiles } from './libraryOperations';
import type { Annotation, Bookmark, LibraryDocument, LibraryPage } from '../../types/models';
import { createId } from '../../utils/id';
import { tDoc } from '../../i18n';

// §14 Q6: a cover page (plus the preset's border, header and footer) on a PDF already in the
// Library - a scan, an imported or merged PDF, or one converted from Word/Excel (§12 D5) - saved
// as a copy or replacing the document.
//
// The cover is a page row, as Deliver saves it: doc.pages[0] with `coverKind` set, which
// documents/pageMap counts as PDF page 1. Annotations and bookmarks point at page ids, not
// positions, so the content pages' notes stay on their pages without any shifting; only
// `lastPage` (a PDF page number) moves by one when a cover is added where there was none.

export type AddCoverInput = {
  doc: LibraryDocument;
  // coverPage is required; border/header/footer are optional and apply to the content pages.
  config: AcademicConfig;
  pageSize: PageSizeId;
  mode: 'copy' | 'replace';
  // The document's own, for a replace: written into a rebuilt scan's PDF again, and those on a
  // cover that's being replaced are dropped.
  annotations: readonly Annotation[];
  bookmarks: readonly Bookmark[];
};

export type AddCoverResult = {
  doc: LibraryDocument;
  // Replace only, and only when something changed: the document's annotations and bookmarks
  // without the ones that sat on its old cover.
  annotations?: Annotation[];
  bookmarks?: Bookmark[];
};

// The cover photo couldn't be read or embedded (buildCoverPage skips it with a warning): the UI
// says "The cover photo couldn't be used" instead of saving a document with no cover.
export class CoverPhotoError extends Error {
  constructor() {
    super('The cover image could not be used');
    this.name = 'CoverPhotoError';
  }
}

const TEMP_PDF = 'document.cover.tmp.pdf';

export async function addCoverToDocument(input: AddCoverInput): Promise<AddCoverResult> {
  const { doc, config, mode } = input;
  const cover = config.coverPage;
  if (!cover) throw new Error('addCoverToDocument: no cover page in the config');
  if (doc.format !== 'PDF' || !doc.pdfUri) throw new Error(`addCoverToDocument: ${doc.id} is not a PDF`);

  const id = mode === 'copy' ? createId('doc') : doc.id;
  const dir = getDocumentDir(id);
  // Everything written before the end, removed again if anything fails; the original's files are
  // only touched once the new PDF is complete.
  const written: string[] = [];
  try {
    const built = isPdfLevel(doc) ? await buildPdfLevel(input, id, dir, written) : await buildScanned(input, id, dir, written);
    const name = mode === 'copy' ? tDoc('document.withCover', { name: doc.name }) : doc.name;
    const pdfUri = mode === 'copy' ? built.pdf.uri : moveIntoPlace(built.pdf, dir);
    const sizeBytes = new File(pdfUri).size ?? 0;
    const fields = {
      pages: built.pages,
      pdfUri,
      sizeBytes,
      coverKind: cover.mode,
      pdfLayout: built.pdfLayout,
      pdfPageSize: built.pdfPageSize,
    } satisfies Partial<LibraryDocument>;

    if (mode === 'copy') {
      // A fresh document: no annotations, bookmarks, reading position or star.
      return {
        doc: {
          id,
          name,
          format: 'PDF',
          mode: doc.mode,
          createdAt: Date.now(),
          star: false,
          tag: doc.tag,
          locked: false,
          courseId: doc.courseId,
          docType: doc.docType,
          sourceKind: doc.sourceKind,
          indexedAt: doc.indexedAt,
          indexState: doc.indexState,
          ...fields,
        },
      };
    }

    // The old cover row's files go now that nothing points at them.
    const oldCover = doc.coverKind ? doc.pages[0] : undefined;
    if (oldCover) cleanTemporaryCache(pageFiles(oldCover));
    const onOldCover = (item: { pageId: string }) => item.pageId === oldCover?.id;
    return {
      doc: {
        ...doc,
        ...fields,
        // A new first page only when there was no cover before; replacing a cover keeps the count.
        lastPage: doc.lastPage !== undefined && !doc.coverKind ? doc.lastPage + 1 : doc.lastPage,
      },
      annotations: oldCover && input.annotations.some(onOldCover) ? input.annotations.filter((a) => !onOldCover(a)) : undefined,
      bookmarks: oldCover && input.bookmarks.some(onOldCover) ? input.bookmarks.filter((b) => !onOldCover(b)) : undefined,
    };
  } catch (error) {
    if (mode === 'copy') {
      if (dir.exists) dir.delete();
    } else {
      cleanTemporaryCache(written);
    }
    throw error;
  }
}

type Built = { pdf: File; pages: LibraryPage[]; pdfLayout: LibraryDocument['pdfLayout']; pdfPageSize: LibraryDocument['pdfPageSize'] };

// Where the new PDF is written: the copy's own document.pdf, or a temporary file next to the
// original's, so a crash mid-write never loses the document.
function pdfDest(mode: AddCoverInput['mode'], dir: Directory, written: string[]): File {
  if (!dir.exists) dir.create({ intermediates: true });
  const dest = new File(dir, mode === 'copy' ? 'document.pdf' : TEMP_PDF);
  written.push(dest.uri);
  return dest;
}

function moveIntoPlace(temp: File, dir: Directory): string {
  const dest = new File(dir, 'document.pdf');
  moveReplacing(temp, dest);
  return dest.uri;
}

// A scan is rebuilt from its masters with the cover in front, as Deliver builds it: it keeps its
// OCR text layer (buildPdfFromPages lays the content out after the cover) and stays a scan, so
// compress, filters and sign keep working. An existing cover is simply left out of the content.
async function buildScanned(input: AddCoverInput, id: string, dir: Directory, written: string[]): Promise<Built> {
  const { doc, config, pageSize, mode } = input;
  const content = doc.coverKind ? doc.pages.slice(1) : doc.pages;

  const rendered = await renderCoverPageImage(config.coverPage!, pageSize);
  if (!rendered) throw new CoverPhotoError();
  const coverId = createId('page');
  const master = new File(dir, `page_${coverId}.jpg`);
  if (!dir.exists) dir.create({ intermediates: true });
  written.push(master.uri);
  // An imported cover is the student's own picked file - copied, never moved.
  const cover = config.coverPage!;
  if (cover.mode === 'imported_image' && rendered.uri === cover.importedUri) new File(rendered.uri).copySync(master);
  else new File(rendered.uri).moveSync(master);
  const thumbSource = await downscaleAndCompressPage(master.uri, THUMB_MAX_DIM, THUMB_JPEG_Q);
  const thumb = new File(dir, `thumb_${coverId}.jpg`);
  written.push(thumb.uri);
  new File(thumbSource.uri).moveSync(thumb);
  const coverRow: LibraryPage = { id: coverId, fileUri: master.uri, thumbUri: thumb.uri, width: rendered.width, height: rendered.height };

  // A copy gets its own files and page ids (the original stays); a replace keeps its rows.
  const contentRows = mode === 'copy' ? content.map((page, i) => copyPageInto(page, dir, i + 1, { byId: true })) : content;
  const pages = [coverRow, ...contentRows];
  const pdfLayout = doc.pdfLayout ?? 'standard';
  const mapped = { pages, coverKind: cover.mode, pdfLayout, pdfPageSize: pageSize };
  const annotations = mode === 'replace' ? input.annotations.filter((a) => a.documentId === doc.id) : [];

  const pdf = pdfDest(mode, dir, written);
  await buildPdfFromPages(id, contentRows.map(toSourcePage), 'as-is', config, pdfLayout === '2_in_1' ? '2_in_1' : 'standard', pageSize, {
    dest: pdf,
    beforeSave: annotations.length ? (pdfDoc) => writeAnnotations(pdfDoc, mapped, annotations) : undefined,
  });
  // buildCoverPage skips a cover image it can't embed (a format pdf-lib can't read).
  if ((await inspectPdf(pdf.uri))?.pageCount !== pdfPageCount(mapped)) throw new CoverPhotoError();
  return { pdf, pages, pdfLayout, pdfPageSize: pageSize };
}

// A PDF-level document (imported, merged with an imported part, converted) keeps its pages as
// they are - text, links, quality - and gets the cover and stamps through decoratePdf. Its old
// cover, if any, is removed first so the result never has two.
async function buildPdfLevel(input: AddCoverInput, id: string, dir: Directory, written: string[]): Promise<Built> {
  const { doc, config, pageSize, mode } = input;
  const pdfDoc = await loadPdf(doc.pdfUri!);
  if (doc.coverKind && pdfDoc.getPageCount() > 1) pdfDoc.removePage(0);
  const before = pdfDoc.getPageCount();
  await decoratePdf(pdfDoc, config, pageSize);
  if (pdfDoc.getPageCount() !== before + 1) throw new CoverPhotoError();

  const pdf = pdfDest(mode, dir, written);
  await savePdf(pdfDoc, pdf);

  const content = doc.coverKind ? doc.pages.slice(1) : doc.pages;
  const contentRows = mode === 'copy' ? content.map((page, i) => copyPageInto(page, dir, i + 1, { byId: true })) : content;
  const coverRow = await pdfLevelCoverRow(pdf.uri, pageSize, dir, written);
  return { pdf, pages: [coverRow, ...contentRows], pdfLayout: 'standard', pdfPageSize: undefined };
}

// The cover's page row, measured like an indexed imported page (master pixels of the page as
// shown), with a thumbnail rendered from the new PDF. Best-effort: without one (no pdf-native in
// this build) the row just shows no preview.
async function pdfLevelCoverRow(pdfUri: string, pageSize: PageSizeId, dir: Directory, written: string[]): Promise<LibraryPage> {
  const dims = pageDimensions(pageSize);
  const row: LibraryPage = {
    id: createId('page'),
    fileUri: '',
    width: Math.round((MASTER_MAX_DIM * dims.width) / dims.height),
    height: MASTER_MAX_DIM,
  };
  try {
    const rendered = await renderPage(pdfUri, 0, { maxDim: THUMB_MAX_DIM, quality: THUMB_JPEG_Q });
    const thumb = new File(dir, `thumb_${row.id}.jpg`);
    written.push(thumb.uri);
    new File(rendered.uri).moveSync(thumb);
    return { ...row, thumbUri: thumb.uri };
  } catch (error) {
    console.warn('addCover: no thumbnail for the cover page', error);
    return row;
  }
}

// §14 Q7: Academic options' Preview for a library document - its first content page with the
// cover in front and the stamps on, written to library/<previewId>/document.pdf - so the student
// sees what Apply makes without the whole document being rebuilt. decoratePdf's stamps on a scan's
// page look as buildPdfFromPages draws them. The caller deletes the folder (deleteDocumentFiles).
export async function buildCoverPreview(doc: LibraryDocument, config: AcademicConfig, pageSize: PageSizeId, previewId: string): Promise<string> {
  if (!doc.pdfUri) throw new Error(`buildCoverPreview: ${doc.id} has no PDF`);
  const dest = new File(getDocumentDir(previewId), 'document.pdf');
  // An existing cover is PDF page 1; it's the one being replaced, so the preview starts after it.
  await extractPages(doc.pdfUri, [doc.coverKind ? 1 : 0], dest);
  const pdfDoc = await loadPdf(dest.uri);
  await decoratePdf(pdfDoc, config, pageSize);
  await savePdf(pdfDoc, dest);
  return dest.uri;
}
