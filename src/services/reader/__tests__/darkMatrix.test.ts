import { darkPageMatrix, NIGHT_PALETTES, nightMatrix, paletteKey } from '../darkMatrix';

type Rgb = [number, number, number];

// What native code does with the matrix: rows of R, G, B (the fifth column an offset), clamped.
function apply(matrix: number[], [r, g, b]: Rgb): Rgb {
  const row = (at: number) => Math.min(255, Math.max(0, Math.round(matrix[at] * r + matrix[at + 1] * g + matrix[at + 2] * b + matrix[at + 3] * 255 + matrix[at + 4])));
  return [row(0), row(5), row(10)];
}

function hue([r, g, b]: Rgb): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return NaN;
  const d = max - min;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

function hueGap(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
}

const luma = ([r, g, b]: Rgb) => 0.213 * r + 0.715 * g + 0.072 * b;
const rgb = (hex: string): Rgb => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16)) as Rgb;

describe('§18 W9 dark page matrix', () => {
  it('is 4×5 and leaves alpha alone', () => {
    const m = darkPageMatrix('#201e1d', '#d4cfc6');
    expect(m).toHaveLength(20);
    expect(m.slice(15)).toEqual([0, 0, 0, 1, 0]);
    expect([m[3], m[8], m[13]]).toEqual([0, 0, 0]);
  });

  it.each(Object.entries(NIGHT_PALETTES))('%s: white → paper, black → ink, greys in between', (_name, palette) => {
    const m = nightMatrix(palette);
    expect(apply(m, [255, 255, 255])).toEqual(rgb(palette.paper));
    expect(apply(m, [0, 0, 0])).toEqual(rgb(palette.ink));
    const grey = apply(m, [128, 128, 128]);
    expect(luma(grey)).toBeGreaterThan(luma(rgb(palette.paper)));
    expect(luma(grey)).toBeLessThan(luma(rgb(palette.ink)));
  });

  it.each(Object.entries(NIGHT_PALETTES))('%s: colours keep their hue', (_name, palette) => {
    const m = nightMatrix(palette);
    const colours: Rgb[] = [
      [255, 0, 0],
      [0, 0, 255],
      [0, 160, 0],
      [200, 60, 20],
      [30, 90, 200],
    ];
    for (const colour of colours) expect(hueGap(hue(apply(m, colour)), hue(colour))).toBeLessThan(25);
  });

  it('a plain invert would not: red goes cyan', () => {
    const invert = [-1, 0, 0, 0, 255, 0, -1, 0, 0, 255, 0, 0, -1, 0, 255, 0, 0, 0, 1, 0];
    expect(hueGap(hue(apply(invert, [255, 0, 0])), 0)).toBe(180);
  });

  it('dark text on a light page becomes light text on a dark page', () => {
    const m = nightMatrix(NIGHT_PALETTES.medium);
    expect(luma(apply(m, [20, 20, 60]))).toBeGreaterThan(luma(apply(m, [240, 240, 200])));
  });

  it('names a palette by its colours', () => {
    expect(paletteKey({ paper: '#201E1D', ink: '#d4cfc6' })).toBe('201e1dd4cfc6');
    const keys = Object.values(NIGHT_PALETTES).map(paletteKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('refuses anything but #rrggbb', () => {
    expect(() => darkPageMatrix('#000', '#ffffff')).toThrow();
  });
});
