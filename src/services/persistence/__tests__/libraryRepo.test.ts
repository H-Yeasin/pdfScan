import { makeDoc, makePage } from '../../../test/fixtures';
import { resetStorage } from '../../../test/db';
import { getDb, searchDocumentsByText } from '../dbService';
import { diffById, loadAll, syncLibrary, type LoadedLibrary } from '../libraryRepo';
import type { Course } from '../../../types/models';

beforeEach(resetStorage);

const course: Course = { id: 'c1', name: 'Chemistry', archived: false, createdAt: 1 };

async function seed(library: LoadedLibrary): Promise<LoadedLibrary> {
  await syncLibrary(await getDb(), { documents: [], courses: [] }, library);
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
    await seed({ documents: [doc], courses: [course] });

    const loaded = await loadAll(await getDb());
    expect(loaded.courses).toEqual([course]);
    expect(loaded.documents[0]).toEqual({ ...doc, searchHaystack: 'scan hello ', contentUri: undefined, sourceKind: undefined });
  });

  it("keeps a page's full-page layout (ID cards) through a save and reload", async () => {
    const doc = makeDoc({ pages: [makePage({ layout: 'fullPage' }), makePage()] });
    await seed({ documents: [doc], courses: [] });
    const loaded = await loadAll(await getDb());
    expect(loaded.documents[0].pages.map((p) => p.layout)).toEqual(['fullPage', undefined]);
  });

  it('stores paths relative to the document directory', async () => {
    const doc = makeDoc();
    await seed({ documents: [doc], courses: [] });
    const row = await (await getDb()).getFirstAsync<{ pdf_path: string }>('SELECT pdf_path FROM documents');
    expect(row?.pdf_path).toBe(`library/${doc.id}/document.pdf`);
  });

  it('writes only the changed document when one is starred', async () => {
    const docs = [makeDoc({ id: 'a' }), makeDoc({ id: 'b' }), makeDoc({ id: 'c' })];
    const prev = await seed({ documents: docs, courses: [] });
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
    const prev = await seed({ documents: [makeDoc({ id: 'a' }), makeDoc({ id: 'b' })], courses: [] });
    const next = { courses: [], documents: [{ ...prev.documents[0], name: 'Renamed' }] };
    await syncLibrary(await getDb(), prev, next);

    const loaded = await loadAll(await getDb());
    expect(loaded.documents.map((d) => [d.id, d.name])).toEqual([['a', 'Renamed']]);
    const pages = await (await getDb()).getAllAsync('SELECT * FROM pages WHERE document_id = ?', ['b']);
    expect(pages).toEqual([]);
  });

  it('moves documents to Unsorted when their course is deleted', async () => {
    const prev = await seed({ documents: [makeDoc({ id: 'a', courseId: 'c1' })], courses: [course] });
    // Even without the reducer clearing courseId, the foreign key falls back to Unsorted.
    await syncLibrary(await getDb(), prev, { documents: prev.documents, courses: [] });
    const loaded = await loadAll(await getDb());
    expect(loaded.courses).toEqual([]);
    expect(loaded.documents[0].courseId).toBeUndefined();
  });

  it('keeps the full-text index in step with page rewrites', async () => {
    const prev = await seed({
      documents: [makeDoc({ id: 'a', pages: [makePage({ ocr: { text: 'mitochondria', blocks: [] } })] })],
      courses: [],
    });
    expect(await searchDocumentsByText('mito')).toEqual(['a']);

    const next = {
      courses: [],
      documents: [{ ...prev.documents[0], pages: [makePage({ ocr: { text: 'ribosome', blocks: [] } })] }],
    };
    await syncLibrary(await getDb(), prev, next);
    expect(await searchDocumentsByText('mito')).toEqual([]);
    expect(await searchDocumentsByText('ribo')).toEqual(['a']);
  });

  it('treats LIKE wildcards in the query literally', async () => {
    await seed({ documents: [makeDoc({ id: 'a', name: '100% done' }), makeDoc({ id: 'b', name: '1000 done' })], courses: [] });
    expect(await searchDocumentsByText('100%')).toEqual(['a']);
    expect(await searchDocumentsByText('_')).toEqual([]);
  });
});
