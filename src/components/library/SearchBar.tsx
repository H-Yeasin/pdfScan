import { StyleSheet, TextInput } from 'react-native';
import { radii, spacing, useTheme } from '../../theme';
import { useT } from '../../i18n/useT';

type SearchBarProps = {
  value: string;
  onChange: (value: string) => void;
};

export function SearchBar({ value, onChange }: SearchBarProps) {
  const { tokens } = useTheme();
  const { t } = useT();

  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={t('library.searchPlaceholder')}
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
