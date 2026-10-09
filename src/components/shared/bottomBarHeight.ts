import { useCallback, useEffect, useId, useRef, useSyncExternalStore } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { useScreenRole } from '../../navigation/screenRole';

// §14 Q4: the Snackbar lives once at the app root (App.tsx), so it can't know which screen is
// showing or how tall that screen's bottom bar is. Each bottom bar reports its measured height
// here (inset padding included) and the Snackbar floats above the tallest one, instead of every
// screen passing an offset down. §16 G2 keeps screens mounted off screen, so a bar counts only
// while its screen is the active one: the registry normally holds one bar.
const heights = new Map<string, number>();
const listeners = new Set<() => void>();
let tallest = 0;

function publish() {
  let next = 0;
  for (const h of heights.values()) next = Math.max(next, h);
  if (next === tallest) return;
  tallest = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getTallest() {
  return tallest;
}

// The height of the tallest bottom bar on screen, 0 when there is none.
export function useBottomBarHeight(): number {
  return useSyncExternalStore(subscribe, getTallest, getTallest);
}

// For a bottom-anchored bar: pass the returned handler as its onLayout. The entry is dropped when
// the bar unmounts (selection mode ends) or its screen stops being the active one, and comes
// back with the last measured height when it's active again (a hidden view isn't laid out
// again, so no new onLayout would say it).
export function useReportBottomBar(): (e: LayoutChangeEvent) => void {
  const id = useId();
  const active = useScreenRole() === 'active';
  const activeRef = useRef(active);
  activeRef.current = active;
  const height = useRef<number | null>(null);
  useEffect(
    () => () => {
      heights.delete(id);
      publish();
    },
    [id]
  );
  useEffect(() => {
    if (active && height.current !== null) heights.set(id, height.current);
    else heights.delete(id);
    publish();
  }, [id, active]);
  return useCallback(
    (e: LayoutChangeEvent) => {
      height.current = Math.round(e.nativeEvent.layout.height);
      if (!activeRef.current) return;
      heights.set(id, height.current);
      publish();
    },
    [id]
  );
}
