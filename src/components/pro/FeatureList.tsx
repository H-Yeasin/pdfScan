import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { ICON_SIZE, ICONS, radii, spacing, useTheme, type IoniconName } from '../../theme';
import { useT } from '../../i18n/useT';
import { liveProFeatures, type ProFeatureId } from '../../services/pro/proFeatures';
import { Card, Text } from '../ui';

// What each Pro feature looks like on its tile. The action's own icon where there is one (ICONS),
// so a tile looks like the button it unlocks.
export const PRO_FEATURE_ICONS: Record<ProFeatureId, IoniconName> = {
  coverTemplates: ICONS.addCover,
  themeAccents: ICONS.theme,
  appLock: ICONS.lock,
  noBanners: ICONS.ads,
  pdfPasswords: 'key-outline',
  driveBackup: ICONS.backup,
  convert: ICONS.convertToPdf,
  editFiles: ICONS.editFile,
  pdfForms: ICONS.fillForm,
};

// §17 U11: what Pro includes, as tiles (an icon and one line each), two to a row. Live features
// only: a planned one is never offered as part of Pro.
export function FeatureList() {
  const { tokens } = useTheme();
  const { t } = useT();

  return (
    <View style={styles.grid}>
      {liveProFeatures().map((feature) => (
        <Card key={feature.id} style={styles.tile} testID={`pro-feature-${feature.id}`}>
          <View style={[styles.iconWell, { backgroundColor: tokens.highlightSoft }]}>
            <Ionicons name={PRO_FEATURE_ICONS[feature.id]} size={ICON_SIZE.row} color={tokens.highlightInk} />
          </View>
          <Text variant="label">{t(feature.labelKey)}</Text>
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  // Two to a row: half the width less half the gap.
  tile: {
    flexBasis: '47%',
    flexGrow: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  iconWell: {
    width: 36,
    height: 36,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
