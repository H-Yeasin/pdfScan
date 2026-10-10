import { t } from '../i18n';
import { useEffect, useRef, useState } from 'react';
import { BootEffects } from './BootEffects';
import { Alert, BackHandler, StyleSheet, View } from 'react-native';
import { useRouter } from '../navigation/router';
import { resolveBack, type BackContext } from '../navigation/backHandling';
import { activeStack } from '../navigation/navStack';
import { ScreenStack, type ScreenMap } from '../navigation/ScreenStack';
import { SPLASH_TIMEOUT_MS } from './splash';
import { chooseStartScreen } from './startScreen';
import { useDeferredBoot } from './useDeferredBoot';
import { useRenderCount, useRenderCountsShown } from '../utils/renderCounts';
import { lazyScreens } from '../navigation/lazyScreens';
import { onboardingDecision } from '../services/onboarding/onboarding';
import { RestoreHost } from '../components/backup/RestoreHost';
import { AppLockGate } from '../components/security/AppLockGate';
import { SplashIntro, SplashIntroBoundary } from '../components/brand/SplashIntro';
import { ExportHost } from '../components/backup/ExportHost';
import { ProTaskResumeHost } from '../components/pro/ProTaskResumeHost';
import { AutoBackupChip } from '../components/backup/AutoBackupChip';
import { useAppDispatch, useAppSelector, useAppStore } from '../store/AppStateContext';
import { useAppFonts, useTheme } from '../theme';
import { StatusBar } from 'expo-status-bar';

// §16 G3: each screen loads on its first render (the start screen at boot, the others when they're
// first opened), so the bundle's first run doesn't evaluate the Reader's viewers, Review's filters,
// Deliver's PDF builder and the rest. See navigation/lazyScreens.ts; bootImports.test.ts keeps
// the boot path (this file, and the start screens) clear of the heavy libraries.
const SCREENS: ScreenMap = lazyScreens({
  home: () => (require('../screens/HomeScreen') as typeof import('../screens/HomeScreen')).HomeScreen,
  course: () => (require('../screens/CourseScreen') as typeof import('../screens/CourseScreen')).CourseScreen,
  capture: () => (require('../screens/CaptureScreen') as typeof import('../screens/CaptureScreen')).CaptureScreen,
  review: () => (require('../screens/ReviewScreen') as typeof import('../screens/ReviewScreen')).ReviewScreen,
  deliver: () => (require('../screens/DeliverScreen') as typeof import('../screens/DeliverScreen')).DeliverScreen,
  library: () => (require('../screens/LibraryScreen') as typeof import('../screens/LibraryScreen')).LibraryScreen,
  reader: () => (require('../screens/ReaderScreen') as typeof import('../screens/ReaderScreen')).ReaderScreen,
  settings: () => (require('../screens/SettingsScreen') as typeof import('../screens/SettingsScreen')).SettingsScreen,
  pro: () => (require('../screens/ProScreen') as typeof import('../screens/ProScreen')).ProScreen,
  manageFolders: () => (require('../screens/ManageFoldersScreen') as typeof import('../screens/ManageFoldersScreen')).ManageFoldersScreen,
  academicOptions: () => (require('../screens/AcademicOptionsScreen') as typeof import('../screens/AcademicOptionsScreen')).AcademicOptionsScreen,
  examPack: () => (require('../screens/ExamPackScreen') as typeof import('../screens/ExamPackScreen')).ExamPackScreen,
  storage: () => (require('../screens/StorageScreen') as typeof import('../screens/StorageScreen')).StorageScreen,
  backup: () => (require('../screens/BackupScreen') as typeof import('../screens/BackupScreen')).BackupScreen,
  onboarding: () => (require('../screens/OnboardingScreen') as typeof import('../screens/OnboardingScreen')).OnboardingScreen,
  // Dev only (Settings shows the way in under __DEV__). Metro folds __DEV__ before it collects a
  // release bundle's requires, so the Filter Lab isn't in one.
  filterLab: __DEV__ ? () => (require('../dev/FilterLabScreen') as typeof import('../dev/FilterLabScreen')).FilterLabScreen : () => NoScreen,
  readerLab: __DEV__ ? () => (require('../dev/ReaderLabScreen') as typeof import('../dev/ReaderLabScreen')).ReaderLabScreen : () => NoScreen,
});

function NoScreen() {
  return null;
}

// §16 G5, dev only (Settings → Developer → Render counts). Required inside the component, so the
// overlay isn't loaded at boot, and not in a release bundle, like the Filter Lab above.
function DevRenderCounts() {
  const shown = useRenderCountsShown();
  if (!__DEV__ || !shown) return null;
  const { RenderCountOverlay } = require('../dev/RenderCountOverlay') as typeof import('../dev/RenderCountOverlay');
  return <RenderCountOverlay />;
}

