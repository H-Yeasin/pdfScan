import { useCallback, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { StorageAccessFramework } from 'expo-file-system/legacy';
import { formatBytes, t } from '../../i18n';
import { useRouter } from '../../navigation/router';
import {
  BackupBusyError,
  BackupSpaceError,
  createBackup,
  discardBackup,
  type BackupInclude,
  type BackupProgress,
  type BackupRequest,
  type BackupResult,
} from '../../services/backup/createBackup';
import type { BackupScope } from '../../services/backup/format';
import { ZipAbortedError } from '../../services/backup/zip';
import { deriveFolderLabel, saveFileToFolder } from '../../services/export/deviceExportService';
import { shareFileUri } from '../../services/sharing/shareService';
import { useAppDispatch, useAppSelector } from '../../store/AppStateContext';
import { logUsage } from '../../services/telemetry/usage';
import { BackupSheet, type BackupSheetPhase } from './BackupSheet';

const ZIP_MIME = 'application/zip';

// §8 B3: one backup or export from start to hand-over, for any screen. `backUpEverything()` makes
// a full backup; `exportScope(scope)` first asks Everything or PDFs only. Render `overlay` once.
//
// Hand-over:
// - Share: the zip goes to the share sheet as it is (it already has its readable name). The cache
//   copy isn't deleted right away, because the receiving app (an email draft, say) may read it
//   later; the next backup or Settings → Storage → Clear removes it.
// - Save to folder (Android): streamed into the backup folder, then the cache copy is deleted.
// A full backup handed over either way is recorded as the last backup.
export function useBackupExport() {
  const dispatch = useAppDispatch();
  const { go } = useRouter();
  const backupFolderUri = useAppSelector((s) => s.settings.backupFolderUri);
  const backupFolderLabel = useAppSelector((s) => s.settings.backupFolderLabel);
  const [phase, setPhase] = useState<BackupSheetPhase>({ kind: 'idle' });
  const controller = useRef<AbortController | null>(null);
  const shared = useRef(false);

  const run = useCallback(
    async (request: BackupRequest) => {
      const full = request.scope.kind === 'all' && request.include === 'everything';
      const abort = new AbortController();
      controller.current = abort;
      shared.current = false;
      setPhase({ kind: 'working', full, progress: null });
      try {
        const result = await createBackup(request, {
          signal: abort.signal,
          onProgress: (progress: BackupProgress) => setPhase({ kind: 'working', full, progress }),
        });
        setPhase({ kind: 'ready', full, result });
      } catch (error) {
        setPhase({ kind: 'idle' });
        if (error instanceof ZipAbortedError) {
          dispatch({ type: 'ui/SHOW_SNACK', msg: t('backup.cancelled') });
        } else if (error instanceof BackupBusyError) {
          dispatch({ type: 'ui/SHOW_SNACK', msg: t('backup.busy') });
        } else if (error instanceof BackupSpaceError) {
          dispatch({
            type: 'ui/SHOW_SNACK',
            msg: t('backup.tooFull', { size: formatBytes(error.bytesNeeded) }),
            action: t('backup.freeUp'),
            onAction: () => go('storage'),
          });
        } else {
          console.warn('Backup failed', error);
          dispatch({ type: 'ui/SHOW_SNACK', msg: t('backup.failed') });
        }
      } finally {
        controller.current = null;
      }
    },
    [dispatch, go]
  );

  const backUpEverything = useCallback(() => run({ scope: { kind: 'all' }, include: 'everything' }), [run]);

  const exportScope = useCallback((scope: BackupScope, courseName?: string) => setPhase({ kind: 'choose', scope, courseName }), []);

  const handleChoose = useCallback(
    (include: BackupInclude) => {
      if (phase.kind !== 'choose') return;
      void run({ scope: phase.scope, include, courseName: phase.courseName });
    },
    [phase, run]
  );

  const recordHandover = useCallback(
    (result: BackupResult, full: boolean) => {
      if (full) {
        dispatch({ type: 'settings/SET_LAST_BACKUP', at: result.manifest.createdAt, bytes: result.bytes });
        logUsage('backup_made');
      }
    },
    [dispatch]
  );

  const handleShare = useCallback(async () => {
    if (phase.kind !== 'ready') return;
    await shareFileUri(phase.result.file.uri, ZIP_MIME, phase.result.fileName);
    shared.current = true;
    recordHandover(phase.result, phase.full);
  }, [phase, recordHandover]);

  const handleSave = useCallback(async () => {
    if (phase.kind !== 'ready') return;
    const { result, full } = phase;
    let folderUri = backupFolderUri;
    let folderLabel = backupFolderLabel;
    if (!folderUri) {
      const permission = await StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!permission.granted) {
        dispatch({ type: 'ui/SHOW_SNACK', msg: t('backup.noFolder') });
        return;
      }
      folderUri = permission.directoryUri;
      folderLabel = deriveFolderLabel(folderUri);
      dispatch({ type: 'settings/SET_BACKUP_FOLDER', uri: folderUri, label: folderLabel });
    }
    const label = folderLabel ?? '';
    const abort = new AbortController();
    controller.current = abort;
    setPhase({ kind: 'saving', full, result, folder: label, copied: 0 });
    try {
      await saveFileToFolder(folderUri, result.fileName.replace(/\.zip$/i, ''), ZIP_MIME, result.file, {
        signal: abort.signal,
        onProgress: (copied) => setPhase({ kind: 'saving', full, result, folder: label, copied }),
      });
      recordHandover(result, full);
      discardBackup(result);
      setPhase({ kind: 'idle' });
      dispatch({ type: 'ui/SHOW_SNACK', msg: t('backup.savedTo', { folder: label }) });
    } catch (error) {
      console.warn('Saving the backup to a folder failed', error);
      setPhase({ kind: 'ready', full, result });
      if (!abort.signal.aborted) {
        // Most often the folder's permission was withdrawn or the folder is gone: ask again next time.
        dispatch({ type: 'settings/SET_BACKUP_FOLDER', uri: null, label: null });
        dispatch({ type: 'ui/SHOW_SNACK', msg: t('backup.saveFailed') });
      }
    } finally {
      controller.current = null;
    }
  }, [phase, backupFolderUri, backupFolderLabel, dispatch, recordHandover]);

  const handleCancel = useCallback(() => {
    if (controller.current) controller.current.abort();
    else setPhase({ kind: 'idle' });
  }, []);

  const handleDone = useCallback(() => {
    if (phase.kind === 'ready' && !shared.current) discardBackup(phase.result);
    if (phase.kind === 'ready' && shared.current) {
      dispatch({ type: 'ui/SHOW_SNACK', msg: t('backup.shared', { size: formatBytes(phase.result.bytes) }) });
    }
    setPhase({ kind: 'idle' });
  }, [phase, dispatch]);

  const overlay = (
    <BackupSheet
      phase={phase}
      canSaveToFolder={Platform.OS === 'android'}
      onChoose={handleChoose}
      onShare={handleShare}
      onSave={handleSave}
      onCancel={handleCancel}
      onDone={handleDone}
    />
  );

  return { backUpEverything, exportScope, busy: phase.kind !== 'idle', overlay };
}
