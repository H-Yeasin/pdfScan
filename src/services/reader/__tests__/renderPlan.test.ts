import { makeDoc, makePage } from '../../../test/fixtures';
import type { ReaderSubject } from '../../documents/readerTools';
import {
  BASE_MAX_SIDE,
  baseSize,
  frameOf,
  fullSize,
  imageRegion,
  isFastFling,
  memoryWindow,
  placeholderSize,
  planRenders,
  prefetchPages,
  regionMatrix,
  RENDER_PRIORITY,
  SETTLE_MS,
  TILE_SIZE,
  tileBucket,
  tileGrid,
  tileRect,
  tilesIn,
  visibleFrame,
  type PixelRect,
} from '../renderPlan';
import { surfaceLayout, viewForPage, zoomAbout } from '../surfaceGeometry';
import { surfacePagesFor } from '../surfacePages';

const A4 = { width: 595.28, height: 841.89 };
// A phone: 411 × 890 dp at 2.625 px per dp (1080 px wide).
const viewport = { width: 411.43, height: 890 };
const pixelRatio = 2.625;

const map = (m: number[], x: number, y: number) => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });

function external(count: number) {
  const subject = { doc: undefined, external: { uri: 'file:///x.pdf', name: 'x.pdf', format: 'PDF' } } as unknown as ReaderSubject;
  const pages = surfacePagesFor(subject, { pages: Array.from({ length: count }, () => A4) });
  const layout = surfaceLayout(pages, { viewport, fit: 'width', gap: 10 });
  return { pages, layout };
}

function scan(count: number, overrides: Parameters<typeof makePage>[0] = {}) {
  const doc = makeDoc({
    format: 'PDF',
    pages: Array.from({ length: count }, (_, i) =>
      makePage({ id: `p${i}`, fileUri: `file:///library/d/page_${i}.jpg`, thumbUri: `file:///library/d/thumb_${i}.jpg`, width: 1800, height: 2400, ...overrides })
    ),
  });
  const pages = surfacePagesFor({ doc } as unknown as ReaderSubject);
  const layout = surfaceLayout(pages, { viewport, fit: 'width', gap: 10 });
  return { pages, layout };
}

describe('§18 W9 render sizes', () => {
  it('the base is the screen’s pixels, doubled from 1.5× and capped', () => {
    const box = { width: 411.43, height: 581.9 };
    expect(baseSize(box, pixelRatio, 1)).toEqual({ width: 1080, height: 1527 });
    expect(baseSize(box, pixelRatio, 1.49)).toEqual({ width: 1080, height: 1527 });
    const sharp = baseSize(box, pixelRatio, 1.5);
    expect(Math.max(sharp.width, sharp.height)).toBeLessThanOrEqual(BASE_MAX_SIDE);
    expect(sharp.height).toBe(2400);
    expect(sharp.width / sharp.height).toBeCloseTo(box.width / box.height, 2);
    // A landscape page: the cap is on the long side, whichever it is.
    expect(baseSize({ width: 800, height: 450 }, 2, 2).width).toBe(2400);
  });

  it('never asks a scan for more pixels than it has', () => {
    const box = { width: 411.43, height: 548.6 };
    expect(baseSize(box, pixelRatio, 2, { width: 900, height: 1200 })).toEqual({ width: 900, height: 1200 });
    expect(placeholderSize(box, { width: 200, height: 267 }).width).toBe(200);
    expect(placeholderSize(box).width).toBe(320);
  });

  it('buckets: none below 2.5, then the next whole step, up to 6', () => {
    expect([1, 2.49, 2.5, 3, 3.01, 4, 4.5, 5, 5.2, 6].map(tileBucket)).toEqual([0, 0, 3, 3, 4, 4, 5, 5, 6, 6]);
    expect(isFastFling(-2600)).toBe(true);
    expect(isFastFling(2400)).toBe(false);
  });
});

