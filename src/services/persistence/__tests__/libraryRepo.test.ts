import { makeDoc, makePage } from '../../../test/fixtures';
import { resetStorage } from '../../../test/db';
import { getDb, searchDocumentsByText } from '../dbService';
import {
  archiveSemester,
  deleteSemesters,
  diffById,
  documentEdited,
  hasDeferredBlocks,
  loadAll,
  loadPageOcr,
  reorderCourses,
  syncLibrary,
  type LoadedLibrary,
} from '../libraryRepo';
import type { Course, PageOcr, Semester } from '../../../types/models';

beforeEach(resetStorage);

const course: Course = { id: 'c1', name: 'Chemistry', color: 'teal', archived: false, sortOrder: 0, createdAt: 1 };

async function seed(library: LoadedLibrary): Promise<LoadedLibrary> {
  await syncLibrary(await getDb(), { documents: [], courses: [], semesters: [], timetable: [] }, library);
  return library;
}

describe('diffById', () => {
  it('reports new, replaced and removed items by identity', () => {
    const a = { id: 'a' };
    const b = { id: 'b' };
    const b2 = { id: 'b' };
    const c = { id: 'c' };
    expect(diffById([a, b], [b2, c])).toEqual({ changed: [b2, c], removedIds: ['a'] });
    expect(diffById([a, b], [a, b])).toEqual({ changed: [], removedIds: [] });
  });
});

describe('libraryRepo', () => {
  it('round-trips documents, pages and courses', async () => {
    const doc = makeDoc({
      courseId: 'c1',
      star: true,
      tag: 'HW',
      coverKind: 'template',
      pages: [makePage({ ocr: { text: 'hello', blocks: [] }, ocrFailed: true }), makePage({ displayUri: 'file:///x/display.jpg' })],
    });
    await seed({ documents: [doc], courses: [course], semesters: [], timetable: [] });

    const loaded = await loadAll(await getDb());
    expect(loaded.courses).toEqual([course]);
    expect(loaded.documents[0]).toEqual({ ...doc, contentUri: undefined, sourceKind: undefined });
  });

  it("keeps a page's full-page layout (ID cards) through a save and reload", async () => {
    const doc = makeDoc({ pages: [makePage({ layout: 'fullPage' }), makePage()] });
    await seed({ documents: [doc], courses: [], semesters: [], timetable: [] });
    const loaded = await loadAll(await getDb());
    expect(loaded.documents[0].pages.map((p) => p.layout)).toEqual(['fullPage', undefined]);
  });

  it('stores paths relative to the document directory', async () => {
    const doc = makeDoc();
    await seed({ documents: [doc], courses: [], semesters: [], timetable: [] });
    const row = await (await getDb()).getFirstAsync<{ pdf_path: string }>('SELECT pdf_path FROM documents');
    expect(row?.pdf_path).toBe(`library/${doc.id}/document.pdf`);
  });

  it('writes only the changed document when one is starred', async () => {
    const docs = [makeDoc({ id: 'a' }), makeDoc({ id: 'b' }), makeDoc({ id: 'c' })];
    const prev = await seed({ documents: docs, courses: [], semesters: [], timetable: [] });
    const db = await getDb();
    const spy = jest.spyOn(db, 'runAsync');

    const next = { ...prev, documents: prev.documents.map((d) => (d.id === 'b' ? { ...d, star: true } : d)) };
    await syncLibrary(db, prev, next);

    const docWrites = spy.mock.calls.filter(([sql]) => /INSERT INTO documents/.test(sql));
    expect(docWrites).toHaveLength(1);
    expect(docWrites[0][1]).toContain('b');
    const loaded = await loadAll(db);
    expect(loaded.documents.filter((d) => d.star).map((d) => d.id)).toEqual(['b']);
  });

  it('applies renames and deletions', async () => {
    const prev = await seed({ documents: [makeDoc({ id: 'a' }), makeDoc({ id: 'b' })], courses: [], semesters: [], timetable: [] });
    const next = { courses: [], semesters: [], timetable: [], documents: [{ ...prev.documents[0], name: 'Renamed' }] };
    await syncLibrary(await getDb(), prev, next);

    const loaded = await loadAll(await getDb());
    expect(loaded.documents.map((d) => [d.id, d.name])).toEqual([['a', 'Renamed']]);
    const pages = await (await getDb()).getAllAsync('SELECT * FROM pages WHERE document_id = ?', ['b']);
    expect(pages).toEqual([]);
  });

  it('moves documents to Unsorted when their course is deleted', async () => {
    const prev = await seed({ documents: [makeDoc({ id: 'a', courseId: 'c1' })], courses: [course], semesters: [], timetable: [] });
    // Even without the reducer clearing courseId, the foreign key falls back to Unsorted.
    await syncLibrary(await getDb(), prev, { documents: prev.documents, courses: [], semesters: [], timetable: [] });
    const loaded = await loadAll(await getDb());
    expect(loaded.courses).toEqual([]);
    expect(loaded.documents[0].courseId).toBeUndefined();
  });

  it('keeps the full-text index in step with page rewrites', async () => {
    const prev = await seed({
      documents: [makeDoc({ id: 'a', pages: [makePage({ ocr: { text: 'mitochondria', blocks: [] } })] })],
      courses: [], semesters: [], timetable: [],
    });
    expect(await searchDocumentsByText('mito')).toEqual(['a']);

    const next = {
      courses: [], semesters: [], timetable: [],
      documents: [{ ...prev.documents[0], pages: [makePage({ ocr: { text: 'ribosome', blocks: [] } })] }],
    };
    await syncLibrary(await getDb(), prev, next);
    expect(await searchDocumentsByText('mito')).toEqual([]);
    expect(await searchDocumentsByText('ribo')).toEqual(['a']);
  });

  it('treats LIKE wildcards in the query literally', async () => {
    await seed({ documents: [makeDoc({ id: 'a', name: '100% done' }), makeDoc({ id: 'b', name: '1000 done' })], courses: [], semesters: [], timetable: [] });
    expect(await searchDocumentsByText('100%')).toEqual(['a']);
    expect(await searchDocumentsByText('_')).toEqual([]);
  });
});

