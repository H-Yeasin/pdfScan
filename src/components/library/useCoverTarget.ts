import { useCallback, useState } from 'react';
import { useRouter } from '../../navigation/router';
import { canAddCover, isPasswordProtected } from '../../services/documents/formatCapabilities';
import { PdfEncryptedError } from '../../services/pdf/pdfErrors';
import type { AcademicConfig, PageSizeId } from '../../services/pdf/pdfService';
import { addCoverToDocument, CoverPhotoError } from '../../services/persistence/addCover';
import { useAppDispatch, useAppSlices } from '../../store/AppStateContext';
import type { CoverTarget } from '../../store/slices/deliverSlice';
import type { LibraryDocument } from '../../types/models';
import { t } from '../../i18n';

// §14 Q7: a cover page on a PDF already in the Library. The Selection bar's Cover and the Reader's
// "Add cover page" open Academic options for the document (deliver.coverTarget); its Apply runs
// addCoverToDocument (§14 Q6) as a copy or in place, and goes back to where it was opened from.

// Opens Academic options for `doc`, or says why it can't have a cover: a password-protected PDF
// can't be opened, and any other format has to be converted to a PDF first.
export function useOpenCoverOptions() {
  const { go, screen } = useRouter();
  const dispatch = useAppDispatch();
  return useCallback(
    (doc: LibraryDocument) => {
      if (!canAddCover(doc)) {
        const msg = doc.format === 'PDF' && isPasswordProtected(doc) ? t('library.passwordProtected') : t('library.cover.convertFirst');
        dispatch({ type: 'ui/SHOW_SNACK', msg });
        return;
      }
      dispatch({ type: 'library/CLEAR_SELECTION' });
      dispatch({ type: 'deliver/SET_COVER_TARGET', target: { docId: doc.id, from: screen } });
      go('academicOptions');
    },
    [dispatch, go, screen]
  );
}

// Academic options' side, in target mode: `leave` goes back (and clears the target), `apply`
// builds the cover and dispatches the result. `busy` while it runs, for the progress overlay.
export function useApplyCover(target: CoverTarget | null, doc: LibraryDocument | undefined) {
  const { go } = useRouter();
  const dispatch = useAppDispatch();
  const { annotations, bookmarks } = useAppSlices('library').library;
  const [busy, setBusy] = useState(false);

  // useDocumentListActions' useOpenDocument, which imports this file's useOpenCoverOptions.
  const openInReader = useCallback(
    (id: string) => {
      dispatch({ type: 'reader/SET_READER_ID', id });
      dispatch({ type: 'settings/SET_LAST_OPENED', lastOpened: { id, at: Date.now() } });
      go('reader');
    },
    [dispatch, go]
  );

  const leave = useCallback(() => {
    dispatch({ type: 'deliver/SET_COVER_TARGET', target: null });
    go(target?.from ?? 'library', 'back');
  }, [dispatch, go, target]);

  const apply = useCallback(
    async (config: AcademicConfig, pageSize: PageSizeId, mode: 'copy' | 'replace') => {
      if (!doc || busy) return;
      setBusy(true);
      try {
        const result = await addCoverToDocument({ doc, config, pageSize, mode, annotations, bookmarks });
        if (mode === 'copy') {
          // At the top of the list (ADD_FILE puts it first).
          dispatch({ type: 'library/ADD_FILE', file: result.doc });
        } else {
          dispatch({ type: 'library/UPDATE_FILE', id: doc.id, patch: result.doc });
          if (result.annotations) dispatch({ type: 'library/SET_ANNOTATIONS', annotations: result.annotations });
          if (result.bookmarks) dispatch({ type: 'library/SET_BOOKMARKS', bookmarks: result.bookmarks });
        }
        // Back to the Reader after a Replace shows the new PDF: the Reader mounts again on it.
        const showingIt = target?.from === 'reader' && mode === 'replace';
        leave();
        dispatch({
          type: 'ui/SHOW_SNACK',
          msg: t('library.cover.added'),
          ...(showingIt ? {} : { action: t('library.cover.open'), onAction: () => openInReader(result.doc.id) }),
        });
      } catch (error) {
        console.warn('useApplyCover: adding the cover failed', error);
        setBusy(false);
        const msg =
          error instanceof CoverPhotoError
            ? t('library.cover.photoFailed')
            : error instanceof PdfEncryptedError
              ? t('library.passwordProtected')
              : t('library.toolFailed');
        dispatch({ type: 'ui/SHOW_SNACK', msg });
      }
    },
    [doc, busy, annotations, bookmarks, dispatch, target, leave, openInReader]
  );

  return { busy, apply, leave };
}
