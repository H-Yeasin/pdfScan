import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { radii, spacing, useTheme } from '../../theme';

type TextPromptModalProps = {
  visible: boolean;
  title: string;
  initialValue?: string;
  placeholder?: string;
  submitLabel?: string;
  onCancel: () => void;
  onSubmit: (value: string) => void;
};

export function TextPromptModal({
  visible,
  title,
  initialValue = '',
  placeholder,
  submitLabel = 'Save',
  onCancel,
  onSubmit,
}: TextPromptModalProps) {
  const { tokens } = useTheme();
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (visible) setValue(initialValue);
  }, [visible, initialValue]);

  const trimmed = value.trim();

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: tokens.surface, borderColor: tokens.edge }]}>
          <Text style={[styles.title, { color: tokens.ink }]}>{title}</Text>
          <TextInput
            value={value}
            onChangeText={setValue}
            placeholder={placeholder}
            placeholderTextColor={tokens.muted}
            autoFocus
            style={[styles.input, { color: tokens.ink, backgroundColor: tokens.surface2, borderColor: tokens.edge }]}
          />
          <View style={styles.actions}>
            <Pressable style={styles.ghostButton} onPress={onCancel}>
              <Text style={[styles.ghostLabel, { color: tokens.muted }]}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.primaryButton, { backgroundColor: tokens.accent, opacity: trimmed ? 1 : 0.5 }]}
              onPress={() => trimmed && onSubmit(trimmed)}
              disabled={!trimmed}
            >
              <Text style={styles.primaryLabel}>{submitLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
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
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
