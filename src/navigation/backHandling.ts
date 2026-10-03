import type { AppAction } from '../store/appReducer';
import type { HubScreen, ScreenName, TabHub } from '../types/navigation';

// §9 O1: what the Android back button (hardware or gesture) does, as a pure function of the
// navigation state, so the order is testable without a device.
//
// The full order is: (1) an open sheet or modal closes - RN `Modal`s do this themselves through
// `onRequestClose`, and inline overlays register with `useBackHandler`, both of which run before
// the app-level handler that calls this; (2) selection or Library search is left; (3) the screen
// goes back to where its own Back button goes (the router's `hub`/`tabHub`); (4) the app exits,
// but only from the root tab - Home once a course exists, otherwise Capture.

export type BackContext = {
  screen: ScreenName;
  previousScreen: ScreenName | null;
  hub: HubScreen;
  tabHub: TabHub;
  hasCourses: boolean;
  selMode: boolean;
  searchOpen: boolean;
  // Pages in the unsaved scan session. They live only in memory, so leaving the app asks first.
  sessionPageCount: number;
  retakeTargetId: string | null;
  highlightDeadlineId: string | null;
};

export type BackStep =
  // `actions` are dispatched before navigating: the same clean-up the screen's Back button does.
  | { kind: 'dispatch'; actions: AppAction[] }
  | { kind: 'go'; to: ScreenName; actions: AppAction[] }
  | { kind: 'confirmDiscard'; count: number }
  | { kind: 'exit' };

// Screens that show a document list with long-press selection (useDocumentListActions).
// `selMode` is global, so it's only "the thing on screen" on one of these.
const SELECTION_SCREENS: ReadonlySet<ScreenName> = new Set(['home', 'library', 'course', 'storage']);
const TABS: ReadonlySet<ScreenName> = new Set(['home', 'library', 'capture']);

export function rootScreen(hasCourses: boolean): ScreenName {
  return hasCourses ? 'home' : 'capture';
}

// Where each screen's on-screen Back button goes. Kept beside the screens' own handlers in spirit:
// if a screen's Back changes, change it here too.
function backTarget(ctx: BackContext): ScreenName {
  switch (ctx.screen) {
    case 'review':
      return 'capture';
    case 'deliver':
      return 'review';
    case 'course':
      return ctx.tabHub;
    case 'reader':
    case 'settings':
      return ctx.hub;
    case 'manageFolders':
    case 'storage':
    case 'backup':
    case 'filterLab':
      return 'settings';
    // §10 M6: back to wherever Pro was opened from (a cover picker, Settings, ...).
    case 'pro':
      return ctx.previousScreen ?? 'settings';
    case 'academicOptions':
      return ctx.previousScreen ?? 'deliver';
    case 'examPack':
      return ctx.previousScreen ?? 'course';
    case 'home':
    case 'library':
    case 'capture':
    case 'onboarding':
      return rootScreen(ctx.hasCourses);
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
  // from Settings, Back returns there; on first run (no previous screen) it leaves the app, so the
  // introduction isn't skipped by accident and shows again next time.
  if (ctx.screen === 'onboarding') {
    return ctx.previousScreen ? { kind: 'go', to: ctx.previousScreen, actions: [] } : { kind: 'exit' };
  }
  if (TABS.has(ctx.screen) && ctx.screen === rootScreen(ctx.hasCourses)) {
    return ctx.sessionPageCount > 0 ? { kind: 'confirmDiscard', count: ctx.sessionPageCount } : { kind: 'exit' };
  }

  const actions: AppAction[] = [];
  if (ctx.screen === 'review' && ctx.retakeTargetId) actions.push({ type: 'capture/SET_RETAKE_TARGET', id: null });
  if (ctx.screen === 'course' && ctx.highlightDeadlineId) {
    actions.push({ type: 'library/SET_HIGHLIGHT_DEADLINE', id: null });
  }
  return { kind: 'go', to: backTarget(ctx), actions };
}
