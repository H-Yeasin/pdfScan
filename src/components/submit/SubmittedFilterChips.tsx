import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { radii, spacing, useTheme } from '../../theme';

export type SubmittedFilter = 'all' | 'submitted' | 'notSubmitted' | 'bookmarked';

const SUBMITTED_OPTIONS: { id: SubmittedFilter; label: string }[] = [
  { id: 'submitted', label: 'Submitted' },
  { id: 'notSubmitted', label: 'Not submitted' },
];

// Library filters: Submitted / Not submitted (§4 S7) once something has been submitted, and
// Bookmarked (§5 T5) once a page has been bookmarked.
export function SubmittedFilterChips({
  value,
  onChange,
  showSubmitted = true,
  showBookmarked = false,
}: {
  value: SubmittedFilter;
  onChange: (value: SubmittedFilter) => void;
  showSubmitted?: boolean;
  showBookmarked?: boolean;
}) {
  const { tokens } = useTheme();
  const options = [
    { id: 'all' as const, label: 'All' },
    ...(showSubmitted ? SUBMITTED_OPTIONS : []),
    ...(showBookmarked ? [{ id: 'bookmarked' as const, label: 'Bookmarked' }] : []),
  ];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} style={styles.scroll}>
      {options.map((option) => {
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
