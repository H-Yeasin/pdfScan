import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TABS, type TabId } from '../../navigation/navStack';
import { useRouter } from '../../navigation/router';
import { startScan } from '../../services/courses/startScan';
import { useAppDispatch, useAppStore } from '../../store/AppStateContext';
import { radii, spacing, typeScale, useTheme, CHROME_MAX_FONT_SCALE } from '../../theme';
import { useCaptureChrome } from '../../theme/captureChrome';
import { useT } from '../../i18n/useT';
import type { TKey } from '../../i18n';
import { useReportBottomBar } from './bottomBarHeight';
import { useRenderCount } from '../../utils/renderCounts';

const LABELS: Record<TabId, TKey> = {
  home: 'shared.tabs.home',
  capture: 'shared.tabs.scan',
  library: 'shared.tabs.library',
};

// §16 G2: rendered once, by the shell in navigation/ScreenStack, under the tab roots - it no
// longer slides with each tab's screen. Over Capture it takes Capture's dark chrome.
export function TabBar() {
  useRenderCount('TabBar');
  const insets = useSafeAreaInsets();
  const onLayout = useReportBottomBar();
  const { t } = useT();
  const { tab: active, switchTab } = useRouter();
  const { tokens } = useTheme();
  const chrome = useCaptureChrome();
  const dispatch = useAppDispatch();
  // Read at press time: the tab bar doesn't need to re-render on state changes (§9 O5).
  const store = useAppStore();
  const colors =
    active === 'capture'
      ? { background: chrome.tabBar, active: chrome.text, inactive: chrome.textDim, accent: chrome.accent }
      : { background: tokens.surface, active: tokens.ink, inactive: tokens.muted, accent: tokens.accent };

  const open = (tab: TabId) => {
    // The Scan tab only shows Capture; the camera opens when the student taps the shutter. It files
    // into no particular course (the automatic suggestion decides).
    if (tab === 'capture' && tab !== active) startScan(store.getState(), dispatch, null, { launch: false });
    switchTab(tab);
  };

  return (
    <View onLayout={onLayout} style={[styles.container, { backgroundColor: colors.background, paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
      {TABS.map((tab) => (
        <Pressable key={tab} style={styles.tab} onPress={() => open(tab)} accessibilityRole="tab" accessibilityState={{ selected: tab === active }}>
          <Text maxFontSizeMultiplier={CHROME_MAX_FONT_SCALE} style={[styles.label, { color: active === tab ? colors.active : colors.inactive }]}>{t(LABELS[tab])}</Text>
          {active === tab && <View style={[styles.indicator, { backgroundColor: colors.accent }]} />}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  label: {
    fontSize: typeScale.label.fontSize,
    fontFamily: typeScale.label.fontFamily,
  },
  indicator: {
    width: '60%',
    height: 3,
    borderRadius: radii.full,
  },
});
