import {
  AUTO_BACKUP_INTERVAL_MS,
  autoBackupDue,
  backupReminderDue,
  REMINDER_AFTER_MS,
  REMINDER_MIN_DOCUMENTS,
  REMINDER_SNOOZE_MS,
  rotateAutoBackups,
} from '../schedule';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

describe('backupReminderDue', () => {
  const base = { now: NOW, lastBackupAt: null, libraryChangedAt: NOW - DAY, documentCount: REMINDER_MIN_DOCUMENTS, snoozedUntil: null };

  it('never backed up: only once the library has 20 documents', () => {
    expect(backupReminderDue(base)).toBe(true);
    expect(backupReminderDue({ ...base, documentCount: REMINDER_MIN_DOCUMENTS - 1 })).toBe(false);
    expect(backupReminderDue({ ...base, documentCount: 0, libraryChangedAt: null })).toBe(false);
  });

  it('backed up: after 30 days, and only if the library changed since', () => {
    const last = NOW - REMINDER_AFTER_MS - DAY;
    expect(backupReminderDue({ ...base, documentCount: 3, lastBackupAt: last })).toBe(true);
    expect(backupReminderDue({ ...base, documentCount: 3, lastBackupAt: NOW - 10 * DAY })).toBe(false);
    expect(backupReminderDue({ ...base, documentCount: 3, lastBackupAt: last, libraryChangedAt: last - DAY })).toBe(false);
  });

  it('"Later" snoozes it for 14 days', () => {
    expect(backupReminderDue({ ...base, snoozedUntil: NOW + REMINDER_SNOOZE_MS })).toBe(false);
    expect(backupReminderDue({ ...base, snoozedUntil: NOW - 1 })).toBe(true);
  });
});

describe('autoBackupDue', () => {
  const base = { frequency: 'weekly' as const, lastAutoBackupAt: NOW - AUTO_BACKUP_INTERVAL_MS.weekly, libraryChangedAt: NOW - DAY, now: NOW };

  it('weekly and monthly intervals', () => {
    expect(autoBackupDue(base)).toBe(true);
    expect(autoBackupDue({ ...base, lastAutoBackupAt: NOW - 6 * DAY })).toBe(false);
    expect(autoBackupDue({ ...base, frequency: 'monthly' })).toBe(false);
    expect(autoBackupDue({ ...base, frequency: 'monthly', lastAutoBackupAt: NOW - AUTO_BACKUP_INTERVAL_MS.monthly })).toBe(true);
  });

  it('off, never, and an unchanged library', () => {
    expect(autoBackupDue({ ...base, frequency: 'off' })).toBe(false);
    expect(autoBackupDue({ ...base, lastAutoBackupAt: null })).toBe(true);
    expect(autoBackupDue({ ...base, libraryChangedAt: base.lastAutoBackupAt - 1 })).toBe(false);
    expect(autoBackupDue({ ...base, libraryChangedAt: null })).toBe(false);
  });
});

describe('rotateAutoBackups', () => {
  it('keeps the newest two of its own', () => {
    expect(rotateAutoBackups(['a', 'b', 'c'])).toEqual({ keep: ['b', 'c'], remove: ['a'] });
    expect(rotateAutoBackups(['a', 'b'])).toEqual({ keep: ['a', 'b'], remove: [] });
    expect(rotateAutoBackups(['a'])).toEqual({ keep: ['a'], remove: [] });
    // The same URI twice (a provider reusing it) is one backup.
    expect(rotateAutoBackups(['a', 'b', 'b'])).toEqual({ keep: ['a', 'b'], remove: [] });
  });
});
