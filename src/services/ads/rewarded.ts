import { Platform } from 'react-native';
import type { RewardedAd } from 'react-native-google-mobile-ads';
import { claimDayPass } from '../pro/dayPass';
import { getRemoteConfig } from '../remote/remoteConfig';
import { beginExternalScreen } from '../security/externalScreen';
import { nonPersonalizedOnly, rewardedUnitId } from './adPolicy';
import { getAdsSdkState, startAds } from './adsSdk';

// Rewarded (full-screen) ads, only ever started by the student: §10 M6's "Watch an ad, get Pro
// for `pass_hours`" on the Pro screen, and §12 D1's "Watch a short ad to convert" before a Pro task.
// Never a popup, never during a scan, save or submit. The reward event (watched to the end) is
// what counts; closing the ad before that gives nothing.

// §14 Q1: why no ad showed, so a task's sheet can say so (and services/pro/proTaskFlow can tell
// an offline phone, which gets a small grace, from everything else, which gets none).
export type AdUnavailableReason =
  // Remote Config `ads_enabled` is off.
  | 'adsOff'
  // No rewarded unit for this platform in a release build.
  | 'noUnit'
  // The SDK didn't start, or the ad failed to show.
  | 'sdk'
  // Consent doesn't allow ads (services/ads/adsSdk).
  | 'consent'
  // The ad failed to load (no fill, offline).
  | 'noFill'
  // No ad came within the timeout.
  | 'timeout';

export type ShowResult =
  // Watched to the end (the reward came in) and closed.
  | 'rewarded'
  // Closed before the reward.
  | 'closedEarly'
  // No ad could be shown.
  | { unavailable: AdUnavailableReason };

export type WatchResult =
  // A pass was granted.
  | 'granted'
  // Today's passes are used up (checked before and again at the reward).
  | 'capped'
  | Exclude<ShowResult, 'rewarded'>;

// The Pro pass waits long enough for a slow network; a stuck load gives up rather than leaving
// the button spinning. A task's ad waits far less (Remote Config `task_ad_timeout_ms`, 8 s): the
// student asked to convert a file and is waiting on it.
export const PASS_AD_TIMEOUT_MS = 30_000;

// AdMob drops a loaded ad after about an hour; a preloaded one is used only while well inside
// that, and reloaded otherwise.
export const PRELOAD_MAX_AGE_MS = 50 * 60 * 1000;

export function isPreloadFresh(loadedAt: number, now: number): boolean {
  const age = now - loadedAt;
  return age >= 0 && age < PRELOAD_MAX_AGE_MS;
}

type Ads = typeof import('react-native-google-mobile-ads');

function adsModule(): Ads {
  return require('react-native-google-mobile-ads') as Ads;
}

// The unit and request for this phone, or why no ad may be asked for.
function createAd(personalizedAdsEnabled: boolean): { ad: RewardedAd } | { reason: AdUnavailableReason } {
  const remote = getRemoteConfig();
  const sdk = getAdsSdkState();
  if (!remote.adsEnabled) return { reason: 'adsOff' };
  if (sdk.status !== 'ready') return { reason: sdk.reason ?? 'sdk' };
  const ads = adsModule();
  const unitId = rewardedUnitId(Platform.OS, remote, __DEV__, ads.TestIds.REWARDED);
  if (!unitId) return { reason: 'noUnit' };
  return {
    ad: ads.RewardedAd.createForAdRequest(unitId, {
      requestNonPersonalizedAdsOnly: nonPersonalizedOnly(sdk.gdprApplies, personalizedAdsEnabled),
    }),
  };
}

// One ad loaded ahead, so a task's ad shows at once instead of after a wait.
type Preloaded = { ad: RewardedAd; loadedAt: number | null; failed: boolean };
let preloaded: Preloaded | null = null;

