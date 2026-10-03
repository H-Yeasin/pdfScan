import type { AnnotationKind, OcrBounding } from '../../types/models';

// §12 D3: underline and strikethrough are drawn from the same word rects as a highlight (one per
// line), as a line along the rect. The geometry lives here so the page overlay (MarkView) and the
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
