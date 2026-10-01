// Pure maths for the Board filter (no Skia). board.ts runs the SAME formulas per pixel in SkSL;
// keep the two in sync. Inputs are light-corrected (lightCorrect.ts): a whiteboard's surface sits
// near PAPER_WHITE, and a dark board's surface sits evenly at its own mean colour (`board`).

import { LUMA_B, LUMA_G, LUMA_R } from './filterMath';
import type { FilterOptions, ImageStats } from '../../../types/models';

export type Rgb = [number, number, number];
export type WhiteboardParams = { whitePoint: number; satBoost: number; markerGamma: number; glareLuma: number; glareChroma: number };

export const WHITE_POINT = 0.9; // corrected value that becomes pure white (the surface sits near 0.95)
export const SAT_BOOST = 0.5; // 1.5x marker saturation
export const MARKER_GAMMA = 1.3; // > 1 darkens marker strokes; white stays white
export const GLARE_LUMA = 0.96; // glare: brighter than this (before the white point) ...
export const GLARE_CHROMA = 0.12; // ... and less colourful than this becomes white
export const DARK_FLOOR = 0.12; // board tone when "Keep dark background" is on
export const CHALK_INK = 0.15; // inverted chalk tone: dark, but light enough for coloured chalk to keep a visible hue
export const CHALK_PERCENTILE = 0.98; // brightest 2% of a dark board is chalk
const MIN_CHALK_SPAN = 0.15;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const luma = (c: Rgb) => LUMA_R * c[0] + LUMA_G * c[1] + LUMA_B * c[2];
const chroma = (c: Rgb) => Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]);

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

// 'auto' follows the dark-page detection light correction already did (median raw luma below
// DARK_PAGE_MEDIAN, see stats.ts), so the board type and the correction always agree.
export function isDarkBoard(style: FilterOptions['boardStyle'], stats: Pick<ImageStats, 'light'>): boolean {
  if (style === 'light') return false;
  if (style === 'dark') return true;
  return !!stats.light?.dark;
}

// Chalk luma for the dark-board stretch: the corrected page's bright tail, never closer than
// MIN_CHALK_SPAN to the board itself (a nearly empty board would otherwise amplify noise).
export function chalkLevel(board: Rgb, bright: number | undefined): number {
  return Math.min(1, Math.max(bright ?? 1, luma(board) + MIN_CHALK_SPAN));
}

// Whiteboard or screen: white point, marker saturation and darkening, glare to white.
export function whiteboardPixel(c: Rgb, p: WhiteboardParams): Rgb {
  const glare = smoothstep(p.glareLuma - 0.02, p.glareLuma + 0.02, luma(c)) * (1 - smoothstep(p.glareChroma - 0.04, p.glareChroma + 0.04, chroma(c)));
  const lifted = c.map((v) => clamp01(v / p.whitePoint)) as Rgb;
  const l = luma(lifted);
  const saturated = lifted.map((v) => clamp01(l + (v - l) * (1 + p.satBoost))) as Rgb;
  const darkened = saturated.map((v) => Math.pow(v, p.markerGamma)) as Rgb;
  return darkened.map((v) => v + (1 - v) * glare) as Rgb;
}

// Dark board. Every colour splits into luma + a chroma offset whose own luma is 0 (the weights sum
// to 1), so the luma can be remapped while the offset - the hue - is kept. The board's own cast
// (green board) is subtracted from the offset in proportion to how board-like the pixel is (1 - t):
// the board comes out neutral, while chalk - opaque, drawn on top - keeps its own colour (white
// chalk would otherwise pick up the cast's complement and turn magenta).
//   inverted: board -> white, chalk -> CHALK_INK (printable, saves toner);
//   keepDark: board -> DARK_FLOOR, chalk -> white; only contrast and the cast are fixed.
export function darkBoardPixel(c: Rgb, board: Rgb, chalk: number, keepDark: boolean): Rgb {
  const boardLuma = luma(board);
  const l = luma(c);
  const t = clamp01((l - boardLuma) / Math.max(chalk - boardLuma, 0.01));
  const outLuma = keepDark ? DARK_FLOOR + (1 - DARK_FLOOR) * t : 1 - (1 - CHALK_INK) * t;
  const offset = [0, 1, 2].map((i) => c[i] - l - (board[i] - boardLuma) * (1 - t)) as Rgb;
  const k = offsetScale(outLuma, offset);
  return offset.map((d) => clamp01(outLuma + d * k)) as Rgb;
}

// Largest k <= 1 that keeps outLuma + k*offset inside 0..1 on every channel. Scaling (rather than
// clamping each channel) is what keeps the hue exact: the offset's direction never changes, only
// its strength. Clamping would turn dark yellow chalk into plain brown-black.
export function offsetScale(outLuma: number, offset: Rgb): number {
  let k = 1;
  for (const d of offset) {
    if (d < 0) k = Math.min(k, outLuma / -d);
    else if (d > 0) k = Math.min(k, (1 - outLuma) / d);
  }
  return Math.max(0, k);
}
