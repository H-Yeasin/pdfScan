import { readingOrderTokens, selectionText } from '../../study/textSelection';
import type { PageOcr } from '../../../types/models';
import {
  dragHandle,
  handleAt,
  handlePoints,
  HANDLE_RADIUS,
  MENU_GAP,
  MENU_MARGIN,
  menuPosition,
  rangeOf,
  selectAll,
  selectionMenuItems,
  tokensIn,
  wordNear,
} from '../selection';

const word = (text: string, left: number, top: number, width = 40) => ({ text, bounding: { left, top, width, height: 20 } });
const line = (top: number, texts: string[]) => {
  const words = texts.map((text, i) => word(text, 10 + i * 50, top));
  return { text: texts.join(' '), bounding: { left: 10, top, width: texts.length * 50, height: 20 }, words };
};
const ocr: PageOcr = {
  text: 'the quick brown\nfox jumps',
  blocks: [{ text: 'the quick brown\nfox jumps', bounding: { left: 10, top: 10, width: 150, height: 50 }, lines: [line(10, ['the', 'quick', 'brown']), line(40, ['fox', 'jumps'])] }],
};
const tokens = readingOrderTokens(ocr);

describe('wordNear', () => {
  it('takes the word under the press', () => {
    expect(wordNear(tokens, 70, 20, 0)?.text).toBe('quick');
  });

  it('takes a word just beside the press, and nothing on empty paper', () => {
    // 5 right of "the" (which ends at 50), 5 left of "quick".
    expect(wordNear(tokens, 54, 20, 6)?.text).toBe('the');
    expect(wordNear(tokens, 56, 20, 6)?.text).toBe('quick');
    expect(wordNear(tokens, 300, 300, 6)).toBeNull();
    expect(wordNear([], 20, 20, 6)).toBeNull();
  });
});

describe('dragHandle', () => {
  const quick = rangeOf(tokens[1]);

  it('extends the selection from either end', () => {
    expect(dragHandle(quick, 'end', 4)).toEqual({ range: { from: 1, to: 4 }, handle: 'end' });
    expect(dragHandle({ from: 1, to: 4 }, 'start', 0)).toEqual({ range: { from: 0, to: 4 }, handle: 'start' });
  });

  it('shrinks it again', () => {
    expect(dragHandle({ from: 0, to: 4 }, 'end', 2)).toEqual({ range: { from: 0, to: 2 }, handle: 'end' });
    expect(dragHandle({ from: 0, to: 4 }, 'start', 3)).toEqual({ range: { from: 3, to: 4 }, handle: 'start' });
    // Down to one word, the handle is still the one held.
    expect(dragHandle({ from: 0, to: 4 }, 'start', 4)).toEqual({ range: { from: 4, to: 4 }, handle: 'start' });
  });

  it('swaps the ends when a handle crosses the other', () => {
    expect(dragHandle({ from: 1, to: 2 }, 'start', 4)).toEqual({ range: { from: 2, to: 4 }, handle: 'end' });
    expect(dragHandle({ from: 2, to: 3 }, 'end', 0)).toEqual({ range: { from: 0, to: 2 }, handle: 'start' });
  });

  it('hands back the same range when the end has not moved', () => {
    const range = { from: 1, to: 3 };
    expect(dragHandle(range, 'start', 1).range).toBe(range);
    expect(dragHandle(range, 'end', 3).range).toBe(range);
  });
});

describe('selectAll', () => {
  it("equals the page's text", () => {
    const range = selectAll(tokens);
    expect(range).toEqual({ from: 0, to: 4 });
    expect(selectionText(tokensIn(tokens, range!))).toBe(ocr.text);
  });

  it('is nothing on a page without words', () => {
    expect(selectAll([])).toBeNull();
  });
});

