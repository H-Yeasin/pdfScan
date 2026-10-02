import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as ScreenCapture from 'expo-screen-capture';
import { t } from '../i18n';
import { lockedAtStart, lockOnReturn, unlockOutcome } from '../services/security/appLock';
import { useAppSlices } from './AppStateContext';

// §10 M4: applies the app lock rules (services/security/appLock.ts) to the running app.
// 'unknown' until settings are read, so nothing renders before we know whether to lock.

export type AppLockStatus = 'unknown' | 'locked' | 'unlocked';

// True while the phone's own unlock sheet is up. On Android the PIN / pattern fallback is a
// separate system screen, so the app goes to the background and comes back during it; those
// moves must not count as leaving the app (or "lock right away" would lock again at once).
let authenticating = false;

// Whether the phone has any screen lock (PIN, pattern, password or biometrics) to check against.
export async function hasDeviceLock(): Promise<boolean> {
  try {
    return (await LocalAuthentication.getEnrolledLevelAsync()) !== LocalAuthentication.SecurityLevel.NONE;
  } catch {
    return false;
  }
}

// The phone's unlock sheet: biometrics, with the device PIN / pattern / password as the fallback.
export async function authenticate(promptMessage: string): Promise<{ success: boolean; error?: string }> {
  authenticating = true;
  try {
    const result = await LocalAuthentication.authenticateAsync({ promptMessage, cancelLabel: t('common.cancel'), disableDeviceFallback: false });
    return result.success ? { success: true } : { success: false, error: result.error };
  } catch (error) {
    console.warn('App lock: authentication failed to start', error);
    return { success: false, error: 'unknown' };
  } finally {
    authenticating = false;
  }
}

const SCREEN_CAPTURE_KEY = 'appLock';

// `promptTick` changes each time the lock screen should ask (shown, or back from the background
// while locked); the lock screen asks on each change.
export function useAppLock(): { status: AppLockStatus; promptTick: number; unlock: () => Promise<void> } {
  const { settings } = useAppSlices('settings');
  const { loaded, appLock } = settings;
  const [status, setStatus] = useState<AppLockStatus>('unknown');
  const [promptTick, setPromptTick] = useState(0);
  const lockRef = useRef(appLock);
  lockRef.current = appLock;
  const backgroundedAt = useRef<number | null>(null);

  // Once, when settings are in: a cold start with the lock on starts locked.
  useEffect(() => {
    if (loaded && status === 'unknown') setStatus(lockedAtStart(appLock) ? 'locked' : 'unlocked');
  }, [loaded, status, appLock]);

  // Turning the lock off unlocks; turning it on doesn't lock the student out on the spot.
  useEffect(() => {
    if (!appLock.enabled) setStatus((s) => (s === 'locked' ? 'unlocked' : s));
  }, [appLock.enabled]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background') {
        if (!authenticating) backgroundedAt.current = Date.now();
      } else if (next === 'active') {
        // null: no real trip to the background (or only the unlock sheet's own).
        if (backgroundedAt.current === null) return;
        if (lockOnReturn(lockRef.current, backgroundedAt.current, Date.now())) {
          setStatus('locked');
          setPromptTick((n) => n + 1);
        }
        backgroundedAt.current = null;
      }
    });
    return () => sub.remove();
  }, []);

  // "Hide in recent apps" (Android): FLAG_SECURE, which also blocks screenshots. Only while the
  // lock is on.
  const hide = Platform.OS === 'android' && appLock.enabled && appLock.hideInRecents;
  useEffect(() => {
    const apply = hide ? ScreenCapture.preventScreenCaptureAsync(SCREEN_CAPTURE_KEY) : ScreenCapture.allowScreenCaptureAsync(SCREEN_CAPTURE_KEY);
    apply.catch((error: unknown) => console.warn('App lock: could not change screen capture protection', error));
  }, [hide]);

  const unlock = useCallback(async () => {
    if (authenticating) return;
    const deviceLock = await hasDeviceLock();
    const result = deviceLock ? await authenticate(t('lock.prompt')) : { success: false };
    if (unlockOutcome(result, !deviceLock) === 'unlocked') {
      backgroundedAt.current = null;
      setStatus('unlocked');
    }
  }, []);

  return { status, promptTick, unlock };
}
