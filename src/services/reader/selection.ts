import type { TextToken } from '../study/textSelection';
import type { ColumnView, ContentRect, Size } from './surfaceGeometry';

// §18 W13 (A8): text selection on the page surface. Pure: which word a long press takes, how the
// two handles move the ends, where the handles and the menu sit on screen, and what the menu
// offers. A selection is a run of one page's tokens in reading order (study/textSelection); the
// surface keeps the tokens and draws the result.

// The first and last selected token, by their place in reading order (`TextToken.order`).
export type SelectionRange = { from: number; to: number };
export type SelectionHandle = 'start' | 'end';

// How far from a word a long press may land and still take it, in screen pixels.
export const WORD_SLOP = 12;
// A handle's knob: a disc hanging under the end of the selection, and how near a touch must be
// to its middle to grab it (screen pixels; a finger is wider than the knob).
export const HANDLE_RADIUS = 9;
export const HANDLE_HIT = 26;
// A dragged handle reads the line just above its tip: the tip itself sits on the line's lower
// edge, where the next line may already begin.
export const HANDLE_NUDGE = 4;
// Between the selection and its menu, and from the screen's sides.
export const MENU_GAP = 10;
export const MENU_MARGIN = 8;

function distanceTo(token: TextToken, x: number, y: number): number {
  const b = token.bounding;
  const dx = Math.max(b.left - x, 0, x - (b.left + b.width));
  const dy = Math.max(b.top - y, 0, y - (b.top + b.height));
  return Math.hypot(dx, dy);
}

// The word a long press takes: the one under the point, else the nearest within `slop` (the
// tokens' own units). Unlike textSelection.tokenAt, a press on empty paper takes nothing.
export function wordNear(tokens: readonly TextToken[], x: number, y: number, slop: number): TextToken | null {
  let best: TextToken | null = null;
  let bestDistance = Infinity;
  for (const token of tokens) {
    const d = distanceTo(token, x, y);
    if (d === 0) return token;
    if (d <= slop && d < bestDistance) {
      best = token;
      bestDistance = d;
    }
  }
  return best;
}

export function rangeOf(token: TextToken): SelectionRange {
  return { from: token.order, to: token.order };
}

// The whole page.
export function selectAll(tokens: readonly TextToken[]): SelectionRange | null {
  return tokens.length ? { from: tokens[0].order, to: tokens[tokens.length - 1].order } : null;
}

export function tokensIn(tokens: readonly TextToken[], range: SelectionRange): TextToken[] {
  return tokens.filter((token) => token.order >= range.from && token.order <= range.to);
}

// A handle dragged onto the token at `order`: that end moves there, growing or shrinking the
// selection. Dragged past the other end, the two swap: the other end stays where it was and the
// finger now holds the handle on the far side (`handle` in the answer). The same range comes back
// when nothing changes.
export function dragHandle(range: SelectionRange, handle: SelectionHandle, order: number): { range: SelectionRange; handle: SelectionHandle } {
  if (handle === 'start') {
    if (order === range.from) return { range, handle };
    return order <= range.to ? { range: { from: order, to: range.to }, handle } : { range: { from: range.to, to: order }, handle: 'end' };
  }
  if (order === range.to) return { range, handle };
  return order >= range.from ? { range: { from: range.from, to: order }, handle } : { range: { from: order, to: range.from }, handle: 'start' };
}

// Where the handles' tips are: under the start of the first word and the end of the last (their
// boxes in any one space, top-left origin).
export type HandlePoints = { start: { x: number; y: number }; end: { x: number; y: number } };

export function handlePoints(first: ContentRect, last: ContentRect): HandlePoints {
  return {
    start: { x: first.x, y: first.y + first.height },
    end: { x: last.x + last.width, y: last.y + last.height },
  };
}

// The handle under a touch (screen pixels), with the tips in content coordinates. The nearer of
// the two when both are in reach (a one-word selection). Runs in the gesture worklet.
export function handleAt(points: HandlePoints | null, view: ColumnView, x: number, y: number, reach = HANDLE_HIT): SelectionHandle | null {
  'worklet';
  if (!points) return null;
  // The knob hangs under its tip.
  const ds = Math.hypot(points.start.x * view.scale + view.tx - x, points.start.y * view.scale + view.ty + HANDLE_RADIUS - y);
  const de = Math.hypot(points.end.x * view.scale + view.tx - x, points.end.y * view.scale + view.ty + HANDLE_RADIUS - y);
  if (Math.min(ds, de) > reach) return null;
  return de <= ds ? 'end' : 'start';
}

// The part of the screen the bars leave free.
export type Band = { left: number; top: number; right: number; bottom: number };

// Where the menu goes (its top-left corner, screen pixels) for a selection at `anchor` on screen:
// centred above it; under it (past the handles) when there is no room above; and always inside
// the band, also when the selection itself has been scrolled away. Runs in a worklet.
export function menuPosition(anchor: ContentRect, size: Size, band: Band): { x: number; y: number } {
  'worklet';
  const maxX = Math.max(band.left + MENU_MARGIN, band.right - MENU_MARGIN - size.width);
  const x = Math.min(maxX, Math.max(band.left + MENU_MARGIN, anchor.x + anchor.width / 2 - size.width / 2));
  const top = band.top + MENU_MARGIN;
  const bottom = Math.max(top, band.bottom - MENU_MARGIN - size.height);
  const above = anchor.y - MENU_GAP - size.height;
  const below = anchor.y + anchor.height + 2 * HANDLE_RADIUS + MENU_GAP;
  const y = above >= top ? above : below;
  return { x, y: Math.min(bottom, Math.max(top, y)) };
}

export type SelectionMenuItem = 'copy' | 'share' | 'highlight' | 'underline' | 'selectAll' | 'runOcr';

// What the menu offers. With words selected: Copy and Share always; Highlight, Underline and
// Select all on a library page that can carry marks (a file opened from outside is only read).
// With nothing to select (a long press on a page without text): Run OCR, where there is a page
// image to read.
export function selectionMenuItems(options: { selected: boolean; canMark: boolean; external: boolean; canOcr: boolean }): SelectionMenuItem[] {
  if (!options.selected) return options.canOcr ? ['runOcr'] : [];
  if (options.external) return ['copy', 'share'];
  return options.canMark ? ['copy', 'share', 'highlight', 'underline', 'selectAll'] : ['copy', 'share', 'selectAll'];
}
