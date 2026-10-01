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
});
