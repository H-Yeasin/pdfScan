import { Directory, File, Paths } from 'expo-file-system';
import { makeDoc, makePage } from '../../../test/fixtures';
import { resetStorage } from '../../../test/db';
import { getDb } from '../../persistence/dbService';
import { documentIdsInDb, loadAll, syncLibrary } from '../../persistence/libraryRepo';
import { documentFilesMissing, emptyOldTrash, findOrphans, ORPHAN_MIN_AGE_MS, recoverInterruptedWrites, repair, TRASH_KEEP_MS, trashDir } from '../integrity';
import type { LibraryDocument } from '../../../types/models';

const LATER = () => Date.now() + ORPHAN_MIN_AGE_MS + 1000;

// A document whose PDF and page master exist on disk.
function writeDoc(overrides: Partial<LibraryDocument> = {}): LibraryDocument {
  const id = overrides.id ?? `doc_${Math.random().toString(36).slice(2)}`;
  const pdf = new File(Paths.document, 'library', id, 'document.pdf');
  pdf.write('%PDF-1.4');
  const master = new File(Paths.document, 'library', id, 'page_1.jpg');
  master.write('jpeg');
  return makeDoc({ id, pdfUri: pdf.uri, pages: [makePage({ fileUri: master.uri })], ...overrides });
}

beforeEach(async () => {
  await resetStorage();
  new Directory(Paths.document, 'library').delete();
});

describe('documentFilesMissing', () => {
  it('is false when the PDF and every master are there', () => {
    expect(documentFilesMissing(writeDoc())).toBe(false);
  });

  it('notices a missing PDF, master or Office original', () => {
    const doc = writeDoc();
    new File(doc.pages[0].fileUri).delete();
    expect(documentFilesMissing(doc)).toBe(true);
    expect(documentFilesMissing(writeDoc({ pdfUri: new File(Paths.document, 'library', 'gone', 'document.pdf').uri }))).toBe(true);
    expect(documentFilesMissing(writeDoc({ contentUri: new File(Paths.document, 'nowhere.docx').uri }))).toBe(true);
  });

  it("ignores imported PDFs' pages, which have no master, and missing thumbnails", () => {
    const doc = writeDoc();
    const imported = { ...doc, sourceKind: 'imported_pdf' as const, pages: [makePage({ fileUri: '', thumbUri: 'file:///gone/thumb.jpg' })] };
    expect(documentFilesMissing(imported)).toBe(false);
  });
});

describe('findOrphans', () => {
  it('finds a folder with no document, and leaves known ones alone', async () => {
    const kept = writeDoc();
    new File(Paths.document, 'library', 'doc_leftover', 'page_1.jpg').write('x');
    new File(Paths.document, 'library', 'doc_saved_only', 'page_1.jpg').write('x');

    const report = await findOrphans([kept], new Set(['doc_saved_only']), LATER());
    expect(report.orphanFolders).toEqual(['doc_leftover']);
    expect(report.missing).toEqual([]);
  });

  it("doesn't call a folder written moments ago left over (its save may not have reached the database)", async () => {
    new File(Paths.document, 'library', 'doc_new', 'page_1.jpg').write('x');
    expect((await findOrphans([], new Set())).orphanFolders).toEqual([]);
  });

  it('skips the trash, staging folders and the legacy Courses folder', async () => {
    new File(Paths.document, 'library', '.trash', '1_doc_a', 'x.jpg').write('x');
    new File(Paths.document, 'library', '.incoming', 'doc_b', 'x.jpg').write('x');
    new Directory(Paths.document, 'library', 'Courses').create({ intermediates: true });
    expect((await findOrphans([], new Set(), LATER())).orphanFolders).toEqual([]);
  });

  it('reports documents whose files went missing, and flagged ones whose files are back', async () => {
    const gone = writeDoc();
    new Directory(Paths.document, 'library', gone.id).delete();
    const back = writeDoc({ missingFiles: true });
    const stillGone = { ...gone, id: 'doc_still', missingFiles: true };

    const report = await findOrphans([gone, back, stillGone], new Set());
    expect(report.missing).toEqual([gone.id]);
    expect(report.restored).toEqual([back.id]);
  });
});

