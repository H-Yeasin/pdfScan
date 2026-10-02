import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '../../i18n/useT';
import { useAppSelector } from '../../store/AppStateContext';
import { radii, spacing, useTheme } from '../../theme';

// §8 B5: a small "Backing up… 40%" chip while an automatic backup runs. Doesn't take touches.
export function AutoBackupChip() {
  const { tokens } = useTheme();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const progress = useAppSelector((s) => s.ui.autoBackupProgress);
  if (progress === null) return null;
  return (
    <View pointerEvents="none" style={[styles.wrap, { top: insets.top + spacing.xs }]}>
      <View style={[styles.chip, { backgroundColor: tokens.surface, borderColor: tokens.edge }]}>
        <ActivityIndicator size="small" color={tokens.accent} />
        <Text style={[styles.label, { color: tokens.ink }]}>{t('backup.auto.running', { percent: Math.round(progress * 100) })}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
});
