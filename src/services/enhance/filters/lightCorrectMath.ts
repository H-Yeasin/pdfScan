// Pure math for flat-field light correction (no Skia), shared by stats.ts and the reference checks.
// The GPU version in lightCorrect.ts runs the same divideByBackground formula per pixel in SkSL.
//
// The idea: a photo of paper is (paper reflectance) x (light falling on it). Estimate the light
// alone - the "background" - by removing the ink (a max filter takes each pixel's brightest
// neighbour, so thin dark strokes vanish) and smoothing what's left; then divide it out. A shadow
// or lamp tint multiplies paper and ink equally, so dividing removes it from both, and the ink
// keeps its contrast relative to the paper around it.

export const LIGHT_FLOOR = 0.05; // smallest background value divided by, so near-black areas can't blow up
export const PAPER_WHITE = 0.95; // where paper lands after correction; leaves the levels stretch some headroom
export const DARK_PAGE_MEDIAN = 0.35; // median luma below this means a dark page (blackboard, photo)

export type LightStats = {
  // Mostly-dark page: the background is estimated with a min filter (erode) instead of a max
  // filter, and the result is normalized to the page's own mean background rather than to white,
  // so a blackboard is evened out but stays dark (E5 does the rest).
  dark: boolean;
  // Mean of the estimated background, per channel, 0..1.
  bgMean: [number, number, number];
};

export function divideByBackground(src: number, bg: number, target: number): number {
  const v = (src / Math.max(bg, LIGHT_FLOOR)) * target;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// What corrected background maps to, per channel. Per-channel (not luma) on light pages is what
// also removes a coloured light cast: a yellow lamp tints the background yellow, and dividing
// each channel by its own background value brings the paper back to neutral.
export function correctionTarget(light: LightStats | undefined, paperWhite = PAPER_WHITE): [number, number, number] {
  if (light?.dark) return light.bgMean;
  return [paperWhite, paperWhite, paperWhite];
}

export function medianFromHistogram(counts: ArrayLike<number>, total: number): number {
  const half = total / 2;
  let seen = 0;
  for (let i = 0; i < 256; i++) {
    seen += counts[i];
    if (seen >= half) return i / 255;
  }
  return 1;
}

// 1-D reference of the background estimate (max or min filter, then a box blur standing in for
// the Gaussian). Not used by the app - it documents and checks the method on a single scanline.
export function estimateBackground1D(signal: number[], morphRadius: number, blurRadius: number, dark = false): number[] {
  const n = signal.length;
  const at = (arr: number[], i: number) => arr[Math.min(n - 1, Math.max(0, i))];
  const morph = signal.map((_, i) => {
    let v = signal[i];
    for (let d = -morphRadius; d <= morphRadius; d++) v = dark ? Math.min(v, at(signal, i + d)) : Math.max(v, at(signal, i + d));
    return v;
  });
  return morph.map((_, i) => {
    let sum = 0;
    for (let d = -blurRadius; d <= blurRadius; d++) sum += at(morph, i + d);
    return sum / (blurRadius * 2 + 1);
  });
}
