import { Animated, Easing } from 'react-native';
import { durations } from '../theme/motion';
import { useReducedMotion } from '../theme/useReducedMotion';
import type { NavDir, ScreenName } from '../types/navigation';

export const SLIDE_DURATION_MS: number = durations.slide;
// §16 G2: tab switches cross-fade, shorter: the tabs are siblings, not a hierarchy.
export const FADE_DURATION_MS: number = 150;
// §17 U13: how far a tab's root rises as it fades in. A hint of movement, not a slide.
export const TAB_RISE_DP = 4;

// §17 U13: what a navigation looks like, by what it is.
// - push: a screen deeper in the same task slides in from the right (and back out on pop);
// - tab: a tab switch cross-fades in place, the incoming root rising a few dp;
// - modal: a full-screen offer or editor (MODAL_SCREENS) slides up over what it came from, and
//   down again when it closes, while the screen under it stays put;
// - fade: everything under the system's reduce-motion setting (§9 O4b), a plain cross-fade.
export type TransitionKind = 'push' | 'tab' | 'modal' | 'fade';

// Pushed screens that are a detour out of a task and back, not a step into it: they come up from
// the bottom like the Reader's editors (which are RN Modals; see modalAnimation).
export const MODAL_SCREENS: ReadonlySet<ScreenName> = new Set(['pro', 'academicOptions']);

// The kind of one navigation. `change` is the router's ('fade' for a tab switch, 'slide' for a push,
// a pop or a tab's reset); `from` and `to` are the screens on top before and after.
export function pickTransition(change: 'slide' | 'fade', from: ScreenName, to: ScreenName, dir: NavDir, reducedMotion: boolean): TransitionKind {
  if (reducedMotion) return 'fade';
  if (change === 'fade') return 'tab';
  // Opening one comes up; closing it (Back from it) goes down. A push from a modal screen to a
  // further one is an ordinary push.
  if (dir === 'fwd' ? MODAL_SCREENS.has(to) : MODAL_SCREENS.has(from)) return 'modal';
  return 'push';
}

export function transitionDuration(kind: TransitionKind): number {
  return kind === 'tab' || kind === 'fade' ? FADE_DURATION_MS : SLIDE_DURATION_MS;
}

// The animated style of a screen during a transition, or undefined for a layer that stays where it
// is (the screen under a modal one). Both transform entries are always present, in the same order
// as RESTING_STYLE's (see there).
export function transitionStyle(
  progress: Animated.Value,
  size: { width: number; height: number },
  layer: 'incoming' | 'outgoing',
  dir: NavDir,
  kind: TransitionKind
): object | undefined {
  const incoming = layer === 'incoming';
  const fadeIn = progress;
  const fadeOut = progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  switch (kind) {
    case 'fade':
      return { opacity: incoming ? fadeIn : fadeOut };
    case 'tab':
      // The outgoing root only fades: two moving layers at once would read as a slide.
      return incoming
        ? { opacity: fadeIn, transform: [{ translateX: 0 }, { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [TAB_RISE_DP, 0] }) }] }
        : { opacity: fadeOut };
    case 'modal': {
      // fwd: the modal screen (incoming) rises from below. back: it (outgoing) sinks. The other
      // layer doesn't move; it is drawn under the modal one either way (ScreenStack draws the
      // leaving screen last).
      const moving = dir === 'fwd' ? incoming : !incoming;
      if (!moving) return undefined;
      const from = incoming ? size.height : 0;
      const to = incoming ? 0 : size.height;
      return { transform: [{ translateX: 0 }, { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [from, to] }) }] };
    }
    case 'push':
      return { transform: [{ translateX: slideTransform(progress, size.width, layer, dir) }, { translateY: 0 }] };
  }
}

export function slideTransform(progress: Animated.Value, width: number, layer: 'incoming' | 'outgoing', dir: NavDir) {
  // fwd: incoming enters from the right, outgoing exits to the left.
  // back: incoming enters from the left, outgoing exits to the right.
  const sign = dir === 'fwd' ? 1 : -1;
  const from = layer === 'incoming' ? sign * width : 0;
  const to = layer === 'incoming' ? 0 : -sign * width;
  return progress.interpolate({ inputRange: [0, 1], outputRange: [from, to] });
}

// §17 U13: a full-screen RN Modal (the Reader's editors and pickers) slides up, and cross-fades
// under reduced motion like the screens do.
export function modalAnimation(reducedMotion: boolean): 'slide' | 'fade' {
  return reducedMotion ? 'fade' : 'slide';
}

// Every layer's style at rest, and under the animated one during a transition. It must never be
// missing: the native driver leaves the animated transform/opacity on the view, and on the next
// prop update RN 0.86's Fabric mounting (overridePropsReadableMap) asserts that React still sends
// `transform` as an array and `opacity` as a number. Dropping them (style null) crashed the app at
// the end of every slide. Both keys are always set, so a layer that faded once and slides next
// (§16 G2 keeps layers mounted), or reduce motion switching between transitions, is safe too. Since
// §17 U13 a transition moves either axis, so the resting transform names both, and every animated
// transform names both in the same order: what React sends next always replaces both.
export const RESTING_STYLE = { opacity: 1, transform: [{ translateX: 0 }, { translateY: 0 }] };

export function runSlide(progress: Animated.Value, onDone?: () => void, duration = SLIDE_DURATION_MS) {
  progress.setValue(0);
  Animated.timing(progress, {
    toValue: 1,
    duration,
    easing: Easing.inOut(Easing.ease),
    useNativeDriver: true,
  }).start(onDone);
}

// The animationType of a full-screen RN Modal, under the live reduce-motion setting.
export function useModalAnimation(): 'slide' | 'fade' {
  return modalAnimation(useReducedMotion());
}
