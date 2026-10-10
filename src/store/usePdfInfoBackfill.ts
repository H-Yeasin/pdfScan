import { useEffect, useRef } from 'react';
import { backfillPdfInfo } from '../services/documents/pdfInfoBackfill';
import { useAppDispatch, useAppSlices } from './AppStateContext';

// §5 T1: records the PDF layout of documents built before it was stored (documents/
// pdfInfoBackfill.ts). §16 G4: once per library load and after the first screen is up, not as part
// of the load - it opens files. In the background, one document at a time; each result is saved
// like any other change.
export function usePdfInfoBackfill(libraryLoaded: boolean): void {
  const dispatch = useAppDispatch();
  const state = useAppSlices('library');
  const files = useRef(state.library.files);
  files.current = state.library.files;
  const loadAttempt = state.library.loadAttempt;
  // The load attempt the backfill last ran for.
  const ran = useRef<number | null>(null);

  useEffect(() => {
    if (!libraryLoaded || ran.current === loadAttempt) return;
    ran.current = loadAttempt;
    let cancelled = false;
    backfillPdfInfo(files.current)
      .then((patches) => {
        if (cancelled) return;
        // A document deleted meanwhile simply isn't matched by UPDATE_FILE.
        for (const { id, patch } of patches) dispatch({ type: 'library/UPDATE_FILE', id, patch });
      })
      .catch((error) => console.warn('PDF layout backfill failed', error));
    return () => {
      cancelled = true;
    };
  }, [libraryLoaded, loadAttempt, dispatch]);
}
