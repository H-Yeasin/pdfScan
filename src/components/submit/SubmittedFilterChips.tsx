import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { radii, spacing, useTheme } from '../../theme';

export type SubmittedFilter = 'all' | 'submitted' | 'notSubmitted';

const OPTIONS: { id: SubmittedFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'submitted', label: 'Submitted' },
  { id: 'notSubmitted', label: 'Not submitted' },
];

// Library filter (§4 S7). The caller shows it only once something has been submitted.
export function SubmittedFilterChips({ value, onChange }: { value: SubmittedFilter; onChange: (value: SubmittedFilter) => void }) {
  const { tokens } = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} style={styles.scroll}>
      {OPTIONS.map((option) => {
        const selected = option.id === value;
        return (
          <Pressable
            key={option.id}
            onPress={() => onChange(option.id)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={[
              styles.chip,
              { borderColor: selected ? tokens.accent : tokens.edge, backgroundColor: selected ? tokens.accentSoft : tokens.surface },
            ]}
          >
            <Text style={[styles.label, { color: selected ? tokens.accentInk : tokens.ink }]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 0,
  },
  row: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  label: {
    fontSize: 13.5,
    fontWeight: '600',
  },
});
