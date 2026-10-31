import { createContext, PropsWithChildren, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { useAppStore } from '../store/AppStateContext';
import type { NavDir, ScreenName } from '../types/navigation';
import { createId } from '../utils/id';
import { traceMark } from '../utils/trace';
import {
  activeStack,
  backToTab as backToNavTab,
  initialNav,
  pop,
  reopen as reopenNav,
  replace as replaceNav,
  resetTab,
  resolveGo,
  restoreSubject,
  sameSubject,
  subjectFor,
  switchTab as switchNavTab,
  topEntry,
  type Entry,
  type NavChange,
  type NavState,
  type TabId,
} from './navStack';

// §16 G2: a back stack per tab (navStack.ts). The API the screens use stayed the same - `go(to)`,
// `go(to, 'back')`, `screen` - so the many go() calls kept working; `back()` is new. Detours like
// Pro are plain pushes now, and `previousScreen`/`hub`/`tabHub` went: Back pops.
//
// Each entry keeps what it shows (navStack.Entry.subject: the Reader's document, a course page's
// course), read from the store when it's opened. When a change reveals an entry whose subject the
// store no longer holds (Back to Reader A from Reader B, a tab whose top is another course), the
// router puts it back in the same event, so the revealed screen's first render on screen reads
// its own subject.

// The last change of top screen, for AppNavigator to animate: `from` is the entry that was on top.
export type Transition = { kind: 'slide' | 'fade' | 'none'; dir: NavDir; from: Entry | null };

type RouterState = {
  nav: NavState;
  transition: Transition;
  // Counts changes of top screen (`replace` doesn't count). One-time hints use it as "a visit".
  navTick: number;
};

type RouterContextValue = RouterState & {
  // The screen on top of the active tab's stack.
  screen: ScreenName;
  tab: TabId;
  go: (to: ScreenName, dir?: NavDir) => void;
  // Pops the top screen (slides back); nothing when it's the only one.
  back: () => void;
  // Back on a tab's root: the tab left last, or Home (navStack.backToTab).
  backToTab: () => void;
  // Back to the nearest `to` on the stack as a fresh instance (navStack.reopen).
  reopen: (to: ScreenName) => void;
  // The store's subject changed under the screen on top without a go() (the Reader's "Add to
  // Library" turns the open file into a library document): the top entry takes it on.
  syncTopSubject: () => void;
  // The tab bar: keeps each tab's stack; tapping the active tab goes back to its root.
  switchTab: (tab: TabId) => void;
  // Switches screen with no transition and no history - for the boot-time choice of start screen.
  replace: (to: ScreenName) => void;
};

const RouterContext = createContext<RouterContextValue | null>(null);

const INITIAL_STATE: RouterState = {
  nav: initialNav('home'),
  transition: { kind: 'none', dir: 'fwd', from: null },
  navTick: 0,
};

function applyChange(s: RouterState, change: NavChange): RouterState {
  if (change.state === s.nav) return s;
  const from = topEntry(s.nav);
  // The stacks changed under the top screen: nothing to show.
  if (topEntry(change.state).key === from.key) return { ...s, nav: change.state };
  return { nav: change.state, transition: { kind: change.kind, dir: change.dir, from }, navTick: s.navTick + 1 };
}

export function RouterProvider({ children }: PropsWithChildren) {
  const store = useAppStore();
  const [state, setState] = useState<RouterState>(INITIAL_STATE);
  // The state as of the last change, so a change is computed (and its subject restored) at once,
  // in the event that asked for it, rather than in a setState updater.
  const stateRef = useRef(state);

  const commit = useCallback(
    (next: (s: RouterState) => RouterState) => {
      const before = stateRef.current;
      const after = next(before);
      if (after === before) return;
      stateRef.current = after;
      setState(after);
      const top = topEntry(after.nav);
      if (top.key === topEntry(before.nav).key) return;
      const restore = restoreSubject(top, store.getState());
      if (restore) store.dispatch(restore);
    },
    [store]
  );

  // §19 X1: each change of screen is a moment in a release build's trace ('nav.reader', 'tab.library',
  // 'nav.back'), where a journey's step starts; the step ends at the next mark that matters.
  const go = useCallback(
    (to: ScreenName, dir: NavDir = 'fwd') => {
      traceMark(`nav.${to}`);
      const key = createId('screen');
      const subject = subjectFor(to, store.getState());
      commit((s) => applyChange(s, resolveGo(s.nav, to, dir, key, subject)));
    },
    [commit, store]
  );

  const back = useCallback(() => {
    traceMark('nav.back');
    commit((s) => applyChange(s, { state: pop(s.nav), kind: 'slide', dir: 'back' }));
  }, [commit]);

  const backToTab = useCallback(() => {
    traceMark('nav.back');
    commit((s) => applyChange(s, backToNavTab(s.nav)));
  }, [commit]);

  const reopen = useCallback(
    (to: ScreenName) => {
      traceMark(`nav.${to}`);
      const key = createId('screen');
      commit((s) => applyChange(s, { state: reopenNav(s.nav, to, key), kind: 'slide', dir: 'back' }));
    },
    [commit]
  );

  const switchTab = useCallback(
    (tab: TabId) => {
      traceMark(`tab.${tab}`);
      commit((s) =>
        applyChange(
          s,
          tab === s.nav.tab ? { state: resetTab(s.nav, tab), kind: 'slide', dir: 'back' } : { state: switchNavTab(s.nav, tab), kind: 'fade', dir: 'fwd' }
        )
      );
    },
    [commit]
  );

  const replace = useCallback(
    (to: ScreenName) => {
      const key = createId('screen');
      commit((s) => ({ ...s, nav: replaceNav(s.nav, to, key) }));
    },
    [commit]
  );

  const syncTopSubject = useCallback(() => {
    commit((s) => {
      const top = topEntry(s.nav);
      const subject = subjectFor(top.screen, store.getState());
      if (!subject || sameSubject(top.subject, subject)) return s;
      const stack = activeStack(s.nav);
      const stacks = { ...s.nav.stacks, [s.nav.tab]: [...stack.slice(0, -1), { ...top, subject }] };
      return { ...s, nav: { ...s.nav, stacks } };
    });
  }, [commit, store]);

  const value = useMemo<RouterContextValue>(
    () => ({ ...state, screen: topEntry(state.nav).screen, tab: state.nav.tab, go, back, backToTab, reopen, switchTab, replace, syncTopSubject }),
    [state, go, back, backToTab, reopen, switchTab, replace, syncTopSubject]
  );

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRouter() {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error('useRouter must be used within a RouterProvider');
  return ctx;
}
