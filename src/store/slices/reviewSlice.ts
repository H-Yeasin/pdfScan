import { emptyHistory } from '../pageHistory';
import type { PageHistory } from '../pageHistory';

export type ReviewState = {
  sel: number;
  ocrRunning: boolean;
  // Undo/redo of page edits. Maintained by appReducer (see pageHistory.ts), since recording and
  // undoing both need the capture slice's pages too.
  history: PageHistory;
};

export const initialReviewState: ReviewState = {
  sel: 0,
  ocrRunning: false,
  history: emptyHistory,
};

export type ReviewAction =
  | { type: 'review/SELECT_PAGE'; index: number }
  | { type: 'review/SET_OCR_RUNNING'; running: boolean }
  | { type: 'review/RESET' }
  // Handled in appReducer, which can rewrite capture.pages in the same step.
  | { type: 'review/UNDO' }
  | { type: 'review/REDO' };

export function reviewReducer(state: ReviewState, action: ReviewAction): ReviewState {
  switch (action.type) {
    case 'review/SELECT_PAGE':
      return { ...state, sel: action.index };
    case 'review/SET_OCR_RUNNING':
      return { ...state, ocrRunning: action.running };
    case 'review/RESET':
      return initialReviewState;
    default:
      return state;
  }
}
