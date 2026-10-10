import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useT } from '../../../i18n/useT';
import { CHROME_MAX_FONT_SCALE, MIN_TOUCH, radii, spacing, useTheme } from '../../../theme';

type SignBarProps = {
  onCancel: () => void;
  // Draw the signature again (left out when there is nothing to draw with).
  onRedraw?: () => void;
  // Back to where a signature usually goes, without dragging (§9 O4b).
  onBottomRight: () => void;
  onPlace: () => void;
  // The bar's height with the safe area under it: the surface keeps the last page clear of it.
  onHeight: (height: number) => void;
};

// §18 W16 (A10): the bar while a signature is being placed on the page, where the Reader's
// bottom bar was: how to move it, and Cancel · Redraw · Bottom right · Place. The signature
// itself is on the page (SurfaceOverlay), at the zoom and place the page is read at.
export function SignBar({ onCancel, onRedraw, onBottomRight, onPlace, onHeight }: SignBarProps) {
  const { tokens } = useTheme();
  const { t } = useT();
  const ghost = (label: string, onPress: () => void) => (
    <Pressable accessibilityRole="button" style={styles.item} onPress={onPress}>
      <Text maxFontSizeMultiplier={CHROME_MAX_FONT_SCALE} style={[styles.label, { color: tokens.accentInk }]}>
        {label}
      </Text>
    </Pressable>
  );
  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.wrap} pointerEvents="box-none" onLayout={(e: LayoutChangeEvent) => onHeight(e.nativeEvent.layout.height)}>
      <View style={[styles.bar, { backgroundColor: tokens.surface, borderColor: tokens.edge }]}>
        <Text maxFontSizeMultiplier={CHROME_MAX_FONT_SCALE} style={[styles.hint, { color: tokens.muted }]} numberOfLines={2}>
          {t('shared.signature.placeHint')}
        </Text>
        <View style={styles.row}>
          {ghost(t('common.cancel'), onCancel)}
          {onRedraw ? ghost(t('shared.signature.redraw'), onRedraw) : null}
          {ghost(t('shared.signature.bottomRight'), onBottomRight)}
          <Pressable accessibilityRole="button" style={[styles.place, { backgroundColor: tokens.accent }]} onPress={onPlace}>
            <Text maxFontSizeMultiplier={CHROME_MAX_FONT_SCALE} style={[styles.label, { color: tokens.onAccent }]}>
              {t('shared.signature.placeHere')}
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  bar: {
    marginHorizontal: spacing.sm,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 4,
  },
  hint: { fontSize: 12.5, textAlign: 'center' },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end' },
  item: { minHeight: MIN_TOUCH, minWidth: MIN_TOUCH, paddingHorizontal: spacing.sm + 2, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 14, fontWeight: '600' },
  place: { minHeight: 38, paddingHorizontal: spacing.md, marginLeft: spacing.xs, borderRadius: radii.full, alignItems: 'center', justifyContent: 'center' },
});
