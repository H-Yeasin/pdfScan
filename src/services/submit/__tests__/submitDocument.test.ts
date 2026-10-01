import { File, Paths } from 'expo-file-system';
import { makePng } from '../../../test/png';
import { renderPage } from '../../enhance/skiaEnhance';
import { typeNumberOf } from '../../courses/docTypes';
import { getDocumentDir } from '../../persistence/libraryFiles';
import type { LibraryDocument, LibraryPage } from '../../../types/models';
import { defaultSubmitPreset, type SubmitPreset } from '../preset';
import { submitDocument, submissionPages } from '../submitDocument';
import { MB } from '../sizeTarget';

jest.mock('../../enhance/skiaEnhance', () => ({ renderPage: jest.fn(), encodedBytes: jest.fn(async () => 10_000) }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');

function png(name: string): string {
  const file = new File(Paths.cache, `${name}_${Math.random()}.png`);
  file.write(makePng(20, 28));
  return file.uri;
}

function libraryPage(text: string): LibraryPage {
  const bounding = { left: 10, top: 10, width: 800, height: 40 };
  return {
    id: `p_${Math.random()}`,
    fileUri: png('master'),
    width: 1000,
    height: 1400,
    ocr: { text, blocks: [{ text, bounding, lines: [{ text, bounding }] }] },
  } as LibraryPage;
}

function doc(overrides: Partial<LibraryDocument> = {}): LibraryDocument {
  return {
    id: `doc_${Math.random().toString(36).slice(2)}`,
    name: '2021331045_Rahim_CSE101_HW3',
    format: 'PDF',
    mode: 'doc',
    pages: [libraryPage('Question one'), libraryPage('Question two')],
    pdfUri: undefined,
    sizeBytes: 0,
    createdAt: 1,
    star: false,
    tag: 'HW',
    locked: false,
    searchHaystack: '',
    courseId: 'course_cse',
    docType: 'assignment',
    ...overrides,
  } as LibraryDocument;
}

const profile = { name: 'Rahim Uddin', roll: '2021331045', section: 'B', institution: 'SUST' };
const course = { id: 'course_cse', name: 'Data Structures', code: 'CSE 101', teacher: 'Dr. Karim', color: 'teal', archived: false, sortOrder: 0, createdAt: 0 } as const;

async function pageTexts(uri: string): Promise<string[]> {
  const pdf = await pdfjs.getDocument({ data: await new File(uri).bytes(), verbosity: 0, disableFontFace: true }).promise;
  const out: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const content = await (await pdf.getPage(i)).getTextContent();
    out.push((content.items as { str: string }[]).map((item) => item.str).join(' ').replace(/\s+/g, ' '));
  }
  return out;
}

beforeEach(() => {
  (renderPage as jest.Mock).mockImplementation(async () => ({ uri: png('render'), width: 20, height: 28 }));
});

describe('submitDocument', () => {
  const preset: SubmitPreset = { ...defaultSubmitPreset('course_cse'), coverTemplateId: 'assignment', footerPreset: 'namePages', pageSize: 'A4' };

  it('writes a named file in submissions/, with the preset cover and footer', async () => {
    const d = doc();
    const progress: string[] = [];
    const result = await submitDocument({ doc: d, preset, profile, course, n: 3, onProgress: (t) => progress.push(t) });

    expect(result.fileName).toBe('2021331045_Rahim_CSE101_HW3.pdf');
    expect(result.uri).toBe(new File(getDocumentDir(d.id), 'submissions', result.fileName).uri);
    expect(result.fits).toBe(true);
    expect(new File(result.uri).size).toBe(result.sizeBytes);
    // The library's own document.pdf is untouched.
    expect(new File(getDocumentDir(d.id), 'document.pdf').exists).toBe(false);

    const texts = await pageTexts(result.uri);
    expect(texts).toHaveLength(3);
    expect(texts[0]).toContain('Assignment 3');
    expect(texts[0]).toContain('Teacher: Dr. Karim');
    expect(texts[1]).toContain('Question one');
    expect(texts[1]).toContain('RahimUddin · 2021331045 · 1/2');
    expect(texts[2]).toContain('RahimUddin · 2021331045 · 2/2');
    expect(progress).toEqual(['Building PDF… page 1 of 2', 'Building PDF… page 2 of 2']);
  });

  it("skips a saved document's own cover page", async () => {
    const d = doc({ coverKind: 'template', pages: [libraryPage('OLD COVER'), libraryPage('Body')] });
    expect(submissionPages(d)).toHaveLength(1);
    const result = await submitDocument({ doc: d, preset: defaultSubmitPreset(null), profile, course, n: 1 });
    const texts = await pageTexts(result.uri);
    expect(texts).toEqual([expect.stringContaining('Body')]);
  });

  it('uses the size target when the preset has one', async () => {
    const progress: string[] = [];
    const result = await submitDocument({
      doc: doc(),
      preset: { ...defaultSubmitPreset('c'), sizeLimitBytes: 1 * MB },
      profile,
      course,
      n: 1,
      onProgress: (t) => progress.push(t),
    });
    expect(result.fits).toBe(true);
    expect(progress[0]).toBe('Fitting under 1 MB…');
  });

  it('cleans the file name and replaces an earlier submission with the same name', async () => {
    const d = doc({ name: 'HW: 3?' });
    const first = await submitDocument({ doc: d, preset: defaultSubmitPreset(null), profile, n: 1 });
    const second = await submitDocument({ doc: d, preset: defaultSubmitPreset(null), profile, n: 1 });
    expect(first.fileName).toBe('HW 3.pdf');
    expect(second.uri).toBe(first.uri);
  });
});

describe('typeNumberOf', () => {
  it("counts the course's earlier documents of the same type", () => {
    const docs = [
      { id: 'a', courseId: 'c', docType: 'assignment' as const, createdAt: 1 },
      { id: 'b', courseId: 'c', docType: 'assignment' as const, createdAt: 2 },
      { id: 'x', courseId: 'c', docType: 'lab' as const, createdAt: 1 },
      { id: 'y', courseId: 'other', docType: 'assignment' as const, createdAt: 1 },
      { id: 'c', courseId: 'c', docType: 'assignment' as const, createdAt: 3 },
    ];
    expect(typeNumberOf(docs[1], docs)).toBe(2);
    expect(typeNumberOf(docs[4], docs)).toBe(3);
    expect(typeNumberOf(docs[2], docs)).toBe(1);
    expect(typeNumberOf({ id: 'new', courseId: 'c', docType: 'assignment', createdAt: 9 }, docs)).toBe(4);
  });
});

describe('annotations in a submission', () => {
  it('are left out by default, and placed after the cover when included', async () => {
    const d = doc();
    const note = {
      id: 'n1',
      documentId: d.id,
      pageId: d.pages[1].id,
      kind: 'note' as const,
      color: 'note',
      data: { x: 100, y: 100 },
      text: 'check',
      createdAt: 1,
      updatedAt: 1,
    };
    const annotPages = async (uri: string) => {
      const pdf = await pdfjs.getDocument({ data: await new File(uri).bytes(), verbosity: 0, disableFontFace: true }).promise;
      const out: number[] = [];
      for (let i = 1; i <= pdf.numPages; i++) if ((await (await pdf.getPage(i)).getAnnotations()).length) out.push(i);
      return out;
    };
    const base: SubmitPreset = { ...defaultSubmitPreset('c'), coverTemplateId: 'simple' };
    const without = await submitDocument({ doc: d, preset: base, profile, course, n: 1, annotations: [note], fileName: 'without' });
    expect(await annotPages(without.uri)).toEqual([]);
    const withThem = await submitDocument({ doc: d, preset: { ...base, includeAnnotations: true }, profile, course, n: 1, annotations: [note], fileName: 'with' });
    // Cover on page 1, so the second content page is PDF page 3.
    expect(await annotPages(withThem.uri)).toEqual([3]);
  });
});
