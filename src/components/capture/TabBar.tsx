import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radii, spacing, typography } from '../../theme';

export function TabBar() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
      <View style={styles.tab}>
        <Text style={styles.activeLabel}>Capture</Text>
        <View style={styles.activeIndicator} />
      </View>

      <Pressable style={styles.tab} disabled>
        <Text style={styles.inactiveLabel}>Library</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSolid,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  activeLabel: {
    color: colors.textPrimary,
    fontSize: typography.tabActive.fontSize,
    fontWeight: typography.tabActive.fontWeight,
  },
  inactiveLabel: {
    color: colors.textDim,
    fontSize: typography.tabInactive.fontSize,
    fontWeight: typography.tabInactive.fontWeight,
  },
  activeIndicator: {
    width: '60%',
    height: 3,
    borderRadius: radii.full,
    backgroundColor: colors.accent,
  },
});
