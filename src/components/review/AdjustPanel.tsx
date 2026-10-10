import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { radii, spacing, useTheme } from '../../theme';
import { useT } from '../../i18n/useT';
import { DEFAULT_ADJUST, isDefaultAdjust } from '../../services/enhance/adjust';
import type { AdjustValues } from '../../types/models';
import { AdjustSlider } from './AdjustSlider';
import type { LiveAdjust } from './useLiveAdjust';

type AdjustPanelProps = {
  // The page's stored values.
  value: AdjustValues;
  // §16 G7: the values under the finger (useLiveAdjust); each slider writes its own from the UI
  // thread, and the preview reads them there.
  live: LiveAdjust;
  onCommit: (next: AdjustValues) => void;
};

// Three sliders over one page's adjust values. While one is dragged, nothing here renders: the
// slider moves its own thumb and writes `live`. `onCommit` - the only call that reaches the store
// - fires on release/tap (AdjustSlider's contract) or Reset, with the other two fields as stored.
export const AdjustPanel = memo(function AdjustPanel({ value, live, onCommit }: AdjustPanelProps) {
  const { tokens } = useTheme();
  const { t } = useT();

  const commitField = (field: keyof AdjustValues, v: number) => onCommit({ ...value, [field]: v });

  const atDefault = isDefaultAdjust(value);

  return (
    <View style={[styles.panel, { backgroundColor: tokens.surface2, borderColor: tokens.edge }]}>
      <AdjustSlider
        label={t('review.adjustPanel.brightness')}
        value={value.brightness}
        live={live.brightness}
        onCommit={(v) => commitField('brightness', v)}
      />
      <AdjustSlider
        label={t('review.adjustPanel.contrast')}
        value={value.contrast}
        live={live.contrast}
        onCommit={(v) => commitField('contrast', v)}
      />
      <AdjustSlider
        label={t('review.adjustPanel.saturation')}
        value={value.saturation}
        live={live.saturation}
        onCommit={(v) => commitField('saturation', v)}
      />
      <Pressable accessibilityRole="button" style={styles.resetRow} onPress={() => onCommit(DEFAULT_ADJUST)} disabled={atDefault} hitSlop={6}>
        <Ionicons name="refresh-outline" size={13} color={atDefault ? tokens.edge : tokens.muted} />
        <Text style={[styles.resetLabel, { color: atDefault ? tokens.edge : tokens.muted }]}>{t('review.adjustPanel.reset')}</Text>
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  panel: {
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  resetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: 4,
  },
  resetLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
});
