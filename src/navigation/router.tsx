import { createContext, PropsWithChildren, useCallback, useContext, useMemo, useState } from 'react';
import type { NavDir, ScreenName } from '../types/navigation';
import { createId } from '../utils/id';
import {
  initialNav,
  pop,
  replace as replaceNav,
  resetTab,
  resolveGo,
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
  // The tab bar: keeps each tab's stack; tapping the active tab goes back to its root.
  switchTab: (tab: TabId) => void;
  // Switches screen with no transition and no history - for the boot-time choice of start screen.
  replace: (to: ScreenName) => void;
};

const RouterContext = createContext<RouterContextValue | null>(null);

const INITIAL_STATE: RouterState = {
  nav: initialNav('capture'),
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
  const [state, setState] = useState<RouterState>(INITIAL_STATE);

  const go = useCallback((to: ScreenName, dir: NavDir = 'fwd') => {
    const key = createId('screen');
    setState((s) => applyChange(s, resolveGo(s.nav, to, dir, key)));
  }, []);

  const back = useCallback(() => {
    setState((s) => applyChange(s, { state: pop(s.nav), kind: 'slide', dir: 'back' }));
  }, []);

  const switchTab = useCallback((tab: TabId) => {
    setState((s) =>
      applyChange(
        s,
        tab === s.nav.tab ? { state: resetTab(s.nav, tab), kind: 'slide', dir: 'back' } : { state: switchNavTab(s.nav, tab), kind: 'fade', dir: 'fwd' }
      )
    );
  }, []);

  const replace = useCallback((to: ScreenName) => {
    const key = createId('screen');
    setState((s) => ({ ...s, nav: replaceNav(s.nav, to, key) }));
  }, []);

  const value = useMemo<RouterContextValue>(
    () => ({ ...state, screen: topEntry(state.nav).screen, tab: state.nav.tab, go, back, switchTab, replace }),
    [state, go, back, switchTab, replace]
  );

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRouter() {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error('useRouter must be used within a RouterProvider');
  return ctx;
}
