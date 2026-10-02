import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NameField } from './NameField';
import { radii, spacing, useTheme } from '../../theme';
import { useT } from '../../i18n/useT';
import type { StudentProfile } from '../../types/models';

type ProfilePromptSheetProps = {
  visible: boolean;
  initial: StudentProfile;
  // The typed name and roll, or null for Skip. Either way the submit goes ahead.
  onDone: (patch: Pick<StudentProfile, 'name' | 'roll'> | null) => void;
  onCancel: () => void;
};

// Asked once, on the first Submit without a profile: the two fields the file name and cover need.
// The rest of the profile is in Settings.
export function ProfilePromptSheet({ visible, initial, onDone, onCancel }: ProfilePromptSheetProps) {
  const { tokens } = useTheme();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(initial.name);
  const [roll, setRoll] = useState(initial.roll);

  useEffect(() => {
    if (!visible) return;
    setName(initial.name);
    setRoll(initial.roll);
  }, [visible, initial.name, initial.roll]);

  const filled = name.trim() !== '' || roll.trim() !== '';

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onCancel}>
      <Pressable accessibilityRole="button" style={styles.backdrop} onPress={onCancel} accessibilityLabel={t('deliver.profilePrompt.close')} />
      <View style={[styles.sheet, { backgroundColor: tokens.surface, paddingBottom: insets.bottom + spacing.lg }]}>
        <Text style={[styles.title, { color: tokens.ink }]}>{t('deliver.profilePrompt.title')}</Text>
        <Text style={[styles.body, { color: tokens.muted }]}>
          {t('deliver.profilePrompt.body')}
        </Text>
        <NameField label={t('settings.profile.name')} value={name} onChange={setName} placeholder={t('settings.profile.namePlaceholder')} />
        <NameField label={t('settings.profile.roll')} value={roll} onChange={setRoll} placeholder={t('settings.profile.rollPlaceholder')} />
        <View style={styles.actions}>
          <Pressable style={styles.ghost} onPress={() => onDone(null)} accessibilityRole="button">
            <Text style={[styles.ghostLabel, { color: tokens.muted }]}>{t('deliver.profilePrompt.skip')}</Text>
          </Pressable>
          <Pressable
            style={[styles.primary, { backgroundColor: tokens.accent, opacity: filled ? 1 : 0.5 }]}
            onPress={() => filled && onDone({ name: name.trim(), roll: roll.trim() })}
            disabled={!filled}
            accessibilityRole="button"
          >
            <Text style={[styles.primaryLabel, { color: tokens.onAccent }]}>{t('deliver.profilePrompt.saveAndSubmit')}</Text>
          </Pressable>
        </View>
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
    borderTopLeftRadius: radii.card * 2,
    borderTopRightRadius: radii.card * 2,
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  body: {
    fontSize: 13.5,
    lineHeight: 19,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  ghost: {
    height: 48,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  primary: {
    flex: 1,
    height: 48,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
});
