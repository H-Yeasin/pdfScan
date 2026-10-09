import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FeatureList } from '../components/pro/FeatureList';
import { passEndLabel } from '../components/pro/passEndLabel';
import { useT } from '../i18n/useT';
import { useRouter } from '../navigation/router';
import { watchAdForPass, type WatchResult } from '../services/ads/rewarded';
import { loadPassLog, passesLeftToday } from '../services/pro/dayPass';
import { getEntitlement, useEntitlement, useIsPro } from '../services/pro/entitlement';
import { useRemoteConfig } from '../services/remote/remoteConfig';
import { useAppDispatch, useAppSelector } from '../store/AppStateContext';
import { fontFamily, radii, spacing, useTheme, touchSlop } from '../theme';
import { hapticSuccess } from '../services/feedback/haptics';

// §10 M6: what Pro includes (live features only), what stays free, and one button: watch a
// rewarded ad, get Pro for `pass_hours`. Opened from Settings and wherever a Pro feature is
// touched; Back returns there. While `pro_sales_enabled` is off (now) there are no prices and no
// purchase buttons at all, and nothing here mentions paying anywhere else (Play policy).

export function ProScreen() {
  const { tokens } = useTheme();
  const { t } = useT();
  const { back } = useRouter();
  const dispatch = useAppDispatch();
  const remote = useRemoteConfig();
  const entitlement = useEntitlement();
  const isPro = useIsPro();
  const personalizedAdsEnabled = useAppSelector((s) => s.settings.personalizedAdsEnabled);
  const [passLog, setPassLog] = useState<number[] | null>(null);
  const [watching, setWatching] = useState(false);

  const reloadLog = useCallback(() => {
    void loadPassLog().then(setPassLog);
  }, []);
  useEffect(reloadLog, [reloadLog]);

  const left = passLog ? passesLeftToday(passLog, Date.now(), remote.passMaxPerDay) : 0;
  const available = remote.adsEnabled;
  const passActive = isPro && entitlement?.source === 'pass' && entitlement.expiresAt !== undefined;

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
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: tokens.bg }]} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable
          hitSlop={touchSlop(44)}
          accessibilityRole="button"
          style={styles.headerButton}
          onPress={back}
          accessibilityLabel={t('common.back')}
        >
          <Ionicons name="chevron-back" size={20} color={tokens.ink} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={[styles.kicker, { color: tokens.accentInk }]}>{t('pro.kicker')}</Text>
        <Text accessibilityRole="header" style={[styles.title, { color: tokens.ink }]}>
          {t('pro.title')}
        </Text>
        <Text style={[styles.subtitle, { color: tokens.muted }]}>{t('pro.subtitle', { count: hours })}</Text>

        {passActive && entitlement?.expiresAt ? (
          <View style={[styles.activeCard, { backgroundColor: tokens.accentSoft }]}>
            <Ionicons name="checkmark-circle" size={20} color={tokens.accentInk} />
            <View style={styles.activeText}>
              <Text style={[styles.activeTitle, { color: tokens.ink }]}>{t('pro.active', { time: passEndLabel(entitlement.expiresAt) })}</Text>
              <Text style={[styles.note, { color: tokens.ink }]}>{t('pro.activeBody')}</Text>
            </View>
          </View>
        ) : null}

        <Text style={[styles.sectionLabel, { color: tokens.muted }]}>{t('pro.includes')}</Text>
        <View style={styles.featuresWrap}>
          <FeatureList />
        </View>

        <View style={[styles.freeCard, { backgroundColor: tokens.surface, borderColor: tokens.edge }]}>
          <Text style={[styles.freeTitle, { color: tokens.ink }]}>{t('pro.freeTitle')}</Text>
          <Text style={[styles.note, { color: tokens.muted }]}>{t('pro.freeBody')}</Text>
        </View>

        {available && left > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ busy: watching, disabled: watching || passLog === null }}
            disabled={watching || passLog === null}
            style={[styles.primary, { backgroundColor: tokens.accent }]}
            onPress={() => void watch()}
          >
            {watching ? <ActivityIndicator color={tokens.onAccent} /> : null}
            <Text style={[styles.primaryLabel, { color: tokens.onAccent }]}>
              {watching ? t('pro.loading') : t(passActive ? 'pro.watchMore' : 'pro.watch', { count: hours })}
            </Text>
          </Pressable>
        ) : null}
        <Text style={[styles.status, { color: tokens.muted }]}>
          {!available ? t('pro.unavailable') : passLog === null ? '' : left > 0 ? t('pro.left', { count: left }) : t('pro.noneLeft')}
        </Text>
        <Text style={[styles.note, { color: tokens.muted }]}>{t('pro.lapseNote')}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  headerButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  kicker: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: fontFamily.heading,
    fontSize: 30,
    lineHeight: 36,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 21,
    marginBottom: spacing.sm,
  },
  activeCard: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.card,
  },
  activeText: {
    flex: 1,
    gap: 2,
  },
  activeTitle: {
    fontSize: 15.5,
    fontWeight: '600',
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: spacing.sm,
  },
  featuresWrap: {
    marginBottom: spacing.sm,
  },
  freeCard: {
    padding: spacing.lg,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 5,
  },
  freeTitle: {
    fontFamily: fontFamily.heading,
    fontSize: 18,
  },
  note: {
    fontSize: 13.5,
    lineHeight: 19,
  },
  primary: {
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  primaryLabel: {
    // Wraps beside the icon at large font scales instead of running past the button.
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  status: {
    fontSize: 13.5,
    textAlign: 'center',
  },
});
