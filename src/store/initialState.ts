import type { AppState } from './appReducer';
import { initialCaptureState } from './slices/captureSlice';
import { initialReviewState } from './slices/reviewSlice';
import { initialDeliverState } from './slices/deliverSlice';
import { initialLibraryState } from './slices/librarySlice';
import { initialReaderState } from './slices/readerSlice';
import { initialSettingsState } from './slices/settingsSlice';
import { initialSignatureState } from './slices/signatureSlice';
import { initialUiState } from './slices/uiSlice';

export const initialAppState: AppState = {
  capture: initialCaptureState,
  review: initialReviewState,
  deliver: initialDeliverState,
  library: initialLibraryState,
  reader: initialReaderState,
  settings: initialSettingsState,
  signature: initialSignatureState,
  ui: initialUiState,
};
