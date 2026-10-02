import * as ImagePicker from 'expo-image-picker';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { NameField } from '../deliver/NameField';
import type { TKey } from '../../i18n';
import { useT } from '../../i18n/useT';
import { useAppDispatch, useAppSlices } from '../../store/AppStateContext';
import { institutionLogoUri, removeInstitutionLogo, saveInstitutionLogo } from '../../services/submit/institutionLogo';
import { radii, spacing, touchSlop, useTheme } from '../../theme';
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
  const dispatch = useAppDispatch();
  const state = useAppSlices('settings');
  const { profile, institutionLogo } = state.settings;
  const logoUri = institutionLogoUri(institutionLogo);

  // §10 M4: the University cover's logo. Adding one isn't Pro (it's the student's own data);
  // only the cover that shows it is.
  const pickLogo = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (result.canceled || result.assets.length === 0) return;
    try {
      const name = await saveInstitutionLogo(result.assets[0].uri, institutionLogo);
      dispatch({ type: 'settings/SET_INSTITUTION_LOGO', name });
    } catch (error) {
      console.warn('ProfileSection: could not save the logo', error);
      dispatch({ type: 'ui/SHOW_SNACK', msg: t('settings.profile.logoFailed') });
    }
  };
  const removeLogo = () => {
    removeInstitutionLogo(institutionLogo);
    dispatch({ type: 'settings/SET_INSTITUTION_LOGO', name: null });
  };

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
      <View style={[styles.logoRow, { backgroundColor: tokens.surface, borderColor: tokens.edge }]}>
        {logoUri ? (
          <Image source={{ uri: logoUri }} resizeMode="contain" style={styles.logo} accessibilityLabel={t('settings.profile.logoA11y')} />
        ) : null}
        <View style={styles.logoText}>
          <Text style={[styles.logoTitle, { color: tokens.ink }]}>{t('settings.profile.logo')}</Text>
          <Text style={[styles.footnote, { color: tokens.muted }]}>{t('settings.profile.logoSubtitle')}</Text>
          {logoUri ? (
            <Pressable accessibilityRole="button" hitSlop={touchSlop(32)} onPress={removeLogo}>
              <Text style={[styles.link, { color: tokens.danger }]}>{t('settings.profile.logoRemove')}</Text>
            </Pressable>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => void pickLogo()}
          style={[styles.logoButton, { borderColor: tokens.edge, backgroundColor: tokens.surface2 }]}
        >
          <Text style={[styles.link, { color: tokens.accentInk }]}>{t(logoUri ? 'settings.profile.logoChange' : 'settings.profile.logoAdd')}</Text>
        </Pressable>
      </View>
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
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  logo: {
    width: 48,
    height: 48,
  },
  logoText: {
    flex: 1,
    gap: 4,
  },
  logoTitle: {
    fontSize: 15.5,
  },
  logoButton: {
    minHeight: 40,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.full,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  link: {
    fontSize: 14,
    fontWeight: '600',
  },
});