describe('courses and semesters', () => {
  const fall: Semester = { id: 's_fall', name: 'Fall 2026', startsOn: '2026-09-01', endsOn: '2026-12-20', archived: false, createdAt: 1 };
  const spring: Semester = { id: 's_spring', name: 'Spring 2027', startsOn: '2027-01-10', archived: false, createdAt: 2 };
  const courseIn = (id: string, sortOrder: number, semesterId?: string): Course => ({
    id,
    name: id.toUpperCase(),
    color: 'blue',
    semesterId,
    archived: false,
    sortOrder,
    createdAt: sortOrder,
  });

  it('round-trips semesters, every course field and docType', async () => {
    const full: Course = { ...courseIn('math', 0, 's_fall'), code: 'MA101', emoji: '📐', teacher: 'Dr. Noether', color: 'purple' };
    const doc = makeDoc({ courseId: 'math', docType: 'exam' });
    await seed({ semesters: [fall, spring], timetable: [], courses: [full], documents: [doc, makeDoc({ id: 'untyped' })] });

    const loaded = await loadAll(await getDb());
    expect(loaded.semesters).toEqual([spring, fall]); // newest start first
    expect(loaded.courses).toEqual([full]);
    expect(loaded.documents.find((d) => d.id === doc.id)?.docType).toBe('exam');
    expect(loaded.documents.find((d) => d.id === 'untyped')?.docType).toBeUndefined();
  });

  it("keeps a course's submit preset, and changes to it (migration v5)", async () => {
    const preset = {
      sizeLimitBytes: 2_000_000,
      coverTemplateId: 'assignment' as const,
      footerPreset: 'namePages' as const,
      border: false,
      pageSize: 'Letter' as const,
      layout: 'standard' as const,
      nameTemplate: '{roll}_{course}_{type}{n}',
    };
    const before = { documents: [], semesters: [], timetable: [], courses: [courseIn('cse', 0)] };
    await seed(before);
    expect((await loadAll(await getDb())).courses[0].submitPreset).toBeUndefined();

    const after = { ...before, courses: [{ ...before.courses[0], submitPreset: preset }] };
    await syncLibrary(await getDb(), before, after);
    expect((await loadAll(await getDb())).courses[0].submitPreset).toEqual(preset);
  });

  it("keeps a course's recognition script, and clearing it (migration v12)", async () => {
    const before = { documents: [], semesters: [], timetable: [], courses: [courseIn('chem', 0)] };
    await seed(before);
    expect((await loadAll(await getDb())).courses[0].ocrScript).toBeUndefined();

    const chinese = { ...before, courses: [{ ...before.courses[0], ocrScript: 'chinese' as const }] };
    await syncLibrary(await getDb(), before, chinese);
    expect((await loadAll(await getDb())).courses[0].ocrScript).toBe('chinese');

    const cleared = { ...before, courses: [{ ...before.courses[0], ocrScript: undefined }] };
    await syncLibrary(await getDb(), chinese, cleared);
    expect((await loadAll(await getDb())).courses[0].ocrScript).toBeUndefined();
  });

  it('reads an unknown stored recognition script as the app default', async () => {
    await seed({ documents: [], semesters: [], timetable: [], courses: [courseIn('chem', 0)] });
    const db = await getDb();
    await db.runAsync('UPDATE courses SET ocr_script = ?', ['klingon']);
    expect((await loadAll(db)).courses[0].ocrScript).toBeUndefined();
  });

  it('archiveSemester archives the semester and only its courses', async () => {
    await seed({
      semesters: [fall, spring], timetable: [],
      courses: [courseIn('a', 0, 's_fall'), courseIn('b', 1, 's_fall'), courseIn('c', 2, 's_spring'), courseIn('d', 3)],
      documents: [makeDoc({ id: 'doc_a', courseId: 'a' })],
    });

    await archiveSemester(await getDb(), 's_fall');

    const loaded = await loadAll(await getDb());
    expect(loaded.semesters.map((s) => [s.id, s.archived])).toEqual([
      ['s_spring', false],
      ['s_fall', true],
    ]);
    expect(loaded.courses.map((c) => [c.id, c.archived])).toEqual([
      ['a', true],
      ['b', true],
      ['c', false],
      ['d', false],
    ]);
    // Documents keep their course and stay in the library.
    expect(loaded.documents.map((d) => [d.id, d.courseId])).toEqual([['doc_a', 'a']]);
  });

  it('reorderCourses rewrites sort_order and loadAll follows it', async () => {
    await seed({ semesters: [], timetable: [], courses: [courseIn('a', 0), courseIn('b', 1), courseIn('c', 2)], documents: [] });
    await reorderCourses(await getDb(), ['c', 'a', 'b']);
    expect((await loadAll(await getDb())).courses.map((c) => [c.id, c.sortOrder])).toEqual([
      ['c', 0],
      ['a', 1],
      ['b', 2],
    ]);
  });

  it('deleting a semester keeps its courses, with no semester', async () => {
    await seed({ semesters: [fall], timetable: [], courses: [courseIn('a', 0, 's_fall')], documents: [] });
    await deleteSemesters(await getDb(), ['s_fall']);
    const loaded = await loadAll(await getDb());
    expect(loaded.semesters).toEqual([]);
    expect(loaded.courses.map((c) => [c.id, c.semesterId])).toEqual([['a', undefined]]);
  });

  it('syncLibrary writes a new semester before the course that references it', async () => {
    const prev = await seed({ semesters: [], timetable: [], courses: [], documents: [] });
    await syncLibrary(await getDb(), prev, { semesters: [fall], timetable: [], courses: [courseIn('a', 0, 's_fall')], documents: [] });
    expect((await loadAll(await getDb())).courses[0].semesterId).toBe('s_fall');
  });
});

