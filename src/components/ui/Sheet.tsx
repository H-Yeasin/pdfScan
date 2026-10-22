import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '../../i18n/useT';
import { radii, spacing, useTheme } from '../../theme';
import { Text } from './Text';
import { Touchable } from './Touchable';

// §17 U3, its first part (built early by U7, like W23 built Menu): a bottom sheet with any content -
// a title, a scrolling body and a row of actions pinned under it. The scrim closes it, Android
// Back too (`onRequestClose`). The body sits in a KeyboardAvoidingView, so a field in it stays above
// the keyboard (§14 Q4). U3 adds drag-to-close and the snap points, and moves Menu onto it, without
// changing what callers pass.

export type SheetProps = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  // Pinned under the body (Cancel / Apply); it doesn't scroll away.
  footer?: ReactNode;
  testID?: string;
};

export function Sheet({ visible, onClose, title, children, footer, testID }: SheetProps) {
  const { tokens } = useTheme();
  const { t } = useT();
  const insets = useSafeAreaInsets();

  return (
    <Modal statusBarTranslucent navigationBarTranslucent transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Touchable
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          onPress={onClose}
          scale={false}
          ripple="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: tokens.scrim }]}
        />
        <View testID={testID} style={[styles.sheet, { backgroundColor: tokens.surface, paddingBottom: insets.bottom + spacing.md }]}>
          <View style={[styles.handle, { backgroundColor: tokens.edge }]} />
          {title ? (
            <Text variant="subtitle" style={styles.title} numberOfLines={2} accessibilityRole="header">
              {title}
            </Text>
          ) : null}
          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} bounces={false} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    paddingTop: spacing.xs,
    maxHeight: '90%',
  },
  handle: {
    width: 44,
    height: 4,
    borderRadius: radii.full,
    alignSelf: 'center',
    marginVertical: spacing.sm,
  },
  title: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  body: {
    flexGrow: 0,
  },
  bodyContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.md,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
});
