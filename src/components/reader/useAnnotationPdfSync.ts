import { useCallback, useEffect, useRef } from 'react';
import { updatePdfAnnotations } from '../../services/annotations/pdfAnnotations';
import { useScreenRole } from '../../navigation/screenRole';
import { useAppDispatch, useAppSlices } from '../../store/AppStateContext';
import { useT } from '../../i18n/useT';

// Leaving Mark mode, or Select text → Highlight, then tapping again soon after, writes once.
const SYNC_DELAY_MS = 400;

// §12 D3: marks are stored as they're made (the store, then SQLite); document.pdf gets them in the
// background afterwards, so leaving Mark mode is instant. Writes are debounced and never overlap:
// a request during a write runs once more after it, with the annotations as they are by then.
// `onWritten` runs after a write that changed the file (the Reader reloads its viewer). §18 W5: a
// Reader that isn't on screen when its write ends (under Pro, or sliding away) doesn't reload
// then; a hidden one does when it is shown again. The write itself always happens, also the one
// still waiting when the Reader unmounts: the marks must reach the file.
export function useAnnotationPdfSync(onWritten: () => void) {
  const { t } = useT();
  const dispatch = useAppDispatch();
  const { library } = useAppSlices('library');
  const latest = useRef(library);
  latest.current = library;
  const written = useRef(onWritten);
  written.current = onWritten;
  const onScreen = useScreenRole() === 'active';
  const shown = useRef(onScreen);
  shown.current = onScreen;
  const reloadOwed = useRef(false);
  useEffect(() => {
    if (!onScreen || !reloadOwed.current) return;
    reloadOwed.current = false;
    written.current();
  }, [onScreen]);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const running = useRef(false);
  const pending = useRef<string | null>(null);

  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    let wrote = false;
    try {
      while (pending.current) {
        const docId = pending.current;
        pending.current = null;
        const doc = latest.current.files.find((f) => f.id === docId);
        if (!doc) continue;
        try {
          const size = await updatePdfAnnotations(
            doc,
            latest.current.annotations.filter((a) => a.documentId === doc.id)
          );
          if (size === null) continue;
          wrote = true;
          if (doc.format === 'PDF') dispatch({ type: 'library/UPDATE_FILE', id: doc.id, patch: { sizeBytes: size } });
        } catch (error) {
          console.warn('Mark mode: writing annotations into the PDF failed', error);
          dispatch({ type: 'ui/SHOW_SNACK', msg: t('reader.mark.saveFailed') });
        }
      }
    } finally {
      running.current = false;
    }
    if (wrote && shown.current) written.current();
    else if (wrote) reloadOwed.current = true;
    // A request that came in after the loop's last check.
    if (pending.current) void run();
  }, [dispatch, t]);

  const schedule = useCallback(
    (docId: string) => {
      pending.current = docId;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        void run();
      }, SYNC_DELAY_MS);
    },
    [run]
  );

  // Leaving the Reader with a write still waiting: write now rather than drop it.
  useEffect(
    () => () => {
      if (!timer.current) return;
      clearTimeout(timer.current);
      timer.current = null;
      void run();
    },
    [run]
  );

  return schedule;
}
