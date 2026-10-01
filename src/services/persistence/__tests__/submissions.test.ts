import { makeDoc } from '../../../test/fixtures';
import { resetStorage } from '../../../test/db';
import { getDb } from '../dbService';
import { deleteCourses, deleteDocuments, insertSubmission, listSubmissions, loadAll, syncLibrary, type LoadedLibrary } from '../libraryRepo';
import { getSchemaVersion } from '../migrations';
import type { Course, Submission } from '../../../types/models';

beforeEach(resetStorage);

const cse: Course = { id: 'cse', name: 'CSE 101', color: 'teal', archived: false, sortOrder: 0, createdAt: 1 };
const phy: Course = { id: 'phy', name: 'Physics', color: 'blue', archived: false, sortOrder: 1, createdAt: 2 };
const hw = makeDoc({ id: 'hw3', courseId: 'cse', docType: 'assignment' });
const lab = makeDoc({ id: 'lab1', courseId: 'phy', docType: 'lab' });

function sub(id: string, documentId: string, courseId: string | undefined, createdAt: number): Submission {
  return {
    id,
    documentId,
    courseId,
    fileName: `${documentId}.pdf`,
    sizeBytes: 1_500_000,
    sizeLimitBytes: 2_000_000,
    pageCount: 10,
    createdAt,
    preset: {
      sizeLimitBytes: 2_000_000,
      coverTemplateId: 'assignment',
      footerPreset: 'namePages',
      border: false,
      pageSize: 'A4',
      layout: 'standard',
    },
    typeNumber: 3,
  };
}

async function seed(): Promise<LoadedLibrary> {
  const library: LoadedLibrary = { documents: [hw, lab], courses: [cse, phy], semesters: [], timetable: [] };
  await syncLibrary(await getDb(), { documents: [], courses: [], semesters: [], timetable: [] }, library);
  return library;
}

describe('submissions (migration v6)', () => {
  it('is at schema 6 or later', async () => {
    expect(await getSchemaVersion(await getDb())).toBeGreaterThanOrEqual(6);
  });

  it('inserts and lists newest first, by course or document', async () => {
    await seed();
    const db = await getDb();
    await insertSubmission(db, sub('s1', 'hw3', 'cse', 100));
    await insertSubmission(db, sub('s2', 'hw3', 'cse', 200));
    await insertSubmission(db, sub('s3', 'lab1', 'phy', 150));

    expect((await listSubmissions(db)).map((s) => s.id)).toEqual(['s2', 's3', 's1']);
    expect((await listSubmissions(db, { courseId: 'cse' })).map((s) => s.id)).toEqual(['s2', 's1']);
    expect((await listSubmissions(db, { documentId: 'lab1' })).map((s) => s.id)).toEqual(['s3']);
    expect((await listSubmissions(db, { courseId: 'cse', documentId: 'lab1' }))).toEqual([]);
    expect((await listSubmissions(db, { documentId: 'hw3' }))[0]).toEqual(sub('s2', 'hw3', 'cse', 200));
  });

  it("are deleted with their document, and a deleted course leaves them Unsorted", async () => {
    await seed();
    const db = await getDb();
    await insertSubmission(db, sub('s1', 'hw3', 'cse', 100));
    await insertSubmission(db, sub('s2', 'lab1', 'phy', 200));

    await deleteDocuments(db, ['hw3']);
    expect((await listSubmissions(db)).map((s) => s.id)).toEqual(['s2']);

    await deleteCourses(db, ['phy']);
    expect((await listSubmissions(db))[0].courseId).toBeUndefined();
  });

  it('load and sync like the rest of the library', async () => {
    const before = await seed();
    const after = { ...before, submissions: [sub('s2', 'hw3', 'cse', 200), sub('s1', 'hw3', 'cse', 100)] };
    await syncLibrary(await getDb(), before, after);
    expect((await loadAll(await getDb())).submissions).toEqual(after.submissions);

    const removed = { ...after, documents: [lab], submissions: [] };
    await syncLibrary(await getDb(), after, removed);
    expect((await loadAll(await getDb())).submissions).toEqual([]);
  });
});

describe('deadlines (migration v7)', () => {
  const d = {
    id: 'dl1',
    courseId: 'cse',
    title: 'HW3',
    dueAt: 2_000,
    docType: 'assignment' as const,
    reminderIds: ['n1', 'n2'],
    createdAt: 1_000,
  };

  it('round-trip, and go with their course', async () => {
    const before = await seed();
    const after = { ...before, deadlines: [d, { ...d, id: 'dl2', courseId: 'phy', docType: undefined, reminderIds: [], doneSubmissionId: 's9' }] };
    await syncLibrary(await getDb(), before, after);
    expect((await loadAll(await getDb())).deadlines).toEqual(after.deadlines);

    await deleteCourses(await getDb(), ['cse']);
    expect((await loadAll(await getDb())).deadlines?.map((x) => x.id)).toEqual(['dl2']);
  });
});
