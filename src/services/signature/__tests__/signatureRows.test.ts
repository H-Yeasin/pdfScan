import { Directory, File, Paths } from 'expo-file-system';
import { PDFDocument } from 'pdf-lib';
import { makeDoc } from '../../../test/fixtures';
import { makePng } from '../../../test/png';
import { annotatedPdfFor, exportDir } from '../../annotations/exportPdf';
import { annotationAt } from '../../annotations/hitTest';
import { removeOurAnnotations } from '../../annotations/pdfAnnotations';
import { pdfRectFor } from '../../documents/pageMap';
import { pageDimensions } from '../../pdf/pdfService';
import { compressDocument, mergeDocuments } from '../../persistence/libraryOperations';
import { boxToSpace, mapRect, pixelSpace } from '../../reader/pageSpace';
import { initialLibraryState, libraryReducer } from '../../../store/slices/librarySlice';
import type { Annotation, LibraryDocument, LibraryPage, OcrBounding } from '../../../types/models';
import { bottomRightBox, MIN_SIGNATURE_SHARE, moveSignatureBox, placedSignature, resizeSignatureBox, signatureGrip } from '../signaturePlacement';
import { copySignatureFiles, createSignatureRow, isSignature, pruneSignatureFiles, signatureFile, signatureFileName, signatureOnPicture, signatureUri } from '../signatureRows';

