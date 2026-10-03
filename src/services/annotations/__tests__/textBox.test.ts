import { File, Paths } from 'expo-file-system';
import { degrees, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRawStream, PDFRef, PDFString, decodePDFRawStream } from 'pdf-lib';
import { makeDoc } from '../../../test/fixtures';
import type { Annotation, LibraryPage } from '../../../types/models';
import { setTextRaster } from '../../pdf/textAppearance';
import { annotationAt } from '../hitTest';
import { DEFAULT_MARK, moveBox, normalizeMark, textBoxAt, textSizeFor } from '../markMode';
import { removeOurAnnotations, updatePdfAnnotations } from '../pdfAnnotations';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');

// §12 D10: Mark mode's Text tool. A text box is master pixels on the library page, written into
// the PDF as /FreeText with its own appearance.

const near = (got: number[], want: number[]) => got.forEach((v, i) => expect(Math.abs(v - want[i])).toBeLessThan(0.01));

// An imported PDF: page 1 upright, page 2 with /Rotate 90 (3 master px per point, as R1 indexes).
async function importedDoc() {
  const source = await PDFDocument.create();
  source.addPage([600, 800]);
  source.addPage([600, 800]).setRotation(degrees(90));
  const file = new File(Paths.cache, `textbox_${Math.random()}.pdf`);
  file.write(await source.save());
  const pages: LibraryPage[] = [
    { id: 'i1', fileUri: '', thumbUri: 'x', width: 1800, height: 2400 },
    { id: 'i2', fileUri: '', thumbUri: 'x', width: 2400, height: 1800 },
  ];
  return makeDoc({ id: 'doc_text', sourceKind: 'imported_pdf', pages, pdfUri: file.uri, pdfLayout: 'standard' });
}

function textBox(over: Partial<Annotation> & { box: { left: number; top: number; width: number; height: number }; size?: number }): Annotation {
  const { box, size = 36, ...rest } = over;
  return { id: `t_${Math.random().toString(36).slice(2)}`, documentId: 'doc_text', pageId: 'i1', kind: 'text', color: 'black', data: { box, size }, text: 'Name: Asha', createdAt: 1, updatedAt: 1, ...rest };
}

async function freeTexts(uri: string) {
  const pdf = await pdfjs.getDocument({ data: await new File(uri).bytes(), verbosity: 0, disableFontFace: true }).promise;
  const out: { page: number; rect: number[]; contents: string; viewportRect: number[] }[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1 });
    for (const a of await page.getAnnotations()) {
      if (a.subtype !== 'FreeText') continue;
      const [x1, y1, x2, y2] = viewport.convertToViewportRectangle(a.rect) as number[];
      out.push({ page: i, rect: a.rect, contents: a.contentsObj?.str ?? '', viewportRect: [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)] });
    }
  }
  return out;
}

async function appearanceOf(uri: string, pageIdx: number) {
  const pdfDoc = await PDFDocument.load(await new File(uri).bytes());
  const annots = pdfDoc.getPage(pageIdx).node.Annots()!;
  const dict = pdfDoc.context.lookup(annots.get(0)) as PDFDict;
  const normal = (dict.lookup(PDFName.of('AP')) as PDFDict).get(PDFName.of('N')) as PDFRef;
  const stream = pdfDoc.context.lookup(normal) as PDFRawStream;
  const content = new TextDecoder().decode(decodePDFRawStream(stream).decode());
  return { pdfDoc, dict, stream, content };
}

