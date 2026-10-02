import { t } from '../i18n';
import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, BackHandler, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useRouter } from '../navigation/router';
import { resolveBack, type BackContext } from '../navigation/backHandling';
import { releaseSplash, SPLASH_TIMEOUT_MS } from './splash';
import { chooseStartScreen } from './startScreen';
import { useDeferredBoot } from './useDeferredBoot';
import { runSlide, slideTransform } from '../navigation/transitions';
import type { NavDir, ScreenName } from '../types/navigation';
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
import { FilterLabScreen } from '../dev/FilterLabScreen';
import { useLibraryPersistence } from '../store/useLibraryPersistence';
import { useSettingsPersistence } from '../store/useSettingsPersistence';
import { useSignaturePersistence } from '../store/useSignaturePersistence';
import { useExternalFileLinking } from '../store/useExternalFileLinking';
import { useImportedPdfIndexing } from '../store/useImportedPdfIndexing';
import { useDeadlineReminders } from '../store/useDeadlines';
import { useStorageIntegrity } from '../store/useStorageIntegrity';
import { useAppDispatch, useAppSlices } from '../store/AppStateContext';
import { FEATURES } from '../config/features';
import { initCrashReporting } from '../services/telemetry/crash';
import { useTheme } from '../theme';

const SCREENS: Record<ScreenName, React.ComponentType> = {
  home: HomeScreen,
  course: CourseScreen,
  capture: CaptureScreen,
  review: ReviewScreen,
  deliver: DeliverScreen,
  library: LibraryScreen,
  reader: ReaderScreen,
  settings: SettingsScreen,
  // Falls back to the Library while Pro is disabled, so a stray go('pro') can't reach a dead end.
  pro: FEATURES.pro ? ProScreen : LibraryScreen,
  manageFolders: ManageFoldersScreen,
  academicOptions: AcademicOptionsScreen,
  examPack: ExamPackScreen,
  storage: StorageScreen,
  backup: BackupScreen,
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
  const { screen, previousScreen, hub, tabHub, navDir, navTick, go, replace } = useRouter();
  const { tokens } = useTheme();
  const { width } = useWindowDimensions();
  const progress = useRef(new Animated.Value(1)).current;
  const [outgoing, setOutgoing] = useState<{ screen: ScreenName; navDir: NavDir } | null>(null);
  const prevTick = useRef(navTick);
  const prevScreen = useRef<ScreenName>(screen);

  const dispatch = useAppDispatch();
  const state = useAppSlices('capture', 'library', 'settings');
  const { crashReportsEnabled } = state.settings;
  // Deferred too (§9 O5): Sentry's init isn't free, and a crash before it still reaches the
  // ErrorBoundary.
  useEffect(() => {
    if (afterBoot) initCrashReporting(crashReportsEnabled);
  }, [afterBoot, crashReportsEnabled]);
  const { processingStatus, errorMessage } = state.capture;
  const prevProcessingStatus = useRef(processingStatus);

  // Start screen (§9 O1, `chooseStartScreen`): picked once settings and the library index are in,
  // before the first real render, while the native splash still covers the app - so Capture never
  // flashes up on the way to Home. A failed library load falls through to Capture (with F3's
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
    if (screen === 'capture' && navTick === 0) {
      const start = chooseStartScreen({ hasActiveCourse });
      if (start !== screen) replace(start);
    }
    setBooting(false);
  }, [bootReady, hasActiveCourse, screen, navTick, replace]);
  useEffect(() => {
    if (!booting) return;
    const id = setTimeout(() => setBooting(false), SPLASH_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [booting]);
  // Hide the splash only once the chosen screen has had a frame to draw.
  useEffect(() => {
    if (booting) return;
    const id = requestAnimationFrame(releaseSplash);
    return () => cancelAnimationFrame(id);
  }, [booting]);

  // §9 O1: Android back. Open RN Modals and inline overlays (`useBackHandler`) get the press first;
  // this handles the rest by `resolveBack`'s order. Registered once, at boot, so every overlay's
  // listener is newer and runs first; it reads the latest state through a ref.
  const backCtx = useRef<BackContext | null>(null);
  backCtx.current = {
    screen,
    previousScreen,
    hub,
    tabHub,
    hasCourses: hasActiveCourse,
    selMode: state.library.selMode,
    searchOpen: state.library.searchOpen,
    sessionPageCount: state.capture.pages.length,
    retakeTargetId: state.capture.retakeTargetId,
    highlightDeadlineId: state.library.highlightDeadlineId,
  };
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!backCtx.current) return false;
      const step = resolveBack(backCtx.current);
      switch (step.kind) {
        case 'dispatch':
          step.actions.forEach(dispatch);
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
  }, [dispatch, go]);

  // Lives here (always mounted) rather than on CaptureScreen/ReviewScreen, because both of those
  // unmount/remount as the user navigates between tabs. Navigating to Review as soon as the raw
  // scan lands - instead of waiting for the slow downscale/OCR loop to finish - shrinks the window
  // where CaptureScreen sits mounted mid-pipeline, which is what let a stray remount there
  // re-trigger runNativeScannerPipeline().
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

  useEffect(() => {
    // replace() changes screen without a tick: no transition, but the next one slides out from here.
    if (navTick === prevTick.current) {
      prevScreen.current = screen;
      return;
    }
    const from = prevScreen.current;
    prevTick.current = navTick;
    prevScreen.current = screen;
    setOutgoing({ screen: from, navDir });
    runSlide(progress, () => setOutgoing(null));
  }, [navTick, screen, navDir, progress]);

  if (booting) return <View style={[styles.container, { backgroundColor: tokens.bg }]} />;

  const Incoming = SCREENS[screen];
  const Outgoing = outgoing ? SCREENS[outgoing.screen] : null;

  return (
    <View style={styles.container}>
      {Outgoing && outgoing && (
        <Animated.View
          style={[
            styles.layer,
            { transform: [{ translateX: slideTransform(progress, width, 'outgoing', outgoing.navDir) }] },
          ]}
        >
          <Outgoing />
        </Animated.View>
      )}
      <Animated.View
        style={[
          styles.layer,
          { transform: [{ translateX: outgoing ? slideTransform(progress, width, 'incoming', navDir) : 0 }] },
        ]}
      >
        <Incoming />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  layer: StyleSheet.absoluteFill,
});
