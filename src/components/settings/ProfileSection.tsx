import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { NameField } from '../deliver/NameField';
import { isWinAnsiSafe } from '../../services/pdf/winAnsi';
import { useAppState } from '../../store/AppStateContext';
import { spacing, useTheme } from '../../theme';
import type { StudentProfile } from '../../types/models';

const FIELDS: { key: keyof StudentProfile; label: string; placeholder: string }[] = [
  { key: 'name', label: 'Full name', placeholder: 'e.g. Rahim Uddin' },
  { key: 'roll', label: 'Roll / student ID', placeholder: 'e.g. 2021331045' },
  { key: 'section', label: 'Section', placeholder: 'e.g. B' },
  { key: 'institution', label: 'Institution', placeholder: 'e.g. SUST' },
];

// The student's details for §4 (file names, cover pages, footers). Each keystroke is a
// settings/SET_PROFILE patch; useSettingsPersistence saves it like any other setting.
export function ProfileSection() {
  const { tokens } = useTheme();
  const { state, dispatch } = useAppState();
  const { profile } = state.settings;
  // Cover pages and footers are drawn with Helvetica until §6 adds fonts for other scripts, so
  // e.g. a Bengali name would come out as '?'. Say so now rather than on the first cover page.
  const hasUnsupported = FIELDS.some(({ key }) => !isWinAnsiSafe(profile[key]));

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionLabel, { color: tokens.muted }]}>Profile</Text>
      {FIELDS.map(({ key, label, placeholder }) => (
        <NameField
          key={key}
          label={label}
          placeholder={placeholder}
          value={profile[key]}
          onChange={(value) => dispatch({ type: 'settings/SET_PROFILE', profile: { [key]: value } })}
        />
      ))}
      {hasUnsupported ? (
        <View style={styles.hint}>
          <Ionicons name="information-circle-outline" size={16} color={tokens.ink} />
          <Text style={[styles.footnote, styles.hintText, { color: tokens.ink }]}>
            Cover pages show ? for some characters until full language support arrives.
          </Text>
        </View>
      ) : null}
      <Text style={[styles.footnote, { color: tokens.muted }]}>
        Stored only on this phone. Used for file names, cover pages and footers.
      </Text>
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
  hint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  hintText: {
    flex: 1,
  },
  footnote: {
    fontSize: 12.5,
    lineHeight: 17,
  },
});
