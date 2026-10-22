import { useCallback, useState } from 'react';
import { Pressable, type GestureResponderEvent, type Insets, type LayoutChangeEvent, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { hapticSelection } from '../../services/feedback/haptics';
import { MIN_TOUCH, PRESS_SCALE, useMotion, useTheme } from '../../theme';
import { rippleColor } from './kitColors';

// §17 U2: the base of every pressable in the kit (Button, IconButton, Card, ListItem, Chip), and
// what a redesigned screen uses instead of a bare Pressable. One press feel everywhere: the Android
// ripple in a token colour and a scale to 0.97 (none under reduced motion), plus an optional haptic
// tick. accessibilityRole is required, so TalkBack always says what the thing is
// (src/__tests__/a11yLabels.test.ts scans `<Touchable` too). Anything drawn smaller than 48 dp gets
// the rest as hitSlop, measured, so callers never compute it.

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type TouchableProps = Omit<PressableProps, 'style' | 'accessibilityRole' | 'android_ripple'> & {
  accessibilityRole: NonNullable<PressableProps['accessibilityRole']>;
  style?: StyleProp<ViewStyle>;
  // 'onFill' for a control drawn on the accent or danger fill (a lighter ripple); 'none' for a
  // control that shows its press another way.
  ripple?: 'default' | 'onFill' | 'none';
  // Rows and cards are wide: a 0.97 scale moves their edges by 5 dp and looks like a jump.
  scale?: boolean;
  haptic?: boolean;
  // A round control (IconButton) gets a borderless ripple of this radius instead of one clipped by
  // overflow: 'hidden', which would also clip its badge.
  rippleRadius?: number;
};

// The slop that grows a measured box to MIN_TOUCH on each axis.
export function slopFor(width: number, height: number): Insets {
  const x = Math.max(0, Math.ceil((MIN_TOUCH - width) / 2));
  const y = Math.max(0, Math.ceil((MIN_TOUCH - height) / 2));
  return { top: y, bottom: y, left: x, right: x };
}

const NO_SLOP: Insets = { top: 0, bottom: 0, left: 0, right: 0 };

function sameSlop(a: Insets, b: Insets): boolean {
  return a.top === b.top && a.bottom === b.bottom && a.left === b.left && a.right === b.right;
}

export function Touchable({
  ripple = 'default',
  scale: scales = true,
  haptic,
  rippleRadius,
  style,
  hitSlop,
  onPress,
  onPressIn,
  onPressOut,
  onLayout,
  disabled,
  ...rest
}: TouchableProps) {
  const { tokens } = useTheme();
  const motion = useMotion();
  const pressed = useSharedValue(1);
  const [slop, setSlop] = useState<Insets>(NO_SLOP);
  const animated = scales && !motion.reduced;

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: pressed.value }] }));

  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const next = slopFor(e.nativeEvent.layout.width, e.nativeEvent.layout.height);
      setSlop((prev) => (sameSlop(prev, next) ? prev : next));
      onLayout?.(e);
    },
    [onLayout]
  );

  const handlePressIn = useCallback(
    (e: GestureResponderEvent) => {
      if (animated) pressed.value = withSpring(PRESS_SCALE, motion.springs.press);
      onPressIn?.(e);
    },
    [animated, motion.springs.press, onPressIn, pressed]
  );

  const handlePressOut = useCallback(
    (e: GestureResponderEvent) => {
      if (animated) pressed.value = withSpring(1, motion.springs.press);
      onPressOut?.(e);
    },
    [animated, motion.springs.press, onPressOut, pressed]
  );

  const handlePress = useCallback(
    (e: GestureResponderEvent) => {
      if (haptic) hapticSelection();
      onPress?.(e);
    },
    [haptic, onPress]
  );

  const rippleTint = rippleColor(tokens, ripple === 'onFill');
  const rippleConfig =
    ripple === 'none' || disabled
      ? undefined
      : rippleRadius
        ? { color: rippleTint, borderless: true, radius: rippleRadius }
        : { color: rippleTint, foreground: true };

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onLayout={handleLayout}
      hitSlop={hitSlop ?? slop}
      onPress={onPress ? handlePress : undefined}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      android_ripple={rippleConfig}
      style={[style, animated ? animatedStyle : null]}
    />
  );
}
