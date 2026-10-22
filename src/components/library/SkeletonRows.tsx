import { StyleSheet, View } from 'react-native';
import { radii, spacing, useTheme } from '../../theme';
import { useT } from '../../i18n/useT';
import { Skeleton } from '../ui';

// §9 O6: placeholder rows shaped like FileRow while the library loads (instead of a blank list or
// the "No documents yet" empty state). Files and a course's page (§17 U13). Since U13 the blocks
// are the kit's Skeleton: they breathe, and stand still under reduced motion.
export function SkeletonRows({ count = 6 }: { count?: number }) {
  const { tokens } = useTheme();
  const { t } = useT();
  return (
    <View style={styles.list} accessible accessibilityRole="progressbar" accessibilityLabel={t('a11y.loadingDocuments')}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={[styles.row, { backgroundColor: tokens.surface, borderColor: tokens.edge }]}>
          <Skeleton width={40} height={52} radius={radii.thumb} />
          <View style={styles.lines}>
            <Skeleton width="70%" height={10} radius={radii.xs} />
            <Skeleton width="40%" height={10} radius={radii.xs} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.sm,
    padding: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.card,
    borderWidth: 1.5,
  },
  lines: {
    flex: 1,
    gap: spacing.sm,
  },
});
