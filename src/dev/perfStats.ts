// §16 G9, dev only: the arithmetic behind src/dev/PerfOverlay, kept apart so it can be tested
// without frames or a device.

// JS frames: the overlay calls `frame(t)` from a requestAnimationFrame loop. The rate is counted
// over the last `windowMs`, so a stall shows at once and leaves again; the slowest frame is kept
// since the last reset, so a hitch that came and went while you looked away still shows.
export type FrameReading = { fps: number; worstMs: number; frames: number };

export function createFrameMeter(windowMs = 1000) {
  let times: number[] = [];
  let last: number | null = null;
  let worst = 0;
  let total = 0;
  return {
    frame(t: number): void {
      if (last !== null) worst = Math.max(worst, t - last);
      last = t;
      total += 1;
      times.push(t);
      while (times.length > 0 && times[0] < t - windowMs) times.shift();
    },
    read(): FrameReading {
      // n timestamps span n - 1 frame intervals.
      const span = times.length > 1 ? times[times.length - 1] - times[0] : 0;
      const fps = span > 0 ? ((times.length - 1) * 1000) / span : 0;
      return { fps: Math.round(fps), worstMs: Math.round(worst), frames: total };
    },
    reset(): void {
      times = [];
      last = null;
      worst = 0;
      total = 0;
    },
  };
}

// What React Native's `performance` knows about this run (RN 0.86, New Architecture). Not in the
// TypeScript types (they are Node's), and a field can be null when the host didn't record it, so
// everything is optional. All on the `performance.now()` clock.
export type RnPerformance = {
  now(): number;
  rnStartupTiming?: {
    startTime?: number | null;
    initializeRuntimeStart?: number | null;
    executeJavaScriptBundleEntryPointStart?: number | null;
  };
  memory?: { usedJSHeapSize?: number | null };
};

export type StartupReading = {
  // From the process start (React Native's app-startup marker) when known, else from the runtime's start.
  sinceStartMs: number;
  // When the JS bundle began to run, and when the first screen was up (perfMarks 'firstScreen'),
  // both from the same start.
  bundleAtMs?: number;
  firstScreenAtMs?: number;
  heapMb?: number;
};

export function readStartup(perf: RnPerformance, firstScreen?: number): StartupReading {
  let timing: RnPerformance['rnStartupTiming'];
  try {
    timing = perf.rnStartupTiming;
  } catch {
    // No native performance module (a test, an old host): just the clock.
  }
  const origin = timing?.startTime ?? timing?.initializeRuntimeStart ?? 0;
  const bundle = timing?.executeJavaScriptBundleEntryPointStart;
  let heap: number | null | undefined;
  try {
    heap = perf.memory?.usedJSHeapSize;
  } catch {
    heap = undefined;
  }
  return {
    sinceStartMs: Math.round(perf.now() - origin),
    bundleAtMs: bundle != null ? Math.round(bundle - origin) : undefined,
    firstScreenAtMs: firstScreen !== undefined ? Math.round(firstScreen - origin) : undefined,
    heapMb: heap != null ? Math.round(heap / 1_048_576) : undefined,
  };
}

export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`;
}
