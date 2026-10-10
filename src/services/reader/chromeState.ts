// §18 W10 (A11): when the Reader's bars show, as a pure rule. Reading forward hides them (the page
// gets the whole screen); scrolling back, reaching either end of the document, or a tap brings
// them back, the way a browser does. While something needs them (Find's field is in the top bar,
// a sheet or a tool is open over the page) they are locked on.
//
// The scroll rule runs on the UI thread, once a frame, from the surface's own scroll.

// Forward scroll (screen px) before the bars go: less than this is a finger settling.
export const CHROME_HIDE_AFTER = 24;
// Back scroll before they return. Smaller: going back is usually a look for something in the bar.
export const CHROME_SHOW_AFTER = 8;

// `travel`: how far the scroll has gone in its present direction, forward positive.
export type ChromeScroll = { shown: boolean; travel: number };
export const CHROME_SHOWN: ChromeScroll = { shown: true, travel: 0 };

export type ChromeEdge = { atStart: boolean; atEnd: boolean };

// The state after the view moved by `dy` screen pixels (positive: towards the end).
export function chromeAfterScroll(state: ChromeScroll, dy: number, edge: ChromeEdge, locked: boolean): ChromeScroll {
  'worklet';
  if (locked || edge.atStart || edge.atEnd) return state.shown && state.travel === 0 ? state : { shown: true, travel: 0 };
  if (dy === 0) return state;
  // A turn starts the count again, so a wobble never adds up to a hide.
  const travel = dy > 0 === state.travel > 0 ? state.travel + dy : dy;
  if (travel >= CHROME_HIDE_AFTER) return { shown: false, travel };
  if (travel <= -CHROME_SHOW_AFTER) return { shown: true, travel };
  return { shown: state.shown, travel };
}

// A tap on the page toggles the bars, unless they are locked on.
export function chromeAfterTap(shown: boolean, locked: boolean): boolean {
  return locked ? true : !shown;
}

// §18 W19 (A15): the same rule for the viewers that scroll by themselves (a list, a web page).
// They can't run the rule a frame at a time on the UI thread; they say which way reading is
// going, and the Reader shows or hides the bars (useReaderChrome.directed).
export type ScrollDirection = 'forward' | 'back';

// `travel` as in ChromeScroll. After something is said the count starts again, so the same
// direction is said again a little further on: the Reader may have shown the bars in between (a
// tap, Find closing), and reading on should hide them again without a turn first.
export function scrollSaid(travel: number, dy: number, edge: ChromeEdge): { travel: number; say: ScrollDirection | null } {
  if (edge.atStart || edge.atEnd) return { travel: 0, say: 'back' };
  if (dy === 0) return { travel, say: null };
  const next = dy > 0 === travel > 0 ? travel + dy : dy;
  if (next >= CHROME_HIDE_AFTER) return { travel: 0, say: 'forward' };
  if (next <= -CHROME_SHOW_AFTER) return { travel: 0, say: 'back' };
  return { travel: next, say: null };
}
