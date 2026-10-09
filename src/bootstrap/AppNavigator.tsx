import { t } from '../i18n';
import { useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, StyleSheet, View } from 'react-native';
import { useRouter } from '../navigation/router';
import { resolveBack, type BackContext } from '../navigation/backHandling';
import { activeStack } from '../navigation/navStack';
import { ScreenStack, type ScreenMap } from '../navigation/ScreenStack';
import { SPLASH_TIMEOUT_MS } from './splash';
import { chooseStartScreen } from './startScreen';
import { useDeferredBoot } from './useDeferredBoot';
import { loadRemoteConfig, useRemoteConfig } from '../services/remote/remoteConfig';
import { loadEntitlement, useIsPro } from '../services/pro/entitlement';
import { startAds } from '../services/ads/adsSdk';
import { MIN_SESSIONS_FOR_ADS } from '../services/ads/adPolicy';
import { HomeScreen } from '../screens/HomeScreen';
import { CourseScreen } from '../screens/CourseScreen';
import { CaptureScreen } from '../screens/CaptureScreen';
import { ReviewScreen } from '../screens/ReviewScreen';
import { DeliverScreen } from '../screens/DeliverScreen';
import { LibraryScreen } from '../screens/LibraryScreen';
import { ReaderScreen } from '../screens/ReaderScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { ProScreen } from '../screens/ProScreen';
import { ManageFoldersScreen } from '../screens/ManageFoldersScreen';
import { AcademicOptionsScreen } from '../screens/AcademicOptionsScreen';
import { ExamPackScreen } from '../screens/ExamPackScreen';
import { StorageScreen } from '../screens/StorageScreen';
import { BackupScreen } from '../screens/BackupScreen';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { onboardingDecision } from '../services/onboarding/onboarding';
import { RestoreHost } from '../components/backup/RestoreHost';
import { AppLockGate } from '../components/security/AppLockGate';
import { SplashIntro, SplashIntroBoundary } from '../components/brand/SplashIntro';
import { ExportHost } from '../components/backup/ExportHost';
import { ProTaskResumeHost } from '../components/pro/ProTaskResumeHost';
import { AutoBackupChip } from '../components/backup/AutoBackupChip';
import { useAutoBackup } from '../store/useAutoBackup';
import { FilterLabScreen } from '../dev/FilterLabScreen';
import { useLibraryPersistence } from '../store/useLibraryPersistence';
import { useSettingsPersistence } from '../store/useSettingsPersistence';
import { useSignaturePersistence } from '../store/useSignaturePersistence';
import { useExternalFileLinking } from '../store/useExternalFileLinking';
import { useImportedPdfIndexing } from '../store/useImportedPdfIndexing';
import { useDeadlineReminders } from '../store/useDeadlines';
import { useStorageIntegrity } from '../store/useStorageIntegrity';
import { useAppDispatch, useAppSelector, useAppSlices } from '../store/AppStateContext';
import { initCrashReporting } from '../services/telemetry/crash';
import { logUsage, setUsageCollection } from '../services/telemetry/usage';
import { useTheme } from '../theme';
import { StatusBar } from 'expo-status-bar';

const SCREENS: ScreenMap = {
  home: HomeScreen,
  course: CourseScreen,
  capture: CaptureScreen,
  review: ReviewScreen,
  deliver: DeliverScreen,
  library: LibraryScreen,
  reader: ReaderScreen,
  settings: SettingsScreen,
  pro: ProScreen,
  manageFolders: ManageFoldersScreen,
  academicOptions: AcademicOptionsScreen,
  examPack: ExamPackScreen,
  storage: StorageScreen,
  backup: BackupScreen,
  onboarding: OnboardingScreen,
  filterLab: FilterLabScreen,
};

