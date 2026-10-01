import {
  EXPORT_PRESETS,
  MASTER_JPEG_Q,
  MASTER_MAX_DIM,
  MASTER_PRESET,
  estimateExportBytes,
  exportPreset,
  fitWithin,
  isMasterQuality,
} from '../imageSpec';

describe('export presets', () => {
  it('maps quality 1-5 to the documented resolution/quality table', () => {
    expect(Object.values(EXPORT_PRESETS).map(({ maxDim, q }) => [maxDim, q])).toEqual([
      [1000, 0.55],
      [1400, 0.65],
      [1800, 0.75],
      [2200, 0.85],
      [2400, 0.92],
    ]);
  });

  it('grows strictly with quality and tops out at the master spec', () => {
    const presets = [1, 2, 3, 4, 5].map(exportPreset);
    for (let i = 1; i < presets.length; i++) {
      expect(presets[i].maxDim).toBeGreaterThan(presets[i - 1].maxDim);
      expect(presets[i].q).toBeGreaterThan(presets[i - 1].q);
      expect(presets[i].sizeFactor).toBeGreaterThan(presets[i - 1].sizeFactor);
    }
    expect(MASTER_PRESET).toEqual({ maxDim: MASTER_MAX_DIM, q: MASTER_JPEG_Q, sizeFactor: 1 });
  });

  it('clamps and rounds out-of-range quality', () => {
    expect(exportPreset(0)).toBe(EXPORT_PRESETS[1]);
    expect(exportPreset(9)).toBe(EXPORT_PRESETS[5]);
    expect(exportPreset(2.6)).toBe(EXPORT_PRESETS[3]);
    expect(isMasterQuality(5)).toBe(true);
    expect(isMasterQuality(4)).toBe(false);
  });

  it('estimates size from master bytes', () => {
    expect(estimateExportBytes(1_000_000, 5)).toBe(1_000_000);
    expect(estimateExportBytes(1_000_000, 1)).toBeLessThan(100_000);
  });
});

describe('fitWithin', () => {
  it('caps the long side without upscaling', () => {
    expect(fitWithin(4000, 3000, 2400)).toEqual({ width: 2400, height: 1800, scale: 0.6 });
    expect(fitWithin(800, 1200, 2400)).toEqual({ width: 800, height: 1200, scale: 1 });
  });
});
