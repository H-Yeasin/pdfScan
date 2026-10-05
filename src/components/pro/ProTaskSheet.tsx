import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '../../i18n/useT';
import type { AdUnavailableReason } from '../../services/ads/rewarded';
import type { ProTaskFeature } from '../../services/pro/proTask';
import { useRemoteConfig } from '../../services/remote/remoteConfig';
import { fontFamily, radii, spacing, useTheme } from '../../theme';

type ProTaskSheetProps = {
  // null: closed.
  task: { feature: ProTaskFeature; title: string } | null;
  // §14 Q1: the last ad couldn't show, and why. The sheet then says so, and Watch becomes Try
  // again (the same request).
  error?: AdUnavailableReason;
  onWatch: () => void;
  onGetPass: () => void;
  // Only for `error === 'consent'`: the consent form's privacy options.
  onAdChoices?: () => void;
  onClose: () => void;
};

// §12 D1: shown before a Pro task for a student without a Pro pass or an unlocked session. One
// choice to make: watch a short ad for this task, or the Pro pass (the Pro screen) for no ads.
// The hook (useProTask) closes it before the ad goes on screen: an ad shown over an open modal
// can fail or leave the modal stuck.
export function ProTaskSheet({ task, error, onWatch, onGetPass, onAdChoices, onClose }: ProTaskSheetProps) {
  const { tokens } = useTheme();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const { editUnlockMinutes, passHours } = useRemoteConfig();
  const feature = task?.feature ?? 'convert';
  const body = error
    ? t(`pro.task.adUnavailable.${error}`)
    : feature === 'convert'
      ? t('pro.task.body.convert')
      : t(`pro.task.body.${feature}`, { count: editUnlockMinutes });

  return (
    <Modal statusBarTranslucent navigationBarTranslucent transparent visible={task !== null} animationType="fade" onRequestClose={onClose}>
      <Pressable accessibilityRole="button" style={styles.backdrop} onPress={onClose} accessibilityLabel={t('common.close')}>
        <Pressable
          accessibilityRole="none"
          style={[styles.sheet, { backgroundColor: tokens.surface, paddingBottom: insets.bottom + spacing.lg }]}
          onPress={() => {}}
        >
          <View style={[styles.handle, { backgroundColor: tokens.edge }]} />
          <Text accessibilityRole="header" numberOfLines={2} style={[styles.title, { color: tokens.ink }]}>
            {error ? t('pro.task.adUnavailable.title') : t(`pro.task.title.${feature}`, { name: task?.title ?? '' })}
          </Text>
          <Text style={[styles.body, { color: tokens.muted }]}>{body}</Text>
          <Pressable accessibilityRole="button" style={[styles.primary, { backgroundColor: tokens.accent }]} onPress={onWatch}>
            <Ionicons name={error ? 'refresh' : 'play-circle-outline'} size={20} color={tokens.onAccent} />
            <Text style={[styles.primaryLabel, { color: tokens.onAccent }]}>{error ? t('pro.task.tryAgain') : t('pro.task.watch')}</Text>
          </Pressable>
          {error === 'consent' && onAdChoices ? (
            <Pressable accessibilityRole="button" style={[styles.secondary, { borderColor: tokens.edge }]} onPress={onAdChoices}>
              <Text style={[styles.secondaryLabel, { color: tokens.ink }]}>{t('pro.task.adChoices')}</Text>
            </Pressable>
          ) : null}
          <Pressable accessibilityRole="button" style={[styles.secondary, { borderColor: tokens.edge }]} onPress={onGetPass}>
            <Text style={[styles.secondaryLabel, { color: tokens.ink }]}>{t('pro.task.getPass', { count: passHours })}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: radii.card * 2,
    borderTopRightRadius: radii.card * 2,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  handle: {
    width: 44,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginVertical: spacing.sm,
  },
  title: {
    fontFamily: fontFamily.heading,
    fontSize: 18,
  },
  body: {
    fontSize: 14.5,
    lineHeight: 20,
  },
  primary: {
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  primaryLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  secondary: {
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.full,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
});
