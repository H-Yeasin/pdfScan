import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useNetworkState } from 'expo-network';
import { useScreenRole } from '../../navigation/screenRole';
import { bannerUnitId, nonPersonalizedOnly, shouldShowBanner, type BannerScreen } from '../../services/ads/adPolicy';
import { useAdsSdk } from '../../services/ads/adsSdk';
import { useIsPro } from '../../services/pro/entitlement';
import { useRemoteConfig } from '../../services/remote/remoteConfig';
import { useAppSelector } from '../../store/AppStateContext';

// §10 M5: the one banner on Home and Library: on Library just above the tab bar (never inside a
// list of documents); on Home, since §17 U6, inside the scroll between Courses and Recent files
// (`inline`: an inline adaptive banner of that width, kept small), so the bottom of Home no longer
// stacks the ad on the tab bar. It takes no space until an ad has loaded and disappears for good on a
// failure, so the layout never shows an empty box. Whether it may show at all is
// services/ads/adPolicy.ts; this only gathers the inputs.
//
// §16 G2: Home and Library stay mounted when another tab or screen is in front. A banner is
// requested only while its screen is the active one, and then kept while the screen is hidden,
// so switching tabs back and forth doesn't ask for a new ad each time.
// An inline banner's height cap: inline adaptive banners may be as tall as the screen, and the
// owner's rule is one small banner.
export const INLINE_BANNER_MAX_HEIGHT = 100;

export function BannerSlot({ screen, inline }: { screen: BannerScreen; inline?: { width: number } }) {
  const role = useScreenRole();
  const [requested, setRequested] = useState(false);
  const remote = useRemoteConfig();
  const sdk = useAdsSdk();
  const isPro = useIsPro();
  const network = useNetworkState();
  const onboardingDone = useAppSelector((s) => s.settings.onboardingDone);
  const sessions = useAppSelector((s) => s.settings.appSessions);
  const personalizedAdsEnabled = useAppSelector((s) => s.settings.personalizedAdsEnabled);
  const processing = useAppSelector((s) => s.capture.processingStatus !== 'idle');

  // The SDK module is loaded only once it's ready (adsSdk.startAds required it).
  const unitId = sdk.status === 'ready' ? bannerUnitId(Platform.OS, remote, __DEV__, __DEV__ ? ads().TestIds.ADAPTIVE_BANNER : '') : '';
  const show = shouldShowBanner({
    remote,
    screen,
    onboardingDone,
    sessions,
    isPro,
    online: network.isInternetReachable ?? network.isConnected ?? null,
    processing,
    sdkReady: sdk.status === 'ready',
    unitId,
  });
  // Set during render (React's pattern for state derived from props), so the banner mounts in the
  // same pass that makes it allowed.
  if (show && role === 'active' && !requested) setRequested(true);
  if (!show && requested) setRequested(false);
  if (!show || !requested) return null;
  return <Banner unitId={unitId} nonPersonalized={nonPersonalizedOnly(sdk.gdprApplies, personalizedAdsEnabled)} inlineWidth={inline?.width} />;
}

function ads() {
  return require('react-native-google-mobile-ads') as typeof import('react-native-google-mobile-ads');
}

function Banner({ unitId, nonPersonalized, inlineWidth }: { unitId: string; nonPersonalized: boolean; inlineWidth?: number }) {
  const [state, setState] = useState<'loading' | 'loaded' | 'failed'>('loading');
  if (state === 'failed') return null;
  const { BannerAd, BannerAdSize } = ads();
  return (
    <View style={state === 'loaded' ? styles.slot : styles.collapsed}>
      <BannerAd
        unitId={unitId}
        size={inlineWidth === undefined ? BannerAdSize.ANCHORED_ADAPTIVE_BANNER : BannerAdSize.INLINE_ADAPTIVE_BANNER}
        width={inlineWidth}
        maxHeight={inlineWidth === undefined ? undefined : INLINE_BANNER_MAX_HEIGHT}
        requestOptions={{ requestNonPersonalizedAdsOnly: nonPersonalized }}
        onAdLoaded={() => setState('loaded')}
        onAdFailedToLoad={() => setState('failed')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    alignItems: 'center',
  },
  // Mounted (so the ad can load) but taking no space until it has.
  collapsed: {
    height: 0,
    overflow: 'hidden',
  },
});
