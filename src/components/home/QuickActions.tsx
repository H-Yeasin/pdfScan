import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { useT } from '../../i18n/useT';
import { CAPTURE_MODES } from '../../services/capture/captureModes';
import { useAppSelector } from '../../store/AppStateContext';
import { ICON_SIZE, ICONS, MIN_TOUCH, radii, spacing, useTheme } from '../../theme';
import { useScanChoice } from '../capture/ScanModeSheet';
import { Button, Card, Divider, Text, Touchable } from '../ui';

// The round well behind a mode's icon: bigger than a list row's (ICON_WELL) so the tiles read as
// actions, small enough that five fit side by side at 360 dp.
const MODE_WELL = 44;

// §17 U6: "Scan as", one card under the search bar: a tile per capture mode, all five in one row,
// then Import photos and Import a file. A tile scans in that mode at once and remembers it, like the
// Scan button's mode sheet. Revised 2026-10-30 (owner): it was a scrolling row of outline pills that
// looked like filters and went unnoticed. The remembered mode (settings.lastCaptureMode, what a
// plain tap on Scan uses) is drawn selected, so the card also says what the Scan button will do;
// the highlight follows the student's last pick. Selected is also bold and `selected` for TalkBack
// ("Notes, selected"), never colour alone. The first-time Scan hint stays on the tab bar's Scan button (U5).
export function QuickActions() {
  const { t } = useT();
  const { tokens } = useTheme();
  const choose = useScanChoice();
  const lastMode = useAppSelector((s) => s.settings.lastCaptureMode);
  return (
    <Card style={styles.card}>
      <View style={styles.modes}>
        {CAPTURE_MODES.map((spec) => {
          const selected = spec.id === lastMode;
          return (
            <Touchable
              key={spec.id}
              accessibilityRole="button"
              accessibilityLabel={t(spec.labelKey)}
              accessibilityState={{ selected }}
              onPress={() => choose(spec.id)}
              style={styles.tile}
              testID={`home-mode-${spec.id}`}
            >
              <View style={[styles.well, { backgroundColor: selected ? tokens.accent : tokens.accentSoft }]}>
                <Ionicons name={spec.icon} size={ICON_SIZE.bar} color={selected ? tokens.onAccent : tokens.accentInk} />
              </View>
              <Text
                variant="caption"
                weight={selected ? 'bold' : 'medium'}
                color={selected ? 'accentInk' : 'ink'}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
                chrome
              >
                {t(spec.labelKey)}
              </Text>
            </Touchable>
          );
        })}
      </View>
      <Divider />
      <View style={styles.imports}>
        <Button variant="ghost" size="sm" icon={ICONS.gallery} label={t('capture.modeSheet.importPhotos')} onPress={() => choose('gallery')} testID="home-import-photos" />
        <Button variant="ghost" size="sm" icon={ICONS.import} label={t('capture.modeSheet.importFile')} onPress={() => choose('file')} testID="home-import-file" />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  // Less side padding than a card's usual, so each of the five tiles gets about 62 dp at 360 dp.
  card: {
    paddingHorizontal: spacing.sm,
    gap: spacing.sm,
  },
  modes: {
    flexDirection: 'row',
  },
  tile: {
    flex: 1,
    minWidth: 0,
    minHeight: MIN_TOUCH,
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    borderRadius: radii.thumb,
  },
  well: {
    width: MODE_WELL,
    height: MODE_WELL,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imports: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
});
