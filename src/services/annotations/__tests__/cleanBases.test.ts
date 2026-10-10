import { File, Paths } from 'expo-file-system';
import { makeTextPdf } from '../../../test/pdfs';
import { updatePdfAnnotations } from '../../../test/bakeAnnotations';
import type { Annotation, LibraryDocument, LibraryPage } from '../../../types/models';
import { CLEAN_MAX_TRIES, isBasePending, parseCleanState, planClean, runClean, setPendingBases, type CleanState } from '../cleanBases';
import { settleOurAnnotations } from '../exportPdf';

const row = (documentId: string) => ({ documentId });
const doc = (id: string, pdfUri?: string) => ({ id, pdfUri });

function io(over: Partial<Parameters<typeof runClean>[1]> = {}) {
  const saved: CleanState[] = [];
  const cleaned: string[] = [];
  return {
    saved,
    cleaned,
    io: {
      pdfUriOf: (id: string) => `file:///library/${id}/document.pdf`,
      clean: async (uri: string) => {
        cleaned.push(uri);
        return 1;
      },
      save: async (state: CleanState) => {
        saved.push(state);
      },
      ...over,
    },
  };
}

describe('§18 W17 cleaning document.pdf of what older builds wrote into it', () => {
  afterEach(() => setPendingBases({ pending: {} }));

  it('plans the documents that have a PDF and rows, and skips the rest', () => {
    const files = [doc('marked', 'a.pdf'), doc('plain', 'b.pdf'), doc('noPdf'), doc('alsoMarked', 'c.pdf')];
    expect(planClean(files, [row('marked'), row('marked'), row('noPdf'), row('alsoMarked'), row('gone')])).toEqual({
      pending: { marked: 0, alsoMarked: 0 },
    });
    expect(planClean(files, [])).toEqual({ pending: {} });
  });

  it('reads the stored list, and takes anything else as never planned', () => {
    expect(parseCleanState(JSON.stringify({ pending: { a: 0, b: 2 } }))).toEqual({ pending: { a: 0, b: 2 } });
    // Done: an empty list is still a plan, so nothing is planned again.
    expect(parseCleanState(JSON.stringify({ pending: {} }))).toEqual({ pending: {} });
    expect(parseCleanState(JSON.stringify({ pending: { a: 'x', b: 1 } }))).toEqual({ pending: { b: 1 } });
    expect(parseCleanState(null)).toBeNull();
    expect(parseCleanState('')).toBeNull();
    expect(parseCleanState('not json')).toBeNull();
    expect(parseCleanState(JSON.stringify({ pending: ['a'] }))).toBeNull();
  });

  it('cleans one document at a time and stores the list after each', async () => {
    let running = 0;
    let most = 0;
    const run = io({
      clean: async () => {
        running += 1;
        most = Math.max(most, running);
        await new Promise((resolve) => setTimeout(resolve, 1));
        running -= 1;
        return 2;
      },
    });
    const done: [string, number][] = [];
    const end = await runClean({ pending: { a: 0, b: 0, c: 0 } }, { ...run.io, onCleaned: (id, removed) => done.push([id, removed]) });
    expect(most).toBe(1);
    expect(end).toEqual({ pending: {} });
    expect(run.saved).toEqual([{ pending: { b: 0, c: 0 } }, { pending: { c: 0 } }, { pending: {} }]);
    expect(done).toEqual([['a', 2], ['b', 2], ['c', 2]]);
  });

  it('carries on from the stored list after a run that was cut short', async () => {
    const controller = new AbortController();
    const first = io();
    const stopped = await runClean(
      { pending: { a: 0, b: 0, c: 0 } },
      {
        ...first.io,
        signal: controller.signal,
        save: async (state) => {
          first.saved.push(state);
          controller.abort();
        },
      }
    );
    expect(stopped).toEqual({ pending: { b: 0, c: 0 } });
    expect(first.cleaned).toHaveLength(1);

    // The next start reads what was stored and does the rest, not the first one again.
    const second = io();
    const stored = parseCleanState(JSON.stringify(first.saved[first.saved.length - 1]))!;
    expect(await runClean(stored, second.io)).toEqual({ pending: {} });
    expect(second.cleaned).toEqual(['file:///library/b/document.pdf', 'file:///library/c/document.pdf']);
  });

  it('keeps a document that failed for the next start, a few times, and goes on with the others', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const failing = io({
      clean: async (uri) => {
        if (uri.includes('/bad/')) throw new Error('encrypted');
        return 0;
      },
    });
    let state: CleanState = { pending: { bad: 0, good: 0 } };
    for (let start = 1; start < CLEAN_MAX_TRIES; start++) {
      state = await runClean(state, failing.io);
      expect(state).toEqual({ pending: { bad: start } });
    }
    expect(await runClean(state, failing.io)).toEqual({ pending: {} });
    warn.mockRestore();
  });

  it('drops a document that was deleted since the plan', async () => {
    const run = io({ pdfUriOf: (id) => (id === 'gone' ? undefined : `file:///library/${id}/document.pdf`) });
    expect(await runClean({ pending: { gone: 0, here: 0 } }, run.io)).toEqual({ pending: {} });
    expect(run.cleaned).toEqual(['file:///library/here/document.pdf']);
  });

  it('says which documents are still to do while it runs', async () => {
    setPendingBases({ pending: { a: 0, b: 0 } });
    const seen: boolean[][] = [];
    const run = io({
      clean: async () => {
        seen.push([isBasePending('a'), isBasePending('b')]);
        return 1;
      },
    });
    await runClean({ pending: { a: 0, b: 0 } }, run.io);
    expect(seen).toEqual([[true, true], [false, true]]);
    expect([isBasePending('a'), isBasePending('b')]).toEqual([false, false]);
  });

  it('takes what an older build wrote out of a real file, and leaves the file a readable PDF', async () => {
    const source = await makeTextPdf(['Page 1', 'Page 2']);
    const dest = new File(Paths.document, 'library', 'clean_real', 'document.pdf');
    if (!dest.parentDirectory.exists) dest.parentDirectory.create({ intermediates: true });
    if (dest.exists) dest.delete();
    new File(source).copySync(dest);
    const pages: LibraryPage[] = [0, 1].map((i) => ({ id: `cr_p${i}`, fileUri: '', thumbUri: 't', width: 1224, height: 1584 }));
    const library: LibraryDocument = {
      id: 'clean_real', name: 'Real', format: 'PDF', mode: 'doc', pages, pdfUri: dest.uri, sizeBytes: 0, createdAt: 1, star: false, tag: 'PDF',
      locked: false, sourceKind: 'imported_pdf', pdfLayout: 'standard', indexedAt: 1, indexState: 'done',
    };
    const note: Annotation = { id: 'n1', documentId: library.id, pageId: 'cr_p0', kind: 'note', color: 'note', data: { x: 10, y: 10 }, text: 'old', createdAt: 1, updatedAt: 1 };
    await updatePdfAnnotations(library, [note]);

    const removed: number[] = [];
    const end = await runClean(planClean([library], [note]), {
      pdfUriOf: () => library.pdfUri,
      clean: (uri) => settleOurAnnotations(uri, 'remove'),
      save: async () => undefined,
      onCleaned: (_id, count) => removed.push(count),
    });
    expect(end).toEqual({ pending: {} });
    expect(removed).toEqual([1]);
    // Clean now: a second pass finds nothing and rewrites nothing.
    expect(await settleOurAnnotations(library.pdfUri!, 'remove')).toBe(0);
  });
});
