import { Ionicons } from '@expo/vector-icons';
import { useState, type Ref } from 'react';
import { StyleSheet, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { useT } from '../../i18n/useT';
import { ICON_SIZE, ICONS, radii, spacing, typeScale, useTheme, type IoniconName } from '../../theme';
import { Text } from './Text';
import { Touchable } from './Touchable';

// §17 U2: the one text field (it was a pill in NameField, 12 in TextPromptModal, 10 in the Reader).
// A label above, the box (radius `input`), then the helper or, in its place, the error in danger red,
// announced politely. The focus ring is the accent at 2 dp; an error keeps the danger border.
//
// Keyboard insets (§14 Q4) are the container's job, not the field's: a field in a sheet sits in
// the sheet's KeyboardAvoidingView (U3's Sheet), a field on a screen in a ScrollView with
// keyboardShouldPersistTaps="handled", so the clear button works while the keyboard is up.

export type TextFieldProps = Omit<TextInputProps, 'style' | 'placeholderTextColor' | 'onChange' | 'onChangeText'> & {
  value: string;
  onChangeText: (value: string) => void;
  label?: string;
  helper?: string;
  error?: string;
  icon?: IoniconName;
  // Draws a clear (×) button while the field has text.
  clearable?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  ref?: Ref<TextInput>;
};

export const FIELD_HEIGHT = 52;

export function TextField({
  value,
  onChangeText,
  label,
  helper,
  error,
  icon,
  clearable = false,
  multiline,
  editable = true,
  containerStyle,
  onFocus,
  onBlur,
  accessibilityLabel,
  ref,
  ...rest
}: TextFieldProps) {
  const { tokens } = useTheme();
  const { t } = useT();
  const [focused, setFocused] = useState(false);
  const border = error ? tokens.danger : focused ? tokens.accent : tokens.edge;
  // The 2 dp ring takes its extra dp from the padding, so the text doesn't shift on focus.
  const thick = focused || !!error;

  return (
    <View style={containerStyle}>
      {label ? (
        <Text variant="label" style={styles.label} importantForAccessibility="no" accessibilityElementsHidden>
          {label}
        </Text>
      ) : null}
      <View
        style={[
          styles.box,
          multiline ? styles.multiline : { height: FIELD_HEIGHT },
          { borderColor: border, borderWidth: thick ? 2 : 1, paddingHorizontal: spacing.lg - (thick ? 1 : 0), backgroundColor: tokens.surface, opacity: editable ? 1 : 0.6 },
        ]}
      >
        {icon ? <Ionicons name={icon} size={ICON_SIZE.row} color={tokens.muted} /> : null}
        <TextInput
          {...rest}
          ref={ref}
          value={value}
          onChangeText={onChangeText}
          multiline={multiline}
          editable={editable}
          accessibilityLabel={accessibilityLabel ?? label}
          accessibilityHint={error ?? helper ?? rest.accessibilityHint}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          placeholderTextColor={tokens.muted}
          selectionColor={tokens.accent}
          cursorColor={tokens.accent}
          style={[styles.input, { color: tokens.ink }, multiline && styles.inputMultiline]}
        />
        {clearable && value && editable ? (
          <Touchable accessibilityRole="button" accessibilityLabel={t('ui.clearField')} onPress={() => onChangeText('')} rippleRadius={20} style={styles.clear}>
            <Ionicons name={ICONS.close} size={ICON_SIZE.row} color={tokens.muted} />
          </Touchable>
        ) : null}
      </View>
      {error ? (
        <Text variant="caption" color="danger" style={styles.below} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : helper ? (
        <Text variant="caption" color="muted" style={styles.below}>
          {helper}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    marginBottom: spacing.sm,
  },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radii.input,
  },
  multiline: {
    minHeight: 104,
    alignItems: 'flex-start',
    paddingVertical: spacing.md,
  },
  input: {
    flex: 1,
    alignSelf: 'stretch',
    padding: 0,
    fontFamily: typeScale.body.fontFamily,
    fontSize: typeScale.body.fontSize,
  },
  inputMultiline: {
    textAlignVertical: 'top',
    minHeight: 80,
  },
  clear: {
    width: 32,
    height: 32,
    marginRight: -spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  below: {
    marginTop: spacing.xs,
  },
});
