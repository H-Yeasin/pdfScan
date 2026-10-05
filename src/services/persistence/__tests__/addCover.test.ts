import { File, Paths } from 'expo-file-system';
import { PDFDocument } from 'pdf-lib';
import { makePng } from '../../../test/png';
import { makeTextPdf, pdfPageTexts } from '../../../test/pdfs';
import { resetStorage } from '../../../test/db';
import * as pdfService from '../../pdf/pdfService';
import { renderCoverPageImage } from '../../pdf/academicRasterService';
import { canAddCover } from '../../documents/formatCapabilities';
import { getDocumentDir } from '../libraryFiles';
import { addCoverToDocument, CoverPhotoError, type AddCoverInput } from '../addCover';
import type { Annotation, Bookmark, LibraryDocument, LibraryPage } from '../../../types/models';

// Skia can't run under Jest: the cover raster and the thumbnail are stand-in PNGs.
jest.mock('../../pdf/academicRasterService', () => ({ renderCoverPageImage: jest.fn() }));
jest.mock('../../enhance/enhanceService', () => ({
  downscaleAndCompressPage: jest.fn(async () => {
    const { File: F, Paths: P } = jest.requireActual('expo-file-system');
    const f = new F(P.cache, `thumb_${Math.random().toString(36).slice(2)}.png`);
    f.write(jest.requireActual('../../../test/png').makePng(4, 6));
    return { uri: f.uri, width: 4, height: 6 };
  }),
}));

const renderCover = renderCoverPageImage as jest.Mock;

function file(dir: string, name: string, bytes: Uint8Array | string): string {
  const f = new File(Paths.cache, dir, name);
  f.write(bytes);
  return f.uri;
}

async function pageCount(uri: string): Promise<number> {
  return (await PDFDocument.load(await new File(uri).bytes())).getPageCount();
}

const template = { mode: 'template' as const, templateId: 'classic' as const, values: { title: 'Lab report' } };
const config = { enableBorder: false, coverPage: template } as unknown as pdfService.AcademicConfig;

async function importedDoc(id: string, texts: string[], extra: Partial<LibraryDocument> = {}): Promise<LibraryDocument> {
  const dest = new File(getDocumentDir(id), 'document.pdf');
  new File(await makeTextPdf(texts)).copySync(dest);
  const pages: LibraryPage[] = texts.map((_, i) => ({
    id: `${id}_p${i}`,
    fileUri: '',
    thumbUri: file(id, `thumb_${i + 1}.jpg`, 'thumb'),
    width: 1855,
    height: 2400,
  }));
  return {
    id,
    name: id,
    format: 'PDF',
    mode: 'doc',
    pages,
    pdfUri: dest.uri,
    sizeBytes: dest.size ?? 0,
    createdAt: 1,
    star: false,
    locked: false,
    searchHaystack: '',
    sourceKind: 'imported_pdf',
    pdfLayout: 'standard',
    indexedAt: 1,
    indexState: 'done',
    ...extra,
  };
}

async function scannedDoc(id: string, n: number): Promise<LibraryDocument> {
  const pages: LibraryPage[] = Array.from({ length: n }, (_, i) => ({
    id: `${id}_p${i}`,
    fileUri: file(id, `page_${i + 1}.png`, makePng(20, 28)),
    thumbUri: file(id, `thumb_${i + 1}.png`, makePng(4, 6)),
    width: 1000,
    height: 1400,
  }));
  const pdf = await pdfService.buildPdfFromPages(id, pages.map(pdfService.toSourcePage), 'as-is');
  return { id, name: id, format: 'PDF', mode: 'doc', pages, pdfUri: pdf.uri, sizeBytes: pdf.sizeBytes, createdAt: 1, star: false, locked: false, searchHaystack: '', pdfLayout: 'standard' };
}

function input(doc: LibraryDocument, extra: Partial<AddCoverInput> = {}): AddCoverInput {
  return { doc, config, pageSize: 'A4', mode: 'copy', annotations: [], bookmarks: [], ...extra };
}

