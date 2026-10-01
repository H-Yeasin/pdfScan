import { File, Paths } from 'expo-file-system';
import { PDFDocument } from 'pdf-lib';
import { makePng } from '../../../test/png';
import { makeDoc } from '../../../test/fixtures';
import { initialLibraryState, libraryReducer } from '../../../store/slices/librarySlice';
import { buildPdfFromPages } from '../../pdf/pdfService';
import { pdfRectFor } from '../../documents/pageMap';
import { compressDocument } from '../../persistence/libraryOperations';
import type { Annotation, LibraryDocument, LibraryPage, PageOcr } from '../../../types/models';
import { NM_PREFIX, removeOurAnnotations, updatePdfAnnotations, writeAnnotations } from '../pdfAnnotations';
import { snapHighlight } from '../snap';

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

const word = (text: string, left: number, top: number) => ({ text, bounding: { left, top, width: 80, height: 30 } });
const OCR: PageOcr = {
  text: 'alpha beta gamma\ndelta epsilon',
  blocks: [
    {
      text: '',
      bounding: { left: 0, top: 0, width: 400, height: 100 },
      lines: [
        { text: 'alpha beta gamma', bounding: { left: 100, top: 100, width: 300, height: 30 }, words: [word('alpha', 100, 100), word('beta', 200, 100), word('gamma', 300, 100)] },
        { text: 'delta epsilon', bounding: { left: 100, top: 160, width: 200, height: 30 }, words: [word('delta', 100, 160), word('epsilon', 200, 160)] },
      ],
    },
  ],
};

describe('snapHighlight', () => {
  it('snaps a stroke to the words it crosses on one line', () => {
    const { rects, text } = snapHighlight([[110, 115], [260, 112]], OCR, 24);
    expect(text).toBe('alpha beta');
    expect(rects).toEqual([{ left: 100, top: 100, width: 180, height: 30 }]);
  });

  it('a diagonal stroke over two lines gives one rect per line', () => {
    const { rects, text } = snapHighlight([[330, 110], [120, 175]], OCR, 8);
    expect(rects).toHaveLength(2);
    expect(text?.split('\n')).toHaveLength(2);
  });

  it('a stroke over no words becomes a free rect', () => {
    const { rects, text } = snapHighlight([[600, 600], [700, 610]], OCR, 20);
    expect(text).toBeUndefined();
    expect(rects).toEqual([{ left: 590, top: 590, width: 120, height: 30 }]);
  });
});

function pngUri() {
  const f = new File(Paths.cache, `a_${Math.random()}.png`);
  f.write(makePng(20, 28));
  return f.uri;
}

function libraryDoc(id: string): LibraryDocument {
  const pages: LibraryPage[] = ['p1', 'p2'].map((pid) => ({ id: pid, fileUri: pngUri(), width: 1000, height: 1400, ocr: OCR }));
  return makeDoc({ id, pages, pdfLayout: 'standard', pdfPageSize: 'A4' });
}

function annotation(over: Partial<Annotation> & Pick<Annotation, 'kind' | 'data'>): Annotation {
  return { id: `a_${Math.random().toString(36).slice(2)}`, documentId: 'd', pageId: 'p2', color: 'yellow', createdAt: 1, updatedAt: 1, ...over };
}

async function annotationsIn(uri: string) {
  const pdf = await pdfjs.getDocument({ data: await new File(uri).bytes(), verbosity: 0, disableFontFace: true }).promise;
  const out: { page: number; subtype: string; rect: number[]; id: string; contents: string }[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    for (const a of await (await pdf.getPage(i)).getAnnotations()) {
      out.push({ page: i, subtype: a.subtype, rect: a.rect, id: a.id ?? '', contents: a.contentsObj?.str ?? a.contents ?? '' });
    }
  }
  return out;
}

