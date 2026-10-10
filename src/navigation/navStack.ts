import type { NavDir, ScreenName } from '../types/navigation';

// §16 G2: the navigation state as plain data, one back stack per bottom tab. Pure functions only,
// so every rule here is tested without rendering (__tests__/navStack.test.ts); router.tsx holds
// the state and AppNavigator draws it: each tab's root stays mounted once visited, and the active
// tab's pushed screens stay mounted under the top one, so Back finds them as they were left.

// The bottom tabs, in the tab bar's order. A tab's root screen has the tab's name. §17 U5 changes
// the set (Home · Files · Tools · Me); everything that needs the list reads it from here.
export const TABS = ['home', 'capture', 'library'] as const satisfies readonly ScreenName[];
export type TabId = (typeof TABS)[number];

// One screen on a stack. The key names its mounted instance: the same key is the same instance,
// so a screen is never mounted twice for one visit.
export type Entry = { key: string; screen: ScreenName };

export type NavState = {
  tab: TabId;
  // Each tab's stack, its root first (after a boot `replace` with a screen that isn't a root, that
  // screen alone: the introduction on first run).
  stacks: Record<TabId, Entry[]>;
  // The tab shown before this one. A course or a document opened from the Scan tab goes there
  // (until §17 U5 removes the Scan tab).
  prevTab: TabId;
};

// Pushed screens per tab. All of them stay mounted (hidden) under the top one; past this, the
// oldest is dropped, so a long trail of screens can't hold on to memory.
export const MAX_PUSHED = 6;

// Library content: opened while the Scan tab shows, these go to the tab the student browses in,
// not on top of Capture (a saved scan lands on its course page there, and Back goes to that
// tab's root, like before the stacks).
const CONTENT_SCREENS: ReadonlySet<ScreenName> = new Set(['course', 'reader', 'examPack']);

export function isTabRoot(screen: ScreenName): screen is TabId {
  return (TABS as readonly ScreenName[]).includes(screen);
}

// Roots have fixed keys, so resetting a tab gives back the same mounted root.
export function rootEntry(tab: TabId): Entry {
  return { key: `root:${tab}`, screen: tab };
}

export function isRootEntry(entry: Entry): boolean {
  return isTabRoot(entry.screen) && entry.key === rootEntry(entry.screen).key;
}

function rootStacks(): Record<TabId, Entry[]> {
  return Object.fromEntries(TABS.map((tab) => [tab, [rootEntry(tab)]])) as Record<TabId, Entry[]>;
}

export function initialNav(tab: TabId = 'capture'): NavState {
  return { tab, stacks: rootStacks(), prevTab: tab === 'library' ? 'home' : 'library' };
}

export function activeStack(state: NavState): Entry[] {
  return state.stacks[state.tab];
}

export function topEntry(state: NavState): Entry {
  const stack = activeStack(state);
  return stack[stack.length - 1];
}

function withStack(state: NavState, tab: TabId, stack: Entry[]): NavState {
  return { ...state, stacks: { ...state.stacks, [tab]: stack } };
}

// Opens `screen` on the active tab. Already on top: nothing changes (the Reader showing a new
// "Open with" file re-renders in place, as before). Further down the stack: that entry and
// everything above it go, and a fresh one is pushed. Screens like the Reader and a course page
// show whatever the store says is open (reader.readerId, libraryUi.activeCourseId), so a second,
// hidden copy lower down would show the new document too.
export function push(state: NavState, screen: ScreenName, key: string): NavState {
  const stack = activeStack(state);
  if (stack[stack.length - 1].screen === screen) return state;
  const at = stack.findIndex((entry) => entry.screen === screen);
  // A root is never pushed again: that's back to it.
  if (at === 0 && isRootEntry(stack[0])) return withStack(state, state.tab, [stack[0]]);
  const next = [...(at === -1 ? stack : stack.slice(0, at)), { key, screen }];
  while (next.length > MAX_PUSHED + 1) next.splice(1, 1);
  return withStack(state, state.tab, next);
}

export function pop(state: NavState): NavState {
  const stack = activeStack(state);
  if (stack.length <= 1) return state;
  return withStack(state, state.tab, stack.slice(0, -1));
}

// Back to the nearest `screen` on the active stack; unchanged when it isn't there or on top.
export function popTo(state: NavState, screen: ScreenName): NavState {
  const stack = activeStack(state);
  const at = stack.map((entry) => entry.screen).lastIndexOf(screen);
  if (at === -1 || at === stack.length - 1) return state;
  return withStack(state, state.tab, stack.slice(0, at + 1));
}

export function resetTab(state: NavState, tab: TabId): NavState {
  const stack = state.stacks[tab];
  if (stack.length === 1 && isRootEntry(stack[0])) return state;
  return withStack(state, tab, [rootEntry(tab)]);
}

// The tab bar: each tab keeps its stack, like Google Files. A second tap on the active tab goes
// back to its root.
export function switchTab(state: NavState, tab: TabId): NavState {
  if (tab === state.tab) return resetTab(state, tab);
  return { ...state, tab, prevTab: state.tab };
}

// The boot-time start screen: no history. A tab root becomes the active tab; anything else (the
// introduction) is the active tab's only entry, so Back on it leaves the app.
export function replace(state: NavState, screen: ScreenName, key: string): NavState {
  if (isTabRoot(screen)) {
    return { tab: screen, stacks: rootStacks(), prevTab: screen === state.tab ? state.prevTab : state.tab };
  }
  return { ...state, stacks: { ...rootStacks(), [state.tab]: [{ key, screen }] } };
}

export type NavChange = { state: NavState; kind: 'slide' | 'fade'; dir: NavDir };

// What the router's `go(to, dir)` does, so the many go() calls keep their meaning:
// - a tab root: on its own tab, back to the root; on another tab, a jump there. A jump (Scan from
//   a course page, the Library after a save, Home after the introduction) ends what was open on
//   both tabs: each starts at its root. Tabs are siblings, so it cross-fades;
// - `dir: 'back'` to a screen on the stack: back to it;
// - library content from the Scan tab: onto the previous tab (see CONTENT_SCREENS); the Scan tab
//   starts at Capture again;
// - anything else: pushed.
export function resolveGo(state: NavState, to: ScreenName, dir: NavDir, key: string): NavChange {
  if (isTabRoot(to)) {
    if (to === state.tab) return { state: resetTab(state, to), kind: 'slide', dir };
    const stacks = { ...state.stacks, [state.tab]: [rootEntry(state.tab)], [to]: [rootEntry(to)] };
    return { state: { tab: to, stacks, prevTab: state.tab }, kind: 'fade', dir };
  }
  if (dir === 'back' && activeStack(state).some((entry) => entry.screen === to)) {
    return { state: popTo(state, to), kind: 'slide', dir };
  }
  if (state.tab === 'capture' && CONTENT_SCREENS.has(to)) {
    const tab = state.prevTab === 'capture' ? 'library' : state.prevTab;
    const moved = { tab, stacks: { ...state.stacks, capture: [rootEntry('capture')] }, prevTab: state.tab };
    return { state: push(moved, to, key), kind: 'slide', dir };
  }
  return { state: push(state, to, key), kind: 'slide', dir };
}
