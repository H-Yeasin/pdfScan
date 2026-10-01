import { findGutter, isSpread } from '../gutter';

// A 256-column page at paper brightness with a dark band centred at `at` (fraction of width).
function columnsWithStripe(at: number, { width = 256, paper = 230, ink = 150, stripe = 5 } = {}): number[] {
  const centre = Math.round(at * width);
  return Array.from({ length: width }, (_, x) => (Math.abs(x - centre) <= stripe / 2 ? ink : paper));
}

describe('findGutter', () => {
  it('finds a dark stripe at 47 %', () => {
    const result = findGutter(columnsWithStripe(0.47));
    expect(result.detected).toBe(true);
    expect(result.position).toBeCloseTo(0.47, 2);
  });

  it('falls back to the centre on flat brightness', () => {
    expect(findGutter(new Array(256).fill(200))).toEqual({ position: 0.5, detected: false });
  });

  it('falls back to the centre when the dip is too shallow to trust', () => {
    expect(findGutter(columnsWithStripe(0.55, { paper: 230, ink: 225 }))).toEqual({ position: 0.5, detected: false });
  });

  it('ignores dark bands outside the middle 40 % (desk edges, page borders)', () => {
    const columns = columnsWithStripe(0.52, { ink: 170 });
    for (let x = 0; x < 20; x++) columns[x] = 20; // dark desk on the left
    const result = findGutter(columns);
    expect(result.position).toBeCloseTo(0.52, 2);
  });

  it('prefers the wide binding shadow over a single dark column', () => {
    const columns = columnsWithStripe(0.6, { ink: 160, stripe: 9 });
    columns[Math.round(0.4 * 256)] = 120; // one pen stroke
    expect(findGutter(columns).position).toBeCloseTo(0.6, 2);
  });

  it('handles degenerate input', () => {
    expect(findGutter([])).toEqual({ position: 0.5, detected: false });
    expect(findGutter([0, 0, 0])).toEqual({ position: 0.5, detected: false });
  });
});

describe('isSpread', () => {
  it('only treats clearly landscape images as spreads', () => {
    expect(isSpread(3000, 2000)).toBe(true);
    expect(isSpread(2000, 3000)).toBe(false); // portrait: a single page, never split
    expect(isSpread(2000, 2000)).toBe(false);
    expect(isSpread(2200, 2000)).toBe(false); // 1.1 - within the square-ish tolerance
  });
});
