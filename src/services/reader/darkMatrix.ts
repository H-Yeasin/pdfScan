import type { NightStrength } from '../documents/readingSettings';
import type { PdfColorMatrix } from '../pdf/pdfNative';

// §18 W9: true dark pages. Night mode used to lay a dim sheet over a white page; here the page
// itself is redrawn dark: white becomes the palette's paper, black its ink. A plain invert would
// also turn a red diagram cyan and a face blue, so the colours are inverted and then turned half
// way round the hue circle, which gives light ↔ dark with the hues roughly where they were.
//
// Native code applies the matrix while it renders or decodes (renderPageImage, decodeImage), so
// the dark page is an ordinary JPEG in the cache and nothing is filtered on the UI thread.

export type NightPalette = {
  // What a white page becomes, and what black text becomes ('#rrggbb').
  paper: string;
  ink: string;
};

// A page before its picture has loaded, by day: PDFs and scans are black on white whatever the
// app's theme is, so a themed surface colour would flash to white under every page.
export const DAY_PAPER = '#ffffff';

// Stronger = darker paper. The ink dims with it on the first two so the contrast stays gentle;
// on black the ink stays below pure white, which glares on an OLED screen.
export const NIGHT_PALETTES: Record<NightStrength, NightPalette> = {
  low: { paper: '#2a2723', ink: '#d8d2c6' },
  medium: { paper: '#201e1d', ink: '#d4cfc6' },
  high: { paper: '#000000', ink: '#d0d0d0' },
};

// Hue rotation by 180° (the SVG/CSS `hue-rotate` matrix at cos = -1, sin = 0): twice the
// luminance minus the colour. Every row adds up to 1, so greys stay grey.
const LUMA = [0.213, 0.715, 0.072];
const HUE_HALF_TURN = [0, 1, 2].map((row) => LUMA.map((weight, col) => 2 * weight - (row === col ? 1 : 0)));

function channels(hex: string): [number, number, number] {
  const value = /^#?([0-9a-f]{6})$/i.exec(hex)?.[1];
  if (!value) throw new Error(`Not a #rrggbb colour: ${hex}`);
  return [0, 2, 4].map((at) => parseInt(value.slice(at, at + 2), 16)) as [number, number, number];
}

// The 4×5 colour matrix (row-major, offsets in 0..255) that draws a page in the palette:
//   out = ink + (paper - ink) × hueHalfTurn(colour) / 255, per channel.
// It is "invert, turn the hue, then map white → paper and black → ink" multiplied out: inverting
// and then turning the hue sends white to black and black to white (the rows add up to 1), and
// the last step stretches that range between ink and paper. Alpha is left alone.
export function darkPageMatrix(paper: string, ink: string): PdfColorMatrix {
  const to = channels(paper);
  const from = channels(ink);
  const matrix: number[] = [];
  for (let row = 0; row < 3; row += 1) {
    const span = (to[row] - from[row]) / 255;
    matrix.push(HUE_HALF_TURN[row][0] * span, HUE_HALF_TURN[row][1] * span, HUE_HALF_TURN[row][2] * span, 0, from[row]);
  }
  matrix.push(0, 0, 0, 1, 0);
  return matrix;
}

export function nightMatrix(palette: NightPalette): PdfColorMatrix {
  return darkPageMatrix(palette.paper, palette.ink);
}

// §18 W15: the marks are drawn over the page, not into its picture, so on a night page the
// ink-like ones (pen, underline, strike, typed text, a signature) go through the same change as
// the page's own ink: a black pen stroke would vanish on dark paper. One colour through the
// matrix ('#rrggbb' in and out):
export function nightColor(hex: string, palette: NightPalette): string {
  const m = nightMatrix(palette);
  const [r, g, b] = channels(hex);
  const out = [0, 1, 2].map((row) => {
    const value = m[row * 5] * r + m[row * 5 + 1] * g + m[row * 5 + 2] * b + m[row * 5 + 4];
    return Math.max(0, Math.min(255, Math.round(value)));
  });
  return `#${out.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

// The same matrix as Skia's colour filter takes it (offsets in 0..1), for a signature's image.
export function skiaNightMatrix(palette: NightPalette): number[] {
  return nightMatrix(palette).map((value, i) => (i % 5 === 4 ? value / 255 : value));
}

// Names the palette in a cache key: its colours, so a retuned palette never shows files rendered
// with the old one.
export function paletteKey(palette: NightPalette): string {
  return `${palette.paper}${palette.ink}`.replace(/#/g, '').toLowerCase();
}
