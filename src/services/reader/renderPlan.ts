import type { PageRotation } from '../../types/models';
import { hashKey } from '../../utils/hash';
import type { PdfMatrix } from '../pdf/pdfNative';
import type { QueueJob } from './renderQueue';
import { currentPage, NO_INSETS, pageBox, visiblePages, type ColumnLayout, type ColumnView, type ContentInsets, type Size } from './surfaceGeometry';
import type { PageSource, SurfacePage } from './surfacePages';

// §18 W9: what to render for a view of the surface, kept pure (no files, no native calls). A page
// is drawn from up to three images, sharper as the reader zooms in:
//  - `low`: a small placeholder, for a page with no thumbnail to show while it renders (an outside
//    PDF) and for every page at night (the stored thumbnails are light);
//  - `base`: the whole page at the screen's pixels, and twice that once zoomed to SHARP_SCALE;
//  - tiles: from TILE_MIN_SCALE, only the part on screen, cut from the page as it would be at a
//    whole zoom step (the "bucket": 3, 4, 5 or 6 times the base).
// `planRenders` turns pages + layout + view into the jobs for services/reader/renderQueue, in the
// order the reader's eye wants them. All sizes here are image pixels unless they say otherwise.

export const TILE_SIZE = 512;
export const TILE_MIN_SCALE = 2.5;
export const TILE_MAX_BUCKET = 6;
// From this zoom the base is rendered at twice the screen's pixels.
export const SHARP_SCALE = 1.5;
// The longest side of a base image: about 17 MB decoded for an A4 page.
export const BASE_MAX_SIDE = 2400;
// A placeholder's width. Small enough to render in a few milliseconds.
export const PLACEHOLDER_WIDTH = 320;
// Tiles are asked for only once the gesture has rested this long.
export const SETTLE_MS = 150;
// Above this speed (px/s) only placeholders are wanted; the pages render once the fling slows.
export const FAST_FLING = 2500;
export const RENDER_QUALITY = 0.85;

export const RENDER_PRIORITY = { base: 1, low: 2, tile: 3, prefetch: 4, text: 5 } as const;

export type PixelRect = { x: number; y: number; width: number; height: number };
// A rectangle in fractions of the shown page (0–1, top-left origin).
export type PageFrame = { x: number; y: number; width: number; height: number };
const WHOLE_PAGE: PageFrame = { x: 0, y: 0, width: 1, height: 1 };

export function isFastFling(velocity: number): boolean {
  'worklet';
  return Math.abs(velocity) > FAST_FLING;
}

function turned(size: Size, turn: PageRotation | undefined): Size {
  return turn === 90 || turn === 270 ? { width: size.height, height: size.width } : size;
}

// An image source's pixels as the page is shown (turned). A PDF page has none: it is drawn at
// whatever size is asked for.
function shownPixels(source: PageSource): Size | undefined {
  return source.kind === 'image' ? turned({ width: source.pixelW, height: source.pixelH }, source.imageTurn) : undefined;
}

function sized(width: number, box: Size): Size {
  const w = Math.max(1, Math.round(width));
  return { width: w, height: Math.max(1, Math.round((w * box.height) / box.width)) };
}

// The base image of a page shown in `box` (content units, so dp at zoom 1): the screen's pixels,
// doubled from SHARP_SCALE, never longer than BASE_MAX_SIDE and never more than the source has
// (`limit`: an image's shown pixels; upscaling a scan only costs memory).
export function baseSize(box: Size, pixelRatio: number, scale: number, limit?: Size): Size {
  let width = box.width * pixelRatio * (scale >= SHARP_SCALE ? 2 : 1);
  const long = Math.max(width, (width * box.height) / box.width);
  if (long > BASE_MAX_SIDE) width *= BASE_MAX_SIDE / long;
  if (limit) width = Math.min(width, limit.width);
  return sized(width, box);
}

export function placeholderSize(box: Size, limit?: Size): Size {
  return sized(limit ? Math.min(PLACEHOLDER_WIDTH, limit.width) : PLACEHOLDER_WIDTH, box);
}

