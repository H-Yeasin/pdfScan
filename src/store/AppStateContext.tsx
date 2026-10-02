import { createContext, Dispatch, PropsWithChildren, useContext, useRef, useState, useSyncExternalStore } from 'react';
import { appReducer, AppAction, AppState } from './appReducer';
import { initialAppState } from './initialState';

// §9 O5: the state lives in a small external store instead of a context value. A context value is
// recreated on every dispatch, so every consumer re-rendered on every action (snackbars, scan
// progress ticks, selection taps...). With the store, `useAppSelector` re-renders a component only
// when the slice it reads changes. Same reducer, same actions, same `dispatch`.
//
// `useAppState()` still returns the whole state (and so still re-renders on every change) for the
// code that hasn't moved to selectors yet.

export type AppStore = {
  getState: () => AppState;
  dispatch: Dispatch<AppAction>;
  subscribe: (listener: () => void) => () => void;
};

export function createStore(reducer: (state: AppState, action: AppAction) => AppState, initial: AppState): AppStore {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    dispatch: (action) => {
      const next = reducer(state, action);
      if (next === state) return;
      state = next;
      listeners.forEach((l) => l());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const AppStoreContext = createContext<AppStore | null>(null);

export function AppStateProvider({ children }: PropsWithChildren) {
  // One store per provider, so each test tree starts from the initial state.
  const [store] = useState(() => createStore(appReducer, initialAppState));
  return <AppStoreContext.Provider value={store}>{children}</AppStoreContext.Provider>;
}

function useStore(): AppStore {
  const store = useContext(AppStoreContext);
  if (!store) throw new Error('useAppState must be used within an AppStateProvider');
  return store;
}

// Stable for the life of the app: components that only dispatch never re-render from the store.
export function useAppDispatch(): Dispatch<AppAction> {
  return useStore().dispatch;
}

// Re-renders only when `selector(state)` changes by `isEqual` (default `Object.is`). The selector
// may be an inline arrow reading props: the last result is cached against the state and selector it
// came from, and an equal result keeps its old reference. A selector building a new array/object needs `isEqual` (e.g.
// `shallowEqual`) or a memoized selector (`createSelector`) to avoid re-rendering every time.
export function useAppSelector<T>(selector: (state: AppState) => T, isEqual: (a: T, b: T) => boolean = Object.is): T {
  const store = useStore();
  const cache = useRef<{ state: AppState; selector: (state: AppState) => T; value: T } | null>(null);
  const getSnapshot = () => {
    const state = store.getState();
    const prev = cache.current;
    if (prev && prev.state === state && prev.selector === selector) return prev.value;
    const value = selector(state);
    if (prev && isEqual(prev.value, value)) {
      cache.current = { state, selector, value: prev.value };
      return prev.value;
    }
    cache.current = { state, selector, value };
    return value;
  };
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}

// The named top-level slices, e.g. `useAppSlices('library', 'settings')`: the usual way a screen
// reads state. Re-renders when one of those slices changes, never for the others.
export function useAppSlices<K extends keyof AppState>(...keys: K[]): Pick<AppState, K> {
  return useAppSelector((s) => {
    const picked = {} as Pick<AppState, K>;
    keys.forEach((k) => {
      picked[k] = s[k];
    });
    return picked;
  }, shallowEqual);
}

// For event handlers that need the whole current state (e.g. `startScan(state, ...)`) without the
// component subscribing to all of it.
export function useAppStore(): AppStore {
  return useStore();
}

export function useAppState() {
  const store = useStore();
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  return { state, dispatch: store.dispatch };
}

// Equality for selectors returning a fresh array or plain object of stable references.
export function shallowEqual<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a) as (keyof T)[];
  const kb = Object.keys(b) as (keyof T)[];
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && Object.is(a[k], b[k]));
}

// A one-slot memoized selector: recomputes only when one of its inputs changes by reference.
// For derived lists (filtered/sorted documents) shared by several components.
export function createSelector<I extends unknown[], R>(
  inputs: { [K in keyof I]: (state: AppState) => I[K] },
  combine: (...args: I) => R
): (state: AppState) => R {
  let lastArgs: I | null = null;
  let lastResult: R;
  return (state) => {
    const args = inputs.map((fn) => fn(state)) as I;
    if (lastArgs && args.every((a, i) => Object.is(a, lastArgs![i]))) return lastResult;
    lastArgs = args;
    lastResult = combine(...args);
    return lastResult;
  };
}
