import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useNetworkState } from 'expo-network';
import { bannerUnitId, nonPersonalizedOnly, shouldShowBanner, type BannerScreen } from '../../services/ads/adPolicy';
import { useAdsSdk } from '../../services/ads/adsSdk';
import { useIsPro } from '../../services/pro/entitlement';
import { useRemoteConfig } from '../../services/remote/remoteConfig';
import { useAppSelector } from '../../store/AppStateContext';

// §10 M5: the one banner on Home and Library, placed just above the tab bar (never inside a
// list of documents). It takes no space until an ad has loaded and disappears for good on a
// failure, so the layout never shows an empty box. Whether it may show at all is
// services/ads/adPolicy.ts; this only gathers the inputs.
export function BannerSlot({ screen }: { screen: BannerScreen }) {
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
  if (!show) return null;
  return <Banner unitId={unitId} nonPersonalized={nonPersonalizedOnly(sdk.gdprApplies, personalizedAdsEnabled)} />;
}

function ads() {
  return require('react-native-google-mobile-ads') as typeof import('react-native-google-mobile-ads');
}

function Banner({ unitId, nonPersonalized }: { unitId: string; nonPersonalized: boolean }) {
  const [state, setState] = useState<'loading' | 'loaded' | 'failed'>('loading');
  if (state === 'failed') return null;
  const { BannerAd, BannerAdSize } = ads();
  return (
    <View style={state === 'loaded' ? styles.slot : styles.collapsed}>
      <BannerAd
        unitId={unitId}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
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
