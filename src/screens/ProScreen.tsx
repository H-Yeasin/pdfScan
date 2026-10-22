import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { passLeftLabel } from '../components/home/ProPassCard';
import { FeatureList } from '../components/pro/FeatureList';
import { passEndLabel } from '../components/pro/passEndLabel';
import { Button, Card, ScreenHeader, Text } from '../components/ui';
import { useT } from '../i18n/useT';
import { useRouter } from '../navigation/router';
import { watchAdForPass, type WatchResult } from '../services/ads/rewarded';
import { passMinutesLeft } from '../services/courses/homeSelectors';
import { loadPassLog, passesLeftToday } from '../services/pro/dayPass';
import { getEntitlement, useEntitlement, useIsPro } from '../services/pro/entitlement';
import { useRemoteConfig } from '../services/remote/remoteConfig';
import { useAppDispatch, useAppSelector } from '../store/AppStateContext';
import { ICONS, radii, spacing, useTheme } from '../theme';
import { hapticSuccess } from '../services/feedback/haptics';

// §10 M6: what Pro includes (live features only), what stays free, and one button: watch a
// rewarded ad, get Pro for `pass_hours`. Opened from Me, Home's pass card and wherever a Pro
// feature is touched; Back returns there. While `pro_sales_enabled` is off (now) there are no
// prices and no purchase buttons at all, and nothing here mentions paying anywhere else (Play
// policy, AGENTS.md).
// §17 U11: on the kit: a marigold hero, the button and the day's cap under it, the benefits as
// tiles, and what stays free as a quiet card. The hero's mark stands in for U4's `pro`
// illustration until that exists.
export function ProScreen() {
  const { tokens } = useTheme();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const { back } = useRouter();
  const dispatch = useAppDispatch();
  const remote = useRemoteConfig();
  const entitlement = useEntitlement();
  const isPro = useIsPro();
  const personalizedAdsEnabled = useAppSelector((s) => s.settings.personalizedAdsEnabled);
  const [passLog, setPassLog] = useState<number[] | null>(null);
  const [watching, setWatching] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const reloadLog = useCallback(() => {
    void loadPassLog().then(setPassLog);
  }, []);
  useEffect(reloadLog, [reloadLog]);

  const left = passLog ? passesLeftToday(passLog, now, remote.passMaxPerDay) : 0;
  const available = remote.adsEnabled;
  const passEnd = isPro && entitlement?.source === 'pass' ? entitlement.expiresAt : undefined;

  // The time left counts down by the minute while a pass runs.
  useEffect(() => {
    setNow(Date.now());
    if (passEnd === undefined) return;
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [passEnd]);

  const watch = async () => {
    setWatching(true);
    let result: WatchResult;
    try {
      result = await watchAdForPass({ personalizedAdsEnabled, passesLeft: left });
    } finally {
      setWatching(false);
      reloadLog();
    }
    if (result === 'granted') hapticSuccess();
    // Read after the grant, so the time shown is the new end.
    const end = getEntitlement()?.expiresAt;
    const msg =
      result === 'granted'
        ? t('pro.granted', { time: end ? passEndLabel(end) : '' })
        : result === 'closedEarly'
          ? t('pro.closedEarly')
          : result === 'capped'
            ? t('pro.noneLeft')
            : // §14 Q1: the same reason a task's sheet gives.
              t(`pro.task.adUnavailable.${result.unavailable}`);
    dispatch({ type: 'ui/SHOW_SNACK', msg });
  };

  const hours = remote.passHours;
  const status = !available
    ? t('pro.unavailable')
    : passLog === null
      ? ''
      : left > 0
        ? t('pro.leftOf', { left, max: remote.passMaxPerDay })
        : t('pro.noneLeft');

  return (
    <View style={[styles.container, { backgroundColor: tokens.bg }]}>
      <ScreenHeader title={t('pro.kicker')} back={back} />
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: spacing.xxl + insets.bottom }]}>
        <Card tone="highlight" style={styles.hero}>
          <View style={[styles.mark, { backgroundColor: tokens.highlight }]}>
            <Ionicons name={ICONS.pro} size={36} color={tokens.onHighlight} />
          </View>
          <Text variant="headline" align="center" accessibilityRole="header">
            {t('pro.heroTitle', { count: hours })}
          </Text>
          <Text variant="body" color="muted" align="center">
            {t('pro.subtitle', { count: hours })}
          </Text>
        </Card>

        {passEnd !== undefined ? (
          <Card tone="accent" style={styles.active} testID="pro-active">
            <Ionicons name="checkmark-circle" size={22} color={tokens.accentInk} />
            <View style={styles.flex}>
              <Text variant="bodyStrong">{t('home.passActive', { left: passLeftLabel(Math.max(1, passMinutesLeft(passEnd, now))) })}</Text>
              <Text variant="caption" color="muted">
                {t('pro.active', { time: passEndLabel(passEnd) })}
              </Text>
            </View>
          </Card>
        ) : null}

        <View style={styles.offer}>
          {available && left > 0 ? (
            <Button
              variant="highlight"
              icon={ICONS.pro}
              label={watching ? t('pro.loading') : passEnd !== undefined ? t('pro.watchMore', { count: hours }) : t('pro.watchStart')}
              loading={watching}
              disabled={passLog === null}
              onPress={() => void watch()}
              fullWidth
              testID="pro-watch"
            />
          ) : null}
          {status ? (
            <Text variant="caption" color="muted" align="center" accessibilityLiveRegion="polite">
              {status}
            </Text>
          ) : null}
        </View>

        <Text variant="overline" color="muted" accessibilityRole="header">
          {t('pro.includes')}
        </Text>
        <FeatureList />

        <Card elevation={0} style={[styles.free, { borderColor: tokens.edge }]}>
          <Text variant="title">{t('pro.freeTitle')}</Text>
          <Text variant="body" color="muted">
            {t('pro.freeBody')}
          </Text>
        </Card>
        <Text variant="caption" color="muted">
          {t('pro.lapseNote')}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  body: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.lg,
  },
  hero: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  mark: {
    width: 72,
    height: 72,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  active: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  offer: {
    gap: spacing.sm,
  },
  // Quiet: flat, with a hairline instead of a shadow.
  free: {
    gap: spacing.xs,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
