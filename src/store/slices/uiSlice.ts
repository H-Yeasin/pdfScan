export type Snack = { msg: string; action?: string; onAction?: () => void } | null;

export type UiState = {
  snack: Snack;
  // §8 B4: a zip to restore or import (a file:// copy in the cache), from Settings → Backup, the
  // Library's file picker or "Open with". RestoreHost (always mounted) takes it from here.
  backupToOpen: string | null;
};

export const initialUiState: UiState = {
  snack: null,
  backupToOpen: null,
};

export type UiAction =
  | { type: 'ui/SHOW_SNACK'; msg: string; action?: string; onAction?: () => void }
  | { type: 'ui/CLEAR_SNACK' }
  | { type: 'ui/OPEN_BACKUP'; uri: string }
  | { type: 'ui/CLOSE_BACKUP' };

export function uiReducer(state: UiState, action: UiAction): UiState {
  switch (action.type) {
    case 'ui/SHOW_SNACK':
      return { ...state, snack: { msg: action.msg, action: action.action, onAction: action.onAction } };
    case 'ui/CLEAR_SNACK':
      return { ...state, snack: null };
    case 'ui/OPEN_BACKUP':
      return { ...state, backupToOpen: action.uri };
    case 'ui/CLOSE_BACKUP':
      return { ...state, backupToOpen: null };
    default:
      return state;
  }
}
