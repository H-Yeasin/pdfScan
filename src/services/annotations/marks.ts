import type { AnnotationKind, OcrBounding, PageRotation } from '../../types/models';

// §12 D3: underline and strikethrough are drawn from the same word rects as a highlight (one per
// line), as a line along the rect. The geometry lives here so the page overlay (SurfaceOverlay) and the
// PDF's appearance stream (pdfAnnotations) draw the same line.

export type RectMarkKind = Extract<AnnotationKind, 'highlight' | 'underline' | 'strike'>;

export function isRectMark(kind: AnnotationKind): kind is RectMarkKind {
  return kind === 'highlight' || kind === 'underline' || kind === 'strike';
}

// How thick the line is, as a share of the line's height, and never thinner than this many master
// pixels (a 2400 px master: about a quarter of a millimetre on A4).
const LINE_SHARE = 0.08;
const MIN_LINE = 3;
// Where a strike sits, from the top of the word box: a little above the middle, through the
// lowercase letters (OCR boxes include descenders).
const STRIKE_AT = 0.52;

// The line an underline or strike draws for one word rect, as a thin rect in the same space
// (master pixels, top-left origin). An underline sits on the rect's bottom edge, inside it.
export function markLine(kind: Exclude<RectMarkKind, 'highlight'>, rect: OcrBounding): OcrBounding {
  const thickness = Math.max(MIN_LINE, rect.height * LINE_SHARE);
  const centre = kind === 'underline' ? rect.top + rect.height - thickness / 2 : rect.top + rect.height * STRIKE_AT;
  return { left: rect.left, top: centre - thickness / 2, width: rect.width, height: thickness };
}

// --- §18 W15/W16: boxes that are upright on a page shown turned ---
// A text box or a signature is stored as a box in the page's own, unturned space, like every
// mark. Put on a page that is shown turned (§7 R3), it must still read upright there, so its
// content is turned inside the box by `turn` (clockwise in the space; the box is the turned
// content's). `turn` is missing for a box made on an unturned page, and for every older one.

export type Corner = { x: number; y: number };

// Where the content's own corners are in the box's space (top-left origin, y down): its
// top-left, top-right and bottom-left. With no turn they are the box's; each quarter turn
// clockwise moves every corner on by one. Whatever draws the content (the overlay, the PDF
// writer) maps these three points and nothing else, so all of them turn it the same way.
export function turnedQuad(box: OcrBounding, turn: PageRotation = 0): { tl: Corner; tr: Corner; bl: Corner } {
  const corners: Corner[] = [
    { x: box.left, y: box.top },
    { x: box.left + box.width, y: box.top },
    { x: box.left + box.width, y: box.top + box.height },
    { x: box.left, y: box.top + box.height },
  ];
  const k = (((turn / 90) % 4) + 4) % 4;
  return { tl: corners[k], tr: corners[(k + 1) % 4], bl: corners[(k + 3) % 4] };
}

// The content's own size: the box's, with the sides swapped by a quarter turn.
export function turnedContentSize(box: OcrBounding, turn: PageRotation = 0): { width: number; height: number } {
  return turn % 180 === 0 ? { width: box.width, height: box.height } : { width: box.height, height: box.width };
}

// The turn that keeps content upright on a page as it is shown now: the page's own turn
// (PageSpace.turn, clockwise from its space to the shown page), undone.
export function uprightTurn(spaceTurn: PageRotation): PageRotation {
  return ((360 - spaceTurn) % 360) as PageRotation;
}
