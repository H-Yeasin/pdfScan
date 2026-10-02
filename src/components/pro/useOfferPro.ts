import { useCallback } from 'react';
import { Alert } from 'react-native';
import { FEATURES } from '../../config/features';
import { useT } from '../../i18n/useT';
import { useRouter } from '../../navigation/router';
import { getProFeature, type ProFeatureId } from '../../services/pro/proFeatures';

// §10 M4: what happens when a student without Pro picks a Pro feature (a Pro cover, an accent,
// app lock). One place, so M6 can swap this alert for the "watch an ad, get Pro for 24 hours"
// offer. Until then it says what the feature is part of and nothing else: no price, no other
// way to pay (Play Payments policy).
export function useOfferPro(): (feature: ProFeatureId) => void {
  const { t } = useT();
  const { go } = useRouter();
  return useCallback(
    (feature: ProFeatureId) => {
      const name = t(getProFeature(feature).labelKey);
      Alert.alert(
        t('pro.offer.title'),
        t('pro.offer.body', { feature: name }),
        FEATURES.pro
          ? [
              { text: t('common.cancel'), style: 'cancel' },
              { text: t('pro.offer.see'), onPress: () => go('pro') },
            ]
          : [{ text: t('common.ok') }]
      );
    },
    [t, go]
  );
}
