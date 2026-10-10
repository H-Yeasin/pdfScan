import type { ViewerPosition } from '../../../types/models';
import type { ScrollDirection } from '../../../services/reader/chromeState';
import type { ContentInsets } from '../../../services/reader/surfaceGeometry';

// §18 W19 (A15): what the Reader asks of the viewers that aren't the page surface (TXT, sheets,
// DOCX), so each of them reads the same way: under the bars, with Find's "3 of 27", from where
// it was left.

export type { ViewerPosition };

// What Find looks for. `index` is the match to be on, counted from 0 through the document; -1:
// the viewer picks (the first match from where reading is).
export type ViewerFind = { query: string; index: number };

// What the viewer found: how many, and the match it is on (-1: none). `partial`: it stopped
// counting at its cap, so there are more.
export type ViewerFindResult = { count: number; index: number; partial?: boolean };

export type ViewerProps = {
  uri: string;
  night: boolean;
  // What covers the viewer's edges with the bars shown (their measured heights and the safe
  // area). The first and last lines stay clear of it; in between the bars lie over the content.
  insets: ContentInsets;
  // A tap that the viewer had no use for (not a link, not a cell): the Reader toggles its bars.
  onTap: () => void;
  find: ViewerFind;
  onFindResult: (result: ViewerFindResult) => void;
  // Where to open. Read once, when the content is first laid out.
  initialPosition?: ViewerPosition;
  // Where reading is now. Called as it changes (the Reader saves it once it rests).
  onPosition: (position: ViewerPosition) => void;
  // Reading moved on, or back (chromeState.scrollSaid): the Reader hides or shows its bars.
  onScrollDirection: (direction: ScrollDirection) => void;
};

export const NO_FIND: ViewerFind = { query: '', index: -1 };
