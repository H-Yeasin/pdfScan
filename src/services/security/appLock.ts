import type { TKey } from '../../i18n';

// §10 M4: app lock (Pro). The phone's own biometrics, with its PIN, pattern or password as the
// fallback (expo-local-authentication); the app never keeps a PIN of its own. These are the pure
// rules; store/useAppLock.ts applies them to the app's state and AppState changes.
//
// Lapse rule 'keepUntilOff' (services/pro/proFeatures.ts): only turning the lock ON needs Pro. A
// lock that is on stays on when a pass ends, until the student turns it off, so nothing here
// looks at Pro.

export type LockAfter = 'immediately' | '1min' | '5min';

export type AppLockSettings = {
  enabled: boolean;
  // How long the app may be in the background before it asks again.
  after: LockAfter;
  // Android FLAG_SECURE (expo-screen-capture): a blank card in the recent apps, and no
  // screenshots or screen recording of the app.
  hideInRecents: boolean;
};

export const DEFAULT_APP_LOCK: AppLockSettings = { enabled: false, after: '1min', hideInRecents: false };

const AFTER_MS: Record<LockAfter, number> = { immediately: 0, '1min': 60_000, '5min': 300_000 };

export const LOCK_AFTER_OPTIONS: readonly { id: LockAfter; labelKey: TKey }[] = [
  { id: 'immediately', labelKey: 'settings.appLock.after.immediately' },
  { id: '1min', labelKey: 'settings.appLock.after.1min' },
  { id: '5min', labelKey: 'settings.appLock.after.5min' },
];

export function isLockAfter(value: unknown): value is LockAfter {
  return value === 'immediately' || value === '1min' || value === '5min';
}

// Stored JSON → settings; anything unreadable is the default (off).
export function normalizeAppLock(raw: unknown): AppLockSettings {
  if (!raw || typeof raw !== 'object') return DEFAULT_APP_LOCK;
  const r = raw as Record<string, unknown>;
  return {
    enabled: r.enabled === true,
    after: isLockAfter(r.after) ? r.after : DEFAULT_APP_LOCK.after,
    hideInRecents: r.hideInRecents === true,
  };
}

// Whether the app starts locked: always, when the lock is on. A file handed to the app with
// "Open with" on a cold start is opened underneath and shown only after the unlock.
export function lockedAtStart(settings: AppLockSettings): boolean {
  return settings.enabled;
}

// Whether coming back from the background needs the unlock. `backgroundedAt` null: the app never
// went to the background. A clock set back (now before backgroundedAt) locks: the safe side. An
// "Open with" while the app runs in the background comes back through here too.
export function lockOnReturn(settings: AppLockSettings, backgroundedAt: number | null, now: number): boolean {
  if (!settings.enabled || backgroundedAt === null) return false;
  const away = now - backgroundedAt;
  return away < 0 || away >= AFTER_MS[settings.after];
}

// What the unlock attempt's result means for the lock. `noDeviceLock`: the phone has no screen
// lock (or it was removed), so there is nothing to check against; the app opens rather than
// locking the student out of their own documents for good, and Settings says why.
export type UnlockOutcome = 'unlocked' | 'stayLocked';

export function unlockOutcome(result: { success: boolean; error?: string }, noDeviceLock: boolean): UnlockOutcome {
  if (result.success) return 'unlocked';
  if (noDeviceLock) return 'unlocked';
  if (result.error === 'not_enrolled' || result.error === 'passcode_not_set') return 'unlocked';
  return 'stayLocked';
}
