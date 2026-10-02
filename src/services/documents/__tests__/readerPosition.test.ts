import { classifyPdfError, parseJumpInput, resumePage } from '../readerPosition';
import { initialLibraryState, libraryReducer } from '../../../store/slices/librarySlice';
import { makeDoc } from '../../../test/fixtures';
import { resetStorage } from '../../../test/db';
import { getDb } from '../../persistence/dbService';
import { loadAll, syncLibrary } from '../../persistence/libraryRepo';

describe('resumePage', () => {
  it('opens where the student left off', () => {
    expect(resumePage(12, 40, false)).toBe(12);
  });
  it('lets a search hit or bookmark win', () => {
    expect(resumePage(12, 40, true)).toBeNull();
  });
  it('stays on page 1 when there is nothing to resume', () => {
    expect(resumePage(undefined, 40, false)).toBeNull();
    expect(resumePage(1, 40, false)).toBeNull();
    expect(resumePage(12, 0, false)).toBeNull();
  });
  it('opens at the last page when pages were deleted since', () => {
    expect(resumePage(12, 5, false)).toBe(5);
  });
});

describe('parseJumpInput', () => {
  it('takes a page number in range', () => {
    expect(parseJumpInput('7', 40)).toBe(7);
    expect(parseJumpInput(' 40 ', 40)).toBe(40);
  });
  it('refuses anything else', () => {
    for (const text of ['', '0', '41', '-3', '2.5', '1e1', 'abc', '3 4', '0x10']) expect(parseJumpInput(text, 40)).toBeNull();
  });
});

describe('classifyPdfError', () => {
  it("tells a password apart from a damaged file, from pdf-jsi's messages", () => {
    expect(classifyPdfError('Password required or incorrect password.')).toBe('password');
    expect(classifyPdfError('Load pdf failed. path=/x.pdf')).toBe('damaged');
    expect(classifyPdfError('cannot create document: File not in PDF format or corrupted.')).toBe('damaged');
    expect(classifyPdfError(undefined)).toBe('unknown');
    expect(classifyPdfError('{}')).toBe('unknown');
  });
});

describe('library/SET_LAST_PAGE', () => {
  beforeEach(resetStorage);

  it('saves the page without touching the pages, and it survives a restart', async () => {
    const doc = makeDoc({ id: 'd1' });
    const before = { ...initialLibraryState, files: [doc] };
    const after = libraryReducer(before, { type: 'library/SET_LAST_PAGE', id: 'd1', page: 12 });
    expect(after.files[0].lastPage).toBe(12);
    expect(after.files[0].pages).toBe(doc.pages);
    // The same page again changes nothing (no write).
    expect(libraryReducer(after, { type: 'library/SET_LAST_PAGE', id: 'd1', page: 12 }).files[0]).toBe(after.files[0]);

    const db = await getDb();
    const empty = { documents: [], courses: [], semesters: [], timetable: [] };
    await syncLibrary(db, empty, { ...empty, documents: before.files });
    await syncLibrary(db, { ...empty, documents: before.files }, { ...empty, documents: after.files });
    const [loaded] = (await loadAll(db)).documents;
    expect(loaded.lastPage).toBe(12);
    // The page rows were left alone, not rewritten.
    expect(loaded.pages.map((p) => p.id)).toEqual(doc.pages.map((p) => p.id));
  });
});
