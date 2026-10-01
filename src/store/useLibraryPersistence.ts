import { useEffect, useRef } from 'react';
import { getDb } from '../services/persistence/dbService';
import { loadAll, syncLibrary, type LoadedLibrary } from '../services/persistence/libraryRepo';
import { useAppState } from './AppStateContext';

// Loads the library from SQLite, then mirrors every later change to state.library.files/courses/
// semesters back to disk as a diff (only rows whose object identity changed are written).
//
// Data-loss guard: persistence only starts after a *successful* load. If the load fails, status
// becomes 'failed', the Library shows an error with Retry, and nothing is written - so a read
// error can never be mistaken for an empty library and overwrite it.
//
// Returns whether the library has loaded, so callers like useExternalFileLinking can sequence
// their own boot-time work after it.
export function useLibraryPersistence(): boolean {
  const { state, dispatch } = useAppState();
  const { files, courses, semesters, timetable, loadStatus, loadAttempt } = state.library;
  const loaded = loadStatus === 'ready';

  // `committed` is the last snapshot known to be on disk; `latest` is the newest in-memory one.
  // Writes run one at a time, each diffing committed -> latest, so a failed write is retried by
  // the next one instead of being silently dropped.
  const committed = useRef<LoadedLibrary | null>(null);
  const latest = useRef<LoadedLibrary>({ documents: files, courses, semesters, timetable });
  latest.current = { documents: files, courses, semesters, timetable };
  const writeQueue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let cancelled = false;
    getDb()
      .then(loadAll)
      .then((stored) => {
        if (cancelled) return;
        committed.current = stored;
        // Documents created in memory while a previous load had failed are kept; they differ from
        // the committed snapshot, so the sync below writes them.
        const storedIds = new Set(stored.documents.map((d) => d.id));
        const unsaved = latest.current.documents.filter((d) => !storedIds.has(d.id));
        dispatch({ type: 'library/SET_FILES', files: [...unsaved, ...stored.documents] });
        dispatch({ type: 'library/SET_COURSES', courses: stored.courses });
        dispatch({ type: 'library/SET_SEMESTERS', semesters: stored.semesters });
        dispatch({ type: 'library/SET_TIMETABLE', timetable: stored.timetable });
        dispatch({ type: 'library/SET_LOAD_STATUS', status: 'ready' });
      })
      .catch((error) => {
        if (cancelled) return;
        console.warn('Failed to load library', error);
        dispatch({ type: 'library/SET_LOAD_STATUS', status: 'failed' });
        dispatch({ type: 'ui/SHOW_SNACK', msg: "Couldn't load library" });
      });
    return () => {
      cancelled = true;
    };
  }, [dispatch, loadAttempt]);

  useEffect(() => {
    if (!loaded) return;
    writeQueue.current = writeQueue.current.then(async () => {
      const prev = committed.current;
      if (!prev) return;
      const next = latest.current;
      try {
        await syncLibrary(await getDb(), prev, next);
        committed.current = next;
      } catch (error) {
        console.warn('Failed to save library changes', error);
      }
    });
  }, [loaded, files, courses, semesters, timetable]);

  return loaded;
}
