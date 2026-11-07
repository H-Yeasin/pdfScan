import type { AppAction, AppState } from '../store/appReducer';
import type { ExternalFileDocument } from '../types/models';
import type { NavDir, ScreenName } from '../types/navigation';

// §16 G2: the navigation state as plain data, one back stack per bottom tab. Pure functions only,
// so every rule here is tested without rendering (__tests__/navStack.test.ts); router.tsx holds
// the state and AppNavigator draws it: each tab's root stays mounted once visited, and the active
// tab's pushed screens stay mounted under the top one, so Back finds them as they were left.
//
// Back is one last-in, first-out history: each press takes off the screen on top and shows the one
// opened before it, across tabs too (`tabTrail`), and the app closes only from Home with nothing
// left to go back to. Nothing is skipped or cut off on the way: a screen opened again is pushed
// again, with the document or course it shows (`Entry.subject`).

// The bottom tabs, in the tab bar's order. A tab's root screen has the tab's name. §17 U5: Home ·
// Files · Tools · Me ('library' is Files and 'settings' is Me in the UI). The tab bar's centre Scan
// button isn't a tab: it opens the scanner over whichever tab is showing. Everything that needs
// the list reads it from here.
export const TABS = ['home', 'library', 'tools', 'settings'] as const satisfies readonly ScreenName[];
export type TabId = (typeof TABS)[number];

// What a Reader or a course page shows. Those screens show whatever the store says is open
// (reader.readerId / reader.external, libraryUi.activeCourseId), so each entry keeps its own, and
// the router puts it back in the store when Back reveals the entry (`restoreSubject`).
export type EntrySubject = { kind: 'doc'; id: string } | { kind: 'external'; doc: ExternalFileDocument } | { kind: 'course'; id: string };

// One screen on a stack. The key names its mounted instance: the same key is the same instance,
// so a screen is never mounted twice for one visit.
export type Entry = { key: string; screen: ScreenName; subject?: EntrySubject };

export type NavState = {
  tab: TabId;
  // Each tab's stack, its root first (after a boot `replace` with a screen that isn't a root, that
  // screen alone: the introduction on first run).
  stacks: Record<TabId, Entry[]>;
  // The tabs left by the tab bar or a jump, the most recent last, each once. Back on a tab's root
  // returns to the last of them (`backToTab`).
  tabTrail: TabId[];
};

// A safety cap on one tab's history: past it, the oldest entry above the root goes. Only the top
// few are mounted (ScreenStack's MAX_MOUNTED); the rest are just entries until Back reaches them.
export const MAX_HISTORY = 50;

// §17 U5: the scan flow. A scan is pushed on the tab it was started from, and there's only one
// session (capture.pages), so it is on one stack at a time: opened on another tab, it leaves the
// stack it was on (that tab goes back to the screen under Review). §17 U9: Done ends it.
const SCAN_FLOW: ReadonlySet<ScreenName> = new Set(['review', 'deliver', 'done']);

// Library content. Opened from the scan flow, it's where a saved scan lands (its course page, or
// the Reader for pages added to a document): the flow is over, so it leaves the stack, and Back
// from the course page goes where the scan was started, not to a finished Deliver.
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

export function initialNav(tab: TabId = 'home'): NavState {
  return { tab, stacks: rootStacks(), tabTrail: [] };
}

export function sameSubject(a: EntrySubject | undefined, b: EntrySubject | undefined): boolean {
  if (!a || !b) return a === b;
  if (a.kind === 'external') return b.kind === 'external' && a.doc.uri === b.doc.uri;
  return a.kind === b.kind && a.id === (b as typeof a).id;
}

// The subject the store holds for `screen` now: callers dispatch what to open, then go().
export function subjectFor(screen: ScreenName, state: Pick<AppState, 'reader' | 'libraryUi'>): EntrySubject | undefined {
  if (screen === 'reader') {
    if (state.reader.readerId) return { kind: 'doc', id: state.reader.readerId };
    if (state.reader.external) return { kind: 'external', doc: state.reader.external };
    return undefined;
  }
  if (screen === 'course' && state.libraryUi.activeCourseId) return { kind: 'course', id: state.libraryUi.activeCourseId };
  return undefined;
}

