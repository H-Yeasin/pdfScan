// Single source of truth for image resolution and JPEG quality across capture, the library and
// export. Every other module reads these instead of carrying its own numbers.

// Library masters: the clean, full-quality page every rebuild starts from. 2400 px on the long
// side keeps 8 pt text readable on an A4 page at 200 % zoom.
export const MASTER_MAX_DIM = 2400;
export const MASTER_JPEG_Q = 0.92;

// Re-encoding the master after a perspective crop: a hair above MASTER_JPEG_Q so the one extra
// generation costs as little as possible.
export const CROP_JPEG_Q = 0.95;

// List/strip previews, so scrolling never decodes 2400 px masters.
export const THUMB_MAX_DIM = 400;
export const THUMB_JPEG_Q = 0.7;

// The live Review preview: big enough to judge a filter, small enough to re-render quickly.
export const PREVIEW_MAX_DIM = 1600;
export const PREVIEW_JPEG_Q = 0.85;

export type ExportPreset = {
  maxDim: number;
  q: number;
  // Rough output size relative to a master of the same page, for the Deliver size estimate.
  sizeFactor: number;
};

// Deliver's 1-5 quality slider. 5 is exactly the master spec, so exporting at 5 embeds library
// masters as-is with no re-encode.
export const EXPORT_PRESETS: Record<1 | 2 | 3 | 4 | 5, ExportPreset> = {
  1: { maxDim: 1000, q: 0.55, sizeFactor: 0.07 },
  2: { maxDim: 1400, q: 0.65, sizeFactor: 0.16 },
  3: { maxDim: 1800, q: 0.75, sizeFactor: 0.32 },
  4: { maxDim: 2200, q: 0.85, sizeFactor: 0.62 },
  5: { maxDim: MASTER_MAX_DIM, q: MASTER_JPEG_Q, sizeFactor: 1 },
};

export const MASTER_PRESET: ExportPreset = EXPORT_PRESETS[5];

export function exportPreset(quality: number): ExportPreset {
  const level = Math.min(5, Math.max(1, Math.round(quality))) as 1 | 2 | 3 | 4 | 5;
  return EXPORT_PRESETS[level];
}

export function isMasterQuality(quality: number): boolean {
  return exportPreset(quality) === MASTER_PRESET;
}

// Output size for an image of `width`x`height` capped at `maxDim` on its long side, never upscaled.
export function fitWithin(width: number, height: number, maxDim: number): { width: number; height: number; scale: number } {
  const scale = Math.min(1, maxDim / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), scale };
}

// Deliver's "≈ size" hint: master bytes scaled by the preset's size factor.
export function estimateExportBytes(masterBytes: number, quality: number): number {
  return Math.round(masterBytes * exportPreset(quality).sizeFactor);
}