jest.mock('../../enhance/skiaEnhance', () => ({
  renderPage: jest.fn(async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { File: F, Paths: P } = require('expo-file-system');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { makePng: png } = require('../../../test/png');
    const f = new F(P.cache, `r_${Math.random()}.png`);
    f.write(png(20, 28));
    return { uri: f.uri, width: 20, height: 28 };
  }),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');

async function stampsIn(uri: string) {
  const pdf = await pdfjs.getDocument({ data: await new File(uri).bytes(), verbosity: 0, disableFontFace: true }).promise;
  const out: { page: number; rect: number[] }[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    for (const a of await (await pdf.getPage(i)).getAnnotations()) if (a.subtype === 'Stamp') out.push({ page: i, rect: a.rect });
  }
  return out;
}

// The saved, reusable signature (savedSignatureStorage keeps it at this place).
function savedSignature(shade = 20): string {
  const file = new File(Paths.document, 'signature', 'signature.png');
  if (!file.parentDirectory.exists) file.parentDirectory.create({ intermediates: true });
  if (file.exists) file.delete();
  file.write(makePng(shade, 10));
  return file.uri;
}

let made = 0;
function pngUri(): string {
  const file = new File(Paths.cache, `sigpage_${made++}.png`);
  file.write(makePng(20, 28));
  return file.uri;
}

// A scan with a blank document.pdf laid out the way the library says it is: the page map alone
// decides where a row lands in it.
async function scan(over: Partial<LibraryDocument> & { pageCount: number; pdfPages: number; turned?: number }): Promise<LibraryDocument> {
  const id = `sigdoc_${made++}`;
  const { pageCount, pdfPages, turned, ...rest } = over;
  const pages: LibraryPage[] = Array.from({ length: pageCount }, (_, i) => ({
    id: `${id}_p${i}`,
    fileUri: pngUri(),
    width: 1000,
    height: 1400,
    ...(i === turned ? { rotation: 90 as const } : {}),
  }));
  const dims = pageDimensions('A4');
  const pdf = await PDFDocument.create();
  for (let i = 0; i < pdfPages; i++) pdf.addPage([dims.width, dims.height]);
  const file = new File(Paths.document, 'library', id, 'document.pdf');
  file.parentDirectory.create({ intermediates: true });
  file.write(await pdf.save());
  return makeDoc({ id, pages, pdfUri: file.uri, pdfLayout: 'standard', pdfPageSize: 'A4', ...rest });
}

const BOX: OcrBounding = { left: 500, top: 1000, width: 300, height: 120 };

function near(got: number[], want: { x: number; y: number; width: number; height: number }) {
  [want.x, want.y, want.x + want.width, want.y + want.height].forEach((v, i) => expect(Math.abs(got[i] - v)).toBeLessThan(0.05));
}

beforeEach(() => {
  if (exportDir().exists) exportDir().delete();
});

describe('§18 W16 placing a signature (the box on the page as shown)', () => {
  const page = { x: 20, y: 500, width: 400, height: 560 };

  it('starts in the bottom-right corner, a third of the page wide, in the signature\'s own shape', () => {
    const box = bottomRightBox(page, 3);
    expect(box.width).toBeCloseTo(400 * 0.34);
    expect(box.width / box.height).toBeCloseTo(3);
    expect(box.x + box.width).toBeCloseTo(page.x + page.width - 400 * 0.06);
    expect(box.y + box.height).toBeCloseTo(page.y + page.height - 400 * 0.06);
    // A tall signature is held to a share of the page's height.
    const tall = bottomRightBox(page, 0.2);
    expect(tall.height).toBeCloseTo(560 * 0.3);
    expect(tall.width / tall.height).toBeCloseTo(0.2);
  });

  it('moves with the finger and stops at the page\'s edges', () => {
    const box = { x: 100, y: 600, width: 120, height: 40 };
    expect(moveSignatureBox(page, box, 30, -20)).toEqual({ x: 130, y: 580, width: 120, height: 40 });
    expect(moveSignatureBox(page, box, -500, -500)).toMatchObject({ x: 20, y: 500 });
    expect(moveSignatureBox(page, box, 5000, 5000)).toMatchObject({ x: 20 + 400 - 120, y: 500 + 560 - 40 });
  });

  it('resizes from its corner, keeping its shape, the page and a smallest size', () => {
    const box = { x: 100, y: 600, width: 120, height: 40 };
    const bigger = resizeSignatureBox(page, box, 60, 0);
    expect(bigger).toMatchObject({ x: 100, y: 600, width: 180 });
    expect(bigger.width / bigger.height).toBeCloseTo(3);
    // The bigger pull of the two directions wins.
    expect(resizeSignatureBox(page, box, 0, 40).width).toBeCloseTo(240);
    // Not past the page's right edge, not under the smallest size.
    expect(resizeSignatureBox(page, box, 5000, 0).width).toBeCloseTo(page.x + page.width - 100);
    expect(resizeSignatureBox(page, box, -5000, -5000).width).toBeCloseTo(400 * MIN_SIGNATURE_SHARE);
  });

  it('a touch takes the corner knob, the box, or neither', () => {
    const box = { x: 100, y: 600, width: 120, height: 40 };
    expect(signatureGrip(box, 222, 642, 20, 6)).toBe('resize');
    expect(signatureGrip(box, 150, 620, 20, 6)).toBe('move');
    expect(signatureGrip(box, 96, 620, 20, 6)).toBe('move');
    expect(signatureGrip(box, 60, 620, 20, 6)).toBeNull();
    expect(signatureGrip(null, 150, 620, 20, 6)).toBeNull();
  });

  it('placed, it is a box in the page\'s own space, with the turn that keeps it upright', () => {
    // The page fills its box on screen; a 1000 × 1400 master.
    const upright = pixelSpace('master', { width: 1000, height: 1400 });
    const toSpace = boxToSpace(page, upright);
    const placed = placedSignature({ x: 220, y: 780, width: 120, height: 40 }, (r) => mapRect(toSpace, r), upright.turn);
    expect(placed.turn).toBe(0);
    expect(placed.box.left).toBeCloseTo(500);
    expect(placed.box.top).toBeCloseTo(700);
    expect(placed.box.width).toBeCloseTo(300);
    expect(placed.box.height).toBeCloseTo(100);

    // The same master shown turned a quarter clockwise (its box on screen is then 560 wide).
    const turned = pixelSpace('master', { width: 1000, height: 1400, rotation: 90 });
    const shown = { x: 0, y: 0, width: 560, height: 400 };
    const back = boxToSpace(shown, turned);
    const sideways = placedSignature({ x: 100, y: 100, width: 120, height: 40 }, (r) => mapRect(back, r), turned.turn);
    expect(sideways.turn).toBe(270);
    // Wide on screen, tall in the unturned master.
    expect(sideways.box.width).toBeCloseTo(100);
    expect(sideways.box.height).toBeCloseTo(300);
  });
});

describe('§18 W16 a signature row and its PNG', () => {
  it('the row gets its own copy: replacing the saved signature does not change a signed document', async () => {
    const doc = await scan({ pageCount: 2, pdfPages: 2 });
    const row = createSignatureRow(doc, 1, savedSignature(20), { box: BOX, turn: 0 }, 77)!;
    expect(row).toMatchObject({ kind: 'signature', documentId: doc.id, pageId: doc.pages[1].id, createdAt: 77, data: { box: BOX, file: signatureFileName(row.id) } });
    expect('turn' in row.data).toBe(false);
    expect(isSignature(row)).toBe(true);
    const copy = signatureFile(row)!;
    expect(copy.uri.startsWith(new Directory(Paths.document, 'library', doc.id).uri)).toBe(true);
    const before = Buffer.from(await copy.bytes());

    // A new signature is drawn and saved over the old one.
    savedSignature(64);
    expect(Buffer.from(await copy.bytes()).equals(before)).toBe(true);
    expect(createSignatureRow(doc, 9, savedSignature(), { box: BOX, turn: 0 })).toBeNull();
  });

  it('only a name of ours is ever read from a row', () => {
    const bad = { documentId: 'd', data: { box: BOX, file: '../../signature/signature.png' } };
    expect(signatureFile(bad)).toBeNull();
    expect(signatureUri(bad)).toBeUndefined();
    expect(signatureFile({ documentId: 'd', data: { box: BOX, file: 'page_1.jpg' } })).toBeNull();
    expect(signatureFile({ documentId: 'd', data: { x: 1, y: 2 } })).toBeNull();
  });

  it('tidying deletes the PNGs no row uses, and only those', async () => {
    const doc = await scan({ pageCount: 1, pdfPages: 1 });
    const kept = createSignatureRow(doc, 0, savedSignature(), { box: BOX, turn: 0 })!;
    const erased = createSignatureRow(doc, 0, savedSignature(), { box: BOX, turn: 0 })!;
    pruneSignatureFiles(doc.id, [kept]);
    expect(signatureFile(kept)!.exists).toBe(true);
    expect(signatureFile(erased)!.exists).toBe(false);
    expect(new File(doc.pages[0].fileUri).exists).toBe(true);
    expect(new File(doc.pdfUri!).exists).toBe(true);
  });

  it('the eraser and a drag find it by its box', async () => {
    const doc = await scan({ pageCount: 1, pdfPages: 1 });
    const row = createSignatureRow(doc, 0, savedSignature(), { box: BOX, turn: 0 })!;
    expect(annotationAt([row], 600, 1050, 0)?.id).toBe(row.id);
    expect(annotationAt([row], 100, 100, 10)).toBeNull();
  });

  it("signed in the Library on a picture of the page: a scan's master as it is, an imported page through its turn", () => {
    const placement = { originX: 500, originY: 1000, width: 300, height: 120 };
    const master = makeDoc({ pages: [{ id: 'm', fileUri: 'file:///m.jpg', width: 1000, height: 1400 }] });
    expect(signatureOnPicture(master, 0, placement)).toEqual({ box: BOX, turn: 0 });

    // Indexed 1000 × 1400 and turned since: the picture rendered now is 1400 × 1000.
    const imported = makeDoc({ sourceKind: 'imported_pdf', pages: [{ id: 'i', fileUri: '', thumbUri: 't', width: 1000, height: 1400, rotation: 90 }] });
    const placed = signatureOnPicture(imported, 0, { originX: 700, originY: 100, width: 280, height: 100 }, { width: 1400, height: 1000 })!;
    expect(placed.turn).toBe(270);
    expect(placed.box.width).toBeCloseTo(100);
    expect(placed.box.height).toBeCloseTo(280);
    // A page not indexed yet has no space to keep a row in.
    const stub = makeDoc({ sourceKind: 'imported_pdf', pages: [{ id: 's', fileUri: '', width: 850, height: 1100 }] });
    expect(signatureOnPicture(stub, 0, placement, { width: 850, height: 1100 })).toBeNull();
    expect(signatureOnPicture(master, 4, placement)).toBeNull();
  });
});

describe('§18 W16 a signature row in the PDF that leaves the app', () => {
  async function flattened(doc: LibraryDocument, idx: number, turn: 0 | 90 | 180 | 270 = 0) {
    const row = createSignatureRow(doc, idx, savedSignature(), { box: BOX, turn })!;
    const uri = await annotatedPdfFor(doc, [row]);
    expect(uri).not.toBe(doc.pdfUri);
    return { row, uri: uri!, stamps: await stampsIn(uri!) };
  }

  it('lands on its page and rect in a standard document, once, and document.pdf stays clean', async () => {
    const doc = await scan({ pageCount: 3, pdfPages: 3 });
    const { stamps, uri, row } = await flattened(doc, 2);
    expect(stamps.map((s) => s.page)).toEqual([3]);
    near(stamps[0].rect, pdfRectFor(doc, 2, BOX)!);
    expect(removeOurAnnotations(await PDFDocument.load(await new File(doc.pdfUri!).bytes()))).toBe(0);
    // The copy made again from a file that already carries it (an older build's) has it once.
    new File(doc.pdfUri!).delete();
    new File(uri).copySync(new File(doc.pdfUri!));
    expect(await stampsIn((await annotatedPdfFor(doc, [row]))!)).toHaveLength(1);
  });

  it('after a cover it is one PDF page later', async () => {
    const doc = await scan({ pageCount: 3, pdfPages: 3, coverKind: 'imported_image' });
    const { stamps } = await flattened(doc, 1);
    expect(stamps.map((s) => s.page)).toEqual([2]);
    near(stamps[0].rect, pdfRectFor(doc, 1, BOX)!);
  });

  it('on a 2-in-1 sheet it is in its own column', async () => {
    const doc = await scan({ pageCount: 3, pdfPages: 2, pdfLayout: '2_in_1' });
    const left = pdfRectFor(doc, 0, BOX)!;
    const right = pdfRectFor(doc, 1, BOX)!;
    expect(right.page).toBe(1);
    expect(right.x).toBeGreaterThan(left.x + left.width);
    const { stamps } = await flattened(doc, 1);
    expect(stamps.map((s) => s.page)).toEqual([1]);
    near(stamps[0].rect, right);
    // The third page is alone on the second sheet.
    expect((await flattened(doc, 2)).stamps.map((s) => s.page)).toEqual([2]);
  });

  it('on a turned column it turns with the page, and a turn of its own stays inside its box', async () => {
    const doc = await scan({ pageCount: 2, pdfPages: 1, pdfLayout: '2_in_1', turned: 1 });
    const want = pdfRectFor(doc, 1, BOX)!;
    const { stamps } = await flattened(doc, 1);
    near(stamps[0].rect, want);
    // Placed upright on the page as shown (turned back inside the box): the same box in the PDF.
    near((await flattened(doc, 1, 270)).stamps[0].rect, want);
  });

  it('a file that is not a PNG writes nothing and does not stop the copy', async () => {
    const doc = await scan({ pageCount: 1, pdfPages: 1 });
    const row = createSignatureRow(doc, 0, savedSignature(), { box: BOX, turn: 0 })!;
    signatureFile(row)!.write('not a png');
    const note: Annotation = { id: 'n1', documentId: doc.id, pageId: doc.pages[0].id, kind: 'note', color: 'note', data: { x: 10, y: 10 }, text: 'hi', createdAt: 1, updatedAt: 1 };
    const uri = await annotatedPdfFor(doc, [row, note]);
    expect(await stampsIn(uri!)).toEqual([]);
    expect(removeOurAnnotations(await PDFDocument.load(await new File(uri!).bytes()))).toBe(1);
  });
});

describe('§18 W16 rebuilds keep the signature', () => {
  it('Compress rebuilds document.pdf and the row still lands on its page', async () => {
    const doc = await scan({ pageCount: 2, pdfPages: 2 });
    const row = createSignatureRow(doc, 1, savedSignature(), { box: BOX, turn: 0 })!;
    const compressed = await compressDocument(doc, 2);
    expect(compressed.pages.map((p) => p.id)).toEqual(doc.pages.map((p) => p.id));
    // The store keeps a row whose page is still there.
    let state = libraryReducer(initialLibraryState, { type: 'library/SET_FILES', files: [doc] });
    state = libraryReducer(state, { type: 'library/ADD_ANNOTATION', annotation: row });
    state = libraryReducer(state, { type: 'library/UPDATE_FILE', id: doc.id, patch: compressed });
    expect(state.annotations).toEqual([row]);
    const stamps = await stampsIn((await annotatedPdfFor(compressed, state.annotations))!);
    expect(stamps.map((s) => s.page)).toEqual([2]);
    near(stamps[0].rect, pdfRectFor(compressed, 1, BOX)!);
  });

  it('a merge takes the PNG along with the row', async () => {
    const a = await scan({ pageCount: 1, pdfPages: 1 });
    const b = await scan({ pageCount: 1, pdfPages: 1 });
    const row = createSignatureRow(b, 0, savedSignature(), { box: BOX, turn: 0 })!;
    const merged = await mergeDocuments([a, b], [row]);
    // The reducer moves the row to the document that now has its page.
    let state = libraryReducer(initialLibraryState, { type: 'library/SET_FILES', files: [a, b] });
    state = libraryReducer(state, { type: 'library/ADD_ANNOTATION', annotation: row });
    state = libraryReducer(state, { type: 'library/REPLACE_FILES', ids: [a.id, b.id], files: [merged] });
    expect(state.annotations.map((r) => r.documentId)).toEqual([merged.id]);
    expect(signatureFile(state.annotations[0])!.exists).toBe(true);
    // The sources go; the merged document's copy doesn't.
    new Directory(Paths.document, 'library', b.id).delete();
    const stamps = await stampsIn((await annotatedPdfFor(merged, state.annotations))!);
    expect(stamps.map((s) => s.page)).toEqual([2]);
  });

  it('copies only signatures, and only where they are missing', async () => {
    const doc = await scan({ pageCount: 1, pdfPages: 1 });
    const row = createSignatureRow(doc, 0, savedSignature(), { box: BOX, turn: 0 })!;
    copySignatureFiles([row, { ...row, id: 'n', kind: 'note', data: { x: 1, y: 1 } }], 'sig_target');
    const dir = new Directory(Paths.document, 'library', 'sig_target');
    expect(dir.list().map((entry) => entry.name)).toEqual([signatureFileName(row.id)]);
    // The same document: nothing to do.
    copySignatureFiles([row], doc.id);
    expect(signatureFile(row)!.exists).toBe(true);
  });
});
