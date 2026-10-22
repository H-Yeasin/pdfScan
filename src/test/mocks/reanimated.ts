import { ScrollView, Text, View } from 'react-native';

// §17 U2: Reanimated needs its native worklets module, which Jest doesn't have, and the UI kit
// (components/ui) brings it into every screen built on it. This is the little the kit and the
// screens use: a shared value is a plain object, an animated style is computed once, every
// animation lands at its end value at once. A test that needs more mocks the module itself.
const identity = <T>(value: T): T => value;

export default {
  View,
  Text,
  ScrollView,
  createAnimatedComponent: identity,
};

export const useSharedValue = <T>(value: T) => ({ value });
export const useAnimatedStyle = (style: () => object) => style();
export const useAnimatedScrollHandler = () => () => {};
export const useDerivedValue = <T>(fn: () => T) => ({ value: fn() });
export const withSpring = identity;
export const withTiming = identity;
export const withRepeat = identity;
export const withDelay = <T>(_delay: number, value: T) => value;
export const cancelAnimation = () => {};
export const runOnJS = identity;
export const interpolate = (value: number, input: number[], output: number[]) => {
  if (value <= input[0]) return output[0];
  if (value >= input[input.length - 1]) return output[output.length - 1];
  return output[0] + ((value - input[0]) / (input[input.length - 1] - input[0])) * (output[output.length - 1] - output[0]);
};
export const Extrapolation = { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' };
export const Easing = { inOut: () => identity, quad: identity, linear: identity };

// §17 U13: layout animation builders (components/ui/layoutMotion). Each chain step returns the
// builder; nothing animates under Jest.
type Builder = { [method: string]: (...args: unknown[]) => Builder };
const builder = (): Builder => {
  const self: Builder = new Proxy({} as Builder, { get: () => () => self });
  return self;
};
export const FadeIn = builder();
export const FadeOut = builder();
export const LinearTransition = builder();
export const SlideInDown = builder();
export const SlideOutDown = builder();
export const ReduceMotion = { System: 'system', Always: 'always', Never: 'never' };
export const FadeInDown = builder();
export const FadeOutDown = builder();
// react-native-gesture-handler's GestureDetector builds its worklet events through this (the
// Snackbar's swipe, §17 U13).
export const useEvent = () => () => {};
