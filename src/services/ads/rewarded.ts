import { Platform } from 'react-native';
import { claimDayPass } from '../pro/dayPass';
import { getRemoteConfig } from '../remote/remoteConfig';
import { nonPersonalizedOnly, rewardedUnitId } from './adPolicy';
import { getAdsSdkState, startAds } from './adsSdk';

// §10 M6: "Watch an ad, get Pro for 24 hours". Only ever started by the student, from the Pro
// screen's button: never a popup, never during a scan, save or submit. One rewarded ad is loaded
// and shown; the pass is granted on the reward event (watched to the end), and closing the ad
// before that gives nothing.

export type WatchResult =
  // A pass was granted.
  | 'granted'
  // Closed before the reward.
  | 'closedEarly'
  // Today's passes are used up (checked before and again at the reward).
  | 'capped'
  // Ads are off in Remote Config, consent doesn't allow them, or no unit is set.
  | 'unavailable'
  // No ad came (no fill, offline, an SDK error).
  | 'failed';

// Long enough for a slow network; a stuck load gives up rather than leaving the button spinning.
const LOAD_TIMEOUT_MS = 30_000;

export async function watchAdForPass(opts: { personalizedAdsEnabled: boolean; passesLeft: number; now?: () => number }): Promise<WatchResult> {
  const remote = getRemoteConfig();
  if (!remote.adsEnabled) return 'unavailable';
  if (opts.passesLeft <= 0) return 'capped';
  await startAds({ retry: true });
  const sdk = getAdsSdkState();
  if (sdk.status !== 'ready') return 'unavailable';

  const ads = require('react-native-google-mobile-ads') as typeof import('react-native-google-mobile-ads');
  const unitId = rewardedUnitId(Platform.OS, remote, __DEV__, ads.TestIds.REWARDED);
  if (!unitId) return 'unavailable';
  const now = opts.now ?? Date.now;

  const ad = ads.RewardedAd.createForAdRequest(unitId, {
    requestNonPersonalizedAdsOnly: nonPersonalizedOnly(sdk.gdprApplies, opts.personalizedAdsEnabled),
  });

  return new Promise<WatchResult>((resolve) => {
    const unsubscribers: (() => void)[] = [];
    let granted: Promise<boolean> | null = null;
    let settled = false;
    const finish = (result: WatchResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribers.forEach((off) => off());
      resolve(result);
    };
    const timer = setTimeout(() => finish('failed'), LOAD_TIMEOUT_MS);

    unsubscribers.push(
      ad.addAdEventListener(ads.RewardedAdEventType.LOADED, () => {
        clearTimeout(timer);
        ad.show().catch(() => finish('failed'));
      }),
      ad.addAdEventListener(ads.RewardedAdEventType.EARNED_REWARD, () => {
        // Granted now, so a pass isn't lost if the app is killed before the ad is closed.
        const config = getRemoteConfig();
        granted = claimDayPass(now(), config.passHours, config.passMaxPerDay);
      }),
      ad.addAdEventListener(ads.AdEventType.CLOSED, () => {
        if (!granted) {
          finish('closedEarly');
          return;
        }
        void granted.then((ok) => finish(ok ? 'granted' : 'capped'));
      }),
      ad.addAdEventListener(ads.AdEventType.ERROR, () => finish('failed'))
    );
    ad.load();
  });
}
