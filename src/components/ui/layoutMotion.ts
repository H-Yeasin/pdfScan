import { LayoutAnimation } from 'react-native';
import { FadeIn, FadeOut, LinearTransition, ReduceMotion } from 'react-native-reanimated';
import { durations } from '../../theme/motion';
import { reducedMotionNow } from '../../theme/useReducedMotion';

// §17 U13: nothing jumps. Two tools, both off under the system's reduce-motion setting:
//
// 1. Reanimated layout animations for a part of a screen that appears, goes, or moves because
//    something above it changed size (a hint under a chip row, an expanding group):
//      <Animated.View entering={appear} exiting={disappear} layout={settle}>
//    ReduceMotion.System makes each land at once when the setting is on.
//
// 2. For a FlashList (Files, a course), whose recycled cells can't run per-row entering/exiting:
//    animateNextListChange() just before the dispatch that adds or removes rows (delete, archive,
//    a merge's result, a course section opening). The list screens register their list with
//    registerAnimatedList so its recycling is paused for that one render (FlashList v2's
//    prepareForLayoutAnimationRender), and RN's LayoutAnimation fades the rows in or out and slides
//    the rest into place.

export const appear = FadeIn.duration(durations.base).reduceMotion(ReduceMotion.System);
export const disappear = FadeOut.duration(durations.fast).reduceMotion(ReduceMotion.System);
export const settle = LinearTransition.duration(durations.base).reduceMotion(ReduceMotion.System);

// Optional: a stand-in list (Jest's FlashList mock) doesn't have it.
type AnimatableList = { prepareForLayoutAnimationRender?: () => void };

const lists = new Set<{ current: AnimatableList | null }>();

// For a list screen: while mounted, its list takes part in animateNextListChange. Screens kept
// mounted off screen (§16 G2) take part too; a hidden list's render costs nothing extra.
export function registerAnimatedList(ref: { current: AnimatableList | null }): () => void {
  lists.add(ref);
  return () => {
    lists.delete(ref);
  };
}

// The rows about to change fade, and the others slide to their new places, in the next commit.
export function animateNextListChange(): void {
  if (reducedMotionNow()) return;
  lists.forEach((ref) => ref.current?.prepareForLayoutAnimationRender?.());
  LayoutAnimation.configureNext(LayoutAnimation.create(durations.base, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity));
}
