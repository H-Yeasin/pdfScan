import { createContext, PropsWithChildren, useCallback, useContext, useMemo, useState } from 'react';
import type { NavDir, ScreenName } from '../types/navigation';

type RouterState = {
  screen: ScreenName;
  navDir: NavDir;
  navTick: number;
};

type RouterContextValue = RouterState & {
  go: (to: ScreenName, dir?: NavDir) => void;
};

const RouterContext = createContext<RouterContextValue | null>(null);

const INITIAL_STATE: RouterState = { screen: 'capture', navDir: 'fwd', navTick: 0 };

export function RouterProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<RouterState>(INITIAL_STATE);

  const go = useCallback((to: ScreenName, dir: NavDir = 'fwd') => {
    setState((s) => ({ screen: to, navDir: dir, navTick: s.navTick + 1 }));
  }, []);

  const value = useMemo<RouterContextValue>(() => ({ ...state, go }), [state, go]);

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRouter() {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error('useRouter must be used within a RouterProvider');
  return ctx;
}
