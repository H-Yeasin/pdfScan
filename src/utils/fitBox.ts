// Unit-agnostic "fit content into a box" math: uniform scale (same factor on both axes, so
// aspect ratio is always preserved) + centered origin. Works identically whether the box is in
// PDF points (pdfService.ts) or raw pixels (compositeHalfPages.ts) - the caller's units are
// whatever contentW/contentH/boxW/boxH/boxX/boxY already are, this function never assumes one.
export type BoxFit = { origin: { x: number; y: number }; scale: number; width: number; height: number };

export function fitBox(
  contentW: number,
  contentH: number,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number
): BoxFit {
  const scale = Math.min(boxW / contentW, boxH / contentH);
  const width = contentW * scale;
  const height = contentH * scale;
  const origin = {
    x: boxX + (boxW - width) / 2,
    y: boxY + (boxH - height) / 2,
  };
  return { origin, scale, width, height };
}
