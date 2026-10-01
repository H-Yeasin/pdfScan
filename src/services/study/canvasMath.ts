import { fitBox, type BoxFit } from '../../utils/fitBox';

// PageCanvas geometry (§5 T3/T4), kept pure so it can be tested. The page image is fitted
// (contain) into the canvas, then the whole layer is zoomed by `scale` about the canvas centre
// and moved by (tx, ty), the way a React Native transform [translate, scale] applies.

export type CanvasSize = { width: number; height: number };
export type CanvasTransform = { scale: number; tx: number; ty: number };

export function pageFit(page: { width: number; height: number }, canvas: CanvasSize): BoxFit {
  return fitBox(page.width, page.height, 0, 0, canvas.width, canvas.height);
}

// A touch point in canvas coordinates → master pixels on the page.
export function canvasToMaster(
  point: { x: number; y: number },
  fit: BoxFit,
  canvas: CanvasSize,
  t: CanvasTransform
): { x: number; y: number } {
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const layerX = (point.x - cx - t.tx) / t.scale + cx;
  const layerY = (point.y - cy - t.ty) / t.scale + cy;
  return { x: (layerX - fit.origin.x) / fit.scale, y: (layerY - fit.origin.y) / fit.scale };
}

// A master-pixel rectangle → position in the (unzoomed) layer, for overlays drawn inside it.
export function masterToLayer(rect: { left: number; top: number; width: number; height: number }, fit: BoxFit) {
  return {
    left: fit.origin.x + rect.left * fit.scale,
    top: fit.origin.y + rect.top * fit.scale,
    width: rect.width * fit.scale,
    height: rect.height * fit.scale,
  };
}
