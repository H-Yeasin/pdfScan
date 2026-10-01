import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { radii, spacing, useTheme } from '../../theme';
import { DEFAULT_ADJUST, isDefaultAdjust } from '../../services/enhance/adjust';
import type { AdjustValues } from '../../types/models';
import { AdjustSlider } from './AdjustSlider';

type AdjustPanelProps = {
  value: AdjustValues;
  onCommit: (next: AdjustValues) => void;
  // Every drag tick, for the live preview (it only re-records an SkPicture, so it's cheap).
  onLive?: (next: AdjustValues) => void;
};

// Draft state mirrors `value` but updates on every drag tick (for a responsive label/thumb and the
// live preview through `onLive`), while `onCommit` - the only call that reaches the store - fires
// on release/tap (AdjustSlider's contract) or Reset. Re-synced from `value` when the page changes.
export function AdjustPanel({ value, onCommit, onLive }: AdjustPanelProps) {
  const { tokens } = useTheme();
  const [draft, setDraft] = useState(value);

  useEffect(() => setDraft(value), [value]);

  const liveField = (field: keyof AdjustValues, v: number) => {
    const next = { ...draft, [field]: v };
    setDraft(next);
    onLive?.(next);
  };

  const commitField = (field: keyof AdjustValues, v: number) => {
    const next = { ...draft, [field]: v };
    setDraft(next);
    onCommit(next);
  };

  const reset = () => {
    setDraft(DEFAULT_ADJUST);
    onCommit(DEFAULT_ADJUST);
  };

  const atDefault = isDefaultAdjust(draft);

  return (
    <View style={[styles.panel, { backgroundColor: tokens.surface2, borderColor: tokens.edge }]}>
      <AdjustSlider
        label="Brightness"
        value={draft.brightness}
        onChange={(v) => liveField('brightness', v)}
        onCommit={(v) => commitField('brightness', v)}
      />
      <AdjustSlider
        label="Contrast"
        value={draft.contrast}
        onChange={(v) => liveField('contrast', v)}
        onCommit={(v) => commitField('contrast', v)}
      />
      <AdjustSlider
        label="Saturation"
        value={draft.saturation}
        onChange={(v) => liveField('saturation', v)}
        onCommit={(v) => commitField('saturation', v)}
      />
      <Pressable style={styles.resetRow} onPress={reset} disabled={atDefault} hitSlop={6}>
        <Ionicons name="refresh-outline" size={13} color={atDefault ? tokens.edge : tokens.muted} />
        <Text style={[styles.resetLabel, { color: atDefault ? tokens.edge : tokens.muted }]}>Reset</Text>
      </Pressable>
    </View>
  );
}

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
