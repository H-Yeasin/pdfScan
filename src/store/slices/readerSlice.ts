import type { ExternalPdfDocument } from '../../types/models';

export type ReaderState = {
  readerId: string | null;
  // Mutually exclusive with readerId - an externally-opened PDF not (yet) in the library.
  // SET_READER_ID always clears this, SET_EXTERNAL always clears readerId, so every call site
  // (LibraryScreen's handlePressRow, the "Open a PDF" entry point, OS "Open with" wiring) stays
  // regression-safe without needing to remember to clear the other field itself.
  external: ExternalPdfDocument | null;
  night: boolean;
};

export const initialReaderState: ReaderState = {
  readerId: null,
  external: null,
  night: false,
};

export type ReaderAction =
  | { type: 'reader/SET_READER_ID'; id: string }
  | { type: 'reader/SET_EXTERNAL'; doc: ExternalPdfDocument | null }
  | { type: 'reader/TOGGLE_NIGHT' };

export function readerReducer(state: ReaderState, action: ReaderAction): ReaderState {
  switch (action.type) {
    case 'reader/SET_READER_ID':
      return { ...state, readerId: action.id, external: null };
    case 'reader/SET_EXTERNAL':
      return { ...state, external: action.doc, readerId: action.doc ? null : state.readerId };
    case 'reader/TOGGLE_NIGHT':
      return { ...state, night: !state.night };
    default:
      return state;
  }
}
