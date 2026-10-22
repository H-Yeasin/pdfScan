import { geometryKey } from '../../capture/geometryKey';
import type { ExportPreset } from '../../capture/imageSpec';
import type { AcademicConfig } from '../../pdf/pdfService';
import type { SessionPage } from '../../../types/models';
import { saveScan, sessionUris, type SaveScanDeps, type SaveScanOptions } from '../saveScan';

// §17 U9: the save pipeline with every file, Skia, OCR and PDF call faked.

const MASTER: ExportPreset = { maxDim: 2400, q: 0.92, sizeFactor: 1 };
const SMALL: ExportPreset = { maxDim: 1400, q: 0.65, sizeFactor: 0.16 };

function page(id: string, over: Partial<SessionPage> = {}): SessionPage {
  return { id, uri: `file:///cache/${id}.jpg`, thumbUri: `file:///cache/${id}-t.jpg`, width: 1000, height: 1400, rotation: 0, enhance: 'auto', ...over };
}

type Fakes = SaveScanDeps & { log: string[]; cleaned: string[]; deleted: string[]; active: number; maxActive: number };

function fakes(over: Partial<SaveScanDeps> = {}): Fakes {
  let n = 0;
  const f = {
    log: [] as string[],
    cleaned: [] as string[],
    deleted: [] as string[],
    active: 0,
    maxActive: 0,
  } as Fakes;
  const track = async <T,>(label: string, value: () => T): Promise<T> => {
    f.active++;
    f.maxActive = Math.max(f.maxActive, f.active);
    f.log.push(label);
    await Promise.resolve();
    f.active--;
    return value();
  };
  Object.assign(f, {
    masterPreset: MASTER,
    encodingForQuality: (q: number) => (q >= 5 ? 'as-is' : SMALL),
    renderPage: jest.fn((uri: string, _edits, preset: ExportPreset) =>
      track(`render ${uri.split('/').pop()} ${preset === MASTER ? 'master' : 'export'}`, () => ({ uri: `file:///cache/render-${++n}.jpg`, width: 1000, height: 1400 }))
    ),
    runOcr: jest.fn((uri: string) => track(`ocr ${uri.split('/').pop()}`, () => ({ text: 'read', blocks: [] }))),
    stampContentPageImage: jest.fn((uri: string) => track(`stamp ${uri.split('/').pop()}`, () => ({ uri: `file:///cache/stamp-${++n}.jpg`, width: 1000, height: 1400 }))),
    renderCoverPageImage: jest.fn(() => track('cover', () => ({ uri: 'file:///cache/cover.jpg', width: 1000, height: 1400 }))),
    buildPdfFromPages: jest.fn((_id: string, pages: { uri: string }[]) => track(`pdf ${pages.length}`, () => ({ uri: 'file:///docs/d1/document.pdf', sizeBytes: 5000 }))),
    buildPdfUnderLimit: jest.fn(() => track('pdf fitted', () => ({ uri: 'file:///docs/d1/document.pdf', sizeBytes: 9000, level: 8, fits: false, builds: 3 }))),
    saveImagesToLibrary: jest.fn((_id: string, pages: { masterUri: string }[]) =>
      track('library', () => ({ pages: pages.map((_, i) => ({ fileUri: `file:///docs/d1/page_${i + 1}.jpg` })), sizeBytes: 7000 }))
    ),
    cleanTemporaryCache: jest.fn((uris: string[]) => f.cleaned.push(...uris)),
    deleteDocumentFiles: jest.fn((id: string) => f.deleted.push(id)),
    createId: (prefix: string) => `${prefix}-x`,
    now: () => 1234,
  });
  return Object.assign(f, over);
}

function options(over: Partial<SaveScanOptions> = {}): SaveScanOptions {
  return {
    documentId: 'd1',
    pages: [page('a'), page('b')],
    name: 'HW3',
    format: 'PDF',
    mode: 'doc',
    courseId: 'c1',
    docType: 'assignment',
    quality: 5,
    sizeLimit: null,
    academic: null,
    layout: 'standard',
    pageSize: 'A4',
    ocrScript: 'latin',
    historyUris: [],
    ...over,
  };
}

