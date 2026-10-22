// §16 G9, dev only: named moments of a run, on the same clock as `performance.now()` (and as React
// Native's startup timing), for src/dev/PerfOverlay and docs/qa/performance.md. AppNavigator marks
// 'firstScreen' when boot is done, so the overlay can show how long that took from the process
// start without a screen recording. It's on the boot path, so it imports nothing; outside a dev
// build a mark is one comparison.

const marks: Record<string, number> = {};

// The first time only: a mark is "when this first happened" in this run.
export function markPerf(name: string): void {
  if (!__DEV__ || name in marks) return;
  marks[name] = performance.now();
}

export function perfMark(name: string): number | undefined {
  return marks[name];
}
