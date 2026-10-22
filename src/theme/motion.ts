import { useMemo } from 'react';
import type { WithSpringConfig } from 'react-native-reanimated';
import { useReducedMotion } from './useReducedMotion';

// §17 U1: every duration and spring the redesign uses. `fast` a press or a fade of a small thing,
// `base` a cross-fade (tabs use 150, between the two), `slide` a pushed screen, `slow` a celebration.
export const durations = { fast: 120, base: 200, slide: 240, slow: 320 } as const;
export type DurationId = keyof typeof durations;

// Reanimated spring configs: `sheet` comes up without a bounce, `press` settles a 0.97 press-scale
// quickly, `pop` overshoots a little (a badge, the "Saved" check).
export const springs = {
  sheet: { damping: 26, stiffness: 260, mass: 1 },
  press: { damping: 20, stiffness: 400, mass: 0.6 },
  pop: { damping: 12, stiffness: 220, mass: 0.8 },
} as const satisfies Record<string, WithSpringConfig>;

// The scale a pressed button or card shrinks to.
export const PRESS_SCALE = 0.97;

export type Motion = { reduced: boolean; durations: Record<DurationId, number>; springs: typeof springs };

const NO_DURATIONS: Record<DurationId, number> = { fast: 0, base: 0, slide: 0, slow: 0 };

// Pure, for tests and for code that already knows the setting.
export function motionFor(reduced: boolean): Motion {
  return { reduced, durations: reduced ? NO_DURATIONS : durations, springs };
}

// The motion tokens under the system's reduce-motion setting: every duration is 0 there, so a timing
// lands at once. A spring has no duration; code that springs checks `reduced` and sets the value
// directly instead.
export function useMotion(): Motion {
  const reduced = useReducedMotion();
  return useMemo(() => motionFor(reduced), [reduced]);
}
