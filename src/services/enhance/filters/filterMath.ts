// Pure filter math: no Skia, no React Native. Everything here returns plain numbers or 20-element
// colour-matrix arrays, so it can be unit-tested directly (see docs/plan/02-review-enhance.md E1).
// The Skia side (registry.ts) only wraps these arrays in Skia.ColorFilter.MakeMatrix.

import { isDefaultAdjust } from '../adjust';
import type { AdjustValues, ChannelStats, ImageStats } from '../../../types/models';

export type ColorMatrix = number[];

// Must stay in sync with stats.ts's per-pixel luma - that is what makes lumaLevelsMatrix's stretch
// exactly equivalent to stretching the eventual gray output.
export const LUMA_R = 0.299;
export const LUMA_G = 0.587;
export const LUMA_B = 0.114;

export const CLIP_PERCENT = 0.01; // trim the darkest/brightest 1% per channel before finding endpoints, so a few noise/blown-out pixels can't anchor the whole stretch
export const LUMA_MIN_SPAN = 0.15; // floor on (hi-lo) for the gray luminance stretch
export const COLOR_MIN_SPAN = 0.25; // wider floor for auto/color's per-channel stretch - per-channel noise shouldn't drive a color correction
export const COLOR_SATURATION_BOOST = 0.25; // 1.25x - the per-channel stretch already adds apparent vividness, so this stacks on top of it

export const IDENTITY_MATRIX: ColorMatrix = [
  1, 0, 0, 0, 0,
  0, 1, 0, 0, 0,
  0, 0, 1, 0, 0,
  0, 0, 0, 1, 0,
];

export const GRAYSCALE_MATRIX: ColorMatrix = [
  LUMA_R, LUMA_G, LUMA_B, 0, 0,
  LUMA_R, LUMA_G, LUMA_B, 0, 0,
  LUMA_R, LUMA_G, LUMA_B, 0, 0,
  0, 0, 0, 1, 0,
];

export function contrastMatrix(contrast: number): ColorMatrix {
  // Skia's ColorFilter.MakeMatrix operates on unpremultiplied 0.0-1.0 float components (clamped
  // to that range), not 0-255 - a *255 term here made the translate wildly negative for any
  // contrast > 1, clamping every pixel to black regardless of input.
  const t = (1 - contrast) / 2;
  return [
    contrast, 0, 0, 0, t,
    0, contrast, 0, 0, t,
    0, 0, contrast, 0, t,
    0, 0, 0, 1, 0,
  ];
}

// brightness in -1..1, scaled to a max ±0.3 additive shift in Skia's unpremultiplied 0.0-1.0
// pixel space (same convention as contrastMatrix above).
export function brightnessMatrix(brightness: number): ColorMatrix {
  const t = brightness * 0.3;
  return [
    1, 0, 0, 0, t,
    0, 1, 0, 0, t,
    0, 0, 1, 0, t,
    0, 0, 0, 1, 0,
  ];
}

// saturation in -1..1 maps to a 0..2 multiplier (0 = grayscale, 1 = unchanged, 2 = oversaturated),
// interpolating each channel against the same luminance weights used by GRAYSCALE_MATRIX. Applied
// to an already-grayscale image this is a no-op (R=G=B collapses the interpolation to identity),
// so it's safe to compose unconditionally even when the filter is gray.
export function saturationMatrix(saturation: number): ColorMatrix {
  const s = 1 + saturation;
  const sr = (1 - s) * LUMA_R;
  const sg = (1 - s) * LUMA_G;
  const sb = (1 - s) * LUMA_B;
  return [
    sr + s, sg, sb, 0, 0,
    sr, sg + s, sb, 0, 0,
    sr, sg, sb + s, 0, 0,
    0, 0, 0, 1, 0,
  ];
}

// The brightness -> contrast -> saturation slider stack as an ordered list of matrices (applied
// first to last), or [] when every slider is at its default so callers can skip the extra compose
// work entirely. contrast/saturation reuse the same 0..2-multiplier convention as contrastMatrix.
export function adjustMatrices(adjust: AdjustValues): ColorMatrix[] {
  if (isDefaultAdjust(adjust)) return [];
  return [
    brightnessMatrix(adjust.brightness),
    contrastMatrix(1 + adjust.contrast),
    saturationMatrix(adjust.saturation),
  ];
}

