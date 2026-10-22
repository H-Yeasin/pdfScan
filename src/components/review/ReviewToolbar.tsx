import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { useT } from '../../i18n/useT';
import { ICON_SIZE, ICONS, radii, spacing, useTheme, type IoniconName } from '../../theme';
import { BottomBar } from '../shared/BottomBar';
import { Text, Touchable } from '../ui';

// §17 U9: Review's one bottom toolbar. It took over from ContextBar (crop, rotate, retake, OCR,
// sign) and the Adjust toggle over the filter strip: the six things a page needs, the rest in More.
// Filter and Adjust open their panel above the bar (one at a time) and show as selected while open.

export type ReviewToolId = 'crop' | 'rotate' | 'filter' | 'adjust' | 'mode' | 'more';

type ReviewToolbarProps = {
  onPress: (id: ReviewToolId) => void;
  // The panel that is open above the bar.
  open: 'filter' | 'adjust' | null;
  // A filter with nothing to adjust (Original, B&W).
  adjustable: boolean;
  // While the mode is being re-applied, nothing else may change the pages.
  busy?: boolean;
};

const TOOLS: { id: ReviewToolId; icon: IoniconName }[] = [
  { id: 'crop', icon: ICONS.crop },
  { id: 'rotate', icon: ICONS.rotate },
  { id: 'filter', icon: ICONS.enhance },
  { id: 'adjust', icon: ICONS.adjust },
  { id: 'mode', icon: ICONS.scanMode },
  { id: 'more', icon: ICONS.more },
];

export function ReviewToolbar({ onPress, open, adjustable, busy = false }: ReviewToolbarProps) {
  const { tokens } = useTheme();
  const { t } = useT();

  return (
    <BottomBar backgroundColor={tokens.surface} style={[styles.bar, { borderTopColor: tokens.edge }]}>
      <View style={styles.row}>
        {TOOLS.map(({ id, icon }) => {
          const selected = open === id;
          const disabled = busy || (id === 'adjust' && !adjustable);
          const color = disabled ? tokens.edge : selected ? tokens.accentInk : tokens.ink;
          return (
            <Touchable
              key={id}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled }}
              disabled={disabled}
              onPress={() => onPress(id)}
              style={styles.item}
              testID={`review-tool-${id}`}
            >
              <View style={[styles.well, selected && { backgroundColor: tokens.accentSoft }]}>
                <Ionicons name={icon} size={ICON_SIZE.bar} color={color} />
              </View>
              <Text variant="caption" weight="semibold" color={color} numberOfLines={1} chrome>
                {t(`review.toolbar.${id}`)}
              </Text>
            </Touchable>
          );
        })}
      </View>
    </BottomBar>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  item: {
    flex: 1,
    minHeight: 60,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  well: {
    width: 48,
    height: 30,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
