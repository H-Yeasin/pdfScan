import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radii, spacing, useTheme } from '../../theme';
import { useT } from '../../i18n/useT';
import type { Submission } from '../../types/models';
import { SubmissionList } from './SubmissionList';

// The Reader's list of one document's submissions, opened from "Submitted 2× · …".
export function SubmissionsSheet({
  visible,
  submissions,
  onShareAgain,
  onClose,
}: {
  visible: boolean;
  submissions: readonly Submission[];
  onShareAgain: (submission: Submission) => void;
  onClose: () => void;
}) {
  const { tokens } = useTheme();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t('common.close')} />
      <View style={[styles.sheet, { backgroundColor: tokens.bg, paddingBottom: insets.bottom + spacing.lg }]}>
        <Text style={[styles.title, { color: tokens.ink }]}>{t('submit.submitted')}</Text>
        <ScrollView contentContainerStyle={styles.body}>
          <SubmissionList submissions={submissions} onShareAgain={onShareAgain} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,.4)',
  },
  sheet: {
    maxHeight: '70%',
    borderTopLeftRadius: radii.card * 2,
    borderTopRightRadius: radii.card * 2,
    paddingTop: spacing.lg,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  body: {
    paddingHorizontal: spacing.lg,
  },
});
