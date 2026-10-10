import { File, Paths } from 'expo-file-system';
import { makePng } from '../../../test/png';
import * as sequential from '../../capture/processSequentially';
import { pageList } from '../../pdf/coverTemplates';
import { deleteDocumentFiles } from '../../persistence/libraryFiles';
import type { Annotation, LibraryDocument, LibraryPage } from '../../../types/models';
import { buildExamPack, defaultPackTitle, type RenderPage } from '../buildExamPack';

jest.mock('../../enhance/skiaEnhance', () => ({ renderPage: jest.fn() }));
jest.mock('../../pdf/academicRasterService', () => ({ renderLayoutImage: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');

function png(): string {
  const f = new File(Paths.cache, `ep_${Math.random()}.png`);
  f.write(makePng(20, 28));
  return f.uri;
}

function sourceDoc(id: string, name: string, n: number, createdAt: number): LibraryDocument {
  const pages: LibraryPage[] = Array.from({ length: n }, (_, i) => {
    const file = new File(Paths.document, 'library', id, `page_${i + 1}.png`);
    file.write(makePng(20, 28));
    const text = `${name} page ${i + 1} mitochondria`;
    const bounding = { left: 10, top: 10, width: 500, height: 40 };
    return { id: `${id}_p${i}`, fileUri: file.uri, width: 1000, height: 1400, ocr: { text, blocks: [{ text, bounding, lines: [{ text, bounding }] }] } };
  });
  return { id, name, format: 'PDF', mode: 'doc', pages, sizeBytes: 0, createdAt, star: false, locked: false, courseId: 'bio' } as LibraryDocument;
}

// The contents page: a small image, with the layout's text checked through its OCR.
const renderContents: RenderPage = jest.fn(async () => ({ uri: png(), width: 849, height: 1200 }));

const highlight = (documentId: string, pageId: string): Annotation => ({
  id: `a_${pageId}`,
  documentId,
  pageId,
  kind: 'highlight',
  color: 'yellow',
  data: { rects: [{ left: 10, top: 10, width: 200, height: 40 }] },
  text: 'mitochondria',
  createdAt: 1,
  updatedAt: 1,
});

describe('buildExamPack', () => {
  const notes = sourceDoc('notes', 'Cell notes', 4, 1);
  const lab = sourceDoc('lab', 'Lab 2', 3, 2);
  const items = [
    { documentId: 'notes', pageId: 'notes_p1' },
    { documentId: 'notes', pageId: 'notes_p2' },
    { documentId: 'lab', pageId: 'lab_p0' },
    { documentId: 'notes', pageId: 'notes_p3' },
    { documentId: 'gone', pageId: 'x' },
  ];
  const annotations = [highlight('notes', 'notes_p2'), highlight('lab', 'lab_p2')];
  const options = { title: 'Bio exam pack', subtitle: 'BIO 101', courseId: 'bio', contents: true, includeAnnotations: true, pageNumbers: true, pageSize: 'A4' as const };

  it('copies the pages in pack order after a contents page, with OCR and annotations', async () => {
    const spy = jest.spyOn(sequential, 'processSequentially');
    const { doc, annotations: copied } = await buildExamPack(items, [notes, lab], annotations, options, renderContents);

    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
    expect(doc).toMatchObject({ name: 'Bio exam pack', courseId: 'bio', docType: 'notes', format: 'PDF', pdfLayout: 'standard' });
    // Contents + 4 picked pages (the missing one is skipped), all new ids and files.
    expect(doc.pages).toHaveLength(5);
    expect(doc.pages.slice(1).map((p) => p.ocr?.text)).toEqual([
      'Cell notes page 2 mitochondria',
      'Cell notes page 3 mitochondria',
      'Lab 2 page 1 mitochondria',
      'Cell notes page 4 mitochondria',
    ]);
    expect(doc.pages.every((p) => p.fileUri.includes(`/library/${doc.id}/`))).toBe(true);
    expect(new Set(doc.pages.map((p) => p.id)).size).toBe(5);

    // Contents entries: runs of the same document, with their pack pages.
    const contents = doc.pages[0].ocr!.text;
    expect(contents).toContain('Cell notes');
    expect(contents).toContain('p. 2–3 · pack pages 2–3');
    expect(contents).toContain('p. 1 · pack page 4');
    expect(contents).toContain('p. 4 · pack page 5');

    // Only the annotation on a picked page comes along, re-pointed at the copy.
    expect(copied).toHaveLength(1);
    expect(copied[0]).toMatchObject({ documentId: doc.id, pageId: doc.pages[2].id, text: 'mitochondria' });

    // The PDF: searchable pages, the annotation, the footer.
    const pdf = await pdfjs.getDocument({ data: await new File(doc.pdfUri!).bytes(), verbosity: 0, disableFontFace: true }).promise;
    expect(pdf.numPages).toBe(5);
    const page3 = await pdf.getPage(3);
    const text = ((await page3.getTextContent()).items as { str: string }[]).map((i) => i.str).join(' ').replace(/\s+/g, ' ');
    expect(text).toContain('mitochondria');
    expect(text).toContain('Page 3 of 5');
    expect((await page3.getAnnotations()).map((a: { subtype: string }) => a.subtype)).toEqual(['Highlight']);
  });

  it('stays whole when a source document is deleted', async () => {
    const { doc } = await buildExamPack(items.slice(0, 2), [notes, lab], [], { ...options, contents: false, includeAnnotations: false }, renderContents);
    deleteDocumentFiles('notes');
    expect(doc.pages.every((p) => new File(p.fileUri).exists)).toBe(true);
    expect(new File(doc.pdfUri!).exists).toBe(true);
  });

  it('fails when none of the pages exist', async () => {
    await expect(buildExamPack([{ documentId: 'gone', pageId: 'x' }], [notes], [], options, renderContents)).rejects.toThrow();
  });
});

describe('contents helpers', () => {
  it('collapses page runs and names the pack', () => {
    expect(pageList([9, 2, 4, 5, 6])).toBe('p. 2, 4–6, 9');
    expect(defaultPackTitle('CSE101', new Date(2026, 9, 2))).toBe('CSE101 exam pack – 2 October 2026');
    expect(defaultPackTitle(undefined, new Date(2026, 9, 2))).toBe('Exam pack – 2 October 2026');
  });
});

describe('pack tray', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { initialPackState, packReducer } = require('../../../store/slices/packSlice');
  const p = (documentId: string, pageId: string) => ({ documentId, pageId });

  it('adds each page once, keeps the first course, reorders and removes', () => {
    let state = packReducer(initialPackState, { type: 'pack/ADD', items: [p('a', '1'), p('a', '2'), p('a', '1')], courseId: 'bio' });
    state = packReducer(state, { type: 'pack/ADD', items: [p('a', '2'), p('b', '1')], courseId: 'phy' });
    expect(state.items).toEqual([p('a', '1'), p('a', '2'), p('b', '1')]);
    expect(state.courseId).toBe('bio');
    state = packReducer(state, { type: 'pack/MOVE', from: 2, to: 0 });
    expect(state.items[0]).toEqual(p('b', '1'));
    expect(packReducer(state, { type: 'pack/MOVE', from: 0, to: -1 })).toBe(state);
    state = packReducer(state, { type: 'pack/REMOVE', index: 1 });
    expect(state.items).toEqual([p('b', '1'), p('a', '2')]);
    expect(packReducer(state, { type: 'pack/CLEAR' })).toEqual(initialPackState);
  });
});
