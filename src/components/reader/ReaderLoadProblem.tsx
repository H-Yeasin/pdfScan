import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '../../i18n/useT';
import { spacing, useTheme } from '../../theme';
import type { LoadProblem } from './useReaderDocument';

// §18 W6: what the Reader shows instead of, or over, a document it can't show (yet).

type NoticeProps = {
  // The heading, when the notice has one ("Files missing").
  title?: string;
  body: string;
  centered?: boolean;
  children?: ReactNode;
};

// A full-screen notice in place of the viewer: not found, files missing (§8 B1), the preview
// being prepared or failed (§18 W3), loading. `children`: its actions.
export function ReaderNotice({ title, body, centered, children }: NoticeProps) {
  const { tokens } = useTheme();
  return (
    <View style={[styles.notice, { backgroundColor: tokens.bg }]}>
      {title ? <Text style={[styles.title, { color: tokens.ink }]}>{title}</Text> : null}
      <Text style={[{ color: tokens.muted }, centered && styles.centered]}>{body}</Text>
      {children}
    </View>
  );
}

export function ReaderNoticeAction({ label, muted, onPress }: { label: string; muted?: boolean; onPress: () => void }) {
  const { tokens } = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8}>
      <Text style={[styles.action, { color: muted ? tokens.muted : tokens.accentInk }]}>{label}</Text>
    </Pressable>
  );
}

type ProblemProps = {
  loadProblem: LoadProblem;
  needsPassword: boolean;
  passwordDraft: string;
  onChangePassword: (value: string) => void;
  onSubmitPassword: () => void;
  onBack: () => void;
};

// §7 R4: the cards over a PDF the viewer couldn't load: "Can't open this file" (no password can
// help), or the password prompt.
export function ReaderLoadProblem({ loadProblem, needsPassword, passwordDraft, onChangePassword, onSubmitPassword, onBack }: ProblemProps) {
  const { tokens } = useTheme();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  return (
    <>
      {loadProblem === 'damaged' && (
        <View style={styles.overlay} pointerEvents="box-none">
          <View style={[styles.card, { backgroundColor: tokens.surface }]}>
            <Text style={[styles.title, { color: tokens.ink }]}>{t('reader.cantOpen')}</Text>
            <Text style={{ color: tokens.muted }}>{t('reader.cantOpenBody')}</Text>
            <View style={styles.actions}>
              <Pressable accessibilityRole="button" onPress={onBack}>
                <Text style={[styles.action, { color: tokens.accentInk }]}>{t('common.back')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {needsPassword && (
        // §18 W5 (§14 Q4's rule): the card moves up with the keyboard. The app is edge-to-edge,
        // so Android doesn't resize the window for it.
        <KeyboardAvoidingView
          style={[styles.overlay, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.lg }]}
          behavior="padding"
          pointerEvents="box-none"
        >
          <View style={[styles.card, { backgroundColor: tokens.surface }]}>
            <Text style={[styles.title, { color: tokens.ink }]}>
              {t('reader.passwordNeeded')}
            </Text>
            {loadProblem === 'wrongPassword' ? <Text style={{ color: tokens.danger }}>{t('reader.wrongPassword')}</Text> : null}
            <TextInput
              style={[styles.input, { color: tokens.ink, borderColor: tokens.edge }]}
              placeholder={t('reader.password')}
              placeholderTextColor={tokens.muted}
              secureTextEntry
              value={passwordDraft}
              onChangeText={onChangePassword}
              onSubmitEditing={onSubmitPassword}
            />
            <View style={styles.actions}>
              <Pressable accessibilityRole="button" onPress={onBack}>
                <Text style={{ color: tokens.muted }}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={onSubmitPassword}>
                <Text style={[styles.action, { color: tokens.accentInk }]}>{t('reader.unlock')}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  notice: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.xl,
  },
  centered: { textAlign: 'center' },
  action: { fontWeight: '600' },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 16,
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    height: 44,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.lg,
  },
});
