import { useCallback, useMemo, useState } from 'react';
import { EditPagesModal } from './EditPagesModal';
import { DocumentPickerModal } from './DocumentPickerModal';
import { useRouter } from '../../navigation/router';
import { startScan } from '../../services/courses/startScan';
import { canUsePageTools } from '../../services/documents/formatCapabilities';
import { PdfEncryptedError } from '../../services/pdf/pdfErrors';
import { appendDocuments } from '../../services/persistence/libraryOperations';
import { extractToNewDocument, PagesNotReadyError, savePageEdit, type PageEdit } from '../../services/persistence/pageEdits';
import { useAppDispatch, useAppSlices } from '../../store/AppStateContext';
import type { LibraryDocument } from '../../types/models';
import { t } from '../../i18n';

// §7 R3: "Edit pages" for the document open in the Reader - the editor, the document picker for
// "Add pages from another document", and what each of their actions does. `onChanged` runs after
// the document's PDF was rewritten (the viewer reloads it). Render `overlays` once.
export function useEditPages(doc: LibraryDocument | undefined, onChanged: () => void) {
  const dispatch = useAppDispatch();
  const state = useAppSlices('capture', 'library');
  const { go } = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const fail = useCallback(
    (error: unknown) => {
      console.warn('useEditPages: failed', error);
      const msg =
        error instanceof PagesNotReadyError
          ? t('reader.edit.notReady')
          : error instanceof PdfEncryptedError
            ? t('library.passwordProtected')
            : t('library.toolFailed');
      dispatch({ type: 'ui/SHOW_SNACK', msg });
    },
    [dispatch]
  );

  // One write at a time, with the editor waiting.
  const run = useCallback(
    async (work: () => Promise<void>) => {
      setBusy(true);
      try {
        await work();
      } catch (error) {
        fail(error);
      } finally {
        setBusy(false);
      }
    },
    [fail]
  );

  const annotationsOf = useCallback((id: string) => state.library.annotations.filter((a) => a.documentId === id), [state.library.annotations]);

  const handleSave = useCallback(
    (edit: PageEdit) => {
      if (!doc) return;
      run(async () => {
        const saved = await savePageEdit(doc, edit, annotationsOf(doc.id));
        // A removed page's bookmarks and annotations go with it (library/UPDATE_FILE).
        dispatch({ type: 'library/UPDATE_FILE', id: doc.id, patch: saved });
        onChanged();
        setOpen(false);
        dispatch({ type: 'ui/SHOW_SNACK', msg: t('reader.edit.saved') });
      });
    },
    [doc, run, annotationsOf, dispatch, onChanged]
  );

  const handleExtract = useCallback(
    (pageIds: string[]) => {
      if (!doc) return;
      run(async () => {
        const extracted = await extractToNewDocument(doc, pageIds);
        dispatch({ type: 'library/ADD_FILE', file: extracted });
        dispatch({
          type: 'ui/SHOW_SNACK',
          msg: t('reader.edit.extracted', { name: extracted.name }),
          action: t('library.open'),
          onAction: () => dispatch({ type: 'reader/SET_READER_ID', id: extracted.id }),
        });
      });
    },
    [doc, run, dispatch]
  );

  const handleAddFromScan = useCallback(() => {
    if (!doc) return;
    // The scan's pages are added when it's saved (DeliverScreen, deliver.appendTo); a session
    // already in progress would be added too, so it has to be finished first.
    if (state.capture.pages.length > 0) {
      dispatch({ type: 'ui/SHOW_SNACK', msg: t('reader.edit.finishScan') });
      return;
    }
    setOpen(false);
    startScan(state, dispatch, doc.courseId ?? null, { launch: true, appendTo: doc.id });
    go('capture');
  }, [doc, state, dispatch, go]);

  const handlePick = useCallback(
    (source: LibraryDocument) => {
      if (!doc) return;
      setPickerOpen(false);
      run(async () => {
        const appended = await appendDocuments(doc, [source], annotationsOf(doc.id));
        dispatch({ type: 'library/UPDATE_FILE', id: doc.id, patch: appended });
        onChanged();
        dispatch({ type: 'ui/SHOW_SNACK', msg: t('reader.edit.added', { count: appended.pages.length - doc.pages.length }) });
      });
    },
    [doc, run, annotationsOf, dispatch, onChanged]
  );

  const sources = useMemo(
    () => state.library.files.filter((f) => f.id !== doc?.id && canUsePageTools(f)),
    [state.library.files, doc?.id]
  );

  const overlays = doc ? (
    <>
      {/* One modal at a time (iOS won't show a modal over a modal): the picker takes the editor's
          place, and the editor comes back after it. */}
      <EditPagesModal
        visible={open && !pickerOpen}
        doc={doc}
        busy={busy}
        onClose={() => setOpen(false)}
        onSave={handleSave}
        onExtract={handleExtract}
        onAddFromScan={handleAddFromScan}
        onAddFromDocument={() => setPickerOpen(true)}
      />
      <DocumentPickerModal
        visible={pickerOpen}
        title={t('reader.edit.pickDocument')}
        docs={sources}
        onPick={handlePick}
        onClose={() => setPickerOpen(false)}
      />
    </>
  ) : null;

  return { open: () => setOpen(true), overlays };
}
