import { File, Paths } from 'expo-file-system';
import MlkitOcr from 'rn-mlkit-ocr';
import PdfNative from '../../../../modules/pdf-native';
import { makeDoc } from '../../../test/fixtures';
import { resetStorage } from '../../../test/db';
import { INDEX_MAX_PAGES, indexImportedPdf, masterSizeFor, needsIndexing, pdfTextToOcr } from '../importedPdfIndex';
import { getDb, searchPages } from '../../persistence/dbService';
import { loadAll, syncLibrary } from '../../persistence/libraryRepo';
import { MASTER_MAX_DIM, THUMB_MAX_DIM } from '../../capture/imageSpec';
import type { LibraryDocument, LibraryPage } from '../../../types/models';

// The jest mock (src/test/mocks/pdfNative.ts) is mapped in for modules/pdf-native.
const native = PdfNative as unknown as {
  getPageCount: jest.Mock;
  getPageSize: jest.Mock;
  renderPage: jest.Mock;
  getPageText: jest.Mock;
};
const defaults = {
  getPageCount: native.getPageCount.getMockImplementation()!,
  getPageText: native.getPageText.getMockImplementation()!,
  renderPage: native.renderPage.getMockImplementation()!,
};

const word = (text: string, left: number, top: number, width = 40, height = 12) => ({ text, left, top, width, height });

// A lecture PDF: every page has a text layer naming its page number.
function lecture(pages: number) {
  native.getPageCount.mockResolvedValue(pages);
  native.getPageText.mockImplementation(async (_uri: string, page: number) => ({
    width: 612,
    height: 792,
    text: `Lecture page ${page + 1}\nmitochondria${page + 1}`,
    words: [word('Lecture', 72, 72), word('page', 116, 72), word(String(page + 1), 160, 72), word(`mitochondria${page + 1}`, 72, 90, 90)],
  }));
}

function importedDoc(overrides: Partial<LibraryDocument> = {}): LibraryDocument {
  return makeDoc({
    sourceKind: 'imported_pdf',
    pages: [{ id: 'stub_1', fileUri: '', width: 850, height: 1100 }],
    ...overrides,
  });
}

beforeEach(resetStorage);
afterEach(() => {
  native.getPageCount.mockReset().mockImplementation(defaults.getPageCount);
  native.getPageText.mockReset().mockImplementation(defaults.getPageText);
  native.renderPage.mockReset().mockImplementation(defaults.renderPage);
  (MlkitOcr.recognizeText as jest.Mock).mockReset().mockResolvedValue({ text: '', blocks: [] });
});