describe('timetable', () => {
  const math: Course = { id: 'math', name: 'Math', color: 'teal', archived: false, sortOrder: 0, createdAt: 0 };
  const monday = { id: 'slot1', courseId: 'math', weekday: 1, startMin: 540, endMin: 630 };
  const friday = { id: 'slot2', courseId: 'math', weekday: 5, startMin: 600, endMin: 660 };

  it('round-trips slots in weekday order and applies edits and removals', async () => {
    const prev = await seed({ documents: [], courses: [math], semesters: [], timetable: [friday, monday] });
    expect((await loadAll(await getDb())).timetable).toEqual([monday, friday]);

    const moved = { ...friday, startMin: 615 };
    await syncLibrary(await getDb(), prev, { ...prev, timetable: [moved] });
    expect((await loadAll(await getDb())).timetable).toEqual([moved]);
  });

  it("a course's class times are deleted with it", async () => {
    const prev = await seed({ documents: [], courses: [math], semesters: [], timetable: [monday] });
    await syncLibrary(await getDb(), prev, { ...prev, courses: [], timetable: [monday] });
    expect((await loadAll(await getDb())).timetable).toEqual([]);
  });
});

// §8: reading a document (the page it's on) or the integrity check's flag isn't an edit; it must
// not move updated_at, which backups and the backup reminder go by.
describe('documents.updated_at', () => {
  const updatedAt = async (id: string) =>
    (await (await getDb()).getFirstAsync<{ updated_at: number }>('SELECT updated_at FROM documents WHERE id = ?', [id]))!.updated_at;

  it('stays when only the last page or the missing-files flag changes, moves on an edit', async () => {
    const doc = makeDoc({ id: 'd1' });
    const empty: LoadedLibrary = { documents: [], courses: [], semesters: [], timetable: [] };
    const saved: LoadedLibrary = { ...empty, documents: [doc] };
    await syncLibrary(await getDb(), empty, saved);
    await (await getDb()).runAsync("UPDATE documents SET updated_at = 1000 WHERE id = 'd1'");

    const read: LoadedLibrary = { ...empty, documents: [{ ...doc, lastPage: 7, missingFiles: true }] };
    await syncLibrary(await getDb(), saved, read);
    expect(await updatedAt('d1')).toBe(1000);
    const loaded = await loadAll(await getDb());
    expect(loaded.documents[0]).toMatchObject({ lastPage: 7, missingFiles: true });

    const renamed: LoadedLibrary = { ...empty, documents: [{ ...read.documents[0], name: 'Renamed' }] };
    await syncLibrary(await getDb(), read, renamed);
    expect(await updatedAt('d1')).toBeGreaterThan(1000);
  });

  it('documentEdited ignores bookkeeping only', () => {
    const doc = makeDoc();
    expect(documentEdited(doc, { ...doc, lastPage: 3, missingFiles: true, pdfInfoFailed: true })).toBe(false);
    expect(documentEdited(doc, { ...doc })).toBe(false);
    expect(documentEdited(doc, { ...doc, star: true })).toBe(true);
    expect(documentEdited(doc, { ...doc, pages: [...doc.pages] })).toBe(true);
  });
});

