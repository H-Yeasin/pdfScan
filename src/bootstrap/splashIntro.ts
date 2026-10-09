import { MARK_CONTENT_BOX, MARK_PIECES, WHITE_PIECE_CENTRES, type MarkPiece, type Point, type WhitePieceName } from '../components/brand/markGeometry';
import { SPLASH_EXIT_MS, SPLASH_TIMEOUT_MS } from './splash';

// §15 V5: the splash intro, "Scan & assemble" (components/brand/SplashIntro.tsx draws it). On a cold
// start the native splash hands over to a JS overlay whose first frame is identical to it, so the
// handoff can't be seen; the overlay then plays a short logo animation while the app boots
// underneath, and fades into the start screen. Everything here is plain logic, so it's tested
// without Skia or Reanimated; the frame functions are worklets, so the overlay runs them on the UI
// thread.

// The native splash fades out over SPLASH_EXIT_MS (splash.ts, set in holdSplash). The hold below is at
// least that long, so the fade happens between two identical frames.
export { SPLASH_EXIT_MS };

// The timeline, in ms from releaseSplash(). Each phase is a stretch of the clock; phases overlap.
export type Phase = { readonly start: number; readonly end: number };
export const INTRO_PHASES = {
  // The native splash fades out over the still frame.
  hold: { start: 0, end: 150 },
  // The four white pieces part, each along its own outward direction, and snap back together.
  assemble: { start: 150, end: 450 },
  // A soft light band runs bottom-left → top-right through the green pieces, the way the logo flows.
  sweep: { start: 400, end: 800 },
  // The folded corner lifts and settles, pinned at its right-angle corner.
  fold: { start: 700, end: 950 },
  // "PDF Scan" fades in and rises under the tile, which moves up so the pair stays centred.
  wordmark: { start: 800, end: 1100 },
} as const satisfies Record<string, Phase>;
export const INTRO_TOTAL_MS = 1100;

// The overlay's exit: a fade (with a small zoom of the tile after the animation played), or a
// shorter plain crossfade when the logo stayed still.
export const INTRO_EXIT_MS = 220;
export const STILL_EXIT_MS = 150;
export const EXIT_SCALE = 1.06;

// How far the white pieces part, in mark units: 4% of the mark's size.
export const ASSEMBLE_SPREAD = 0.04 * MARK_CONTENT_BOX.height;
// The fold's scale at the top of its lift.
export const FOLD_LIFT = 1.15;
// How far the wordmark rises as it fades in, in dp.
export const WORDMARK_RISE_DP = 8;
// The light band: its peak opacity (white), and its length along the sweep in mark units.
export const SWEEP_PEAK = 0.45;
export const SWEEP_BAND = 220;
// The sweep's line: from the content box's bottom-left corner to its top-right.
export const SWEEP_FROM: Point = { x: MARK_CONTENT_BOX.x, y: MARK_CONTENT_BOX.y + MARK_CONTENT_BOX.height };
export const SWEEP_TO: Point = { x: MARK_CONTENT_BOX.x + MARK_CONTENT_BOX.width, y: MARK_CONTENT_BOX.y };

// --- Whether to play ------------------------------------------------------------------------------

export type IntroPlan = 'wait' | 'play' | 'still';

type PlanInputs = {
  // Each is undefined until it's known: the system's "Remove animations" (asked once at mount:
  // useReducedMotion() starts at false and would let the first frames of motion through), whether
  // the app was cold-started with a file ("Open with" or share: Linking.getInitialURL() is a
  // file:// or content:// URI), and whether this is the overlay's first mount in this JS process.
  reducedMotion: boolean | undefined;
  externalLaunch: boolean | undefined;
  firstMountThisProcess: boolean | undefined;
  // The hold is over: the animation would start moving now.
  holdOver: boolean;
};

// 'still': the logo stays as the native splash drew it until boot is done, then crossfades out.
// Any input that says so decides it straight away; anything still unknown when the hold ends does
// too, rather than delaying the student. A warm start never remounts AppNavigator, so only a remount
// in the same process (an error boundary's retry, say) sees the second rule.
export function introPlan({ reducedMotion, externalLaunch, firstMountThisProcess, holdOver }: PlanInputs): IntroPlan {
  if (firstMountThisProcess === false || reducedMotion === true || externalLaunch === true) return 'still';
  if (firstMountThisProcess === true && reducedMotion === false && externalLaunch === false) return 'play';
  return holdOver ? 'still' : 'wait';
}

type ExitInputs = {
  // The animation finished (or was skipped, or never played).
  introDone: boolean;
  booting: boolean;
  // With the app lock on, the biometric prompt opens as soon as boot is done; the intro gives way.
  appLocked: boolean;
  // Since the overlay mounted.
  elapsedMs: number;
};

// When the overlay starts fading out. A slow boot holds on the final frame (no loop); SPLASH_TIMEOUT_MS
// is the same cap as the native splash's, whatever else is going on.
export function shouldExit({ introDone, booting, appLocked, elapsedMs }: ExitInputs): boolean {
  if (elapsedMs >= SPLASH_TIMEOUT_MS) return true;
  return !booting && (introDone || appLocked);
}

let mountedBefore = false;

// True the first time it's called in this JS process, false after.
export function takeFirstMount(): boolean {
  const first = !mountedBefore;
  mountedBefore = true;
  return first;
}

// For tests: as if the process had just started.
export function resetFirstMountForTests() {
  mountedBefore = false;
}

