import { useCallback, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BrandMark } from '../components/brand/BrandMark';
import { CourseSetupFields, useCourseSetupForm } from '../components/courses/CourseSetupForm';
import { NameField } from '../components/deliver/NameField';
import { StepArt } from '../components/onboarding/StepArt';
import { StudentCard } from '../components/onboarding/StudentCard';
import { Button, Card, ListItem, Text } from '../components/ui';
import { useT } from '../i18n/useT';
import { useRouter } from '../navigation/router';
import { useBackHandler } from '../navigation/useBackHandler';
import { courseColorValue } from '../services/courses/palette';
import {
  clampOnboardingPage,
  exampleFileName,
  ONBOARDING_PAGES,
  ONBOARDING_STEPS,
  onboardingPrimary,
  studentCard,
  type OnboardingStep,
} from '../services/onboarding/onboarding';
import { useAppDispatch, useAppSelector } from '../store/AppStateContext';
import { ICONS, radii, spacing, useTheme, type IoniconName } from '../theme';

const STEP_ICONS: Record<OnboardingStep, IoniconName> = { scan: ICONS.scan, file: ICONS.files, submit: ICONS.submit };

// §9 O2: three short pages for a new user, every one skippable - what the app does (and the
// privacy promise), about you (name and roll, with the file name they make), and this term's
// courses (the QuickSetupSheet form) with the crash-report opt-in. What's typed is kept whenever
// the student leaves: the profile is saved as it's typed, and Skip or Start saves the valid
// course rows. Camera permission waits for the first scan.
// §17 U11: on the kit; the steps are small pictures, the crash-report opt-in is its own card under
// the courses (off by default, as ever), and the example file name is in the body font.
export function OnboardingScreen() {
  const { tokens } = useTheme();
  const { t } = useT();
  const { width } = useWindowDimensions();
  const { go } = useRouter();
  const dispatch = useAppDispatch();
  const profile = useAppSelector((s) => s.settings.profile);
  const crashReportsEnabled = useAppSelector((s) => s.settings.crashReportsEnabled);
  const form = useCourseSetupForm();
  // The card the student builds across "About you" and "Your courses" (studentCard).
  const card = useMemo(
    () =>
      studentCard({
        profile,
        semester: form.semesterName,
        rows: form.rows,
        rowColors: form.colors.map((color) => courseColorValue(color, tokens)),
      }),
    [profile, form.semesterName, form.rows, form.colors, tokens]
  );
  const [page, setPage] = useState(0);
  const pager = useRef<ScrollView>(null);

  const goToPage = useCallback(
    (next: number) => {
      const target = clampOnboardingPage(next);
      setPage(target);
      pager.current?.scrollTo({ x: target * width, animated: true });
    },
    [width]
  );

  // Back steps to the previous page; on the first, AppNavigator's handler decides (backHandling).
  useBackHandler(() => goToPage(page - 1), page > 0);

  const finish = () => {
    form.saveValid();
    dispatch({ type: 'settings/SET_ONBOARDING_DONE', done: true });
    // §17 U5: Home, with or without a course; the tab bar's Scan button is there either way.
    go('home');
  };

  const onScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setPage(clampOnboardingPage(event.nativeEvent.contentOffset.x / width));
  };

  const primary = onboardingPrimary(page);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: tokens.bg }]} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Button size="sm" variant="ghost" label={t('onboarding.skip')} onPress={finish} testID="onboarding-skip" />
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
            {/* §15 V4: the logo where a new student first meets the app. */}
            <BrandMark size={72} wordmark />
            <Text variant="display" accessibilityRole="header">
              {t('onboarding.what.title')}
            </Text>
            <View style={styles.steps}>
              {ONBOARDING_STEPS.map((step) => (
                <View key={step} style={styles.step}>
                  <StepArt icon={STEP_ICONS[step]} />
                  <Text variant="label" align="center">
                    {t(`onboarding.what.${step}`)}
                  </Text>
                </View>
              ))}
            </View>
            <Text variant="body">{t('onboarding.what.body')}</Text>
            <Card tone="accent" style={styles.promise}>
              <Ionicons name={ICONS.lock} size={18} color={tokens.accentInk} />
              <Text variant="label" style={styles.flex}>
                {t('onboarding.what.privacy')}
              </Text>
            </Card>
          </ScrollView>

          <ScrollView style={{ width }} contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
            <Text variant="display" accessibilityRole="header">
              {t('onboarding.you.title')}
            </Text>
            <Text variant="body" color="muted">
              {t('onboarding.you.body')}
            </Text>
            <StudentCard card={card} />
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
            <Card elevation={0} style={[styles.example, { borderColor: tokens.edge }]}>
              <Text variant="caption" color="muted">
                {t('onboarding.you.example')}
              </Text>
              <Text variant="bodyStrong" selectable>
                {exampleFileName(profile, { name: t('onboarding.you.sampleName'), roll: t('onboarding.you.sampleRoll') })}
              </Text>
            </Card>
          </ScrollView>

          <ScrollView style={{ width }} contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
            <Text variant="display" accessibilityRole="header">
              {t('onboarding.courses.title')}
            </Text>
            <Text variant="body" color="muted">
              {t('onboarding.courses.body')}
            </Text>
            <StudentCard card={card} />
            <CourseSetupFields form={form} autoFocus={false} />
            {/* §9 O2: opt-in only; off until the student turns it on. */}
            <Card padded={false} style={Platform.OS === 'android' && styles.clip}>
              <ListItem
                icon={ICONS.crashReports}
                title={t('settings.privacy.crashReports')}
                subtitle={t('settings.privacy.crashReportsSubtitle')}
                switchValue={crashReportsEnabled}
                onValueChange={(enabled) => dispatch({ type: 'settings/SET_CRASH_REPORTS', enabled })}
                testID="onboarding-crash-reports"
              />
            </Card>
          </ScrollView>
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={styles.footer}>
        <View style={styles.dots} accessible accessibilityLabel={t('onboarding.pageA11y', { page: page + 1, total: ONBOARDING_PAGES.length })}>
          {ONBOARDING_PAGES.map((id, i) => (
            <View key={id} style={[styles.dot, i === page && styles.dotOn, { backgroundColor: i === page ? tokens.accent : tokens.edge }]} />
          ))}
        </View>
        <Button
          label={primary === 'start' ? t('onboarding.start') : t('onboarding.next')}
          icon={primary === 'start' ? undefined : 'arrow-forward'}
          onPress={() => (primary === 'start' ? finish() : goToPage(page + 1))}
          testID="onboarding-primary"
        />
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
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  page: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },
  steps: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: spacing.md,
  },
  step: {
    alignItems: 'center',
    gap: spacing.sm,
    width: 88,
  },
  promise: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
  },
  example: {
    gap: spacing.xs,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  // The switch row's ripple stays inside the corners (Android only: on iOS it would cut the shadow).
  clip: {
    overflow: 'hidden',
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
    alignItems: 'center',
    gap: spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radii.full,
  },
  // The current page's dot is a short pill, so it doesn't rest on colour alone.
  dotOn: {
    width: 20,
  },
});
