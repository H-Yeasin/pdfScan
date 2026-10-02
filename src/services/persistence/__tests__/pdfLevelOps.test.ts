import { File, Paths } from 'expo-file-system';
import { PDFDocument } from 'pdf-lib';
import PdfNative from '../../../../modules/pdf-native';
import { makePng } from '../../../test/png';
import { makeEncryptedPdf, makeTextPdf, pdfPageTexts } from '../../../test/pdfs';
import { resetStorage } from '../../../test/db';
import { buildPdfFromPages } from '../../pdf/pdfService';
import { PdfEncryptedError } from '../../pdf/pdfErrors';
import { getDocumentDir } from '../libraryFiles';
import { applySignatureToDocument, compressImportedPdf, mergeDocuments, splitDocument } from '../libraryOperations';
import { getDb } from '../dbService';
import { loadAll, syncLibrary } from '../libraryRepo';
import { initialLibraryState, libraryReducer } from '../../../store/slices/librarySlice';
import { defaultSubmitPreset, type SubmitPreset } from '../../submit/preset';
import { submitDocument } from '../../submit/submitDocument';
import type { Annotation, Bookmark, LibraryDocument, LibraryPage } from '../../../types/models';

const native = PdfNative as unknown as { getPageCount: jest.Mock; getPageSize: jest.Mock; renderPage: jest.Mock };
const defaultRender = native.renderPage.getMockImplementation()!;

function file(dir: string, name: string, bytes: Uint8Array | string): string {
  const f = new File(Paths.cache, dir, name);
  f.write(bytes);
  return f.uri;
}

const ocrOf = (text: string) => {
  const bounding = { left: 100, top: 100, width: 600, height: 40 };
  return { text, blocks: [{ text, bounding, lines: [{ text, bounding }] }] };
};

// A scan: PNG masters with OCR, and a standard document.pdf built from them.
async function scannedDoc(id: string, texts: string[]): Promise<LibraryDocument> {
  const pages: LibraryPage[] = texts.map((text, i) => ({
    id: `${id}_p${i}`,
    fileUri: file(id, `page_${i + 1}.png`, makePng(20, 28)),
    thumbUri: file(id, `thumb_${i + 1}.png`, makePng(4, 6)),
    width: 1000,
    height: 1400,
    ocr: ocrOf(text),
  }));
  const pdf = await buildPdfFromPages(id, pages.map((p) => ({ uri: p.fileUri, width: p.width, height: p.height, ocr: p.ocr })), 'as-is');
  return {
    id,
    name: id,
    format: 'PDF',
    mode: 'doc',
    pages,
    pdfUri: pdf.uri,
    sizeBytes: pdf.sizeBytes,
    createdAt: 1,
    star: false,
    locked: false,
    searchHaystack: '',
    pdfLayout: 'standard',
  };
}

// An imported, indexed PDF: the teacher's text PDF, thumbnails and the text as page OCR (R1).
async function importedDoc(id: string, texts: string[]): Promise<LibraryDocument> {
  const dest = new File(getDocumentDir(id), 'document.pdf');
  new File(await makeTextPdf(texts)).copySync(dest);
  const pages: LibraryPage[] = texts.map((text, i) => ({
    id: `${id}_p${i}`,
    fileUri: '',
    thumbUri: file(id, `thumb_${i + 1}.jpg`, 'thumb'),
    width: 1855,
    height: 2400,
    ocr: ocrOf(text),
    textSource: 'pdf',
  }));
  return {
    id,
    name: id,
    format: 'PDF',
    mode: 'doc',
    pages,
    pdfUri: dest.uri,
    sizeBytes: dest.size,
    createdAt: 1,
    star: false,
    locked: false,
    searchHaystack: '',
    sourceKind: 'imported_pdf',
    pdfLayout: 'standard',
    indexedAt: 1,
    indexState: 'done',
  };
}

beforeEach(resetStorage);
afterEach(() => {
  native.getPageCount.mockReset().mockResolvedValue(1);
  native.renderPage.mockReset().mockImplementation(defaultRender);
});

