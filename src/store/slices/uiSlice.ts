export type Snack = { msg: string; action?: string; onAction?: () => void } | null;

export type UiState = {
  snack: Snack;
};

export const initialUiState: UiState = {
  snack: null,
};

export type UiAction =
  | { type: 'ui/SHOW_SNACK'; msg: string; action?: string; onAction?: () => void }
  | { type: 'ui/CLEAR_SNACK' };

export function uiReducer(state: UiState, action: UiAction): UiState {
  switch (action.type) {
    case 'ui/SHOW_SNACK':
      return { ...state, snack: { msg: action.msg, action: action.action, onAction: action.onAction } };
    case 'ui/CLEAR_SNACK':
      return { ...state, snack: null };
    default:
      return state;
  }
}
