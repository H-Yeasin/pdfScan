import { useSyncExternalStore } from 'react';
import type { AdsConsentInfoOptions } from 'react-native-google-mobile-ads';

// §10 M5: starting the Google Mobile Ads SDK. Only when Remote Config's `ads_enabled` is on, and
// only after the first frame (§9 O5's deferred boot, from AppNavigator), so a phone with ads
// switched off never loads the SDK and cold start doesn't pay for it. The SDK is required lazily
// for the same reason.
//
// Order, as Google asks (UMP "Get started"): the UMP consent step first (it shows the form only
// where the law needs it: EEA, UK, Switzerland), then initialise, and request ads only when
// `canRequestAds`. When the step itself fails, Google's flow logs it and still asks
// canRequestAds, which keeps an earlier run's answer. Measured on 2026-10-23
// (docs/qa/reload-blank-and-consent.md): until the GDPR message is made in AdMob (docs/ads.md,
// "Setup details" step 2) the step fails on every phone, EEA or not ("no form(s) configured"),
// and UMP 4.0 then reports canRequestAds true, so ads run with no consent message anywhere. Dev
// builds run the same step, so this shows before a release does.

export type AdsSdkState = {
  status: 'off' | 'starting' | 'ready' | 'unavailable';
  // The consent form's rules apply on this phone (services/ads/adPolicy.nonPersonalizedOnly).
  gdprApplies: boolean;
  // Why it is 'unavailable' (§14 Q1: a task's ad sheet says which): consent doesn't allow ads,
  // or the SDK failed to start (no Play services, or the consent step failed with no answer
  // that allows ads).
  reason?: 'consent' | 'sdk';
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

// Dev builds only (a release build ignores both): EXPO_PUBLIC_ADS_CONSENT_GEOGRAPHY=EEA or NOT_EEA
// has UMP treat this phone as inside or outside the EEA, so the consent path can be tried before a
// release. UMP honours it only on a test device: an emulator is one; a phone's hashed id (UMP
// prints it in logcat) goes in EXPO_PUBLIC_ADS_TEST_DEVICE_IDS, comma-separated. Set them in
// .env.local and restart Metro.
export function consentDebugOptions(
  geographies: typeof import('react-native-google-mobile-ads').AdsConsentDebugGeography,
  dev: boolean,
  geography: string | undefined,
  testDeviceIds: string | undefined
): AdsConsentInfoOptions {
  if (!dev) return {};
  const options: AdsConsentInfoOptions = {};
  if (geography === 'EEA' || geography === 'NOT_EEA') options.debugGeography = geographies[geography];
  const ids = (testDeviceIds ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  if (ids.length) options.testDeviceIdentifiers = ids;
  return options;
}

// Once per run; a failure (no Play services, or a consent step that failed with nothing that
// allows ads) leaves ads off until the next start, which is the safe side. `retry`: the student
// asked for an ad (M6's day pass), so a run that failed earlier (offline then) tries again.
export async function startAds({ retry = false }: { retry?: boolean } = {}): Promise<void> {
  if (current.status === 'starting' || current.status === 'ready') return;
  if (current.status === 'unavailable' && !retry) return;
  set({ ...current, status: 'starting' });
  try {
    const ads = require('react-native-google-mobile-ads') as typeof import('react-native-google-mobile-ads');
    const options = consentDebugOptions(
      ads.AdsConsentDebugGeography,
      __DEV__,
      process.env.EXPO_PUBLIC_ADS_CONSENT_GEOGRAPHY,
      process.env.EXPO_PUBLIC_ADS_TEST_DEVICE_IDS
    );
    const stepFailed = await ads.AdsConsent.gatherConsent(options).then(
      () => false,
      (e: unknown) => {
        console.warn('Ads consent step failed', e);
        return true;
      }
    );
    const { canRequestAds } = await ads.AdsConsent.getConsentInfo();
    const gdprApplies = await ads.AdsConsent.getGdprApplies().catch(() => false);
    if (!canRequestAds) {
      // A refusal is the student's to change (Ad choices); a step that failed isn't.
      set({ status: 'unavailable', gdprApplies, reason: stepFailed ? 'sdk' : 'consent' });
      return;
    }
    // The audience is 13+ (§10 M1); keep ad content to what fits it.
    await ads.default().setRequestConfiguration({ maxAdContentRating: ads.MaxAdContentRating.T });
    await ads.default().initialize();
    set({ status: 'ready', gdprApplies });
  } catch (e) {
    console.warn('Ads not started', e);
    set({ ...current, status: 'unavailable', reason: 'sdk' });
  }
}

// §14 Q1: "Ad choices" on a task's ad sheet when consent blocked the ad. The UMP privacy options
// form lets the student change their answer; the SDK is then started again with it.
export async function showAdChoices(): Promise<void> {
  try {
    const ads = require('react-native-google-mobile-ads') as typeof import('react-native-google-mobile-ads');
    await ads.AdsConsent.showPrivacyOptionsForm();
  } catch (e) {
    console.warn('Ad choices not shown', e);
  }
  await startAds({ retry: true });
}

// For tests.
export function resetAdsSdk(): void {
  set(OFF);
}
