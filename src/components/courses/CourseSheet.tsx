import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fontFamily, radii, spacing, useTheme } from '../../theme';
import { useT } from '../../i18n/useT';

type CourseSheetProps = {
  visible: boolean;
  title: string;
  submitLabel: string;
  submitDisabled?: boolean;
  onSubmit: () => void;
  onClose: () => void;
  children: ReactNode;
};

// The bottom-sheet frame both course sheets share: title, a scrolling form, and Cancel / submit
// pinned under it so the main action stays reachable with the keyboard up.
export function CourseSheet({ visible, title, submitLabel, submitDisabled, onSubmit, onClose, children }: CourseSheetProps) {
  const { tokens } = useTheme();
  const { t } = useT();
  const insets = useSafeAreaInsets();

  return (
    <Modal statusBarTranslucent navigationBarTranslucent transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <Pressable accessibilityRole="button" style={styles.backdrop} onPress={onClose} accessibilityLabel={t('common.close')} />
        <View
          style={[
            styles.sheet,
            { backgroundColor: tokens.surface, borderColor: tokens.edge, paddingBottom: spacing.md + insets.bottom },
          ]}
        >
          <Text style={[styles.title, { color: tokens.ink }]}>{title}</Text>
          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          <View style={styles.actions}>
            <Pressable style={styles.ghostButton} onPress={onClose} accessibilityRole="button">
              <Text style={[styles.ghostLabel, { color: tokens.muted }]}>{t('common.cancel')}</Text>
            </Pressable>
            <Pressable
              style={[styles.primaryButton, { backgroundColor: tokens.accent, opacity: submitDisabled ? 0.5 : 1 }]}
              onPress={onSubmit}
              disabled={submitDisabled}
              accessibilityRole="button"
            >
              <Text style={[styles.primaryLabel, { color: tokens.onAccent }]}>{submitLabel}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// Section label + content, the building block of both forms.
export function SheetField({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  const { tokens } = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: tokens.muted }]}>{label}</Text>
      {children}
      {error ? <Text style={[styles.error, { color: tokens.danger }]}>{error}</Text> : null}
    </View>
  );
}

export const sheetInputStyle = {
  height: 46,
  borderRadius: radii.card,
  borderWidth: StyleSheet.hairlineWidth,
  paddingHorizontal: spacing.md,
  fontSize: 15,
} as const;

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,.5)',
  },
  sheet: {
    borderTopLeftRadius: radii.card * 1.5,
    borderTopRightRadius: radii.card * 1.5,
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    maxHeight: '88%',
  },
  title: {
    fontFamily: fontFamily.heading,
    fontSize: 22,
  },
  body: {
    flexGrow: 0,
  },
  bodyContent: {
    gap: spacing.lg,
    paddingBottom: spacing.sm,
  },
  field: {
    gap: spacing.xs,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  error: {
    fontSize: 13,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
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
    paddingVertical: spacing.sm + 2,
    borderRadius: radii.full,
  },
  primaryLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
});
