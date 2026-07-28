import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from '../../navigation/router';
import { radii, spacing, typeScale } from '../../theme';

type TabBarProps = {
  active: 'capture' | 'library';
  background: string;
  activeColor: string;
  inactiveColor: string;
  accent: string;
};

export function TabBar({ active, background, activeColor, inactiveColor, accent }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const { go } = useRouter();

  return (
    <View style={[styles.container, { backgroundColor: background, paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
      <Pressable style={styles.tab} onPress={() => active !== 'capture' && go('capture', 'back')}>
        <Text style={[styles.label, { color: active === 'capture' ? activeColor : inactiveColor }]}>Capture</Text>
        {active === 'capture' && <View style={[styles.indicator, { backgroundColor: accent }]} />}
      </Pressable>

      <Pressable style={styles.tab} onPress={() => active !== 'library' && go('library')}>
        <Text style={[styles.label, { color: active === 'library' ? activeColor : inactiveColor }]}>Library</Text>
        {active === 'library' && <View style={[styles.indicator, { backgroundColor: accent }]} />}
      </Pressable>
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