describe('indexImportedPdf', () => {
  it('creates one page per PDF page with a thumbnail and the PDF text, in master pixels', async () => {
    lecture(3);
    const doc = importedDoc();
    const result = await indexImportedPdf(doc, { script: 'latin' });

    if (!result.finished) throw new Error('expected a finished run');
    const { pages, indexState, indexedAt, pdfLayout } = result.patch;
    expect(indexState).toBe('done');
    expect(indexedAt).toEqual(expect.any(Number));
    expect(pdfLayout).toBe('standard');
    expect(pages).toHaveLength(3);
    // The placeholder's id is kept (bookmarks follow page ids).
    expect(pages[0].id).toBe('stub_1');

    const master = masterSizeFor({ width: 612, height: 792 });
    for (const [i, page] of pages.entries()) {
      expect(page.fileUri).toBe('');
      expect(page.textSource).toBe('pdf');
      expect(page.ocr?.text).toContain(`Lecture page ${i + 1}`);
      expect(page).toMatchObject({ width: master.width, height: master.height });
      expect(page.thumbUri).toBe(new File(Paths.document, 'library', doc.id, `thumb_${i + 1}.jpg`).uri);
      expect(new File(page.thumbUri!).exists).toBe(true);
    }
    expect(master.height).toBe(MASTER_MAX_DIM);
    // Words are scaled from points to the master: 72 pt → 72 × 2400/792 px.
    const first = pages[0].ocr!.blocks[0].lines[0].words![0];
    expect(first.text).toBe('Lecture');
    expect(first.bounding.left).toBeCloseTo((72 * MASTER_MAX_DIM) / 792);
    expect(native.renderPage).toHaveBeenCalledWith(doc.pdfUri, 0, expect.objectContaining({ maxDim: THUMB_MAX_DIM }));
    // Text pages never render a master.
    expect(native.renderPage).not.toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({ maxDim: MASTER_MAX_DIM }));
  });

  it('runs OCR on a rendered master for a page without text, then drops the master', async () => {
    native.getPageCount.mockResolvedValue(2);
    native.getPageText.mockImplementation(async (_uri: string, page: number) =>
      page === 0
        ? { width: 612, height: 792, text: 'Typed cover', words: [word('Typed', 72, 72), word('cover', 120, 72)] }
        : { width: 612, height: 792, text: '  ', words: [] }
    );
    (MlkitOcr.recognizeText as jest.Mock).mockResolvedValue({
      text: 'Handwritten answer',
      blocks: [{ text: 'Handwritten answer', frame: { x: 10, y: 20, width: 300, height: 40 }, lines: [] }],
    });

    const result = await indexImportedPdf(importedDoc(), { script: 'latin' });
    if (!result.finished) throw new Error('expected a finished run');
    const [typed, scanned] = result.patch.pages;
    expect(typed.textSource).toBe('pdf');
    expect(scanned.textSource).toBe('ocr');
    expect(scanned.ocr?.text).toBe('Handwritten answer');
    expect(scanned.thumbUri).toBeDefined();

    const masterCall = native.renderPage.mock.calls.findIndex((call) => call[2].maxDim === MASTER_MAX_DIM);
    expect(native.renderPage.mock.calls[masterCall][1]).toBe(1);
    const masterUri = (await native.renderPage.mock.results[masterCall].value).uri as string;
    expect(MlkitOcr.recognizeText).toHaveBeenCalledWith(masterUri, expect.anything());
    expect(new File(masterUri).exists).toBe(false);
  });

  it('resumes after the pages an interrupted run finished', async () => {
    lecture(25);
    const controller = new AbortController();
    const commits: LibraryPage[][] = [];
    const first = await indexImportedPdf(importedDoc(), {
      script: 'latin',
      signal: controller.signal,
      onCommit: (pages) => commits.push(pages),
      onProgress: ({ done }) => {
        if (done === 12) controller.abort();
      },
    });

    expect(first.finished).toBe(false);
    // Saved every 10 pages along the way.
    expect(commits).toHaveLength(1);
    expect(commits[0].filter((p) => p.thumbUri)).toHaveLength(10);
    if (first.finished) return;
    expect(first.pages.filter((p) => p.thumbUri)).toHaveLength(12);

    // "Restart": the saved document goes through the database and back.
    const saved = importedDoc({ id: 'lecture', pages: first.pages });
    await syncLibrary(await getDb(), { documents: [], courses: [], semesters: [], timetable: [] }, {
      documents: [saved],
      courses: [],
      semesters: [],
      timetable: [],
    });
    const [reloaded] = (await loadAll(await getDb())).documents;
    expect(needsIndexing(reloaded)).toBe(true);
    expect(reloaded.pages[0].textSource).toBe('pdf');

    native.getPageText.mockClear();
    const second = await indexImportedPdf(reloaded, { script: 'latin' });
    if (!second.finished) throw new Error('expected a finished run');
    expect(native.getPageText.mock.calls.map((call) => call[1])).toEqual(Array.from({ length: 13 }, (_, i) => i + 12));
    expect(second.patch.pages.every((p) => p.thumbUri)).toBe(true);
    expect(second.patch.pages.map((p) => p.id).slice(0, 12)).toEqual(first.pages.map((p) => p.id).slice(0, 12));
  });

  it('keeps an encrypted PDF but skips indexing it, with a status', async () => {
    native.getPageCount.mockRejectedValue(Object.assign(new Error('locked'), { code: 'ENCRYPTED' }));
    const doc = importedDoc();
    const result = await indexImportedPdf(doc, { script: 'latin' });
    expect(result).toEqual({
      finished: true,
      patch: { pages: doc.pages, indexedAt: expect.any(Number), indexState: 'encrypted', pdfLayout: 'standard' },
    });
    expect(native.getPageText).not.toHaveBeenCalled();
  });

  it('indexes only the first pages of a very long PDF', async () => {
    lecture(INDEX_MAX_PAGES + 20);
    const result = await indexImportedPdf(importedDoc(), { script: 'latin' });
    if (!result.finished) throw new Error('expected a finished run');
    expect(result.patch.indexState).toBe('partial');
    expect(result.patch.pages).toHaveLength(INDEX_MAX_PAGES + 20);
    expect(result.patch.pages.filter((p) => p.thumbUri)).toHaveLength(INDEX_MAX_PAGES);
    expect(native.getPageText).toHaveBeenCalledTimes(INDEX_MAX_PAGES);
  });

  it('keeps going past one page that fails to render', async () => {
    lecture(3);
    native.renderPage.mockImplementation(async (uri: string, page: number, options: { maxDim: number; quality: number }) => {
      if (page === 1) throw new Error('damaged page');
      return defaults.renderPage(uri, page, options);
    });
    const result = await indexImportedPdf(importedDoc(), { script: 'latin' });
    if (!result.finished) throw new Error('expected a finished run');
    expect(result.patch.indexState).toBe('done');
    expect(result.patch.pages.map((p) => !!p.thumbUri)).toEqual([true, false, true]);
    // Its text was still read.
    expect(result.patch.pages[1].ocr?.text).toContain('Lecture page 2');
  });
});