const bookmark = (pageId: string): Bookmark => ({ id: `bm_${pageId}`, documentId: 'd', pageId, createdAt: 1 });
const note = (pageId: string): Annotation => ({ id: `an_${pageId}`, documentId: 'd', pageId, kind: 'note', color: 'yellow', data: { x: 1, y: 1 }, text: 'n', createdAt: 1, updatedAt: 1 });

beforeEach(() => {
  resetStorage();
  renderCover.mockReset().mockImplementation(async () => ({ uri: file('cover', `cover_${Math.random()}.png`, makePng(20, 28)), width: 1240, height: 1754 }));
});
afterEach(() => jest.restoreAllMocks());

describe('addCoverToDocument (§14 Q6), PDF-level', () => {
  it('copy: a new document with one more page; the original file is unchanged', async () => {
    const doc = await importedDoc('d', ['One', 'Two'], { courseId: 'bio', docType: 'notes' });
    const before = await new File(doc.pdfUri!).bytes();

    const { doc: copy } = await addCoverToDocument(input(doc));

    expect(copy.id).not.toBe(doc.id);
    expect(copy.name).toBe('d (cover)');
    expect(copy.coverKind).toBe('template');
    expect(copy.courseId).toBe('bio');
    expect(copy.docType).toBe('notes');
    expect(copy.sourceKind).toBe('imported_pdf');
    expect(copy.pdfUri!.startsWith(getDocumentDir(copy.id).uri)).toBe(true);
    expect(await pageCount(copy.pdfUri!)).toBe(3);
    expect(copy.pages).toHaveLength(3);
    // The cover row has its own thumbnail; the content rows are copies with new ids.
    expect(copy.pages[0].thumbUri).toBeDefined();
    expect(copy.pages.slice(1).every((p) => p.thumbUri?.startsWith(getDocumentDir(copy.id).uri))).toBe(true);
    expect(copy.pages.some((p) => doc.pages.some((o) => o.id === p.id))).toBe(false);
    expect((await pdfPageTexts(copy.pdfUri!)).slice(1)).toEqual(['One', 'Two']);
    expect(Array.from(await new File(doc.pdfUri!).bytes())).toEqual(Array.from(before));
  });

  it('replace with no cover before: notes stay on their pages, the reading position moves one on', async () => {
    const doc = await importedDoc('d', ['One', 'Two'], { lastPage: 2 });
    const result = await addCoverToDocument(input(doc, { mode: 'replace', annotations: [note('d_p1')], bookmarks: [bookmark('d_p0')] }));

    expect(result.doc.id).toBe('d');
    expect(result.doc.pdfUri).toBe(new File(getDocumentDir('d'), 'document.pdf').uri);
    expect(await pageCount(result.doc.pdfUri!)).toBe(3);
    expect(result.doc.pages.slice(1).map((p) => p.id)).toEqual(['d_p0', 'd_p1']);
    expect(result.doc.lastPage).toBe(3);
    // Page ids, not positions: nothing to shift.
    expect(result.annotations).toBeUndefined();
    expect(result.bookmarks).toBeUndefined();
    expect(new File(getDocumentDir('d'), 'document.cover.tmp.pdf').exists).toBe(false);
  });

  it('replace with a cover before: same page count, no second cover, the old cover’s notes go', async () => {
    const first = await addCoverToDocument(input(await importedDoc('d', ['One', 'Two'], { lastPage: 2 }), { mode: 'replace' }));
    const oldCover = first.doc.pages[0];

    const second = await addCoverToDocument(
      input(first.doc, { mode: 'replace', annotations: [note(oldCover.id), note('d_p0')], bookmarks: [bookmark('d_p1')] })
    );

    expect(await pageCount(second.doc.pdfUri!)).toBe(3);
    expect(second.doc.pages).toHaveLength(3);
    expect(second.doc.pages[0].id).not.toBe(oldCover.id);
    expect(second.doc.lastPage).toBe(3);
    expect(second.annotations?.map((a) => a.pageId)).toEqual(['d_p0']);
    expect(second.bookmarks).toBeUndefined();
    expect(new File(oldCover.thumbUri!).exists).toBe(false);
    expect((await pdfPageTexts(second.doc.pdfUri!)).slice(1)).toEqual(['One', 'Two']);
  });

  it('a failure in decoratePdf leaves the original untouched and no temp file', async () => {
    const doc = await importedDoc('d', ['One']);
    const before = await new File(doc.pdfUri!).bytes();
    jest.spyOn(pdfService, 'decoratePdf').mockRejectedValueOnce(new Error('boom'));

    await expect(addCoverToDocument(input(doc, { mode: 'replace' }))).rejects.toThrow('boom');

    expect(Array.from(await new File(doc.pdfUri!).bytes())).toEqual(Array.from(before));
    expect(new File(getDocumentDir('d'), 'document.cover.tmp.pdf').exists).toBe(false);
  });

  it('a cover photo that can’t be embedded is an error, not a document without a cover', async () => {
    const photo = file('cover', 'bad.jpg', 'not an image');
    const doc = await importedDoc('d', ['One']);
    const photoConfig = { enableBorder: false, coverPage: { mode: 'imported_image', importedUri: photo } } as unknown as pdfService.AcademicConfig;
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(addCoverToDocument(input(doc, { config: photoConfig }))).rejects.toBeInstanceOf(CoverPhotoError);
  });
});

