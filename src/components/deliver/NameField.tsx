import { StyleSheet, Text, TextInput, View } from 'react-native';
import { radii, spacing, useTheme } from '../../theme';

type NameFieldProps = {
  value: string;
  onChange: (value: string) => void;
  helperText?: string;
  label?: string;
  placeholder?: string;
};

export function NameField({ value, onChange, helperText, label = 'Name', placeholder = 'Untitled scan' }: NameFieldProps) {
  const { tokens } = useTheme();

  return (
    <View>
      <Text style={[styles.label, { color: tokens.ink }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        style={[
          styles.input,
          { borderColor: tokens.edge, backgroundColor: tokens.surface, color: tokens.ink },
        ]}
        placeholder={placeholder}
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
