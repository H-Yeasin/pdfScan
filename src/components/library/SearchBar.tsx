import { StyleSheet, TextInput } from 'react-native';
import { radii, spacing, useTheme } from '../../theme';

type SearchBarProps = {
  value: string;
  onChange: (value: string) => void;
};

export function SearchBar({ value, onChange }: SearchBarProps) {
  const { tokens } = useTheme();

  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder="Search names and text inside scans"
      placeholderTextColor={tokens.muted}
      autoFocus
      style={[
        styles.input,
        { borderColor: tokens.edge, backgroundColor: tokens.surface, color: tokens.ink },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    height: 48,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.full,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 15,
  },
});
