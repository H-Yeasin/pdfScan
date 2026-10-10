import { TEXT_SIZES, textBoxAt, type TextSize } from '../annotations/markMode';
import { turnedQuad, uprightTurn } from '../annotations/marks';
import type { OcrBounding, PageRotation } from '../../types/models';
import { mapPoint, mapRect, shownSize, shownUnitsToSpace, spaceToShownUnits, type PageSpace } from './pageSpace';

// §18 W15: where a typed text box goes on a page of the surface, pure. The surface shows a page
// turned (§7 R3) while its marks stay in its own, unturned space; a box typed there must read
// upright as the page is shown. So the box is worked out on the shown page, in the space's own
// unit (pageSpace.shownSize), and stored as the box around it in the space plus the turn that
// puts its text upright again (marks.turnedQuad).

// A text size (markMode.TEXT_SIZES: a share of the page's width) on this page as it is shown.
export function textSizeOn(space: PageSpace, size: TextSize): number {
  return Math.max(8, shownSize(space).width * TEXT_SIZES[size]);
}

// The page as it would have to be shown for content turned by `turn` to be upright.
function uprightView(space: PageSpace, turn: PageRotation): PageSpace {
  return { ...space, turn: uprightTurn(turn) };
}

// The box of `text` with its own top-left corner at `at` (a point of the space), kept on the
// page. `turn`: the text's turn in the space; left out, the one that reads upright on the page
// as shown now (a new box). `measure` gives one line's width at a size.
export function textBoxOn(
  space: PageSpace,
  text: string,
  at: { x: number; y: number },
  size: number,
  measure: (line: string, size: number) => number,
  turn: PageRotation = uprightTurn(space.turn)
): { box: OcrBounding; turn: PageRotation } {
  const view = uprightView(space, turn);
  const corner = mapPoint(spaceToShownUnits(view), at.x, at.y);
  const upright = textBoxAt(shownSize(view), text, corner, size, measure);
  return { box: mapRect(shownUnitsToSpace(view), upright), turn };
}

// The text's own top-left corner in the space: what `textBoxOn` is given to lay the same box
// out again with other words.
export function textCorner(box: OcrBounding, turn: PageRotation = 0): { x: number; y: number } {
  return turnedQuad(box, turn).tl;
}
