import { StyleSheet, Text, View } from 'react-native';
import { spacing, useTheme } from '../../theme';

type LanguageRowProps = {
  name: string;
  status: string;
  available: boolean;
};

export function LanguageRow({ name, status, available }: LanguageRowProps) {
  const { tokens } = useTheme();

  return (
    <View style={[styles.row, { borderBottomColor: tokens.edge }]}>
      <Text style={[styles.name, { color: available ? tokens.ink : tokens.muted }]}>{name}</Text>
      <Text style={[styles.status, { color: available ? tokens.accentInk : tokens.muted }]}>{status}</Text>
    </View>
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
