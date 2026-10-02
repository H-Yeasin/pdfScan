import { useEffect, useRef } from 'react';
import { backfillPdfInfo } from '../services/documents/pdfInfoBackfill';
import { getDb } from '../services/persistence/dbService';
import { loadAll, syncLibrary, type LoadedLibrary } from '../services/persistence/libraryRepo';
import { useAppDispatch, useAppSlices } from './AppStateContext';
import { t } from '../i18n';

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
  const dispatch = useAppDispatch();
  const state = useAppSlices('library');
  const { files, courses, semesters, timetable, submissions, deadlines, annotations, bookmarks, loadStatus, loadAttempt } = state.library;
  const loaded = loadStatus === 'ready';

  // `committed` is the last snapshot known to be on disk; `latest` is the newest in-memory one.
  // Writes run one at a time, each diffing committed -> latest, so a failed write is retried by
  // the next one instead of being silently dropped.
  const committed = useRef<LoadedLibrary | null>(null);
  const latest = useRef<LoadedLibrary>({ documents: files, courses, semesters, timetable, submissions, deadlines, annotations, bookmarks });
  latest.current = { documents: files, courses, semesters, timetable, submissions, deadlines, annotations, bookmarks };
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
        const storedSubmissionIds = new Set((stored.submissions ?? []).map((s) => s.id));
        const unsavedSubmissions = (latest.current.submissions ?? []).filter((s) => !storedSubmissionIds.has(s.id));
        dispatch({ type: 'library/SET_SUBMISSIONS', submissions: [...unsavedSubmissions, ...(stored.submissions ?? [])] });
        dispatch({ type: 'library/SET_DEADLINES', deadlines: stored.deadlines ?? [] });
        dispatch({ type: 'library/SET_ANNOTATIONS', annotations: stored.annotations ?? [] });
        dispatch({ type: 'library/SET_BOOKMARKS', bookmarks: stored.bookmarks ?? [] });
        dispatch({ type: 'library/SET_LOAD_STATUS', status: 'ready' });
        // §5 T1: record the PDF layout of documents built before it was stored. In the
        // background, one document at a time; each result is saved like any other change.
        backfillPdfInfo(stored.documents)
          .then((patches) => {
            if (cancelled) return;
            for (const { id, patch } of patches) dispatch({ type: 'library/UPDATE_FILE', id, patch });
          })
          .catch((error) => console.warn('PDF layout backfill failed', error));
      })
      .catch((error) => {
        if (cancelled) return;
        console.warn('Failed to load library', error);
        dispatch({ type: 'library/SET_LOAD_STATUS', status: 'failed' });
        dispatch({ type: 'ui/SHOW_SNACK', msg: t('library.loadFailed') });
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
  }, [loaded, files, courses, semesters, timetable, submissions, deadlines, annotations, bookmarks]);

  return loaded;
}
