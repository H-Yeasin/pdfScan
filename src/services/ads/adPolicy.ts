import { canUseProFeature } from '../pro/proFeatures';
import type { RemoteConfig } from '../remote/remoteConfig';

// §10 M5: when a banner may show. Pure, so every rule is tested on its own
// (__tests__/adPolicy.test.ts); components/ads/BannerSlot.tsx gathers the inputs.
//
// The owner's rules (docs/plan/10-monetization.md, decision 2): one small banner on Home and
// Library only; never in Capture, Review, Deliver/Submit or the Reader, never while anything is
// processing, no full-screen ads. Only screens that render a BannerSlot can ever show one, so
// `ads_banner_screens` from Remote Config can narrow the list but never widen it past them.

export type BannerScreen = 'home' | 'library';

// A new student sees no ads in their first sessions: the app should earn its place first.
export const MIN_SESSIONS_FOR_ADS = 3;

export type BannerInputs = {
  remote: Pick<RemoteConfig, 'adsEnabled' | 'adsBannerScreens'>;
  screen: BannerScreen;
  onboardingDone: boolean;
  // Cold starts so far, this one included (settings.appSessions).
  sessions: number;
  isPro: boolean;
  // false while offline; null while not known yet (counts as offline).
  online: boolean | null;
  // A scan or import is being processed (capture.processingStatus isn't 'idle').
  processing: boolean;
  // The SDK is initialised and consent allows requesting ads (services/ads/adsSdk.ts).
  sdkReady: boolean;
  // The banner unit for this build ('' = none configured: no banner).
  unitId: string;
};

export type BannerBlock =
  | 'adsOff'
  | 'screen'
  | 'onboarding'
  | 'newUser'
  | 'pro'
  | 'offline'
  | 'processing'
  | 'sdk'
  | 'noUnit';

// The first rule that says no, or null when a banner may show.
export function bannerBlock(i: BannerInputs): BannerBlock | null {
  if (!i.remote.adsEnabled) return 'adsOff';
  if (!i.remote.adsBannerScreens.includes(i.screen)) return 'screen';
  if (!i.onboardingDone) return 'onboarding';
  if (i.sessions < MIN_SESSIONS_FOR_ADS) return 'newUser';
  // 'noBanners' lapses with 'stop': banners come back when a pass ends.
  if (canUseProFeature('noBanners', 'keep', i.isPro)) return 'pro';
  if (i.online !== true) return 'offline';
  if (i.processing) return 'processing';
  if (!i.sdkReady) return 'sdk';
  if (!i.unitId) return 'noUnit';
  return null;
}

export function shouldShowBanner(i: BannerInputs): boolean {
  return bannerBlock(i) === null;
}

// The banner unit: Google's test unit in development builds (never a real ad on a dev phone,
// which AdMob counts as invalid traffic), else the one from Remote Config for this platform.
export function bannerUnitId(platform: string, remote: Pick<RemoteConfig, 'adsBannerUnitAndroid' | 'adsBannerUnitIos'>, dev: boolean, testUnit: string): string {
  if (dev) return testUnit;
  if (platform === 'android') return remote.adsBannerUnitAndroid;
  if (platform === 'ios') return remote.adsBannerUnitIos;
  return '';
}

// Where the law asks for consent (EEA, UK, Switzerland: the UMP form, `gdprApplies`), the form's
// answer travels with every request on its own (the TCF string) and decides personalisation.
// Everywhere else the student's "Personalised ads" toggle (§10 M1) does.
export function nonPersonalizedOnly(gdprApplies: boolean, personalizedAdsEnabled: boolean): boolean {
  return gdprApplies ? false : !personalizedAdsEnabled;
}