describe('saveScan', () => {
  it('renders, reads and saves the pages in order, one at a time', async () => {
    const deps = fakes();
    const { doc } = await saveScan(options(), deps);
    expect(deps.log).toEqual(['render a.jpg master', 'ocr render-1.jpg', 'render b.jpg master', 'ocr render-2.jpg', 'pdf 2', 'library']);
    expect(deps.maxActive).toBe(1);
    expect(doc).toMatchObject({ id: 'd1', name: 'HW3', courseId: 'c1', docType: 'assignment', createdAt: 1234, pdfUri: 'file:///docs/d1/document.pdf', sizeBytes: 5000 });
    expect(doc.pages.map((p) => p.id)).toEqual(['a', 'b']);
    expect(doc.pages[0].fileUri).toBe('file:///docs/d1/page_1.jpg');
  });

  it('keeps the text read at scan time while it still fits the page (§16 G7)', async () => {
    const read = page('a');
    const fits = { ...read, ocr: { text: 'scan time', blocks: [] }, ocrGeometry: geometryKey(read, 'latin') };
    const turned = { ...page('b', { rotation: 90 }), ocr: { text: 'old', blocks: [] }, ocrGeometry: geometryKey(page('b'), 'latin') };
    const deps = fakes();
    const { doc } = await saveScan(options({ pages: [fits, turned] }), deps);
    expect(deps.runOcr).toHaveBeenCalledTimes(1);
    expect(doc.pages[0].ocr?.text).toBe('scan time');
    expect(doc.pages[1].ocr?.text).toBe('read');
  });

  it('renders an export copy below master quality and cleans it up after', async () => {
    const deps = fakes();
    await saveScan(options({ quality: 2 }), deps);
    expect(deps.log.filter((l) => l.startsWith('render'))).toEqual(['render a.jpg master', 'render a.jpg export', 'render b.jpg master', 'render b.jpg export']);
    // The export renders went into the PDF, then away; the masters went into the library.
    expect(deps.cleaned).toEqual(expect.arrayContaining(['file:///cache/render-2.jpg', 'file:///cache/render-4.jpg']));
    expect(deps.cleaned).not.toContain('file:///cache/render-1.jpg');
  });

  it('stamps display copies and puts the cover first', async () => {
    const academic: AcademicConfig = { enableBorder: true, footerText: 'Rahim', coverPage: { mode: 'template', templateId: 'classic', values: {} } as never };
    const deps = fakes();
    const { doc } = await saveScan(options({ academic }), deps);
    expect(deps.log).toEqual(expect.arrayContaining(['stamp render-1.jpg', 'stamp render-2.jpg', 'cover']));
    const placed = (deps.saveImagesToLibrary as jest.Mock).mock.calls[0][1];
    expect(placed[0]).toEqual({ masterUri: 'file:///cache/cover.jpg', displayUri: undefined, keepSource: false });
    expect(placed[1].displayUri).toBe('file:///cache/stamp-3.jpg');
    expect(doc.pages).toHaveLength(3);
    expect(doc.coverKind).toBe('template');
  });

  it('a JPG save skips the stamps and the cover', async () => {
    const academic: AcademicConfig = { enableBorder: true, coverPage: { mode: 'template', templateId: 'classic', values: {} } as never };
    const deps = fakes();
    const { doc } = await saveScan(options({ academic, format: 'JPG' }), deps);
    expect(deps.stampContentPageImage).not.toHaveBeenCalled();
    expect(doc.pages).toHaveLength(2);
    expect(doc.sizeBytes).toBe(7000);
  });

  it('fits the PDF under a size limit and says when even the smallest is over', async () => {
    const deps = fakes();
    const result = await saveScan(options({ sizeLimit: 1000, quality: 2 }), deps);
    expect(deps.buildPdfUnderLimit).toHaveBeenCalled();
    // With a limit the loop makes masters only.
    expect(deps.log.some((l) => l.endsWith('export'))).toBe(false);
    expect(result.oversize).toMatchObject({ sizeBytes: 9000 });
  });

  it("sweeps the session's files, the undo history's and a Book spread's once saved", async () => {
    const half = page('h', { splitFrom: { groupId: 'g', uri: 'file:///cache/spread.jpg', width: 2000, height: 1400 } });
    const deps = fakes();
    await saveScan(options({ pages: [half], historyUris: ['file:///cache/pre-crop.jpg'] }), deps);
    expect(deps.cleaned).toEqual(expect.arrayContaining(['file:///cache/h.jpg', 'file:///cache/h-t.jpg', 'file:///cache/spread.jpg', 'file:///cache/pre-crop.jpg']));
  });

  it('leaves no half-saved document when a page fails, and keeps the session for another try', async () => {
    let calls = 0;
    const deps = fakes();
    const render = deps.renderPage as jest.Mock;
    const real = render.getMockImplementation()!;
    render.mockImplementation((...args: unknown[]) => (++calls === 2 ? Promise.reject(new Error('decode')) : real(...args)));
    await expect(saveScan(options(), deps)).rejects.toThrow('decode');
    expect(deps.deleted).toEqual(['d1']);
    expect(deps.cleaned).toEqual(['file:///cache/render-1.jpg']);
    expect(deps.saveImagesToLibrary).not.toHaveBeenCalled();
  });

  it('a failure after the library copy deletes the document folder', async () => {
    const deps = fakes({ saveImagesToLibrary: jest.fn(() => Promise.reject(new Error('disk full'))) });
    await expect(saveScan(options(), deps)).rejects.toThrow('disk full');
    expect(deps.deleted).toEqual(['d1']);
    expect(deps.cleaned).not.toContain('file:///cache/a.jpg');
  });
});

describe('sessionUris', () => {
  it("includes an ID card's scanned sides", () => {
    const card = page('c', { idCard: { front: { uri: 'file:///f.jpg', width: 1, height: 1 }, back: { uri: 'file:///b.jpg', width: 1, height: 1 } } });
    expect(sessionUris([card], [])).toEqual(expect.arrayContaining(['file:///f.jpg', 'file:///b.jpg']));
  });
});

describe('sizeChoice', () => {
  const { SIZE_CHOICES, SIZE_QUALITY, sizeChoiceOf } = require('../sizeChoice') as typeof import('../sizeChoice');
  it('round-trips each choice and maps every slider level to one', () => {
    for (const choice of SIZE_CHOICES) expect(sizeChoiceOf(SIZE_QUALITY[choice])).toBe(choice);
    expect([1, 2, 3, 4, 5].map(sizeChoiceOf)).toEqual(['small', 'small', 'medium', 'medium', 'original']);
  });
});
