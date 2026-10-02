import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from '../../navigation/router';
import { startScan } from '../../services/courses/startScan';
import { useAppState } from '../../store/AppStateContext';
import { radii, spacing, typeScale } from '../../theme';
import { useT } from '../../i18n/useT';
import type { TKey } from '../../i18n';

type Tab = 'home' | 'capture' | 'library';

type TabBarProps = {
  active: Tab;
  background: string;
  activeColor: string;
  inactiveColor: string;
  accent: string;
};

const TABS: { id: Tab; labelKey: TKey }[] = [
  { id: 'home', labelKey: 'shared.tabs.home' },
  { id: 'capture', labelKey: 'shared.tabs.scan' },
  { id: 'library', labelKey: 'shared.tabs.library' },
];

export function TabBar({ active, background, activeColor, inactiveColor, accent }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const { go } = useRouter();
  const { state, dispatch } = useAppState();

  const open = (tab: Tab) => {
    if (tab === active) return;
    // The Scan tab only shows Capture; the camera opens when the student taps the shutter. It files
    // into no particular course (the automatic suggestion decides).
    if (tab === 'capture') startScan(state, dispatch, null, { launch: false });
    const index = (t: Tab) => TABS.findIndex((x) => x.id === t);
    go(tab, index(tab) < index(active) ? 'back' : 'fwd');
  };

  return (
    <View style={[styles.container, { backgroundColor: background, paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
      {TABS.map((tab) => (
        <Pressable key={tab.id} style={styles.tab} onPress={() => open(tab.id)} accessibilityRole="tab" accessibilityState={{ selected: tab.id === active }}>
          <Text style={[styles.label, { color: active === tab.id ? activeColor : inactiveColor }]}>{t(tab.labelKey)}</Text>
          {active === tab.id && <View style={[styles.indicator, { backgroundColor: accent }]} />}
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
