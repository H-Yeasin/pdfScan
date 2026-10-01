import { makeDoc } from '../../../test/fixtures';
import { resetStorage } from '../../../test/db';
import { initialLibraryState, libraryReducer } from '../../../store/slices/librarySlice';
import { getDb } from '../dbService';
import { deleteCourses, loadAll, syncLibrary, type LoadedLibrary } from '../libraryRepo';
import type { Course } from '../../../types/models';

beforeEach(resetStorage);

const cse: Course = { id: 'cse', name: 'CSE 101', color: 'teal', archived: false, sortOrder: 0, createdAt: 1 };

function libraryOf(state: typeof initialLibraryState): LoadedLibrary {
  return { documents: state.files, courses: state.courses, semesters: [], timetable: [] };
}

describe('organising existing documents (K6)', () => {
  it('moving 20 unsorted documents is one transaction', async () => {
    const docs = Array.from({ length: 20 }, (_, i) => makeDoc({ id: `old_${i}`, createdAt: i }));
    let state = libraryReducer(initialLibraryState, { type: 'library/SET_FILES', files: docs });
    state = libraryReducer(state, { type: 'library/SET_COURSES', courses: [cse] });
    const before = libraryOf(state);
    const db = await getDb();
    await syncLibrary(db, { documents: [], courses: [], semesters: [], timetable: [] }, before);

    state = libraryReducer(state, { type: 'library/ASSIGN_COURSE', ids: docs.map((d) => d.id), courseId: 'cse' });
    const spy = jest.spyOn(db, 'withTransactionAsync');
    await syncLibrary(db, before, libraryOf(state));
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();

    expect((await loadAll(db)).documents.every((d) => d.courseId === 'cse')).toBe(true);
  });

  it('archiving is kept, and deleting a course moves its archived documents to Unsorted, still archived', async () => {
    const docs = [makeDoc({ id: 'a', courseId: 'cse' }), makeDoc({ id: 'b', courseId: 'cse' })];
    let state = libraryReducer(initialLibraryState, { type: 'library/SET_FILES', files: docs });
    state = libraryReducer(state, { type: 'library/SET_COURSES', courses: [cse] });
    const empty = { documents: [], courses: [], semesters: [], timetable: [] };
    const db = await getDb();
    await syncLibrary(db, empty, libraryOf(state));

    const beforeArchive = libraryOf(state);
    state = libraryReducer(state, { type: 'library/SET_ARCHIVED', ids: ['a'], archived: true });
    await syncLibrary(db, beforeArchive, libraryOf(state));
    expect((await loadAll(db)).documents.find((d) => d.id === 'a')?.archived).toBe(true);

    // In state...
    const beforeDelete = libraryOf(state);
    state = libraryReducer(state, { type: 'library/DELETE_COURSE', id: 'cse' });
    expect(state.files.map((f) => [f.id, f.courseId, f.archived])).toEqual([
      ['a', undefined, true],
      ['b', undefined, undefined],
    ]);
    // ...and on disk.
    await syncLibrary(db, beforeDelete, libraryOf(state));
    const loaded = await loadAll(db);
    expect(loaded.courses).toEqual([]);
    expect(loaded.documents.map((d) => [d.id, d.courseId, d.archived]).sort()).toEqual([
      ['a', undefined, true],
      ['b', undefined, undefined],
    ]);
  });

  it('a course deleted directly in the database leaves archived documents archived', async () => {
    const db = await getDb();
    await syncLibrary(db, { documents: [], courses: [], semesters: [], timetable: [] }, {
      documents: [makeDoc({ id: 'x', courseId: 'cse', archived: true })],
      courses: [cse],
      semesters: [],
      timetable: [],
    });
    await deleteCourses(db, ['cse']);
    expect((await loadAll(db)).documents[0]).toMatchObject({ courseId: undefined, archived: true });
  });

  it('archive and unarchive', () => {
    let state = libraryReducer(initialLibraryState, { type: 'library/SET_FILES', files: [makeDoc({ id: 'a' }), makeDoc({ id: 'b' })] });
    state = libraryReducer(state, { type: 'library/SET_ARCHIVED', ids: ['a', 'b'], archived: true });
    expect(state.files.every((f) => f.archived)).toBe(true);
    state = libraryReducer(state, { type: 'library/SET_ARCHIVED', ids: ['a'], archived: false });
    expect(state.files.find((f) => f.id === 'a')?.archived).toBeUndefined();
  });
});
