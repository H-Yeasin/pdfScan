import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { formatBytes, t } from '../i18n';
import { runAutoBackup } from '../services/backup/autoBackup';
import { BackupBusyError } from '../services/backup/createBackup';
import { autoBackupDue } from '../services/backup/schedule';
import { getDb } from '../services/persistence/dbService';
import { libraryChangedAt } from '../services/persistence/libraryRepo';
import { useAppDispatch, useAppSelector } from './AppStateContext';
import { logUsage } from '../services/telemetry/usage';

// §8 B5, Android: when the app opens (after boot) and an automatic backup is due, makes one in the
// background into the backup folder, with a small progress chip (ui.autoBackupProgress). Never
// while a scan session is open - scanning and saving need the phone's attention and space more.
// Once per launch at most; a failure is retried next launch.
export function useAutoBackup(ready: boolean): void {
  const dispatch = useAppDispatch();
  const frequency = useAppSelector((s) => s.settings.autoBackup);
  const folderUri = useAppSelector((s) => s.settings.backupFolderUri);
  const lastAutoBackupAt = useAppSelector((s) => s.settings.lastAutoBackupAt);
  const previousUris = useAppSelector((s) => s.settings.autoBackupUris);
  const sessionOpen = useAppSelector((s) => s.capture.pages.length > 0 || s.capture.processingStatus !== 'idle');
  const tried = useRef(false);

  useEffect(() => {
    if (Platform.OS !== 'android' || !ready || tried.current || sessionOpen || frequency === 'off' || !folderUri) return;
    // Once per launch: settings this run changes (lastAutoBackupAt, the uris) don't start another.
    tried.current = true;
    (async () => {
      const changedAt = await libraryChangedAt(await getDb());
      if (!autoBackupDue({ frequency, lastAutoBackupAt, libraryChangedAt: changedAt, now: Date.now() })) return;
      dispatch({ type: 'ui/SET_AUTO_BACKUP_PROGRESS', progress: 0 });
      let shown = 0;
      const result = await runAutoBackup({
        folderUri,
        previousUris,
        onProgress: (fraction) => {
          // A step per percent is plenty for a chip.
          const rounded = Math.floor(fraction * 100) / 100;
          if (rounded !== shown) {
            shown = rounded;
            dispatch({ type: 'ui/SET_AUTO_BACKUP_PROGRESS', progress: rounded });
          }
        },
      });
      dispatch({ type: 'settings/AUTO_BACKUP_DONE', at: Date.now(), bytes: result.bytes, uris: result.uris });
      logUsage('backup_made');
      dispatch({ type: 'ui/SHOW_SNACK', msg: t('backup.auto.done', { size: formatBytes(result.bytes) }) });
    })()
      .catch((error) => {
        // Busy: the student is backing up by hand right now, which does the same job.
        if (!(error instanceof BackupBusyError)) console.warn('Automatic backup failed', error);
      })
      .finally(() => dispatch({ type: 'ui/SET_AUTO_BACKUP_PROGRESS', progress: null }));
  }, [ready, sessionOpen, frequency, folderUri, lastAutoBackupAt, previousUris, dispatch]);
}
