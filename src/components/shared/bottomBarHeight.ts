import { useCallback, useEffect, useId, useSyncExternalStore } from 'react';
import type { LayoutChangeEvent } from 'react-native';

// §14 Q4: the Snackbar lives once at the app root (App.tsx), so it can't know which screen is
// showing or how tall that screen's bottom bar is. Each bottom bar reports its measured height
// here (inset padding included) and the Snackbar floats above the tallest one, instead of every
// screen passing an offset down. Only the current screen is mounted (custom router), so the
// registry normally holds one bar.
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
// the bar unmounts (selection mode ends, the screen changes).
export function useReportBottomBar(): (e: LayoutChangeEvent) => void {
  const id = useId();
  useEffect(
    () => () => {
      heights.delete(id);
      publish();
    },
    [id]
  );
  return useCallback(
    (e: LayoutChangeEvent) => {
      heights.set(id, Math.round(e.nativeEvent.layout.height));
      publish();
    },
    [id]
  );
}
