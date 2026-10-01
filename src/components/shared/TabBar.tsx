import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from '../../navigation/router';
import { startScan } from '../../services/courses/startScan';
import { useAppState } from '../../store/AppStateContext';
import { radii, spacing, typeScale } from '../../theme';

type Tab = 'home' | 'capture' | 'library';

type TabBarProps = {
  active: Tab;
  background: string;
  activeColor: string;
  inactiveColor: string;
  accent: string;
};

const TABS: { id: Tab; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'capture', label: 'Scan' },
  { id: 'library', label: 'Library' },
];

export function TabBar({ active, background, activeColor, inactiveColor, accent }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const { go } = useRouter();
  const { state, dispatch } = useAppState();

  const open = (tab: Tab) => {
    if (tab === active) return;
    // Scan from the tab bar files into no particular course (Deliver's picker still decides).
    if (tab === 'capture') startScan(state, dispatch, null);
    const index = (t: Tab) => TABS.findIndex((x) => x.id === t);
    go(tab, index(tab) < index(active) ? 'back' : 'fwd');
  };

  return (
    <View style={[styles.container, { backgroundColor: background, paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
      {TABS.map((tab) => (
        <Pressable key={tab.id} style={styles.tab} onPress={() => open(tab.id)} accessibilityRole="tab" accessibilityState={{ selected: tab.id === active }}>
          <Text style={[styles.label, { color: active === tab.id ? activeColor : inactiveColor }]}>{tab.label}</Text>
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
