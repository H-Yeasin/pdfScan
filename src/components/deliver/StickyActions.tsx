import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { radii, spacing, useTheme } from '../../theme';
import { useT } from '../../i18n/useT';

type StickyActionsProps = {
  saving: boolean;
  // Shown under the Save button while saving (e.g. "Preparing page 3 of 10…").
  progress?: string | null;
  // §4 S6: save, build the teacher's copy and open the share sheet, in one tap.
  onSubmit: () => void;
  onSave: () => void;
  onSaveShare: () => void;
};

export function StickyActions({ saving, progress, onSubmit, onSave, onSaveShare }: StickyActionsProps) {
  const { tokens } = useTheme();
  const { t } = useT();

  return (
    <View style={[styles.container, { backgroundColor: tokens.bg }]}>
      <Pressable accessibilityRole="button"
        style={[styles.primary, { backgroundColor: tokens.accent, opacity: saving ? 0.7 : 1 }]}
        onPress={onSubmit}
        disabled={saving}
        accessibilityLabel={t('deliver.actions.submitA11y')}
      >
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryLabel}>{t('deliver.actions.submit')}</Text>}
      </Pressable>
      {saving && progress ? (
        <Text style={[styles.progress, { color: tokens.muted }]} accessibilityLiveRegion="polite">
          {progress}
        </Text>
      ) : null}
      <View style={styles.secondaryRow}>
        <Pressable accessibilityRole="button" style={styles.ghost} onPress={onSave} disabled={saving}>
          <Text style={[styles.ghostLabel, { color: tokens.accentInk }]}>{t('deliver.actions.save')}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" style={styles.ghost} onPress={onSaveShare} disabled={saving}>
          <Text style={[styles.ghostLabel, { color: tokens.accentInk }]}>{t('deliver.actions.saveShare')}</Text>
        </Pressable>
      </View>
      {Platform.OS === 'ios' && (
        <Text style={[styles.shareHint, { color: tokens.muted }]}>
          {t('deliver.actions.shareHintIos')}
        </Text>
      )}
      <Text style={[styles.footnote, { color: tokens.muted }]}>{t('deliver.actions.footnote')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    paddingTop: spacing.md,
  },
  primary: {
    height: 52,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  progress: {
    textAlign: 'center',
    fontSize: 13,
    marginTop: spacing.sm,
  },
  secondaryRow: {
    flexDirection: 'row',
  },
  ghost: {
    flex: 1,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  shareHint: {
    textAlign: 'center',
    fontSize: 12,
    marginTop: 2,
  },
  footnote: {
    textAlign: 'center',
    fontSize: 12.5,
    marginTop: 2,
  },
});
