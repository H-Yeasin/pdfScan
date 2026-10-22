import { useEffect } from 'react';
import type { DimensionValue, StyleProp, ViewStyle } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { radii, useMotion, useTheme } from '../../theme';

// §17 U2: a placeholder block while something loads (a list's first rows, a card's numbers). It
// breathes between two opacities, which costs one shared value and no gradient; under reduced motion
// it is a still block. Hidden from screen readers: the list around it says "Loading".

export type SkeletonProps = {
  width?: DimensionValue;
  height?: DimensionValue;
  radius?: number;
  style?: StyleProp<ViewStyle>;
};

export function Skeleton({ width = '100%', height = 16, radius = radii.xs, style }: SkeletonProps) {
  const { tokens } = useTheme();
  const motion = useMotion();
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (motion.reduced) {
      cancelAnimation(opacity);
      opacity.value = 1;
      return;
    }
    opacity.value = withRepeat(withTiming(0.45, { duration: 800, easing: Easing.inOut(Easing.quad) }), -1, true);
    return () => cancelAnimation(opacity);
  }, [motion.reduced, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width, height, borderRadius: radius, backgroundColor: tokens.surface2 }, animatedStyle, style]}
    />
  );
}