describe('addCoverToDocument (§14 Q6), scans', () => {
  it('replace rebuilds from the masters through buildPdfFromPages with the config', async () => {
    const doc = await scannedDoc('s', 2);
    const build = jest.spyOn(pdfService, 'buildPdfFromPages');

    const { doc: next } = await addCoverToDocument(input(doc, { mode: 'replace' }));

    expect(build).toHaveBeenCalledTimes(1);
    const [, sources, encoding, academic] = build.mock.calls[0];
    expect(sources.map((s) => s.uri)).toEqual(doc.pages.map((p) => p.fileUri));
    expect(encoding).toBe('as-is');
    expect(academic).toBe(config);
    expect(next.coverKind).toBe('template');
    expect(next.sourceKind).toBeUndefined();
    expect(next.pages).toHaveLength(3);
    expect(next.pages[0].fileUri.startsWith(getDocumentDir('s').uri)).toBe(true);
    expect(await pageCount(next.pdfUri!)).toBe(3);
  });

  it('replacing a cover leaves the old cover out of the content', async () => {
    const first = await addCoverToDocument(input(await scannedDoc('s', 2), { mode: 'replace' }));
    const second = await addCoverToDocument(input(first.doc, { mode: 'replace' }));
    expect(second.doc.pages).toHaveLength(3);
    expect(await pageCount(second.doc.pdfUri!)).toBe(3);
    expect(new File(first.doc.pages[0].fileUri).exists).toBe(false);
  });

  it('a cover that can’t be rendered is an error and the copy leaves nothing behind', async () => {
    renderCover.mockResolvedValueOnce(null);
    const doc = await scannedDoc('s', 1);
    await expect(addCoverToDocument(input(doc))).rejects.toBeInstanceOf(CoverPhotoError);
    expect(new File(doc.pdfUri!).exists).toBe(true);
  });
});

describe('canAddCover', () => {
  const base = { pdfUri: 'file:///x/document.pdf', indexState: undefined };
  it('allows PDFs only, and not password-protected ones', () => {
    expect(canAddCover({ ...base, format: 'PDF' })).toBe(true);
    expect(canAddCover({ ...base, format: 'PDF', indexState: 'encrypted' })).toBe(false);
    for (const format of ['DOCX', 'XLSX', 'CSV', 'TXT'] as const) expect(canAddCover({ ...base, format, pdfUri: undefined })).toBe(false);
  });
});
