import { useEffect, useRef, useState } from 'react';
import { indexImportedPdf, needsIndexing } from '../services/documents/importedPdfIndex';
import { isPdfNativeAvailable } from '../services/pdf/pdfNative';
import { deleteDocumentFiles } from '../services/persistence/libraryFiles';
import { useReaderHeld } from '../services/reader/readerHold';
import { resolveOcrScript } from '../services/scripts/registry';
import { useAppDispatch, useAppSlices } from './AppStateContext';

// The abort reason when the document itself went away (as opposed to the app closing).
const REMOVED = 'removed';
// §18 W10: the page surface is on screen and needs the pdfium thread; the run stops after the
// page it is on, keeps what it finished, and starts again when the Reader closes.
const PAUSED = 'paused';

// §7 R1: gives imported PDFs their thumbnails and searchable text, in the background, one
// document at a time, never blocking the UI. The same loop serves a fresh import (it arrives with
// indexedAt unset) and the backfill of PDFs imported before R1 (stored with indexed_at NULL).
// Progress is saved every few pages, so a run cut short by the app closing resumes next launch
// after the pages it finished.
export function useImportedPdfIndexing(libraryLoaded: boolean): void {
  const dispatch = useAppDispatch();
  const state = useAppSlices('library', 'settings');
  const { files, courses } = state.library;
  const settings = state.settings;

  const running = useRef<{ id: string; controller: AbortController } | null>(null);
  // Documents whose run threw unexpectedly this session; not retried until the next launch, so a
  // persistent error can't spin the loop.
  const skipped = useRef(new Set<string>());
  // Bumped when a run ends, to look for the next document.
  const [finishedRuns, setFinishedRuns] = useState(0);
  const paused = useReaderHeld();

  useEffect(() => {
    if (!libraryLoaded || paused || running.current || !isPdfNativeAvailable()) return;
    const doc = files.find((f) => needsIndexing(f) && !skipped.current.has(f.id));
    if (!doc) return;

    const controller = new AbortController();
    running.current = { id: doc.id, controller };
    const script = resolveOcrScript({ course: courses.find((c) => c.id === doc.courseId), settings });
    const commit = (pages: typeof doc.pages) => {
      if (!controller.signal.aborted || controller.signal.reason === PAUSED) dispatch({ type: 'library/UPDATE_FILE', id: doc.id, patch: { pages } });
    };

    indexImportedPdf(doc, {
      script,
      signal: controller.signal,
      onProgress: ({ done, total }) => dispatch({ type: 'libraryUi/SET_INDEXING', progress: { documentId: doc.id, done, total } }),
      onCommit: commit,
    })
      .then((result) => {
        if (result.finished) {
          if (!controller.signal.aborted) dispatch({ type: 'library/UPDATE_FILE', id: doc.id, patch: result.patch });
        } else {
          commit(result.pages);
        }
      })
      .catch((error) => {
        console.warn('Imported PDF indexing failed', error);
        skipped.current.add(doc.id);
      })
      .finally(() => {
        // Deleted while it ran: thumbnails written after the delete would be orphaned.
        if (controller.signal.reason === REMOVED) deleteDocumentFiles(doc.id);
        running.current = null;
        dispatch({ type: 'libraryUi/SET_INDEXING', progress: null });
        setFinishedRuns((n) => n + 1);
      });
    // `courses`/`settings` only pick the OCR script when a run starts; they don't restart one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libraryLoaded, paused, files, finishedRuns, dispatch]);

  useEffect(() => {
    if (paused) running.current?.controller.abort(PAUSED);
  }, [paused]);

  // The document went away (deleted, or replaced by a merge) while it was being indexed.
  useEffect(() => {
    const current = running.current;
    if (current && !files.some((f) => f.id === current.id)) current.controller.abort(REMOVED);
  }, [files]);

  useEffect(
    () => () => {
      running.current?.controller.abort();
    },
    []
  );
}