describe('merge with an imported PDF (§7 R2)', () => {
  it('merges at the PDF level: the teacher pages keep their text, every page keeps its row', async () => {
    const answers = await scannedDoc('answers', ['My answer one', 'My answer two']);
    const teacher = await importedDoc('teacher', ['Question sheet page 1', 'Question sheet page 2']);

    const merged = await mergeDocuments([teacher, answers]);

    expect(merged.sourceKind).toBe('imported_pdf');
    expect(merged.pages.map((p) => p.id)).toEqual(['teacher_p0', 'teacher_p1', 'answers_p0', 'answers_p1']);
    expect(merged.pages.every((p) => p.thumbUri?.startsWith(getDocumentDir(merged.id).uri))).toBe(true);
    expect(merged.indexState).toBe('done');
    const texts = await pdfPageTexts(merged.pdfUri!);
    expect(texts).toHaveLength(4);
    expect(texts[0]).toBe('Question sheet page 1');
    // The scanned pages carry their OCR as the invisible text layer.
    expect(texts[2]).toContain('My answer one');
  });

  it("rebuilds a scan that isn't laid out one page per page, so rows still line up", async () => {
    const answers = { ...(await scannedDoc('twoup', ['A', 'B', 'C'])), pdfLayout: '2_in_1' as const };
    const teacher = await importedDoc('t2', ['Sheet']);
    const merged = await mergeDocuments([teacher, answers]);
    expect(merged.pages).toHaveLength(4);
    expect((await PDFDocument.load(await new File(merged.pdfUri!).bytes())).getPageCount()).toBe(4);
  });

  it('leaves a merge with a not-yet-indexed PDF to the indexer', async () => {
    const teacher = { ...(await importedDoc('t3', ['One', 'Two'])), indexedAt: undefined, indexState: undefined };
    const answers = await scannedDoc('a3', ['Mine']);
    const merged = await mergeDocuments([{ ...teacher, pages: teacher.pages.slice(0, 1) }, answers]);
    expect(merged.pages).toHaveLength(3);
    expect(merged.indexedAt).toBeUndefined();
  });

  it('fails with the typed error on a password-protected PDF', async () => {
    const locked = { ...(await importedDoc('locked', ['x'])), pdfUri: await makeEncryptedPdf() };
    await expect(mergeDocuments([locked, await scannedDoc('s', ['y'])])).rejects.toBeInstanceOf(PdfEncryptedError);
  });

  it('moves bookmarks and annotations with their pages, in state and on disk', async () => {
    const answers = await scannedDoc('ans', ['Mine']);
    const teacher = await importedDoc('tea', ['Theirs']);
    const bookmark: Bookmark = { id: 'bm', documentId: 'tea', pageId: 'tea_p0', createdAt: 1 };
    const note: Annotation = { id: 'an', documentId: 'ans', pageId: 'ans_p0', kind: 'note', color: 'yellow', data: { x: 1, y: 1 }, text: 'check', createdAt: 1, updatedAt: 1 };
    const before = { ...initialLibraryState, files: [teacher, answers], bookmarks: [bookmark], annotations: [note] };
    const db = await getDb();
    await syncLibrary(db, { documents: [], courses: [], semesters: [], timetable: [] }, {
      documents: before.files,
      courses: [],
      semesters: [],
      timetable: [],
      bookmarks: before.bookmarks,
      annotations: before.annotations,
    });

    const merged = await mergeDocuments([teacher, answers], [note]);
    const after = libraryReducer(before, { type: 'library/REPLACE_FILES', ids: ['tea', 'ans'], files: [merged] });
    expect(after.bookmarks).toEqual([{ ...bookmark, documentId: merged.id }]);
    expect(after.annotations).toEqual([{ ...note, documentId: merged.id }]);

    // The merged document reuses the page ids; the old rows are deleted first.
    await syncLibrary(
      db,
      { documents: before.files, courses: [], semesters: [], timetable: [], bookmarks: before.bookmarks, annotations: before.annotations },
      { documents: after.files, courses: [], semesters: [], timetable: [], bookmarks: after.bookmarks, annotations: after.annotations }
    );
    const loaded = await loadAll(db);
    expect(loaded.documents.map((d) => d.id)).toEqual([merged.id]);
    expect(loaded.documents[0].pages.map((p) => p.id)).toEqual(['tea_p0', 'ans_p0']);
    expect(loaded.bookmarks).toEqual([{ ...bookmark, documentId: merged.id, label: undefined }]);
    expect(loaded.annotations?.map((a) => a.documentId)).toEqual([merged.id]);
  });
});

describe('split of an imported PDF', () => {
  it('gives one PDF per page, copied untouched, each with its page row', async () => {
    const teacher = await importedDoc('split', ['First', 'Second', 'Third']);
    const parts = await splitDocument(teacher);
    expect(parts.map((p) => p.pages[0].id)).toEqual(['split_p0', 'split_p1', 'split_p2']);
    expect(parts.every((p) => p.sourceKind === 'imported_pdf' && p.indexState === 'done')).toBe(true);
    expect(await Promise.all(parts.map(async (p) => (await pdfPageTexts(p.pdfUri!))[0]))).toEqual(['First', 'Second', 'Third']);
  });
});

