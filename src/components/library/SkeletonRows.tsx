import { StyleSheet, View } from 'react-native';
import { radii, spacing, useTheme } from '../../theme';
import { useT } from '../../i18n/useT';

// §9 O6: placeholder rows shaped like FileRow while the library loads (instead of a blank list or
// the "No documents yet" empty state). Static, so reduce motion needs no special case.
export function SkeletonRows({ count = 6 }: { count?: number }) {
  const { tokens } = useTheme();
  const { t } = useT();
  return (
    <View style={styles.list} accessible accessibilityRole="progressbar" accessibilityLabel={t('a11y.loadingDocuments')}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={[styles.row, { backgroundColor: tokens.surface, borderColor: tokens.edge }]}>
          <View style={[styles.cover, { backgroundColor: tokens.surface2 }]} />
          <View style={styles.lines}>
            <View style={[styles.line, styles.lineLong, { backgroundColor: tokens.surface2 }]} />
            <View style={[styles.line, styles.lineShort, { backgroundColor: tokens.surface2 }]} />
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
  cover: {
    width: 40,
    height: 52,
    borderRadius: radii.thumb,
  },
  lines: {
    flex: 1,
    gap: spacing.sm,
  },
  line: {
    height: 10,
    borderRadius: 5,
  },
  lineLong: { width: '70%' },
  lineShort: { width: '40%' },
});
