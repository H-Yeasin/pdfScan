import { StyleSheet, Text, View } from 'react-native';
import { NameField } from '../deliver/NameField';
import type { TKey } from '../../i18n';
import { useT } from '../../i18n/useT';
import { useAppState } from '../../store/AppStateContext';
import { spacing, useTheme } from '../../theme';
import type { StudentProfile } from '../../types/models';

const FIELDS: { key: keyof StudentProfile; label: TKey; placeholder: TKey }[] = [
  { key: 'name', label: 'settings.profile.name', placeholder: 'settings.profile.namePlaceholder' },
  { key: 'roll', label: 'settings.profile.roll', placeholder: 'settings.profile.rollPlaceholder' },
  { key: 'section', label: 'settings.profile.sectionField', placeholder: 'settings.profile.sectionPlaceholder' },
  { key: 'institution', label: 'settings.profile.institution', placeholder: 'settings.profile.institutionPlaceholder' },
];

// The student's details for §4 (file names, cover pages, footers). Each keystroke is a
// settings/SET_PROFILE patch; useSettingsPersistence saves it like any other setting.
export function ProfileSection() {
  const { tokens } = useTheme();
  const { t } = useT();
  const { state, dispatch } = useAppState();
  const { profile } = state.settings;

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionLabel, { color: tokens.muted }]}>{t('settings.profile.section')}</Text>
      {FIELDS.map(({ key, label, placeholder }) => (
        <NameField
          key={key}
          label={t(label)}
          placeholder={t(placeholder)}
          value={profile[key]}
          onChange={(value) => dispatch({ type: 'settings/SET_PROFILE', profile: { [key]: value } })}
        />
      ))}
      <Text style={[styles.footnote, { color: tokens.muted }]}>{t('settings.profile.footnote')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.md,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  footnote: {
    fontSize: 12.5,
    lineHeight: 17,
  },
});
