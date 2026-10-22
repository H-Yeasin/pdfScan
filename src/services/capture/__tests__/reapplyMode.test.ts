import { appReducer, type AppAction } from '../../../store/appReducer';
import { initialAppState } from '../../../store/initialState';
import { historyUris } from '../../../store/pageHistory';
import type { SessionPage } from '../../../types/models';
import { reapplyMode, undoPostProcess, type ReapplyDeps } from '../reapplyMode';

// §17 U9: Review's Mode sheet re-makes the session for the new mode, as one undo step.

let ids = 0;
const createId = (prefix: string) => `${prefix}-${++ids}`;

function page(id: string, over: Partial<SessionPage> = {}): SessionPage {
  return { id, uri: `file:///cache/${id}.jpg`, thumbUri: `file:///cache/${id}-t.jpg`, width: 3000, height: 2000, rotation: 0, enhance: 'auto', ...over };
}

// A spread (wider than tall) splits into two new files; anything else stays.
function fakeDeps(): ReapplyDeps & { active: number; maxActive: number } {
  const deps = {
    active: 0,
    maxActive: 0,
    createId,
    splitSpreadPage: jest.fn(async (p: SessionPage, _script, enhance) => {
      deps.active++;
      deps.maxActive = Math.max(deps.maxActive, deps.active);
      await Promise.resolve();
      deps.active--;
      if (p.width <= p.height || p.splitFrom || p.idCard) return null;
      const splitFrom = { groupId: `g-${p.id}`, uri: p.uri, thumbUri: p.thumbUri, width: p.width, height: p.height };
      return ['L', 'R'].map((side) => ({ ...page(`${p.id}${side}`, { width: 1500, height: 2000, enhance }), splitFrom }));
    }),
    composeIdCardPages: jest.fn(async (run: SessionPage[]) => {
      const out: SessionPage[] = [];
      for (let i = 0; i < run.length; i += 2) {
        const [front, back] = [run[i], run[i + 1]];
        out.push(
          page(`card-${front.id}`, {
            width: 2480,
            height: 3508,
            enhance: front.enhance,
            idCard: { front: { uri: front.uri, width: front.width, height: front.height }, back: back ? { uri: back.uri, width: back.width, height: back.height } : undefined },
          })
        );
      }
      return out;
    }),
  };
  return deps;
}

const base = { script: 'latin' as const };

describe('reapplyMode', () => {
  beforeEach(() => {
    ids = 0;
  });

  it('Book splits each spread, one page at a time, and leaves portrait pages alone', async () => {
    const deps = fakeDeps();
    const pages = [page('a'), page('b'), page('c', { width: 2000, height: 3000 })];
    const out = await reapplyMode({ ...base, pages, from: 'doc', to: 'book', fromEnhance: 'auto', toEnhance: 'auto' }, deps);
    expect(out.map((p) => p.id)).toEqual(['aL', 'aR', 'bL', 'bR', 'c']);
    expect(deps.maxActive).toBe(1);
  });

  it('Book back to Document joins both halves of a spread, but not a spread with a half deleted', () => {
    const splitFrom = (g: string) => ({ groupId: g, uri: `file:///cache/${g}.jpg`, width: 3000, height: 2000 });
    const pages = [
      page('aL', { splitFrom: splitFrom('A'), enhance: 'gray' }),
      page('aR', { splitFrom: splitFrom('A') }),
      page('bL', { splitFrom: splitFrom('B') }),
    ];
    const out = undoPostProcess(pages, createId);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ uri: 'file:///cache/A.jpg', width: 3000, height: 2000, enhance: 'gray' });
    expect(out[0].splitFrom).toBeUndefined();
    expect(out[1].id).toBe('bL');
  });

  it('ID card composes pairs, and back to Document gives the scanned sides again', async () => {
    const deps = fakeDeps();
    const pages = [page('f1'), page('b1'), page('f2')];
    const cards = await reapplyMode({ ...base, pages, from: 'doc', to: 'id', fromEnhance: 'auto', toEnhance: 'color' }, deps);
    expect(cards.map((p) => p.id)).toEqual(['card-f1', 'card-f2']);
    // The default filter moved with the mode before composing.
    expect(cards[0].enhance).toBe('color');
    const back = await reapplyMode({ ...base, pages: cards, from: 'id', to: 'doc', fromEnhance: 'color', toEnhance: 'auto' }, deps);
    expect(back.map((p) => p.uri)).toEqual(['file:///cache/f1.jpg', 'file:///cache/b1.jpg', 'file:///cache/f2.jpg']);
    expect(back.every((p) => p.enhance === 'auto')).toBe(true);
  });

  it("keeps a filter the student picked; moves pages still on the old mode's default", async () => {
    const deps = fakeDeps();
    const pages = [page('a', { width: 1000, height: 1400 }), page('b', { width: 1000, height: 1400, enhance: 'bw' })];
    const out = await reapplyMode({ ...base, pages, from: 'doc', to: 'notes', fromEnhance: 'auto', toEnhance: 'ink' }, deps);
    expect(out.map((p) => p.enhance)).toEqual(['ink', 'bw']);
  });

  it('changes nothing for the same mode', async () => {
    const pages = [page('a')];
    expect(await reapplyMode({ ...base, pages, from: 'book', to: 'book', fromEnhance: 'auto', toEnhance: 'auto' }, fakeDeps())).toBe(pages);
  });
});

describe('capture/APPLY_MODE and undo', () => {
  it('Book split on 2 spreads gives 4 pages; Undo gives the 2 back with the mode', async () => {
    const spreads = [page('a'), page('b')];
    let state = appReducer(initialAppState, { type: 'capture/BULK_ADD_PAGES', pages: spreads });
    state = appReducer(state, { type: 'capture/SET_MODE', mode: 'doc' });
    const split = await reapplyMode({ ...base, pages: state.capture.pages, from: 'doc', to: 'book', fromEnhance: 'auto', toEnhance: 'auto' }, fakeDeps());
    state = appReducer(state, { type: 'capture/APPLY_MODE', mode: 'book', pages: split });
    expect(state.capture.pages).toHaveLength(4);
    expect(state.capture.mode).toBe('book');
    // The spreads stay alive for undo, and the session's end sweeps them (historyUris).
    expect(historyUris(state.review.history)).toEqual(expect.arrayContaining(['file:///cache/a.jpg', 'file:///cache/b.jpg']));

    state = appReducer(state, { type: 'review/UNDO' } as AppAction);
    expect(state.capture.pages.map((p) => p.id)).toEqual(['a', 'b']);
    expect(state.capture.mode).toBe('doc');

    state = appReducer(state, { type: 'review/REDO' } as AppAction);
    expect(state.capture.pages).toHaveLength(4);
    expect(state.capture.mode).toBe('book');
  });

  it('a mode switch that changes no page is still one undo step, for the mode', () => {
    let state = appReducer(initialAppState, { type: 'capture/BULK_ADD_PAGES', pages: [page('a')] });
    state = appReducer(state, { type: 'capture/APPLY_MODE', mode: 'notes', pages: state.capture.pages });
    expect(state.capture.mode).toBe('notes');
    state = appReducer(state, { type: 'review/UNDO' } as AppAction);
    expect(state.capture.mode).toBe('doc');
  });
});
