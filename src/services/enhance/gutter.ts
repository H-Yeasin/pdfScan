// Pure maths for Book mode's spread splitting (no Skia, so it's unit-testable). splitSpread.ts
// measures the columns and does the pixel work.

// Only clearly landscape images are treated as two-page spreads; a portrait (or near-square)
// capture is a single page and is never split.
export const SPREAD_MIN_ASPECT = 1.15;

// The gutter is only searched for in the middle of the spread: the binding is never near the
// outer edges, and those often hold dark table/background borders that would win otherwise.
export const GUTTER_SEARCH_START = 0.3;
export const GUTTER_SEARCH_END = 0.7;

// Minimum relative dip of the darkest (smoothed) column below the search band's median brightness
// before we trust it as a binding shadow; anything flatter splits at the exact centre.
export const GUTTER_MIN_CONTRAST = 0.06;

export function isSpread(width: number, height: number): boolean {
  return width > height * SPREAD_MIN_ASPECT;
}

export type GutterResult = {
  // Split position as a fraction of the width (0..1).
  position: number;
  // False when no clear dip was found and the result is the centre fallback.
  detected: boolean;
};

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// `columns` is the average brightness of each pixel column (any scale, e.g. 0..255), left to
// right. Returns where the darkest band in the middle 40 % is - the shadow along the binding.
// A 3-column moving average keeps a single noisy column (a pen stroke, a JPEG artefact) from
// being picked over the real, wider gutter shadow.
export function findGutter(columns: readonly number[]): GutterResult {
  const n = columns.length;
  const centre: GutterResult = { position: 0.5, detected: false };
  if (n < 5) return centre;

  const start = Math.max(1, Math.floor(n * GUTTER_SEARCH_START));
  const end = Math.min(n - 2, Math.ceil(n * GUTTER_SEARCH_END) - 1);
  if (end <= start) return centre;

  const smoothed: number[] = [];
  for (let i = start; i <= end; i++) smoothed.push((columns[i - 1] + columns[i] + columns[i + 1]) / 3);

  let minIndex = 0;
  for (let i = 1; i < smoothed.length; i++) if (smoothed[i] < smoothed[minIndex]) minIndex = i;

  const reference = median(smoothed);
  if (!(reference > 0)) return centre;
  const contrast = (reference - smoothed[minIndex]) / reference;
  if (contrast < GUTTER_MIN_CONTRAST) return centre;

  // A real binding shadow is a flat-bottomed band several columns wide; split at the middle of
  // the contiguous run around the darkest column that sits within 1 % of it, not at its edge.
  const floor = smoothed[minIndex] + reference * 0.01;
  let runStart = minIndex;
  let runEnd = minIndex;
  while (runStart > 0 && smoothed[runStart - 1] <= floor) runStart--;
  while (runEnd < smoothed.length - 1 && smoothed[runEnd + 1] <= floor) runEnd++;
  const centreIndex = (runStart + runEnd) / 2;

  // Column centre, as a fraction of the width.
  return { position: (start + centreIndex + 0.5) / n, detected: true };
}