// What puts `entry`'s subject back in the store, when the store holds another; null when it
// already holds it (or the entry has none).
export function restoreSubject(entry: Entry, state: Pick<AppState, 'reader' | 'libraryUi'>): AppAction | null {
  const { subject } = entry;
  if (!subject || sameSubject(subject, subjectFor(entry.screen, state))) return null;
  switch (subject.kind) {
    case 'doc':
      return { type: 'reader/SET_READER_ID', id: subject.id };
    case 'external':
      return { type: 'reader/SET_EXTERNAL', doc: subject.doc };
    case 'course':
      return { type: 'libraryUi/SET_ACTIVE_COURSE', id: subject.id };
  }
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

// Opens `screen` on the active tab. Already on top with the same subject: nothing changes (the
// Reader showing the same file again re-renders in place). Otherwise it's pushed, even when it is
// lower down already: Reader A → its course → Reader B, then Back, Back gives the course, then A.
// Each entry keeps its subject, and screens that show one hold it while they aren't on screen
// (readerPosition.heldSubject), so a hidden copy lower down keeps its own document.
// The scan flow is the exception: there's one scan session, so Review or Save opened again is
// the one already on the stack (`popTo`).
export function push(state: NavState, screen: ScreenName, key: string, subject?: EntrySubject): NavState {
  const stack = activeStack(state);
  const top = stack[stack.length - 1];
  if (top.screen === screen && sameSubject(top.subject, subject)) return state;
  // A root is never pushed again: that's back to it.
  if (isRootEntry(stack[0]) && stack[0].screen === screen) return withStack(state, state.tab, [stack[0]]);
  if (SCAN_FLOW.has(screen) && stack.some((entry) => entry.screen === screen)) return popTo(state, screen);
  const next: Entry[] = [...stack, subject ? { key, screen, subject } : { key, screen }];
  while (next.length > MAX_HISTORY + 1) next.splice(1, 1);
  return withStack(state, state.tab, next);
}

// Back to the nearest `screen` on the active stack as a fresh instance (a new key, the same
// subject), or pushed when it isn't there: a screen whose file changed under it (a cover added
// with Replace from the Reader) opens again instead of showing what it had loaded.
export function reopen(state: NavState, screen: ScreenName, key: string): NavState {
  const stack = activeStack(state);
  const at = stack.map((entry) => entry.screen).lastIndexOf(screen);
  if (at === -1) return push(state, screen, key);
  if (at === 0 && isRootEntry(stack[0])) return resetTab(state, state.tab);
  return withStack(state, state.tab, [...stack.slice(0, at), { ...stack[at], key }]);
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

// `from` goes last on the trail, `to` comes off it: each tab is on it once.
function trailAfter(trail: TabId[], from: TabId, to: TabId): TabId[] {
  return [...trail.filter((t) => t !== to && t !== from), from];
}

// The tab bar: each tab keeps its stack, like Google Files. A second tap on the active tab goes
// back to its root.
export function switchTab(state: NavState, tab: TabId): NavState {
  if (tab === state.tab) return resetTab(state, tab);
  return { ...state, tab, tabTrail: trailAfter(state.tabTrail, state.tab, tab) };
}

// Back on a tab's root: the tab left last, as it was left, and it comes off the trail. With an
// empty trail, Home (`fallback`), without recording anything, so Back from there leaves the app
// instead of going round between two tabs.
export function backToTab(state: NavState, fallback: TabId = 'home'): NavChange {
  const trail = state.tabTrail;
  const to = trail.length > 0 ? trail[trail.length - 1] : fallback;
  if (to === state.tab) return { state, kind: 'fade', dir: 'back' };
  return { state: { ...state, tab: to, tabTrail: trail.filter((t) => t !== to) }, kind: 'fade', dir: 'back' };
}

// The boot-time start screen: no history. A tab root becomes the active tab; anything else (the
// introduction) is the active tab's only entry, so Back on it leaves the app.
export function replace(state: NavState, screen: ScreenName, key: string): NavState {
  if (isTabRoot(screen)) return { tab: screen, stacks: rootStacks(), tabTrail: [] };
  return { ...state, stacks: { ...rootStacks(), [state.tab]: [{ key, screen }] }, tabTrail: [] };
}

// Every tab's stack (but the active one's, unless `active`; only the active one's with `only`)
// cut back to below its first scan-flow screen.
function withoutScanFlow(state: NavState, active = false, only = false): NavState {
  let next = state;
  for (const tab of TABS) {
    if (tab === state.tab ? !active : only) continue;
    const stack = state.stacks[tab];
    const at = stack.findIndex((entry) => SCAN_FLOW.has(entry.screen));
    if (at > 0) next = withStack(next, tab, stack.slice(0, at));
  }
  return next;
}

export type NavChange = { state: NavState; kind: 'slide' | 'fade'; dir: NavDir };

// What the router's `go(to, dir)` does, so the many go() calls keep their meaning. `subject` is
// what the store holds for `to` (subjectFor), read by the router just before:
// - a tab root: on its own tab, back to the root; on another tab, a jump there (Files from Home's
//   "See all", Files after a save, Home after the introduction). The tab it leaves keeps its
//   history, less a scan flow the jump ends, and goes on the trail, so Back returns there; the tab
//   it reaches starts at its root. Tabs are siblings, so it cross-fades;
// - `dir: 'back'` to a screen on the stack: back to it;
// - Done (§17 U9): the scan is saved, so Review and Save leave the stack and Done takes their place;
//   Back from it returns to where the scan was started;
// - the scan flow: pushed, and taken off any other tab's stack (see SCAN_FLOW);
// - library content: pushed, after the scan flow it ends (see CONTENT_SCREENS). With the flow
//   gone, the same screen and subject on top (the Reader that pages were added to) gives way to a
//   fresh instance, since its file changed;
// - anything else: pushed.
export function resolveGo(state: NavState, to: ScreenName, dir: NavDir, key: string, subject?: EntrySubject): NavChange {
  if (isTabRoot(to)) {
    if (to === state.tab) return { state: resetTab(state, to), kind: 'slide', dir };
    const left = withoutScanFlow(state, true, true);
    const stacks = { ...left.stacks, [to]: [rootEntry(to)] };
    return { state: { tab: to, stacks, tabTrail: trailAfter(state.tabTrail, state.tab, to) }, kind: 'fade', dir };
  }
  if (dir === 'back' && activeStack(state).some((entry) => entry.screen === to)) {
    return { state: popTo(state, to), kind: 'slide', dir };
  }
  if (to === 'done') return { state: push(withoutScanFlow(state, true), to, key), kind: 'slide', dir };
  if (SCAN_FLOW.has(to)) return { state: push(withoutScanFlow(state), to, key), kind: 'slide', dir };
  if (CONTENT_SCREENS.has(to)) {
    const after = withoutScanFlow(state, true);
    const top = topEntry(after);
    if (after !== state && top.screen === to && sameSubject(top.subject, subject) && !isRootEntry(top)) {
      return { state: withStack(after, after.tab, [...activeStack(after).slice(0, -1), { ...top, key }]), kind: 'slide', dir };
    }
    return { state: push(after, to, key, subject), kind: 'slide', dir };
  }
  return { state: push(state, to, key, subject), kind: 'slide', dir };
}
