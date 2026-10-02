import { Pressable, StyleSheet, Text, View } from 'react-native';
import { spacing, useTheme } from '../../theme';
import { useT } from '../../i18n/useT';

type ProcessingProgressProps = {
  done: number;
  total: number;
  onCancel: () => void;
};

// "Processing page 3 of 10" with a slim determinate bar and a Cancel action, shown in Review
// while scanned/imported pages are still being processed. Cancel stops after the current page;
// finished pages are kept.
export function ProcessingProgress({ done, total, onCancel }: ProcessingProgressProps) {
  const { tokens } = useTheme();
  const { t } = useT();
  const current = Math.min(done + 1, total);
  const fraction = total > 0 ? done / total : 0;

  return (
    <View style={styles.container} accessibilityLiveRegion="polite">
      <View style={styles.row}>
        <Text style={[styles.label, { color: tokens.muted }]}>
          {t('review.processingPageShort', { current, total })}
        </Text>
        <Pressable onPress={onCancel} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('review.stopProcessing')}>
          <Text style={[styles.cancel, { color: tokens.accentInk }]}>{t('common.cancel')}</Text>
        </Pressable>
      </View>
      <View
        style={[styles.track, { backgroundColor: tokens.edge }]}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: total, now: done }}
      >
        <View style={[styles.fill, { backgroundColor: tokens.accent, width: `${fraction * 100}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xs,
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  cancel: {
    fontSize: 13,
    fontWeight: '600',
  },
  track: {
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
  },
});
