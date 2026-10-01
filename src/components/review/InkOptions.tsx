import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { DEFAULT_FADE_LINES, DEFAULT_KEEP_INK_COLOR } from '../../services/enhance/filters/inkMath';
import { spacing, useTheme } from '../../theme';
import type { FilterOptions } from '../../types/models';

type InkOptionsProps = {
  value: FilterOptions | undefined;
  onChange: (options: FilterOptions) => void;
};

// The Ink filter's two per-page switches, shown under the filter picker while Ink is selected.
export function InkOptions({ value, onChange }: InkOptionsProps) {
  const fadeLines = value?.fadeLines ?? DEFAULT_FADE_LINES;
  const keepInkColor = value?.keepInkColor ?? DEFAULT_KEEP_INK_COLOR;
  return (
    <View style={styles.row}>
      <Toggle label="Fade lines" on={fadeLines} onPress={() => onChange({ fadeLines: !fadeLines })} />
      <Toggle label="Keep pen colour" on={keepInkColor} onPress={() => onChange({ keepInkColor: !keepInkColor })} />
    </View>
  );
}

function Toggle({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const { tokens } = useTheme();
  const color = on ? tokens.accent : tokens.muted;
  return (
    <Pressable style={styles.toggle} onPress={onPress} hitSlop={4}>
      <Ionicons name={on ? 'checkbox' : 'square-outline'} size={18} color={color} />
      <Text style={[styles.label, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.lg,
    marginTop: spacing.sm,
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
});
