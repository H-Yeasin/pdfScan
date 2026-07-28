import { Animated, Easing } from 'react-native';
import type { NavDir } from '../types/navigation';

export const SLIDE_DURATION_MS = 240;

export function slideTransform(
  progress: Animated.Value,
  width: number,
  kind: 'incoming' | 'outgoing',
  dir: NavDir
) {
  // fwd: incoming enters from the right, outgoing exits to the left.
  // back: incoming enters from the left, outgoing exits to the right.
  const sign = dir === 'fwd' ? 1 : -1;
  const from = kind === 'incoming' ? sign * width : 0;
  const to = kind === 'incoming' ? 0 : -sign * width;
  return progress.interpolate({ inputRange: [0, 1], outputRange: [from, to] });
}

export function runSlide(progress: Animated.Value, onDone?: () => void) {
  progress.setValue(0);
  Animated.timing(progress, {
    toValue: 1,
    duration: SLIDE_DURATION_MS,
    easing: Easing.inOut(Easing.ease),
    useNativeDriver: true,
  }).start(onDone);
}