// --- The frames -----------------------------------------------------------------------------------

// Each phase's progress at one moment, 0 at rest. `part` is how far the white pieces are apart (1 =
// ASSEMBLE_SPREAD; a little below 0 as they snap together), `sweep` where the light band is (0 before
// the mark, 1 past it), `fold` how far the fold has lifted (1 = FOLD_LIFT), `wordmark` how far the
// wordmark has come in (1 = shown, and the tile moved up).
export type IntroFrame = { part: number; sweep: number; fold: number; wordmark: number };

function progress(t: number, phase: Phase): number {
  'worklet';
  return Math.min(1, Math.max(0, (t - phase.start) / (phase.end - phase.start)));
}

function easeOutCubic(u: number): number {
  'worklet';
  return 1 - (1 - u) ** 3;
}

function easeInOutCubic(u: number): number {
  'worklet';
  return u < 0.5 ? 4 * u ** 3 : 1 - (-2 * u + 2) ** 3 / 2;
}

// 0 → 1 over the first `peakAt` of the phase, then back to 0.
function bump(u: number, peakAt: number): number {
  'worklet';
  return u <= peakAt ? easeOutCubic(u / peakAt) : 1 - easeInOutCubic((u - peakAt) / (1 - peakAt));
}

// Apart quickly, then back with a small overshoot past 0 (the page snaps together) that settles.
function assemble(u: number): number {
  'worklet';
  const apart = 0.4;
  if (u <= apart) return easeOutCubic(u / apart);
  const v = (u - apart) / (1 - apart) - 1;
  const overshoot = 1.2;
  return -((overshoot + 1) * v ** 3 + overshoot * v ** 2);
}

// The frame at `t` ms after releaseSplash(). Every phase is at rest before INTRO_PHASES.hold.end and
// after INTRO_TOTAL_MS (except `wordmark`, which ends at 1), so the first frame equals the native
// splash.
export function introFrame(t: number): IntroFrame {
  'worklet';
  return {
    part: assemble(progress(t, INTRO_PHASES.assemble)),
    // At a steady speed, like a scanner's light; it's invisible at both ends, so it needs no easing.
    sweep: progress(t, INTRO_PHASES.sweep),
    fold: bump(progress(t, INTRO_PHASES.fold), 0.4),
    wordmark: easeOutCubic(progress(t, INTRO_PHASES.wordmark)),
  };
}

// Each white piece's unit direction away from the content box's centre (to its own centre).
const CONTENT_CENTRE = { x: MARK_CONTENT_BOX.x + MARK_CONTENT_BOX.width / 2, y: MARK_CONTENT_BOX.y + MARK_CONTENT_BOX.height / 2 };
export const PIECE_DIRECTIONS = Object.fromEntries(
  (Object.entries(WHITE_PIECE_CENTRES) as [WhitePieceName, Point][]).map(([name, c]) => {
    const [dx, dy] = [c.x - CONTENT_CENTRE.x, c.y - CONTENT_CENTRE.y];
    const length = Math.hypot(dx, dy);
    return [name, { x: dx / length, y: dy / length }];
  })
) as Record<WhitePieceName, Point>;

// A white piece's transform at `part`, in mark units.
export function pieceTransform(direction: Point, part: number): [{ translateX: number }, { translateY: number }] {
  'worklet';
  return [{ translateX: direction.x * ASSEMBLE_SPREAD * part }, { translateY: direction.y * ASSEMBLE_SPREAD * part }];
}

// The fold's transform at `fold` (drawn around FOLD_PIVOT).
export function foldTransform(fold: number): [{ scale: number }] {
  'worklet';
  return [{ scale: 1 + (FOLD_LIFT - 1) * fold }];
}

// The light band's gradient line at `sweep`, in mark units: SWEEP_BAND long, along SWEEP_FROM →
// SWEEP_TO, wholly before SWEEP_FROM at 0 and wholly past SWEEP_TO at 1. The gradient is clamped,
// transparent at both ends, so outside the band it lights nothing. Every point of the content box
// lies between the two corners along this line.
export function sweepLine(sweep: number): { start: Point; end: Point } {
  'worklet';
  const [dx, dy] = [SWEEP_TO.x - SWEEP_FROM.x, SWEEP_TO.y - SWEEP_FROM.y];
  const length = Math.hypot(dx, dy);
  const [ux, uy] = [dx / length, dy / length];
  const from = -SWEEP_BAND + sweep * (length + SWEEP_BAND);
  return {
    start: { x: SWEEP_FROM.x + ux * from, y: SWEEP_FROM.y + uy * from },
    end: { x: SWEEP_FROM.x + ux * (from + SWEEP_BAND), y: SWEEP_FROM.y + uy * (from + SWEEP_BAND) },
  };
}

// The mark in three runs of paint order: the white pieces before the green ones, the green ones, and
// the white ones after. The overlay draws the green run as one layer, so the light band (blended
// srcATop) lights only it; that keeps the logo's paint order because the green pieces are
// consecutive in it (the test checks).
export function paintRuns(pieces: readonly MarkPiece[]) {
  const first = pieces.findIndex((piece) => piece.fill !== 'paper');
  const last = pieces.length - 1 - [...pieces].reverse().findIndex((piece) => piece.fill !== 'paper');
  return { before: pieces.slice(0, first), greens: pieces.slice(first, last + 1), after: pieces.slice(last + 1) };
}

export const PAINT_RUNS = paintRuns(MARK_PIECES);
