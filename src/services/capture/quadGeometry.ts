import type { Point } from '../enhance/perspective';

// topLeft, topRight, bottomRight, bottomLeft - the order CropOverlay and warpPerspectiveCrop use.
export type Quad = [Point, Point, Point, Point];

// Orders any four corners as topLeft, topRight, bottomRight, bottomLeft. Splits by angle around
// the centroid rather than by min/max of x+y, which breaks on strongly rotated quads.
export function orderCorners(points: readonly Point[]): Quad {
  if (points.length !== 4) throw new Error('orderCorners: need exactly 4 points');
  const cx = points.reduce((s, p) => s + p.x, 0) / 4;
  const cy = points.reduce((s, p) => s + p.y, 0) / 4;
  // Clockwise in screen space (y down), starting from the point most up-left.
  const sorted = [...points].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  let start = 0;
  for (let i = 1; i < 4; i++) if (sorted[i].x + sorted[i].y < sorted[start].x + sorted[start].y) start = i;
  return [0, 1, 2, 3].map((k) => sorted[(start + k) % 4]) as Quad;
}

// Shoelace formula; always positive.
export function polygonArea(points: readonly Point[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

// Detection runs on a small copy; this maps the quad back to master pixel coordinates.
export function scaleQuad(quad: Quad, factorX: number, factorY = factorX): Quad {
  return quad.map((p) => ({ x: p.x * factorX, y: p.y * factorY })) as Quad;
}

function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

// Andrew's monotone chain.
export function convexHull(points: readonly Point[]): Point[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 3) return pts;
  const lower: Point[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

// The largest-area quadrilateral with corners on the hull (exhaustive over hull vertices, which
// stay few - tens - for a page outline). Best four-corner approximation of a convex outline.
export function largestQuadOnHull(hull: readonly Point[]): Quad | null {
  const n = hull.length;
  if (n < 4) return null;
  let best: Point[] | null = null;
  let bestArea = -1;
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++)
        for (let d = c + 1; d < n; d++) {
          const quad = [hull[a], hull[b], hull[c], hull[d]];
          const area = polygonArea(quad);
          if (area > bestArea) {
            bestArea = area;
            best = quad;
          }
        }
  return best ? orderCorners(best) : null;
}