describe('needsIndexing', () => {
  it('is true only for imported PDFs not indexed yet', () => {
    expect(needsIndexing(importedDoc())).toBe(true);
    expect(needsIndexing(importedDoc({ indexedAt: 1, indexState: 'done' }))).toBe(false);
    expect(needsIndexing(makeDoc())).toBe(false);
  });
});

describe('pdfTextToOcr', () => {
  it('groups words into lines and blocks', () => {
    const ocr = pdfTextToOcr({
      width: 612,
      height: 792,
      text: '',
      words: [
        word('Title', 72, 72, 60, 20),
        word('First', 72, 120),
        word('line', 116, 121),
        word('Second', 72, 134),
        word('line', 120, 134),
        // Far below: a new block.
        word('Footer', 72, 700),
      ],
    });
    expect(ocr.blocks.map((b) => b.lines.map((l) => l.text))).toEqual([['Title'], ['First line', 'Second line'], ['Footer']]);
    expect(ocr.text).toBe('Title\n\nFirst line\nSecond line\n\nFooter');
  });
});

describe('search over an indexed import', () => {
  it('finds a word from page 23 of a 40-page lecture', async () => {
    lecture(40);
    const doc = importedDoc({ id: 'slides', name: 'Week 3 slides' });
    const result = await indexImportedPdf(doc, { script: 'latin' });
    if (!result.finished) throw new Error('expected a finished run');
    await syncLibrary(await getDb(), { documents: [], courses: [], semesters: [], timetable: [] }, {
      documents: [{ ...doc, ...result.patch }],
      courses: [],
      semesters: [],
      timetable: [],
    });

    const hits = await searchPages('mitochondria23');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ documentId: 'slides', idx: 22 });

    const [reloaded] = (await loadAll(await getDb())).documents;
    expect(reloaded).toMatchObject({ indexState: 'done', indexedAt: expect.any(Number), pdfLayout: 'standard' });
    expect(reloaded.searchHaystack).toContain('mitochondria23');
    expect(reloaded.pages[22].thumbUri).toBe(result.patch.pages[22].thumbUri);
  });
});

