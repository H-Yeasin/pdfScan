import { makeDoc, makePage } from '../../../test/fixtures';
import { resetStorage } from '../../../test/db';
import { getDb, searchDocumentsByText } from '../dbService';
import { archiveSemester, deleteSemesters, diffById, loadAll, reorderCourses, syncLibrary, type LoadedLibrary } from '../libraryRepo';
import type { Course, Semester } from '../../../types/models';

beforeEach(resetStorage);

const course: Course = { id: 'c1', name: 'Chemistry', color: 'teal', archived: false, sortOrder: 0, createdAt: 1 };

async function seed(library: LoadedLibrary): Promise<LoadedLibrary> {
  await syncLibrary(await getDb(), { documents: [], courses: [], semesters: [] }, library);
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
    await seed({ documents: [doc], courses: [course], semesters: [] });

    const loaded = await loadAll(await getDb());
    expect(loaded.courses).toEqual([course]);
    expect(loaded.documents[0]).toEqual({ ...doc, searchHaystack: 'scan hello ', contentUri: undefined, sourceKind: undefined });
  });

  it("keeps a page's full-page layout (ID cards) through a save and reload", async () => {
    const doc = makeDoc({ pages: [makePage({ layout: 'fullPage' }), makePage()] });
    await seed({ documents: [doc], courses: [], semesters: [] });
    const loaded = await loadAll(await getDb());
    expect(loaded.documents[0].pages.map((p) => p.layout)).toEqual(['fullPage', undefined]);
  });

  it('stores paths relative to the document directory', async () => {
    const doc = makeDoc();
    await seed({ documents: [doc], courses: [], semesters: [] });
    const row = await (await getDb()).getFirstAsync<{ pdf_path: string }>('SELECT pdf_path FROM documents');
    expect(row?.pdf_path).toBe(`library/${doc.id}/document.pdf`);
  });

  it('writes only the changed document when one is starred', async () => {
    const docs = [makeDoc({ id: 'a' }), makeDoc({ id: 'b' }), makeDoc({ id: 'c' })];
    const prev = await seed({ documents: docs, courses: [], semesters: [] });
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
    const prev = await seed({ documents: [makeDoc({ id: 'a' }), makeDoc({ id: 'b' })], courses: [], semesters: [] });
    const next = { courses: [], semesters: [], documents: [{ ...prev.documents[0], name: 'Renamed' }] };
    await syncLibrary(await getDb(), prev, next);

    const loaded = await loadAll(await getDb());
    expect(loaded.documents.map((d) => [d.id, d.name])).toEqual([['a', 'Renamed']]);
    const pages = await (await getDb()).getAllAsync('SELECT * FROM pages WHERE document_id = ?', ['b']);
    expect(pages).toEqual([]);
  });

  it('moves documents to Unsorted when their course is deleted', async () => {
    const prev = await seed({ documents: [makeDoc({ id: 'a', courseId: 'c1' })], courses: [course], semesters: [] });
    // Even without the reducer clearing courseId, the foreign key falls back to Unsorted.
    await syncLibrary(await getDb(), prev, { documents: prev.documents, courses: [], semesters: [] });
    const loaded = await loadAll(await getDb());
    expect(loaded.courses).toEqual([]);
    expect(loaded.documents[0].courseId).toBeUndefined();
  });

  it('keeps the full-text index in step with page rewrites', async () => {
    const prev = await seed({
      documents: [makeDoc({ id: 'a', pages: [makePage({ ocr: { text: 'mitochondria', blocks: [] } })] })],
      courses: [], semesters: [],
    });
    expect(await searchDocumentsByText('mito')).toEqual(['a']);

    const next = {
      courses: [], semesters: [],
      documents: [{ ...prev.documents[0], pages: [makePage({ ocr: { text: 'ribosome', blocks: [] } })] }],
    };
    await syncLibrary(await getDb(), prev, next);
    expect(await searchDocumentsByText('mito')).toEqual([]);
    expect(await searchDocumentsByText('ribo')).toEqual(['a']);
  });

  it('treats LIKE wildcards in the query literally', async () => {
    await seed({ documents: [makeDoc({ id: 'a', name: '100% done' }), makeDoc({ id: 'b', name: '1000 done' })], courses: [], semesters: [] });
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
    await seed({ semesters: [fall, spring], courses: [full], documents: [doc, makeDoc({ id: 'untyped' })] });

    const loaded = await loadAll(await getDb());
    expect(loaded.semesters).toEqual([spring, fall]); // newest start first
    expect(loaded.courses).toEqual([full]);
    expect(loaded.documents.find((d) => d.id === doc.id)?.docType).toBe('exam');
    expect(loaded.documents.find((d) => d.id === 'untyped')?.docType).toBeUndefined();
  });

  it('archiveSemester archives the semester and only its courses', async () => {
    await seed({
      semesters: [fall, spring],
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
    await seed({ semesters: [], courses: [courseIn('a', 0), courseIn('b', 1), courseIn('c', 2)], documents: [] });
    await reorderCourses(await getDb(), ['c', 'a', 'b']);
    expect((await loadAll(await getDb())).courses.map((c) => [c.id, c.sortOrder])).toEqual([
      ['c', 0],
      ['a', 1],
      ['b', 2],
    ]);
  });

  it('deleting a semester keeps its courses, with no semester', async () => {
    await seed({ semesters: [fall], courses: [courseIn('a', 0, 's_fall')], documents: [] });
    await deleteSemesters(await getDb(), ['s_fall']);
    const loaded = await loadAll(await getDb());
    expect(loaded.semesters).toEqual([]);
    expect(loaded.courses.map((c) => [c.id, c.semesterId])).toEqual([['a', undefined]]);
  });

  it('syncLibrary writes a new semester before the course that references it', async () => {
    const prev = await seed({ semesters: [], courses: [], documents: [] });
    await syncLibrary(await getDb(), prev, { semesters: [fall], courses: [courseIn('a', 0, 's_fall')], documents: [] });
    expect((await loadAll(await getDb())).courses[0].semesterId).toBe('s_fall');
  });
});
