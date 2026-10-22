import { useEffect, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useT } from '../../i18n/useT';
import { radii, useMotion, useTheme } from '../../theme';

// §17 U2: a thin progress track. With `value` (0-1) it fills to it, easing between updates; without
// one it is indeterminate: a segment sweeps across, or, under reduced motion, sits still in the
// middle (still reads as "working"). TalkBack reads the percentage.

export type ProgressBarProps = {
  value?: number;
  tone?: 'accent' | 'highlight';
  height?: number;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

const SEGMENT = 0.35;

export function clampProgress(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

export function ProgressBar({ value, tone = 'accent', height = 4, accessibilityLabel, style }: ProgressBarProps) {
  const { tokens } = useTheme();
  const { t } = useT();
  const motion = useMotion();
  const [width, setWidth] = useState(0);
  const determinate = value !== undefined;
  const fill = useSharedValue(determinate ? clampProgress(value) : 0);
  const sweep = useSharedValue(0);

  useEffect(() => {
    if (determinate) fill.value = withTiming(clampProgress(value), { duration: motion.durations.base });
  }, [determinate, value, motion.durations.base, fill]);

  useEffect(() => {
    if (determinate || motion.reduced) {
      cancelAnimation(sweep);
      sweep.value = 0.5;
      return;
    }
    sweep.value = 0;
    sweep.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }), -1, false);
    return () => cancelAnimation(sweep);
  }, [determinate, motion.reduced, sweep]);

  const barStyle = useAnimatedStyle(() => {
    if (determinate) return { width: fill.value * width, transform: [{ translateX: 0 }] };
    // From fully off the left edge to fully off the right one.
    const x = -SEGMENT * width + sweep.value * (1 + SEGMENT) * width;
    return { width: SEGMENT * width, transform: [{ translateX: motion.reduced ? (width * (1 - SEGMENT)) / 2 : x }] };
  });

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel ?? t('ui.loading')}
      accessibilityValue={determinate ? { min: 0, max: 100, now: Math.round(clampProgress(value) * 100) } : undefined}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[styles.track, { height, backgroundColor: tokens.surface2 }, style]}
    >
      <Animated.View style={[styles.bar, { backgroundColor: tone === 'accent' ? tokens.accent : tokens.highlight }, barStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    alignSelf: 'stretch',
    borderRadius: radii.full,
    overflow: 'hidden',
  },
  bar: {
    height: '100%',
    borderRadius: radii.full,
  },
});