// Called when a screen with Pro tasks opens (D1: the Reader for a convertible or editable
// document, a Library selection). Only when the SDK is already running: starting it here could
// show the consent form while the student is just reading. Best-effort; a failed load is simply
// replaced by a fresh load when the ad is wanted.
export function preloadRewarded(opts: { personalizedAdsEnabled: boolean; now?: () => number }): void {
  const now = opts.now ?? Date.now;
  if (preloaded && !preloaded.failed && (preloaded.loadedAt === null || isPreloadFresh(preloaded.loadedAt, now()))) return;
  const created = createAd(opts.personalizedAdsEnabled);
  if (!('ad' in created)) return;
  const { ad } = created;
  const ads = adsModule();
  const entry: Preloaded = { ad, loadedAt: null, failed: false };
  const offLoaded = ad.addAdEventListener(ads.RewardedAdEventType.LOADED, () => {
    entry.loadedAt = now();
    offLoaded();
    offError();
  });
  const offError = ad.addAdEventListener(ads.AdEventType.ERROR, () => {
    entry.failed = true;
    offLoaded();
    offError();
  });
  preloaded = entry;
  ad.load();
}

// The preloaded ad if it finished loading and is fresh; it is used once.
function takePreloaded(now: number): RewardedAd | null {
  const entry = preloaded;
  if (!entry || entry.failed || entry.loadedAt === null || !isPreloadFresh(entry.loadedAt, now)) return null;
  preloaded = null;
  return entry.ad;
}

// Load (or take the preloaded ad) and show one rewarded ad. `onReward` runs on the reward event,
// before the ad closes, so what was earned is saved even if the app is killed with the ad up.
// While the ad is on screen it counts as an external screen, so the app lock doesn't treat it as
// leaving the app.
export async function showRewarded(opts: {
  timeoutMs: number;
  personalizedAdsEnabled: boolean;
  onReward?: () => void;
  // Just before the ad goes on screen (for the M8 count of ads shown).
  onShow?: () => void;
  now?: () => number;
}): Promise<ShowResult> {
  if (!getRemoteConfig().adsEnabled) return { unavailable: 'adsOff' };
  const now = opts.now ?? Date.now;
  // A preloaded ad has already loaded, so it shows at once.
  const preloadedAd = takePreloaded(now());
  const ready = preloadedAd !== null;
  let shown: RewardedAd;
  if (preloadedAd) {
    shown = preloadedAd;
  } else {
    await startAds({ retry: true });
    const created = createAd(opts.personalizedAdsEnabled);
    if (!('ad' in created)) return { unavailable: created.reason };
    shown = created.ad;
  }
  const ads = adsModule();

  return new Promise<ShowResult>((resolve) => {
    const unsubscribers: (() => void)[] = [];
    let rewarded = false;
    let settled = false;
    let endExternal: (() => void) | null = null;
    const finish = (result: ShowResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribers.forEach((off) => off());
      endExternal?.();
      resolve(result);
    };
    const show = () => {
      clearTimeout(timer);
      endExternal = beginExternalScreen();
      opts.onShow?.();
      shown.show().catch(() => finish({ unavailable: 'sdk' }));
    };
    const timer = setTimeout(() => finish({ unavailable: 'timeout' }), opts.timeoutMs);

    unsubscribers.push(
      shown.addAdEventListener(ads.RewardedAdEventType.EARNED_REWARD, () => {
        rewarded = true;
        opts.onReward?.();
      }),
      shown.addAdEventListener(ads.AdEventType.CLOSED, () => finish(rewarded ? 'rewarded' : 'closedEarly')),
      shown.addAdEventListener(ads.AdEventType.ERROR, () => finish({ unavailable: 'noFill' }))
    );
    if (ready) {
      show();
    } else {
      unsubscribers.push(shown.addAdEventListener(ads.RewardedAdEventType.LOADED, show));
      shown.load();
    }
  });
}

export async function watchAdForPass(opts: { personalizedAdsEnabled: boolean; passesLeft: number; now?: () => number }): Promise<WatchResult> {
  if (!getRemoteConfig().adsEnabled) return { unavailable: 'adsOff' };
  if (opts.passesLeft <= 0) return 'capped';
  const now = opts.now ?? Date.now;
  let granted: Promise<boolean> | null = null;
  const result = await showRewarded({
    timeoutMs: PASS_AD_TIMEOUT_MS,
    personalizedAdsEnabled: opts.personalizedAdsEnabled,
    now,
    onReward: () => {
      // Granted now, so a pass isn't lost if the app is killed before the ad is closed.
      const config = getRemoteConfig();
      granted = claimDayPass(now(), config.passHours, config.passMaxPerDay);
    },
  });
  if (result !== 'rewarded') return result;
  return (await (granted ?? Promise.resolve(false))) ? 'granted' : 'capped';
}

// For tests.
export function resetRewarded(): void {
  preloaded = null;
}
