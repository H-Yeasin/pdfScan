import { backgroundedAtOnLeave, DEFAULT_APP_LOCK, lockedAtStart, lockOnReturn, normalizeAppLock, unlockOutcome, type AppLockSettings } from '../appLock';
import { canUseProFeature } from '../../pro/proFeatures';

const NOW = Date.UTC(2026, 9, 2, 10, 0);
const on = (after: AppLockSettings['after']): AppLockSettings => ({ enabled: true, after, hideInRecents: false });

describe('app lock timing', () => {
  it('locks at start only when on', () => {
    expect(lockedAtStart(on('5min'))).toBe(true);
    expect(lockedAtStart(DEFAULT_APP_LOCK)).toBe(false);
  });

  it('locks on return once the chosen time has passed', () => {
    expect(lockOnReturn(on('immediately'), NOW, NOW)).toBe(true);
    expect(lockOnReturn(on('1min'), NOW, NOW + 59_999)).toBe(false);
    expect(lockOnReturn(on('1min'), NOW, NOW + 60_000)).toBe(true);
    expect(lockOnReturn(on('5min'), NOW, NOW + 4 * 60_000)).toBe(false);
    expect(lockOnReturn(on('5min'), NOW, NOW + 5 * 60_000)).toBe(true);
  });

  it('never locks when off or without a trip to the background', () => {
    expect(lockOnReturn(DEFAULT_APP_LOCK, NOW, NOW + 3_600_000)).toBe(false);
    expect(lockOnReturn(on('immediately'), null, NOW)).toBe(false);
  });

  it('locks when the clock was set back', () => {
    expect(lockOnReturn(on('5min'), NOW, NOW - 1)).toBe(true);
  });
});

describe('unlock', () => {
  it('opens on success and stays locked on a cancel or a failed try', () => {
    expect(unlockOutcome({ success: true }, false)).toBe('unlocked');
    expect(unlockOutcome({ success: false, error: 'user_cancel' }, false)).toBe('stayLocked');
    expect(unlockOutcome({ success: false, error: 'lockout' }, false)).toBe('stayLocked');
  });

  it("doesn't lock the student out when the phone has no screen lock any more", () => {
    expect(unlockOutcome({ success: false }, true)).toBe('unlocked');
    expect(unlockOutcome({ success: false, error: 'passcode_not_set' }, false)).toBe('unlocked');
  });
});

describe('stored settings', () => {
  it('reads anything unexpected as off', () => {
    expect(normalizeAppLock(undefined)).toEqual(DEFAULT_APP_LOCK);
    expect(normalizeAppLock({ enabled: 'yes', after: '10min' })).toEqual(DEFAULT_APP_LOCK);
    expect(normalizeAppLock({ enabled: true, after: '5min', hideInRecents: true })).toEqual({ enabled: true, after: '5min', hideInRecents: true });
  });
});

describe('lapse rule (keepUntilOff)', () => {
  it('needs Pro to turn on, and keeps working without it', () => {
    expect(canUseProFeature('appLock', 'start', false)).toBe(false);
    expect(canUseProFeature('appLock', 'start', true)).toBe(true);
    expect(canUseProFeature('appLock', 'keep', false)).toBe(true);
  });
});

describe('an external screen (unlock sheet, rewarded ad)', () => {
  it('is not leaving the app: no lock on return, even with "lock right away"', () => {
    const left = backgroundedAtOnLeave(true, 1_000);
    expect(left).toBeNull();
    expect(lockOnReturn(on('immediately'), left, 60_000)).toBe(false);
  });

  it('a real trip out still locks', () => {
    expect(lockOnReturn(on('immediately'), backgroundedAtOnLeave(false, 1_000), 1_000)).toBe(true);
  });
});