describe('handles', () => {
  const points = handlePoints({ x: 10, y: 10, width: 40, height: 20 }, { x: 60, y: 40, width: 40, height: 20 });

  it('sit under the start of the first word and the end of the last', () => {
    expect(points).toEqual({ start: { x: 10, y: 30 }, end: { x: 100, y: 60 } });
  });

  it('are grabbed by a touch on their knob, wherever the view is', () => {
    const view = { scale: 2, tx: -20, ty: 100 };
    // The start tip on screen: (0, 160); its knob is just under it.
    expect(handleAt(points, view, 0, 160 + HANDLE_RADIUS)).toBe('start');
    expect(handleAt(points, view, 180 + 10, 220 + HANDLE_RADIUS + 10)).toBe('end');
    expect(handleAt(points, view, 90, 100)).toBeNull();
    expect(handleAt(null, view, 0, 160)).toBeNull();
  });

  it('give the nearer one when both are in reach', () => {
    const one = handlePoints({ x: 10, y: 10, width: 20, height: 20 }, { x: 10, y: 10, width: 20, height: 20 });
    const view = { scale: 1, tx: 0, ty: 0 };
    expect(handleAt(one, view, 12, 40)).toBe('start');
    expect(handleAt(one, view, 28, 40)).toBe('end');
  });
});

describe('menuPosition', () => {
  const band = { left: 0, top: 80, right: 360, bottom: 700 };
  const size = { width: 200, height: 44 };

  it('floats centred above the selection', () => {
    expect(menuPosition({ x: 100, y: 300, width: 100, height: 20 }, size, band)).toEqual({ x: 50, y: 300 - MENU_GAP - 44 });
  });

  it('goes under the selection and its handles when there is no room above', () => {
    const at = menuPosition({ x: 100, y: 90, width: 100, height: 20 }, size, band);
    expect(at.y).toBe(90 + 20 + 2 * HANDLE_RADIUS + MENU_GAP);
  });

  it('is clamped to the band', () => {
    // Against the sides.
    expect(menuPosition({ x: 0, y: 300, width: 20, height: 20 }, size, band).x).toBe(MENU_MARGIN);
    expect(menuPosition({ x: 350, y: 300, width: 10, height: 20 }, size, band).x).toBe(360 - MENU_MARGIN - 200);
    // The selection scrolled away above or below the screen.
    expect(menuPosition({ x: 100, y: -900, width: 100, height: 20 }, size, band).y).toBe(80 + MENU_MARGIN);
    expect(menuPosition({ x: 100, y: 2000, width: 100, height: 20 }, size, band).y).toBe(700 - MENU_MARGIN - 44);
    // A selection taller than the band: the menu stays inside it.
    const tall = menuPosition({ x: 100, y: 60, width: 100, height: 900 }, size, band);
    expect(tall.y).toBeGreaterThanOrEqual(80 + MENU_MARGIN);
    expect(tall.y).toBeLessThanOrEqual(700 - MENU_MARGIN - 44);
  });

  it('never leaves the band when the menu is wider than it', () => {
    expect(menuPosition({ x: 100, y: 300, width: 10, height: 20 }, { width: 500, height: 44 }, band).x).toBe(MENU_MARGIN);
  });
});

describe('selectionMenuItems', () => {
  it('offers everything on a library page that can be marked', () => {
    expect(selectionMenuItems({ selected: true, canMark: true, external: false, canOcr: true })).toEqual(['copy', 'share', 'highlight', 'underline', 'selectAll']);
  });

  it('leaves the marks out where the page cannot carry them', () => {
    expect(selectionMenuItems({ selected: true, canMark: false, external: false, canOcr: false })).toEqual(['copy', 'share', 'selectAll']);
  });

  it('only copies and shares from a file opened from outside', () => {
    expect(selectionMenuItems({ selected: true, canMark: false, external: true, canOcr: false })).toEqual(['copy', 'share']);
  });

  it('offers OCR on a page with an image and no text, and nothing otherwise', () => {
    expect(selectionMenuItems({ selected: false, canMark: true, external: false, canOcr: true })).toEqual(['runOcr']);
    expect(selectionMenuItems({ selected: false, canMark: false, external: false, canOcr: false })).toEqual([]);
  });
});
