import { File, Paths } from 'expo-file-system';
import { makePng } from '../../../test/png';
import { ID_CANVAS_HEIGHT, ID_CANVAS_WIDTH, idCardPlacements } from '../../enhance/idCardLayout';
import { buildPdfFromPages } from '../pdfService';

jest.mock('../../enhance/skiaEnhance', () => ({ renderPage: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');

const MM_PER_PT = 25.4 / 72;

// Puts an invisible OCR "line" exactly over the front card's slot on a full-page ID canvas, then
// measures where pdf.js finds that text: it's drawn with the same transform as the image, so its
// width on paper is the printed card's width.
async function printedCardWidthMm(layout: 'fullPage' | undefined): Promise<{ widthMm: number; heightMm: number }> {
  const { front } = idCardPlacements({ width: 1712, height: 1080 });
  const bounding = { left: front.origin.x, top: front.origin.y, width: front.width, height: front.height };
  const image = new File(Paths.cache, `idcard_${layout}.png`);
  image.write(makePng(16, 23));
  const { uri } = await buildPdfFromPages(
    `doc_${layout}`,
    [
      {
        uri: image.uri,
        width: ID_CANVAS_WIDTH,
        height: ID_CANVAS_HEIGHT,
        layout,
        ocr: { text: 'CARD', blocks: [{ text: 'CARD', bounding, lines: [{ text: 'CARD', bounding }] }] },
      },
    ],
    'as-is'
  );
  const doc = await pdfjs.getDocument({ data: await new File(uri).bytes(), verbosity: 0 }).promise;
  const [item] = (await (await doc.getPage(1)).getTextContent()).items as { width: number; height: number }[];
  return { widthMm: item.width * MM_PER_PT, heightMm: item.height * MM_PER_PT };
}

describe("'fullPage' layout", () => {
  it('prints an ID card canvas at true size (85.6 x 54 mm, within 1 mm)', async () => {
    const { widthMm, heightMm } = await printedCardWidthMm('fullPage');
    expect(Math.abs(widthMm - 85.6)).toBeLessThanOrEqual(1);
    expect(Math.abs(heightMm - 54)).toBeLessThanOrEqual(1);
  });

  it('is needed: the normal margin layout would shrink the card by about 8 %', async () => {
    const { widthMm } = await printedCardWidthMm(undefined);
    expect(widthMm).toBeLessThan(85.6 - 5);
  });
});
