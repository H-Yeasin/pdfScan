export type ReviewState = {
  sel: number;
  ocrRunning: boolean;
};

export const initialReviewState: ReviewState = {
  sel: 0,
  ocrRunning: false,
};

export type ReviewAction =
  | { type: 'review/SELECT_PAGE'; index: number }
  | { type: 'review/SET_OCR_RUNNING'; running: boolean }
  | { type: 'review/RESET' };

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
