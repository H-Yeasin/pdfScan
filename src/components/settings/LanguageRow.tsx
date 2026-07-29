import { Pressable, StyleSheet, Text, View } from 'react-native';
import { spacing, useTheme } from '../../theme';

type LanguageRowProps = {
  name: string;
  selected: boolean;
  onPress: () => void;
};

export function LanguageRow({ name, selected, onPress }: LanguageRowProps) {
  const { tokens } = useTheme();

  return (
    <Pressable
      style={[styles.row, { borderBottomColor: tokens.edge }]}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
    >
      <Text style={[styles.name, { color: tokens.ink }]}>{name}</Text>
      <Text style={[styles.status, { color: selected ? tokens.accentInk : tokens.muted }]}>
        {selected ? 'Active' : 'Select'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  name: {
    fontSize: 15.5,
  },
  status: {
    fontSize: 13,
    fontWeight: '600',
  },
});