// §16 G4: the load reads a page's text and leaves its word boxes (ocr_json) in the database.
describe('word boxes on demand', () => {
  const empty: LoadedLibrary = { documents: [], courses: [], semesters: [], timetable: [] };
  const B = { left: 1, top: 2, width: 30, height: 4 };
  const boxes = (text: string): PageOcr => ({
    text,
    blocks: [{ text, bounding: B, lines: [{ text, bounding: B, words: [{ text, bounding: B }] }] }],
  });
  const storedOcr = async (pageId: string): Promise<PageOcr | null> => {
    const row = await (await getDb()).getFirstAsync<{ ocr_json: string | null }>('SELECT ocr_json FROM pages WHERE id = ?', [pageId]);
    return row?.ocr_json ? (JSON.parse(row.ocr_json) as PageOcr) : null;
  };
  // A document with boxes on p1, text only on p2 and nothing on p3, saved and loaded again.
  async function savedAndLoaded(): Promise<LoadedLibrary> {
    const doc = makeDoc({
      id: 'd1',
      pages: [makePage({ id: 'p1', ocr: boxes('alpha') }), makePage({ id: 'p2', ocr: { text: 'plain', blocks: [] } }), makePage({ id: 'p3' })],
    });
    await seed({ ...empty, documents: [doc] });
    return loadAll(await getDb());
  }

  it('loadAll reads the text, not the boxes', async () => {
    const db = await getDb();
    const queries = jest.spyOn(db, 'getAllAsync');
    const loaded = await savedAndLoaded();

    const pageSql = queries.mock.calls.map(([sql]) => sql).filter((sql) => /FROM pages\b/.test(sql));
    expect(pageSql).toHaveLength(1);
    expect(pageSql[0]).not.toContain('*');
    // Only asked whether there are any.
    expect(pageSql[0].replace('ocr_json IS NOT NULL', '')).not.toContain('ocr_json');
    expect(loaded.documents[0].pages.map((p) => p.ocr)).toEqual([
      { text: 'alpha', blocks: [], blocksRow: 'p1' },
      { text: 'plain', blocks: [] },
      undefined,
    ]);
    queries.mockRestore();
  });

  it('loadPageOcr returns the blocks, and only touches the pages that were waiting', async () => {
    const { pages } = (await savedAndLoaded()).documents[0];
    expect(hasDeferredBlocks(pages)).toBe(true);

    const withBoxes = await loadPageOcr(await getDb(), pages);
    expect(withBoxes[0].ocr).toEqual(boxes('alpha'));
    expect(withBoxes[1]).toBe(pages[1]);
    expect(withBoxes[2]).toBe(pages[2]);
    expect(hasDeferredBlocks(withBoxes)).toBe(false);
    // Nothing left to load: the same array back, no query.
    expect(await loadPageOcr(await getDb(), withBoxes)).toBe(withBoxes);
  });

  it('a page whose stored boxes are unreadable keeps its text and stops asking', async () => {
    const { pages } = (await savedAndLoaded()).documents[0];
    await (await getDb()).runAsync("UPDATE pages SET ocr_json = '{broken' WHERE id = 'p1'");
    expect((await loadPageOcr(await getDb(), pages))[0].ocr).toEqual({ text: 'alpha', blocks: [] });
  });

  it('saving pages whose boxes were never loaded keeps the boxes', async () => {
    const loaded = await savedAndLoaded();
    const [doc] = loaded.documents;
    const reordered = { ...doc, pages: [doc.pages[2], doc.pages[0], doc.pages[1]] };
    await syncLibrary(await getDb(), loaded, { ...loaded, documents: [reordered] });

    expect(await storedOcr('p1')).toEqual(boxes('alpha'));
    expect(await storedOcr('p2')).toBeNull();
    const again = await loadAll(await getDb());
    expect(again.documents[0].pages.map((p) => p.id)).toEqual(['p3', 'p1', 'p2']);
    expect(again.documents[0].pages[1].ocr).toEqual({ text: 'alpha', blocks: [], blocksRow: 'p1' });
    expect(await searchDocumentsByText('alpha')).toEqual(['d1']);
  });

  it('a copy under a new id takes the boxes with it, and keeps them once the original is gone', async () => {
    const loaded = await savedAndLoaded();
    const [doc] = loaded.documents;
    // copyPageInto: the same page under a new id, its boxes still in the original's row.
    const copy = makeDoc({ id: 'd2', pages: [{ ...doc.pages[0], id: 'p9' }] });
    const withCopy = { ...loaded, documents: [copy, doc] };
    await syncLibrary(await getDb(), loaded, withCopy);
    expect(await storedOcr('p9')).toEqual(boxes('alpha'));

    // The original goes; later the copy's pages are written again, still naming the original.
    const alone = { ...loaded, documents: [copy] };
    await syncLibrary(await getDb(), withCopy, alone);
    await syncLibrary(await getDb(), alone, { ...loaded, documents: [{ ...copy, pages: [...copy.pages, makePage({ id: 'p10' })] }] });
    expect(await storedOcr('p9')).toEqual(boxes('alpha'));
    expect((await loadPageOcr(await getDb(), copy.pages))[0].ocr).toEqual(boxes('alpha'));
  });

  it('a merge keeps the boxes of a page that moves as its document is deleted', async () => {
    const loaded = await savedAndLoaded();
    const [doc] = loaded.documents;
    // library/REPLACE_FILES: the source is removed and its pages, ids kept, are the new document's.
    const merged = makeDoc({ id: 'merged', pages: [doc.pages[0], doc.pages[1]] });
    await syncLibrary(await getDb(), loaded, { ...loaded, documents: [merged] });

    expect(await storedOcr('p1')).toEqual(boxes('alpha'));
    const again = await loadAll(await getDb());
    expect(again.documents.map((d) => d.id)).toEqual(['merged']);
  });

  it('loading the boxes into the state is not a change to write', async () => {
    const loaded = await savedAndLoaded();
    const [doc] = loaded.documents;
    const db = await getDb();
    await db.runAsync("UPDATE documents SET updated_at = 1000 WHERE id = 'd1'");
    const rowid = async () => (await db.getFirstAsync<{ rowid: number }>("SELECT rowid FROM pages WHERE id = 'p1'"))!.rowid;
    const before = await rowid();
    const opened = { ...doc, pages: [...(await loadPageOcr(db, doc.pages))] };
    expect(documentEdited(doc, opened)).toBe(false);

    const transactions = jest.spyOn(db, 'withTransactionAsync');
    await syncLibrary(db, loaded, { ...loaded, documents: [opened] });
    expect(transactions).not.toHaveBeenCalled();
    transactions.mockRestore();

    // With the page the Reader is on: the document row is written, its pages are left alone.
    await syncLibrary(db, loaded, { ...loaded, documents: [{ ...opened, lastPage: 2 }] });
    expect(await rowid()).toBe(before);
    expect(await storedOcr('p1')).toEqual(boxes('alpha'));
    const row = await db.getFirstAsync<{ updated_at: number; last_page: number }>("SELECT updated_at, last_page FROM documents WHERE id = 'd1'");
    expect(row).toEqual({ updated_at: 1000, last_page: 2 });
  });

  it('a page recognised again after its boxes were loaded is written', async () => {
    const loaded = await savedAndLoaded();
    const [doc] = loaded.documents;
    const again = { ...doc, pages: [{ ...doc.pages[0], ocr: boxes('beta') }, doc.pages[1], doc.pages[2]] };
    expect(documentEdited(doc, again)).toBe(true);
    await syncLibrary(await getDb(), loaded, { ...loaded, documents: [again] });
    expect(await storedOcr('p1')).toEqual(boxes('beta'));
    expect(await searchDocumentsByText('beta')).toEqual(['d1']);
    expect(await searchDocumentsByText('alpha')).toEqual([]);
  });
});

