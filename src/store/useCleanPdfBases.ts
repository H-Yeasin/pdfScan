import { useEffect, useState } from 'react';
import { File } from 'expo-file-system';
import { META_CLEAN_PDF_BASES, parseCleanState, planClean, runClean, setPendingBases, type CleanState } from '../services/annotations/cleanBases';
import { settleOurAnnotations } from '../services/annotations/exportPdf';
import { getDb } from '../services/persistence/dbService';
import { getMeta, setMeta } from '../services/persistence/meta';
import { useAppDispatch, useAppStore } from './AppStateContext';

// §18 W17: takes the marks and signatures older builds wrote into `document.pdf` out again
// (annotations/cleanBases), once. The list is read (or, the first time, planned from the library)
// as soon as the library is loaded, so the Reader knows which files may still hold them; the
// cleaning itself waits for `afterBoot`, runs in the background one document at a time, and
// carries on at the next start if the app closes first. Reads the store when it runs, never as a
// subscription: this hook re-renders nothing.
export function useCleanPdfBases(libraryLoaded: boolean, afterBoot: boolean): void {
  const store = useAppStore();
  const dispatch = useAppDispatch();
  const [planned, setPlanned] = useState<CleanState | null>(null);

  useEffect(() => {
    if (!libraryLoaded) return;
    let cancelled = false;
    (async () => {
      const db = await getDb();
      let state = parseCleanState(await getMeta(db, META_CLEAN_PDF_BASES));
      if (!state) {
        const { files, annotations } = store.getState().library;
        state = planClean(files, annotations);
        await setMeta(db, META_CLEAN_PDF_BASES, JSON.stringify(state));
      }
      if (cancelled) return;
      setPendingBases(state);
      setPlanned(state);
    })().catch((error) => console.warn('useCleanPdfBases: could not read the list', error));
    return () => {
      cancelled = true;
    };
  }, [libraryLoaded, store]);

  useEffect(() => {
    if (!afterBoot || !planned || Object.keys(planned.pending).length === 0) return;
    const controller = new AbortController();
    runClean(planned, {
      signal: controller.signal,
      pdfUriOf: (docId) => store.getState().library.files.find((f) => f.id === docId)?.pdfUri,
      clean: (uri) => settleOurAnnotations(uri, 'remove'),
      save: async (state) => setMeta(await getDb(), META_CLEAN_PDF_BASES, JSON.stringify(state)),
      onCleaned: (docId, removed) => {
        // A PDF document's size is its file's.
        const doc = store.getState().library.files.find((f) => f.id === docId);
        if (removed > 0 && doc?.format === 'PDF' && doc.pdfUri) {
          dispatch({ type: 'library/UPDATE_FILE', id: docId, patch: { sizeBytes: new File(doc.pdfUri).size ?? doc.sizeBytes } });
        }
      },
    }).catch((error) => console.warn('useCleanPdfBases: cleaning stopped', error));
    return () => controller.abort();
  }, [afterBoot, planned, store, dispatch]);
}
