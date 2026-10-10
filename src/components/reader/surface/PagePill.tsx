import { useEffect } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { CHROME_MAX_FONT_SCALE, radii, spacing, useTheme } from '../../../theme';

type PagePillProps = {
  // "12 / 300", library numbering like the top bar's.
  label: string;
  visible: boolean;
  // The bottom bar's measured height (0 without one) and the safe area under it.
  barHeight: number;
  safeBottom: number;
  // useReaderChrome's `progress`: 1 with the bars shown.
  chrome: SharedValue<number>;
};

// §18 W10 (A11): the page number while scrolling, bottom centre. The top bar says it too, but the
// bars hide as soon as reading goes forward; this stays for as long as the pages move, riding
// just above the bottom bar or, with the bars away, above the screen's edge.
export function PagePill({ label, visible, barHeight, safeBottom, chrome }: PagePillProps) {
  const { tokens } = useTheme();
  const shown = useSharedValue(0);
  useEffect(() => {
    shown.value = withTiming(visible ? 1 : 0, { duration: visible ? 80 : 240 });
  }, [visible, shown]);
  const lift = Math.max(0, barHeight - safeBottom);
  const style = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ translateY: -chrome.value * lift }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.pill, { bottom: safeBottom + spacing.md, backgroundColor: tokens.ink, borderColor: tokens.muted }, style]}
    >
      <Text maxFontSizeMultiplier={CHROME_MAX_FONT_SCALE} style={[styles.text, { color: tokens.bg }]} numberOfLines={1}>
        {label}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: 'absolute',
    alignSelf: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.chip * 2,
    // The line keeps it apart from a night page, which is as dark as the pill.
    borderWidth: StyleSheet.hairlineWidth,
  },
  text: { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