// The zoom step tiles are cut at: 0 below TILE_MIN_SCALE, else the next whole step up (2.5 → 3,
// 3.2 → 4), so the tiles are never stretched.
export function tileBucket(scale: number): number {
  'worklet';
  if (scale < TILE_MIN_SCALE) return 0;
  return Math.min(TILE_MAX_BUCKET, Math.max(3, Math.ceil(scale - 1e-6)));
}

// The whole page's size at a bucket: what the tiles are cut from. Never drawn in one piece.
export function fullSize(base: Size, bucket: number, limit?: Size): Size {
  const width = limit ? Math.min(base.width * bucket, limit.width) : base.width * bucket;
  return sized(width, base);
}

export type TileGrid = { full: Size; cols: number; rows: number };

export function tileGrid(full: Size): TileGrid {
  return { full, cols: Math.ceil(full.width / TILE_SIZE), rows: Math.ceil(full.height / TILE_SIZE) };
}

// Tile (col, row) in the full image's pixels. The last column and row are as small as what's left.
export function tileRect(grid: TileGrid, col: number, row: number): PixelRect {
  const x = col * TILE_SIZE;
  const y = row * TILE_SIZE;
  return { x, y, width: Math.min(TILE_SIZE, grid.full.width - x), height: Math.min(TILE_SIZE, grid.full.height - y) };
}

// Where a pixel rectangle of the full image sits on the shown page.
export function frameOf(full: Size, rect: PixelRect): PageFrame {
  return { x: rect.x / full.width, y: rect.y / full.height, width: rect.width / full.width, height: rect.height / full.height };
}

// The part of a page that is on screen, in fractions of the page; null when none of it is.
export function visibleFrame(box: PixelRect, view: ColumnView, viewport: Size): PageFrame | null {
  const width = box.width * view.scale;
  const height = box.height * view.scale;
  const left = box.x * view.scale + view.tx;
  const top = box.y * view.scale + view.ty;
  const x0 = Math.max(0, -left / width);
  const y0 = Math.max(0, -top / height);
  const x1 = Math.min(1, (viewport.width - left) / width);
  const y1 = Math.min(1, (viewport.height - top) / height);
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : null;
}

// The tiles that touch `frame`, the ones nearest its middle first (that is where the eye is).
export function tilesIn(grid: TileGrid, frame: PageFrame): { col: number; row: number }[] {
  const { full } = grid;
  const col0 = Math.max(0, Math.floor((frame.x * full.width) / TILE_SIZE));
  const row0 = Math.max(0, Math.floor((frame.y * full.height) / TILE_SIZE));
  const col1 = Math.min(grid.cols - 1, Math.ceil(((frame.x + frame.width) * full.width) / TILE_SIZE) - 1);
  const row1 = Math.min(grid.rows - 1, Math.ceil(((frame.y + frame.height) * full.height) / TILE_SIZE) - 1);
  const midX = ((frame.x + frame.width / 2) * full.width) / TILE_SIZE - 0.5;
  const midY = ((frame.y + frame.height / 2) * full.height) / TILE_SIZE - 0.5;
  const tiles: { col: number; row: number; far: number }[] = [];
  for (let row = row0; row <= row1; row += 1) {
    for (let col = col0; col <= col1; col += 1) tiles.push({ col, row, far: (col - midX) ** 2 + (row - midY) ** 2 });
  }
  return tiles.sort((a, b) => a.far - b.far).map(({ col, row }) => ({ col, row }));
}

// pdf-native's render matrix for a region: shown points (top-left origin) → the output image's
// pixels, when the whole page would be `full` and the image is its `rect`. Scale and translate
// only, which is all pdfium's bitmap render takes (§18 W7).
export function regionMatrix(points: Size, full: Size, rect: PixelRect): PdfMatrix {
  return [full.width / points.width, 0, 0, full.height / points.height, -rect.x, -rect.y];
}

