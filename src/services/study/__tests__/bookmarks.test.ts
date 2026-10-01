import { makeDoc, makePage } from '../../../test/fixtures';
import { resetStorage } from '../../../test/db';
import { initialLibraryState, libraryReducer } from '../../../store/slices/librarySlice';
import { getDb } from '../../persistence/dbService';
import { deleteDocuments, loadAll, syncLibrary } from '../../persistence/libraryRepo';
import type { Bookmark } from '../../../types/models';
import { courseBookmarks, documentBookmarks } from '../bookmarks';

beforeEach(resetStorage);

const bm = (id: string, documentId: string, pageId: string, label?: string): Bookmark => ({ id, documentId, pageId, label, createdAt: 1 });

describe('bookmarks in the store', () => {
  it('adds one per page, labels and removes', () => {
    let state = libraryReducer(initialLibraryState, { type: 'library/ADD_BOOKMARK', bookmark: bm('b1', 'd', 'p1') });
    state = libraryReducer(state, { type: 'library/ADD_BOOKMARK', bookmark: bm('b2', 'd', 'p1') });
    expect(state.bookmarks.map((b) => b.id)).toEqual(['b1']);
    state = libraryReducer(state, { type: 'library/UPDATE_BOOKMARK', id: 'b1', label: '  Formula sheet ' });
    expect(state.bookmarks[0].label).toBe('Formula sheet');
    state = libraryReducer(state, { type: 'library/UPDATE_BOOKMARK', id: 'b1', label: ' ' });
    expect(state.bookmarks[0].label).toBeUndefined();
    state = libraryReducer(state, { type: 'library/REMOVE_BOOKMARK', id: 'b1' });
    expect(state.bookmarks).toEqual([]);
  });

  it('go with their document and their page', () => {
    let state = libraryReducer(initialLibraryState, { type: 'library/SET_FILES', files: [makeDoc({ id: 'd1' }), makeDoc({ id: 'd2' })] });
    state = libraryReducer(state, { type: 'library/SET_BOOKMARKS', bookmarks: [bm('a', 'd1', 'p1'), bm('b', 'd1', 'p2'), bm('c', 'd2', 'p1')] });
    state = libraryReducer(state, { type: 'library/UPDATE_FILE', id: 'd1', patch: { pages: [makePage({ id: 'p1' })] } });
    expect(state.bookmarks.map((b) => b.id)).toEqual(['a', 'c']);
    state = libraryReducer(state, { type: 'library/REMOVE_FILES', ids: ['d2'] });
    expect(state.bookmarks.map((b) => b.id)).toEqual(['a']);
  });
});

describe('bookmarks on disk (migration v11)', () => {
  it('round-trip and are deleted with their document', async () => {
    const doc = makeDoc({ id: 'd1', pages: [makePage({ id: 'p1' })] });
    const before = { documents: [doc], courses: [], semesters: [], timetable: [] };
    const db = await getDb();
    await syncLibrary(db, { documents: [], courses: [], semesters: [], timetable: [] }, before);
    const after = { ...before, bookmarks: [bm('b1', 'd1', 'p1', 'Exam topic')] };
    await syncLibrary(db, before, after);
    expect((await loadAll(db)).bookmarks).toEqual(after.bookmarks);
    await deleteDocuments(db, ['d1']);
    expect((await loadAll(db)).bookmarks).toEqual([]);
  });
});

describe('course bookmarks', () => {
  const pages = (n: number) => Array.from({ length: n }, (_, i) => makePage({ id: `p${i}` }));
  const older = makeDoc({ id: 'older', courseId: 'bio', createdAt: 1, pages: pages(5) });
  const newer = makeDoc({ id: 'newer', courseId: 'bio', createdAt: 2, pages: pages(5) });
  const other = makeDoc({ id: 'other', courseId: 'phy', createdAt: 3, pages: pages(2) });
  const marks = [bm('1', 'older', 'p3'), bm('2', 'newer', 'p4'), bm('3', 'older', 'p0'), bm('4', 'other', 'p1'), bm('5', 'newer', 'p1'), bm('6', 'older', 'gone')];

  it('lists the course across documents: newest document first, then page order, skipping missing pages', () => {
    expect(courseBookmarks(marks, [older, newer, other], 'bio').map((b) => `${b.doc.id}:${b.idx}`)).toEqual([
      'newer:1',
      'newer:4',
      'older:0',
      'older:3',
    ]);
    expect(courseBookmarks(marks, [older, newer, other], null)).toEqual([]);
    expect(documentBookmarks(marks, older).map((b) => b.idx)).toEqual([0, 3]);
  });
});