describe('repair', () => {
  it('moves left-over folders to the trash instead of deleting them', async () => {
    new File(Paths.document, 'library', 'doc_leftover', 'page_1.jpg').write('scan');
    const now = LATER();
    await repair({ orphanFolders: ['doc_leftover'], missing: [], restored: [] }, now);

    expect(new Directory(Paths.document, 'library', 'doc_leftover').exists).toBe(false);
    expect(new File(trashDir(), `${now}_doc_leftover`, 'page_1.jpg').exists).toBe(true);
  });

  it('empties trash older than a week, and only what it put there', async () => {
    const now = Date.now();
    new File(trashDir(), `${now - TRASH_KEEP_MS - 1}_doc_old`, 'x.jpg').write('x');
    new File(trashDir(), `${now - 1000}_doc_recent`, 'x.jpg').write('x');
    new File(trashDir(), 'not-ours', 'x.jpg').write('x');
    emptyOldTrash(now);

    expect(new Directory(trashDir(), `${now - TRASH_KEEP_MS - 1}_doc_old`).exists).toBe(false);
    expect(new Directory(trashDir(), `${now - 1000}_doc_recent`).exists).toBe(true);
    expect(new Directory(trashDir(), 'not-ours').exists).toBe(true);
  });

  it('returns flag changes and never deletes a row', async () => {
    const gone = writeDoc();
    const back = writeDoc({ missingFiles: true });
    const db = await getDb();
    await syncLibrary(db, { documents: [], courses: [], semesters: [], timetable: [] }, { documents: [gone, back], courses: [], semesters: [], timetable: [] });
    new Directory(Paths.document, 'library', gone.id).delete();

    const report = await findOrphans([gone, back], await documentIdsInDb(db));
    expect(await repair(report)).toEqual([
      { id: gone.id, missingFiles: true },
      { id: back.id, missingFiles: false },
    ]);
    expect([...(await documentIdsInDb(db))].sort()).toEqual([gone.id, back.id].sort());
  });
});

describe('documents.missing_files', () => {
  it('round-trips through the database', async () => {
    const doc = writeDoc({ missingFiles: true });
    const db = await getDb();
    await syncLibrary(db, { documents: [], courses: [], semesters: [], timetable: [] }, { documents: [doc], courses: [], semesters: [], timetable: [] });
    expect((await loadAll(db)).documents[0].missingFiles).toBe(true);
  });
});

describe('recoverInterruptedWrites (§18 W3)', () => {
  const folder = (id: string) => new Directory(Paths.document, 'library', id);

  it('puts a complete temporary file in place when the file itself is gone', async () => {
    const doc = writeDoc({ id: 'doc_killed' });
    new File(doc.pdfUri!).delete();
    new File(folder(doc.id), '.document.pdf.tmp-w_abc_1').write('%PDF-new');
    expect(documentFilesMissing(doc)).toBe(true);

    expect(await recoverInterruptedWrites()).toBe(1);
    expect(await new File(doc.pdfUri!).text()).toBe('%PDF-new');
    expect(documentFilesMissing(doc)).toBe(false);
    expect(folder(doc.id).list().map((e) => e.name).sort()).toEqual(['document.pdf', 'page_1.jpg']);
  });

  it('deletes a temporary file whose write never finished', async () => {
    const doc = writeDoc({ id: 'doc_half' });
    new File(folder(doc.id), '.document.pdf.tmp-w_abc_2').write('%PDF-ha');
    expect(await recoverInterruptedWrites()).toBe(0);
    expect(await new File(doc.pdfUri!).text()).toBe('%PDF-1.4');
    expect(folder(doc.id).list().map((e) => e.name).sort()).toEqual(['document.pdf', 'page_1.jpg']);
  });

  it('leaves every other file alone', async () => {
    const doc = writeDoc({ id: 'doc_plain' });
    new File(folder(doc.id), 'document.cover.tmp.pdf').write('cover');
    expect(await recoverInterruptedWrites()).toBe(0);
    expect(folder(doc.id).list()).toHaveLength(3);
  });
});
