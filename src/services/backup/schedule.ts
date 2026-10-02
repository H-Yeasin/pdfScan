// §8 B5: when to remind about backups and when an automatic backup is due. Pure, so every rule
// can be tested with a clock.

const DAY = 24 * 60 * 60 * 1000;
// Remind when the last backup is older than this and the library changed since.
export const REMINDER_AFTER_MS = 30 * DAY;
// "Later" puts the reminder off for this long.
export const REMINDER_SNOOZE_MS = 14 * DAY;
// With no backup ever, remind once the library is big enough to matter.
export const REMINDER_MIN_DOCUMENTS = 20;
// Automatic backups kept in the folder; older ones the app made are deleted.
export const AUTO_BACKUPS_KEPT = 2;

export type AutoBackupFrequency = 'off' | 'weekly' | 'monthly';
export const AUTO_BACKUP_INTERVAL_MS: Record<Exclude<AutoBackupFrequency, 'off'>, number> = {
  weekly: 7 * DAY,
  monthly: 30 * DAY,
};

export function isAutoBackupFrequency(value: unknown): value is AutoBackupFrequency {
  return value === 'off' || value === 'weekly' || value === 'monthly';
}

export type ReminderInput = {
  now: number;
  lastBackupAt: number | null;
  // The newest change in the library (documents.updated_at / created_at); null: empty library.
  libraryChangedAt: number | null;
  documentCount: number;
  snoozedUntil: number | null;
};

export function backupReminderDue({ now, lastBackupAt, libraryChangedAt, documentCount, snoozedUntil }: ReminderInput): boolean {
  if (documentCount === 0 || libraryChangedAt === null) return false;
  if (snoozedUntil !== null && now < snoozedUntil) return false;
  if (lastBackupAt === null) return documentCount >= REMINDER_MIN_DOCUMENTS;
  return now - lastBackupAt > REMINDER_AFTER_MS && libraryChangedAt > lastBackupAt;
}

// Due once the interval has passed since the last automatic backup (or there never was one), and
// only when something changed since then - an untouched library needs no new copy.
export function autoBackupDue(input: {
  frequency: AutoBackupFrequency;
  lastAutoBackupAt: number | null;
  libraryChangedAt: number | null;
  now: number;
}): boolean {
  if (input.frequency === 'off' || input.libraryChangedAt === null) return false;
  if (input.lastAutoBackupAt === null) return true;
  if (input.libraryChangedAt <= input.lastAutoBackupAt) return false;
  return input.now - input.lastAutoBackupAt >= AUTO_BACKUP_INTERVAL_MS[input.frequency];
}

// `uris`: the automatic backups the app made, oldest first, the new one last. Keeps the newest
// `kept`; the rest are deleted. Nothing else in the folder is ever touched, because only these
// URIs are known.
export function rotateAutoBackups(uris: readonly string[], kept = AUTO_BACKUPS_KEPT): { keep: string[]; remove: string[] } {
  const unique = uris.filter((uri, i) => uris.indexOf(uri) === i);
  const split = Math.max(0, unique.length - kept);
  return { keep: unique.slice(split), remove: unique.slice(0, split) };
}
