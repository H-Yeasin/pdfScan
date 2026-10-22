import { useCallback } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { t } from '../i18n';
import { useRouter } from '../navigation/router';
import { looksLikeZip, ZIP_MIME_TYPES } from '../services/backup/incomingZip';
import { PICKER_MIME_TYPES } from '../services/documents/formatCapabilities';
import { importExternalFile, LegacyWordDocError } from '../services/files/externalFileService';
import { useAppDispatch } from './AppStateContext';
import { openIncomingZip } from './backupIntake';
import type { LibraryDocument } from '../types/models';

// §17 U5: "Import file" (the Scan mode sheet, Tools): pick a PDF, Word, sheet or text file and add
// it to Files, then open it - what an "Open with" from another app does (useExternalFileLinking).
// A backup or a shared course goes to the restore / import flow instead (§8 B4).
//
// §17 U7: Files imports the same way but stays (`stay`): the document goes under `courseId` (the
// course Files is filtered to) or Unsorted, is scrolled to, and the snack offers to open it.
//
// §17 U8: a tool's picker imports `silent`ly: no snack, nothing opened; the new document (also
// returned by every import that makes one) is picked instead.
export type ImportOptions = { courseId?: string; stay?: boolean; silent?: boolean };

export function useImportFile(): (options?: ImportOptions) => Promise<LibraryDocument | undefined> {
  const dispatch = useAppDispatch();
  const { go } = useRouter();

  return useCallback(async (options: ImportOptions = {}) => {
    const result = await DocumentPicker.getDocumentAsync({ type: [...PICKER_MIME_TYPES, ...ZIP_MIME_TYPES], copyToCacheDirectory: true });
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset) return undefined;
    if (looksLikeZip(asset.name, asset.mimeType)) {
      await openIncomingZip(dispatch, asset.uri);
      return undefined;
    }
    try {
      const ext = await importExternalFile(asset.uri, { originalFileName: asset.name, mimeType: asset.mimeType });
      // Required here, not imported: libraryOperations brings pdf-lib, and the tab bar that holds
      // this is on the boot path (§16 G3).
      const { promoteExternalToLibrary } = require('../services/persistence/libraryOperations') as typeof import('../services/persistence/libraryOperations');
      const promoted = await promoteExternalToLibrary(ext);
      const doc = options.courseId ? { ...promoted, courseId: options.courseId } : promoted;
      dispatch({ type: 'library/ADD_FILE', file: doc });
      if (options.silent) return doc;
      if (options.stay) {
        const open = () => {
          dispatch({ type: 'reader/SET_READER_ID', id: doc.id });
          dispatch({ type: 'settings/SET_LAST_OPENED', lastOpened: { id: doc.id, at: Date.now() } });
          go('reader');
        };
        dispatch({ type: 'libraryUi/REVEAL', id: doc.id });
        dispatch({ type: 'ui/SHOW_SNACK', msg: t('library.added', { name: doc.name }), action: t('library.open'), onAction: open });
        return doc;
      }
      dispatch({ type: 'reader/SET_READER_ID', id: doc.id });
      dispatch({ type: 'ui/SHOW_SNACK', msg: t('capture.modeSheet.imported', { name: doc.name }) });
      go('reader');
      return doc;
    } catch (e) {
      console.warn('useImportFile failed', e);
      dispatch({ type: 'ui/SHOW_SNACK', msg: t(e instanceof LegacyWordDocError ? 'reader.docUnsupported' : 'library.openFailed') });
      return undefined;
    }
  }, [dispatch, go]);
}