describe('§18 W9 tiles', () => {
  const base = { width: 1080, height: 1527 };

  it.each([3, 5])('at %i× the tiles cover the page exactly once', (bucket) => {
    const full = fullSize(base, bucket);
    expect(full).toEqual({ width: 1080 * bucket, height: Math.round((1080 * bucket * 1527) / 1080) });
    const grid = tileGrid(full);
    let area = 0;
    for (let row = 0; row < grid.rows; row += 1) {
      for (let col = 0; col < grid.cols; col += 1) {
        const rect = tileRect(grid, col, row);
        expect(rect.width).toBeGreaterThan(0);
        expect(rect.height).toBeGreaterThan(0);
        expect(rect.width).toBeLessThanOrEqual(TILE_SIZE);
        // Each tile starts where its neighbours end: no gap, no overlap.
        if (col > 0) expect(rect.x).toBe(tileRect(grid, col - 1, row).x + tileRect(grid, col - 1, row).width);
        if (row > 0) expect(rect.y).toBe(tileRect(grid, col, row - 1).y + tileRect(grid, col, row - 1).height);
        area += rect.width * rect.height;
      }
    }
    expect(area).toBe(full.width * full.height);
    const last = tileRect(grid, grid.cols - 1, grid.rows - 1);
    expect(last.x + last.width).toBe(full.width);
    expect(last.y + last.height).toBe(full.height);
  });

  it.each([3, 5])('at %i× the visible tiles cover the visible region', (bucket) => {
    const grid = tileGrid(fullSize(base, bucket));
    const frame = { x: 0.31, y: 0.42, width: 1 / bucket, height: 0.9 / bucket };
    const tiles = tilesIn(grid, frame).map(({ col, row }) => tileRect(grid, col, row));
    const inside = (x: number, y: number) => tiles.some((t) => x >= t.x && x < t.x + t.width && y >= t.y && y < t.y + t.height);
    for (let i = 0; i <= 20; i += 1) {
      for (let j = 0; j <= 20; j += 1) {
        const x = (frame.x + (frame.width * i) / 20) * grid.full.width;
        const y = (frame.y + (frame.height * j) / 20) * grid.full.height;
        expect(inside(Math.min(x, grid.full.width - 1), Math.min(y, grid.full.height - 1))).toBe(true);
      }
    }
    // And no more than a ring around it.
    const cols = Math.ceil((frame.width * grid.full.width) / TILE_SIZE) + 1;
    const rows = Math.ceil((frame.height * grid.full.height) / TILE_SIZE) + 1;
    expect(tiles.length).toBeLessThanOrEqual(cols * rows);
  });

  it('orders tiles from the middle of the region outwards', () => {
    const grid = tileGrid({ width: 512 * 5, height: 512 * 5 });
    const tiles = tilesIn(grid, { x: 0, y: 0, width: 1, height: 1 });
    expect(tiles).toHaveLength(25);
    expect(tiles[0]).toEqual({ col: 2, row: 2 });
    const far = tiles.map(({ col, row }) => (col - 2) ** 2 + (row - 2) ** 2);
    expect(far).toEqual([...far].sort((a, b) => a - b));
    expect(tilesIn(grid, { x: 0.99, y: 0.99, width: 0.01, height: 0.01 })).toEqual([{ col: 4, row: 4 }]);
  });

  it('a tile’s frame on the page', () => {
    const grid = tileGrid({ width: 1024, height: 2048 });
    expect(frameOf(grid.full, tileRect(grid, 1, 3))).toEqual({ x: 0.5, y: 0.75, width: 0.5, height: 0.25 });
  });

  it('regionMatrix maps the region’s corners to the output’s corners', () => {
    const full = fullSize(base, 4);
    const grid = tileGrid(full);
    const rect = tileRect(grid, 3, 5);
    const m = regionMatrix(A4, full, rect);
    expect(m[1]).toBe(0);
    expect(m[2]).toBe(0);
    // The region in shown points.
    const left = (rect.x / full.width) * A4.width;
    const top = (rect.y / full.height) * A4.height;
    const right = ((rect.x + rect.width) / full.width) * A4.width;
    const bottom = ((rect.y + rect.height) / full.height) * A4.height;
    const a = map(m, left, top);
    const b = map(m, right, bottom);
    expect(a.x).toBeCloseTo(0, 6);
    expect(a.y).toBeCloseTo(0, 6);
    expect(b.x).toBeCloseTo(rect.width, 6);
    expect(b.y).toBeCloseTo(rect.height, 6);
    // The whole page as one region is the plain fit.
    const whole = regionMatrix(A4, base, { x: 0, y: 0, ...base });
    expect(map(whole, A4.width, A4.height).x).toBeCloseTo(base.width, 6);
    expect(map(whole, A4.width, A4.height).y).toBeCloseTo(base.height, 6);
  });

  it('imageRegion turns a shown rectangle back into the file’s pixels', () => {
    // A 1000 × 2000 file. Shown unturned, the full image is the file itself.
    const file = { pixelW: 1000, pixelH: 2000 };
    // Fractions and back: equal up to rounding noise.
    const expectCut = (got: ReturnType<typeof imageRegion>, region: PixelRect, width: number, height: number) => {
      (['x', 'y', 'width', 'height'] as const).forEach((side) => expect(got.region[side]).toBeCloseTo(region[side], 6));
      expect([got.width, got.height]).toEqual([width, height]);
    };
    // Shown unturned, the full image is the file itself.
    const rect: PixelRect = { x: 100, y: 200, width: 300, height: 400 };
    expectCut(imageRegion({ ...file, imageTurn: 0 }, { width: 1000, height: 2000 }, rect), rect, 300, 400);
    // A quarter turn clockwise: shown 2000 × 1000, the file's top-left corner is top-right.
    const quarter = imageRegion({ ...file, imageTurn: 90 }, { width: 2000, height: 1000 }, { x: 1600, y: 0, width: 400, height: 300 });
    expectCut(quarter, { x: 0, y: 0, width: 300, height: 400 }, 300, 400);
    // Half a turn: the shown top-left corner is the file's bottom-right.
    const half = imageRegion({ ...file, imageTurn: 180 }, { width: 1000, height: 2000 }, { x: 0, y: 0, width: 300, height: 400 });
    expectCut(half, { x: 700, y: 1600, width: 300, height: 400 }, 300, 400);
    // Three quarters: the file's top-left corner is bottom-left.
    const three = imageRegion({ ...file, imageTurn: 270 }, { width: 2000, height: 1000 }, { x: 0, y: 700, width: 400, height: 300 });
    expectCut(three, { x: 0, y: 0, width: 300, height: 400 }, 300, 400);
    // At half the file's size the region is in the file's pixels, the output in the tile's.
    const small = imageRegion({ ...file, imageTurn: 0 }, { width: 500, height: 1000 }, { x: 0, y: 500, width: 250, height: 500 });
    expectCut(small, { x: 0, y: 1000, width: 500, height: 1000 }, 250, 500);
  });

  it('the part of a page on screen', () => {
    const box = { x: 0, y: 100, width: 400, height: 600 };
    expect(visibleFrame(box, { scale: 1, tx: 0, ty: 0 }, { width: 400, height: 800 })).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    // Scrolled so the page's top half is above the screen.
    const half = visibleFrame(box, { scale: 1, tx: 0, ty: -400 }, { width: 400, height: 800 });
    expect(half).toEqual({ x: 0, y: 0.5, width: 1, height: 0.5 });
    // Zoomed 4× about the page's top-left corner: a quarter of the width.
    const zoomed = visibleFrame(box, { scale: 4, tx: 0, ty: -400 }, { width: 400, height: 800 })!;
    expect(zoomed.width).toBeCloseTo(0.25, 6);
    expect(zoomed.height).toBeCloseTo(800 / 2400, 6);
    expect(visibleFrame(box, { scale: 1, tx: 0, ty: -900 }, { width: 400, height: 800 })).toBeNull();
  });
});