describe('compress of an imported PDF', () => {
  it('keeps the original when images would not be smaller', async () => {
    const teacher = await importedDoc('small', ['Tiny text PDF']);
    const original = await new File(teacher.pdfUri!).bytes();
    const result = await compressImportedPdf(teacher, 2);
    expect(result.smaller).toBe(false);
    expect(result.doc).toBe(teacher);
    expect(await new File(teacher.pdfUri!).bytes()).toEqual(original);
  });

  it('turns pages into images when that is smaller, keeping the text searchable', async () => {
    const teacher = await importedDoc('big', ['Scanned handout']);
    // Make the original heavy, like a 600 dpi scan.
    const heavy = await PDFDocument.load(await new File(teacher.pdfUri!).bytes());
    heavy.getPage(0).drawImage(await heavy.embedPng(makePng(1500, 1500)), { x: 0, y: 0, width: 10, height: 10 });
    new File(teacher.pdfUri!).write(await heavy.save({ useObjectStreams: false }));
    native.renderPage.mockImplementation(async (_uri: string, page: number, o: { maxDim: number; quality: number }) =>
      defaultRender(_uri, page, { ...o, maxDim: 100 })
    );

    const result = await compressImportedPdf({ ...teacher, sizeBytes: new File(teacher.pdfUri!).size }, 1);
    expect(result.smaller).toBe(true);
    expect(result.doc.pdfUri).toBe(teacher.pdfUri);
    expect((await pdfPageTexts(teacher.pdfUri!))[0]).toContain('Scanned handout');
  });
});

describe('sign an imported PDF', () => {
  it('draws the signature onto its own page from a placement on the rendered page', async () => {
    const teacher = await importedDoc('sign', ['Signature: ______', 'Page two']);
    const sig = file('sig', 'saved.png', makePng(30, 10));
    const shown = { width: 1237, height: 1600 };
    const signed = await applySignatureToDocument(teacher, 0, sig, { originX: 600, originY: 1200, width: 300, height: 100 }, shown);
    expect(signed.sizeBytes).toBeGreaterThan(teacher.sizeBytes);
    expect(await pdfPageTexts(signed.pdfUri!)).toEqual(['Signature: ______', 'Page two']);
    expect(new File(sig).exists).toBe(true);
  });
});

describe('submit an imported PDF', () => {
  const profile = { name: 'Rahim Uddin', roll: '2021331045', section: 'B', institution: 'SUST' };
  const preset: SubmitPreset = { ...defaultSubmitPreset(null), coverTemplateId: 'assignment', footerPreset: 'namePages', pageSize: 'A4' };

  it('sends the original with the cover in front and the footer on each page', async () => {
    const teacher = await importedDoc('sub', ['Lab sheet 1', 'Lab sheet 2']);
    const result = await submitDocument({ doc: teacher, preset: { ...preset, sizeLimitBytes: null }, profile, n: 1 });
    expect(result.rasterized).toBeUndefined();
    const texts = await pdfPageTexts(result.uri);
    expect(texts).toHaveLength(3);
    expect(texts[1]).toContain('Lab sheet 1');
    expect(texts[1]).toContain('2021331045 · 1/2');
    expect(native.renderPage).not.toHaveBeenCalled();
  });

  it('turns pages into images only when the original is over the limit', async () => {
    const teacher = await importedDoc('sub2', ['Long handout 1', 'Long handout 2', 'Long handout 3']);
    native.getPageCount.mockResolvedValue(3);
    // A heavy original, like a scanned handout.
    const heavy = await PDFDocument.load(await new File(teacher.pdfUri!).bytes());
    heavy.getPage(1).drawImage(await heavy.embedPng(makePng(1500, 1500)), { x: 0, y: 0, width: 10, height: 10 });
    new File(teacher.pdfUri!).write(await heavy.save({ useObjectStreams: false }));
    const original = await submitDocument({ doc: teacher, preset: { ...preset, sizeLimitBytes: null }, profile, n: 1 });
    const limit = Math.round(original.sizeBytes / 2);
    // Renders small enough to fit from a mid-ladder level on.
    native.renderPage.mockImplementation(async (uri: string, page: number, o: { maxDim: number; quality: number }) =>
      defaultRender(uri, page, { ...o, maxDim: Math.round(o.maxDim / 40) })
    );

    const result = await submitDocument({ doc: teacher, preset: { ...preset, sizeLimitBytes: limit }, profile, n: 1 });
    expect(result.rasterized).toBe(true);
    expect(result.fits).toBe(true);
    expect(result.sizeBytes).toBeLessThanOrEqual(limit);
    const texts = await pdfPageTexts(result.uri);
    expect(texts).toHaveLength(4);
    // The text is still there, as the invisible layer, and so is the footer.
    expect(texts[2]).toContain('Long handout 2');
    expect(texts[2]).toContain('2021331045 · 2/3');
  });
});
