import { File, Paths } from 'expo-file-system';
import { PDFDict, PDFDocument, PDFName, degrees } from 'pdf-lib';
import { makePng } from '../../../test/png';
import { makeEncryptedPdf, makeTextPdf, pdfPageTexts } from '../../../test/pdfs';
import { PdfEncryptedError } from '../pdfErrors';
import {
  deletePages,
  extractPages,
  loadPdf,
  mergePdfs,
  reorderPages,
  setRotation,
  shownRectToPage,
  splitPdf,
  stampImage,
} from '../pdfOps';

const out = (name: string) => new File(Paths.cache, 'out', `${name}_${Math.random().toString(36).slice(2)}.pdf`);

describe('pdfOps', () => {
  it('merges whole sources and chosen pages, keeping the text', async () => {
    const a = await makeTextPdf(['A1', 'A2', 'A3']);
    const b = await makeTextPdf(['B1', 'B2']);
    const merged = await mergePdfs([{ uri: a }, { uri: b, pages: [1] }], out('merged'));
    expect(merged.pageCount).toBe(4);
    expect(merged.pagesPerSource).toEqual([3, 1]);
    expect(await pdfPageTexts(merged.uri)).toEqual(['A1', 'A2', 'A3', 'B2']);
  });

  it('extracts, deletes and reorders pages', async () => {
    const src = await makeTextPdf(['P1', 'P2', 'P3', 'P4']);
    expect(await pdfPageTexts((await extractPages(src, [3, 0], out('x'))).uri)).toEqual(['P4', 'P1']);
    expect(await pdfPageTexts((await deletePages(src, [1, 2], out('d'))).uri)).toEqual(['P1', 'P4']);
    expect(await pdfPageTexts((await reorderPages(src, [2, 0, 3, 1], out('r'))).uri)).toEqual(['P3', 'P1', 'P4', 'P2']);
  });

  it('refuses bad page lists', async () => {
    const src = await makeTextPdf(['P1', 'P2']);
    await expect(extractPages(src, [2], out('x'))).rejects.toThrow(RangeError);
    await expect(deletePages(src, [0, 1], out('d'))).rejects.toThrow(RangeError);
    await expect(reorderPages(src, [0, 0], out('r'))).rejects.toThrow(RangeError);
  });

  it('sets /Rotate losslessly, in place', async () => {
    const src = await makeTextPdf(['P1', 'P2']);
    const result = await setRotation(src, 1, -90, new File(src));
    expect(result.uri).toBe(src);
    const pdf = await PDFDocument.load(await new File(src).bytes());
    expect(pdf.getPage(0).getRotation().angle).toBe(0);
    expect(pdf.getPage(1).getRotation().angle).toBe(270);
    expect(await pdfPageTexts(src)).toEqual(['P1', 'P2']);
    await expect(setRotation(src, 0, 45, out('bad'))).rejects.toThrow(RangeError);
  });

  it('splits into one file per page, loading the source once', async () => {
    const src = await makeTextPdf(['S1', 'S2', 'S3']);
    const files = await splitPdf(src, (i) => out(`split${i}`));
    expect(files.map((f) => f.pageCount)).toEqual([1, 1, 1]);
    expect(await Promise.all(files.map(async (f) => (await pdfPageTexts(f.uri))[0]))).toEqual(['S1', 'S2', 'S3']);
  });

  it('fails on an encrypted PDF with a typed error', async () => {
    const locked = await makeEncryptedPdf();
    await expect(loadPdf(locked)).rejects.toBeInstanceOf(PdfEncryptedError);
    await expect(mergePdfs([{ uri: locked }], out('m'))).rejects.toBeInstanceOf(PdfEncryptedError);
    await expect(setRotation(locked, 0, 90, out('s'))).rejects.toBeInstanceOf(PdfEncryptedError);
  });
});

describe('shownRectToPage', () => {
  // A 600 × 800 pt page; the rect is the shown page's top-left quarter.
  const quarter = { x: 0, y: 0, width: 0.5, height: 0.5 };
  async function pageTurned(angle: number) {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([600, 800]);
    page.setRotation(degrees(angle));
    return page;
  }

  it.each([
    // Not turned: top-left of the page as drawn.
    [0, { x: 0, y: 400, width: 300, height: 400 }],
    // Shown turned clockwise: the shown top-left is the page's bottom-left.
    [90, { x: 0, y: 0, width: 300, height: 400 }],
    [180, { x: 300, y: 0, width: 300, height: 400 }],
    [270, { x: 300, y: 400, width: 300, height: 400 }],
  ])('maps the shown top-left quarter on a page turned %i°', async (angle, expected) => {
    expect(shownRectToPage(await pageTurned(angle), quarter)).toEqual({ ...expected, rotate: angle });
  });

  it('allows for a media box that does not start at 0,0', async () => {
    const page = await pageTurned(0);
    page.setMediaBox(50, 100, 600, 800);
    expect(shownRectToPage(page, quarter)).toMatchObject({ x: 50, y: 500 });
  });
});

describe('stampImage', () => {
  it('adds the image to one page and keeps the text', async () => {
    const src = await makeTextPdf(['Sign here', 'Other page']);
    const png = new File(Paths.cache, 'sig.png');
    png.write(makePng(40, 20));
    const result = await stampImage(src, 0, png.uri, { x: 0.5, y: 0.8, width: 0.3, height: 0.1 }, out('signed'));
    expect(result.pageCount).toBe(2);
    expect(await pdfPageTexts(result.uri)).toEqual(['Sign here', 'Other page']);
    const pdf = await PDFDocument.load(await new File(result.uri).bytes());
    const images = (page: number) => pdf.getPage(page).node.Resources()?.lookupMaybe(PDFName.of('XObject'), PDFDict)?.keys().length ?? 0;
    expect(images(0)).toBe(1);
    expect(images(1)).toBe(0);
    // The signature file is left alone (it may be the saved, reusable one).
    expect(png.exists).toBe(true);
  });
});