// §16 G5: reads single fields, never a whole slice, so a search keystroke, a selection tap, a scan
// progress tick or an indexed page doesn't re-render the navigator (and, under it, the layers and
// hosts). The hooks that do follow whole slices (persistence, integrity, indexing, reminders) are
// in <BootEffects/>, which renders nothing. What Back and the start screen need of the rest is
// read from the store at that moment.
export function AppNavigator() {
  useRenderCount('AppNavigator');
  const [booting, setBooting] = useState(true);
  // §9 O5: true a moment after the start screen is up; work the first screen doesn't need waits.
  const afterBoot = useDeferredBoot(!booting);
  const { screen, nav, navTick, go, back, replace } = useRouter();
  const { tokens, theme } = useTheme();
  // §16 G4: fonts gate the first screen here, with the data, instead of in a gate above the store
  // (AppProviders' old FontGate): the boot hooks (BootEffects) start on the first render either way. Ready
  // at once in a build with the fonts embedded (app.json's expo-font plugin); a runtime load in
  // Expo Go, on the web and in a dev build made before that.
  const { fontsReady } = useAppFonts();

  const dispatch = useAppDispatch();
  const store = useAppStore();
  const libraryStatus = useAppSelector((s) => s.library.loadStatus);
  const settingsLoaded = useAppSelector((s) => s.settings.loaded);
  const appLocked = useAppSelector((s) => s.settings.appLock.enabled);
  const hasActiveCourse = useAppSelector((s) => s.library.courses.some((c) => !c.archived));
  const processingStatus = useAppSelector((s) => s.capture.processingStatus);
  const errorMessage = useAppSelector((s) => s.capture.errorMessage);
  const prevProcessingStatus = useRef(processingStatus);

  // Start screen (§9 O1, `chooseStartScreen`): picked once settings, the library index and the
  // fonts are in, before the first real render, while the splash still covers the app (the native one, then the
  // splash intro's identical overlay, §15 V5) - so Capture never flashes up on the way to Home. A failed library load falls through to Capture (with F3's
  // load-error state on the Library); anything that already navigated (e.g. "Open with") wins.
  // If loading takes longer than SPLASH_TIMEOUT_MS the app shows anyway, and the start screen is
  // still corrected once loading finishes, as long as the user hasn't navigated yet.
  const startChosen = useRef(false);
  const bootReady = libraryStatus !== 'loading' && settingsLoaded && fontsReady;
  useEffect(() => {
    if (startChosen.current || !bootReady) return;
    startChosen.current = true;
    // §9 O2: the introduction for a brand-new user; someone updating with a library already in
    // place is marked done without seeing it.
    const { settings, library } = store.getState();
    const onboarding = onboardingDecision({
      onboardingDone: settings.onboardingDone,
      libraryLoaded: libraryStatus === 'ready',
      documentCount: library.files.length,
      courseCount: library.courses.length,
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
  // listener is newer and runs first; it reads where the router is through a ref, and the rest
  // from the store when Back is pressed (§16 G5), so none of it re-renders the navigator.
  const where = useRef({ screen, nav });
  where.current = { screen, nav };
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const { capture, library, libraryUi, deliver } = store.getState();
      const ctx: BackContext = {
        screen: where.current.screen,
        tab: where.current.nav.tab,
        canPop: activeStack(where.current.nav).length > 1,
        hasCourses: library.courses.some((c) => !c.archived),
        selMode: libraryUi.selMode,
        searchOpen: libraryUi.searchOpen,
        sessionPageCount: capture.pages.length,
        retakeTargetId: capture.retakeTargetId,
        highlightDeadlineId: libraryUi.highlightDeadlineId,
        // §14 Q7.
        coverTarget: deliver.coverTarget,
      };
      const step = resolveBack(ctx);
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
  }, [dispatch, store, go, back]);

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
      {/* §16 G5: persistence, indexing, reminders and the other boot work. Renders nothing; here
          from the first render, above the lock, like the hooks it took over from this component. */}
      <BootEffects afterBoot={afterBoot} />
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
            <ProTaskResumeHost ready={afterBoot && libraryStatus === 'ready'} />
          </AppLockGate>
        </>
      )}
      {/* §15 V5: the splash intro, over everything (still under App.tsx's Snackbar). It's the last
          child in the booting tree and the booted one alike, so the switch doesn't remount it. It
          releases the native splash itself, once its identical first frame is laid out. */}
      <SplashIntroBoundary>
        <SplashIntro booting={booting} appLocked={appLocked} />
      </SplashIntroBoundary>
      <DevRenderCounts />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
