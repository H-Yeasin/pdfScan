import { createContext, PropsWithChildren, useCallback, useContext, useMemo, useState } from 'react';
import type { HubScreen, NavDir, ScreenName, TabHub } from '../types/navigation';

type RouterState = {
  screen: ScreenName;
  // The screen `go()` was called FROM, one hop back - lets a screen reachable from more than one
  // place (e.g. academicOptions, opened from both Review and Deliver) send its own "Back" button
  // to wherever the user actually came from, instead of a single hardcoded destination.
  previousScreen: ScreenName | null;
  navDir: NavDir;
  navTick: number;
  // The last hub (Home, Library or a Course page) and the last tab (Home or Library) visited.
  // Reader and Settings go back to `hub`; a Course page goes back to `tabHub`. This replaces
  // hardcoded "back to Library" now that documents are opened from Home and Course pages too.
  hub: HubScreen;
  tabHub: TabHub;
};

type RouterContextValue = RouterState & {
  go: (to: ScreenName, dir?: NavDir) => void;
  // Switches screen with no transition and no history - for the boot-time choice of start screen.
  replace: (to: ScreenName) => void;
};

const RouterContext = createContext<RouterContextValue | null>(null);

const INITIAL_STATE: RouterState = {
  screen: 'capture',
  previousScreen: null,
  navDir: 'fwd',
  navTick: 0,
  hub: 'library',
  tabHub: 'library',
};

function withHubs(state: RouterState, to: ScreenName): Pick<RouterState, 'hub' | 'tabHub'> {
  const isTab = to === 'home' || to === 'library';
  return {
    hub: isTab || to === 'course' ? to : state.hub,
    tabHub: isTab ? to : state.tabHub,
  };
}

export function RouterProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<RouterState>(INITIAL_STATE);

  const go = useCallback((to: ScreenName, dir: NavDir = 'fwd') => {
    setState((s) => ({ ...s, ...withHubs(s, to), screen: to, previousScreen: s.screen, navDir: dir, navTick: s.navTick + 1 }));
  }, []);

  const replace = useCallback((to: ScreenName) => {
    setState((s) => ({ ...s, ...withHubs(s, to), screen: to, previousScreen: null }));
  }, []);

  const value = useMemo<RouterContextValue>(() => ({ ...state, go, replace }), [state, go, replace]);

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRouter() {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error('useRouter must be used within a RouterProvider');
  return ctx;
}
