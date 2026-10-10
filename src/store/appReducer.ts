import { captureReducer, CaptureAction, CaptureState } from './slices/captureSlice';
import { reviewReducer, ReviewAction, ReviewState } from './slices/reviewSlice';
import { deliverReducer, DeliverAction, DeliverState } from './slices/deliverSlice';
import { libraryReducer, LibraryAction, LibraryState } from './slices/librarySlice';
import { libraryUiReducer, LibraryUiAction, LibraryUiState } from './slices/libraryUiSlice';
import { readerReducer, ReaderAction, ReaderState } from './slices/readerSlice';
import { settingsReducer, SettingsAction, SettingsState } from './slices/settingsSlice';
import { signatureReducer, SignatureAction, SignatureState } from './slices/signatureSlice';
import { uiReducer, UiAction, UiState } from './slices/uiSlice';
import { packReducer, PackAction, PackState } from './slices/packSlice';
import { changedAnything, emptyHistory, historyEntryFor, pushEntry, redo, undo } from './pageHistory';

export type AppState = {
  capture: CaptureState;
  review: ReviewState;
  deliver: DeliverState;
  library: LibraryState;
  libraryUi: LibraryUiState;
  reader: ReaderState;
  settings: SettingsState;
  signature: SignatureState;
  ui: UiState;
  pack: PackState;
};

export type AppAction =
  | CaptureAction
  | ReviewAction
  | DeliverAction
  | LibraryAction
  | LibraryUiAction
  | ReaderAction
  | SettingsAction
  | SignatureAction
  | UiAction
  | PackAction;

export function appReducer(state: AppState, action: AppAction): AppState {
  if (action.type === 'review/UNDO' || action.type === 'review/REDO') {
    const result = (action.type === 'review/UNDO' ? undo : redo)(state.capture.pages, state.review.history);
    if (!result) return state;
    const sel = Math.min(state.review.sel, Math.max(0, result.pages.length - 1));
    return {
      ...state,
      capture: { ...state.capture, pages: result.pages },
      review: { ...state.review, sel, history: result.history },
    };
  }

  const next = slicesReducer(state, action);
  if (action.type === 'capture/CLEAR_PAGES') return { ...next, review: { ...next.review, history: emptyHistory } };
  // Recorded against the pages as they were BEFORE the action, and only if it changed them.
  const entry = next.capture.pages !== state.capture.pages ? historyEntryFor(state.capture.pages, action) : null;
  if (!entry || !changedAnything(entry, next.capture.pages)) return next;
  return { ...next, review: { ...next.review, history: pushEntry(next.review.history, entry) } };
}

// §16 G5: the same root object when no slice changed (an action no reducer handles, or one that
// changes nothing), so the store's `next === state` check stops there and no selector runs.
function slicesReducer(state: AppState, action: AppAction): AppState {
  const next: AppState = {
    capture: captureReducer(state.capture, action as CaptureAction),
    review: reviewReducer(state.review, action as ReviewAction),
    deliver: deliverReducer(state.deliver, action as DeliverAction),
    library: libraryReducer(state.library, action as LibraryAction),
    libraryUi: libraryUiReducer(state.libraryUi, action as LibraryUiAction | LibraryAction),
    reader: readerReducer(state.reader, action as ReaderAction),
    settings: settingsReducer(state.settings, action as SettingsAction),
    signature: signatureReducer(state.signature, action as SignatureAction),
    ui: uiReducer(state.ui, action as UiAction),
    pack: packReducer(state.pack, action as PackAction),
  };
  return (Object.keys(next) as (keyof AppState)[]).every((key) => next[key] === state[key]) ? state : next;
}
