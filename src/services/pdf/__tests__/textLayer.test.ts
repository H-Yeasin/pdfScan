import { File, Paths } from 'expo-file-system';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { makePng } from '../../../test/png';
import type { OcrBlock, PageOcr } from '../../../types/models';
import { buildPdfFromPages, toWinAnsiSafe } from '../pdfService';

jest.mock('../../enhance/skiaEnhance', () => ({ renderPage: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');

type TextItem = { str: string; transform: number[]; width: number; height: number };

type Line = { str: string; x: number; baseline: number; width: number; height: number };

// pdf.js splits a run into separate items at (wide) spaces, so items sharing a baseline are merged
// back into one line, in reading order.
async function extractLines(pdfUri: string): Promise<Line[]> {
  const data = await new File(pdfUri).bytes();
  const doc = await pdfjs.getDocument({ data, verbosity: 0, disableFontFace: true }).promise;
  const page = await doc.getPage(1);
  const content = await page.getTextContent();
  const items = (content.items as TextItem[]).filter((item) => item.str.trim().length > 0);
  const lines: Line[] = [];
  for (const item of items) {
    const [, , , , x, baseline] = item.transform;
    const line = lines.find((l) => Math.abs(l.baseline - baseline) < 0.5);
    if (!line) {
      lines.push({ str: item.str, x, baseline, width: item.width, height: item.height });
      continue;
    }
    line.str += ` ${item.str}`;
    line.width = Math.max(line.x + line.width, x + item.width) - Math.min(line.x, x);
    line.x = Math.min(line.x, x);
  }
  return lines;
}

const LINES = ['Café Œuvre', 'Łódź', '数学作业', '日本語', '한국어', 'गणित'];
const IMAGE_W = 1000;
const IMAGE_H = 1400;

function ocrFor(lines: string[]): PageOcr {
  const blocks: OcrBlock[] = lines.map((text, i) => {
    const bounding = { left: 100, top: 100 + i * 150, width: 600, height: 60 };
    return { text, bounding, lines: [{ text, bounding }] };
  });
  return { text: lines.join('\n'), blocks };
}

async function buildWith(ocr: PageOcr): Promise<string> {
  const image = new File(Paths.cache, `page_${Math.random()}.png`);
  image.write(makePng(20, 28));
  const { uri } = await buildPdfFromPages(`doc_${Math.random().toString(36).slice(2)}`, [
    { uri: image.uri, width: IMAGE_W, height: IMAGE_H, ocr },
  ], 'as-is');
  return uri;
}

describe('glyphless OCR text layer', () => {
  it('makes every script searchable and copyable, exactly', async () => {
    const lines = await extractLines(await buildWith(ocrFor(LINES)));
    expect(lines.map((l) => l.str)).toEqual(LINES);
  });

  it('places each text run within 2 pt of its OCR line box', async () => {
    const lines = await extractLines(await buildWith(ocrFor(LINES)));
    expect(lines).toHaveLength(LINES.length);

    // Same placement pdfService uses: A4 with a 24 pt margin, image fit inside it.
    const [a4w, a4h] = [595.28, 841.89];
    const margin = 24;
    const scale = Math.min((a4w - 2 * margin) / IMAGE_W, (a4h - 2 * margin) / IMAGE_H);
    const originX = margin + (a4w - 2 * margin - IMAGE_W * scale) / 2;
    const originY = margin + (a4h - 2 * margin - IMAGE_H * scale) / 2;

    lines.forEach((line, i) => {
      const box = { left: 100, top: 100 + i * 150, width: 600, height: 60 };
      const expectedX = originX + box.left * scale;
      const expectedBaseline = originY + IMAGE_H * scale - (box.top + box.height) * scale;
      expect(Math.abs(line.x - expectedX)).toBeLessThanOrEqual(2);
      expect(Math.abs(line.baseline - expectedBaseline)).toBeLessThanOrEqual(2);
      expect(Math.abs(line.width - box.width * scale)).toBeLessThanOrEqual(2);
      expect(Math.abs(line.height - box.height * scale)).toBeLessThanOrEqual(2);
    });
  });

  it('drops characters outside the BMP instead of failing the line', async () => {
    const lines = await extractLines(await buildWith(ocrFor(['ok 😀 done'])));
    expect(lines.map((l) => l.str.replace(/\s+/g, ' '))).toEqual(['ok done']);
  });

  it('keeps the embedded font tiny', async () => {
    const plain = await buildWith({ text: '', blocks: [] });
    const withText = await buildWith(ocrFor(LINES));
    expect(new File(withText).size - new File(plain).size).toBeLessThan(10_000);
  });
});

describe('toWinAnsiSafe', () => {
  it("replaces characters Helvetica can't encode with '?'", async () => {
    const font = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
    expect(toWinAnsiSafe('Café – Rahim রহিম 数学', font)).toBe('Café – Rahim ???? ??');
  });

  it('keeps a stamped export from throwing on non-Latin header text', async () => {
    const image = new File(Paths.cache, 'stamp.png');
    image.write(makePng(20, 28));
    await expect(
      buildPdfFromPages('doc_stamp', [{ uri: image.uri, width: 20, height: 28 }], 'as-is', {
        enableBorder: true,
        headerText: 'রসায়ন ল্যাব',
        footerText: 'পৃষ্ঠা {X} / {Y}',
        coverPage: { mode: 'template', templateId: 'simple', values: { title: '化学', name: 'Rahim' } },
      })
    ).resolves.toBeDefined();
  });
});