describe('§12 D10 text boxes in the PDF', () => {
  it('writes a /FreeText at the box, with the text, its font and colour', async () => {
    const doc = await importedDoc();
    const a = textBox({ box: { left: 300, top: 600, width: 600, height: 90 }, color: 'red' });
    await updatePdfAnnotations(doc, [a]);
    const [found] = await freeTexts(doc.pdfUri!);
    expect(found.contents).toBe('Name: Asha');
    // Points (100, 200) to (300, 230) from the top-left of the page.
    near(found.viewportRect, [100, 200, 300, 230]);

    const { dict, content } = await appearanceOf(doc.pdfUri!, 0);
    // 36 master px at 3 px per point: 12 pt Helvetica, in red.
    expect((dict.get(PDFName.of('DA')) as PDFString).decodeText()).toBe('/Helv 12 Tf 0.88 0.19 0.19 rg');
    expect(content).toContain('BT /Helv 12 Tf');
    expect(content).toContain('Tj ET');
    // No background or border.
    expect(dict.lookup(PDFName.of('C'))?.toString()).toBe('[ ]');
  });

  it('lands on the words on a turned page, and the text runs the way the page reads', async () => {
    const doc = await importedDoc();
    await updatePdfAnnotations(doc, [textBox({ pageId: 'i2', box: { left: 300, top: 600, width: 600, height: 90 } })]);
    const [found] = await freeTexts(doc.pdfUri!);
    expect(found.page).toBe(2);
    // As shown (turned a quarter): the same points from the top-left as on screen.
    near(found.viewportRect, [100, 200, 300, 230]);
    // The frame's x axis is the page's y axis in its own space (a quarter turn).
    const { content } = await appearanceOf(doc.pdfUri!, 1);
    expect(content.split('\n')[0]).toMatch(/^q 0 1 -1 0 /);
  });

  it('draws another script as a shaped image, keeping the text in /Contents', async () => {
    const undo = setTextRaster((_text, size, px) => {
      const width = Math.ceil(size * px * 2);
      const height = Math.ceil(size * px);
      return { width, height, alpha: new Uint8Array(width * height).fill(255), run: { width: width / px, ascent: (height * 0.8) / px, descent: (height * 0.2) / px } };
    });
    try {
      const doc = await importedDoc();
      await updatePdfAnnotations(doc, [textBox({ text: 'নাম: আশা\nRoll 12', box: { left: 300, top: 600, width: 600, height: 180 } })]);
      const { content, stream, dict } = await appearanceOf(doc.pdfUri!, 0);
      expect((dict.lookup(PDFName.of('Contents')) as PDFHexString).decodeText()).toBe('নাম: আশা\nRoll 12');
      // Line 1 is the image, line 2 Helvetica.
      expect(content).toContain('/Tx0 Do');
      expect(content).toContain('BT /Helv');
      const xobjects = (stream.dict.lookup(PDFName.of('Resources')) as PDFDict).lookup(PDFName.of('XObject')) as PDFDict;
      const image = stream.dict.context.lookup(xobjects.get(PDFName.of('Tx0'))) as PDFRawStream;
      expect(image.dict.get(PDFName.of('SMask'))).toBeInstanceOf(PDFRef);
    } finally {
      undo();
    }
  });

  it("doesn't leave the appearance's objects behind when the marks are written again", async () => {
    const undo = setTextRaster((_text, size, px) => ({ width: 4, height: 4, alpha: new Uint8Array(16), run: { width: 4 / px, ascent: 3 / px, descent: 1 / px } }));
    try {
      const doc = await importedDoc();
      const a = textBox({ text: 'আশা', box: { left: 300, top: 600, width: 600, height: 90 } });
      await updatePdfAnnotations(doc, [a]);
      // The shaped line's image and its mask, once (each save also keeps pdf-lib's old object
      // streams, which isn't the text box's doing).
      const images = async () =>
        (await PDFDocument.load(await new File(doc.pdfUri!).bytes())).context
          .enumerateIndirectObjects()
          .filter(([, o]) => o instanceof PDFRawStream && o.dict.get(PDFName.of('Subtype'))?.toString() === '/Image').length;
      expect(await images()).toBe(2);
      await updatePdfAnnotations(doc, [a]);
      expect(await images()).toBe(2);
      const pdfDoc = await PDFDocument.load(await new File(doc.pdfUri!).bytes());
      expect(removeOurAnnotations(pdfDoc)).toBe(1);
    } finally {
      undo();
    }
  });

  it('skips an empty text box', async () => {
    const doc = await importedDoc();
    await updatePdfAnnotations(doc, [textBox({ text: '  ', box: { left: 0, top: 0, width: 100, height: 40 } })]);
    expect(await freeTexts(doc.pdfUri!)).toEqual([]);
  });
});

describe('§12 D10 text boxes in Mark mode', () => {
  const page = { width: 1800, height: 2400 };
  const measure = (line: string, size: number) => line.length * size * 0.5;

  it('sizes the box to its longest line and keeps it on the page', () => {
    expect(textBoxAt(page, 'Roll 12\nName: Asha', { x: 100, y: 200 }, 40, measure)).toEqual({ left: 100, top: 200, width: 200 + 6, height: 96 });
    // Near the right and bottom edges it moves in.
    const box = textBoxAt(page, 'Name', { x: 1790, y: 2390 }, 40, measure);
    expect(box.left + box.width).toBeCloseTo(1800);
    expect(box.top + box.height).toBeCloseTo(2400);
    expect(moveBox(page, box, -5000, 10)).toMatchObject({ left: 0, top: box.top });
  });

  it('scales the font with the page width', () => {
    expect(textSizeFor({ width: 1800 }, 'medium')).toBe(40);
    expect(textSizeFor({ width: 900 }, 'medium')).toBe(20);
    expect(textSizeFor({ width: 1800 }, 'large')).toBeGreaterThan(textSizeFor({ width: 1800 }, 'small'));
  });

  it('remembers the Text tool, its colour and size', () => {
    expect(normalizeMark({ tool: 'text', textColor: 'blue', textSize: 'large' })).toMatchObject({ tool: 'text', textColor: 'blue', textSize: 'large' });
    expect(normalizeMark({ textColor: 'pink', textSize: 'huge' })).toMatchObject({ textColor: DEFAULT_MARK.textColor, textSize: DEFAULT_MARK.textSize });
  });

  it('finds a text box under a tap', () => {
    const a = textBox({ box: { left: 100, top: 100, width: 300, height: 50 } });
    expect(annotationAt([a], 390, 140, 5)?.id).toBe(a.id);
    expect(annotationAt([a], 500, 140, 5)).toBeNull();
  });
});
