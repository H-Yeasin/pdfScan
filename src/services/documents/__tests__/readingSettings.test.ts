import { NIGHT_PALETTES } from '../../reader/darkMatrix';
import { DEFAULT_READING, nightPalette, normalizeReading } from '../readingSettings';

describe('nightPalette', () => {
  it('is null by day, whatever the strength', () => {
    expect(nightPalette({ night: false, nightStrength: 'high' })).toBeNull();
    expect(nightPalette(DEFAULT_READING)).toBeNull();
  });

  it("picks the strength's paper and ink at night", () => {
    expect(nightPalette({ night: true, nightStrength: 'low' })).toBe(NIGHT_PALETTES.low);
    expect(nightPalette({ night: true, nightStrength: 'medium' })).toBe(NIGHT_PALETTES.medium);
    expect(nightPalette({ night: true, nightStrength: 'high' })).toBe(NIGHT_PALETTES.high);
    expect(NIGHT_PALETTES.high.paper).toBe('#000000');
  });

  it('gets darker paper with a higher strength', () => {
    const luma = (hex: string) => parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16);
    expect(luma(NIGHT_PALETTES.low.paper)).toBeGreaterThan(luma(NIGHT_PALETTES.medium.paper));
    expect(luma(NIGHT_PALETTES.medium.paper)).toBeGreaterThan(luma(NIGHT_PALETTES.high.paper));
  });

  it('falls back to medium for a strength storage never had', () => {
    expect(nightPalette(normalizeReading({ night: true, nightStrength: 'max' }))).toBe(NIGHT_PALETTES.medium);
  });
});
