import { File } from 'expo-file-system';
import { PDFDocument, degrees } from 'pdf-lib';
import { makeTextPdf } from '../../../test/pdfs';
import { decoratePdf } from '../pdfService';
import { applyMatrix, boxMatrix, normalizeRotation, shownSpaceMatrix, turnedSize } from '../rotation';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');

describe('rotation helpers', () => {
  it('normalizes turns', () => {
    expect([0, 90, -90, 450, 360].map(normalizeRotation)).toEqual([0, 90, 270, 90, 0]);
    expect(turnedSize(3, 4, 90)).toEqual({ width: 4, height: 3 });
  });

  it('boxMatrix puts the unturned drawing into the box, turned clockwise', () => {
    const box = { x: 10, y: 20, width: 40, height: 30 };
    // Turned 90°: the drawing is 30 wide, 40 high; its top-left corner ends up top-right.
    const m = boxMatrix(box, 90);
    expect(applyMatrix(m, 0, 40)).toEqual({ x: 50, y: 50 });
    expect(applyMatrix(m, 0, 0)).toEqual({ x: 10, y: 50 });
    expect(applyMatrix(m, 30, 0)).toEqual({ x: 10, y: 20 });
  });

  it('shownSpaceMatrix maps the shown bottom-left to where a turned page has it', () => {
    // 600 × 800 page shown turned 90° (800 wide, 600 high): shown bottom-left is the page's bottom-right.
    expect(applyMatrix(shownSpaceMatrix(600, 800, 90), 0, 0)).toEqual({ x: 600, y: 0 });
    expect(applyMatrix(shownSpaceMatrix(600, 800, 270), 0, 0)).toEqual({ x: 0, y: 800 });
    expect(applyMatrix(shownSpaceMatrix(600, 800, 180), 0, 0)).toEqual({ x: 600, y: 800 });
  });
});

describe('decoratePdf on a turned page', () => {
  it('puts the footer along the edge the reader sees as the bottom', async () => {
    const uri = await makeTextPdf(['Body']);
    const pdf = await PDFDocument.load(await new File(uri).bytes());
    pdf.getPage(0).setRotation(degrees(90));
    await decoratePdf(pdf, { enableBorder: false, footerText: 'FOOTER {X}/{Y}' });
    const doc = await pdfjs.getDocument({ data: await pdf.save(), verbosity: 0, disableFontFace: true }).promise;
    const items = (await (await doc.getPage(1)).getTextContent()).items as { str: string; transform: number[] }[];
    const footer = items.find((i) => i.str.includes('FOOTER'))!;
    // Shown 792 wide: 30 pt up from the shown bottom is 30 pt in from the page's right edge
    // (x = 612 − 30), and the text runs up the page.
    expect(footer.transform[4]).toBeCloseTo(612 - 30, 0);
    expect(footer.transform[1]).toBeGreaterThan(0);
  });
});
