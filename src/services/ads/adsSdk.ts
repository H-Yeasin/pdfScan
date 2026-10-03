import { useSyncExternalStore } from 'react';

// §10 M5: starting the Google Mobile Ads SDK. Only when Remote Config's `ads_enabled` is on, and
// only after the first frame (§9 O5's deferred boot, from AppNavigator), so a phone with ads
// switched off never loads the SDK and cold start doesn't pay for it. The SDK is required lazily
// for the same reason.
//
// Order, as Google asks: the UMP consent step first (it shows the form only where the law needs
// it: EEA, UK, Switzerland), then initialise, and request ads only when `canRequestAds`.

export type AdsSdkState = {
  status: 'off' | 'starting' | 'ready' | 'unavailable';
  // The consent form's rules apply on this phone (services/ads/adPolicy.nonPersonalizedOnly).
  gdprApplies: boolean;
};

const OFF: AdsSdkState = { status: 'off', gdprApplies: false };

let current: AdsSdkState = OFF;
const listeners = new Set<() => void>();

function set(next: AdsSdkState): void {
  current = next;
  listeners.forEach((l) => l());
}

export function getAdsSdkState(): AdsSdkState {
  return current;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAdsSdk(): AdsSdkState {
  return useSyncExternalStore(subscribe, getAdsSdkState, getAdsSdkState);
}

// Once per run; a failure (no Play services, no network for the consent step) leaves ads off
// until the next start, which is the safe side.
export async function startAds(): Promise<void> {
  if (current.status !== 'off') return;
  set({ ...current, status: 'starting' });
  try {
    const ads = require('react-native-google-mobile-ads') as typeof import('react-native-google-mobile-ads');
    const consent = await ads.AdsConsent.gatherConsent();
    const gdprApplies = await ads.AdsConsent.getGdprApplies().catch(() => false);
    if (!consent.canRequestAds) {
      set({ status: 'unavailable', gdprApplies });
      return;
    }
    // The audience is 13+ (§10 M1); keep ad content to what fits it.
    await ads.default().setRequestConfiguration({ maxAdContentRating: ads.MaxAdContentRating.T });
    await ads.default().initialize();
    set({ status: 'ready', gdprApplies });
  } catch (e) {
    console.warn('Ads not started', e);
    set({ ...current, status: 'unavailable' });
  }
}

// For tests.
export function resetAdsSdk(): void {
  set(OFF);
}
