import { captureReducer, CaptureAction, CaptureState } from './slices/captureSlice';
import { reviewReducer, ReviewAction, ReviewState } from './slices/reviewSlice';
import { deliverReducer, DeliverAction, DeliverState } from './slices/deliverSlice';
import { libraryReducer, LibraryAction, LibraryState } from './slices/librarySlice';
import { readerReducer, ReaderAction, ReaderState } from './slices/readerSlice';
import { settingsReducer, SettingsAction, SettingsState } from './slices/settingsSlice';
import { uiReducer, UiAction, UiState } from './slices/uiSlice';

export type AppState = {
  capture: CaptureState;
  review: ReviewState;
  deliver: DeliverState;
  library: LibraryState;
  reader: ReaderState;
  settings: SettingsState;
  ui: UiState;
};

export type AppAction =
  | CaptureAction
  | ReviewAction
  | DeliverAction
  | LibraryAction
  | ReaderAction
  | SettingsAction
  | UiAction;

export function appReducer(state: AppState, action: AppAction): AppState {
  return {
    capture: captureReducer(state.capture, action as CaptureAction),
    review: reviewReducer(state.review, action as ReviewAction),
    deliver: deliverReducer(state.deliver, action as DeliverAction),
    library: libraryReducer(state.library, action as LibraryAction),
    reader: readerReducer(state.reader, action as ReaderAction),
    settings: settingsReducer(state.settings, action as SettingsAction),
    ui: uiReducer(state.ui, action as UiAction),
  };
}
