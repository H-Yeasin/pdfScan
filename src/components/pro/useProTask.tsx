import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { t } from '../../i18n';
import { useRouter } from '../../navigation/router';
import { preloadRewarded } from '../../services/ads/rewarded';
import { useAdsSdk } from '../../services/ads/adsSdk';
import { useIsPro } from '../../services/pro/entitlement';
import type { ProTaskFeature } from '../../services/pro/proTask';
import { checkProTask, completeProTask, watchAdForTask, type ProTaskRequest, type TaskAdOutcome } from '../../services/pro/proTaskFlow';
import { useRemoteConfig } from '../../services/remote/remoteConfig';
import { useAppDispatch, useAppSelector } from '../../store/AppStateContext';
import { radii, spacing, useTheme } from '../../theme';
import { ProTaskSheet } from './ProTaskSheet';

// The sheet's fade-out; the ad is shown only after it, never over an open modal.
const SHEET_CLOSE_MS = 300;

// §12 D1: the Pro task gate for one screen. `start(request)` runs the task straight away for a
// day pass, an unlocked session or with ads switched off; otherwise it opens ProTaskSheet, and
// after the ad (or with none to load, within today's allowance) runs the screen's own task on the
// same screen, with the same progress UI. Render `element` once in the screen.
//
// `preload`: the screen has Pro tasks on show (the Reader for a convertible or editable document,
// a Library selection), so one ad is loaded ahead when the ads SDK is already running.
export function useProTask(feature: ProTaskFeature, opts: { preload?: boolean } = {}) {
  const dispatch = useAppDispatch();
  const { go } = useRouter();
  const isPro = useIsPro();
  const { adsEnabled } = useRemoteConfig();
  const sdk = useAdsSdk();
  const personalizedAdsEnabled = useAppSelector((s) => s.settings.personalizedAdsEnabled);
  const [request, setRequest] = useState<ProTaskRequest | null>(null);
  const [loadingAd, setLoadingAd] = useState(false);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    []
  );

  const shouldPreload = !!opts.preload && !isPro && adsEnabled && sdk.status === 'ready';
  useEffect(() => {
    if (shouldPreload) preloadRewarded({ personalizedAdsEnabled });
  }, [shouldPreload, personalizedAdsEnabled]);

  const offerPass = useCallback(() => {
    dispatch({ type: 'ui/SHOW_SNACK', msg: t('pro.task.offlineUsed'), action: t('pro.task.getPro'), onAction: () => go('pro') });
  }, [dispatch, go]);

  const start = useCallback(
    async (req: Omit<ProTaskRequest, 'feature'>) => {
      const full: ProTaskRequest = { ...req, feature };
      const decision = await checkProTask(full, Date.now());
      if (decision === 'offerAd') setRequest(full);
      else if (decision === 'offerPro') offerPass();
      // 'run' (and 'runWithoutAd', which checkProTask doesn't give before an ad was tried).
      else await completeProTask(full);
    },
    [feature, offerPass]
  );

  const watch = useCallback(async () => {
    const req = request;
    if (!req) return;
    setRequest(null);
    setLoadingAd(true);
    let result: TaskAdOutcome;
    try {
      await new Promise((resolve) => setTimeout(resolve, SHEET_CLOSE_MS));
      result = await watchAdForTask(req, { personalizedAdsEnabled });
    } finally {
      if (mounted.current) setLoadingAd(false);
    }
    switch (result.outcome) {
      case 'rewarded':
        await completeProTask(req, result.taskId);
        break;
      case 'runWithoutAd':
        await completeProTask(req);
        break;
      case 'closedEarly':
        dispatch({ type: 'ui/SHOW_SNACK', msg: t(`pro.task.closedEarly.${req.feature}`) });
        break;
      case 'offerPro':
        offerPass();
        break;
    }
  }, [request, personalizedAdsEnabled, dispatch, offerPass]);

  const element: ReactElement = (
    <>
      <ProTaskSheet
        task={request ? { feature: request.feature, title: request.title } : null}
        // A task that fails after the ad has shown its own error (the screen's `run`).
        onWatch={() => void watch().catch((e: unknown) => console.warn('useProTask: the task failed', e))}
        onGetPass={() => {
          setRequest(null);
          go('pro');
        }}
        onClose={() => setRequest(null)}
      />
      {loadingAd ? <LoadingAd /> : null}
    </>
  );

  return { start, element, loadingAd };
}

// While the ad loads (up to `task_ad_timeout_ms`). A plain view, not a Modal, so the ad can go
// on top of it.
function LoadingAd() {
  const { tokens } = useTheme();
  return (
    <View style={styles.overlay} pointerEvents="auto" accessibilityLiveRegion="polite">
      <View style={[styles.card, { backgroundColor: tokens.surface }]}>
        <ActivityIndicator color={tokens.accent} />
        <Text style={[styles.label, { color: tokens.ink }]}>{t('pro.task.loading')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderRadius: radii.card,
  },
  label: {
    fontSize: 15,
  },
});
