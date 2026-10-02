import { useCallback, useLayoutEffect, useRef } from 'react';

// §9 O5: a callback whose identity never changes but always calls the latest `fn`. Lets list rows
// wrapped in `React.memo` take handlers without re-rendering every time the parent does (the
// handlers close over selection and other state that changes often).
export function useStableCallback<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const ref = useRef(fn);
  useLayoutEffect(() => {
    ref.current = fn;
  });
  return useCallback((...args: A) => ref.current(...args), []);
}
