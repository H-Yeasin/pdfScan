import type { Dispatch } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { t } from '../i18n';
import { stageIncomingZip, ZIP_MIME_TYPES } from '../services/backup/incomingZip';
import type { AppAction } from './appReducer';

// §8 B4: picks a backup or export zip and hands it to RestoreHost. Some file managers report
// zips as application/octet-stream, so that's accepted too; RestoreHost says when it isn't one.
export async function pickBackupZip(dispatch: Dispatch<AppAction>): Promise<void> {
  const result = await DocumentPicker.getDocumentAsync({ type: [...ZIP_MIME_TYPES, 'application/octet-stream'], copyToCacheDirectory: true });
  if (result.canceled || !result.assets[0]) return;
  await openIncomingZip(dispatch, result.assets[0].uri);
}

export async function openIncomingZip(dispatch: Dispatch<AppAction>, uri: string): Promise<void> {
  try {
    const staged = await stageIncomingZip(uri);
    dispatch({ type: 'ui/OPEN_BACKUP', uri: staged.uri });
  } catch (error) {
    console.warn('openIncomingZip failed', error);
    dispatch({ type: 'ui/SHOW_SNACK', msg: t('backup.restore.failed') });
  }
}
