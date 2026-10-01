import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SegmentedControl } from '../shared/SegmentedControl';
import { DEFAULT_FADE_LINES, DEFAULT_KEEP_INK_COLOR } from '../../services/enhance/filters/inkMath';
import { spacing, useTheme } from '../../theme';
import type { EnhanceMode, FilterOptions } from '../../types/models';

type BoardStyle = NonNullable<FilterOptions['boardStyle']>;

const BOARD_SEGMENTS: { id: BoardStyle; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'light', label: 'Whiteboard' },
  { id: 'dark', label: 'Blackboard' },
];

type FilterOptionsPanelProps = {
  mode: EnhanceMode;
  value: FilterOptions | undefined;
  // Receives only the changed fields; callers merge them into the page's filterOptions.
  onChange: (options: FilterOptions) => void;
};

// The per-page switches of the filters that have any (Ink, Board), shown under the filter picker
// while that filter is selected. Renders nothing for the other filters.
export function FilterOptionsPanel({ mode, value, onChange }: FilterOptionsPanelProps) {
  if (mode === 'ink') {
    const fadeLines = value?.fadeLines ?? DEFAULT_FADE_LINES;
    const keepInkColor = value?.keepInkColor ?? DEFAULT_KEEP_INK_COLOR;
    return (
      <View style={styles.row}>
        <Toggle label="Fade lines" on={fadeLines} onPress={() => onChange({ fadeLines: !fadeLines })} />
        <Toggle label="Keep pen colour" on={keepInkColor} onPress={() => onChange({ keepInkColor: !keepInkColor })} />
      </View>
    );
  }
  if (mode === 'board') {
    const boardStyle = value?.boardStyle ?? 'auto';
    const keepDarkBoard = !!value?.keepDarkBoard;
    return (
      <View style={styles.column}>
        <SegmentedControl segments={BOARD_SEGMENTS} value={boardStyle} onChange={(next) => onChange({ boardStyle: next })} />
        {/* Only dark boards read it; under Auto the detection decides, so it's offered there too. */}
        {boardStyle !== 'light' && (
          <View style={styles.row}>
            <Toggle
              label="Keep dark background"
              on={keepDarkBoard}
              onPress={() => onChange({ keepDarkBoard: !keepDarkBoard })}
            />
          </View>
        )}
      </View>
    );
  }
  return null;
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
  column: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
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
