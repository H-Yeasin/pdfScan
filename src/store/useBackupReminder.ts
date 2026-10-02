import { useCallback, useEffect, useState } from 'react';
import { backupReminderDue, REMINDER_SNOOZE_MS } from '../services/backup/schedule';
import { getDb } from '../services/persistence/dbService';
import { libraryChangedAt } from '../services/persistence/libraryRepo';
import { useAppDispatch, useAppSelector } from './AppStateContext';

// §8 B5: whether Home shows "Last backup: … Back up now?" (services/backup/schedule.ts), and
// "Later", which puts it off for 14 days. When the library last changed comes from the database,
// read again whenever the documents change.
export function useBackupReminder(): { due: boolean; lastBackupAt: number | null; snooze: () => void } {
  const dispatch = useAppDispatch();
  const files = useAppSelector((s) => s.library.files);
  const loaded = useAppSelector((s) => s.library.loadStatus === 'ready' && s.settings.loaded);
  const lastBackupAt = useAppSelector((s) => s.settings.lastBackupAt);
  const snoozedUntil = useAppSelector((s) => s.settings.backupReminderSnoozedUntil);
  const [changedAt, setChangedAt] = useState<number | null>(null);

  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    getDb()
      .then(libraryChangedAt)
      .then((at) => {
        if (!cancelled) setChangedAt(at);
      })
      .catch((error) => console.warn('useBackupReminder failed', error));
    return () => {
      cancelled = true;
    };
  }, [loaded, files]);

  const snooze = useCallback(() => dispatch({ type: 'settings/SNOOZE_BACKUP_REMINDER', until: Date.now() + REMINDER_SNOOZE_MS }), [dispatch]);

  const due =
    loaded &&
    backupReminderDue({ now: Date.now(), lastBackupAt, libraryChangedAt: changedAt, documentCount: files.length, snoozedUntil });
  return { due, lastBackupAt, snooze };
}
