import type { BRAND } from '../../theme/brand';

// §15 V1: the logo's shapes, copied from the owner's files (assets/brand/pdfscan-mark.svg and
// pdfscan-tile.svg), for everything that draws the logo in the app: BrandMark (V4) and the splash
// intro (V5). The icon PNGs are made from the SVG files themselves (scripts/make-icons.mjs, V2).
// Colours are named, not copied: each fill is a key of BRAND (theme/brand.ts).
// theme/__tests__/brandSync.test.ts reads the SVGs and fails if anything here drifts from them.
//
// Everything is in the files' own units: the mark's viewBox and the tile's 819 × 802 pixels.

export type Point = { readonly x: number; readonly y: number };
// A linear gradient's line, from its first stop to its last (userSpaceOnUse in the SVG).
export type GradientLine = { readonly from: Point; readonly to: Point };

export const MARK_VIEWBOX = { width: 652, height: 762 } as const;

// The tile isn't square, and its corners are very round (rx is 0.352 of the width).
export const TILE_SIZE = { width: 819, height: 802, rx: 288 } as const;

// Top right → bottom left; the colours are BRAND.tile.
export const TILE_GRADIENT: GradientLine = { from: { x: 807.322, y: 5.60569e-5 }, to: { x: 74.2486, y: 855.61 } };

export type MarkFill = Exclude<keyof typeof BRAND, 'tile' | 'shadow'>;
export type MarkGradientName = Exclude<MarkFill, 'paper' | 'green'>;

// The mark's three gradients, in mark units; the colours are the BRAND entries of the same name.
export const MARK_GRADIENTS: Record<MarkGradientName, GradientLine> = {
  ribbon: { from: { x: 231.382, y: 381.12 }, to: { x: 75.8069, y: 631.525 } },
  diagonal: { from: { x: 505.206, y: 74.2002 }, to: { x: 367.839, y: 335.738 } },
  fold: { from: { x: 488.679, y: 89.1958 }, to: { x: 481.692, y: 184.29 } },
};

export type MarkPieceName = 'stemTop' | 'ribbon' | 'bowlInner' | 'diagonal' | 'fold' | 'topBar' | 'bowl' | 'stemBottom';

export type MarkPiece = {
  readonly name: MarkPieceName;
  // The SVG path, exactly as in the file (Skia's <Path path={d}> takes it as a string).
  readonly d: string;
  readonly fill: MarkFill;
  // An outline in BRAND.paper, centred on the edge as SVG draws it.
  readonly stroke?: { readonly width: number };
};

// The eight pieces in paint order. Keep it: the pieces meet edge to edge, and each seam is covered
// by whichever piece is painted later. topBar's hairline (the SVG's default stroke width, 1) closes
// its seam with stemTop; the fold's white outline separates it from the diagonal band. The P's
// counter (about x 232–385, y 217–369) is a hole in the pieces, so the tile shows through it.
export const MARK_PIECES: readonly MarkPiece[] = [
  {
    // The stem's upper part, with the slanted top-left corner.
    name: 'stemTop',
    d: 'M231.7 61.2002V369.2C117.432 384.671 72.8055 479.369 62.7002 544.2V159.2L231.7 61.2002Z',
    fill: 'paper',
  },
  {
    // Sweeps down-left across the stem.
    name: 'ribbon',
    d: 'M62.7002 544.2C85.0874 409.823 185.06 371.901 231.7 369.2L232.159 520.91C188.369 516.981 97.6802 531.961 62.7002 634.365V544.2Z',
    fill: 'ribbon',
  },
  {
    // The green inside of the bowl, under the counter.
    name: 'bowlInner',
    d: 'M320.7 369.147L231.7 369.2L232.159 520.91C295.123 481.128 312.224 464.92 354.2 414.087C371.302 388.301 379.852 369.884 383.739 351.466C385.077 345.123 384.956 338.977 385.2 335.7C372 361.3 336.7 368.665 320.7 369.147Z',
    fill: 'green',
  },
  {
    // From the top right into the bowl, with a notch for the fold.
    name: 'diagonal',
    d: 'M320.7 217.2L409.7 74.2002L409.316 190.128C409.316 199.705 420.199 207.809 429.527 207.809H552.346L385.2 335.7C411.2 285.2 386.7 217.2 320.7 217.2Z',
    fill: 'diagonal',
  },
  {
    // The folded corner: a triangle with its right angle at about (430.5, 186.9).
    name: 'fold',
    d: 'M536.757 186.889H438.93C436.738 186.889 434.501 186.134 432.85 185.016C431.096 183.829 430.547 182.646 430.547 182.022V87.5874L536.757 186.889Z',
    fill: 'fold',
    stroke: { width: 5 },
  },
  {
    // The top of the P.
    name: 'topBar',
    d: 'M409.7 74.2002L375.349 61.2002H303.525H231.7V217.2H320.7L409.7 74.2002Z',
    fill: 'paper',
    stroke: { width: 1 },
  },
  {
    // The outer bowl, from the diagonal round to the stem.
    name: 'bowl',
    d: 'M385.2 335.7L552.421 207.07C577.295 307.264 585.069 520.911 232.159 520.911C365.861 433.979 382.868 361.485 385.2 335.7Z',
    fill: 'paper',
  },
  {
    // The stem's foot, under the ribbon.
    name: 'stemBottom',
    d: 'M231.7 671.2L232.159 520.91C124.2 512.7 82.9109 576.901 62.7002 634.364V671.2H231.7Z',
    fill: 'paper',
  },
];

// The page (the white pieces) and the ribbons (the green ones), each still in paint order: the splash
// intro (V5) moves the page apart and lights the ribbons on their own.
export const WHITE_PIECES = MARK_PIECES.filter((piece) => piece.fill === 'paper');
export const GREEN_PIECES = MARK_PIECES.filter((piece) => piece.fill !== 'paper');

// The pieces' real extent in mark units, curves included and strokes and shadow left out. The bowl's
// control point reaches x 585, but the curve itself turns back at 562.7. The viewBox around it is
// the room the shadow needs.
export const MARK_CONTENT_BOX = { x: 62.7, y: 61.2, width: 500, height: 610 } as const;

// Where the mark sits in the tile, as in the owner's render (assets/brand/reference/): at scale 1
// (0.76 of the tile's height), its content box centred: translate(96.8, 34.8). Measuring the render's
// white pixels gives about (97.3, 34.8), the same to within a pixel.
export const MARK_IN_TILE = {
  scale: 1,
  x: (TILE_SIZE.width - MARK_CONTENT_BOX.width) / 2 - MARK_CONTENT_BOX.x,
  y: (TILE_SIZE.height - MARK_CONTENT_BOX.height) / 2 - MARK_CONTENT_BOX.y,
} as const;

// §15 V5: what the splash intro moves. The white pieces' centres (the middle of each one's bounds)
// give each its own outward direction from the content box's centre: stemTop left and up, topBar
// up, bowl right, stemBottom down and left. brandSync.test.ts checks them against the paths.
export type WhitePieceName = 'stemTop' | 'topBar' | 'bowl' | 'stemBottom';
export const WHITE_PIECE_CENTRES: Record<WhitePieceName, Point> = {
  stemTop: { x: 147.2, y: 302.7 },
  topBar: { x: 320.7, y: 139.2 },
  bowl: { x: 397.43, y: 363.99 },
  stemBottom: { x: 147.43, y: 595.7 },
};

// The fold's right-angle corner (its smallest x and largest y), where the fold is pinned when it
// lifts.
export const FOLD_PIVOT: Point = { x: 430.547, y: 186.889 };
