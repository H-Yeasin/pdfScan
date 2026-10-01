import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, create } from 'react-test-renderer';
import { resetStorage } from '../../test/db';
import { makeDoc } from '../../test/fixtures';
import { getDb } from '../../services/persistence/dbService';
import { LEGACY_INDEX_KEY } from '../../services/persistence/legacyLibrary';
import { loadAll } from '../../services/persistence/libraryRepo';
import { AppStateProvider, useAppState } from '../AppStateContext';
import { useLibraryPersistence } from '../useLibraryPersistence';

type Ctx = ReturnType<typeof useAppState>;

async function mountPersistence(): Promise<{ current: () => Ctx }> {
  let ctx: Ctx | null = null;
  function Probe() {
    useLibraryPersistence();
    ctx = useAppState();
    return null;
  }
  await act(async () => {
    create(
      <AppStateProvider>
        <Probe />
      </AppStateProvider>
    );
  });
  await flush();
  return { current: () => ctx! };
}

// Lets the load promise chain and any queued write settle.
async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

beforeEach(resetStorage);

describe('useLibraryPersistence', () => {
  it('never writes after a failed load', async () => {
    await AsyncStorage.setItem(LEGACY_INDEX_KEY, '{corrupt');
    const ctx = await mountPersistence();
    expect(ctx.current().state.library.loadStatus).toBe('failed');

    await act(async () => ctx.current().dispatch({ type: 'library/ADD_FILE', file: makeDoc({ id: 'new' }) }));
    await flush();

    // The corrupt blob is untouched and nothing reached SQLite.
    expect(await AsyncStorage.getItem(LEGACY_INDEX_KEY)).toBe('{corrupt');
    await AsyncStorage.removeItem(LEGACY_INDEX_KEY);
    expect((await loadAll(await getDb())).documents).toEqual([]);
  });

  it('loads stored documents, then persists changes', async () => {
    await AsyncStorage.setItem(
      LEGACY_INDEX_KEY,
      JSON.stringify({ version: 2, folders: [], documents: [makeDoc({ id: 'old', name: 'Old' })] })
    );
    const ctx = await mountPersistence();
    expect(ctx.current().state.library.loadStatus).toBe('ready');
    expect(ctx.current().state.library.files.map((f) => f.id)).toEqual(['old']);

    await act(async () => {
      ctx.current().dispatch({ type: 'library/ADD_FILE', file: makeDoc({ id: 'new', name: 'New' }) });
      ctx.current().dispatch({ type: 'library/TOGGLE_STAR', id: 'old' });
    });
    await flush();

    const stored = await loadAll(await getDb());
    expect(stored.documents.map((d) => [d.id, d.star]).sort()).toEqual([
      ['new', false],
      ['old', true],
    ]);
  });

  it('courses and semesters survive a restart, including an archived semester and a reorder', async () => {
    const first = await mountPersistence();
    await act(async () => {
      const { dispatch } = first.current();
      dispatch({ type: 'library/CREATE_SEMESTER', semester: { id: 's1', name: 'Fall 2026', startsOn: '2026-09-01' } });
      dispatch({ type: 'library/CREATE_COURSE', id: 'a', name: 'Algebra', fields: { semesterId: 's1', emoji: '➗' } });
      dispatch({ type: 'library/CREATE_COURSE', id: 'b', name: 'Biology', fields: { semesterId: 's1' } });
      dispatch({ type: 'library/CREATE_COURSE', id: 'c', name: 'Chemistry' });
    });
    await flush();
    await act(async () => {
      const { dispatch } = first.current();
      dispatch({ type: 'library/REORDER_COURSES', ids: ['c', 'a', 'b'] });
      dispatch({ type: 'library/ARCHIVE_SEMESTER', id: 's1' });
    });
    await flush();

    // A fresh store reading the same database, as after an app restart.
    const second = await mountPersistence();
    const { courses, semesters } = second.current().state.library;
    expect(semesters.map((s) => [s.id, s.name, s.startsOn, s.archived])).toEqual([['s1', 'Fall 2026', '2026-09-01', true]]);
    expect(courses.map((c) => [c.id, c.sortOrder, c.archived, c.semesterId])).toEqual([
      ['c', 0, false, undefined],
      ['a', 1, true, 's1'],
      ['b', 2, true, 's1'],
    ]);
    expect(courses[1]).toMatchObject({ emoji: '➗', color: first.current().state.library.courses[1].color });
  });
});
