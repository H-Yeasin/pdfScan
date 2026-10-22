import { useCallback } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { t } from '../i18n';
import { useRouter } from '../navigation/router';
import { looksLikeZip, ZIP_MIME_TYPES } from '../services/backup/incomingZip';
import { PICKER_MIME_TYPES } from '../services/documents/formatCapabilities';
import { importExternalFile, LegacyWordDocError } from '../services/files/externalFileService';
import { useAppDispatch } from './AppStateContext';
import { openIncomingZip } from './backupIntake';

// §17 U5: "Import file" (the Scan mode sheet, Tools): pick a PDF, Word, sheet or text file and add
// it to Files, then open it - what an "Open with" from another app does (useExternalFileLinking).
// A backup or a shared course goes to the restore / import flow instead (§8 B4). U7 puts the
// same import in Files.
export function useImportFile(): () => Promise<void> {
  const dispatch = useAppDispatch();
  const { go } = useRouter();

  return useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: [...PICKER_MIME_TYPES, ...ZIP_MIME_TYPES], copyToCacheDirectory: true });
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset) return;
    if (looksLikeZip(asset.name, asset.mimeType)) {
      await openIncomingZip(dispatch, asset.uri);
      return;
    }
    try {
      const ext = await importExternalFile(asset.uri, { originalFileName: asset.name, mimeType: asset.mimeType });
      // Required here, not imported: libraryOperations brings pdf-lib, and the tab bar that holds
      // this is on the boot path (§16 G3).
      const { promoteExternalToLibrary } = require('../services/persistence/libraryOperations') as typeof import('../services/persistence/libraryOperations');
      const doc = await promoteExternalToLibrary(ext);
      dispatch({ type: 'library/ADD_FILE', file: doc });
      dispatch({ type: 'reader/SET_READER_ID', id: doc.id });
      dispatch({ type: 'ui/SHOW_SNACK', msg: t('capture.modeSheet.imported', { name: doc.name }) });
      go('reader');
    } catch (e) {
      console.warn('useImportFile failed', e);
      dispatch({ type: 'ui/SHOW_SNACK', msg: t(e instanceof LegacyWordDocError ? 'reader.docUnsupported' : 'library.openFailed') });
    }
  }, [dispatch, go]);
}
