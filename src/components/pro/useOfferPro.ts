import { useCallback } from 'react';
import { useRouter } from '../../navigation/router';
import type { ProFeatureId } from '../../services/pro/proFeatures';

// §10 M4/M6: what happens when a student without Pro picks a Pro feature (a Pro cover, an
// accent, app lock): the Pro screen, with its "watch an ad" pass. Never a popup; the Pro screen's
// Back returns to where they were (it pops, §16 G2). The feature isn't passed on yet: the
// screen lists all of Pro.
export function useOfferPro(): (feature: ProFeatureId) => void {
  const { go } = useRouter();
  return useCallback((_feature: ProFeatureId) => go('pro'), [go]);
}
