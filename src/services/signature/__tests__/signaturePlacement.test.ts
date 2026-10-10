import { File, Paths } from 'expo-file-system';
import { makePng } from '../../../test/png';
import { applySignatureToPdf, buildPdfFromPages, pageDimensions, toSourcePage, type AcademicConfig, type PageSizeId } from '../../pdf/pdfService';
import { applyMatrix, type Matrix } from '../../pdf/rotation';
import { applySignatureToDocument } from '../../persistence/libraryOperations';
import type { LibraryDocument, LibraryPage, PageLayout, PageRotation } from '../../../types/models';
import { signTargets, signatureDraw, type SignaturePlacement } from '../signaturePlacement';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');

type Fixture = {
  content: number;
  layout?: 'standard' | '2_in_1';
  size?: PageSizeId;
  cover?: 'template' | 'imported_image';
  pageLayout?: PageLayout;
  // A library page (its index, cover included) turned after saving.
  turned?: { idx: number; rotation: PageRotation };
};

let made = 0;

// A scan as Deliver saves it: a real document.pdf from buildPdfFromPages, and the library pages
// that go with it (the cover, when there is one, is library page 0).
async function scan(fixture: Fixture): Promise<LibraryDocument> {
  const id = `sig_${made++}`;
  const size = fixture.size ?? 'A4';
  const layout = fixture.layout ?? 'standard';
  const image = new File(Paths.cache, `${id}.png`);
  image.write(makePng(20, 28));
  const dims = fixture.pageLayout === 'fullPage' ? { width: 1654, height: 2339 } : { width: 1000, height: 1400 };
  const paper = pageDimensions(size);
  // A template cover's library page is a picture of the whole sheet; an imported one is the photo.
  const cover: LibraryPage[] = !fixture.cover
    ? []
    : [{ id: `${id}_cover`, fileUri: image.uri, width: 1000, height: fixture.cover === 'template' ? Math.round((1000 * paper.height) / paper.width) : 1400 }];
  const content: LibraryPage[] = Array.from({ length: fixture.content }, (_, i) => ({ id: `${id}_p${i}`, fileUri: image.uri, ...dims, layout: fixture.pageLayout }));
  const pages = [...cover, ...content].map((page, i) => (fixture.turned?.idx === i ? { ...page, rotation: fixture.turned.rotation } : page));
  const academic: AcademicConfig | undefined = !fixture.cover
    ? undefined
    : {
        enableBorder: false,
        coverPage:
          fixture.cover === 'template'
            ? { mode: 'template', templateId: 'simple', values: { title: 'Lab report' } }
            : { mode: 'imported_image', importedUri: image.uri },
      };
  const pdf = await buildPdfFromPages(id, pages.slice(cover.length).map(toSourcePage), 'as-is', academic, layout, size);
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
    coverKind: fixture.cover,
    pdfLayout: layout,
    pdfPageSize: size,
  };
}

function signatureFile(name = 'saved.png'): string {
  const file = new File(Paths.cache, 'signature', name);
  file.write(makePng(30, 10));
  return file.uri;
}

