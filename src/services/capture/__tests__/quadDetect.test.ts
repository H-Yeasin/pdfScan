import type { Point } from '../../enhance/perspective';
import { detectQuadInLuma, largestComponent, otsuThreshold } from '../quadDetect';
import { orderCorners, polygonArea, scaleQuad, type Quad } from '../quadGeometry';

function insideQuad(x: number, y: number, quad: Point[]): boolean {
  // Convex polygon, any winding: all edge cross products share a sign.
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = quad[i];
    const b = quad[(i + 1) % 4];
    const c = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
    if (c !== 0) {
      if (sign === 0) sign = Math.sign(c);
      else if (Math.sign(c) !== sign) return false;
    }
  }
  return true;
}

// A "photo": dark desk (~45) with a light sheet (~215) at `quad`, plus deterministic noise.
function photo(width: number, height: number, quad: Point[] | null, { desk = 45, paper = 215 } = {}): Uint8Array {
  const luma = new Uint8Array(width * height);
  let seed = 7;
  const noise = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return (seed % 21) - 10;
  };
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const base = quad && insideQuad(x + 0.5, y + 0.5, quad) ? paper : desk;
      luma[y * width + x] = Math.max(0, Math.min(255, base + noise()));
    }
  return luma;
}

function maxCornerError(found: Quad, expected: Point[]): number {
  const ordered = orderCorners(expected);
  return Math.max(...found.map((p, i) => Math.hypot(p.x - ordered[i].x, p.y - ordered[i].y)));
}

describe('detectQuadInLuma', () => {
  it('finds an upright sheet on a desk', () => {
    const sheet = [
      { x: 60, y: 30 },
      { x: 340, y: 30 },
      { x: 340, y: 380 },
      { x: 60, y: 380 },
    ];
    const found = detectQuadInLuma(photo(400, 400, sheet), 400, 400);
    expect(found?.confidence).toBe('high');
    expect(maxCornerError(found!.quad, sheet)).toBeLessThanOrEqual(3);
  });

  it('finds a sheet photographed at an angle (perspective quad)', () => {
    const sheet = [
      { x: 90, y: 40 },
      { x: 310, y: 60 },
      { x: 360, y: 380 },
      { x: 30, y: 350 },
    ];
    const found = detectQuadInLuma(photo(400, 400, sheet), 400, 400);
    expect(found?.confidence).toBe('high');
    expect(maxCornerError(found!.quad, sheet)).toBeLessThanOrEqual(4);
  });

  it('returns null when there is no page (flat image)', () => {
    expect(detectQuadInLuma(photo(300, 300, null), 300, 300)).toBeNull();
  });

  it('rejects a sheet covering less than 20 % of the photo', () => {
    const small = [
      { x: 10, y: 10 },
      { x: 90, y: 10 },
      { x: 90, y: 90 },
      { x: 10, y: 90 },
    ];
    expect(detectQuadInLuma(photo(300, 300, small), 300, 300)).toBeNull();
  });

  it('rejects a bright blob that is not a solid quadrilateral', () => {
    const width = 300;
    const luma = photo(width, width, null);
    // An L shape: two bars, ~44 % of its bounding quad empty.
    for (let y = 20; y < 280; y++) for (let x = 20; x < 100; x++) luma[y * width + x] = 220;
    for (let y = 200; y < 280; y++) for (let x = 20; x < 280; x++) luma[y * width + x] = 220;
    expect(detectQuadInLuma(luma, width, width)?.confidence ?? null).not.toBe('high');
  });

  it('has nothing to crop when the page fills the frame', () => {
    const all = [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 200 },
      { x: 0, y: 200 },
    ];
    expect(detectQuadInLuma(photo(200, 200, all), 200, 200)).toBeNull();
  });
});

describe('quad geometry', () => {
  it('orders corners topLeft, topRight, bottomRight, bottomLeft from any order', () => {
    const q = orderCorners([
      { x: 10, y: 90 },
      { x: 90, y: 10 },
      { x: 10, y: 10 },
      { x: 90, y: 90 },
    ]);
    expect(q).toEqual([
      { x: 10, y: 10 },
      { x: 90, y: 10 },
      { x: 90, y: 90 },
      { x: 10, y: 90 },
    ]);
  });

  it('orders a strongly rotated quad', () => {
    const q = orderCorners([
      { x: 50, y: 0 },
      { x: 100, y: 50 },
      { x: 50, y: 100 },
      { x: 0, y: 45 },
    ]);
    expect(q[0]).toEqual({ x: 0, y: 45 });
    expect(q[1]).toEqual({ x: 50, y: 0 });
  });

  it('scales from the 400 px detection image back to master coordinates', () => {
    const q: Quad = [
      { x: 10, y: 20 },
      { x: 300, y: 20 },
      { x: 300, y: 380 },
      { x: 10, y: 380 },
    ];
    expect(scaleQuad(q, 6)[2]).toEqual({ x: 1800, y: 2280 });
    expect(polygonArea(scaleQuad(q, 2))).toBeCloseTo(polygonArea(q) * 4);
  });

  it('computes Otsu between the two clusters and keeps the largest component', () => {
    const t = otsuThreshold(new Uint8Array([40, 42, 41, 200, 210, 205]));
    expect(t).toBeGreaterThanOrEqual(42);
    expect(t).toBeLessThan(200);
    // Two blobs in a 5x2 mask; the 3-pixel one wins.
    expect(largestComponent(new Uint8Array([1, 0, 1, 1, 0, 0, 0, 1, 0, 0]), 5, 2).sort()).toEqual([2, 3, 7]);
  });
});
