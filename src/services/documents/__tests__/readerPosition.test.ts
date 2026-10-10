import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { ScreenRoleContext, useScreenRole, type ScreenRole } from '../../../navigation/screenRole';
import { classifyPdfError, heldSubject, openingPage, pageLabel, parseJumpInput, pdfPageAfterEdit } from '../readerPosition';
import { initialLibraryState, libraryReducer } from '../../../store/slices/librarySlice';
import { makeDoc, makePage } from '../../../test/fixtures';
import { resetStorage } from '../../../test/db';
import { getDb } from '../../persistence/dbService';
import { loadAll, syncLibrary } from '../../persistence/libraryRepo';

describe('openingPage', () => {
  it('opens where the student left off', () => {
    expect(openingPage(12)).toBe(12);
    expect(openingPage(12, null)).toBe(12);
  });
  it('lets a search hit or bookmark win', () => {
    expect(openingPage(12, 3)).toBe(3);
    expect(openingPage(undefined, 7)).toBe(7);
  });
  it('is page 1 (undefined) when there is nothing to resume', () => {
    expect(openingPage(undefined)).toBeUndefined();
    expect(openingPage(1)).toBeUndefined();
    expect(openingPage(0)).toBeUndefined();
    expect(openingPage(12, 1)).toBeUndefined();
  });
});

describe('heldSubject', () => {
  it('follows the store only while the Reader is on screen', () => {
    expect(heldSubject('active', 'b', 'a')).toBe('b');
    expect(heldSubject('hidden', 'b', 'a')).toBe('a');
    expect(heldSubject('outgoing', 'b', 'a')).toBe('a');
  });
  it('has nothing to show when it was never on screen', () => {
    expect(heldSubject('hidden', 'b', null)).toBeNull();
    expect(heldSubject('outgoing', 'b', null)).toBeNull();
  });
  it('counts a Reader outside any layer as on screen (the role default)', () => {
    let role: ScreenRole | undefined;
    function Probe() {
      role = useScreenRole();
      return null;
    }
    act(() => {
      create(createElement(Probe));
    });
    expect(role).toBe('active');
    act(() => {
      create(createElement(ScreenRoleContext.Provider, { value: 'hidden' }, createElement(Probe)));
    });
    expect(role).toBe('hidden');
  });
});

const pagesOf = (...ids: string[]) => ids.map((id) => makePage({ id }));

describe('pdfPageAfterEdit', () => {
  const before = makeDoc({ pages: pagesOf('a', 'b', 'c', 'd', 'e') });
  it('follows the page through a reorder', () => {
    const after = makeDoc({ pages: pagesOf('d', 'a', 'b', 'c', 'e') });
    expect(pdfPageAfterEdit(before, after, 4)).toBe(1);
    expect(pdfPageAfterEdit(before, after, 1)).toBe(2);
  });
  it('stays put when pages were turned or added at the end', () => {
    expect(pdfPageAfterEdit(before, makeDoc({ pages: pagesOf('a', 'b', 'c', 'd', 'e', 'f') }), 3)).toBe(3);
  });
  it('goes to the next kept page when the page was deleted, else the one before', () => {
    expect(pdfPageAfterEdit(before, makeDoc({ pages: pagesOf('a', 'b', 'e') }), 3)).toBe(3);
    expect(pdfPageAfterEdit(before, makeDoc({ pages: pagesOf('a', 'b', 'c') }), 5)).toBe(3);
  });
  it('maps through a cover and a 2-in-1 layout that a rebuild drops', () => {
    // Cover + two sheets: PDF page 3 holds library pages d and e.
    const twoUp = makeDoc({ pages: pagesOf('cover', 'b', 'c', 'd', 'e'), coverKind: 'template', pdfLayout: '2_in_1' });
    const rebuilt = makeDoc({ pages: pagesOf('cover', 'c', 'b', 'd', 'e') });
    expect(pdfPageAfterEdit(twoUp, rebuilt, 3)).toBe(4);
    expect(pdfPageAfterEdit(twoUp, rebuilt, 1)).toBe(1);
  });
  it('clamps when no page is shared', () => {
    expect(pdfPageAfterEdit(before, makeDoc({ pages: pagesOf('x', 'y') }), 5)).toBe(2);
  });
});

describe('pageLabel', () => {
  it('is the PDF page for a file from outside', () => {
    expect(pageLabel(undefined, 3, 10)).toEqual({ first: 3, last: 3, count: 10, library: false });
  });
  it('is the library page for a standard document', () => {
    expect(pageLabel(makeDoc({ pages: pagesOf('a', 'b', 'c') }), 2, 3)).toEqual({ first: 2, last: 2, count: 3, library: true });
  });
  it('names both pages of a 2-in-1 sheet, like the page strip', () => {
    const doc = makeDoc({ pages: pagesOf('a', 'b', 'c', 'd', 'e'), pdfLayout: '2_in_1' });
    expect(pageLabel(doc, 1, 3)).toEqual({ first: 1, last: 2, count: 5, library: true });
    expect(pageLabel(doc, 2, 3)).toEqual({ first: 3, last: 4, count: 5, library: true });
    // The last sheet holds one page.
    expect(pageLabel(doc, 3, 3)).toEqual({ first: 5, last: 5, count: 5, library: true });
  });
  it('counts a cover as page 1', () => {
    const doc = makeDoc({ pages: pagesOf('cover', 'a', 'b', 'c'), coverKind: 'template', pdfLayout: '2_in_1' });
    expect(pageLabel(doc, 1, 3)).toEqual({ first: 1, last: 1, count: 4, library: true });
    expect(pageLabel(doc, 2, 3)).toEqual({ first: 2, last: 3, count: 4, library: true });
  });
  it("falls back to PDF pages while the page list doesn't match the PDF", () => {
    // An imported PDF the indexer hasn't counted yet: one placeholder page.
    expect(pageLabel(makeDoc({ pages: pagesOf('a') }), 7, 30)).toEqual({ first: 7, last: 7, count: 30, library: false });
    expect(pageLabel(makeDoc({ pages: [] }), 1, 1).library).toBe(false);
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
