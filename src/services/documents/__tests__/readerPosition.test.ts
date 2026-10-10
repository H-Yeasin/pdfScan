import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { ScreenRoleContext, useScreenRole, type ScreenRole } from '../../../navigation/screenRole';
import {
  classifyNativePdfError,
  decodePosition,
  encodePosition,
  heldSubject,
  normalizePosition,
  openingPage,
  pageLabel,
  pagePosition,
  parseJumpInput,
  pdfPageAfterEdit,
  remapPositionPage,
  resumeSpot,
  samePosition,
  viewerPositionFor,
} from '../readerPosition';
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

describe('classifyNativePdfError', () => {
  it('tells a password apart from a file that can not be read', () => {
    expect(classifyNativePdfError('password')).toBe('password');
    expect(classifyNativePdfError('failed')).toBe('damaged');
    expect(classifyNativePdfError(undefined)).toBe('damaged');
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

// §18 W19: the exact position, for every format.
describe('encodePosition / decodePosition', () => {
  const positions = [
    { kind: 'page', pageId: 'p7', index: 6, fy: 0.25 },
    { kind: 'page', index: 2, fy: 0 },
    { kind: 'txt', chunk: 41, fy: 0.5 },
    { kind: 'sheet', sheet: 1, row: 320, col: 12 },
    { kind: 'docx', fraction: 0.75 },
  ] as const;

  it('round-trips every kind', () => {
    for (const position of positions) expect(decodePosition(encodePosition(position))).toEqual(position);
  });

  it('stores nothing for no position', () => {
    expect(encodePosition(undefined)).toBeNull();
    expect(decodePosition(null)).toBeUndefined();
    expect(decodePosition('')).toBeUndefined();
  });

  it('normalises what is out of range', () => {
    expect(normalizePosition({ kind: 'page', pageId: 'p1', index: 3.9, fy: 7 })).toEqual({ kind: 'page', pageId: 'p1', index: 3, fy: 1 });
    expect(normalizePosition({ kind: 'page', pageId: '', index: -4, fy: -1 })).toEqual({ kind: 'page', index: 0, fy: 0 });
    expect(normalizePosition({ kind: 'page', pageId: 12, index: 1, fy: 0.5 })).toEqual({ kind: 'page', index: 1, fy: 0.5 });
    expect(normalizePosition({ kind: 'docx', fraction: 1.5, extra: 'x' })).toEqual({ kind: 'docx', fraction: 1 });
    expect(normalizePosition({ kind: 'sheet', sheet: 0, row: 2.5, col: 1e12 })).toEqual({ kind: 'sheet', sheet: 0, row: 2, col: 10_000_000 });
  });

  it('gives up on damaged JSON', () => {
    const damaged = [
      '{',
      'null',
      '12',
      '"page"',
      '[]',
      '{}',
      '{"kind":"comic","index":1}',
      '{"kind":"page","index":"3","fy":0}',
      '{"kind":"page","index":3}',
      '{"kind":"page","index":null,"fy":0}',
      '{"kind":"txt","chunk":1,"fy":"NaN"}',
      '{"kind":"sheet","sheet":0,"row":1}',
      '{"kind":"docx"}',
      `{"kind":"docx","fraction":0.5,"pad":"${'x'.repeat(2000)}"}`,
    ];
    for (const json of damaged) expect(decodePosition(json)).toBeUndefined();
    expect(decodePosition(12)).toBeUndefined();
    expect(decodePosition({ kind: 'docx', fraction: 0.5 })).toBeUndefined();
  });

  it('compares by value', () => {
    expect(samePosition({ kind: 'docx', fraction: 0.5 }, { kind: 'docx', fraction: 0.5 })).toBe(true);
    expect(samePosition({ kind: 'docx', fraction: 0.5 }, { kind: 'docx', fraction: 0.6 })).toBe(false);
    expect(samePosition(undefined, undefined)).toBe(true);
    expect(samePosition(undefined, { kind: 'docx', fraction: 0 })).toBe(false);
  });
});

describe('resumeSpot', () => {
  const doc = makeDoc({ pages: pagesOf('a', 'b', 'c', 'd') });

  it('finds the page by its id, wherever it is now', () => {
    expect(resumeSpot(doc, { kind: 'page', pageId: 'c', index: 0, fy: 0.4 })).toEqual({ index: 2, fy: 0.4 });
    // The same page after a cover was added in front, or the pages were reordered.
    const moved = makeDoc({ pages: pagesOf('cover', 'c', 'a', 'b', 'd') });
    expect(resumeSpot(moved, { kind: 'page', pageId: 'c', index: 2, fy: 0.4 })).toEqual({ index: 1, fy: 0.4 });
  });

  it('falls back on the index: no id, or a page deleted since', () => {
    expect(resumeSpot(undefined, { kind: 'page', index: 7, fy: 0.2 })).toEqual({ index: 7, fy: 0.2 });
    expect(resumeSpot(doc, { kind: 'page', index: 3, fy: 0.2 })).toEqual({ index: 3, fy: 0.2 });
    // Another page is at that index now: its top, not part-way down it.
    expect(resumeSpot(doc, { kind: 'page', pageId: 'gone', index: 1, fy: 0.9 })).toEqual({ index: 1, fy: 0 });
  });

  it('has nothing to say without a page position', () => {
    expect(resumeSpot(doc, undefined)).toBeUndefined();
    expect(resumeSpot(doc, { kind: 'docx', fraction: 0.5 })).toBeUndefined();
  });

  it('builds the position the surface saves', () => {
    expect(pagePosition(doc, 2, 0.5)).toEqual({ kind: 'page', pageId: 'c', index: 2, fy: 0.5 });
    expect(pagePosition(undefined, 2, 1.4)).toEqual({ kind: 'page', index: 2, fy: 1 });
    expect(pagePosition(doc, 9, 0)).toEqual({ kind: 'page', index: 9, fy: 0 });
  });
});

describe('viewerPositionFor', () => {
  it('gives each viewer only its own kind of position', () => {
    const sheet = { kind: 'sheet', sheet: 1, row: 3, col: 0 } as const;
    expect(viewerPositionFor('XLSX', sheet)).toBe(sheet);
    expect(viewerPositionFor('CSV', sheet)).toBe(sheet);
    expect(viewerPositionFor('TXT', sheet)).toBeUndefined();
    expect(viewerPositionFor('DOCX', { kind: 'docx', fraction: 0.3 })).toEqual({ kind: 'docx', fraction: 0.3 });
    expect(viewerPositionFor('TXT', { kind: 'txt', chunk: 2, fy: 0 })).toEqual({ kind: 'txt', chunk: 2, fy: 0 });
    expect(viewerPositionFor('PDF', { kind: 'page', index: 1, fy: 0 })).toBeUndefined();
    expect(viewerPositionFor(undefined, sheet)).toBeUndefined();
    expect(viewerPositionFor('DOCX', undefined)).toBeUndefined();
  });
});

describe('remapPositionPage', () => {
  const ids = new Map([['p1', 'new1']]);
  it('follows the page to its new id', () => {
    expect(decodePosition(remapPositionPage('{"kind":"page","pageId":"p1","index":0,"fy":0.5}', ids))).toEqual({ kind: 'page', pageId: 'new1', index: 0, fy: 0.5 });
  });
  it('keeps the index when the page did not come along', () => {
    expect(decodePosition(remapPositionPage('{"kind":"page","pageId":"p9","index":4,"fy":0.5}', ids))).toEqual({ kind: 'page', index: 4, fy: 0.5 });
  });
  it('leaves the other kinds alone and drops junk', () => {
    expect(decodePosition(remapPositionPage('{"kind":"docx","fraction":0.5}', ids))).toEqual({ kind: 'docx', fraction: 0.5 });
    expect(remapPositionPage('junk', ids)).toBeNull();
    expect(remapPositionPage(null, ids)).toBeNull();
  });
});

describe('library/SET_LAST_POSITION', () => {
  beforeEach(resetStorage);

  it('saves the position without touching the pages, and it survives a restart', async () => {
    const doc = makeDoc({ id: 'd1' });
    const before = { ...initialLibraryState, files: [doc] };
    const position = { kind: 'sheet', sheet: 2, row: 140, col: 6 } as const;
    const after = libraryReducer(before, { type: 'library/SET_LAST_POSITION', id: 'd1', position });
    expect(after.files[0].lastPosition).toEqual(position);
    expect(after.files[0].pages).toBe(doc.pages);
    // The same position again changes nothing (no write); nor does one for a document not here.
    expect(libraryReducer(after, { type: 'library/SET_LAST_POSITION', id: 'd1', position: { ...position } })).toBe(after);
    expect(libraryReducer(after, { type: 'library/SET_LAST_POSITION', id: 'nope', position })).toBe(after);

    const db = await getDb();
    const empty = { documents: [], courses: [], semesters: [], timetable: [] };
    await syncLibrary(db, empty, { ...empty, documents: [doc] });
    await db.runAsync("UPDATE documents SET updated_at = 1000 WHERE id = 'd1'");
    await syncLibrary(db, { ...empty, documents: [doc] }, { ...empty, documents: after.files });
    expect((await loadAll(db)).documents[0].lastPosition).toEqual(position);
    // Reading isn't editing: backups compare updated_at.
    expect(await db.getFirstAsync("SELECT updated_at FROM documents WHERE id = 'd1'")).toEqual({ updated_at: 1000 });
  });

  it('reads a damaged row as "never read"', async () => {
    const doc = makeDoc({ id: 'd1' });
    const db = await getDb();
    const empty = { documents: [], courses: [], semesters: [], timetable: [] };
    await syncLibrary(db, empty, { ...empty, documents: [doc] });
    await db.runAsync("UPDATE documents SET last_position = '{\"kind\":\"page\",\"index\":' WHERE id = 'd1'");
    expect((await loadAll(db)).documents[0].lastPosition).toBeUndefined();
  });
});
