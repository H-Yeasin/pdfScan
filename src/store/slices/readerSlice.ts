import type { ExternalFileDocument } from '../../types/models';

export type ReaderState = {
  readerId: string | null;
  // Mutually exclusive with readerId - an externally-opened file not (yet) in the library.
  // SET_READER_ID always clears this, SET_EXTERNAL always clears readerId, so every call site
  // (LibraryScreen's handlePressRow, the "Open a file" entry point, OS "Open with" wiring) stays
  // regression-safe without needing to remember to clear the other field itself.
  external: ExternalFileDocument | null;
  // §5 T2: a page search result (or a bookmark, T5) being opened: the Reader jumps to that
  // library page and, with a query, finds it on that page; then clears this. Any other open
  // (SET_READER_ID) clears it too.
  target: { pageId: string; query?: string } | null;
};

export const initialReaderState: ReaderState = {
  readerId: null,
  external: null,
  target: null,
};

export type ReaderAction =
  | { type: 'reader/SET_READER_ID'; id: string }
  | { type: 'reader/SET_EXTERNAL'; doc: ExternalFileDocument | null }
  | { type: 'reader/SET_TARGET'; target: { pageId: string; query?: string } | null };

export function readerReducer(state: ReaderState, action: ReaderAction): ReaderState {
  switch (action.type) {
    case 'reader/SET_READER_ID':
      return { ...state, readerId: action.id, external: null, target: null };
    case 'reader/SET_EXTERNAL':
      return { ...state, external: action.doc, readerId: action.doc ? null : state.readerId };
    case 'reader/SET_TARGET':
      return { ...state, target: action.target };
    default:
      return state;
  }
}
