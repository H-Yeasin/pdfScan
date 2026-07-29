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
import { useLibraryPersistence } from '../store/useLibraryPersistence';
import { useSettingsPersistence } from '../store/useSettingsPersistence';
import { useSignaturePersistence } from '../store/useSignaturePersistence';
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
};

export function AppNavigator() {
  useLibraryPersistence();
  useSettingsPersistence();
  useSignaturePersistence();
  useEffect(() => {
    initializeDatabase().catch((e) => console.warn('DB init failed', e));
  }, []);
  const { screen, navDir, navTick } = useRouter();
  const { width } = useWindowDimensions();
  const progress = useRef(new Animated.Value(1)).current;
  const [outgoing, setOutgoing] = useState<{ screen: ScreenName; navDir: NavDir } | null>(null);
  const prevTick = useRef(navTick);
  const prevScreen = useRef<ScreenName>(screen);

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
