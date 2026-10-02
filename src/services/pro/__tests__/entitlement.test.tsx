import { act, create } from 'react-test-renderer';
import * as SecureStore from 'expo-secure-store';
import {
  type Entitlement,
  getEntitlement,
  grantPass,
  isProActive,
  loadEntitlement,
  normalizeEntitlement,
  setEntitlement,
  useIsPro,
  useProFeature,
} from '../entitlement';

const HOUR = 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 2, 10, 0);

const pass = (checkedAt: number, hours: number): Entitlement => ({
  tier: 'pro',
  source: 'pass',
  expiresAt: checkedAt + hours * HOUR,
  checkedAt,
});

beforeEach(async () => {
  (SecureStore as unknown as { __reset(): void }).__reset();
  await setEntitlement(null);
});

describe('isProActive', () => {
  it('is false without an entitlement', () => {
    expect(isProActive(null, NOW)).toBe(false);
  });

  it('is true while a pass runs and false from its end', () => {
    const p = pass(NOW, 24);
    expect(isProActive(p, NOW)).toBe(true);
    expect(isProActive(p, NOW + 24 * HOUR - 1)).toBe(true);
    expect(isProActive(p, NOW + 24 * HOUR)).toBe(false);
  });

  it('is false when the clock is set back to before the pass', () => {
    expect(isProActive(pass(NOW, 24), NOW - HOUR)).toBe(false);
  });

  it('never ends a lifetime licence and ends a yearly one', () => {
    expect(isProActive({ tier: 'pro', source: 'lifetime', checkedAt: NOW }, NOW + 1000 * 24 * HOUR)).toBe(true);
    const yearly: Entitlement = { tier: 'pro', source: 'yearly', expiresAt: NOW + HOUR, checkedAt: NOW };
    expect(isProActive(yearly, NOW)).toBe(true);
    expect(isProActive(yearly, NOW + HOUR)).toBe(false);
  });
});

describe('grantPass', () => {
  it('starts a pass now', () => {
    expect(grantPass(null, NOW, 24)).toEqual(pass(NOW, 24));
  });

  it('starts fresh after an expired pass', () => {
    expect(grantPass(pass(NOW - 48 * HOUR, 24), NOW, 24)).toEqual(pass(NOW, 24));
  });

  it('adds to the end of a running pass', () => {
    expect(grantPass(pass(NOW - 2 * HOUR, 24), NOW, 24)).toEqual({ ...pass(NOW, 24), expiresAt: NOW + 46 * HOUR });
  });

  it('never replaces a paid licence', () => {
    const lifetime: Entitlement = { tier: 'pro', source: 'lifetime', checkedAt: NOW };
    expect(grantPass(lifetime, NOW, 24)).toBe(lifetime);
  });
});

describe('normalizeEntitlement', () => {
  it('accepts stored entitlements', () => {
    expect(normalizeEntitlement(pass(NOW, 24))).toEqual(pass(NOW, 24));
    expect(normalizeEntitlement({ tier: 'pro', source: 'lifetime', checkedAt: NOW })).toEqual({ tier: 'pro', source: 'lifetime', checkedAt: NOW });
  });

  it('rejects anything else', () => {
    for (const raw of [null, 'pro', {}, { tier: 'pro', source: 'gift', checkedAt: NOW }, { tier: 'pro', source: 'pass', checkedAt: NOW }]) {
      expect(normalizeEntitlement(raw)).toBeNull();
    }
  });
});

describe('storage', () => {
  it('survives a restart through the secure store', async () => {
    await setEntitlement(pass(NOW, 24));
    expect(await SecureStore.getItemAsync('pro.entitlement')).toBe(JSON.stringify(pass(NOW, 24)));
    await loadEntitlement();
    expect(getEntitlement()).toEqual(pass(NOW, 24));
  });

  it('reads a damaged value as no Pro', async () => {
    await SecureStore.setItemAsync('pro.entitlement', '{"tier":"pro"');
    await loadEntitlement();
    expect(getEntitlement()).toBeNull();
  });

  it('forgets the entitlement when cleared', async () => {
    await setEntitlement(pass(NOW, 24));
    await setEntitlement(null);
    expect(await SecureStore.getItemAsync('pro.entitlement')).toBeNull();
  });
});

describe('useIsPro', () => {
  afterEach(() => jest.useRealTimers());

  it('lapses on screen when the pass runs out, and lapse rules follow', async () => {
    jest.useFakeTimers({ now: NOW });
    const seen: { pro: boolean; lockKept: boolean; noBanners: boolean }[] = [];
    function Probe() {
      seen.push({ pro: useIsPro(), lockKept: useProFeature('appLock', 'keep'), noBanners: useProFeature('noBanners', 'keep') });
      return null;
    }
    await act(async () => {
      create(<Probe />);
    });
    expect(seen.at(-1)).toEqual({ pro: false, lockKept: true, noBanners: false });

    await act(async () => {
      await setEntitlement(pass(NOW, 1));
    });
    expect(seen.at(-1)).toEqual({ pro: true, lockKept: true, noBanners: true });

    await act(async () => {
      jest.advanceTimersByTime(HOUR);
    });
    expect(seen.at(-1)).toEqual({ pro: false, lockKept: true, noBanners: false });
  });
});