describe('PDF annotations', () => {
  it('writes highlight, ink and note as real annotations on the right page and place', async () => {
    const doc = libraryDoc('doc_annot');
    const highlight = annotation({ kind: 'highlight', data: { rects: [{ left: 100, top: 100, width: 180, height: 30 }] }, text: 'alpha beta' });
    const ink = annotation({ kind: 'ink', color: 'red', data: { strokes: [[[100, 300], [400, 350]]], width: 6 } });
    const note = annotation({ kind: 'note', color: 'note', data: { x: 500, y: 500 }, text: 'Ask about this' });
    const { uri } = await buildPdfFromPages(doc.id, doc.pages.map((p) => ({ uri: p.fileUri, width: p.width, height: p.height })), 'as-is', undefined, 'standard', 'A4', {
      beforeSave: (pdf) => writeAnnotations(pdf, doc, [highlight, ink, note]),
    });

    const found = await annotationsIn(uri);
    expect(found.map((a) => [a.page, a.subtype])).toEqual([
      [2, 'Highlight'],
      [2, 'Ink'],
      [2, 'Text'],
    ]);
    const expected = pdfRectFor(doc, 1, { left: 100, top: 100, width: 180, height: 30 })!;
    const [x1, y1, x2, y2] = found[0].rect;
    expect(Math.abs(x1 - expected.x)).toBeLessThan(0.5);
    expect(Math.abs(y1 - expected.y)).toBeLessThan(0.5);
    expect(Math.abs(x2 - (expected.x + expected.width))).toBeLessThan(0.5);
    expect(Math.abs(y2 - (expected.y + expected.height))).toBeLessThan(0.5);
    expect(found[2].contents).toBe('Ask about this');

    // /NM marks them as ours.
    const pdfDoc = await PDFDocument.load(await new File(uri).bytes());
    expect(removeOurAnnotations(pdfDoc)).toBe(3);
    expect(highlight.id.length).toBeGreaterThan(0);
    expect(NM_PREFIX).toBe('pdfscan:');
  });

  it('an annotation update rewrites ours in place and keeps the rest of the file', async () => {
    const doc = libraryDoc('doc_update');
    const built = await buildPdfFromPages(doc.id, doc.pages.map((p) => ({ uri: p.fileUri, width: p.width, height: p.height })), 'as-is');
    const first = annotation({ kind: 'note', data: { x: 10, y: 10 }, text: 'one' });
    await updatePdfAnnotations({ ...doc, pdfUri: built.uri }, [first]);
    expect((await annotationsIn(built.uri)).map((a) => a.contents)).toEqual(['one']);
    const second = annotation({ kind: 'note', data: { x: 20, y: 20 }, text: 'two' });
    await updatePdfAnnotations({ ...doc, pdfUri: built.uri }, [second]);
    expect((await annotationsIn(built.uri)).map((a) => a.contents)).toEqual(['two']);
    expect((await PDFDocument.load(await new File(built.uri).bytes())).getPageCount()).toBe(2);
  });

  it('Compress keeps the annotations', async () => {
    const doc = libraryDoc('doc_compress');
    const built = await buildPdfFromPages(doc.id, doc.pages.map((p) => ({ uri: p.fileUri, width: p.width, height: p.height })), 'as-is');
    const highlight = annotation({ kind: 'highlight', documentId: doc.id, data: { rects: [{ left: 100, top: 100, width: 180, height: 30 }] } });
    const compressed = await compressDocument({ ...doc, pdfUri: built.uri }, 2, [highlight]);
    expect((await annotationsIn(compressed.pdfUri!)).map((a) => [a.page, a.subtype])).toEqual([[2, 'Highlight']]);
  });
});

describe('annotations in the library state', () => {
  const a1 = annotation({ id: 'a1', documentId: 'd1', pageId: 'p1', kind: 'note', data: { x: 0, y: 0 } });
  const a2 = annotation({ id: 'a2', documentId: 'd1', pageId: 'p2', kind: 'note', data: { x: 0, y: 0 } });
  const a3 = annotation({ id: 'a3', documentId: 'd2', pageId: 'p1', kind: 'note', data: { x: 0, y: 0 } });

  it('a page leaving its document takes its annotations, and so does a deleted document', () => {
    let state = libraryReducer(initialLibraryState, { type: 'library/SET_FILES', files: [makeDoc({ id: 'd1' }), makeDoc({ id: 'd2' })] });
    state = libraryReducer(state, { type: 'library/SET_ANNOTATIONS', annotations: [a1, a2, a3] });
    state = libraryReducer(state, {
      type: 'library/UPDATE_FILE',
      id: 'd1',
      patch: { pages: [{ id: 'p1', fileUri: '', width: 1, height: 1 }] },
    });
    expect(state.annotations.map((a) => a.id)).toEqual(['a1', 'a3']);
    state = libraryReducer(state, { type: 'library/REMOVE_FILES', ids: ['d1'] });
    expect(state.annotations.map((a) => a.id)).toEqual(['a3']);
  });
});

describe('annotationAt', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { annotationAt } = require('../hitTest');
  const hl = annotation({ id: 'hl', kind: 'highlight', data: { rects: [{ left: 0, top: 0, width: 100, height: 20 }] } });
  const ink = annotation({ id: 'ink', kind: 'ink', data: { strokes: [[[0, 100], [200, 100]]], width: 6 } });
  const note = annotation({ id: 'note', kind: 'note', data: { x: 300, y: 300 } });

  it('finds highlights, strokes (between their points too) and notes, topmost first', () => {
    expect(annotationAt([hl, ink, note], 50, 10, 5)?.id).toBe('hl');
    expect(annotationAt([hl, ink, note], 120, 104, 5)?.id).toBe('ink');
    expect(annotationAt([hl, ink, note], 310, 290, 5)?.id).toBe('note');
    expect(annotationAt([hl, ink, note], 500, 500, 5)).toBeNull();
    const top = { ...hl, id: 'top' };
    expect(annotationAt([hl, top], 50, 10, 5)?.id).toBe('top');
  });
});
