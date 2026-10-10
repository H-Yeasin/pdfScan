import { useEffect, useRef } from 'react';
import { getDb } from '../services/persistence/dbService';
import { documentIdsInDb } from '../services/persistence/libraryRepo';
import { findOrphans, recoverInterruptedWrites, repair } from '../services/storage/integrity';
import { useAppDispatch, useAppSlices } from './AppStateContext';

// §8 B1: once per launch, after the library has loaded, checks that every document's files are
// there and that library/ holds no left-over folders (storage/integrity.ts). In the background,
// one folder at a time. This also covers every kind of restore: Android Auto Backup and a device
// transfer end with the app starting again, and a B4 restore reloads the library (a new
// loadAttempt), which runs the check once more.
export function useStorageIntegrity(libraryLoaded: boolean): void {
  const dispatch = useAppDispatch();
  const state = useAppSlices('library');
  const files = useRef(state.library.files);
  files.current = state.library.files;
  const loadAttempt = state.library.loadAttempt;
  // The load attempt the check last ran for.
  const ran = useRef<number | null>(null);

  useEffect(() => {
    if (!libraryLoaded || ran.current === loadAttempt) return;
    ran.current = loadAttempt;
    let cancelled = false;
    (async () => {
      // §18 W3: first, so a file waiting under its temporary name isn't reported as missing.
      await recoverInterruptedWrites();
      const rowIds = await documentIdsInDb(await getDb());
      const report = await findOrphans(files.current, rowIds);
      const changes = await repair(report);
      if (cancelled) return;
      for (const { id, missingFiles } of changes) {
        // A document deleted while the check ran simply isn't matched by UPDATE_FILE.
        dispatch({ type: 'library/UPDATE_FILE', id, patch: { missingFiles: missingFiles || undefined } });
      }
    })().catch((error) => console.warn('Storage integrity check failed', error));
    return () => {
      cancelled = true;
    };
  }, [libraryLoaded, loadAttempt, dispatch]);
}
