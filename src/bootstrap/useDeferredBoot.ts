import { useEffect, useState } from 'react';

// §9 O5: background boot work (the storage integrity check, imported-PDF indexing, stale reminder
// clean-up, crash-reporting init) waits until the first screen is up and has had a moment to
// settle, so it doesn't compete with the cold start. InteractionManager is deprecated in RN 0.86,
// hence a plain timeout after `ready` (which AppNavigator sets once the start screen rendered).
export const BOOT_DEFER_MS = 1500;

export function useDeferredBoot(ready: boolean, delayMs = BOOT_DEFER_MS): boolean {
  const [deferredReady, setDeferredReady] = useState(false);
  useEffect(() => {
    if (!ready || deferredReady) return;
    const id = setTimeout(() => setDeferredReady(true), delayMs);
    return () => clearTimeout(id);
  }, [ready, deferredReady, delayMs]);
  return deferredReady;
}
