import { File, Paths } from 'expo-file-system';
import { PDFDocument, PDFName, type PDFDict } from 'pdf-lib';
import { installFakeShaper, makeFakeShaper } from '../../../test/fakeShaper';
import { makePng } from '../../../test/png';
import type { CoverValues } from '../coverTemplates';
import { buildPdfFromPages } from '../pdfService';
import { helveticaWidth, measureText, needsShaping, setTextShaper } from '../visibleText';

jest.mock('../../enhance/skiaEnhance', () => ({ renderPage: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');

const BANGLA = 'রহিম আহমেদ';
const HINDI = 'राहुल शर्मा';
const CHINESE = '王芳';

describe('needsShaping', () => {
  it('is false for anything Helvetica draws, true for any other script', () => {
    expect(needsShaping('Café Œuvre – “quoted” €5')).toBe(false);
    for (const text of [BANGLA, HINDI, CHINESE, 'Łukasz Żółć', 'CSE 101 · রহিম']) expect(needsShaping(text)).toBe(true);
  });
});

describe('measureText', () => {
  let shaper: ReturnType<typeof installFakeShaper>['shaper'];
  let uninstall: () => void;
  beforeEach(() => ({ shaper, uninstall } = installFakeShaper()));
  afterEach(() => uninstall());

  it('uses Helvetica metrics for WinAnsi text, without shaping', () => {
    expect(measureText('Rahim', 12, false)).toBe(helveticaWidth('Rahim', 12, false));
    expect(shaper.measure).not.toHaveBeenCalled();
  });

  it('measures mixed text as one shaped run', () => {
    expect(measureText(`CSE 101 ${BANGLA}`, 10, true)).toBeCloseTo([...`CSE 101 ${BANGLA}`].length * 0.6 * 10);
    expect(shaper.measure).toHaveBeenCalledWith(`CSE 101 ${BANGLA}`, 10, true);
  });

  it("falls back to Helvetica's '?' width when shaping fails", () => {
    const undo = setTextShaper({
      ...makeFakeShaper(),
      measure: () => {
        throw new Error('no Skia');
      },
    });
    jest.spyOn(console, 'warn').mockImplementationOnce(() => {});
    expect(measureText('রহিম', 12, false)).toBe(helveticaWidth('????', 12, false));
    undo();
  });
});

// --- In the built PDF -------------------------------------------------------------------------

async function build(cover: CoverValues, footerText?: string): Promise<{ uri: string; bytes: Uint8Array }> {
  const image = new File(Paths.cache, `page_${Math.random()}.png`);
  image.write(makePng(20, 28));
  const { uri } = await buildPdfFromPages(
    `doc_${Math.random().toString(36).slice(2)}`,
    [{ uri: image.uri, width: 1000, height: 1400 }],
    'as-is',
    { enableBorder: false, footerText, coverPage: { mode: 'template', templateId: 'assignment', values: cover } }
  );
  return { uri, bytes: await new File(uri).bytes() };
}

async function pageText(bytes: Uint8Array, pageIndex: number): Promise<string> {
  const doc = await pdfjs.getDocument({ data: bytes, verbosity: 0, disableFontFace: true }).promise;
  const content = await (await doc.getPage(pageIndex + 1)).getTextContent();
  // pdf.js splits a run into separate items at (wide) spaces; join and collapse them back.
  return (content.items as { str: string }[])
    .map((item) => item.str)
    .join(' ')
    .replace(/\s+/g, ' ');
}

async function imageCount(bytes: Uint8Array, pageIndex: number): Promise<number> {
  const pdfDoc = await PDFDocument.load(bytes);
  const resources = pdfDoc.getPages()[pageIndex].node.Resources();
  const xObjects = resources?.lookupMaybe(PDFName.of('XObject'), Object as unknown as typeof PDFDict) as PDFDict | undefined;
  return xObjects ? xObjects.keys().length : 0;
}

describe('visible text in the PDF', () => {
  let shaper: ReturnType<typeof installFakeShaper>['shaper'];
  let uninstall: () => void;
  beforeEach(() => ({ shaper, uninstall } = installFakeShaper()));
  afterEach(() => uninstall());

  it('draws a Bangla, Hindi or Chinese name as an image, with the name searchable over it', async () => {
    for (const name of [BANGLA, HINDI, CHINESE]) {
      const { bytes } = await build({ name, courseCode: 'CSE 101', docLabel: 'Assignment 1' });
      expect(await imageCount(bytes, 0)).toBeGreaterThan(0);
      const text = await pageText(bytes, 0);
      expect(text).toContain(`Name: ${name}`);
      expect(text).not.toContain('?');
    }
  });

  it('rasterizes at 300 dpi', async () => {
    await build({ name: BANGLA });
    expect(shaper.rasterize).toHaveBeenCalledWith(`Name: ${BANGLA}`, 12, false, 300 / 72);
  });

  it('keeps an English-only cover as vector text, with no image and no shaping', async () => {
    const { bytes } = await build({ name: 'Rahim Ahmed', courseCode: 'CSE 101', docLabel: 'Assignment 1' });
    expect(await imageCount(bytes, 0)).toBe(0);
    expect(await pageText(bytes, 0)).toContain('Name: Rahim Ahmed');
    expect(shaper.rasterize).not.toHaveBeenCalled();
  });

  it('draws a footer in any script on every content page, searchable', async () => {
    const { bytes } = await build({ name: 'Rahim' }, `${BANGLA} · {X}/{Y}`);
    expect(await pageText(bytes, 1)).toContain(`${BANGLA} · 1/1`);
  });

  it("still makes the text searchable when shaping fails, drawing Helvetica's '?' instead", async () => {
    shaper.rasterize.mockImplementation(() => {
      throw new Error('no Skia');
    });
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { bytes } = await build({ name: BANGLA });
    const text = await pageText(bytes, 0);
    expect(text).toContain(`Name: ${BANGLA}`);
    expect(text).toContain('Name: ???? ?????');
    (console.warn as jest.Mock).mockRestore();
  });
});