// Finds the [lo,hi] endpoints of a 256-bin histogram after clipping CLIP_PERCENT of the samples
// off each end, normalised to 0..1.
export function channelStatsFromHistogram(counts: ArrayLike<number>, total: number): ChannelStats {
  const clipCount = Math.max(1, Math.floor(total * CLIP_PERCENT));
  let seen = 0;
  let lo = 0;
  for (let i = 0; i < 256; i++) {
    seen += counts[i];
    if (seen > clipCount) {
      lo = i;
      break;
    }
  }
  seen = 0;
  let hi = 255;
  for (let i = 255; i >= 0; i--) {
    seen += counts[i];
    if (seen > clipCount) {
      hi = i;
      break;
    }
  }
  return { lo: lo / 255, hi: hi / 255 };
}

// Converts a measured [lo,hi] range into a linear-stretch scale/translate. If the measured span
// is narrower than minSpan (a near-blank or very low-contrast page), the window is widened
// symmetrically around its own midpoint rather than just flooring the denominator - flooring the
// denominator alone while still anchoring the translate to the original (narrow) lo crushes
// shadows to black on e.g. a lightly-vignetted blank page, which is the opposite of "whiten the
// paper". Widening keeps both endpoints moving together, so a bright-but-flat page stays bright
// and a dark-but-flat page opens toward mid-gray instead of getting darker.
export function levelsScale(lo: number, hi: number, minSpan: number): { scale: number; translate: number } {
  let effLo = lo;
  let effHi = hi;
  if (effHi - effLo < minSpan) {
    const mid = (effLo + effHi) / 2;
    effLo = mid - minSpan / 2;
    effHi = mid + minSpan / 2;
    if (effLo < 0) {
      effHi -= effLo;
      effLo = 0;
    }
    if (effHi > 1) {
      effLo -= effHi - 1;
      effHi = 1;
    }
    effLo = Math.max(0, effLo);
    effHi = Math.min(1, effHi);
  }
  const scale = 1 / (effHi - effLo);
  return { scale, translate: -effLo * scale };
}

// Per-channel black/white-point stretch - each of R/G/B is independently pulled to its own
// measured range, which is what makes this double as white-balance correction (paper trends
// toward neutral white, not just higher contrast) rather than a plain contrast boost.
export function levelsMatrix(stats: ImageStats, minSpan = COLOR_MIN_SPAN): ColorMatrix {
  const r = levelsScale(stats.r.lo, stats.r.hi, minSpan);
  const g = levelsScale(stats.g.lo, stats.g.hi, minSpan);
  const b = levelsScale(stats.b.lo, stats.b.hi, minSpan);
  return [
    r.scale, 0, 0, 0, r.translate,
    0, g.scale, 0, 0, g.translate,
    0, 0, b.scale, 0, b.translate,
    0, 0, 0, 1, 0,
  ];
}

// Luminance-only stretch applied identically to R/G/B - preserves color ratios (irrelevant here
// since this feeds straight into a grayscale conversion) while normalizing exposure/contrast
// using the page's own measured tonal range instead of a fixed matrix.
export function lumaLevelsMatrix(stats: ImageStats, minSpan = LUMA_MIN_SPAN): ColorMatrix {
  const { scale, translate } = levelsScale(stats.luma.lo, stats.luma.hi, minSpan);
  return [
    scale, 0, 0, 0, translate,
    0, scale, 0, 0, translate,
    0, 0, scale, 0, translate,
    0, 0, 0, 1, 0,
  ];
}

// Per-filter matrix chains (applied first to last). These are exactly the chains the pre-E1
// `baseModeFilter` composed, kept as data so the "export output for auto/color/gray is unchanged"
// check can compare arrays instead of rendered pixels. The optional arguments exist for the Filter
// Lab's sliders; their defaults are the shipped constants.
export function autoMatrices(stats: ImageStats, minSpan = COLOR_MIN_SPAN): ColorMatrix[] {
  return [levelsMatrix(stats, minSpan)];
}

// Correct the colour cast first, then boost vividness.
export function colorMatrices(stats: ImageStats, minSpan = COLOR_MIN_SPAN, saturationBoost = COLOR_SATURATION_BOOST): ColorMatrix[] {
  return [levelsMatrix(stats, minSpan), saturationMatrix(saturationBoost)];
}

export function grayMatrices(stats: ImageStats, minSpan = LUMA_MIN_SPAN): ColorMatrix[] {
  return [lumaLevelsMatrix(stats, minSpan), GRAYSCALE_MATRIX];
}
