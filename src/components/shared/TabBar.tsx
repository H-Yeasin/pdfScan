import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TABS, type TabId } from '../../navigation/navStack';
import { useRouter } from '../../navigation/router';
import { startScan } from '../../services/courses/startScan';
import { useAppDispatch, useAppSelector, useAppStore } from '../../store/AppStateContext';
import { elevation, ICON_SIZE, ICONS, radii, spacing, useTheme, type IoniconName } from '../../theme';
import { useT } from '../../i18n/useT';
import type { TKey } from '../../i18n';
import { ScanModeSheet } from '../capture/ScanModeSheet';
import { Text, Touchable } from '../ui';
import { Hint } from './Hint';
import { useHint } from './useHint';
import { useReportBottomBar } from './bottomBarHeight';
import { useRenderCount } from '../../utils/renderCounts';

// §17 U5: Home · Files · [Scan] · Tools · Me. The four tabs come from navStack.TABS; Scan sits in
// the middle and isn't a tab: a tap opens the scanner at once in the last mode, a long-press opens
// the mode sheet. Inactive tabs show the outline icon, the active one the filled icon on a soft
// pill.
const TAB_LOOK: Record<TabId, { label: TKey; icon: IoniconName; active: IoniconName }> = {
  home: { label: 'shared.tabs.home', icon: ICONS.home, active: 'home' },
  library: { label: 'shared.tabs.files', icon: ICONS.files, active: 'folder-open' },
  tools: { label: 'shared.tabs.tools', icon: ICONS.tools, active: 'construct' },
  settings: { label: 'shared.tabs.me', icon: ICONS.me, active: 'person-circle' },
};

// The raised Scan button's circle. Its column is taller than the tabs', so the row is that tall and
// the bar's fill starts at the circle's middle: the top half rises above the bar inside the bar's
// own box (Android delivers no touch outside a parent's bounds, so a negative margin would leave
// the top half dead). The strip beside it lets touches through to the screen.
export const SCAN_BUTTON_SIZE = 64;
const PILL_WIDTH = 56;
const PILL_HEIGHT = 30;

// §16 G2: rendered once, by the shell in navigation/ScreenStack, under the tab roots - it doesn't
// slide with each tab's screen.
export function TabBar() {
  useRenderCount('TabBar');
  const insets = useSafeAreaInsets();
  const onLayout = useReportBottomBar();
  const { t } = useT();
  const { tab: active, switchTab } = useRouter();
  const { tokens, theme } = useTheme();
  const dispatch = useAppDispatch();
  // Read at press time: the tab bar doesn't need to re-render on state changes (§9 O5).
  const store = useAppStore();
  const busy = useAppSelector((s) => s.capture.processingStatus === 'scanning' || s.capture.processingStatus === 'processing');
  const [sheetOpen, setSheetOpen] = useState(false);
  // §9 O3: points at Scan once, with the way to the modes.
  const scanHint = useHint('scan', !sheetOpen);

  // A general scan: no particular course (the automatic suggestion decides), the last mode.
  const scan = () => {
    scanHint.dismiss();
    const state = store.getState();
    startScan(state, dispatch, null, { launch: true, mode: state.settings.lastCaptureMode });
  };
  const chooseMode = () => {
    scanHint.dismiss();
    setSheetOpen(true);
  };

  const tabButton = (tab: TabId) => {
    const look = TAB_LOOK[tab];
    const selected = tab === active;
    const color = selected ? tokens.accentInk : tokens.muted;
    return (
      <Touchable
        key={tab}
        style={styles.tab}
        onPress={() => switchTab(tab)}
        accessibilityRole="tab"
        accessibilityLabel={t(look.label)}
        accessibilityState={{ selected }}
        scale={false}
        testID={`tab-${tab}`}
      >
        <View style={[styles.pill, selected ? { backgroundColor: tokens.accentSoft } : null]}>
          <Ionicons name={selected ? look.active : look.icon} size={ICON_SIZE.bar} color={color} />
        </View>
        <Text variant="label" chrome color={selected ? 'ink' : 'muted'} numberOfLines={1}>
          {t(look.label)}
        </Text>
      </Touchable>
    );
  };

  const half = TABS.length / 2;
  return (
    <View onLayout={onLayout} pointerEvents="box-none" style={[styles.container, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
      <View pointerEvents="none" style={[styles.fill, { backgroundColor: tokens.surface, borderTopColor: tokens.edge }]} />
      {scanHint.visible ? (
        <View style={styles.hintRow} pointerEvents="box-none">
          <Hint
            text={t('shared.hint.scan')}
            onDismiss={scanHint.dismiss}
            action={{ label: t('capture.modeSheet.choose'), onPress: chooseMode }}
            arrow="down"
          />
        </View>
      ) : null}
      {TABS.slice(0, half).map(tabButton)}
      <View style={styles.tab}>
        <Touchable
          style={[styles.scanButton, elevation(2, theme), { backgroundColor: tokens.accent, borderColor: tokens.surface }]}
          onPress={scan}
          onLongPress={chooseMode}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={t('shared.tabs.scan')}
          accessibilityHint={t('shared.tabs.scanHint')}
          accessibilityState={{ disabled: busy }}
          accessibilityActions={[{ name: 'longpress', label: t('capture.modeSheet.choose') }]}
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === 'longpress') chooseMode();
          }}
          ripple="onFill"
          rippleRadius={SCAN_BUTTON_SIZE / 2}
          haptic
          testID="tab-scan"
        >
          <Ionicons name="scan" size={28} color={tokens.onAccent} />
        </Touchable>
        <Text variant="label" chrome color="ink" numberOfLines={1}>
          {t('shared.tabs.scan')}
        </Text>
      </View>
      {TABS.slice(half).map(tabButton)}
      <ScanModeSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  fill: {
    position: 'absolute',
    top: SCAN_BUTTON_SIZE / 2,
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    gap: spacing.xs,
  },
  pill: {
    width: PILL_WIDTH,
    height: PILL_HEIGHT,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanButton: {
    width: SCAN_BUTTON_SIZE,
    height: SCAN_BUTTON_SIZE,
    borderRadius: radii.full,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hintRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: '100%',
    alignItems: 'center',
    paddingBottom: spacing.sm,
  },
});
