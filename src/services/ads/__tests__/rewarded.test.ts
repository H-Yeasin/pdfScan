import * as Ads from 'react-native-google-mobile-ads';
import * as SecureStore from 'expo-secure-store';
import { resetAdsSdk, startAds } from '../adsSdk';
import { isPreloadFresh, preloadRewarded, resetRewarded, showRewarded, watchAdForPass } from '../rewarded';
import { getEntitlement, isProActive, setEntitlement } from '../../pro/entitlement';
import { loadPassLog } from '../../pro/dayPass';
import { REMOTE_DEFAULTS, setRemoteConfig } from '../../remote/remoteConfig';

type Mock = typeof Ads & {
  rewardedBehaviour: { loads: boolean; script: string[] };
  lastRewarded: { unitId: string; requestOptions: unknown } | null;
};
const mock = Ads as unknown as Mock;
const EARNED = 'rewarded_earned_reward';
const CLOSED = 'closed';
const NOON = new Date(2026, 9, 3, 12, 0).getTime();
const watch = (passesLeft = 3) => watchAdForPass({ personalizedAdsEnabled: true, passesLeft, now: () => NOON });

beforeEach(async () => {
  (SecureStore as unknown as { __reset(): void }).__reset();
  await setEntitlement(null);
  resetAdsSdk();
  resetRewarded();
  jest.clearAllMocks();
  setRemoteConfig({ ...REMOTE_DEFAULTS, adsEnabled: true, passHours: 24, passMaxPerDay: 3 });
  mock.rewardedBehaviour.loads = true;
  mock.rewardedBehaviour.script = [EARNED, CLOSED];
});

afterAll(() => setRemoteConfig(REMOTE_DEFAULTS));

describe('watchAdForPass', () => {
  it("grants a pass of pass_hours when the ad is watched to the end, with Google's test unit in dev", async () => {
    expect(await watch()).toBe('granted');
    expect(mock.lastRewarded?.unitId).toBe(Ads.TestIds.REWARDED);
    expect(getEntitlement()).toMatchObject({ source: 'pass', expiresAt: NOON + 24 * 60 * 60 * 1000 });
    expect(await loadPassLog()).toEqual([NOON]);
  });

  it('gives nothing when the ad is closed before the reward', async () => {
    mock.rewardedBehaviour.script = [CLOSED];
    expect(await watch()).toBe('closedEarly');
    expect(isProActive(getEntitlement(), NOON)).toBe(false);
    expect(await loadPassLog()).toEqual([]);
  });

  it('applies the daily cap', async () => {
    expect(await watch(0)).toBe('capped');
    setRemoteConfig({ ...REMOTE_DEFAULTS, adsEnabled: true, passMaxPerDay: 1 });
    expect(await watch(1)).toBe('granted');
    // The screen thought one was left, but the log says today's is used: the reward gives nothing.
    expect(await watch(1)).toBe('capped');
  });

  it('is unavailable with ads switched off, and fails when no ad comes', async () => {
    setRemoteConfig({ ...REMOTE_DEFAULTS, adsEnabled: false });
    expect(await watch()).toBe('unavailable');
    setRemoteConfig({ ...REMOTE_DEFAULTS, adsEnabled: true });
    mock.rewardedBehaviour.loads = false;
    expect(await watch()).toBe('failed');
    expect(getEntitlement()).toBeNull();
  });
});

describe('preloaded ads', () => {
  const MIN = 60 * 1000;

  it('counts as fresh only under 50 minutes old (AdMob drops a loaded ad after about an hour)', () => {
    expect(isPreloadFresh(NOON, NOON + 49 * MIN)).toBe(true);
    expect(isPreloadFresh(NOON, NOON + 50 * MIN)).toBe(false);
    expect(isPreloadFresh(NOON, NOON - MIN)).toBe(false);
  });

  it('shows a fresh preloaded ad at once, and loads a new one when it is too old', async () => {
    await startAds();
    let clock = NOON;
    preloadRewarded({ personalizedAdsEnabled: true, now: () => clock });
    await new Promise((r) => setTimeout(r, 0));
    const preloaded = mock.lastRewarded;
    expect(await showRewarded({ timeoutMs: 8_000, personalizedAdsEnabled: true, now: () => clock })).toBe('rewarded');
    expect(mock.lastRewarded).toBe(preloaded);
    expect((preloaded as unknown as { load: jest.Mock }).load).toHaveBeenCalledTimes(1);

    preloadRewarded({ personalizedAdsEnabled: true, now: () => clock });
    await new Promise((r) => setTimeout(r, 0));
    const stale = mock.lastRewarded;
    clock = NOON + 51 * MIN;
    expect(await showRewarded({ timeoutMs: 8_000, personalizedAdsEnabled: true, now: () => clock })).toBe('rewarded');
    expect(mock.lastRewarded).not.toBe(stale);
  });

  it('does not start the ads SDK (and its consent form) just to preload', () => {
    preloadRewarded({ personalizedAdsEnabled: true });
    expect(Ads.RewardedAd.createForAdRequest).not.toHaveBeenCalled();
  });
});
