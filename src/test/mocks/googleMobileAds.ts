// react-native-google-mobile-ads for tests: consent that allows ads outside the EEA, an SDK that
// initialises, and a BannerAd that renders a marker with its props (tests call its callbacks).
import { createElement } from 'react';

export const consent = { canRequestAds: true, gdprApplies: false };
export const AdsConsent = {
  gatherConsent: jest.fn(async () => ({ canRequestAds: consent.canRequestAds })),
  getGdprApplies: jest.fn(async () => consent.gdprApplies),
  showPrivacyOptionsForm: jest.fn(async () => ({ canRequestAds: consent.canRequestAds })),
};
const mobileAds = {
  initialize: jest.fn(async () => []),
  setRequestConfiguration: jest.fn(async () => {}),
};
export default function MobileAds() {
  return mobileAds;
}
export const MaxAdContentRating = { G: 'G', PG: 'PG', T: 'T', MA: 'MA' };
export const TestIds = {
  ADAPTIVE_BANNER: 'ca-app-pub-3940256099942544/9214589741',
  BANNER: 'ca-app-pub-3940256099942544/6300978111',
  REWARDED: 'ca-app-pub-3940256099942544/5224354917',
};
export const AdEventType = { LOADED: 'loaded', ERROR: 'error', OPENED: 'opened', CLOSED: 'closed' };
export const RewardedAdEventType = { LOADED: 'rewarded_loaded', EARNED_REWARD: 'rewarded_earned_reward' };

// A rewarded ad: load() fires LOADED (or ERROR when `rewardedBehaviour.loads` is false), and
// show() plays `rewardedBehaviour.script`, by default watching to the end and closing.
export class FakeRewardedAd {
  listeners = new Map<string, Set<(payload?: unknown) => void>>();
  unitId: string;
  requestOptions: unknown;
  constructor(unitId: string, requestOptions: unknown) {
    this.unitId = unitId;
    this.requestOptions = requestOptions;
  }
  addAdEventListener(type: string, listener: (payload?: unknown) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
    return () => this.listeners.get(type)!.delete(listener);
  }
  emit(type: string, payload?: unknown) {
    this.listeners.get(type)?.forEach((l) => l(payload));
  }
  load = jest.fn(() => {
    if (rewardedBehaviour.loads) setTimeout(() => this.emit(RewardedAdEventType.LOADED), 0);
    else setTimeout(() => this.emit(AdEventType.ERROR, new Error('no fill')), 0);
  });
  show = jest.fn(async () => {
    for (const type of rewardedBehaviour.script) {
      await Promise.resolve();
      this.emit(type);
    }
  });
}
export const rewardedBehaviour = { loads: true, script: [RewardedAdEventType.EARNED_REWARD, AdEventType.CLOSED] };
export let lastRewarded: FakeRewardedAd | null = null;
export const RewardedAd = {
  createForAdRequest: jest.fn((unitId: string, requestOptions: unknown) => {
    lastRewarded = new FakeRewardedAd(unitId, requestOptions);
    return lastRewarded;
  }),
};
export const BannerAdSize = { ANCHORED_ADAPTIVE_BANNER: 'ANCHORED_ADAPTIVE_BANNER' };
export function BannerAd(props: Record<string, unknown>) {
  return createElement('BannerAd', props);
}