// decodeImage's arguments for the same region of a scan. The file is never turned (rotation is a
// setting), so the shown rectangle is turned back into the file's pixels, and the output comes
// out unturned too: `width` × `height` swap on a quarter turn and the view turns the image.
export function imageRegion(
  source: { pixelW: number; pixelH: number; imageTurn: PageRotation },
  full: Size,
  rect: PixelRect
): { region: PixelRect; width: number; height: number } {
  const a0 = rect.x / full.width;
  const a1 = (rect.x + rect.width) / full.width;
  const b0 = rect.y / full.height;
  const b1 = (rect.y + rect.height) / full.height;
  // The shown rectangle in fractions of the file: [u0, u1] across, [v0, v1] down.
  let u0 = a0;
  let u1 = a1;
  let v0 = b0;
  let v1 = b1;
  if (source.imageTurn === 90) [u0, u1, v0, v1] = [b0, b1, 1 - a1, 1 - a0];
  else if (source.imageTurn === 180) [u0, u1, v0, v1] = [1 - a1, 1 - a0, 1 - b1, 1 - b0];
  else if (source.imageTurn === 270) [u0, u1, v0, v1] = [1 - b1, 1 - b0, a0, a1];
  const out = turned({ width: rect.width, height: rect.height }, source.imageTurn);
  return {
    region: { x: u0 * source.pixelW, y: v0 * source.pixelH, width: (u1 - u0) * source.pixelW, height: (v1 - v0) * source.pixelH },
    width: out.width,
    height: out.height,
  };
}

export type PageRange = { first: number; last: number };

function reach(range: PageRange, by: number, count: number): PageRange {
  return { first: Math.max(0, range.first - by), last: Math.min(count - 1, range.last + by) };
}

// Which pages keep their images mounted, and which their thumbnails: one page beyond the visible
// ones (two when not zoomed in, where a flick travels further), thumbnails four beyond. Decoded
// images are the Reader's memory, about 96 MB with these numbers; everything else is only a file.
export function memoryWindow(visible: PageRange, count: number, scale: number): { images: PageRange; thumbs: PageRange } {
  return { images: reach(visible, scale > 1 ? 1 : 2, count), thumbs: reach(visible, 4, count) };
}

// The next two pages the way the reader is scrolling (1: towards the end, -1: towards the start);
// at rest, one on each side, the next one first.
export function prefetchPages(visible: PageRange, count: number, direction: number): number[] {
  const ahead = [visible.last + 1, visible.last + 2];
  const behind = [visible.first - 1, visible.first - 2];
  const pages = direction > 0 ? ahead : direction < 0 ? behind : [ahead[0], behind[0]];
  return pages.filter((page) => page >= 0 && page < count);
}

export type RenderSpec = QueueJob & {
  // SurfacePage.index.
  page: number;
  kind: 'low' | 'base' | 'tile';
  // The output image. An image source's comes out unturned: the view turns it by `turn`.
  width: number;
  height: number;
  turn: PageRotation;
  // Where the image goes on the shown page.
  frame: PageFrame;
  // A tile's place in its bucket's grid.
  tile?: { col: number; row: number; bucket: number };
  source:
    | { kind: 'pdf'; page: number; matrix?: PdfMatrix }
    | { kind: 'image'; uri: string; region?: PixelRect };
};

// The cache's file name for a render, without `.jpg` (services/reader/pageCache). `width` is the
// base's, also for a tile: with the bucket it says which grid the tile belongs to. A scan's page
// is named by its file, not its number, because pages can be reordered and re-cropped (always into
// a new file) under an open Reader, and by its turn, because the file comes out unturned and so
// differs with it; a PDF's page number is safe, the cache folder changes with the file.
export function renderKey(source: PageSource, width: number, tile?: { col: number; row: number; bucket: number }, night?: string): string {
  const page = source.kind === 'pdf' ? `p${source.page}` : `i${hashKey(source.uri)}${source.imageTurn ? `r${source.imageTurn}` : ''}`;
  return `${page}-w${width}${tile ? `-t${tile.col}_${tile.row}_${tile.bucket}` : ''}${night ? `-n${night}` : ''}`;
}

export type RenderPlanInput = {
  pages: readonly SurfacePage[];
  layout: ColumnLayout;
  view: ColumnView;
  viewport: Size;
  insets?: ContentInsets;
  // PixelRatio.get().
  pixelRatio: number;
  // 1 scrolling towards the end, -1 towards the start, 0 at rest.
  direction?: number;
  // A fast fling: placeholders only.
  fast?: boolean;
  // darkMatrix.paletteKey at night. The executor applies the matrix; the key keeps the files apart.
  night?: string;
};

