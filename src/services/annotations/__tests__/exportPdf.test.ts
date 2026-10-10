import { Directory, File, Paths } from 'expo-file-system';
import { PDFDocument } from 'pdf-lib';
import { resetStorage } from '../../../test/db';
import { makeDoc } from '../../../test/fixtures';
import { makeTextPdf } from '../../../test/pdfs';
import { backupDir, createBackup } from '../../backup/createBackup';
import { restoredPdfsToSettle } from '../../backup/restoreBackup';
import { openZip } from '../../backup/zip';
import { saveFilledForm } from '../../edit/pdfForm';
import { getDb } from '../../persistence/dbService';
import { syncLibrary } from '../../persistence/libraryRepo';
import { printDocument, shareDocument } from '../../sharing/shareService';
import { submitDocument } from '../../submit/submitDocument';
import { defaultSubmitPreset } from '../../submit/preset';
import type { Annotation, LibraryDocument, LibraryPage } from '../../../types/models';
import { annotatedPdfFor, exportDir, exportedRows, exportFingerprint, settleOurAnnotations } from '../exportPdf';
import { updatePdfAnnotations } from '../../../test/bakeAnnotations';
import { NM_PREFIX, removeOurAnnotations } from '../pdfAnnotations';

const mockShare = jest.fn(async (_uri: string) => undefined);
const mockPrint = jest.fn(async (_options: { uri: string }) => undefined);
jest.mock('expo-sharing', () => ({ isAvailableAsync: async () => true, shareAsync: (uri: string) => mockShare(uri) }));
jest.mock('expo-print', () => ({ printAsync: (options: { uri: string }) => mockPrint(options) }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');

// What a PDF reader finds in a file: each annotation's page, kind and /NM.
async function annotationsIn(uri: string) {
  const pdf = await pdfjs.getDocument({ data: await new File(uri).bytes(), verbosity: 0, disableFontFace: true }).promise;
  const out: { page: number; subtype: string; contents: string }[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    for (const a of await (await pdf.getPage(i)).getAnnotations()) out.push({ page: i, subtype: a.subtype, contents: a.contentsObj?.str ?? '' });
  }
  return out;
}

async function oursIn(uri: string): Promise<number> {
  return removeOurAnnotations(await PDFDocument.load(await new File(uri).bytes()));
}

// An imported PDF of `count` pages (612 × 792 points), indexed at 2 px per point.
async function importedDoc(id: string, count = 2): Promise<LibraryDocument> {
  const source = await makeTextPdf(Array.from({ length: count }, (_, i) => `Page ${i + 1}`));
  const dest = new File(Paths.document, 'library', id, 'document.pdf');
  if (!dest.parentDirectory.exists) dest.parentDirectory.create({ intermediates: true });
  if (dest.exists) dest.delete();
  new File(source).copySync(dest);
  const pages: LibraryPage[] = Array.from({ length: count }, (_, i) => ({ id: `${id}_p${i + 1}`, fileUri: '', thumbUri: 'x', width: 1224, height: 1584 }));
  return makeDoc({ id, name: 'Notes', sourceKind: 'imported_pdf', pages, pdfUri: dest.uri, pdfLayout: 'standard' });
}

function note(doc: LibraryDocument, pageIdx: number, text: string, over: Partial<Annotation> = {}): Annotation {
  return {
    id: `a_${text}`,
    documentId: doc.id,
    pageId: doc.pages[pageIdx].id,
    kind: 'note',
    color: 'note',
    data: { x: 200, y: 300 },
    text,
    createdAt: 1,
    updatedAt: 1,
    ...over,
  };
}

beforeEach(() => {
  if (exportDir().exists) exportDir().delete();
  mockShare.mockClear();
  mockPrint.mockClear();
});

describe('§18 W14 annotatedPdfFor', () => {
  it('a document without rows goes out as its own file', async () => {
    const doc = await importedDoc('exp_plain');
    expect(await annotatedPdfFor(doc, [])).toBe(doc.pdfUri);
    // Another document's rows, and a row on a page this one doesn't have, are not its own.
    const strays = [note({ ...doc, id: 'other' }, 0, 'elsewhere'), note(doc, 0, 'gone', { pageId: 'no_such_page' })];
    expect(exportedRows(doc, strays)).toEqual([]);
    expect(await annotatedPdfFor(doc, strays)).toBe(doc.pdfUri);
    expect(exportDir().exists && exportDir().list().length > 0).toBe(false);
    expect(await annotatedPdfFor({ ...doc, pdfUri: undefined }, [])).toBeUndefined();
  });

  it('writes the rows into a copy and leaves document.pdf alone', async () => {
    const doc = await importedDoc('exp_copy');
    const before = await new File(doc.pdfUri!).bytes();
    const uri = await annotatedPdfFor(doc, [note(doc, 1, 'ask')]);
    expect(uri).not.toBe(doc.pdfUri);
    expect(uri!.startsWith(exportDir().uri)).toBe(true);
    expect(await annotationsIn(uri!)).toEqual([{ page: 2, subtype: 'Text', contents: 'ask' }]);
    expect(Buffer.from(await new File(doc.pdfUri!).bytes()).equals(Buffer.from(before))).toBe(true);
    expect(await oursIn(doc.pdfUri!)).toBe(0);
  });

  it('marks an older build left in document.pdf are there exactly once', async () => {
    const doc = await importedDoc('exp_baked');
    const rows = [note(doc, 0, 'one'), note(doc, 1, 'two')];
    // The old engine wrote them into the file itself.
    await updatePdfAnnotations(doc, rows);
    expect(await oursIn(doc.pdfUri!)).toBe(2);
    const uri = await annotatedPdfFor(doc, rows);
    expect((await annotationsIn(uri!)).map((a) => a.contents)).toEqual(['one', 'two']);
    // A row erased since is not in the copy, though the file still has it.
    const less = await annotatedPdfFor(doc, [rows[1]]);
    expect((await annotationsIn(less!)).map((a) => a.contents)).toEqual(['two']);
  });

  it('the same state is built once; a changed row or file gives a new copy and drops the old one', async () => {
    const doc = await importedDoc('exp_cache');
    const row = note(doc, 0, 'first');
    const first = await annotatedPdfFor(doc, [row]);
    const written = new File(first!).lastModified;
    await new Promise((resolve) => setTimeout(resolve, 15));
    expect(await annotatedPdfFor(doc, [row])).toBe(first);
    expect(new File(first!).lastModified).toBe(written);

    const edited = { ...row, text: 'second', updatedAt: 2 };
    expect(exportFingerprint(doc, [edited])).not.toBe(exportFingerprint(doc, [row]));
    const second = await annotatedPdfFor(doc, [edited]);
    expect(second).not.toBe(first);
    expect(new File(first!).exists).toBe(false);
    expect((await annotationsIn(second!)).map((a) => a.contents)).toEqual(['second']);

    // The file itself rewritten (Edit pages, Compress): its size and time are part of the name.
    const more = await makeTextPdf(['Page 1', 'Page 2', 'Page 3']);
    new File(doc.pdfUri!).delete();
    new File(more).copySync(new File(doc.pdfUri!));
    expect(await annotatedPdfFor(doc, [edited])).not.toBe(second);
  });

  it('a file the rows cannot be written into goes out as it is', async () => {
    const doc = await importedDoc('exp_broken');
    new File(doc.pdfUri!).write('not a pdf');
    expect(await annotatedPdfFor(doc, [note(doc, 0, 'x')])).toBe(doc.pdfUri);
  });
});

describe('§18 W14 what leaves the app carries the rows', () => {
  it('Share and Print hand over the annotated copy', async () => {
    const doc = await importedDoc('exp_share');
    const rows = [note(doc, 0, 'shared')];
    await shareDocument(doc, rows);
    // shareAs copies the file under the document's name.
    expect(mockShare).toHaveBeenCalledTimes(1);
    const shared = mockShare.mock.calls[0][0];
    expect(shared.endsWith('/Notes.pdf')).toBe(true);
    expect((await annotationsIn(shared)).map((a) => a.contents)).toEqual(['shared']);

    await printDocument(doc, rows);
    expect((await annotationsIn(mockPrint.mock.calls[0][0].uri)).map((a) => a.contents)).toEqual(['shared']);
    // Without rows: the document's own file.
    await printDocument(doc);
    expect(mockPrint.mock.calls[1][0].uri).toBe(doc.pdfUri);
  });

  it('a submission of an imported PDF has the marks when the preset includes them, before its cover shifts the pages', async () => {
    const doc = await importedDoc('exp_submit');
    const rows = [note(doc, 1, 'for the teacher')];
    const base = { doc, profile: { name: 'Asha', roll: '12', section: 'A', institution: 'College' }, n: 1, annotations: rows };
    const preset = { ...defaultSubmitPreset(null), sizeLimitBytes: null };

    const without = await submitDocument({ ...base, preset: { ...preset, includeAnnotations: false }, fileName: 'plain' });
    expect(await annotationsIn(without.uri)).toEqual([]);

    const withMarks = await submitDocument({ ...base, preset: { ...preset, includeAnnotations: true }, fileName: 'marked' });
    const found = await annotationsIn(withMarks.uri);
    expect(found.map((a) => a.contents)).toEqual(['for the teacher']);
    // On the document's second page, wherever a cover put it.
    const pageCount = (await PDFDocument.load(await new File(withMarks.uri).bytes())).getPageCount();
    expect(found[0].page).toBe(pageCount);
  });

  it("a filled form's copy keeps the marks as the copy's own annotations", async () => {
    const doc = await importedDoc('exp_form');
    const copy = await saveFilledForm({ doc }, {}, { flatten: false }, [note(doc, 0, 'keep me')]);
    expect(copy.id).not.toBe(doc.id);
    expect((await annotationsIn(copy.pdfUri!)).map((a) => a.contents)).toEqual(['keep me']);
    // Not "ours" there: the copy has no rows, and a Mark session in it must not remove them.
    expect(await oursIn(copy.pdfUri!)).toBe(0);
  });
});

describe('§18 W14 backup and restore', () => {
  beforeEach(async () => {
    await resetStorage();
    new Directory(Paths.document, 'library').delete();
    if (backupDir().exists) backupDir().delete();
  });

  it("the backup's readable PDF has the marks; the manifest says which documents", async () => {
    const marked = await importedDoc('bk_marked');
    const plain = await importedDoc('bk_plain');
    await syncLibrary(
      await getDb(),
      { documents: [], courses: [], semesters: [], timetable: [] },
      { documents: [{ ...marked, name: 'Marked' }, { ...plain, name: 'Plain' }], courses: [], semesters: [], timetable: [], annotations: [note(marked, 0, 'in the backup')] }
    );
    const result = await createBackup({ scope: { kind: 'all' }, include: 'everything' });
    expect(result.manifest.annotated).toEqual(['bk_marked']);

    const reader = openZip(result.file);
    const out = new File(Paths.cache, `readable_${Math.random()}.pdf`);
    try {
      const entry = reader.entry(result.manifest.readable.bk_marked.path)!;
      out.write(reader.readBytes(entry));
    } finally {
      reader.close();
    }
    expect((await annotationsIn(out.uri)).map((a) => a.contents)).toEqual(['in the backup']);
    // The library's own file was not written.
    expect(await oursIn(marked.pdfUri!)).toBe(0);
  });

  it('a restore settles what the readable copy brought', async () => {
    const tables = (documents: object[], annotations: object[]) => ({ tables: { documents, annotations } }) as unknown as Parameters<typeof restoredPdfsToSettle>[1];
    const imported = { id: 'new_a', source_kind: 'imported_pdf', pdf_path: 'library/new_a/document.pdf' };
    const scan = { id: 'new_b', source_kind: null, pdf_path: 'library/new_b/document.pdf' };
    const unmarked = { id: 'new_c', source_kind: 'imported_pdf', pdf_path: 'library/new_c/document.pdf' };
    const full = {
      ...tables([imported, scan, unmarked], [{ document_id: 'new_a' }, { document_id: 'new_b' }]),
      documents: [],
    };
    // A full restore: every document that has rows gives up its file's copies, a scan too.
    expect(restoredPdfsToSettle({ restorable: 'full' }, full)).toEqual([
      { path: 'library/new_a/document.pdf', how: 'remove' },
      { path: 'library/new_b/document.pdf', how: 'remove' },
    ]);

    // "PDFs only": no rows come back, so the marks stay in the file as its own.
    const pdfs = {
      ...tables([imported, unmarked], []),
      documents: [
        { sourceId: 'old_a', targetId: 'new_a', action: 'insert', name: 'A' },
        { sourceId: 'old_c', targetId: 'new_c', action: 'insert', name: 'C' },
      ],
    } as unknown as Parameters<typeof restoredPdfsToSettle>[1];
    expect(restoredPdfsToSettle({ restorable: 'pdfs', annotated: ['old_a'] }, pdfs)).toEqual([{ path: 'library/new_a/document.pdf', how: 'release' }]);
    expect(restoredPdfsToSettle({ restorable: 'pdfs' }, pdfs)).toEqual([]);
  });

  it('removes ours from a restored file, or releases them', async () => {
    const doc = await importedDoc('bk_settle');
    await updatePdfAnnotations(doc, [note(doc, 0, 'baked')]);
    const copy = new File(Paths.cache, `settle_${Math.random()}.pdf`);
    new File(doc.pdfUri!).copySync(copy);

    expect(await settleOurAnnotations(copy.uri, 'release')).toBe(1);
    expect((await annotationsIn(copy.uri)).map((a) => a.contents)).toEqual(['baked']);
    expect(await oursIn(copy.uri)).toBe(0);

    expect(await settleOurAnnotations(doc.pdfUri!, 'remove')).toBe(1);
    expect(await annotationsIn(doc.pdfUri!)).toEqual([]);
    // Nothing of ours left: the file is not rewritten again.
    const at = new File(doc.pdfUri!).lastModified;
    await new Promise((resolve) => setTimeout(resolve, 15));
    expect(await settleOurAnnotations(doc.pdfUri!, 'remove')).toBe(0);
    expect(new File(doc.pdfUri!).lastModified).toBe(at);
    expect(NM_PREFIX).toBe('pdfscan:');
  });
});
