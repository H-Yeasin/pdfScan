import type { AppAction } from '../store/appReducer';
import type { ScreenName } from '../types/navigation';
import type { TabId } from './navStack';

// §9 O1: what the Android back button (hardware or gesture) does, as a pure function of the
// navigation state, so the order is testable without a device.
//
// The full order is: (1) an open sheet or modal closes - RN `Modal`s do this themselves through
// `onRequestClose`, and inline overlays register with `useBackHandler`, both of which run before
// the app-level handler that calls this; (2) selection or Library search is left; (3) the screen
// goes back: since §16 G2 that's a pop to wherever it was opened from, apart from the few
// screens below with a fixed way back; (4) on a tab's root: to the start tab (Home once a course
// exists, otherwise Capture) from any other, and out of the app from the start tab.

export type BackContext = {
  // The screen on top, its tab, and whether there's a screen under it on that tab's stack.
  screen: ScreenName;
  tab: TabId;
  canPop: boolean;
  hasCourses: boolean;
  selMode: boolean;
  searchOpen: boolean;
  // Pages in the unsaved scan session. They live only in memory, so leaving the app asks first.
  sessionPageCount: number;
  retakeTargetId: string | null;
  highlightDeadlineId: string | null;
  // §14 Q7: Academic options open for a library document's cover: Back returns to where that was
  // started (a list screen or the Reader) and clears it.
  coverTarget?: { from: ScreenName } | null;
};

export type BackStep =
  // `actions` are dispatched before navigating: the same clean-up the screen's Back button does.
  | { kind: 'dispatch'; actions: AppAction[] }
  | { kind: 'pop'; actions: AppAction[] }
  | { kind: 'go'; to: ScreenName; actions: AppAction[] }
  | { kind: 'confirmDiscard'; count: number }
  | { kind: 'exit' };

// Screens that show a document list with long-press selection (useDocumentListActions).
// `selMode` is global, so it's only "the thing on screen" on one of these.
const SELECTION_SCREENS: ReadonlySet<ScreenName> = new Set(['home', 'library', 'course', 'storage']);

export function rootScreen(hasCourses: boolean): TabId {
  return hasCourses ? 'home' : 'capture';
}

// The screens whose way back doesn't depend on how they were reached. Kept beside the screens'
// own Back buttons in spirit: if one changes, change it here too.
function fixedBackTarget(ctx: BackContext): ScreenName | null {
  switch (ctx.screen) {
    // The scan flow, step by step (Review → Capture until §17 U5 removes the Capture screen).
    case 'review':
      return 'capture';
    case 'deliver':
      return 'review';
    case 'academicOptions':
      return ctx.coverTarget?.from ?? null;
    default:
      return null;
  }
}

export function resolveBack(ctx: BackContext): BackStep {
  if (ctx.selMode && SELECTION_SCREENS.has(ctx.screen)) {
    return { kind: 'dispatch', actions: [{ type: 'library/CLEAR_SELECTION' }] };
  }
  if (ctx.searchOpen && ctx.screen === 'library') {
    return { kind: 'dispatch', actions: [{ type: 'library/TOGGLE_SEARCH_OPEN' }] };
  }

  // §9 O2: Onboarding's own pages step back with useBackHandler. On its first page: opened again
  // from Settings, Back returns there; on first run (the boot screen, alone on its stack) it
  // leaves the app, so the introduction isn't skipped by accident and shows again next time.
  if (ctx.screen === 'onboarding' && !ctx.canPop) return { kind: 'exit' };

  const actions: AppAction[] = [];
  if (ctx.screen === 'review' && ctx.retakeTargetId) actions.push({ type: 'capture/SET_RETAKE_TARGET', id: null });
  if (ctx.screen === 'course' && ctx.highlightDeadlineId) {
    actions.push({ type: 'library/SET_HIGHLIGHT_DEADLINE', id: null });
  }
  if (ctx.screen === 'academicOptions' && ctx.coverTarget) actions.push({ type: 'deliver/SET_COVER_TARGET', target: null });

  const fixed = fixedBackTarget(ctx);
  if (fixed) return { kind: 'go', to: fixed, actions };
  if (ctx.canPop) return { kind: 'pop', actions };

  // A tab's root.
  const start = rootScreen(ctx.hasCourses);
  if (ctx.tab !== start) return { kind: 'go', to: start, actions };
  return ctx.sessionPageCount > 0 ? { kind: 'confirmDiscard', count: ctx.sessionPageCount } : { kind: 'exit' };
}
