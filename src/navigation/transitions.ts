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

// The animated style of a screen during a transition: a horizontal slide, or (with the system's
// reduce-motion setting on, §9 O4b) a cross-fade in place.
export function transitionStyle(
  progress: Animated.Value,
  width: number,
  kind: 'incoming' | 'outgoing',
  dir: NavDir,
  reducedMotion: boolean
) {
  if (reducedMotion) {
    return { opacity: kind === 'incoming' ? progress : progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) };
  }
  return { transform: [{ translateX: slideTransform(progress, width, kind, dir) }] };
}

// The incoming layer's style when no transition runs. It must never be null: the native driver
// leaves the animated transform/opacity on the view, and on the next prop update RN 0.86's Fabric
// mounting (overridePropsReadableMap) asserts that React still sends `transform` as an array and
// `opacity` as a number. Dropping them (style null) crashed the app at the end of every slide.
// Both keys are always set, so switching reduce motion on or off between transitions is safe too.
export const RESTING_STYLE = { opacity: 1, transform: [{ translateX: 0 }] };

export function runSlide(progress: Animated.Value, onDone?: () => void) {
  progress.setValue(0);
  Animated.timing(progress, {
    toValue: 1,
    duration: SLIDE_DURATION_MS,
    easing: Easing.inOut(Easing.ease),
    useNativeDriver: true,
  }).start(onDone);
}
