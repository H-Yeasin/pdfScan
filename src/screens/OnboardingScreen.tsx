import { Ionicons } from '@expo/vector-icons';
import { useCallback, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CourseSetupFields, useCourseSetupForm } from '../components/courses/CourseSetupForm';
import { NameField } from '../components/deliver/NameField';
import { SettingRow } from '../components/settings/SettingRow';
import { useT } from '../i18n/useT';
import { useRouter } from '../navigation/router';
import { useBackHandler } from '../navigation/useBackHandler';
import { afterOnboarding, exampleFileName } from '../services/onboarding/onboarding';
import { useAppDispatch, useAppSelector } from '../store/AppStateContext';
import { fontFamily, radii, spacing, useTheme } from '../theme';

const PAGES = 3;

// §9 O2: three short pages for a new user, every one skippable - what the app does (and the
// privacy promise), about you (name and roll, with the file name they make), and this term's
// courses (the QuickSetupSheet form) with the crash-report opt-in. What's typed is kept whenever
// the student leaves: the profile is saved as it's typed, and Skip or Start saves the valid
// course rows. Camera permission waits for the first scan.
export function OnboardingScreen() {
  const { tokens } = useTheme();
  const { t } = useT();
  const { width } = useWindowDimensions();
  const { go } = useRouter();
  const dispatch = useAppDispatch();
  const profile = useAppSelector((s) => s.settings.profile);
  const crashReportsEnabled = useAppSelector((s) => s.settings.crashReportsEnabled);
  const hasActiveCourse = useAppSelector((s) => s.library.courses.some((c) => !c.archived));
  const form = useCourseSetupForm();
  const [page, setPage] = useState(0);
  const pager = useRef<ScrollView>(null);

  const goToPage = useCallback(
    (next: number) => {
      setPage(next);
      pager.current?.scrollTo({ x: next * width, animated: true });
    },
    [width]
  );

  // Back steps to the previous page; on the first, AppNavigator's handler decides (backHandling).
  useBackHandler(() => goToPage(page - 1), page > 0);

  const finish = () => {
    const added = form.saveValid();
    dispatch({ type: 'settings/SET_ONBOARDING_DONE', done: true });
    go(afterOnboarding(hasActiveCourse || added > 0));
  };

  const onScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setPage(Math.round(event.nativeEvent.contentOffset.x / width));
  };

  const last = page === PAGES - 1;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: tokens.bg }]} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Pressable onPress={finish} hitSlop={12} accessibilityRole="button">
          <Text style={[styles.skip, { color: tokens.muted }]}>{t('onboarding.skip')}</Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={pager}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onScrollEnd}
          keyboardShouldPersistTaps="handled"
        >
          <ScrollView style={{ width }} contentContainerStyle={styles.page}>
            <Text style={[styles.title, { color: tokens.ink }]}>{t('onboarding.what.title')}</Text>
            <View style={styles.steps}>
              {(
                [
                  { icon: 'scan-outline', label: t('onboarding.what.scan') },
                  { icon: 'folder-open-outline', label: t('onboarding.what.file') },
                  { icon: 'paper-plane-outline', label: t('onboarding.what.submit') },
                ] as const
              ).map((step, i) => (
                <View key={step.icon} style={styles.stepWrap}>
                  {i > 0 ? <Ionicons name="chevron-forward" size={18} color={tokens.muted} /> : null}
                  <View style={styles.step}>
                    <View style={[styles.stepIcon, { backgroundColor: tokens.accentSoft }]}>
                      <Ionicons name={step.icon} size={30} color={tokens.accentInk} />
                    </View>
                    <Text style={[styles.stepLabel, { color: tokens.ink }]}>{step.label}</Text>
                  </View>
                </View>
              ))}
            </View>
            <Text style={[styles.body, { color: tokens.ink }]}>{t('onboarding.what.body')}</Text>
            <View style={[styles.promise, { backgroundColor: tokens.surface, borderColor: tokens.edge }]}>
              <Ionicons name="lock-closed-outline" size={18} color={tokens.accentInk} />
              <Text style={[styles.promiseText, { color: tokens.ink }]}>{t('onboarding.what.privacy')}</Text>
            </View>
          </ScrollView>

          <ScrollView style={{ width }} contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
            <Text style={[styles.title, { color: tokens.ink }]}>{t('onboarding.you.title')}</Text>
            <Text style={[styles.body, { color: tokens.muted }]}>{t('onboarding.you.body')}</Text>
            <NameField
              label={t('settings.profile.name')}
              placeholder={t('settings.profile.namePlaceholder')}
              value={profile.name}
              onChange={(name) => dispatch({ type: 'settings/SET_PROFILE', profile: { name } })}
            />
            <NameField
              label={t('settings.profile.roll')}
              placeholder={t('settings.profile.rollPlaceholder')}
              value={profile.roll}
              onChange={(roll) => dispatch({ type: 'settings/SET_PROFILE', profile: { roll } })}
            />
            <View style={[styles.example, { backgroundColor: tokens.surface, borderColor: tokens.edge }]}>
              <Text style={[styles.exampleLabel, { color: tokens.muted }]}>{t('onboarding.you.example')}</Text>
              <Text style={[styles.exampleName, { color: tokens.ink }]} selectable>
                {exampleFileName(profile, { name: t('onboarding.you.sampleName'), roll: t('onboarding.you.sampleRoll') })}
              </Text>
            </View>
          </ScrollView>

          <ScrollView style={{ width }} contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
            <Text style={[styles.title, { color: tokens.ink }]}>{t('onboarding.courses.title')}</Text>
            <Text style={[styles.body, { color: tokens.muted }]}>{t('onboarding.courses.body')}</Text>
            <CourseSetupFields form={form} autoFocus={false} />
            <SettingRow
              title={t('settings.privacy.crashReports')}
              subtitle={t('settings.privacy.crashReportsSubtitle')}
              toggle={{
                value: crashReportsEnabled,
                onChange: (enabled) => dispatch({ type: 'settings/SET_CRASH_REPORTS', enabled }),
              }}
            />
          </ScrollView>
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={styles.footer}>
        <View style={styles.dots} accessibilityLabel={t('onboarding.pageA11y', { page: page + 1, total: PAGES })}>
          {Array.from({ length: PAGES }, (_, i) => (
            <View key={i} style={[styles.dot, { backgroundColor: i === page ? tokens.accent : tokens.edge }]} />
          ))}
        </View>
        <Pressable
          style={[styles.primary, { backgroundColor: tokens.accent }]}
          onPress={() => (last ? finish() : goToPage(page + 1))}
          accessibilityRole="button"
        >
          <Text style={styles.primaryLabel}>{last ? t('onboarding.start') : t('onboarding.next')}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  skip: {
    fontSize: 15,
    fontWeight: '600',
  },
  page: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },
  title: {
    fontFamily: fontFamily.heading,
    fontSize: 28,
  },
  body: {
    fontSize: 15.5,
    lineHeight: 22,
  },
  steps: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
  },
  stepWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  step: {
    alignItems: 'center',
    gap: spacing.xs,
    width: 84,
  },
  stepIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  promise: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  promiseText: {
    flex: 1,
    fontSize: 14.5,
    fontWeight: '600',
  },
  example: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  exampleLabel: {
    fontSize: 13,
  },
  exampleName: {
    fontSize: 14.5,
    fontFamily: 'monospace',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  dots: {
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  primary: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm + 2,
    borderRadius: radii.full,
  },
  primaryLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
