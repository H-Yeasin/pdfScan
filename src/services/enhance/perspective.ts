export type Point = { x: number; y: number };

// Row-major 3x3 projective matrix: [scaleX, skewX, transX, skewY, scaleY, transY, persp0, persp1, persp2] —
// same layout Skia's SkMatrix/SkCanvas.concat expects.
type Mat3 = number[];

// Maps the unit square (0,0)-(1,0)-(1,1)-(0,1) onto the given quad (same corner order), per the
// closed-form solution in Heckbert's "Fundamentals of Texture Mapping and Image Warping" (1989).
function squareToQuad(p0: Point, p1: Point, p2: Point, p3: Point): Mat3 {
  const dx1 = p1.x - p2.x;
  const dx2 = p3.x - p2.x;
  const dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y;
  const dy2 = p3.y - p2.y;
  const dy3 = p0.y - p1.y + p2.y - p3.y;

  // dx3 === 0 && dy3 === 0 means the quad is a parallelogram — a pure affine map, no
  // perspective term needed (and the general solve below would divide by a zero denominator).
  if (dx3 === 0 && dy3 === 0) {
    return [p1.x - p0.x, p2.x - p1.x, p0.x, p1.y - p0.y, p2.y - p1.y, p0.y, 0, 0, 1];
  }

  const denom = dx1 * dy2 - dx2 * dy1;
  const g = denom === 0 ? 0 : (dx3 * dy2 - dx2 * dy3) / denom;
  const h = denom === 0 ? 0 : (dx1 * dy3 - dx3 * dy1) / denom;

  return [
    p1.x - p0.x + g * p1.x, p3.x - p0.x + h * p3.x, p0.x,
    p1.y - p0.y + g * p1.y, p3.y - p0.y + h * p3.y, p0.y,
    g, h, 1,
  ];
}

function invert3(m: Mat3): Mat3 {
  const [a, b, c, d, e, f, g, h, i] = m;
  const c11 = e * i - f * h;
  const c12 = -(d * i - f * g);
  const c13 = d * h - e * g;
  const c21 = -(b * i - c * h);
  const c22 = a * i - c * g;
  const c23 = -(a * h - b * g);
  const c31 = b * f - c * e;
  const c32 = -(a * f - c * d);
  const c33 = a * e - b * d;

  const det = a * c11 + b * c12 + c * c13;
  if (det === 0) return [1, 0, 0, 0, 1, 0, 0, 0, 1];

  const invDet = 1 / det;
  return [
    c11 * invDet, c21 * invDet, c31 * invDet,
    c12 * invDet, c22 * invDet, c32 * invDet,
    c13 * invDet, c23 * invDet, c33 * invDet,
  ];
}

function multiply3(m1: Mat3, m2: Mat3): Mat3 {
  const out = new Array(9).fill(0);
  for (let r = 0; r < 3; r++) {
    for (let col = 0; col < 3; col++) {
      let sum = 0;
      for (let k = 0; k < 3; k++) sum += m1[r * 3 + k] * m2[k * 3 + col];
      out[r * 3 + col] = sum;
    }
  }
  return out;
}

// Builds the projective matrix that carries `src` (4 points, TL/TR/BR/BL order) onto `dst`
// (same order) — i.e. squareToQuad(dst) composed with the inverse of squareToQuad(src), using
// the unit square as a common intermediate. Passed to SkCanvas.concat() to warp an image drawn
// in `src`'s coordinate space so it lands exactly on `dst`.
export function quadToQuadMatrix(src: [Point, Point, Point, Point], dst: [Point, Point, Point, Point]): number[] {
  const msrc = squareToQuad(src[0], src[1], src[2], src[3]);
  const mdst = squareToQuad(dst[0], dst[1], dst[2], dst[3]);
  return multiply3(mdst, invert3(msrc));
}
