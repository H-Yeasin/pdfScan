import type { CaptureMode, SessionPage } from '../../types/models';

// §17 U9: Review used to stack a banner per thing worth saying (crops to check, an ID card's
// size, a split spread, a page too faint to read). Now one chip says the most important one, with
// its action and a ×. Pure, so the order is tested.

export type SuggestionKind =
  // Gallery photos the auto-crop wasn't sure of: "Check crops". Whole session.
  | 'cropCheck'
  // The page's text came out too faint to read; Black & white usually fixes it.
  | 'lowContrast'
  // A landscape page outside Book mode: "Looks like a book. Split pages?" (switches to Book).
  | 'bookSpread'
  // A Book half: "Undo split".
  | 'splitFrom'
  // An ID card page: its print size (swap and retake are in More).
  | 'idCard';

// Most important first.
export const SUGGESTION_ORDER: readonly SuggestionKind[] = ['cropCheck', 'lowContrast', 'bookSpread', 'splitFrom', 'idCard'];

export type Suggestion = { kind: SuggestionKind; key: string };

export type SuggestionInput = {
  page: SessionPage | undefined;
  mode: CaptureMode;
  cropCheckCount: number;
  // A batch still coming in: the crops are checked once it's in.
  processing: boolean;
  // Keys the student closed with ×; a key is per page (the session's, for cropCheck).
  dismissed: ReadonlySet<string>;
};

// Wider than tall by this much (as shown, after its turn) to look like an open book.
const SPREAD_RATIO = 1.25;

export function looksLikeSpread(page: Pick<SessionPage, 'width' | 'height' | 'rotation'>): boolean {
  const turned = page.rotation === 90 || page.rotation === 270;
  const w = turned ? page.height : page.width;
  const h = turned ? page.width : page.height;
  return w >= h * SPREAD_RATIO;
}

export function suggestionKey(kind: SuggestionKind, pageId: string | undefined): string {
  return kind === 'cropCheck' ? kind : `${kind}:${pageId ?? ''}`;
}

function applies(kind: SuggestionKind, input: SuggestionInput): boolean {
  const { page } = input;
  switch (kind) {
    case 'cropCheck':
      return input.cropCheckCount > 0 && !input.processing;
    case 'lowContrast':
      return !!page?.err && page.enhance !== 'bw';
    case 'bookSpread':
      // Notes and documents only: a board is wide, and Book and ID card have their own handling.
      return (
        !!page &&
        (input.mode === 'notes' || input.mode === 'doc') &&
        !page.splitFrom &&
        !page.idCard &&
        !page.needsCropReview &&
        looksLikeSpread(page)
      );
    case 'splitFrom':
      return !!page?.splitFrom;
    case 'idCard':
      return !!page?.idCard;
  }
}

export function reviewSuggestion(input: SuggestionInput): Suggestion | null {
  for (const kind of SUGGESTION_ORDER) {
    const key = suggestionKey(kind, input.page?.id);
    if (!input.dismissed.has(key) && applies(kind, input)) return { kind, key };
  }
  return null;
}
