import { TextField } from '../ui';
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

// §17 U2: the document-name field, now the kit's TextField with Deliver's default label and
// placeholder (it was its own pill-shaped input).
export function NameField({ value, onChange, helperText, label, placeholder, onSelectionChange }: NameFieldProps) {
  const { t } = useT();
  return (
    <TextField
      value={value}
      onChangeText={onChange}
      label={label ?? t('deliver.nameLabel')}
      helper={helperText}
      placeholder={placeholder ?? t('deliver.namePlaceholder')}
      onSelectionChange={onSelectionChange ? (event) => onSelectionChange(event.nativeEvent.selection) : undefined}
      clearable
    />
  );
}