function wholePage(page: SurfacePage, kind: 'low' | 'base', size: Size, priority: number, night?: string): RenderSpec {
  const { source } = page;
  const turn = source.kind === 'image' ? source.imageTurn : 0;
  const out = turned(size, turn);
  // The key carries the shown width; the file itself is `out`.
  return {
    key: renderKey(source, size.width, undefined, night),
    lane: source.kind,
    priority,
    page: page.index,
    kind,
    width: out.width,
    height: out.height,
    turn,
    frame: WHOLE_PAGE,
    source: source.kind === 'pdf' ? { kind: 'pdf', page: source.page } : { kind: 'image', uri: source.uri },
  };
}

function tileSpecs(page: SurfacePage, box: PixelRect, input: RenderPlanInput, bucket: number): RenderSpec[] {
  const { source } = page;
  const limit = shownPixels(source);
  const base = baseSize(box, input.pixelRatio, 1, limit);
  const full = fullSize(base, bucket, limit);
  // Nothing to gain over the sharp base: a scan whose master it already shows in full.
  if (full.width <= baseSize(box, input.pixelRatio, SHARP_SCALE, limit).width) return [];
  const frame = visibleFrame(box, input.view, input.viewport);
  if (!frame) return [];
  const grid = tileGrid(full);
  return tilesIn(grid, frame).map(({ col, row }) => {
    const rect = tileRect(grid, col, row);
    const common = {
      key: renderKey(source, base.width, { col, row, bucket }, input.night),
      lane: source.kind,
      priority: RENDER_PRIORITY.tile,
      delayMs: SETTLE_MS,
      page: page.index,
      kind: 'tile' as const,
      frame: frameOf(full, rect),
      tile: { col, row, bucket },
    };
    if (source.kind === 'pdf') {
      const matrix = regionMatrix({ width: source.pointsW, height: source.pointsH }, full, rect);
      return { ...common, width: rect.width, height: rect.height, turn: 0 as const, source: { kind: 'pdf' as const, page: source.page, matrix } };
    }
    const cut = imageRegion(source, full, rect);
    return { ...common, width: cut.width, height: cut.height, turn: source.imageTurn, source: { kind: 'image' as const, uri: source.uri, region: cut.region } };
  });
}

// The wanted set for a view, most urgent first (the queue keeps this order within a priority):
//  1. the visible pages' base images, the page being read first;
//  2. placeholders for visible pages that have nothing to show meanwhile;
//  3. the visible tiles, once the view has rested;
//  4. the next pages in the scroll direction.
// During a fast fling only the placeholders are wanted.
export function planRenders(input: RenderPlanInput): RenderSpec[] {
  const { pages, layout, view, viewport, pixelRatio, night } = input;
  const count = Math.min(pages.length, layout.tops.length);
  if (!count) return [];
  const visible = visiblePages(layout, view, viewport);
  const last = Math.min(visible.last, count - 1);
  const centre = Math.min(currentPage(layout, view, viewport.height, input.insets ?? NO_INSETS), count - 1);
  const shown: number[] = [];
  for (let page = visible.first; page <= last; page += 1) shown.push(page);
  shown.sort((a, b) => Math.abs(a - centre) - Math.abs(b - centre) || a - b);

  const specs: RenderSpec[] = [];
  const base = (index: number, scale: number, priority: number) => {
    const page = pages[index];
    return wholePage(page, 'base', baseSize(pageBox(layout, index), pixelRatio, scale, shownPixels(page.source)), priority, night);
  };
  if (!input.fast) shown.forEach((index) => specs.push(base(index, view.scale, RENDER_PRIORITY.base)));
  for (const index of shown) {
    const page = pages[index];
    if (page.thumbUri && !night) continue;
    specs.push(wholePage(page, 'low', placeholderSize(pageBox(layout, index), shownPixels(page.source)), RENDER_PRIORITY.low, night));
  }
  if (input.fast) return specs;
  const bucket = tileBucket(view.scale);
  if (bucket) shown.forEach((index) => specs.push(...tileSpecs(pages[index], pageBox(layout, index), input, bucket)));
  // Neighbours at the plain size: the sharp one comes when the page is on screen and zoomed.
  for (const index of prefetchPages({ first: visible.first, last }, count, input.direction ?? 0)) specs.push(base(index, 1, RENDER_PRIORITY.prefetch));
  return specs;
}