describe('§18 W9 windows', () => {
  it('memory: one page around the visible ones, two when not zoomed in, thumbnails four', () => {
    expect(memoryWindow({ first: 10, last: 10 }, 300, 2)).toEqual({ images: { first: 9, last: 11 }, thumbs: { first: 6, last: 14 } });
    expect(memoryWindow({ first: 10, last: 11 }, 300, 1)).toEqual({ images: { first: 8, last: 13 }, thumbs: { first: 6, last: 15 } });
    expect(memoryWindow({ first: 0, last: 1 }, 3, 1)).toEqual({ images: { first: 0, last: 2 }, thumbs: { first: 0, last: 2 } });
  });

  it('prefetch: two pages the way the reader is going', () => {
    expect(prefetchPages({ first: 10, last: 11 }, 300, 1)).toEqual([12, 13]);
    expect(prefetchPages({ first: 10, last: 11 }, 300, -1)).toEqual([9, 8]);
    expect(prefetchPages({ first: 10, last: 11 }, 300, 0)).toEqual([12, 9]);
    expect(prefetchPages({ first: 0, last: 0 }, 2, -1)).toEqual([]);
    expect(prefetchPages({ first: 298, last: 299 }, 300, 1)).toEqual([]);
  });
});

describe('§18 W9 planRenders', () => {
  it('an outside PDF at rest: bases (the page being read first), placeholders, then the neighbours', () => {
    const { pages, layout } = external(300);
    // Page 150 at the top; the top of 151 shows below it.
    const view = viewForPage(layout, 150, { scale: 1, tx: 0, ty: 0 }, viewport);
    const specs = planRenders({ pages, layout, view, viewport, pixelRatio, direction: 1 });
    expect(specs.map((s) => `${s.kind}:${s.page}:${s.priority}`)).toEqual([
      'base:150:1',
      'base:151:1',
      'low:150:2',
      'low:151:2',
      'base:152:4',
      'base:153:4',
    ]);
    expect(specs.every((s) => s.lane === 'pdf')).toBe(true);
    expect(specs[0]).toMatchObject({ key: 'p150-w1080', width: 1080, height: 1527, turn: 0, frame: { x: 0, y: 0, width: 1, height: 1 }, source: { kind: 'pdf', page: 150 } });
    expect(specs[0].source).not.toHaveProperty('matrix');
    expect(specs[2]).toMatchObject({ key: 'p150-w320', width: 320 });
    // Sorted by priority already, and in a stable order within one.
    expect(specs.map((s) => s.priority)).toEqual([...specs.map((s) => s.priority)].sort((a, b) => a - b));
    // Scrolling back: the pages before.
    const back = planRenders({ pages, layout, view, viewport, pixelRatio, direction: -1 });
    expect(back.filter((s) => s.priority === RENDER_PRIORITY.prefetch).map((s) => s.page)).toEqual([149, 148]);
  });

  it('a fast fling wants placeholders only', () => {
    const { pages, layout } = external(300);
    const view = viewForPage(layout, 150, { scale: 1, tx: 0, ty: 0 }, viewport);
    const specs = planRenders({ pages, layout, view, viewport, pixelRatio, direction: 1, fast: true });
    expect(specs.map((s) => `${s.kind}:${s.page}`)).toEqual(['low:150', 'low:151']);
  });

  it('a scan by day: its thumbnails are the placeholders, its files the source', () => {
    const { pages, layout } = scan(5);
    const view = viewForPage(layout, 2, { scale: 1, tx: 0, ty: 0 }, viewport);
    const specs = planRenders({ pages, layout, view, viewport, pixelRatio });
    expect(specs.map((s) => s.kind)).toEqual(['base', 'base', 'base', 'base']);
    expect(specs.every((s) => s.lane === 'image')).toBe(true);
    expect(specs[0]).toMatchObject({ page: 2, width: 1080, height: 1440, source: { kind: 'image', uri: 'file:///library/d/page_2.jpg' } });
    expect(specs[0].key).toMatch(/^i[0-9a-f]{16}-w1080$/);
  });

  it('at night every page wants a dark placeholder, and the keys say so', () => {
    const { pages, layout } = scan(5);
    const view = viewForPage(layout, 2, { scale: 1, tx: 0, ty: 0 }, viewport);
    const specs = planRenders({ pages, layout, view, viewport, pixelRatio, night: '201e1dd4cfc6' });
    expect(specs.filter((s) => s.kind === 'low').map((s) => s.page)).toEqual([2, 3]);
    expect(specs.every((s) => s.key.endsWith('-n201e1dd4cfc6'))).toBe(true);
  });

  it('a turned scan: the file comes out unturned and the view turns it', () => {
    const { pages, layout } = scan(1, { rotation: 90 });
    // Shown 2400 × 1800 (landscape) in a 411 dp wide box.
    const [base] = planRenders({ pages, layout, view: { scale: 1, tx: 0, ty: 0 }, viewport, pixelRatio });
    expect(base).toMatchObject({ width: 810, height: 1080, turn: 90 });
    expect(base.key).toMatch(/^i[0-9a-f]{16}r90-w1080$/);
  });

  it('zoomed in on a PDF: a sharp base, then tiles of the visible part after the settle', () => {
    const { pages, layout } = external(10);
    const at = viewForPage(layout, 4, { scale: 1, tx: 0, ty: 0 }, viewport);
    const view = zoomAbout(at, 5, viewport.width / 2, viewport.height / 2);
    const specs = planRenders({ pages, layout, view, viewport, pixelRatio });
    const base = specs.filter((s) => s.kind === 'base' && s.priority === RENDER_PRIORITY.base);
    expect(base).toHaveLength(1);
    expect(base[0].height).toBe(2400);
    const tiles = specs.filter((s) => s.kind === 'tile');
    expect(tiles.length).toBeGreaterThan(0);
    // The screen is 1080 × 2336 px; at 5× on a 5× grid that is 3 × 5 tiles, plus a ring.
    expect(tiles.length).toBeLessThanOrEqual(4 * 6);
    for (const tile of tiles) {
      expect(tile).toMatchObject({ lane: 'pdf', priority: RENDER_PRIORITY.tile, delayMs: SETTLE_MS, tile: { bucket: 5 } });
      expect(tile.key).toBe(`p${tile.page}-w1080-t${tile.tile!.col}_${tile.tile!.row}_5`);
      expect(tile.width).toBeLessThanOrEqual(TILE_SIZE);
      const matrix = (tile.source as { matrix: number[] }).matrix;
      // 5 × 1080 px across 595.28 points.
      expect(matrix[0]).toBeCloseTo(5400 / A4.width, 6);
      // The frame is where that region sits on the page.
      expect(map(matrix, tile.frame.x * A4.width, tile.frame.y * A4.height).x).toBeCloseTo(0, 4);
    }
    // Together the frames cover what is on screen.
    const box = { x: 0, y: layout.tops[4], width: layout.width, height: layout.heights[4] };
    const seen = visibleFrame(box, view, viewport)!;
    const covered = (x: number, y: number) => tiles.some((t) => x >= t.frame.x - 1e-9 && x <= t.frame.x + t.frame.width + 1e-9 && y >= t.frame.y - 1e-9 && y <= t.frame.y + t.frame.height + 1e-9);
    for (let i = 0; i <= 10; i += 1) for (let j = 0; j <= 10; j += 1) expect(covered(seen.x + (seen.width * i) / 10, seen.y + (seen.height * j) / 10)).toBe(true);
    // Neighbours are prefetched at the plain size.
    expect(specs.filter((s) => s.priority === RENDER_PRIORITY.prefetch).every((s) => s.width === 1080)).toBe(true);
  });

  it('a scan whose master the sharp base already shows needs no tiles', () => {
    const { pages, layout } = scan(1);
    const view = zoomAbout({ scale: 1, tx: 0, ty: 0 }, 5, 200, 300);
    const specs = planRenders({ pages, layout, view, viewport, pixelRatio });
    expect(specs.filter((s) => s.kind === 'tile')).toEqual([]);
    // 1800 × 2400: the whole master.
    expect(specs[0]).toMatchObject({ kind: 'base', width: 1800, height: 2400 });
  });

  it('a bigger image is cut into tiles of its own pixels', () => {
    const { pages, layout } = scan(1, { width: 4500, height: 6000 });
    const view = zoomAbout({ scale: 1, tx: 0, ty: 0 }, 6, 200, 300);
    const tiles = planRenders({ pages, layout, view, viewport, pixelRatio }).filter((s) => s.kind === 'tile');
    expect(tiles.length).toBeGreaterThan(0);
    for (const tile of tiles) {
      expect(tile.lane).toBe('image');
      const region = (tile.source as { region: PixelRect }).region;
      // Never upscaled: 6 × 1080 would be 6480 px, the file has 4500.
      expect(region.width).toBeCloseTo(tile.width, 6);
      expect(region.x + region.width).toBeLessThanOrEqual(4500 + 1e-6);
      expect(region.y + region.height).toBeLessThanOrEqual(6000 + 1e-6);
    }
  });

  it('no pages, no jobs', () => {
    expect(planRenders({ pages: [], layout: surfaceLayout([], { viewport, fit: 'width', gap: 10 }), view: { scale: 1, tx: 0, ty: 0 }, viewport, pixelRatio })).toEqual([]);
  });
});
