import { useEffect, useRef } from 'react';
import { getDb } from '../services/persistence/dbService';
import { documentIdsInDb } from '../services/persistence/libraryRepo';
import { findOrphans, repair } from '../services/storage/integrity';
import { useAppState } from './AppStateContext';

// §8 B1: once per launch, after the library has loaded, checks that every document's files are
// there and that library/ holds no left-over folders (storage/integrity.ts). In the background,
// one folder at a time. This also covers every kind of restore (Android Auto Backup, a device
// transfer, B4): each ends with the app starting again.
export function useStorageIntegrity(libraryLoaded: boolean): void {
  const { state, dispatch } = useAppState();
  const files = useRef(state.library.files);
  files.current = state.library.files;
  const ran = useRef(false);

  useEffect(() => {
    if (!libraryLoaded || ran.current) return;
    ran.current = true;
    let cancelled = false;
    (async () => {
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
  }, [libraryLoaded, dispatch]);
}