// A after B.
function compose(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

// The matrix each image on a PDF page (1-based) is painted with, in drawing order, read back by
// pdf.js: it carries the image's unit square (origin bottom-left) onto the page. So this is where
// the builder really put a page's picture, and where the signature really went.
async function drawnImages(uri: string, pdfPage: number): Promise<Matrix[]> {
  const pdf = await pdfjs.getDocument({ data: await new File(uri).bytes(), verbosity: 0, disableFontFace: true }).promise;
  const ops = await (await pdf.getPage(pdfPage)).getOperatorList();
  const stack: Matrix[] = [];
  let ctm: Matrix = [1, 0, 0, 1, 0, 0];
  const out: Matrix[] = [];
  (ops.fnArray as number[]).forEach((fn, i) => {
    if (fn === pdfjs.OPS.save) stack.push(ctm);
    else if (fn === pdfjs.OPS.restore) ctm = stack.pop() ?? ctm;
    else if (fn === pdfjs.OPS.transform) ctm = compose(ctm, ops.argsArray[i] as Matrix);
    else if (fn === pdfjs.OPS.paintImageXObject) out.push(ctm);
  });
  return out;
}

async function pageCount(uri: string): Promise<number> {
  return (await pdfjs.getDocument({ data: await new File(uri).bytes(), verbosity: 0, disableFontFace: true }).promise).numPages;
}

type Point = { x: number; y: number };

function expectAt(actual: Point, expected: Point): void {
  expect(Math.abs(actual.x - expected.x)).toBeLessThanOrEqual(0.05);
  expect(Math.abs(actual.y - expected.y)).toBeLessThanOrEqual(0.05);
}

const placement: SignaturePlacement = { originX: 120, originY: 900, width: 400, height: 160 };

// Signs library page `idx` and checks the signature against the page's own picture on PDF page
// `pdfPage`: `nth` is which image of that PDF page it is (0, or 1 for a right column). The
// signature's three corners must be the placement's corners on that picture - which pins the
// position, the size and the turn at once, without going through pdfRectFor.
async function signAndCheck(doc: LibraryDocument, idx: number, pdfPage: number, nth: number): Promise<LibraryDocument> {
  const before = await drawnImages(doc.pdfUri!, pdfPage);
  const signed = await applySignatureToDocument(doc, idx, signatureFile(), placement);
  const after = await drawnImages(signed.pdfUri!, pdfPage);
  expect(after).toHaveLength(before.length + 1);
  const picture = before[nth];
  const signature = after[after.length - 1];
  const page = doc.pages[idx];
  const on = (px: number, py: number) => applyMatrix(picture, px / page.width, 1 - py / page.height);
  expectAt(applyMatrix(signature, 0, 0), on(placement.originX, placement.originY + placement.height));
  expectAt(applyMatrix(signature, 1, 0), on(placement.originX + placement.width, placement.originY + placement.height));
  expectAt(applyMatrix(signature, 0, 1), on(placement.originX, placement.originY));
  return signed;
}

describe('signTargets', () => {
  it('standard: the one library page of that PDF page', async () => {
    const doc = await scan({ content: 3 });
    expect(signTargets(doc, 1)).toEqual([0]);
    expect(signTargets(doc, 3)).toEqual([2]);
  });

  it('2-in-1 with a cover: the cover alone, then two pages a sheet', async () => {
    const doc = await scan({ content: 3, layout: '2_in_1', cover: 'imported_image' });
    expect(signTargets(doc, 1)).toEqual([0]);
    expect(signTargets(doc, 2)).toEqual([1, 2]);
    // The odd last page has its sheet to itself.
    expect(signTargets(doc, 3)).toEqual([3]);
  });

  it('is empty for a PDF page with no library page, not the nearest one', async () => {
    const doc = await scan({ content: 2 });
    expect(signTargets(doc, 5)).toEqual([]);
    expect(signTargets({ ...doc, pages: [] }, 1)).toEqual([]);
  });
});

describe('signatureDraw', () => {
  it('standard: on its own PDF page, unturned, where the page picture has it', async () => {
    const doc = await scan({ content: 3 });
    expect(signatureDraw(doc, 1, placement)).toMatchObject({ pageIndex: 1, rotate: 0 });
    await signAndCheck(doc, 1, 2, 0);
  });

  it('standard on Letter paper', async () => {
    await signAndCheck(await scan({ content: 2, size: 'Letter' }), 1, 2, 0);
  });

  it('a template cover fills its sheet: the placement scales to the whole page', async () => {
    const doc = await scan({ content: 2, cover: 'template' });
    expect(signatureDraw(doc, 0, placement)).toMatchObject({ pageIndex: 0, rotate: 0 });
    // The cover is drawn text, not a picture: nothing to compare with but the paper itself.
    expect(await drawnImages(doc.pdfUri!, 1)).toHaveLength(0);
    const signed = await applySignatureToDocument(doc, 0, signatureFile(), placement);
    const [signature] = await drawnImages(signed.pdfUri!, 1);
    const paper = pageDimensions('A4');
    const scale = paper.width / doc.pages[0].width;
    expectAt(applyMatrix(signature, 0, 0), { x: placement.originX * scale, y: paper.height - (placement.originY + placement.height) * scale });
    expectAt(applyMatrix(signature, 1, 1), { x: (placement.originX + placement.width) * scale, y: paper.height - placement.originY * scale });
  });

  it('the page after a cover is PDF page 2', async () => {
    const doc = await scan({ content: 2, cover: 'template' });
    expect(signatureDraw(doc, 1, placement)).toMatchObject({ pageIndex: 1, rotate: 0 });
    await signAndCheck(doc, 1, 2, 0);
  });

  it('an imported-image cover is a picture inside the margins, like any page', async () => {
    const doc = await scan({ content: 2, cover: 'imported_image' });
    expect(signatureDraw(doc, 0, placement)).toMatchObject({ pageIndex: 0, rotate: 0 });
    await signAndCheck(doc, 0, 1, 0);
  });

  it.each<[string, number, number, number]>([
    ['left', 2, 2, 0],
    ['right', 3, 2, 1],
  ])('2-in-1: the %s column of its sheet', async (_slot, idx, pdfPage, nth) => {
    const doc = await scan({ content: 5, layout: '2_in_1' });
    expect(signatureDraw(doc, idx, placement)).toMatchObject({ pageIndex: pdfPage - 1, rotate: 0 });
    await signAndCheck(doc, idx, pdfPage, nth);
  });

  // The plan's device check: page 3 of a 2-in-1 scan with a cover is the right column of sheet 2.
  it('2-in-1 with a cover: page 3 is signed on sheet 2, and only there', async () => {
    const doc = await scan({ content: 4, layout: '2_in_1', cover: 'imported_image', size: 'Letter' });
    const others = [await drawnImages(doc.pdfUri!, 1), await drawnImages(doc.pdfUri!, 3)];
    const signed = await signAndCheck(doc, 2, 2, 1);
    expect(await pageCount(signed.pdfUri!)).toBe(3);
    expect([await drawnImages(signed.pdfUri!, 1), await drawnImages(signed.pdfUri!, 3)]).toEqual(others);
    // Only the PDF changed: the pages, and so the masters, are the same.
    expect(signed.pages).toBe(doc.pages);
  });

  it.each<[PageRotation, number]>([
    [90, 270],
    [180, 180],
    [270, 90],
  ])('2-in-1, a column turned %i°: the signature turns with the page', async (rotation, rotate) => {
    const doc = await scan({ content: 4, layout: '2_in_1', turned: { idx: 3, rotation } });
    const draw = signatureDraw(doc, 3, placement)!;
    expect(draw).toMatchObject({ pageIndex: 1, rotate });
    // Its own size, not the turned box's: wider than tall, as it was drawn.
    expect(draw.width / draw.height).toBeCloseTo(placement.width / placement.height, 5);
    await signAndCheck(doc, 3, 2, 1);
  });

  it('a turned standard page keeps its own space: /Rotate turns the signature with it', async () => {
    const doc = await scan({ content: 2, turned: { idx: 1, rotation: 90 } });
    expect(signatureDraw(doc, 1, placement)).toMatchObject({ pageIndex: 1, rotate: 0 });
    await signAndCheck(doc, 1, 2, 0);
  });

  it.each<PageSizeId>(['A4', 'Letter'])("'fullPage' (a true-size ID page) on %s", async (size) => {
    const doc = await scan({ content: 1, pageLayout: 'fullPage', size });
    expect(signatureDraw(doc, 0, placement)).toMatchObject({ pageIndex: 0, rotate: 0 });
    await signAndCheck(doc, 0, 1, 0);
  });

  it('is null for a page that does not exist', async () => {
    const doc = await scan({ content: 1 });
    expect(signatureDraw(doc, 4, placement)).toBeNull();
    await expect(applySignatureToDocument(doc, 4, signatureFile(), placement)).rejects.toThrow();
  });
});

describe('applySignatureToPdf', () => {
  it('leaves the signature file alone, so the saved signature works again', async () => {
    const doc = await scan({ content: 1 });
    const saved = signatureFile('reused.png');
    const draw = signatureDraw(doc, 0, placement)!;
    await applySignatureToPdf(doc.id, doc.pdfUri!, saved, draw);
    expect(new File(saved).exists).toBe(true);
    await applySignatureToPdf(doc.id, doc.pdfUri!, saved, { ...draw, y: draw.y + 200 });
    expect(new File(saved).exists).toBe(true);
    // The page's picture and both signatures.
    expect(await drawnImages(doc.pdfUri!, 1)).toHaveLength(3);
  });
});
