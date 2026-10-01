import { fitBox, type BoxFit } from '../../utils/fitBox';

// Pure layout for ID card mode (no Skia, so it's unit-testable). composeIdCard.ts draws it.
//
// The composed page is an A4 canvas at exactly 200 dpi, and pdfService places such a page
// edge-to-edge on an A4 sheet (layout 'fullPage'), so 1 canvas pixel = 1/200 inch on paper and a
// card drawn at its ISO size here prints at its real size at 100 % scale.
export const ID_CANVAS_DPI = 200;
const MM_PER_INCH = 25.4;

export function mmToPx(mm: number, dpi = ID_CANVAS_DPI): number {
  return (mm / MM_PER_INCH) * dpi;
}

// A4 = 210 x 297 mm -> 1654 x 2339 px at 200 dpi.
export const ID_CANVAS_WIDTH = Math.round(mmToPx(210));
export const ID_CANVAS_HEIGHT = Math.round(mmToPx(297));

// ISO/IEC 7810 ID-1 (bank cards, most national ID cards): 85.6 x 54 mm.
export const ID1_LONG_MM = 85.6;
export const ID1_SHORT_MM = 54;

// Vertical centres of the front and back cards, as fractions of the canvas height.
export const FRONT_CENTRE_Y = 0.25;
export const BACK_CENTRE_Y = 0.6;

export type Size = { width: number; height: number };
export type Rect = { x: number; y: number; width: number; height: number };

// The true-size slot for a card centred horizontally at `centreY`. A portrait source (a vertical
// ID card) gets a portrait slot, so it's not shrunk to fit a landscape one.
export function cardSlot(source: Size, centreY: number): Rect {
  const portrait = source.height > source.width;
  const width = mmToPx(portrait ? ID1_SHORT_MM : ID1_LONG_MM);
  const height = mmToPx(portrait ? ID1_LONG_MM : ID1_SHORT_MM);
  return {
    x: (ID_CANVAS_WIDTH - width) / 2,
    y: ID_CANVAS_HEIGHT * centreY - height / 2,
    width,
    height,
  };
}

// Where each scanned card image is drawn: aspect-fit (never stretched) inside its true-size slot.
// A scan that's cropped tightly to the card fills the slot exactly.
export function idCardPlacements(front: Size, back?: Size): { front: BoxFit; back?: BoxFit } {
  const place = (source: Size, centreY: number) => {
    const slot = cardSlot(source, centreY);
    return fitBox(source.width, source.height, slot.x, slot.y, slot.width, slot.height);
  };
  return {
    front: place(front, FRONT_CENTRE_Y),
    back: back ? place(back, BACK_CENTRE_Y) : undefined,
  };
}