export function AppNavigator() {
  const libraryLoaded = useLibraryPersistence();
  const [booting, setBooting] = useState(true);
  // §9 O5: true a moment after the start screen is up; work the first screen doesn't need waits.
  const afterBoot = useDeferredBoot(!booting);
  const libraryAfterBoot = afterBoot && libraryLoaded;
  useSettingsPersistence();
  useSignaturePersistence();
  useExternalFileLinking(libraryLoaded);
  useDeadlineReminders(libraryLoaded, libraryAfterBoot);
  useImportedPdfIndexing(libraryAfterBoot);
  useStorageIntegrity(libraryAfterBoot);
  useAutoBackup(libraryAfterBoot);
  const { screen, nav, navTick, go, back, replace } = useRouter();
  const { tokens, theme } = useTheme();

  const dispatch = useAppDispatch();
  const state = useAppSlices('capture', 'library', 'settings');
  // §14 Q7: only this field of `deliver` (the rest changes with every keystroke in Deliver).
  const coverTarget = useAppSelector((s) => s.deliver.coverTarget);
  const { crashReportsEnabled } = state.settings;
  // Deferred too (§9 O5): Sentry's init isn't free, and a crash before it still reaches the
  // ErrorBoundary.
  useEffect(() => {
    if (afterBoot) initCrashReporting(crashReportsEnabled);
  }, [afterBoot, crashReportsEnabled]);
  // §10 M8: usage counts follow "Help improve PDF Scan", after the first frame like Sentry. One
  // app_open per run, sent once collection is on.
  const { usageStatsEnabled } = state.settings;
  const openLogged = useRef(false);
  useEffect(() => {
    if (!afterBoot || !state.settings.loaded) return;
    void setUsageCollection(usageStatsEnabled).then(() => {
      if (usageStatsEnabled && !openLogged.current) {
        openLogged.current = true;
        logUsage('app_open');
      }
    });
  }, [afterBoot, state.settings.loaded, usageStatsEnabled]);
  // §10 M3: one small secure-store read, not deferred, so Pro features and the banner policy
  // (M5) see the pass as soon as they render.
  useEffect(() => {
    void loadEntitlement();
  }, []);
  // §10 M2: the console's settings (ads switch, pass length, support contact); bundled defaults
  // until then and whenever Firebase isn't there.
  useEffect(() => {
    if (afterBoot) void loadRemoteConfig();
  }, [afterBoot]);
  // §10 M5: the ads SDK (and its consent form, where the law needs one) only once a banner could
  // show: ads switched on in the console, the introduction done, from the third start, no Pro.
  // Before that the SDK is never loaded.
  const { adsEnabled } = useRemoteConfig();
  const isPro = useIsPro();
  const adsCould = afterBoot && adsEnabled && !isPro && state.settings.onboardingDone && state.settings.appSessions >= MIN_SESSIONS_FOR_ADS;
  useEffect(() => {
    if (adsCould) void startAds();
  }, [adsCould]);
  const { processingStatus, errorMessage } = state.capture;
  const prevProcessingStatus = useRef(processingStatus);

  // Start screen (§9 O1, `chooseStartScreen`): picked once settings and the library index are in,
  // before the first real render, while the splash still covers the app (the native one, then the
  // splash intro's identical overlay, §15 V5) - so Capture never flashes up on the way to Home. A failed library load falls through to Capture (with F3's
  // load-error state on the Library); anything that already navigated (e.g. "Open with") wins.
  // If loading takes longer than SPLASH_TIMEOUT_MS the app shows anyway, and the start screen is
  // still corrected once loading finishes, as long as the user hasn't navigated yet.
  const startChosen = useRef(false);
  const libraryStatus = state.library.loadStatus;
  const hasActiveCourse = state.library.courses.some((c) => !c.archived);
  const bootReady = libraryStatus !== 'loading' && state.settings.loaded;
  useEffect(() => {
    if (startChosen.current || !bootReady) return;
    startChosen.current = true;
    // §9 O2: the introduction for a brand-new user; someone updating with a library already in
    // place is marked done without seeing it.
    const onboarding = onboardingDecision({
      onboardingDone: state.settings.onboardingDone,
      libraryLoaded: libraryStatus === 'ready',
      documentCount: state.library.files.length,
      courseCount: state.library.courses.length,
    });
    if (onboarding === 'markDone') dispatch({ type: 'settings/SET_ONBOARDING_DONE', done: true });
    if (screen === 'capture' && navTick === 0) {
      const start = chooseStartScreen({ hasActiveCourse, showOnboarding: onboarding === 'show' });
      if (start !== screen) replace(start);
    }
    setBooting(false);
    // Runs once, when boot is ready; the counts are read as they are at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootReady, hasActiveCourse, screen, navTick, replace]);
  useEffect(() => {
    if (!booting) return;
    const id = setTimeout(() => setBooting(false), SPLASH_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [booting]);

  // §9 O1: Android back. Open RN Modals and inline overlays (`useBackHandler`) get the press first;
  // this handles the rest by `resolveBack`'s order. Registered once, at boot, so every overlay's
  // listener is newer and runs first; it reads the latest state through a ref.
  const backCtx = useRef<BackContext | null>(null);
  backCtx.current = {
    screen,
    tab: nav.tab,
    canPop: activeStack(nav).length > 1,
    hasCourses: hasActiveCourse,
    selMode: state.library.selMode,
    searchOpen: state.library.searchOpen,
    sessionPageCount: state.capture.pages.length,
    retakeTargetId: state.capture.retakeTargetId,
    highlightDeadlineId: state.library.highlightDeadlineId,
    coverTarget,
  };
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!backCtx.current) return false;
      const step = resolveBack(backCtx.current);
      switch (step.kind) {
        case 'dispatch':
          step.actions.forEach(dispatch);
          return true;
        case 'pop':
          step.actions.forEach(dispatch);
          back();
          return true;
        case 'go':
          step.actions.forEach(dispatch);
          go(step.to, 'back');
          return true;
        case 'confirmDiscard':
          Alert.alert(t('shared.discardScan.title', { count: step.count }), t('shared.discardScan.body'), [
            { text: t('common.cancel'), style: 'cancel' },
            {
              text: t('shared.discardScan.discard'),
              style: 'destructive',
              onPress: () => {
                dispatch({ type: 'capture/CLEAR_PAGES' });
                BackHandler.exitApp();
              },
            },
          ]);
          return true;
        case 'exit':
          // Android's default: the app goes to the background.
          return false;
      }
    });
    return () => sub.remove();
  }, [dispatch, go, back]);

  // Lives here (always mounted) rather than on CaptureScreen/ReviewScreen: neither is always on
  // screen (and before §16 G2 both unmounted as the user moved between tabs). Navigating to
  // Review as soon as the raw scan lands - instead of waiting for the slow downscale/OCR loop to
  // finish - shrinks the window where CaptureScreen sits on screen mid-pipeline, which is what let
  // a stray remount there re-trigger runNativeScannerPipeline().
  useEffect(() => {
    if (processingStatus === prevProcessingStatus.current) return;
    const prev = prevProcessingStatus.current;
    prevProcessingStatus.current = processingStatus;

    if (processingStatus === 'processing' && prev === 'scanning') {
      go('review');
    } else if (processingStatus === 'success') {
      // The "Added N pages · Scan more" snack comes from the pipeline itself (ingestBatch.ts).
      dispatch({ type: 'capture/SET_PROCESSING_STATUS', status: 'idle' });
    } else if (processingStatus === 'error') {
      dispatch({ type: 'ui/SHOW_SNACK', msg: errorMessage ?? t('capture.scanFailed') });
      dispatch({ type: 'capture/SET_PROCESSING_STATUS', status: 'idle' });
    }
  }, [processingStatus, errorMessage, dispatch, go]);

  return (
    <View style={[styles.container, booting ? { backgroundColor: tokens.bg } : null]}>
      {booting ? null : (
        <>
          {/* §9 O6: follows the app's theme setting, not the system's (Capture sets its own). */}
          <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
          {/* §10 M4: with the app lock on, nothing below renders until it's unlocked. */}
          <AppLockGate>
            {/* §16 G2: the tab roots, the tab bar and each tab's stack, as kept, keyed layers. */}
            <ScreenStack screens={SCREENS} />
            {/* §8 B4: restore / import, opened by ui/OPEN_BACKUP from anywhere. */}
            <RestoreHost />
            {/* §8 B5: exports asked for from a snack or Home's reminder, and the automatic backup chip. */}
            <ExportHost />
            <AutoBackupChip />
            {/* §12 D1: a Pro task whose ad was watched before the app was killed. */}
            <ProTaskResumeHost ready={libraryAfterBoot} />
          </AppLockGate>
        </>
      )}
      {/* §15 V5: the splash intro, over everything (still under App.tsx's Snackbar). It's the last
          child in the booting tree and the booted one alike, so the switch doesn't remount it. It
          releases the native splash itself, once its identical first frame is laid out. */}
      <SplashIntroBoundary>
        <SplashIntro booting={booting} appLocked={state.settings.appLock.enabled} />
      </SplashIntroBoundary>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
