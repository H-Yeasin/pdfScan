import { StyleSheet, Text, TextInput, View } from 'react-native';
import { radii, spacing, useTheme } from '../../theme';
import { useT } from '../../i18n/useT';

type NameFieldProps = {
  value: string;
  onChange: (value: string) => void;
  helperText?: string;
  label?: string;
  placeholder?: string;
  // For callers that insert text at the cursor (the naming template's token chips).
  onSelectionChange?: (selection: { start: number; end: number }) => void;
};

export function NameField({
  value,
  onChange,
  helperText,
  label,
  placeholder,
  onSelectionChange,
}: NameFieldProps) {
  const { tokens } = useTheme();
  const { t } = useT();

  return (
    <View>
      <Text style={[styles.label, { color: tokens.ink }]}>{label ?? t('deliver.nameLabel')}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        onSelectionChange={onSelectionChange ? (event) => onSelectionChange(event.nativeEvent.selection) : undefined}
        style={[
          styles.input,
          { borderColor: tokens.edge, backgroundColor: tokens.surface, color: tokens.ink },
        ]}
        placeholder={placeholder ?? t('deliver.namePlaceholder')}
        placeholderTextColor={tokens.muted}
      />
      {helperText ? <Text style={[styles.helper, { color: tokens.muted }]}>{helperText}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  input: {
    height: 52,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.full,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 16,
  },
  helper: {
    marginTop: spacing.xs,
    fontSize: 13,
  },
});
