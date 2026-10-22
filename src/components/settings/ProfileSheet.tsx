import * as ImagePicker from 'expo-image-picker';
import { StyleSheet, View } from 'react-native';
import { AppImage } from '../shared/AppImage';
import { NameField } from '../deliver/NameField';
import type { TKey } from '../../i18n';
import { useT } from '../../i18n/useT';
import { useAppDispatch, useAppSelector } from '../../store/AppStateContext';
import { institutionLogoUri, removeInstitutionLogo, saveInstitutionLogo } from '../../services/submit/institutionLogo';
import { radii, spacing, useTheme } from '../../theme';
import type { StudentProfile } from '../../types/models';
import { Button, Sheet, Text } from '../ui';

const FIELDS: { key: keyof StudentProfile; label: TKey; placeholder: TKey }[] = [
  { key: 'name', label: 'settings.profile.name', placeholder: 'settings.profile.namePlaceholder' },
  { key: 'roll', label: 'settings.profile.roll', placeholder: 'settings.profile.rollPlaceholder' },
  { key: 'section', label: 'settings.profile.sectionField', placeholder: 'settings.profile.sectionPlaceholder' },
  { key: 'institution', label: 'settings.profile.institution', placeholder: 'settings.profile.institutionPlaceholder' },
];

const LOGO = 48;

// §17 U10 (was Settings' Profile section): the student's details for §4 (file names, cover pages,
// footers) and the University cover's logo. Each keystroke is a settings/SET_PROFILE patch;
// useSettingsPersistence saves it like any other setting, so Done only closes.
export function ProfileSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { tokens } = useTheme();
  const { t } = useT();
  const dispatch = useAppDispatch();
  const profile = useAppSelector((s) => s.settings.profile);
  const institutionLogo = useAppSelector((s) => s.settings.institutionLogo);
  const logoUri = institutionLogoUri(institutionLogo);

  // §10 M4: adding a logo isn't Pro (it's the student's own data); only the cover that shows it is.
  const pickLogo = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (result.canceled || result.assets.length === 0) return;
    try {
      const name = await saveInstitutionLogo(result.assets[0].uri, institutionLogo);
      dispatch({ type: 'settings/SET_INSTITUTION_LOGO', name });
    } catch (error) {
      console.warn('ProfileSheet: could not save the logo', error);
      dispatch({ type: 'ui/SHOW_SNACK', msg: t('settings.profile.logoFailed') });
    }
  };
  const removeLogo = () => {
    removeInstitutionLogo(institutionLogo);
    dispatch({ type: 'settings/SET_INSTITUTION_LOGO', name: null });
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('settings.profile.sheetTitle')}
      footer={<Button label={t('common.done')} onPress={onClose} fullWidth testID="profile-sheet-done" />}
      testID="profile-sheet"
    >
      <View style={styles.body}>
        {FIELDS.map(({ key, label, placeholder }) => (
          <NameField
            key={key}
            label={t(label)}
            placeholder={t(placeholder)}
            value={profile[key]}
            onChange={(value) => dispatch({ type: 'settings/SET_PROFILE', profile: { [key]: value } })}
          />
        ))}
        <View style={[styles.logoRow, { backgroundColor: tokens.surface2 }]}>
          {logoUri ? (
            <AppImage uri={logoUri} bare contentFit="contain" style={styles.logo} accessibilityLabel={t('settings.profile.logoA11y')} />
          ) : null}
          <View style={styles.logoText}>
            <Text variant="bodyStrong">{t('settings.profile.logo')}</Text>
            <Text variant="caption" color="muted">
              {t('settings.profile.logoSubtitle')}
            </Text>
          </View>
          <View style={styles.logoActions}>
            <Button
              size="sm"
              variant="tonal"
              label={t(logoUri ? 'settings.profile.logoChange' : 'settings.profile.logoAdd')}
              onPress={() => void pickLogo()}
            />
            {logoUri ? <Button size="sm" variant="ghost" label={t('settings.profile.logoRemove')} onPress={removeLogo} /> : null}
          </View>
        </View>
        <Text variant="caption" color="muted">
          {t('settings.profile.footnote')}
        </Text>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.md,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.card,
  },
  logo: {
    width: LOGO,
    height: LOGO,
  },
  logoText: {
    flex: 1,
    gap: 2,
  },
  logoActions: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
});
