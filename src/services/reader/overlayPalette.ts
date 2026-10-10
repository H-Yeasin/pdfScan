// §18 W12 (A6): the colours of what the page surface draws over a page. Like the annotation
// colours (annotations/palette.ts) these mark the paper, not the app's UI, so they are fixed
// values and not theme tokens. The overlay is a layer of its own above the page images, so a
// colour can't multiply into the page under it: each is see-through instead, weaker on dark
// pages, where the same yellow would glare.
export type OverlayPalette = {
  // Every Find match, and the one Find is on.
  match: string;
  currentMatch: string;
  // A mark picked in the Notes panel, for a moment.
  flash: string;
  // §18 W13: the selected words, and the handles at their ends (solid).
  selection: string;
  handle: string;
  // How see-through a highlight is drawn (the PDF's own is close to the day one).
  highlightAlpha: number;
};

const DAY: OverlayPalette = {
  match: 'rgba(255, 212, 59, 0.4)',
  currentMatch: 'rgba(255, 146, 43, 0.55)',
  flash: 'rgba(28, 126, 214, 0.3)',
  selection: 'rgba(28, 126, 214, 0.3)',
  handle: '#1c7ed6',
  highlightAlpha: 0.45,
};

const NIGHT: OverlayPalette = {
  match: 'rgba(255, 212, 59, 0.28)',
  currentMatch: 'rgba(255, 146, 43, 0.5)',
  flash: 'rgba(116, 192, 252, 0.32)',
  selection: 'rgba(116, 192, 252, 0.34)',
  handle: '#74c0fc',
  highlightAlpha: 0.3,
};

export function overlayPalette(night: boolean): OverlayPalette {
  return night ? NIGHT : DAY;
}
