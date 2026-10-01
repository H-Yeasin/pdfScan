import type { Point } from '../enhance/perspective';
import { convexHull, largestQuadOnHull, polygonArea, type Quad } from './quadGeometry';

// Pure-JS page finder for gallery photos (C5's no-native-dependency path; an OpenCV detector can
// replace it behind the same quadDetector.detectDocumentQuad interface). It assumes what most
// student photos look like: a light sheet on a darker surface. Steps, on a ~400 px luma image:
//   1. Otsu threshold -> bright mask (the paper);
//   2. largest 4-connected bright component;
//   3. convex hull of its pixels -> the largest quad on that hull;
//   4. sanity checks: big enough, and the component fills its quad (a real page is a solid
//      quadrilateral; a bright blob of furniture or a window is not).
// 'high' confidence crops automatically; 'low' is only suggested ("please check"); null means no
// page was found and the full photo is kept for manual cropping.

export const MIN_AREA_FRACTION = 0.2;
// Component pixels / quad area. A clean page scores ~0.95+; below this it isn't a solid sheet.
export const HIGH_FILL = 0.9;
export const LOW_FILL = 0.75;
// A quad covering (nearly) the whole frame means there's no visible background - nothing to crop.
export const MAX_AREA_FRACTION = 0.97;

export type QuadDetection = { quad: Quad; confidence: 'high' | 'low' };

export function otsuThreshold(luma: Uint8Array): number {
  const hist = new Array<number>(256).fill(0);
  for (const v of luma) hist[v]++;
  const total = luma.length;
  let sumAll = 0;
  for (let i = 0; i < 256; i++) sumAll += i * hist[i];
  let sumB = 0;
  let weightB = 0;
  let best = 0;
  let threshold = 127;
  for (let t = 0; t < 256; t++) {
    weightB += hist[t];
    if (weightB === 0) continue;
    const weightF = total - weightB;
    if (weightF === 0) break;
    sumB += t * hist[t];
    const meanB = sumB / weightB;
    const meanF = (sumAll - sumB) / weightF;
    const between = weightB * weightF * (meanB - meanF) ** 2;
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

// Returns the pixel indices of the largest 4-connected component where mask[i] is 1.
export function largestComponent(mask: Uint8Array, width: number, height: number): number[] {
  const label = new Int32Array(mask.length);
  const stack: number[] = [];
  let best: number[] = [];
  let next = 1;
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || label[start]) continue;
    const pixels: number[] = [];
    label[start] = next;
    stack.push(start);
    while (stack.length) {
      const i = stack.pop()!;
      pixels.push(i);
      const x = i % width;
      const neighbours = [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, i - width, i + width];
      for (const j of neighbours) {
        if (j >= 0 && j < mask.length && mask[j] && !label[j]) {
          label[j] = next;
          stack.push(j);
        }
      }
    }
    if (pixels.length > best.length) best = pixels;
    next++;
  }
  return best;
}

// Hull of a pixel set using only each row's leftmost/rightmost pixel corners - same hull, far
// fewer points than every pixel.
function hullOfPixels(pixels: number[], width: number): Point[] {
  const rows = new Map<number, [number, number]>();
  for (const i of pixels) {
    const x = i % width;
    const y = (i - x) / width;
    const r = rows.get(y);
    if (!r) rows.set(y, [x, x]);
    else {
      if (x < r[0]) r[0] = x;
      if (x > r[1]) r[1] = x;
    }
  }
  const points: Point[] = [];
  rows.forEach(([minX, maxX], y) => {
    points.push({ x: minX, y }, { x: maxX + 1, y }, { x: minX, y: y + 1 }, { x: maxX + 1, y: y + 1 });
  });
  return convexHull(points);
}

// Hulls of noisy outlines can have many near-collinear vertices; keep the search bounded.
function simplifyHull(hull: Point[], maxPoints = 40): Point[] {
  if (hull.length <= maxPoints) return hull;
  const step = hull.length / maxPoints;
  return Array.from({ length: maxPoints }, (_, k) => hull[Math.floor(k * step)]);
}

export function detectQuadInLuma(luma: Uint8Array, width: number, height: number): QuadDetection | null {
  if (luma.length !== width * height || width < 8 || height < 8) return null;
  const imageArea = width * height;
  const threshold = otsuThreshold(luma);
  const mask = new Uint8Array(luma.length);
  for (let i = 0; i < luma.length; i++) mask[i] = luma[i] > threshold ? 1 : 0;

  const component = largestComponent(mask, width, height);
  if (component.length < imageArea * MIN_AREA_FRACTION) return null;

  const quad = largestQuadOnHull(simplifyHull(hullOfPixels(component, width)));
  if (!quad) return null;
  const quadArea = polygonArea(quad);
  if (quadArea < imageArea * MIN_AREA_FRACTION || quadArea > imageArea * MAX_AREA_FRACTION) return null;

  const fill = component.length / quadArea;
  if (fill >= HIGH_FILL) return { quad, confidence: 'high' };
  if (fill >= LOW_FILL) return { quad, confidence: 'low' };
  return null;
}