describe('deleting rows', () => {
  it('removes many documents in batches of 500, with their pages', async () => {
    const docs = Array.from({ length: 1201 }, (_, i) => makeDoc({ id: `d${i}`, pages: [makePage({ id: `p${i}` })] }));
    const empty: LoadedLibrary = { documents: [], courses: [], semesters: [], timetable: [] };
    const saved = await seed({ ...empty, documents: docs });
    const db = await getDb();
    const runs = jest.spyOn(db, 'runAsync');
    await syncLibrary(db, saved, { ...empty, documents: [docs[0]] });

    const deletes = runs.mock.calls.filter(([sql]) => sql.startsWith('DELETE FROM documents'));
    expect(deletes.map(([, params]) => (params as unknown as string[]).length)).toEqual([500, 500, 200]);
    runs.mockRestore();
    expect(await db.getAllAsync('SELECT id FROM documents')).toEqual([{ id: 'd0' }]);
    expect(await db.getAllAsync('SELECT id FROM pages')).toEqual([{ id: 'p0' }]);
  });

  it("keeps a document's failed-PDF mark only while its layout is unknown", async () => {
    const empty: LoadedLibrary = { documents: [], courses: [], semesters: [], timetable: [] };
    const doc = makeDoc({ id: 'd1', pdfInfoFailed: true });
    const saved = await seed({ ...empty, documents: [doc] });
    expect((await loadAll(await getDb())).documents[0].pdfInfoFailed).toBe(true);

    await syncLibrary(await getDb(), saved, { ...empty, documents: [{ ...doc, pdfLayout: 'standard' }] });
    const [reloaded] = (await loadAll(await getDb())).documents;
    expect(reloaded).toMatchObject({ pdfLayout: 'standard', pdfInfoFailed: undefined });
  });
});
