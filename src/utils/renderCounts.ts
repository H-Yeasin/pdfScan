import { useSyncExternalStore } from 'react';

// §16 G5, dev only: how often each named component rendered, for docs/qa/performance.md and G9.
// A component calls `useRenderCount('Library')` at the top; src/dev/RenderCountOverlay (Settings →
// Developer → Render counts) shows the numbers, and which ones moved since the last look. This
// file is outside src/dev because the screens it counts import it; it imports nothing but React.
//
// Counting only happens while the overlay is shown, and never in a release build (`__DEV__` is
// false there, and the call is one comparison). The counts live outside React, so counting a render
// doesn't cause one; the overlay is told a little later, on a timer.
//
// React's StrictMode and the dev-time double render aren't used here, so a count is a real render.

export type RenderCounts = Readonly<Record<string, number>>;

const NONE: RenderCounts = {};
const NOTIFY_MS = 200;

let shown = false;
let counts: Record<string, number> = {};
// What subscribers see: replaced (never mutated) when the timer fires.
let snapshot: RenderCounts = NONE;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function publish(): void {
  timer = null;
  snapshot = { ...counts };
  listeners.forEach((l) => l());
}

function schedule(): void {
  if (timer === null) timer = setTimeout(publish, NOTIFY_MS);
}

export function useRenderCount(name: string): void {
  if (!__DEV__ || !shown) return;
  counts[name] = (counts[name] ?? 0) + 1;
  schedule();
}

export function renderCountsShown(): boolean {
  return shown;
}

export function setRenderCountsShown(on: boolean): void {
  if (shown === on) return;
  shown = on;
  counts = {};
  if (timer !== null) clearTimeout(timer);
  publish();
}

// Back to zero: do it, then the gesture being measured, then read the overlay.
export function resetRenderCounts(): void {
  counts = {};
  if (timer !== null) clearTimeout(timer);
  publish();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useRenderCountsShown(): boolean {
  return useSyncExternalStore(subscribe, renderCountsShown, renderCountsShown);
}

const getSnapshot = () => snapshot;

export function useRenderCounts(): RenderCounts {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
