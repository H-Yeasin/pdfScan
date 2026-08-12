import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useRouter } from '../navigation/router';
import { runSlide, slideTransform } from '../navigation/transitions';
import type { NavDir, ScreenName } from '../types/navigation';
import { CaptureScreen } from '../screens/CaptureScreen';
import { ReviewScreen } from '../screens/ReviewScreen';
import { DeliverScreen } from '../screens/DeliverScreen';
import { LibraryScreen } from '../screens/LibraryScreen';
import { ReaderScreen } from '../screens/ReaderScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { ProScreen } from '../screens/ProScreen';
import { ManageFoldersScreen } from '../screens/ManageFoldersScreen';
import { AcademicOptionsScreen } from '../screens/AcademicOptionsScreen';
import { useLibraryPersistence } from '../store/useLibraryPersistence';
import { useSettingsPersistence } from '../store/useSettingsPersistence';
import { useSignaturePersistence } from '../store/useSignaturePersistence';
import { useAppState } from '../store/AppStateContext';
import { initializeDatabase } from '../services/persistence/dbService';

const SCREENS: Record<ScreenName, React.ComponentType> = {
  capture: CaptureScreen,
  review: ReviewScreen,
  deliver: DeliverScreen,
  library: LibraryScreen,
  reader: ReaderScreen,
  settings: SettingsScreen,
  pro: ProScreen,
  manageFolders: ManageFoldersScreen,
  academicOptions: AcademicOptionsScreen,
};

export function AppNavigator() {
  useLibraryPersistence();
  useSettingsPersistence();
  useSignaturePersistence();
  useEffect(() => {
    initializeDatabase().catch((e) => console.warn('DB init failed', e));
  }, []);
  const { screen, navDir, navTick, go } = useRouter();
  const { width } = useWindowDimensions();
  const progress = useRef(new Animated.Value(1)).current;
  const [outgoing, setOutgoing] = useState<{ screen: ScreenName; navDir: NavDir } | null>(null);
  const prevTick = useRef(navTick);
  const prevScreen = useRef<ScreenName>(screen);

  const { state, dispatch } = useAppState();
  const { processingStatus, errorMessage } = state.capture;
  const prevProcessingStatus = useRef(processingStatus);

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
      dispatch({ type: 'ui/SHOW_SNACK', msg: 'Scan complete' });
      dispatch({ type: 'capture/SET_PROCESSING_STATUS', status: 'idle' });
    } else if (processingStatus === 'error') {
      dispatch({ type: 'ui/SHOW_SNACK', msg: errorMessage ?? 'Scan failed' });
      dispatch({ type: 'capture/SET_PROCESSING_STATUS', status: 'idle' });
    }
  }, [processingStatus, errorMessage, dispatch, go]);

  useEffect(() => {
    if (navTick === prevTick.current) return;
    const from = prevScreen.current;
    prevTick.current = navTick;
    prevScreen.current = screen;
    setOutgoing({ screen: from, navDir });
    runSlide(progress, () => setOutgoing(null));
  }, [navTick, screen, navDir, progress]);

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
