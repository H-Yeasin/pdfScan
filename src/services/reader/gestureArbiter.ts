import type { MarkTool } from '../annotations/markMode';

// §18 W15 (A5): one surface, one set of gestures, and a tool that says what one finger does. The
// surface never changes with the tool, so zoom and position survive every mode change; only the
// answers here do. Pure, and the functions marked 'worklet' also run on the UI thread, inside
// the gestures.

// What the Reader has the surface doing.
export type SurfaceTool = 'read' | 'select' | 'mark' | 'sign';

// What a one-finger drag is:
//  - 'scroll': it moves the pages (reading, selecting, Mark's Hand tool);
//  - 'draw': a provisional stroke (highlighter, underline, strike, pen);
//  - 'drag': it moves the mark it began on, if any (a text box, a signature), and nothing else;
//  - 'sign': it moves or resizes the signature being placed when it begins on it, else scrolls.
// Two fingers always scroll and zoom.
export type PanMode = 'scroll' | 'draw' | 'drag' | 'sign';

export function panMode(tool: SurfaceTool, markTool: MarkTool): PanMode {
  if (tool === 'sign') return 'sign';
  if (tool !== 'mark' || markTool === 'hand') return 'scroll';
  return markTool === 'highlight' || markTool === 'underline' || markTool === 'strike' || markTool === 'pen' ? 'draw' : 'drag';
}

// Whether a tap waits to see if it is the first of two (a double tap zooms) and a held finger
// selects a word. Only while reading or selecting: a Mark tool acts on the tap at once, and the
// signature being placed is not something to zoom past.
export function hasReadingTaps(tool: SurfaceTool): boolean {
  return tool === 'read' || tool === 'select';
}

// A pinch that begins this soon after a stroke did was two fingers landing one after the other:
// the stroke was never meant.
export const PINCH_GUARD_MS = 120;
// A stroke that travelled less than this (screen pixels) is a tap with a shaky finger.
export const TAP_JITTER = 6;

// What is known of a stroke when its gesture ends.
export type StrokeFacts = {
  // The gesture ended as a drag that was let go (not cancelled by the system or another gesture).
  success: boolean;
  // A second finger came down while it was being drawn.
  multiTouch: boolean;
  // When the stroke began, and when a pinch began (null: none did), on the same clock (ms).
  startedAt: number;
  pinchAt: number | null;
  // How far the finger travelled, in screen pixels.
  travel: number;
};

// The pinch race (A5). A stroke is provisional until its gesture is over, and becomes a mark
// only if one finger drew it, no pinch began around its start, and it went somewhere:
//  - 'commit': a mark;
//  - 'tap': too short to be a line; it is treated as the tap it was (a word, a note, the eraser);
//  - 'discard': it draws nothing (a pinch or a second finger, or the gesture was cancelled).
// Decided when the gesture is finalised, never at its end event: a cancelled gesture has no end.
export function strokeOutcome(facts: StrokeFacts): 'commit' | 'tap' | 'discard' {
  'worklet';
  if (!facts.success || facts.multiTouch) return 'discard';
  // A pinch at any time after the stroke began, or just before it.
  if (facts.pinchAt !== null && facts.pinchAt >= facts.startedAt - PINCH_GUARD_MS) return 'discard';
  return facts.travel < TAP_JITTER ? 'tap' : 'commit';
}

// Where a tap goes (A5's tap routing), in order: the tool's own use of it; an open selection,
// which the tap closes; a link under the finger; else the Reader's bars, unless Find is open.
export type TapRoute = 'tool' | 'none' | 'selection' | 'link' | 'chrome';

export function routeTap(state: { tool: SurfaceTool; selectionOpen: boolean; onLink: boolean; findOpen: boolean }): TapRoute {
  if (state.tool === 'mark') return 'tool';
  // The signature is placed with its own buttons: a tap beside it does nothing.
  if (state.tool === 'sign') return 'none';
  if (state.tool === 'select' || state.selectionOpen) return 'selection';
  if (state.onLink) return 'link';
  return state.findOpen ? 'none' : 'chrome';
}
