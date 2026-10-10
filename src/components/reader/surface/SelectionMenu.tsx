import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useT } from '../../../i18n/useT';
import { MENU_MARGIN, menuPosition, type Band, type SelectionMenuItem } from '../../../services/reader/selection';
import type { ContentRect, Size } from '../../../services/reader/surfaceGeometry';
import { CHROME_MAX_FONT_SCALE, MIN_TOUCH, radii, spacing, useTheme } from '../../../theme';
import type { SurfaceMotion } from './useSurfaceView';

type SelectionMenuProps = {
  items: readonly SelectionMenuItem[];
  // What the menu belongs to, in content coordinates: the selection's bounds, or the point of a
  // long press on a page without text (no size).
  anchor: ContentRect;
  motion: SurfaceMotion;
  // The part of the viewport the bars leave free.
  band: Band;
  // The item that is working (Run OCR): it shows a spinner and takes no second press.
  busy?: SelectionMenuItem | null;
  onPick: (item: SelectionMenuItem) => void;
};

// §18 W13 (A8): the selection's menu. It floats above the selected words (under them when there
// is no room), follows them through every scroll and zoom on the UI thread, and never leaves the
// band between the bars (services/reader/selection.menuPosition). On a narrow screen its buttons
// wrap onto a second row, and the measured size is what is clamped.
export function SelectionMenu({ items, anchor, motion, band, busy = null, onPick }: SelectionMenuProps) {
  const { tokens } = useTheme();
  const { t } = useT();
  const { scale, tx, ty } = motion;
  const [size, setSize] = useState<Size | null>(null);
  const style = useAnimatedStyle(() => {
    // Not placed before it is measured.
    if (!size) return { opacity: 0, transform: [{ translateX: band.left }, { translateY: band.top }] };
    const at = menuPosition(
      { x: anchor.x * scale.value + tx.value, y: anchor.y * scale.value + ty.value, width: anchor.width * scale.value, height: anchor.height * scale.value },
      size,
      band
    );
    return { opacity: 1, transform: [{ translateX: at.x }, { translateY: at.y }] };
  }, [anchor, size, band]);

  if (!items.length) return null;
  return (
    <Animated.View
      accessibilityRole="menu"
      accessibilityLabel={t('reader.select.menu')}
      style={[styles.menu, { maxWidth: band.right - band.left - 2 * MENU_MARGIN, backgroundColor: tokens.surface, borderColor: tokens.edge }, style]}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setSize((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
      }}
    >
      {items.map((item) => (
        <Pressable
          key={item}
          accessibilityRole="menuitem"
          accessibilityState={{ busy: busy === item }}
          disabled={busy === item}
          style={styles.item}
          onPress={() => onPick(item)}
        >
          {busy === item ? (
            <ActivityIndicator color={tokens.accentInk} />
          ) : (
            <Text maxFontSizeMultiplier={CHROME_MAX_FONT_SCALE} style={[styles.label, { color: tokens.accentInk }]}>
              {t(`reader.select.${item}`)}
            </Text>
          )}
        </Pressable>
      ))}
    </Animated.View>
  );
}

type SelectBarProps = {
  // The page being read has no words (null: not known yet), and whether OCR can be run on it.
  hasText: boolean | null;
  canOcr: boolean;
  rerunning: boolean;
  // The bottom bar's height: this rests just above it.
  bottom: number;
  onRunOcr: () => void;
  onDone: () => void;
};

// The "Select text" tool's bar, above the bottom bar for as long as the tool is on: how to
// select, or that this page has nothing to select (and Run OCR where a page image can be read),
// and Done.
export function SelectBar({ hasText, canOcr, rerunning, bottom, onRunOcr, onDone }: SelectBarProps) {
  const { tokens } = useTheme();
  const { t } = useT();
  const noText = hasText === false;
  return (
    <View style={[styles.bar, { bottom: bottom + spacing.sm, backgroundColor: tokens.surface, borderColor: tokens.edge }]}>
      <Text maxFontSizeMultiplier={CHROME_MAX_FONT_SCALE} style={[styles.hint, { color: tokens.ink }]} numberOfLines={3}>
        {noText ? t('reader.select.none') : t('reader.select.surfaceHint')}
      </Text>
      {noText && canOcr ? (
        <Pressable accessibilityRole="button" accessibilityState={{ busy: rerunning }} disabled={rerunning} style={styles.item} onPress={onRunOcr}>
          {rerunning ? (
            <ActivityIndicator color={tokens.accentInk} />
          ) : (
            <Text maxFontSizeMultiplier={CHROME_MAX_FONT_SCALE} style={[styles.label, { color: tokens.accentInk }]}>
              {t('reader.select.runOcr')}
            </Text>
          )}
        </Pressable>
      ) : null}
      <Pressable accessibilityRole="button" style={styles.item} onPress={onDone}>
        <Text maxFontSizeMultiplier={CHROME_MAX_FONT_SCALE} style={[styles.label, { color: tokens.accentInk }]}>
          {t('reader.select.done')}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  menu: {
    position: 'absolute',
    left: 0,
    top: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 6,
  },
  item: {
    minHeight: MIN_TOUCH,
    minWidth: MIN_TOUCH,
    paddingHorizontal: spacing.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 14, fontWeight: '600' },
  bar: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 4,
  },
  hint: { flex: 1, fontSize: 13, lineHeight: 18, paddingVertical: spacing.sm },
});
