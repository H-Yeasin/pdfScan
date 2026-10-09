// §15 V1: the logo's colours, copied from the owner's files in assets/brand/ (pdfscan-mark.svg, the
// "P"; pdfscan-tile.svg, the rounded tile behind it). They are the same in both themes, because the
// logo is the logo: the theme only changes what goes around it. The shapes, and the gradients' end
// points, are in components/brand/markGeometry.ts. theme/__tests__/brandSync.test.ts reads both SVGs
// and fails if a value here drifts from them, so change the SVG first, then this file.
//
// Each gradient lists its stops with their offsets (an SVG <stop> without an offset is at 0), in the
// order the SVG has them, ready for Skia's LinearGradient `colors` and `positions`.
export const BRAND = {
  // Top right → bottom left.
  tile: { stops: ['#155437', '#7E8693'], offsets: [0, 1] },
  // The white pieces of the mark, and the fold's outline.
  paper: '#ffffff',
  // The ribbon that sweeps down-left across the stem.
  ribbon: { stops: ['#1F774D', '#1F3C26'], offsets: [0, 0.766109] },
  // The solid green inside of the bowl.
  green: '#1E754A',
  // The diagonal band from the top right into the bowl.
  diagonal: { stops: ['#0F5B3C', '#259663'], offsets: [0, 1] },
  // The folded corner.
  fold: { stops: ['#37AE79', '#11704A'], offsets: [0.403846, 1] },
  // The mark's drop shadow, in mark units (the mark's viewBox): offset, Gaussian blur σ, and its
  // colour and opacity (the file's colour matrix zeroes every channel: black). It is part of the
  // logo, so it is drawn in both themes.
  shadow: { dx: 13, dy: 15, blur: 37.85, color: '#000000', opacity: 0.39 },
} as const;

export type BrandGradient = { readonly stops: readonly string[]; readonly offsets: readonly number[] };

// `hex` (#rrggbb) at `alpha`, for the logo's few translucent colours (the mark's shadow filter, the
// splash intro's light band), which Skia takes as one colour rather than a colour and an opacity.
export function rgba(hex: string, alpha: number): string {
  'worklet';
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// §15 V2: the native splash. expo-splash-screen draws assets/splash-icon{,-dark}.png SPLASH_IMAGE_DP
// wide (app.json's imageWidth) in the middle of the theme's bg, and the full logo tile is
// SPLASH_TILE_FRACTION of that image. Android 12+ cuts the splash icon to a 192 dp circle; the tile's
// farthest point (on its very round corners) is 0.554 × its width from the centre, so a 140 dp tile
// reaches 77.6 dp, and with its shadow about 92 dp: inside. scripts/make-icons.mjs has the same
// fraction, and brandSync.test.ts checks it. The splash intro (V5) draws the identical frame from these.
export const SPLASH_IMAGE_DP = 160;
export const SPLASH_TILE_FRACTION = 0.875;
export const SPLASH_TILE_DP = SPLASH_IMAGE_DP * SPLASH_TILE_FRACTION;

// What the app adds round the owner's tile so it sits on the theme's background (the splash images,
// and BrandMark in V4): in light, a soft black shadow under the tile; in dark, where that shadow turns
// muddy, a faint white rim just inside its edge, so the tile's dark-green top-right corner (about
// 2.1:1 against the dark bg) doesn't sink into the background. In tile units (the tile is 819 wide),
// so they scale with it: on the 140 dp splash tile, 2 dp down with a 4 dp blur (σ), and a 1 dp rim.
// The shadow is BRAND.shadow.color (black), the rim BRAND.paper. make-icons.mjs has the same values.
export const TILE_SHADOW = { dy: 12, blur: 24, opacity: 0.22 } as const;
export const TILE_RIM = { width: 6, opacity: 0.12 } as const;
