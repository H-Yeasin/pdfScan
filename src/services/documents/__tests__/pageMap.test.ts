import { File, Paths } from 'expo-file-system';
import MlkitOcr from 'rn-mlkit-ocr';
import { makePng } from '../../../test/png';
import { runOcr } from '../../ocr/ocrService';
import { buildPdfFromPages, type PageSizeId } from '../../pdf/pdfService';
import type { LibraryDocument, LibraryPage, PageLayout, PageRotation } from '../../../types/models';
import { libraryIdxFor, pdfPageCount, pdfPageFor, pdfRectFor } from '../pageMap';
import { backfillPdfInfo } from '../pdfInfoBackfill';

jest.mock('../../enhance/skiaEnhance', () => ({ renderPage: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');

function pages(n: number, size = { width: 1000, height: 1400 }): LibraryPage[] {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i}`, fileUri: `file:///p${i}.jpg`, ...size }));
}

function doc(overrides: Partial<LibraryDocument>): LibraryDocument {
  return {
    id: 'd',
    name: 'Doc',
    format: 'PDF',
    mode: 'doc',
    pages: pages(5),
    sizeBytes: 0,
    createdAt: 0,
    star: false,
    locked: false,
    ...overrides,
  } as LibraryDocument;
}

describe('pdfPageFor / libraryIdxFor', () => {
  it('standard: one library page per PDF page', () => {
    const d = doc({ pdfLayout: 'standard' });
    expect([0, 1, 4].map((i) => pdfPageFor(d, i))).toEqual([
      { page: 1, slot: 'full' },
      { page: 2, slot: 'full' },
      { page: 5, slot: 'full' },
    ]);
    expect(pdfPageCount(d)).toBe(5);
    expect(libraryIdxFor(d, 3)).toBe(2);
    // An unknown layout reads as standard.
    expect(pdfPageFor(doc({}), 2)).toEqual({ page: 3, slot: 'full' });
  });

  it('a cover is PDF page 1 on its own', () => {
    const d = doc({ coverKind: 'template', pdfLayout: 'standard' });
    expect(pdfPageFor(d, 0)).toEqual({ page: 1, slot: 'full' });
    expect(pdfPageFor(d, 1)).toEqual({ page: 2, slot: 'full' });
    expect(libraryIdxFor(d, 1)).toBe(0);
    expect(libraryIdxFor(d, 2)).toBe(1);
  });

  it('2-in-1 puts two content pages on a sheet, an odd last one on the left', () => {
    const d = doc({ pdfLayout: '2_in_1' });
    expect([0, 1, 2, 3, 4].map((i) => pdfPageFor(d, i))).toEqual([
      { page: 1, slot: 'left' },
      { page: 1, slot: 'right' },
      { page: 2, slot: 'left' },
      { page: 2, slot: 'right' },
      { page: 3, slot: 'left' },
    ]);
    expect(pdfPageCount(d)).toBe(3);
    expect(libraryIdxFor(d, 2, 0.8)).toBe(3);
    expect(libraryIdxFor(d, 3, 0.8)).toBe(4); // no right page on the last sheet: clamps
  });

  it('2-in-1 with a cover keeps the cover on its own page', () => {
    const d = doc({ coverKind: 'imported_image', pdfLayout: '2_in_1', pages: pages(4) });
    expect([0, 1, 2, 3].map((i) => pdfPageFor(d, i))).toEqual([
      { page: 1, slot: 'full' },
      { page: 2, slot: 'left' },
      { page: 2, slot: 'right' },
      { page: 3, slot: 'left' },
    ]);
    expect(pdfPageCount(d)).toBe(3);
    expect(libraryIdxFor(d, 2, 0.9)).toBe(2);
  });
});

// Builds a real PDF with one OCR "word" at `rect` on library page `idx`, and finds where pdf.js
// says that text is: the builder draws the text layer with the same placement as the image.
async function builtTextBox(layout: 'standard' | '2_in_1', size: PageSizeId, n: number, idx: number, pageLayout?: PageLayout, rotation?: PageRotation) {
  const rect = { left: 120, top: 300, width: 500, height: 60 };
  const image = new File(Paths.cache, `pm_${Math.random()}.png`);
  image.write(makePng(20, 28));
  const dims = pageLayout === 'fullPage' ? { width: 1654, height: 2339 } : { width: 1000, height: 1400 };
  const lib = pages(n, dims).map((p, i) => ({ ...p, layout: pageLayout, rotation: i === idx ? rotation : undefined }));
  const src = lib.map((p, i) => ({
    rotation: p.rotation,
    uri: image.uri,
    width: p.width,
    height: p.height,
    layout: p.layout,
    ocr: i === idx ? { text: 'WORD', blocks: [{ text: 'WORD', bounding: rect, lines: [{ text: 'WORD', bounding: rect }] }] } : undefined,
  }));
  const { uri } = await buildPdfFromPages(`pm_${Math.random().toString(36).slice(2)}`, src, 'as-is', undefined, layout, size);
  const d = doc({ pages: lib, pdfLayout: layout, pdfPageSize: size });
  const expected = pdfRectFor(d, idx, rect)!;
  const pdf = await pdfjs.getDocument({ data: await new File(uri).bytes(), verbosity: 0, disableFontFace: true }).promise;
  const content = await (await pdf.getPage(expected.page)).getTextContent();
  const item = (content.items as { str: string; transform: number[]; width: number; height: number }[]).find((i) => i.str.includes('WORD'))!;
  return { expected, actual: { x: item.transform[4], y: item.transform[5], width: item.width, height: item.height } };
}

describe('pdfRectFor', () => {
  it.each<['standard' | '2_in_1', PageSizeId, number, number, PageLayout | undefined]>([
    ['standard', 'A4', 3, 1, undefined],
    ['standard', 'Letter', 1, 0, 'fullPage'],
    ['2_in_1', 'A4', 3, 1, undefined],
    ['2_in_1', 'Letter', 3, 2, undefined],
  ])('%s %s: lands where the builder draws it', async (layout, size, n, idx, pageLayout) => {
    const { expected, actual } = await builtTextBox(layout, size, n, idx, pageLayout);
    expect(Math.abs(actual.x - expected.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(actual.y - expected.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(actual.width - expected.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(actual.height - expected.height)).toBeLessThanOrEqual(1);
  });

  it('is null for a page that does not exist', () => {
    expect(pdfRectFor(doc({}), 9, { left: 0, top: 0, width: 1, height: 1 })).toBeNull();
  });

  // §7 R3. A standard page turns through /Rotate, which leaves its own space alone: the text is
  // where it was. In a 2-in-1 column the page is drawn turned, and the text with it; pdfjs gives
  // the start of the text's baseline, which is the box's top-left corner turned 90° clockwise and
  // its bottom-right corner turned 270°.
  it('standard, turned 90°: the text stays where the unturned page has it', async () => {
    const { expected, actual } = await builtTextBox('standard', 'A4', 2, 1, undefined, 90);
    expect(Math.abs(actual.x - expected.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(actual.y - expected.y)).toBeLessThanOrEqual(1);
  });

  it.each<[PageRotation, (r: { x: number; y: number; width: number; height: number }) => { x: number; y: number }]>([
    [90, (r) => ({ x: r.x, y: r.y + r.height })],
    [180, (r) => ({ x: r.x + r.width, y: r.y + r.height })],
    [270, (r) => ({ x: r.x + r.width, y: r.y })],
  ])('2-in-1, turned %i°: the box turns with the page', async (rotation, baselineStart) => {
    const { expected, actual } = await builtTextBox('2_in_1', 'A4', 2, 1, undefined, rotation);
    const corner = baselineStart(expected);
    expect(Math.abs(actual.x - corner.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(actual.y - corner.y)).toBeLessThanOrEqual(1);
    // Turned on its side, a wide line becomes a tall box.
    if (rotation !== 180) expect(expected.height).toBeGreaterThan(expected.width);
  });
});

describe('word-level OCR', () => {
  it('keeps ML Kit word boxes on each line', async () => {
    const frame = (x: number) => ({ x, y: 10, width: 40, height: 12 });
    (MlkitOcr.recognizeText as jest.Mock).mockResolvedValueOnce({
      text: 'Hello world',
      blocks: [
        {
          text: 'Hello world',
          frame: frame(0),
          lines: [{ text: 'Hello world', frame: frame(0), elements: [{ text: 'Hello', frame: frame(0) }, { text: 'world', frame: frame(50) }] }],
        },
      ],
    });
    const ocr = await runOcr('file:///x.jpg', 'latin');
    expect(ocr?.blocks[0].lines[0].words).toEqual([
      { text: 'Hello', bounding: { left: 0, top: 10, width: 40, height: 12 } },
      { text: 'world', bounding: { left: 50, top: 10, width: 40, height: 12 } },
    ]);
  });
});

describe('backfillPdfInfo', () => {
  it('reads the layout and paper from the PDF, and skips what it should', async () => {
    const image = new File(Paths.cache, 'bf.png');
    image.write(makePng(20, 28));
    const src = [0, 1, 2].map(() => ({ uri: image.uri, width: 1000, height: 1400 }));
    const twoUp = await buildPdfFromPages('bf_two', src, 'as-is', undefined, '2_in_1', 'Letter');
    const std = await buildPdfFromPages('bf_std', src.slice(0, 1), 'as-is', undefined, 'standard', 'A4');
    const patches = await backfillPdfInfo([
      doc({ id: 'two', pdfUri: twoUp.uri }),
      doc({ id: 'std', pdfUri: std.uri }),
      doc({ id: 'known', pdfUri: std.uri, pdfLayout: 'standard' }),
      doc({ id: 'imported', pdfUri: std.uri, sourceKind: 'imported_pdf' }),
      doc({ id: 'missing', pdfUri: 'file:///nope.pdf' }),
      doc({ id: 'docx', format: 'DOCX', pdfUri: std.uri }),
    ]);
    expect(patches).toEqual([
      { id: 'two', patch: { pdfLayout: '2_in_1', pdfPageSize: 'Letter' } },
      { id: 'std', patch: { pdfLayout: 'standard', pdfPageSize: 'A4' } },
    ]);
  });
});
