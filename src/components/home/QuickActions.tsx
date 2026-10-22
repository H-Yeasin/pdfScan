import { ScrollView, StyleSheet, View } from 'react-native';
import { useT } from '../../i18n/useT';
import { CAPTURE_MODES } from '../../services/capture/captureModes';
import { ICONS, spacing } from '../../theme';
import { useScanChoice } from '../capture/ScanModeSheet';
import { Chip } from '../ui';
import { HOME_GUTTER } from './layout';
import { SectionHeader } from './SectionHeader';

// §17 U6: "Scan as: Notes · Document · Board · Book · ID card", each scanning in that mode at once
// (and remembering it, like the Scan button's mode sheet), then Import photos and Import file. The
// first-time Scan hint stays on the tab bar's Scan button (U5).
export function QuickActions() {
  const { t } = useT();
  const choose = useScanChoice();
  return (
    <View>
      <SectionHeader title={t('home.scanAs')} />
      {/* Bleeds to the screen edges so the row scrolls under them, not inside the padding. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bleed} contentContainerStyle={styles.row}>
        {CAPTURE_MODES.map((spec) => (
          <Chip key={spec.id} label={t(spec.labelKey)} icon={spec.icon} onPress={() => choose(spec.id)} testID={`home-mode-${spec.id}`} />
        ))}
        <Chip label={t('capture.modeSheet.importPhotos')} icon={ICONS.gallery} onPress={() => choose('gallery')} testID="home-import-photos" />
        <Chip label={t('capture.modeSheet.importFile')} icon={ICONS.import} onPress={() => choose('file')} testID="home-import-file" />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  bleed: {
    marginHorizontal: -HOME_GUTTER,
  },
  row: {
    paddingHorizontal: HOME_GUTTER,
    gap: spacing.sm,
  },
});
