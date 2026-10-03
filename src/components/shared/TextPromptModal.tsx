import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View, type KeyboardTypeOptions } from 'react-native';
import { radii, spacing, useTheme } from '../../theme';
import { useT } from '../../i18n/useT';

type TextPromptModalProps = {
  visible: boolean;
  title: string;
  initialValue?: string;
  placeholder?: string;
  submitLabel?: string;
  keyboardType?: KeyboardTypeOptions;
  // §12 D10: several lines (a text box); Return makes a new line instead of submitting.
  multiline?: boolean;
  onCancel: () => void;
  onSubmit: (value: string) => void;
};

export function TextPromptModal({
  visible,
  title,
  initialValue = '',
  placeholder,
  submitLabel = 'Save',
  keyboardType,
  multiline = false,
  onCancel,
  onSubmit,
}: TextPromptModalProps) {
  const { tokens } = useTheme();
  const { t } = useT();
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (visible) setValue(initialValue);
  }, [visible, initialValue]);

  const trimmed = value.trim();

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel}>
      {/* §9 O6: on iOS the card moves up with the keyboard instead of sitting under it. */}
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.card, { backgroundColor: tokens.surface, borderColor: tokens.edge }]}>
          <Text style={[styles.title, { color: tokens.ink }]}>{title}</Text>
          <TextInput
            value={value}
            onChangeText={setValue}
            placeholder={placeholder}
            placeholderTextColor={tokens.muted}
            autoFocus
            keyboardType={keyboardType}
            multiline={multiline}
            returnKeyType={multiline ? 'default' : 'done'}
            onSubmitEditing={multiline ? undefined : () => trimmed && onSubmit(trimmed)}
            style={[styles.input, multiline && styles.multiline, { color: tokens.ink, backgroundColor: tokens.surface2, borderColor: tokens.edge }]}
          />
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" style={styles.ghostButton} onPress={onCancel}>
              <Text style={[styles.ghostLabel, { color: tokens.muted }]}>{t('common.cancel')}</Text>
            </Pressable>
            <Pressable accessibilityRole="button"
              style={[styles.primaryButton, { backgroundColor: tokens.accent, opacity: trimmed ? 1 : 0.5 }]}
              onPress={() => trimmed && onSubmit(trimmed)}
              disabled={!trimmed}
            >
              <Text style={[styles.primaryLabel, { color: tokens.onAccent }]}>{submitLabel}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
  },
  input: {
    height: 46,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    fontSize: 15,
  },
  multiline: {
    height: 120,
    paddingVertical: spacing.sm,
    textAlignVertical: 'top',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
  },
  ghostButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  ghostLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  primaryButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.full,
  },
  primaryLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
});
