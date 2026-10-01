import { makeDoc, makePage } from '../../../test/fixtures';
import { resetStorage } from '../../../test/db';
import { initialReaderState, readerReducer } from '../../../store/slices/readerSlice';
import { getDb, searchDocumentsByText, searchPages } from '../dbService';
import { syncLibrary } from '../libraryRepo';
import type { Course } from '../../../types/models';

beforeEach(resetStorage);

const bio: Course = { id: 'bio', name: 'Biology', color: 'green', archived: false, sortOrder: 0, createdAt: 1 };
const page = (id: string, text: string) => makePage({ id, ocr: { text, blocks: [] } });

async function seed() {
  const docs = [
    makeDoc({
      id: 'notes',
      courseId: 'bio',
      docType: 'notes',
      createdAt: 10,
      pages: [page('n1', 'Chapter one: cells'), page('n2', 'Photosynthesis turns light into sugar. Photosynthesis needs chlorophyll.')],
    }),
    makeDoc({ id: 'hw', courseId: 'bio', docType: 'assignment', createdAt: 20, pages: [page('h1', 'Question 2. Explain in your own words, with a diagram and at least two examples from the reading, how photosynthesis works')] }),
    makeDoc({ id: 'loose', createdAt: 30, pages: [page('l1', 'Unrelated "quoted" text about photosynthesis* and stars')] }),
  ];
  await syncLibrary(await getDb(), { documents: [], courses: [], semesters: [], timetable: [] }, {
    documents: docs,
    courses: [bio],
    semesters: [],
    timetable: [],
  });
}

describe('searchPages', () => {
  it('lists matching pages with their index and a marked snippet, best match first', async () => {
    await seed();
    const hits = await searchPages('photosynthesis');
    expect(hits.map((h) => h.pageId)).toHaveLength(3);
    // bm25: two mentions in a short page beat one in a long one.
    expect(hits[0]).toMatchObject({ documentId: 'notes', pageId: 'n2', idx: 1 });
    expect(hits[0].snippet).toContain('[Photosynthesis]');
    expect(hits.every((h, i) => i === 0 || h.rank >= hits[i - 1].rank)).toBe(true);
  });

  it('matches word prefixes', async () => {
    await seed();
    expect((await searchPages('photo')).length).toBe(3);
  });

  it('filters by course (null = Unsorted) and by type', async () => {
    await seed();
    expect((await searchPages('photosynthesis', { courseId: 'bio' })).map((h) => h.documentId).sort()).toEqual(['hw', 'notes']);
    expect((await searchPages('photosynthesis', { courseId: null })).map((h) => h.documentId)).toEqual(['loose']);
    expect((await searchPages('photosynthesis', { type: 'assignment' })).map((h) => h.pageId)).toEqual(['h1']);
    expect((await searchPages('photosynthesis', { type: 'other' })).map((h) => h.pageId)).toEqual(['l1']);
  });

  it('treats quotes and * as text, and an empty query as no results', async () => {
    await seed();
    expect((await searchPages('"quoted')).map((h) => h.pageId)).toEqual(['l1']);
    expect((await searchPages('stars*')).map((h) => h.pageId)).toEqual(['l1']);
    expect(await searchPages('   ')).toEqual([]);
  });

  it('agrees with the document search', async () => {
    await seed();
    const docIds = new Set((await searchPages('chlorophyll')).map((h) => h.documentId));
    expect([...docIds]).toEqual(await searchDocumentsByText('chlorophyll'));
  });

  it('respects the limit', async () => {
    await seed();
    expect(await searchPages('photosynthesis', { limit: 1 })).toHaveLength(1);
  });
});

describe('reader target', () => {
  it('is set for a page result and cleared by any other open', () => {
    let state = readerReducer(initialReaderState, { type: 'reader/SET_READER_ID', id: 'notes' });
    state = readerReducer(state, { type: 'reader/SET_TARGET', target: { pageId: 'n2', query: 'photosynthesis' } });
    expect(state.target).toEqual({ pageId: 'n2', query: 'photosynthesis' });
    state = readerReducer(state, { type: 'reader/SET_READER_ID', id: 'hw' });
    expect(state.target).toBeNull();
  });
});
