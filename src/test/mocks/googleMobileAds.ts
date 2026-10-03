// react-native-google-mobile-ads for tests: consent that allows ads outside the EEA, an SDK that
// initialises, and a BannerAd that renders a marker with its props (tests call its callbacks).
import { createElement } from 'react';

export const consent = { canRequestAds: true, gdprApplies: false };
export const AdsConsent = {
  gatherConsent: jest.fn(async () => ({ canRequestAds: consent.canRequestAds })),
  getGdprApplies: jest.fn(async () => consent.gdprApplies),
};
const mobileAds = {
  initialize: jest.fn(async () => []),
  setRequestConfiguration: jest.fn(async () => {}),
};
export default function MobileAds() {
  return mobileAds;
}
export const MaxAdContentRating = { G: 'G', PG: 'PG', T: 'T', MA: 'MA' };
export const TestIds = { ADAPTIVE_BANNER: 'ca-app-pub-3940256099942544/9214589741', BANNER: 'ca-app-pub-3940256099942544/6300978111' };
export const BannerAdSize = { ANCHORED_ADAPTIVE_BANNER: 'ANCHORED_ADAPTIVE_BANNER' };
export function BannerAd(props: Record<string, unknown>) {
  return createElement('BannerAd', props);
}
